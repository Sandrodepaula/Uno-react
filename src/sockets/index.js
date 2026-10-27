import { registerGameEvents } from './gameEvents.js';
import { registerRoomEvents } from './roomEvents.js';

export function registerSocketEvents(io, gameService) {
  io.on('connection', (socket) => {
    registerRoomEvents(socket, gameService);
    registerGameEvents(socket, gameService);
  });
}
