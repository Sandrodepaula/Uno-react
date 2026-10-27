import { rooms } from './roomManager.js';

export function requireRoom(socket) {
  const room = rooms.get(socket.data.roomCode);
  if (!room) throw new Error('Sala não encontrada.');
  return room;
}

export function requireHost(socket, room) {
  if (room.hostId !== socket.id) throw new Error('Somente o anfitrião pode fazer isso.');
}

export function requirePlayer(socket, room) {
  const player = room.seats.findIndex((seat) => seat.id === socket.id);
  if (player < 0) throw new Error('Você não está nesta sala.');
  return player;
}

export function requireTurn(room, player) {
  const game = room.game;
  if (!game || game.phase !== 'play' || game.challenge || game.mercyPlayer >= 0 || game.current !== player) {
    throw new Error('Ainda não é a sua vez.');
  }
  return game;
}
