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

O jogo segue as regras de UNO No Mercy do arquivo `regras-pdf.pdf`: usa um baralho de 184 cartas, incluindo duas cópias do Coringa Ataque Final e do Coringa Comprar até 24 e oito cópias do Coringa Descartar Tudo, troca de mãos ao jogar 7, rotação de mãos ao jogar 0, descarte selecionado de cartas da mesma cor com a carta Descartar Tudo, pulo de todos, Roleta Colorida, Coringa Ataque Final, Coringa Inverter +8, Coringa Comprar até 24, cartas Comprar +2/+4/+6/+8/+10 empilháveis e eliminação ao chegar a 25 cartas. No próprio turno, o jogador pode comprar do baralho mesmo tendo uma carta jogável, mas compra apenas uma carta; se ela for jogável, pode jogar somente a carta comprada, e pode passar a vez após comprar. Na Roleta Colorida, o próximo jogador escolhe a cor e compra manualmente uma carta por vez até encontrar uma daquela cor. O Coringa Ataque Final revela a mão, faz o próximo jogador comprar uma carta por carta de ação ou curinga revelada e o elimina se forem sete ou mais. O Coringa Inverter +8 inverte o sentido, define uma penalidade inicial de oito cartas e permite que o próximo jogador empilhe uma penalidade de valor igual ou maior.

O Coringa Comprar até 24 permite escolher a cor e faz cada jogador ativo, inclusive quem jogou, comprar até ter 24 cartas na mão. O Coringa Descartar Tudo permite escolher uma cor, descartar todas as cartas dessa cor da própria mão e deixar o curinga no topo da pilha de descarte. As rodadas também podem ser vencidas ao eliminar todos os adversários. Cada adversário eliminado vale 250 pontos, as cartas restantes seguem a pontuação descrita no manual, e o primeiro jogador a atingir 1000 pontos vence a partida. O jogo suporta salas de 2 a 7 participantes, bots e partidas com múltiplas rodadas. As salas ficam em memória no processo e são encerradas quando o servidor reinicia.
