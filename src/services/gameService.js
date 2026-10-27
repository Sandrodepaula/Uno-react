import { chooseMercy, deal } from '../game/game.js';
import { broadcast as broadcastRoom } from '../rooms/roomUtils.js';
import { scheduleRoom } from './timerService.js';

export function createGameService(io) {
  function broadcast(room) {
    broadcastRoom(room, io);
  }

  function schedule(room) {
    scheduleRoom(room, {
      broadcast: () => broadcast(room),
      schedule: () => schedule(room),
    });
  }

  function update(room) {
    broadcast(room);
    schedule(room);
  }

  function dealRound(room) {
    deal(room);
    room.seats.forEach((seat, index) => {
      if (seat.bot) chooseMercy(room, index, 'noMercy');
    });
  }

  return { update, dealRound };
}
