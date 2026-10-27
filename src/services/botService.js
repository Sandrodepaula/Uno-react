import { confirmMercy, moveBot } from '../game/game.js';

export function confirmBotMercy(room, player) {
  confirmMercy(room, player);
}

export function playBotTurn(room) {
  moveBot(room);
}
