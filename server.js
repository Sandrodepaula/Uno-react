import express from 'express';
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const rooms = new Map();
const colors = ['red', 'yellow', 'green', 'blue'];
const colorNames = { red: 'vermelho', yellow: 'amarelo', green: 'verde', blue: 'azul' };
const botNames = ['Ana', 'Beto', 'Carla', 'Duda', 'Edu', 'Fábio'];
const symbols = { skip: '⊘', rev: '⇄', '+2': '+2', w: '★', w4: '+4' };
let botSequence = 0;

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.get('*', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ configFile: path.join(root, 'vite.config.js'), server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'spa' });
  app.use(vite.middlewares);
}

function makeDeck() {
  const deck = [];
  let id = 0;
  for (const color of colors) {
    deck.push({ color, value: '0', id: id++ });
    for (let n = 1; n <= 9; n++) {
      for (let copy = 0; copy < 2; copy++) deck.push({ color, value: String(n), id: id++ });
    }
    for (const value of ['skip', 'rev', '+2']) {
      for (let copy = 0; copy < 2; copy++) deck.push({ color, value, id: id++ });
    }
  }
  for (let copy = 0; copy < 4; copy++) {
    deck.push({ color: 'wild', value: 'w', id: id++ }, { color: 'wild', value: 'w4', id: id++ });
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const topCard = (game) => game.discard.at(-1);
const nextSeat = (game, player, steps = 1) => {
  const count = game.seats.length;
  return ((player + game.direction * steps) % count + count) % count;
};
const canPlay = (game, card) => game.stack ? card.value === '+2'
  : card.color === 'wild' || card.color === game.color || card.value === topCard(game).value;
const cardValue = (card) => card.color === 'wild' ? 50 : Number.isNaN(Number(card.value)) ? 20 : Number(card.value);

function drawCards(game, player, count) {
  for (let i = 0; i < count; i++) {
    if (!game.deck.length) {
      const top = game.discard.pop();
      game.deck = shuffle(game.discard);
      game.discard = [top];
      if (!game.deck.length) break;
    }
    game.hands[player].push(game.deck.pop());
  }
}

function deal(room) {
  const game = room.game ?? {};
  game.deck = shuffle(makeDeck());
  game.hands = room.seats.map(() => []);
  for (let i = 0; i < 7; i++) game.hands.forEach((hand) => hand.push(game.deck.pop()));
  let first;
  do {
    first = game.deck.pop();
    if (first.color === 'wild' || Number.isNaN(Number(first.value))) game.deck.unshift(first);
  } while (first.color === 'wild' || Number.isNaN(Number(first.value)));
  game.discard = [first];
  game.color = first.color;
  game.current = room.round % room.seats.length;
  game.direction = 1;
  game.stack = 0;
  game.drawn = null;
  game.unoPlayer = -1;
  game.challenge = null;
  game.phase = 'play';
  game.message = `Rodada ${room.round + 1}. Vez de ${room.seats[game.current].name}.`;
  room.game = game;
}

function endRound(room, player) {
  const game = room.game;
  game.phase = 'over';
  game.winner = player;
  game.unoPlayer = -1;
  game.points = game.hands.reduce((total, hand) => total + hand.reduce((sum, card) => sum + cardValue(card), 0), 0);
  room.scores[player] += game.points;
}

function playCard(room, player, cardId, chosenColor) {
  const game = room.game;
  const hand = game.hands[player];
  const cardIndex = hand.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) throw new Error('Essa carta não está na sua mão.');
  const card = hand[cardIndex];
  if (!canPlay(game, card) || (game.drawn != null && game.drawn !== card.id)) throw new Error('Essa carta não pode ser jogada agora.');
  if (card.color === 'wild' && !colors.includes(chosenColor)) throw new Error('Escolha uma cor válida.');

  const previousColor = game.color;
  const illegal = hand.some((other, index) => index !== cardIndex && other.color === previousColor);
  hand.splice(cardIndex, 1);
  game.discard.push(card);
  game.color = card.color === 'wild' ? chosenColor : card.color;
  game.drawn = null;
  if (!hand.length) {
    endRound(room, player);
    return;
  }

  let advance = 1;
  let message = `${room.seats[player].name} jogou.`;
  if (card.color === 'wild') message = `${room.seats[player].name} escolheu ${colorNames[chosenColor]}.`;
  if (card.value === 'skip') {
    advance = 2;
    message = `${room.seats[nextSeat(game, player)].name} perdeu a vez.`;
  } else if (card.value === 'rev') {
    game.direction *= -1;
    message = 'O sentido do jogo inverteu.';
    if (room.seats.length === 2) advance = 2;
  } else if (card.value === '+2') {
    game.stack += 2;
    message = `Acumulou ${game.stack}: ${room.seats[nextSeat(game, player)].name} empilha +2 ou compra ${game.stack}.`;
  }
  if (hand.length === 1) {
    message += ` ${room.seats[player].name}: UNO!`;
    if (!room.seats[player].bot) {
      game.unoPlayer = player;
      game.unoToken = (game.unoToken ?? 0) + 1;
    }
  }
  game.message = message;
  if (card.value === 'w4') {
    game.challenge = { player, target: nextSeat(game, player), illegal, color: chosenColor };
    game.current = -1;
    return;
  }
  game.current = nextSeat(game, player, advance);
}

function resolveChallenge(room, challenge) {
  const game = room.game;
  if (!game.challenge) throw new Error('Não há desafio pendente.');
  const { player, target, illegal, color } = game.challenge;
  const playerName = room.seats[player].name;
  const targetName = room.seats[target].name;
  game.challenge = null;
  let result;
  if (!challenge) {
    drawCards(game, target, 4);
    result = `${targetName} comprou 4 cartas.`;
  } else if (illegal) {
    drawCards(game, player, 4);
    result = `Desafio certo! ${playerName} tinha a cor e comprou 4.`;
  } else {
    drawCards(game, target, 6);
    result = `Desafio errado! ${targetName} comprou 6 cartas.`;
  }
  game.current = nextSeat(game, player, 2);
  game.message = `${playerName} jogou +4 (${colorNames[color]}). ${result}`;
}

function pickBotColor(hand) {
  const counts = Object.fromEntries(colors.map((color) => [color, 0]));
  hand.forEach((card) => { if (card.color !== 'wild') counts[card.color]++; });
  return colors.reduce((best, color) => counts[color] > counts[best] ? color : best, colors[randomInt(colors.length)]);
}

function moveBot(room) {
  const game = room.game;
  const player = game.current;
  if (player < 0 || !room.seats[player]?.bot || game.phase !== 'play') return;
  const hand = game.hands[player];
  const playable = hand.filter((card) => canPlay(game, card));
  if (!playable.length) {
    if (game.stack) {
      const count = game.stack;
      game.stack = 0;
      drawCards(game, player, count);
      game.current = nextSeat(game, player);
      game.message = `${room.seats[player].name} comprou ${count} cartas.`;
      return;
    }
    drawCards(game, player, 1);
    const drawn = hand.at(-1);
    if (drawn && canPlay(game, drawn)) {
      playCard(room, player, drawn.id, drawn.color === 'wild' ? pickBotColor(hand) : undefined);
      return;
    }
    game.current = nextSeat(game, player);
    game.message = `${room.seats[player].name} comprou uma carta e passou.`;
    return;
  }
  const colored = playable.filter((card) => card.color !== 'wild');
  const pool = colored.length ? colored : playable;
  const actionCards = pool.filter((card) => Number.isNaN(Number(card.value)));
  const choices = actionCards.length && Math.random() < 0.6 ? actionCards : pool;
  const card = choices[randomInt(choices.length)];
  playCard(room, player, card.id, card.color === 'wild' ? pickBotColor(hand) : undefined);
}

function publicView(room, playerId) {
  const game = room.game;
  const player = room.seats.findIndex((seat) => seat.id === playerId);
  return {
    code: room.code,
    hostId: room.hostId,
    phase: game?.phase ?? 'lobby',
    players: room.seats.map((seat, index) => ({
      id: seat.id,
      name: seat.name,
      bot: Boolean(seat.bot),
      score: room.scores[index] ?? 0,
      cardCount: game?.hands[index]?.length ?? 0,
      isCurrent: Boolean(game && game.current === index && game.phase === 'play'),
    })),
    game: game ? {
      phase: game.phase,
      current: game.current,
      direction: game.direction,
      color: game.color,
      topCard: topCard(game),
      stack: game.stack,
      drawn: player >= 0 && game.drawn != null && game.current === player ? game.drawn : null,
      hand: player >= 0 ? game.hands[player] : [],
      challenge: game.challenge ? { targetId: room.seats[game.challenge.target].id } : null,
      unoAvailable: player >= 0 && game.unoPlayer === player,
      winner: game.winner,
      points: game.points,
      message: game.message,
    } : null,
    isHost: room.hostId === playerId,
    playerId,
    notice: room.notice ?? '',
  };
}

function broadcast(room) {
  for (const seat of room.seats) {
    if (!seat.bot) io.to(seat.id).emit('state:update', publicView(room, seat.id));
  }
}

function schedule(room) {
  if (room.botTimer) clearTimeout(room.botTimer);
  if (room.unoTimer) clearTimeout(room.unoTimer);
  const game = room.game;
  if (!game || game.phase !== 'play') return;

  if (game.unoPlayer >= 0) {
    const token = game.unoToken;
    room.unoTimer = setTimeout(() => {
      const current = room.game;
      if (!current || current.phase !== 'play' || current.unoPlayer < 0 || current.unoToken !== token) return;
      const player = current.unoPlayer;
      current.unoPlayer = -1;
      drawCards(current, player, 2);
      current.message = `${room.seats[player].name} esqueceu o UNO e comprou 2 cartas.`;
      broadcast(room);
      schedule(room);
    }, 2500);
  }
  if (game.challenge && room.seats[game.challenge.target]?.bot) {
    room.botTimer = setTimeout(() => {
      if (room.game?.challenge) {
        resolveChallenge(room, Math.random() < 0.25);
        broadcast(room);
        schedule(room);
      }
    }, 1100);
    return;
  }
  if (room.seats[game.current]?.bot) {
    room.botTimer = setTimeout(() => {
      moveBot(room);
      broadcast(room);
      schedule(room);
    }, 1100);
  }
}

function update(room) {
  broadcast(room);
  schedule(room);
}

function requireRoom(socket) {
  const room = rooms.get(socket.data.roomCode);
  if (!room) throw new Error('Sala não encontrada.');
  return room;
}
function requireHost(socket, room) {
  if (room.hostId !== socket.id) throw new Error('Somente o anfitrião pode fazer isso.');
}
function requirePlayer(socket, room) {
  const player = room.seats.findIndex((seat) => seat.id === socket.id);
  if (player < 0) throw new Error('Você não está nesta sala.');
  return player;
}
function requireTurn(room, player) {
  const game = room.game;
  if (!game || game.phase !== 'play' || game.challenge || game.current !== player) throw new Error('Ainda não é a sua vez.');
  return game;
}
function handle(socket, action) {
  return (payload = {}) => {
    try {
      action(payload);
    } catch (error) {
      socket.emit('game:error', error instanceof Error ? error.message : 'Não foi possível executar a ação.');
    }
  };
}

function cleanName(value) {
  return String(value ?? '').trim().slice(0, 14) || 'Jogador';
}
function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

io.on('connection', (socket) => {
  socket.on('room:create', handle(socket, ({ name }) => {
    if (socket.data.roomCode) throw new Error('Você já está em uma sala.');
    const code = newCode();
    const room = { code, hostId: socket.id, seats: [{ id: socket.id, name: cleanName(name) }], scores: [0], game: null };
    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.join(code);
    update(room);
  }));

  socket.on('room:join', handle(socket, ({ code, name }) => {
    if (socket.data.roomCode) throw new Error('Você já está em uma sala.');
    const room = rooms.get(String(code ?? '').trim().toUpperCase());
    if (!room || (room.game && room.game.phase !== 'lobby')) throw new Error('Sala inexistente ou partida já iniciada.');
    if (room.seats.length >= 7) throw new Error('A sala está cheia.');
    room.seats.push({ id: socket.id, name: cleanName(name) });
    room.scores.push(0);
    socket.data.roomCode = room.code;
    socket.join(room.code);
    update(room);
  }));

  socket.on('room:add-bot', handle(socket, () => {
    const room = requireRoom(socket);
    requireHost(socket, room);
    if (room.game && room.game.phase !== 'lobby') throw new Error('A partida já começou.');
    if (room.seats.length >= 7) throw new Error('A sala está cheia.');
    const count = room.seats.filter((seat) => seat.bot).length;
    room.seats.push({ id: `bot-${++botSequence}`, name: botNames[count % botNames.length], bot: true });
    room.scores.push(0);
    update(room);
  }));

  socket.on('room:remove-bot', handle(socket, ({ id }) => {
    const room = requireRoom(socket);
    requireHost(socket, room);
    if (room.game && room.game.phase !== 'lobby') throw new Error('A partida já começou.');
    const index = room.seats.findIndex((seat) => seat.id === id && seat.bot);
    if (index < 0) throw new Error('Bot não encontrado.');
    room.seats.splice(index, 1);
    room.scores.splice(index, 1);
    update(room);
  }));

  socket.on('room:start', handle(socket, () => {
    const room = requireRoom(socket);
    requireHost(socket, room);
    if (room.seats.length < 2 || room.seats.length > 7) throw new Error('A partida precisa de 2 a 7 jogadores.');
    room.notice = '';
    room.round = 0;
    deal(room);
    update(room);
  }));

  socket.on('game:play', handle(socket, ({ cardId, color }) => {
    const room = requireRoom(socket);
    const player = requirePlayer(socket, room);
    requireTurn(room, player);
    playCard(room, player, Number(cardId), color);
    update(room);
  }));

  socket.on('game:draw', handle(socket, () => {
    const room = requireRoom(socket);
    const player = requirePlayer(socket, room);
    const game = requireTurn(room, player);
    if (game.drawn != null) throw new Error('Passe a vez após comprar uma carta.');
    if (game.stack) {
      const count = game.stack;
      game.stack = 0;
      drawCards(game, player, count);
      game.current = nextSeat(game, player);
      game.message = `${room.seats[player].name} comprou ${count} cartas.`;
    } else {
      if (game.hands[player].some((card) => canPlay(game, card))) throw new Error('Você já tem uma carta jogável.');
      drawCards(game, player, 1);
      const card = game.hands[player].at(-1);
      if (card && canPlay(game, card)) {
        game.drawn = card.id;
        game.message = `${room.seats[player].name} comprou uma carta jogável.`;
      } else {
        game.current = nextSeat(game, player);
        game.message = `${room.seats[player].name} comprou uma carta e passou.`;
      }
    }
    update(room);
  }));

  socket.on('game:pass', handle(socket, () => {
    const room = requireRoom(socket);
    const player = requirePlayer(socket, room);
    const game = requireTurn(room, player);
    if (game.drawn == null) throw new Error('Você ainda não comprou uma carta jogável.');
    game.message = `${room.seats[player].name} passou a vez.`;
    game.drawn = null;
    game.current = nextSeat(game, player);
    update(room);
  }));

  socket.on('game:uno', handle(socket, () => {
    const room = requireRoom(socket);
    const player = requirePlayer(socket, room);
    const game = room.game;
    if (!game || game.phase !== 'play' || game.unoPlayer !== player) throw new Error('Não há UNO para confirmar.');
    game.unoPlayer = -1;
    game.message = `${room.seats[player].name}: UNO!`;
    update(room);
  }));

  socket.on('game:challenge', handle(socket, ({ challenge }) => {
    const room = requireRoom(socket);
    const player = requirePlayer(socket, room);
    if (!room.game?.challenge || room.seats[room.game.challenge.target].id !== socket.id) throw new Error('Você não pode responder a este desafio.');
    resolveChallenge(room, Boolean(challenge));
    update(room);
  }));

  socket.on('room:next-round', handle(socket, () => {
    const room = requireRoom(socket);
    requireHost(socket, room);
    if (room.game?.phase !== 'over') throw new Error('A rodada ainda não terminou.');
    if (room.scores.some((score) => score >= 500)) room.scores = room.scores.map(() => 0);
    room.round = (room.round ?? 0) + 1;
    deal(room);
    update(room);
  }));

  socket.on('room:close-game', handle(socket, () => {
    const room = requireRoom(socket);
    requireHost(socket, room);
    if (room.botTimer) clearTimeout(room.botTimer);
    if (room.unoTimer) clearTimeout(room.unoTimer);
    room.game = null;
    room.scores = room.seats.map(() => 0);
    room.round = 0;
    room.notice = '';
    update(room);
  }));

  socket.on('room:leave', handle(socket, () => {
    const room = requireRoom(socket);
    if (room.game && room.game.phase !== 'lobby') throw new Error('Aguarde o fim da partida para sair.');
    const player = room.seats.findIndex((seat) => seat.id === socket.id);
    room.seats.splice(player, 1);
    room.scores.splice(player, 1);
    socket.leave(room.code);
    delete socket.data.roomCode;
    if (!room.seats.length) rooms.delete(room.code);
    else {
      if (room.hostId === socket.id) room.hostId = room.seats.find((seat) => !seat.bot)?.id ?? room.seats[0].id;
      update(room);
    }
    socket.emit('room:left');
  }));

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const index = room.seats.findIndex((seat) => seat.id === socket.id);
    if (index < 0) return;
    const disconnectedName = room.seats[index].name;
    room.seats.splice(index, 1);
    room.scores.splice(index, 1);
    if (!room.seats.length) {
      if (room.botTimer) clearTimeout(room.botTimer);
      if (room.unoTimer) clearTimeout(room.unoTimer);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === socket.id) room.hostId = room.seats.find((seat) => !seat.bot)?.id ?? room.seats[0].id;
    if (!room.seats.some((seat) => !seat.bot)) {
      if (room.botTimer) clearTimeout(room.botTimer);
      if (room.unoTimer) clearTimeout(room.unoTimer);
      rooms.delete(room.code);
      return;
    }
    if (room.game) {
      room.game = null;
      room.scores = room.seats.map(() => 0);
      room.round = 0;
      room.notice = `A partida foi encerrada porque ${disconnectedName} desconectou.`;
    }
    update(room);
  });
});

const port = Number(process.env.PORT) || 3000;
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`UNO disponível em http://localhost:${port}`);
});
