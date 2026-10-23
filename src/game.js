import { randomInt } from 'node:crypto';

export const colors = ['red', 'yellow', 'green', 'blue'];
export const colorNames = { red: 'vermelho', yellow: 'amarelo', green: 'verde', blue: 'azul' };
export const drawValues = { '+2': 2, w4: 4, w6: 6, w10: 10 };

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
    for (const value of ['w4', 'w6', 'w10', 'roulette']) deck.push({ color: 'wild', value, id: id++ });
  }
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
export const canPlay = (game, card) => game.stack
  ? (drawValues[card.value] ?? 0) >= game.stackLast
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
  game.eliminated = [];
  game.phase = 'play';
  game.message = `Rodada ${room.round + 1}. Vez de ${room.seats[game.current].name}.`;
  room.game = game;
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
  if (game.hands[player].length < 25 || game.eliminated.includes(player)) return false;
  game.eliminated.push(player);
  game.unoPlayer = game.unoPlayer === player ? -1 : game.unoPlayer;
  game.message = `${room.seats[player].name} foi eliminado pela Regra da Misericórdia.`;
  return true;
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
  if (!canPlay(game, card) || (game.drawn != null && game.drawn !== card.id)) throw new Error('Essa carta não pode ser jogada agora.');
  if (card.color === 'wild' && card.value !== 'roulette' && !colors.includes(chosenColor)) throw new Error('Escolha uma cor válida.');
  if (card.value === '7' && (!Number.isInteger(targetPlayer) || targetPlayer === player || game.eliminated.includes(targetPlayer) || !game.hands[targetPlayer])) {
    throw new Error('Escolha outro jogador que ainda esteja na partida.');
  }
  const matchingCards = hand.filter((other) => other.id !== cardId && other.color === card.color);
  const selectedDiscardIds = discardCardIds ?? matchingCards.map((other) => other.id);
  if (card.value === 'discardAll') {
    if (!Array.isArray(selectedDiscardIds) || new Set(selectedDiscardIds).size !== selectedDiscardIds.length
      || selectedDiscardIds.some((id) => !matchingCards.some((other) => other.id === id))
      || (matchingCards.length > 0 && selectedDiscardIds.length === 0)) {
      throw new Error('Selecione ao menos uma carta da mesma cor para descartar.');
    }
  } else if (discardCardIds !== undefined) {
    throw new Error('Não é possível descartar cartas com essa jogada.');
  }

  hand.splice(cardIndex, 1);
  game.discard.push(card);
  game.color = card.color === 'wild' && card.value !== 'roulette'
    ? chosenColor
    : card.color === 'wild' ? game.color : card.color;
  game.drawn = null;

  let advance = 1;
  let message = `${room.seats[player].name} jogou.`;
  if (card.color === 'wild' && card.value !== 'roulette') message = `${room.seats[player].name} escolheu ${colorNames[chosenColor]}.`;
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
  } else if (card.value === '7') {
    [game.hands[player], game.hands[targetPlayer]] = [game.hands[targetPlayer], game.hands[player]];
    message = `${room.seats[player].name} trocou as cartas com ${room.seats[targetPlayer].name}.`;
  } else if (drawValues[card.value]) {
    if (card.value === 'w4') {
      game.direction *= -1;
      message = 'O sentido do jogo inverteu.';
      if (room.seats.length === 2) {
        drawCards(game, player, 4, getRandomInt);
        checkMercy(room, player);
        advance = 0;
      }
    }
    if (!(card.value === 'w4' && room.seats.length === 2)) {
      game.stack += drawValues[card.value];
      game.stackLast = drawValues[card.value];
      message = `${room.seats[nextSeat(room, game, player)].name} deve empilhar uma carta Comprar de valor igual ou maior, ou comprar ${game.stack}.`;
    }
  } else if (card.value === 'roulette') {
    const target = nextSeat(room, game, player);
    game.challenge = { type: 'roulette', player, target };
    game.current = -1;
    game.message = `${room.seats[target].name} deve escolher uma cor para a Roleta Colorida.`;
    return;
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
  game.message = message;
  game.current = nextSeat(room, game, player, advance);
}

export function drawRoulette(game, player, color, getRandomInt = randomInt) {
  let foundColor = false;
  while (game.deck.length || game.discard.length > 1) {
    if (!game.deck.length) {
      const top = game.discard.pop();
      game.deck = shuffle(game.discard, getRandomInt);
      game.discard = [top];
      if (!game.deck.length) break;
    }
    const card = game.deck.pop();
    game.hands[player].push(card);
    if (card.color === color) {
      foundColor = true;
      break;
    }
  }
  return foundColor;
}

export function resolveRoulette(room, color, getRandomInt = randomInt) {
  const game = room.game;
  if (game.challenge?.type !== 'roulette') throw new Error('Não há Roleta Colorida pendente.');
  if (!colors.includes(color)) throw new Error('Escolha uma cor válida.');
  const { target } = game.challenge;
  const targetName = room.seats[target].name;
  game.challenge = null;
  drawRoulette(game, target, color, getRandomInt);
  game.color = color;
  if (checkMercy(room, target) && finishIfLastPlayer(room)) return;
  game.current = nextSeat(room, game, target);
  game.message = `${targetName} revelou cartas até encontrar ${colorNames[color]} e perdeu a vez.`;
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
  const playable = hand.filter((card) => canPlay(game, card));
  if (!playable.length) {
    if (game.stack) {
      const count = game.stack;
      game.stack = 0;
      game.stackLast = 0;
      drawCards(game, player, count, getRandomInt);
      checkMercy(room, player);
      if (finishIfLastPlayer(room)) return;
      game.current = nextSeat(room, game, player);
      game.message = `${room.seats[player].name} comprou ${count} cartas.`;
      return;
    }
    let drawn;
    while (game.deck.length || game.discard.length > 1) {
      drawCards(game, player, 1, getRandomInt);
      drawn = hand.at(-1);
      if (canPlay(game, drawn)) break;
      if (game.deck.length === 0 && game.discard.length <= 1) break;
    }
    if (checkMercy(room, player)) {
      if (finishIfLastPlayer(room)) return;
      game.current = nextSeat(room, game, player);
      game.message = `${room.seats[player].name} foi eliminado pela Regra da Misericórdia.`;
      return;
    }
    if (drawn && canPlay(game, drawn)) {
      playCard(room, player, drawn.id, drawn.color === 'wild' && drawn.value !== 'roulette' ? pickBotColor(hand, getRandomInt) : undefined,
        drawn.value === '7' ? activePlayers(game, room.seats.length).find((index) => index !== player) : undefined, getRandomInt);
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
  playCard(room, player, card.id, card.color === 'wild' && card.value !== 'roulette' ? pickBotColor(hand, getRandomInt) : undefined,
    card.value === '7' ? activePlayers(game, room.seats.length).find((index) => index !== player) : undefined, getRandomInt);
}

export function resolveUnoPenalty(room, getRandomInt = randomInt) {
  const game = room.game;
  if (!game || game.phase !== 'play' || game.unoPlayer < 0) return false;
  const player = game.unoPlayer;
  game.unoPlayer = -1;
  drawCards(game, player, 2, getRandomInt);
  checkMercy(room, player);
  if (finishIfLastPlayer(room)) return true;
  game.message = `${room.seats[player].name} esqueceu o UNO e comprou 2 cartas.`;
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
