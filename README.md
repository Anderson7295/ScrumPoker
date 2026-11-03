# Scrum Poker

Estimativa de **Story Points** e **Horas** por área (FrontEnd, BackEnd e QA), em tempo real.

- Valores padrão: Story Points 1, 2, 3, 5 e Horas de 1 a 40 (editáveis por sala, em "Editar valores").
- Cargos: Dev FrontEnd, Dev BackEnd, Dev FullStack, QA e Observador.
- Votos de FullStack entram nas médias de FrontEnd e BackEnd. Observador não vota.
- "Quem está na sala": presença, cargo e status de voto de cada pessoa, atualizados ao vivo.
- Painel só de visualização para projetar: `/painel/CODIGO`.

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
