import express from 'express';
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  canPlay,
  checkMercy,
  colors,
  deal,
  drawCards,
  finishIfLastPlayer,
  moveBot,
  nextSeat,
  playCard,
  resolveRoulette,
  resolveUnoPenalty,
  scheduleUnoPenalty,
  topCard,
} from './src/game.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const rooms = new Map();
const botNames = ['Ana', 'Beto', 'Carla', 'Duda', 'Edu', 'Fábio'];
let botSequence = 0;

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.get('*', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ configFile: path.join(root, 'vite.config.js'), server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'spa' });
  app.use(vite.middlewares);
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
      eliminated: Boolean(game?.eliminated.includes(index)),
      isCurrent: Boolean(game && game.current === index && game.phase === 'play'),
    })),
    game: game ? {
      phase: game.phase,
      current: game.current,
      direction: game.direction,
      color: game.color,
      topCard: topCard(game),
      stack: game.stack,
      stackLast: game.stackLast,
      drawn: player >= 0 && game.drawn != null && game.current === player ? game.drawn : null,
      hand: player >= 0 ? game.hands[player] : [],
      challenge: game.challenge ? { type: game.challenge.type, targetId: room.seats[game.challenge.target].id } : null,
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

  scheduleUnoPenalty(room, () => {
    const roundOver = resolveUnoPenalty(room);
    broadcast(room);
    if (!roundOver) schedule(room);
  });
  if (game.challenge && room.seats[game.challenge.target]?.bot) {
    room.botTimer = setTimeout(() => {
      if (room.game?.challenge) {
        resolveRoulette(room, colors[randomInt(colors.length)]);
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

  socket.on('game:play', handle(socket, ({ cardId, color, targetPlayer }) => {
    const room = requireRoom(socket);
    const player = requirePlayer(socket, room);
    requireTurn(room, player);
    playCard(room, player, Number(cardId), color, targetPlayer);
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
      game.stackLast = 0;
      drawCards(game, player, count);
      checkMercy(room, player);
      if (finishIfLastPlayer(room)) {
        update(room);
        return;
      }
      game.current = nextSeat(room, game, player);
      game.message = `${room.seats[player].name} comprou ${count} cartas.`;
    } else {
      if (game.hands[player].some((card) => canPlay(game, card))) throw new Error('Você já tem uma carta jogável.');
      let card;
      while (game.deck.length || game.discard.length > 1) {
        drawCards(game, player, 1);
        card = game.hands[player].at(-1);
        if (canPlay(game, card)) break;
        if (game.deck.length === 0 && game.discard.length <= 1) break;
      }
      if (checkMercy(room, player)) {
        if (finishIfLastPlayer(room)) {
          update(room);
          return;
        }
        game.current = nextSeat(room, game, player);
        game.message = `${room.seats[player].name} foi eliminado pela Regra da Misericórdia.`;
      } else if (card && canPlay(game, card)) {
        game.drawn = card.id;
        game.message = `${room.seats[player].name} comprou uma carta jogável.`;
      } else {
        game.current = nextSeat(room, game, player);
        game.message = `${room.seats[player].name} comprou uma carta e passou.`;
      }
    }
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

  socket.on('game:roulette', handle(socket, ({ color }) => {
    const room = requireRoom(socket);
    requirePlayer(socket, room);
    if (!room.game?.challenge || room.seats[room.game.challenge.target].id !== socket.id) throw new Error('Você não pode responder a este desafio.');
    resolveRoulette(room, color);
    update(room);
  }));

  socket.on('room:next-round', handle(socket, () => {
    const room = requireRoom(socket);
    requireHost(socket, room);
    if (room.game?.phase !== 'over') throw new Error('A rodada ainda não terminou.');
    if (room.scores.some((score) => score >= 1000)) room.scores = room.scores.map(() => 0);
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
