# UNO com React, Node.js e Socket.IO

O projeto separa a interface React das regras e do estado do jogo, que são controlados pelo servidor Node.js. O Socket.IO atualiza a sala em tempo real e envia a cada jogador somente as próprias cartas.

## Requisitos

- Node.js 18 ou superior
- npm

## Executar em desenvolvimento

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. O servidor integra o Vite durante o desenvolvimento e também hospeda a aplicação compilada.

## Compilar e executar

```bash
npm run build
npm start
```

O jogo suporta salas de 2 a 7 participantes, bots, placar por rodada, desafio de +4 e partidas com múltiplas rodadas. As salas ficam em memória no processo e são encerradas quando o servidor reinicia.
