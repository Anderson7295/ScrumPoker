// Scrum Poker - servidor sem dependências externas (Node.js 18+)
// Tempo real via Server-Sent Events (SSE); ações via POST JSON.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const ROLES = ['FrontEnd', 'BackEnd', 'FullStack', 'QA', 'Observador'];
const DEFAULT_SP_DECK = ['1', '2', '3', '5'];
const DEFAULT_HOURS_DECK = Array.from({ length: 40 }, (_, i) => String(i + 1));
const DEFAULT_TIMER_SEC = 30 * 60;

/** rooms: id -> { id, story, revealed, spDeck, hoursDeck, members: Map<memberId, member>, clients: Set<res> } */
const rooms = new Map();

function newId(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) s += chars[bytes[i] % chars.length];
  return s;
}

function getRoom(id) {
  id = String(id || '').toUpperCase();
  if (!rooms.has(id)) {
    rooms.set(id, {
      id,
      name: '', // nome opcional da sala
      hoursLink: '', // link da demanda para lançamento de horas (opcional)
      story: '',
      revealed: false,
      spDeck: [...DEFAULT_SP_DECK],
      hoursDeck: [...DEFAULT_HOURS_DECK],
      // Timer da demanda: endsAt (ms) só enquanto corre; pausado/parado guarda remainingSec
      timer: { durationSec: DEFAULT_TIMER_SEC, remainingSec: DEFAULT_TIMER_SEC, endsAt: null, running: false },
      members: new Map(),
      departed: new Map(), // removidos por estarem ausentes numa nova rodada: id -> { name, role }
      clients: new Set(),
      emptySince: Date.now(),
      lastPoll: 0,
    });
  }
  return rooms.get(id);
}

function toNumber(v) {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function avg(values) {
  const nums = values.map(toNumber).filter((n) => n !== null);
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

// Votos de um membro. FullStack vota separado na parte Front (fe) e na parte Back (be);
// os demais cargos usam só sp/hours.
function emptyVotes() {
  return { sp: null, hours: null, fe: { sp: null, hours: null }, be: { sp: null, hours: null } };
}

// Voto que entra na média de cada área:
// FrontEnd = FrontEnd + parte Front do FullStack; BackEnd = BackEnd + parte Back do FullStack; QA = QA
function voteForGroup(m, group) {
  if (m.role === group) return m.votes;
  if (m.role === 'FullStack' && group === 'FrontEnd') return m.votes.fe;
  if (m.role === 'FullStack' && group === 'BackEnd') return m.votes.be;
  return null;
}

function computeResults(room) {
  const results = {};
  for (const group of ['FrontEnd', 'BackEnd', 'QA']) {
    const votes = [...room.members.values()].map((m) => voteForGroup(m, group)).filter(Boolean);
    results[group] = {
      sp: avg(votes.map((v) => v.sp)),
      hours: avg(votes.map((v) => v.hours)),
      voters: votes.filter((v) => v.sp !== null || v.hours !== null).length,
    };
  }
  return results;
}

// ---------- Timer ----------
// Ao chegar a zero, para e fica em 00:00 (sem precisar de ninguém conectado para isso)
function settleTimer(t, now = Date.now()) {
  if (t.running && t.endsAt <= now) {
    t.running = false;
    t.endsAt = null;
    t.remainingSec = 0;
  }
  return t;
}

function startTimer(t, now = Date.now()) {
  t.remainingSec = t.durationSec;
  t.running = true;
  t.endsAt = now + t.durationSec * 1000;
}

function stopTimer(t) {
  t.remainingSec = t.durationSec;
  t.running = false;
  t.endsAt = null;
}

// Código da demanda: valor novo (diferente do anterior) reinicia o timer; limpar o campo não mexe nele
function setStory(room, value) {
  const next = String(value || '').slice(0, 200);
  const changed = next.trim() !== room.story.trim();
  room.story = next;
  if (next.trim() && changed) startTimer(room.timer);
}

function timerState(room, now = Date.now()) {
  const t = settleTimer(room.timer, now);
  const remainingSec = t.running ? Math.max(0, Math.ceil((t.endsAt - now) / 1000)) : t.remainingSec;
  return { durationSec: t.durationSec, remainingSec, endsAt: t.endsAt, running: t.running };
}

function timerAction(room, body) {
  const now = Date.now();
  const t = settleTimer(room.timer, now);
  switch (body.op) {
    case 'pause':
      if (t.running) {
        t.remainingSec = Math.max(0, Math.ceil((t.endsAt - now) / 1000));
        t.running = false;
        t.endsAt = null;
      }
      return {};
    // Iniciar/retomar (com ou sem demanda): continua de onde pausou; esgotado, recomeça do tempo cheio
    case 'start':
    case 'resume':
      if (!t.running) {
        if (t.remainingSec <= 0) t.remainingSec = t.durationSec;
        t.running = true;
        t.endsAt = now + t.remainingSec * 1000;
      }
      return {};
    case 'duration': {
      const min = Number(body.minutes);
      if (!Number.isInteger(min) || min < 1 || min > 180) return { error: 'Informe um tempo entre 1 e 180 minutos.' };
      t.durationSec = min * 60;
      if (t.running) startTimer(t, now); // correndo: recomeça com o novo tempo
      else stopTimer(t); // parado/pausado/esgotado: só guarda o novo tempo
      return {};
    }
    default:
      return { error: 'Operação de timer inválida.' };
  }
}

function publicState(room) {
  const part = (v) => ({
    votedSp: v.sp !== null,
    votedHours: v.hours !== null,
    sp: room.revealed ? v.sp : null,
    hours: room.revealed ? v.hours : null,
  });
  const members = [...room.members.values()].map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    online: isOnline(m),
    ...part(m.votes),
    fe: m.role === 'FullStack' ? part(m.votes.fe) : null,
    be: m.role === 'FullStack' ? part(m.votes.be) : null,
  }));
  return {
    id: room.id,
    name: room.name,
    hoursLink: room.hoursLink,
    story: room.story,
    revealed: room.revealed,
    spDeck: room.spDeck,
    hoursDeck: room.hoursDeck,
    members,
    results: room.revealed ? computeResults(room) : null,
    timer: timerState(room),
    serverNow: Date.now(), // para o navegador corrigir a diferença de relógio
  };
}

// Presença: conexão SSE aberta ou consulta recente pelo modo polling (fallback quando um proxy segura o SSE)
const POLL_ONLINE_MS = 8000;
function isOnline(m) {
  return m.connections > 0 || Date.now() - (m.lastSeen || 0) < POLL_ONLINE_MS;
}

// Membro da sala; quem foi removido como ausente volta automaticamente (com voto zerado) ao reabrir a sala
function findMember(room, memberId) {
  if (!memberId) return null;
  if (room.members.has(memberId)) return room.members.get(memberId);
  const gone = room.departed.get(memberId);
  if (!gone) return null;
  room.departed.delete(memberId);
  const m = { id: memberId, name: gone.name, role: gone.role, votes: emptyVotes(), connections: 0 };
  room.members.set(memberId, m);
  return m;
}

function stateFor(room, memberId, base = publicState(room)) {
  const m = room.members.get(memberId);
  return { ...base, mine: m ? m.votes : emptyVotes() };
}

function broadcast(room) {
  const base = publicState(room);
  for (const client of room.clients) {
    client.res.write(`data: ${JSON.stringify(stateFor(room, client.memberId, base))}\n\n`);
  }
}

function sanitizeDeck(input) {
  const arr = Array.isArray(input) ? input : String(input || '').split(/[;,\s]+/);
  const deck = [];
  for (const raw of arr) {
    const v = String(raw).trim().slice(0, 6);
    if (v && !deck.includes(v)) deck.push(v);
  }
  return deck.slice(0, 60);
}

// Nome opcional da sala: texto simples, até 40 caracteres
function cleanRoomName(v) {
  return String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e5) reject(new Error('payload too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

async function handleAction(room, body) {
  const { action, memberId } = body;
  const member = findMember(room, memberId);

  switch (action) {
    case 'join': {
      const name = String(body.name || '').trim().slice(0, 40);
      const role = ROLES.includes(body.role) ? body.role : null;
      if (!name || !role) return { error: 'Informe nome e cargo.' };
      let m = member;
      if (m) {
        if (m.role !== role) m.votes = emptyVotes(); // trocar de cargo zera os votos
        m.name = name;
        m.role = role;
      } else {
        m = { id: crypto.randomUUID(), name, role, votes: emptyVotes(), connections: 0 };
        room.members.set(m.id, m);
      }
      return { memberId: m.id };
    }
    case 'vote': {
      if (!member) return { error: 'Entre na sala primeiro.' };
      if (member.role === 'Observador') return { error: 'Observadores não votam.' };
      if (room.revealed) return { error: 'Votos já revelados. Inicie uma nova rodada.' };
      if (body.kind !== 'sp' && body.kind !== 'hours') return { error: 'Tipo de voto inválido.' };
      let target = member.votes;
      if (member.role === 'FullStack') {
        if (body.part === 'front') target = member.votes.fe;
        else if (body.part === 'back') target = member.votes.be;
        else return { error: 'Informe a parte do voto (Front ou Back).' };
      }
      target[body.kind] = body.value === null ? null : String(body.value).trim().slice(0, 6);
      return {};
    }
    case 'reveal':
      if (!member) return { error: 'Entre na sala primeiro.' };
      room.revealed = true;
      return {};
    case 'reset':
      if (!member) return { error: 'Entre na sala primeiro.' };
      room.revealed = false;
      for (const m of [...room.members.values()]) {
        m.votes = emptyVotes();
        // Ausentes saem da lista; se reabrirem a sala no mesmo navegador, voltam sozinhos (findMember)
        if (m !== member && !isOnline(m)) {
          room.members.delete(m.id);
          room.departed.set(m.id, { name: m.name, role: m.role });
        }
      }
      if (typeof body.story === 'string') setStory(room, body.story);
      return {};
    case 'hoursLink': {
      if (!member) return { error: 'Entre na sala primeiro.' };
      const link = String(body.link || '').trim().slice(0, 500);
      if (link) {
        let u;
        try { u = new URL(link); } catch { return { error: 'Link inválido. Use um endereço começando com https://' }; }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'Link inválido. Use um endereço começando com https://' };
        room.hoursLink = u.href;
      } else room.hoursLink = '';
      return {};
    }
    case 'rename':
      if (!member) return { error: 'Entre na sala primeiro.' };
      room.name = cleanRoomName(body.name);
      return {};
    case 'story':
      if (!member) return { error: 'Entre na sala primeiro.' };
      setStory(room, body.story);
      return {};
    case 'timer':
      if (!member) return { error: 'Entre na sala primeiro.' };
      return timerAction(room, body);
    case 'deck': {
      if (!member) return { error: 'Entre na sala primeiro.' };
      const deck = sanitizeDeck(body.deck);
      if (!deck.length) return { error: 'O baralho precisa ter ao menos um valor.' };
      if (body.kind === 'sp') room.spDeck = deck;
      else if (body.kind === 'hours') room.hoursDeck = deck;
      else return { error: 'Tipo de baralho inválido.' };
      return {};
    }
    case 'leave':
      if (member) room.members.delete(member.id);
      return {};
    default:
      return { error: 'Ação desconhecida.' };
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    // Salas abertas (com alguém presente), para a tela inicial
    if (req.method === 'GET' && url.pathname === '/api/rooms') {
      const list = [];
      for (const room of rooms.values()) {
        const online = [...room.members.values()].filter(isOnline).length;
        if (online) list.push({ id: room.id, name: room.name, people: online, story: room.story, revealed: room.revealed });
      }
      list.sort((a, b) => b.people - a.people || a.id.localeCompare(b.id));
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, 200, { rooms: list });
    }

    // Nova sala
    if (req.method === 'GET' && url.pathname === '/api/new-room') {
      let id;
      do { id = newId(); } while (rooms.has(id));
      getRoom(id).name = cleanRoomName(url.searchParams.get('name'));
      return sendJson(res, 200, { roomId: id });
    }

    // Stream SSE: /api/rooms/:id/events?memberId=...
    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'rooms' && parts[3] === 'events') {
      const room = getRoom(parts[2]);
      const member = findMember(room, url.searchParams.get('memberId'));
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      // Comentário de 2 KB para proxies que só repassam a resposta depois de juntar alguns bytes
      res.write(`:${' '.repeat(2048)}\nretry: 2000\n\n`);
      const client = { res, memberId: member ? member.id : null };
      room.clients.add(client);
      room.emptySince = null;
      if (member) member.connections++;
      broadcast(room);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => {
        clearInterval(ping);
        room.clients.delete(client);
        if (member) member.connections = Math.max(0, member.connections - 1);
        if (!room.clients.size) room.emptySince = Date.now();
        broadcast(room);
      });
      return;
    }

    // Estado atual (polling): GET /api/rooms/:id/state?memberId=...
    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'rooms' && parts[3] === 'state') {
      const room = getRoom(parts[2]);
      const member = findMember(room, url.searchParams.get('memberId'));
      if (member) {
        const wasOnline = isOnline(member);
        member.lastSeen = Date.now();
        if (!wasOnline) broadcast(room);
      }
      room.lastPoll = Date.now();
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, 200, stateFor(room, member ? member.id : null));
    }

    // Ações: POST /api/rooms/:id/action
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'rooms' && parts[3] === 'action') {
      const room = getRoom(parts[2]);
      const body = await readBody(req);
      const result = await handleAction(room, body);
      if (result.error) return sendJson(res, 400, result);
      broadcast(room);
      return sendJson(res, 200, result);
    }

    // Arquivos estáticos; /sala/:id usa o mesmo index.html
    if (req.method === 'GET') {
      if (url.pathname === '/' || parts[0] === 'sala' || parts[0] === 'painel') return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
      const file = path.normalize(path.join(PUBLIC_DIR, url.pathname));
      if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
      return serveFile(res, file);
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    sendJson(res, 400, { error: 'Requisição inválida.' });
  }
});

// Remove salas vazias há mais de 12 horas
setInterval(() => {
  const limit = Date.now() - 12 * 3600 * 1000;
  for (const [id, room] of rooms) {
    if (room.emptySince && room.emptySince < limit && room.lastPoll < limit) rooms.delete(id);
  }
}, 3600 * 1000).unref();

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

server.listen(PORT, HOST, () => {
  console.log('\n  Scrum Poker rodando!\n');
  console.log(`  Nesta máquina:   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  Para o time:     http://${ip}:${PORT}`);
  console.log('\n  Compartilhe o link "Para o time" com quem estiver na mesma rede.');
  console.log('  Para acesso fora da rede, veja o README (ngrok / cloudflared).\n');
});
