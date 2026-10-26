import { randomInt } from 'node:crypto';

export const colors = ['red', 'yellow', 'green', 'blue'];
export const colorNames = { red: 'vermelho', yellow: 'amarelo', green: 'verde', blue: 'azul' };
export const mercyChoices = ['mercy', 'noMercy'];
export const drawValues = { '+2': 2, w4: 4, w6: 6, w8rev: 8, w10: 10 };
const actionValues = new Set(['skip', 'rev', '+2', 'discardAll', 'wildDiscardAll', 'skipAll', 'w4', 'w6', 'w10', 'roulette', 'draw24', 'attackFinal']);

export function makeDeck() {
  const deck = [];
  let id = 0;
  for (const color of colors) {
    deck.push({ color, value: '0', id: id++ });
    for (let number = 1; number <= 9; number++) {
      for (let copy = 0; copy < 3; copy++) deck.push({ color, value: String(number), id: id++ });
    }
    for (const value of ['skip', 'rev', '+2', 'discardAll', 'skipAll']) {
      for (let copy = 0; copy < 2; copy++) deck.push({ color, value, id: id++ });
    }
  }
  for (let copy = 0; copy < 4; copy++) {
    for (const value of ['w4', 'w6', 'w8rev', 'w10', 'roulette']) deck.push({ color: 'wild', value, id: id++ });
  }
  for (let copy = 0; copy < 2; copy++) deck.push({ color: 'wild', value: 'draw24', id: id++ });
  for (let copy = 0; copy < 2; copy++) deck.push({ color: 'wild', value: 'attackFinal', id: id++ });
  for (let copy = 0; copy < 8; copy++) deck.push({ color: 'wild', value: 'wildDiscardAll', id: id++ });
  return deck;
}

export function shuffle(deck, getRandomInt = randomInt) {
  for (let index = deck.length - 1; index > 0; index--) {
    const target = getRandomInt(index + 1);
    [deck[index], deck[target]] = [deck[target], deck[index]];
  }
  return deck;
}

export const topCard = (game) => game.discard.at(-1);
export const nextSeat = (room, game, player, steps = 1) => {
  const count = room.seats.length;
  let next = player;
  for (let step = 0; step < steps; step++) {
    let candidate = next;
    do {
      candidate = (candidate + game.direction + count) % count;
    } while (candidate !== next && game.eliminated.includes(candidate));
    next = candidate;
  }
  return next;
};
export const canPlay = (game, card, player) => game.stack
  ? (drawValues[card.value] ?? 0) * (game.mercyChoices?.[player] === 'noMercy' ? 2 : 1) >= game.stackLast
  : card.color === 'wild' || card.color === game.color || card.value === topCard(game).value;
export const cardValue = (card) => card.color === 'wild'
  ? 50
  : Number.isNaN(Number(card.value)) ? 20 : Number(card.value);
export const activePlayers = (game, count) => Array.from({ length: count }, (_, index) => index)
  .filter((index) => !game.eliminated.includes(index));

export function drawCards(game, player, count, getRandomInt = randomInt) {
  for (let index = 0; index < count; index++) {
    if (!game.deck.length) {
      if (game.discard.length <= 1) break;
      const top = game.discard.pop();
      game.deck = shuffle(game.discard, getRandomInt);
      game.discard = [top];
    }
    if (!game.deck.length) break;
    game.hands[player].push(game.deck.pop());
  }
}

export function deal(room, getRandomInt = randomInt) {
  const game = room.game ?? {};
  game.deck = shuffle(makeDeck(), getRandomInt);
  game.hands = room.seats.map(() => []);
  for (let index = 0; index < 7; index++) game.hands.forEach((hand) => hand.push(game.deck.pop()));
  let first;
  do {
    first = game.deck.pop();
    if (first.color === 'wild' || Number.isNaN(Number(first.value))) game.deck.unshift(first);
  } while (first.color === 'wild' || Number.isNaN(Number(first.value)));
  game.discard = [first];
  game.color = first.color;
  game.current = room.round % room.seats.length;
  game.direction = 1;
  game.stack = 0;
  game.stackLast = 0;
  game.drawn = null;
  game.unoPlayer = -1;
  game.challenge = null;
  game.revealedHand = null;
  game.eliminated = [];
  game.mercyPlayer = -1;
  game.mercyChoices = room.seats.map(() => null);
  game.extraLives = room.seats.map(() => 0);
  game.phase = 'mercyChoice';
  game.message = 'Escolha sua moeda para iniciar a rodada.';
  room.game = game;
}

export function chooseMercy(room, player, choice) {
  const game = room.game;
  if (game.phase !== 'mercyChoice') throw new Error('A escolha da moeda já foi encerrada.');
  if (!mercyChoices.includes(choice)) throw new Error('Escolha uma moeda válida.');
  if (game.mercyChoices[player]) throw new Error('Você já escolheu sua moeda.');
  game.mercyChoices[player] = choice;
  game.extraLives[player] = choice === 'mercy' ? 1 : 0;
  if (game.mercyChoices.every(Boolean)) {
    game.phase = 'play';
    game.message = `Rodada ${room.round + 1}. Vez de ${room.seats[game.current].name}.`;
  } else {
    game.message = `${room.seats[player].name} escolheu sua moeda. Aguardando os demais jogadores.`;
  }
}

export function endRound(room, player) {
  const game = room.game;
  game.phase = 'over';
  game.winner = player;
  game.unoPlayer = -1;
  game.points = game.hands.reduce((total, hand, index) => total + (game.eliminated.includes(index)
    ? 0
    : hand.reduce((sum, card) => sum + cardValue(card), 0)), 250 * game.eliminated.length);
  room.scores[player] += game.points;
}

export function checkMercy(room, player) {
  const game = room.game;
  if (game.hands[player].length < 25 || game.eliminated.includes(player) || game.mercyPlayer >= 0) return false;
  game.mercyPlayer = player;
  game.message = `${room.seats[player].name} chegou a 25 cartas. Confirme sua moeda.`;
  return true;
}

function useMercyLife(room, player) {
  const game = room.game;
  if (game.mercyChoices[player] !== 'mercy' || game.extraLives[player] <= 0) return false;
  const top = game.discard.pop();
  game.discard.push(...game.hands[player], top);
  game.hands[player] = [];
  drawCards(game, player, 7);
  game.extraLives[player] = 0;
  game.drawn = null;
  game.unoPlayer = game.unoPlayer === player ? -1 : game.unoPlayer;
  return true;
}

export function confirmMercy(room, player) {
  const game = room.game;
  if (game.mercyPlayer !== player) throw new Error('Você não pode confirmar a Regra da Misericórdia.');
  if (useMercyLife(room, player)) {
    game.mercyPlayer = -1;
    game.message = `${room.seats[player].name} usou sua vida extra e voltou com 7 cartas.`;
    if (game.current === player) game.current = nextSeat(room, game, player);
    return false;
  }
  game.eliminated.push(player);
  game.mercyPlayer = -1;
  game.unoPlayer = game.unoPlayer === player ? -1 : game.unoPlayer;
  game.message = `${room.seats[player].name} foi eliminado pela Regra da Misericórdia.`;
  if (finishIfLastPlayer(room)) return true;
  game.current = nextSeat(room, game, player);
  return false;
}

export function finishIfLastPlayer(room) {
  const remaining = activePlayers(room.game, room.seats.length);
  if (remaining.length !== 1) return false;
  endRound(room, remaining[0]);
  return true;
}

export function playCard(room, player, cardId, chosenColor, targetPlayer, getRandomInt = randomInt, discardCardIds) {
  const game = room.game;
  const hand = game.hands[player];
  const cardIndex = hand.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) throw new Error('Essa carta não está na sua mão.');
  const card = hand[cardIndex];
  if (!canPlay(game, card, player) || (game.drawn != null && game.drawn !== card.id)) throw new Error('Essa carta não pode ser jogada agora.');
  if (card.color === 'wild' && !['roulette', 'attackFinal'].includes(card.value) && !colors.includes(chosenColor)) throw new Error('Escolha uma cor válida.');
  if (card.value === '7' && (!Number.isInteger(targetPlayer) || targetPlayer === player || game.eliminated.includes(targetPlayer) || !game.hands[targetPlayer])) {
    throw new Error('Escolha outro jogador que ainda esteja na partida.');
  }
  const matchingCards = hand.filter((other) => other.id !== cardId && other.color === card.color);
  const discardableCards = card.value === 'wildDiscardAll'
    ? hand.filter((other) => other.id !== cardId && other.color === chosenColor)
    : matchingCards;
  const selectedDiscardIds = discardCardIds ?? matchingCards.map((other) => other.id);
  if (card.value === 'wildDiscardAll' && !Array.isArray(discardCardIds)) {
    throw new Error('Selecione as cartas que deseja descartar.');
  }
  if (card.value === 'discardAll' || card.value === 'wildDiscardAll') {
    if (!Array.isArray(selectedDiscardIds) || new Set(selectedDiscardIds).size !== selectedDiscardIds.length
      || selectedDiscardIds.some((id) => !discardableCards.some((other) => other.id === id))
      || (discardableCards.length > 0 && selectedDiscardIds.length === 0)) {
      throw new Error(card.value === 'discardAll'
        ? 'Selecione ao menos uma carta da mesma cor para descartar.'
        : 'Selecione ao menos uma carta da cor escolhida para descartar.');
    }
  } else if (discardCardIds !== undefined) {
    throw new Error('Não é possível descartar cartas com essa jogada.');
  }

  hand.splice(cardIndex, 1);
  game.revealedHand = null;
  game.discard.push(card);
  game.color = card.color === 'wild' && !['roulette', 'attackFinal'].includes(card.value)
    ? chosenColor
    : card.color === 'wild' ? game.color : card.color;
  game.drawn = null;

  let advance = 1;
  let message = `${room.seats[player].name} jogou.`;
  if (card.color === 'wild' && !['roulette', 'attackFinal'].includes(card.value)) message = `${room.seats[player].name} escolheu ${colorNames[chosenColor]}.`;
  if (card.value === 'skip') {
    advance = 2;
    message = `${room.seats[nextSeat(room, game, player)].name} perdeu a vez.`;
  } else if (card.value === 'rev') {
    game.direction *= -1;
    message = 'O sentido do jogo inverteu.';
    if (room.seats.length === 2) advance = 2;
  } else if (card.value === '0') {
    const players = activePlayers(game, room.seats.length);
    const hands = game.hands.slice();
    players.forEach((index) => { game.hands[nextSeat(room, game, index)] = hands[index]; });
    message = 'Todos passaram as cartas para o próximo jogador.';
  } else if (card.value === 'skipAll') {
    advance = 0;
    message = `${room.seats[player].name} pulou a vez de todos e joga novamente.`;
  } else if (card.value === 'discardAll') {
    const selectedIds = new Set(selectedDiscardIds);
    const discarded = hand.filter((other) => selectedIds.has(other.id));
    game.hands[player] = hand.filter((other) => !selectedIds.has(other.id));
    game.discard.splice(game.discard.length - 1, 0, ...discarded);
    message = `${room.seats[player].name} descartou ${discarded.length} carta${discarded.length === 1 ? '' : 's'} ${colorNames[card.color]}.`;
  } else if (card.value === 'wildDiscardAll') {
    const selectedIds = new Set(selectedDiscardIds);
    const discarded = hand.filter((other) => selectedIds.has(other.id));
    game.hands[player] = hand.filter((other) => !selectedIds.has(other.id));
    game.discard.splice(game.discard.length - 1, 0, ...discarded);
    message = `${room.seats[player].name} escolheu ${colorNames[chosenColor]} e descartou ${discarded.length} carta${discarded.length === 1 ? '' : 's'} ${colorNames[chosenColor]}.`;
  } else if (card.value === '7') {
    [game.hands[player], game.hands[targetPlayer]] = [game.hands[targetPlayer], game.hands[player]];
    message = `${room.seats[player].name} trocou as cartas com ${room.seats[targetPlayer].name}.`;
  } else if (drawValues[card.value]) {
    if (card.value === 'w4' || card.value === 'w8rev') {
      game.direction *= -1;
      message = card.value === 'w8rev' ? 'O sentido do jogo inverteu.' : message;
      if (card.value === 'w4' && room.seats.length === 2) {
        advance = 0;
      }
    }
    const drawAmount = drawValues[card.value] * (game.mercyChoices[player] === 'noMercy' ? 2 : 1);
    if (!(card.value === 'w4' && room.seats.length === 2)) {
      game.stack += drawAmount;
      game.stackLast = drawAmount;
      message = `${room.seats[nextSeat(room, game, player)].name} deve empilhar uma carta Comprar de valor igual ou maior, ou comprar ${game.stack}.`;
    } else {
      drawCards(game, player, drawAmount, getRandomInt);
      checkMercy(room, player);
      advance = 0;
    }
  } else if (card.value === 'roulette') {
    const target = nextSeat(room, game, player);
    game.challenge = { type: 'roulette', player, target };
    game.current = -1;
    game.message = `${room.seats[target].name} deve escolher uma cor para a Roleta Colorida.`;
    return;
  } else if (card.value === 'attackFinal') {
    const target = nextSeat(room, game, player);
    const actionCount = hand.filter((other) => other.color === 'wild' || actionValues.has(other.value)).length;
    game.revealedHand = { player, cards: hand.slice(), actionCount };
    drawCards(game, target, actionCount, getRandomInt);
    const revived = actionCount >= 7 && useMercyLife(room, target);
    if (actionCount >= 7) {
      if (!revived && !game.eliminated.includes(target)) {
        game.eliminated.push(target);
        game.unoPlayer = game.unoPlayer === target ? -1 : game.unoPlayer;
      }
    } else checkMercy(room, target);
    if (game.eliminated.includes(target) && finishIfLastPlayer(room)) return;
    advance = game.eliminated.includes(target) ? 1 : 2;
    message = revived
      ? `${room.seats[player].name} revelou ${actionCount} cartas de ação ou curingas. ${room.seats[target].name} usou sua vida extra e voltou com 7 cartas.`
      : actionCount >= 7
      ? `${room.seats[player].name} revelou ${actionCount} cartas de ação ou curingas. ${room.seats[target].name} comprou ${actionCount} cartas e foi eliminado.`
      : `${room.seats[player].name} revelou ${actionCount} cartas de ação ou curingas. ${room.seats[target].name} comprou ${actionCount} carta${actionCount === 1 ? '' : 's'} e perdeu a vez.`;
  } else if (card.value === 'draw24') {
    const players = activePlayers(game, room.seats.length);
    players.forEach((index) => drawCards(game, index, Math.max(0, 24 - game.hands[index].length), getRandomInt));
    message = `${room.seats[player].name} escolheu ${colorNames[chosenColor]}. Todos compraram cartas até terem 24 na mão.`;
  }

  if (game.phase !== 'play') return;
  if (game.hands[player].length === 0) {
    endRound(room, player);
    return;
  }
  if (game.eliminated.includes(player)) {
    if (finishIfLastPlayer(room)) return;
    game.current = nextSeat(room, game, player);
    return;
  }
  if (game.hands[player].length === 1) {
    message += ` ${room.seats[player].name}: UNO!`;
    if (!room.seats[player].bot) {
      game.unoPlayer = player;
      game.unoToken = (game.unoToken ?? 0) + 1;
    }
  }
  game.message = game.mercyPlayer === player
    ? `${room.seats[player].name} chegou a 25 cartas. Confirme a Regra da Misericórdia.`
    : message;
  game.current = nextSeat(room, game, player, advance);
}

export function resolveRoulette(room, color) {
  const game = room.game;
  if (game.challenge?.type !== 'roulette') throw new Error('Não há Roleta Colorida pendente.');
  if (game.challenge.color) throw new Error('A cor da Roleta Colorida já foi escolhida.');
  if (!colors.includes(color)) throw new Error('Escolha uma cor válida.');
  game.challenge.color = color;
  game.color = color;
  game.message = `${room.seats[game.challenge.target].name} deve comprar cartas uma por uma até encontrar ${colorNames[color]}.`;
}

export function drawRouletteCard(room, getRandomInt = randomInt) {
  const game = room.game;
  const challenge = game.challenge;
  if (challenge?.type !== 'roulette' || !challenge.color) throw new Error('Escolha uma cor antes de comprar cartas.');
  const { target, color } = challenge;
  if (!game.deck.length && game.discard.length > 1) {
    const top = game.discard.pop();
    game.deck = shuffle(game.discard, getRandomInt);
    game.discard = [top];
  }
  const drawnCard = game.deck.pop();
  if (drawnCard) game.hands[target].push(drawnCard);
  if (drawnCard?.color !== color && (game.deck.length || game.discard.length > 1)) {
    game.message = `${room.seats[target].name} comprou uma carta. Compre outra até encontrar ${colorNames[color]}.`;
    return;
  }

  const targetName = room.seats[target].name;
  game.challenge = null;
  const mercyPending = checkMercy(room, target);
  game.current = nextSeat(room, game, target);
  game.message = mercyPending
    ? `${targetName} chegou a 25 cartas. Confirme a Regra da Misericórdia.`
    : drawnCard?.color === color
      ? `${targetName} encontrou ${colorNames[color]} e perdeu a vez.`
      : `${targetName} não tinha mais cartas para comprar e perdeu a vez.`;
}

export function pickBotColor(hand, getRandomInt = randomInt) {
  const counts = Object.fromEntries(colors.map((color) => [color, 0]));
  hand.forEach((card) => { if (card.color !== 'wild') counts[card.color]++; });
  return colors.reduce((best, color) => counts[color] > counts[best] ? color : best, colors[getRandomInt(colors.length)]);
}

export function moveBot(room, getRandomInt = randomInt, random = Math.random) {
  const game = room.game;
  const player = game.current;
  if (player < 0 || !room.seats[player]?.bot || game.phase !== 'play') return;
  const hand = game.hands[player];
  const playable = hand.filter((card) => canPlay(game, card, player));
  if (!playable.length) {
    if (game.stack) {
      const count = game.stack;
      game.stack = 0;
      game.stackLast = 0;
      drawCards(game, player, count, getRandomInt);
      checkMercy(room, player);
      if (finishIfLastPlayer(room)) return;
      game.current = nextSeat(room, game, player);
      game.message = game.mercyPlayer === player
        ? `${room.seats[player].name} chegou a 25 cartas. Confirme a Regra da Misericórdia.`
        : `${room.seats[player].name} comprou ${count} cartas.`;
      return;
    }
    let drawn;
    while (game.deck.length || game.discard.length > 1) {
      drawCards(game, player, 1, getRandomInt);
      drawn = hand.at(-1);
      if (canPlay(game, drawn, player)) break;
      if (game.deck.length === 0 && game.discard.length <= 1) break;
    }
    if (checkMercy(room, player)) {
      if (finishIfLastPlayer(room)) return;
      game.current = nextSeat(room, game, player);
      game.message = `${room.seats[player].name} chegou a 25 cartas. Confirme a Regra da Misericórdia.`;
      return;
    }
    if (drawn && canPlay(game, drawn, player)) {
      const chosenColor = drawn.color === 'wild' && !['roulette', 'attackFinal'].includes(drawn.value)
        ? pickBotColor(hand, getRandomInt)
        : undefined;
      const discardCardIds = drawn.value === 'wildDiscardAll'
        ? hand.filter((card) => card.color === chosenColor).map((card) => card.id)
        : undefined;
      playCard(room, player, drawn.id, chosenColor,
        drawn.value === '7' ? activePlayers(game, room.seats.length).find((index) => index !== player) : undefined,
        getRandomInt, discardCardIds);
      return;
    }
    game.current = nextSeat(room, game, player);
    game.message = `${room.seats[player].name} comprou uma carta e passou.`;
    return;
  }
  const colored = playable.filter((card) => card.color !== 'wild');
  const pool = colored.length ? colored : playable;
  const actionCards = pool.filter((card) => Number.isNaN(Number(card.value)));
  const choices = actionCards.length && random() < 0.6 ? actionCards : pool;
  const card = choices[getRandomInt(choices.length)];
  const chosenColor = card.color === 'wild' && !['roulette', 'attackFinal'].includes(card.value)
    ? pickBotColor(hand, getRandomInt)
    : undefined;
  const discardCardIds = card.value === 'wildDiscardAll'
    ? hand.filter((other) => other.color === chosenColor).map((other) => other.id)
    : undefined;
  playCard(room, player, card.id, chosenColor,
    card.value === '7' ? activePlayers(game, room.seats.length).find((index) => index !== player) : undefined,
    getRandomInt, discardCardIds);
}

export function resolveUnoPenalty(room, getRandomInt = randomInt) {
  const game = room.game;
  if (!game || game.phase !== 'play' || game.unoPlayer < 0) return false;
  const player = game.unoPlayer;
  game.unoPlayer = -1;
  drawCards(game, player, 2, getRandomInt);
  const mercyPending = checkMercy(room, player);
  if (finishIfLastPlayer(room)) return true;
  game.message = mercyPending
    ? `${room.seats[player].name} chegou a 25 cartas. Confirme a Regra da Misericórdia.`
    : `${room.seats[player].name} esqueceu o UNO e comprou 2 cartas.`;
  return false;
}

export function scheduleUnoPenalty(room, onExpired, {
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  if (room.unoTimer) clearTimeoutFn(room.unoTimer);
  const game = room.game;
  if (!game || game.phase !== 'play' || game.unoPlayer < 0) {
    room.unoTimer = null;
    return null;
  }
  const token = game.unoToken;
  room.unoTimer = setTimeoutFn(() => {
    const current = room.game;
    if (!current || current.phase !== 'play' || current.unoPlayer < 0 || current.unoToken !== token) return;
    onExpired(current.unoPlayer);
  }, 2500);
  return room.unoTimer;
}
