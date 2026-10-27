import { addBot, createRoom, rooms } from '../rooms/roomManager.js';
import { requireHost, requirePlayer, requireRoom } from '../rooms/roomController.js';
import { cancelRoomTimers } from '../services/timerService.js';
import { handle } from '../utils/errors.js';
import { cleanName } from '../utils/playerUtils.js';

export function registerRoomEvents(socket, { update, dealRound }) {
  socket.on('room:create', handle(socket, ({ name }) => {
    if (socket.data.roomCode) throw new Error('Você já está em uma sala.');
    const room = createRoom(socket, name);
    socket.data.roomCode = room.code;
    socket.join(room.code);
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
    addBot(room);
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
    dealRound(room);
    update(room);
  }));

  socket.on('room:next-round', handle(socket, () => {
    const room = requireRoom(socket);
    requireHost(socket, room);
    if (room.game?.phase !== 'over') throw new Error('A rodada ainda não terminou.');
    if (room.scores.some((score) => score >= 1000)) room.scores = room.scores.map(() => 0);
    room.round = (room.round ?? 0) + 1;
    dealRound(room);
    update(room);
  }));

  socket.on('room:close-game', handle(socket, () => {
    const room = requireRoom(socket);
    requireHost(socket, room);
    cancelRoomTimers(room);
    room.game = null;
    room.scores = room.seats.map(() => 0);
    room.round = 0;
    room.notice = '';
    update(room);
  }));

  socket.on('room:leave', handle(socket, () => {
    const room = requireRoom(socket);
    if (room.game && room.game.phase !== 'lobby') throw new Error('Aguarde o fim da partida para sair.');
    const player = requirePlayer(socket, room);
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
      cancelRoomTimers(room);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === socket.id) room.hostId = room.seats.find((seat) => !seat.bot)?.id ?? room.seats[0].id;
    if (!room.seats.some((seat) => !seat.bot)) {
      cancelRoomTimers(room);
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
}
