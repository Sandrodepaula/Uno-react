import { randomInt } from 'node:crypto';
import { cleanName } from '../utils/playerUtils.js';

export const rooms = new Map();

const botNames = ['Ana', 'Beto', 'Carla', 'Duda', 'Edu', 'Fábio'];
let botSequence = 0;

export function newRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

export function createRoom(socket, name) {
  const code = newRoomCode();
  const room = {
    code,
    hostId: socket.id,
    seats: [{ id: socket.id, name: cleanName(name) }],
    scores: [0],
    game: null,
  };
  rooms.set(code, room);
  return room;
}

export function addBot(room) {
  const count = room.seats.filter((seat) => seat.bot).length;
  room.seats.push({
    id: `bot-${++botSequence}`,
    name: botNames[count % botNames.length],
    bot: true,
  });
  room.scores.push(0);
}
