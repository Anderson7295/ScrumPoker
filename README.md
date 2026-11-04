# Scrum Poker

Estimativa de **Story Points** e **Horas** por área (FrontEnd, BackEnd e QA), em tempo real.

- Valores padrão: Story Points 1, 2, 3, 5 e Horas de 1 a 40 (editáveis por sala, em "Editar valores").
- Cargos: Dev FrontEnd, Dev BackEnd, Dev FullStack, QA e Observador.
- FullStack vota Front e Back separados: a parte Front entra na média de FrontEnd e a parte Back na de BackEnd
  (parte em branco não entra na média). Observador não vota.
- "Quem está na sala": presença, cargo e status de voto de cada pessoa, atualizados ao vivo.
- Painel só de visualização para projetar: `/painel/CODIGO`.
- A tela inicial lista as salas abertas (com alguém presente), com o nome (se houver), o código, quantas pessoas estão nela e a demanda atual. Clique para entrar.
- Ao criar a sala, dá para dar um nome opcional (até 40 caracteres); dentro da sala ele aparece num campo ao lado do código e pode ser editado por qualquer participante.
- "Sair da sala" remove você da sala na hora e volta para a tela inicial.
- "Link para lançamento de horas": cole o link da demanda no topo da sala; para todos aparece o botão "🔗 Lançar horas",
  que abre a página numa nova aba. O ✏️ ao lado permite editar ou remover o link.
- Depois de revelar, clique no card de uma área para ver quem votou em cada valor de Story Points, com as horas de cada pessoa.

Sem dependências externas: só Node.js 18 ou mais novo.

## Rodar localmente

```bash
node server.js
```

Abra http://localhost:3000. Quem estiver na mesma rede usa o endereço "Para o time" que aparece no terminal.
Para usar outra porta: `PORT=3001 node server.js` (no PowerShell: `$env:PORT=3001; node server.js`).

## Publicar no Render (grátis)

1. Crie um repositório no GitHub (pode ser privado) e envie estes arquivos:
   `package.json`, `server.js`, `render.yaml`, `README.md`, `.gitignore` e a pasta `public/`.
2. Entre em https://dashboard.render.com e escolha **New → Blueprint**.
3. Conecte sua conta do GitHub e selecione o repositório. O Render lê o `render.yaml` e cria o serviço `scrum-poker` no plano Free.
4. Clique em **Apply**. Em 1 ou 2 minutos o link fica pronto, algo como `https://scrum-poker-xxxx.onrender.com`.

Sem Blueprint: **New → Web Service**, escolha o repositório, Runtime **Node**, Build Command `npm install`,
Start Command `node server.js`, Instance Type **Free**.

Cada `git push` no repositório publica a nova versão automaticamente.

### Limitações do plano Free

- Depois de cerca de 15 minutos sem acesso, o serviço "dorme". O primeiro acesso seguinte leva por volta de 1 minuto.
- As salas ficam só na memória: quando o serviço dorme, reinicia ou é publicado de novo, as salas abertas se perdem.
  Dica: abra o link uns minutos antes da planning e crie a sala.
- Qualquer pessoa com o código da sala consegue entrar. Não coloque informação sensível na demanda.
