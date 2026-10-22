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

## Testes automatizados

```bash
npm test
```

A suíte usa o executor Vitest e inclui testes unitários das regras, simulação determinística de 100 partidas, testes de interface React com Socket.IO simulado e teste do prazo do UNO com relógio falso. Os testes não acessam a rede nem esperam o prazo real.

O jogo segue as regras de UNO No Mercy do arquivo `regras-pdf.pdf`: usa um baralho de 168 cartas, troca de mãos ao jogar 7, rotação de mãos ao jogar 0, descarte de todas as cartas da cor, pulo de todos, Roleta Colorida, cartas Comprar +2/+4/+6/+10 empilháveis e eliminação ao chegar a 25 cartas. Na Roleta Colorida, o próximo jogador escolhe a cor e revela cartas até encontrar uma daquela cor.

As rodadas também podem ser vencidas ao eliminar todos os adversários. Cada adversário eliminado vale 250 pontos, as cartas restantes seguem a pontuação descrita no manual, e o primeiro jogador a atingir 1000 pontos vence a partida. O jogo suporta salas de 2 a 7 participantes, bots e partidas com múltiplas rodadas. As salas ficam em memória no processo e são encerradas quando o servidor reinicia.
