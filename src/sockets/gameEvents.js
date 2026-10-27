import {
  canPlay,
  checkMercy,
  chooseMercy,
  confirmMercy,
  drawCards,
  drawRouletteCard,
  finishIfLastPlayer,
  nextSeat,
  playCard,
  resolveRoulette,
  toggleMercyCoin,
} from '../game/game.js';
import { requirePlayer, requireRoom, requireTurn } from '../rooms/roomController.js';
import { handle } from '../utils/errors.js';

export function registerGameEvents(socket, { update }) {
  socket.on('game:mercy:choose', handle(socket, ({ choice }) => {
    const room = requireRoom(socket);
    const player = requirePlayer(socket, room);
    chooseMercy(room, player, choice);
    update(room);
  }));

  socket.on('game:mercy:activate', handle(socket, () => {
    const room = requireRoom(socket);
    const player = requirePlayer(socket, room);
    requireTurn(room, player);
    toggleMercyCoin(room, player);
    update(room);
  }));

  socket.on('game:play', handle(socket, ({ cardId, color, targetPlayer, discardCardIds }) => {
    const room = requireRoom(socket);
    const player = requirePlayer(socket, room);
    requireTurn(room, player);
    playCard(room, player, Number(cardId), color, targetPlayer, { discardCardIds });
    update(room);
  }));

  socket.on('game:draw', handle(socket, () => {
    const room = requireRoom(socket);
    const player = requirePlayer(socket, room);
    const game = requireTurn(room, player);
    if (game.drawn != null) throw new Error('Passe a vez após comprar uma carta.');
    if (game.stack) {
      game.revealedHand = null;
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
      game.message = game.mercyPlayer === player
        ? `${room.seats[player].name} chegou a 25 cartas. Confirme a Regra da Misericórdia.`
        : `${room.seats[player].name} comprou ${count} cartas.`;
    } else {
      game.revealedHand = null;
      let card;
      const handLength = game.hands[player].length;
      drawCards(game, player, 1);
      if (game.hands[player].length > handLength) card = game.hands[player].at(-1);
      if (checkMercy(room, player)) {
        if (finishIfLastPlayer(room)) {
          update(room);
          return;
        }
        game.current = nextSeat(room, game, player);
        game.message = `${room.seats[player].name} chegou a 25 cartas. Confirme a Regra da Misericórdia.`;
      } else if (card) {
        game.drawn = card.id;
        game.message = `${room.seats[player].name} comprou uma carta${canPlay(game, card, player) ? ' jogável' : ''}.`;
      } else {
        game.current = nextSeat(room, game, player);
        game.message = `${room.seats[player].name} não pôde comprar e passou a vez.`;
      }
    }
    update(room);
  }));

  socket.on('game:pass', handle(socket, () => {
    const room = requireRoom(socket);
    const player = requirePlayer(socket, room);
    const game = requireTurn(room, player);
    if (game.drawn == null) throw new Error('Compre uma carta antes de passar a vez.');
    game.revealedHand = null;
    game.drawn = null;
    game.current = nextSeat(room, game, player);
    game.message = `${room.seats[player].name} passou a vez.`;
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

  socket.on('game:mercy:confirm', handle(socket, () => {
    const room = requireRoom(socket);
    const player = requirePlayer(socket, room);
    if (!room.game || room.game.phase !== 'play') throw new Error('Não há uma Regra da Misericórdia para confirmar.');
    confirmMercy(room, player);
    update(room);
  }));

  socket.on('game:reveal:dismiss', handle(socket, () => {
    const room = requireRoom(socket);
    requirePlayer(socket, room);
    if (!room.game?.revealedHand) throw new Error('Não há uma mão revelada.');
    room.game.revealedHand = null;
    update(room);
  }));

  socket.on('game:roulette', handle(socket, ({ color }) => {
    const room = requireRoom(socket);
    requirePlayer(socket, room);
    if (!room.game?.challenge || room.seats[room.game.challenge.target].id !== socket.id) throw new Error('Você não pode responder a este desafio.');
    resolveRoulette(room, color);
    update(room);
  }));

  socket.on('game:roulette:draw', handle(socket, () => {
    const room = requireRoom(socket);
    requirePlayer(socket, room);
    if (!room.game?.challenge || room.seats[room.game.challenge.target].id !== socket.id) throw new Error('Você não pode responder a este desafio.');
    drawRouletteCard(room);
    update(room);
  }));
}
