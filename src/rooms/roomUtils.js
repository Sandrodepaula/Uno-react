import { canPlay, canPlayWithMercyCoin, drawValues, topCard } from '../game/game.js';

// Função para gerar a visão pública do estado da sala e do jogo para um jogador específico
export function publicView(room, playerId) {
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
      mercyChoice: game?.mercyChoices[index] ?? null,
      extraLifeAvailable: Boolean(game?.extraLives[index]),
    })),
    game: game ? {
      phase: game.phase,
      current: game.current,
      direction: game.direction,
      color: game.color,
      topCard: topCard(game),
      stack: game.stack,
      stackLast: game.stackLast,
      playableCardIds: player >= 0 && game.phase === 'play' && game.current === player && !game.challenge && game.mercyPlayer < 0
        ? game.hands[player].filter((card) => canPlay(game, card, player)
          && (!game.mercyCoinActive?.[player] || drawValues[card.value])).map((card) => card.id)
        : [],
      drawn: player >= 0 && game.drawn != null && game.current === player ? game.drawn : null,
      hand: player >= 0 ? game.hands[player] : [],
      challenge: game.challenge ? {
        type: game.challenge.type,
        targetId: room.seats[game.challenge.target].id,
        color: game.challenge.color ?? null,
      } : null,
      revealedHand: game.revealedHand ? {
        playerId: room.seats[game.revealedHand.player].id,
        playerName: room.seats[game.revealedHand.player].name,
        cards: game.revealedHand.cards,
        actionCount: game.revealedHand.actionCount,
      } : null,
      unoAvailable: player >= 0 && game.unoPlayer === player,
      mercyPending: game.mercyPlayer >= 0,
      mercyAvailable: player >= 0 && game.mercyPlayer === player,
      mercyPlayerName: game.mercyPlayer >= 0 ? room.seats[game.mercyPlayer].name : null,
      mercyChoiceAvailable: player >= 0 && game.phase === 'mercyChoice' && !game.mercyChoices[player],
      playerMercyChoice: player >= 0 ? game.mercyChoices[player] : null,
      mercyCoinAvailable: player >= 0
        && game.phase === 'play'
        && game.current === player
        && game.mercyChoices[player] === 'noMercy'
        && !game.mercyCoinUsed?.[player]
        && !game.mercyCoinActive?.[player]
        && game.hands[player].some((card) => drawValues[card.value]
          && (game.drawn == null || game.drawn === card.id)
          && canPlayWithMercyCoin(game, card, player)),
      mercyCoinActive: player >= 0 && Boolean(game.mercyCoinActive?.[player]),
      mercyCoinUsed: player >= 0 && Boolean(game.mercyCoinUsed?.[player]),
      winner: game.winner,
      points: game.points,
      message: game.message,
    } : null,
    isHost: room.hostId === playerId,
    playerId,
    notice: room.notice ?? '',
  };
}

export function broadcast(room, io) {
  for (const seat of room.seats) {
    if (!seat.bot) io.to(seat.id).emit('state:update', publicView(room, seat.id));
  }
}
