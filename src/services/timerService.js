import { randomInt } from 'node:crypto';
import {
  colors,
  drawRouletteCard,
  resolveRoulette,
  resolveUnoPenalty,
  scheduleUnoPenalty,
} from '../game/game.js';
import { confirmBotMercy, playBotTurn } from './botService.js';

export function cancelRoomTimers(room) {
  if (room.botTimer) clearTimeout(room.botTimer);
  if (room.unoTimer) clearTimeout(room.unoTimer);
}

// Função para agendar ações do bot e penalidades de UNO
export function scheduleRoom(room, { broadcast, schedule }) {
  if (room.botTimer) clearTimeout(room.botTimer);
  if (room.unoTimer) clearTimeout(room.unoTimer);
  const game = room.game;
  if (!game || game.phase !== 'play') return;

  if (game.mercyPlayer >= 0) {
    if (room.seats[game.mercyPlayer]?.bot) {
      room.botTimer = setTimeout(() => {
        confirmBotMercy(room, game.mercyPlayer);
        broadcast();
        schedule();
      }, 1100);
    }
    return;
  }

  // Penalidade de UNO se o jogador não tiver clicado no botão de UNO dentro do tempo limite
  scheduleUnoPenalty(room, () => {
    const roundOver = resolveUnoPenalty(room);
    broadcast();
    if (!roundOver) schedule();
  });
  if (game.challenge && room.seats[game.challenge.target]?.bot) {
    room.botTimer = setTimeout(() => {
      if (room.game?.challenge) {
        if (room.game.challenge.color) drawRouletteCard(room);
        else resolveRoulette(room, colors[randomInt(colors.length)]);
        broadcast();
        schedule();
      }
    }, 1100);
    return;
  }
  if (room.seats[game.current]?.bot) {
    room.botTimer = setTimeout(() => {
      playBotTurn(room);
      broadcast();
      schedule();
    }, 1100);
  }
}
