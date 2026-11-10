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
- "Link para lançamento de horas": cole o link da demanda no topo da sala; o botão "🔗 Lançar horas" fica ativo
  para todos e abre a página numa nova aba. Sem link, o botão aparece cinza e inativo. O ✏️ ao lado permite editar ou remover o link.
- Timer da demanda (⏱ ao lado do campo "Demanda em votação"), sincronizado para todos e visível também no painel:
  - Começa sozinho (30 minutos por padrão) quando o código da demanda é preenchido; trocar a demanda, inclusive numa
    nova rodada, recomeça a contagem. Limpar o campo não mexe no timer. Revelar os votos também não.
  - ▶ inicia (mesmo sem demanda preenchida) ou retoma; ⏸ pausa. Qualquer participante pode usar, inclusive observadores.
  - ✏️ altera o tempo (1 a 180 minutos; Enter salva, Esc cancela). Se o timer estiver correndo, recomeça com o novo
    tempo; parado ou pausado, só guarda o valor. O tempo escolhido fica valendo para as próximas demandas da sala.
  - Em zero, para em "⏱ 00:00 · Tempo esgotado", sem som nem aviso; ▶ recomeça do tempo cheio.
- "Nova rodada" pergunta como continuar:
  - **Nova votação limpa**: zera os votos, limpa a demanda para todos e deixa o timer parado no tempo cheio. Ele volta a
    correr quando alguém preencher um código novo ou clicar em ▶.
  - **Nova votação da mesma demanda**: zera só os votos; a demanda e o timer continuam como estão (correndo ou pausado).
  - Cancelar, Esc ou clicar fora fecham sem mudar nada.
- Depois de revelar, o título mostra quem revelou ("Resultado · revelado por Ana"), na sala e no painel. O nome
  continua aparecendo mesmo se a pessoa sair, e some na nova rodada.
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
