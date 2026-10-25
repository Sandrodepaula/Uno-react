import { describe, expect, it, vi } from 'vitest';
import {
  canPlay,
  cardValue,
  checkMercy,
  deal,
  drawCards,
  drawRouletteCard,
  endRound,
  makeDeck,
  moveBot,
  nextSeat,
  playCard,
  resolveRoulette,
  resolveUnoPenalty,
  scheduleUnoPenalty,
} from '../src/game.js';

const card = (color, value, id) => ({ color, value, id });

function createRoom(count = 3) {
  return {
    seats: Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `P${index}`, bot: true })),
    scores: Array(count).fill(0),
    round: 0,
    game: {
      deck: [],
      hands: Array.from({ length: count }, () => []),
      discard: [card('red', '1', 1000)],
      color: 'red',
      current: 0,
      direction: 1,
      stack: 0,
      stackLast: 0,
      drawn: null,
      unoPlayer: -1,
      challenge: null,
      eliminated: [],
      phase: 'play',
      message: '',
    },
  };
}

describe('baralho e distribuição', () => {
  it('cria um baralho de 184 cartas com identificadores únicos e as quantidades corretas', () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(184);
    expect(new Set(deck.map(({ id }) => id)).size).toBe(184);
    expect(deck.filter(({ color, value }) => color === 'wild' && value === 'roulette')).toHaveLength(4);
    expect(deck.filter(({ color, value }) => color === 'wild' && value === 'attackFinal')).toHaveLength(2);
    expect(deck.filter(({ color, value }) => color === 'wild' && value === 'w8rev')).toHaveLength(4);
    expect(deck.filter(({ color, value }) => color === 'wild' && value === 'draw24')).toHaveLength(2);
    expect(deck.filter(({ color, value }) => color === 'wild' && value === 'wildDiscardAll')).toHaveLength(8);
    expect(deck.filter(({ color, value }) => color === 'red' && value === '7')).toHaveLength(3);
    expect(deck.filter(({ color, value }) => color === 'red' && value === 'discardAll')).toHaveLength(2);
  });

  it('distribui sete cartas, deixa a carta inicial numérica e preserva o baralho', () => {
    const room = createRoom(7);
    deal(room, (max) => max - 1);
    expect(room.game.hands.map((hand) => hand.length)).toEqual(Array(7).fill(7));
    expect(Number.isNaN(Number(room.game.discard[0].value))).toBe(false);
    expect(room.game.discard[0].color).not.toBe('wild');
    expect(room.game.deck.length + room.game.discard.length + room.game.hands.flat().length).toBe(184);
  });

  it('não fabrica cartas quando o baralho e a pilha de descarte acabam', () => {
    const room = createRoom(2);
    room.game.deck = [];
    room.game.discard = [card('red', '1', 20)];
    room.game.hands[0] = [card('blue', '2', 21)];
    drawCards(room.game, 0, 3, () => 0);
    expect(room.game.hands[0].map(({ id }) => id)).toEqual([21]);
    expect(room.game.discard.map(({ id }) => id)).toEqual([20]);
  });
});

describe('regras das cartas', () => {
  it('combina cartas por cor, número ou símbolo; empilhamento exige valor igual ou maior', () => {
    const room = createRoom(3);
    const game = room.game;
    expect(canPlay(game, card('red', '9', 1))).toBe(true);
    expect(canPlay(game, card('blue', '1', 2))).toBe(true);
    expect(canPlay(game, card('blue', '+2', 3))).toBe(false);
    expect(canPlay(game, card('wild', 'w6', 4))).toBe(true);
    expect(canPlay(game, card('wild', 'w8rev', 8))).toBe(true);
    game.stack = 6;
    game.stackLast = 4;
    expect(canPlay(game, card('wild', 'w6', 5))).toBe(true);
    expect(canPlay(game, card('wild', 'w8rev', 9))).toBe(true);
    expect(canPlay(game, card('wild', 'w10', 6))).toBe(true);
    game.stackLast = 6;
    expect(canPlay(game, card('wild', 'w4', 7))).toBe(false);
    expect(canPlay(game, card('wild', 'w6', 10))).toBe(true);
    game.stackLast = 8;
    expect(canPlay(game, card('wild', 'w6', 10))).toBe(false);
    expect(canPlay(game, card('wild', 'w8rev', 11))).toBe(true);
  });

  it('empilha penalidades e o próximo jogador compra a soma ao não conseguir responder', () => {
    const room = createRoom(3);
    room.game.hands[0] = [card('red', '+2', 1), card('red', '3', 2)];
    room.game.hands[1] = [card('wild', 'w6', 3)];
    room.game.hands[2] = [card('blue', '2', 4)];
    playCard(room, 0, 1);
    expect(room.game.stack).toBe(2);
    playCard(room, 1, 3, 'blue');
    expect(room.game.stack).toBe(8);
    expect(room.game.stackLast).toBe(6);
  });

  it('Coringa Inverter +8 inverte o sentido e permite empilhar penalidades', () => {
    const room = createRoom(4);
    room.game.hands[0] = [card('wild', 'w8rev', 1), card('red', '4', 2)];
    room.game.hands[3] = [card('wild', 'w10', 3), card('blue', '2', 4)];

    playCard(room, 0, 1, 'blue');
    expect(room.game.direction).toBe(-1);
    expect(room.game.stack).toBe(8);
    expect(room.game.stackLast).toBe(8);
    expect(room.game.current).toBe(3);
    expect(canPlay(room.game, card('wild', 'w6', 5))).toBe(false);

    playCard(room, 3, 3, 'yellow');
    expect(room.game.direction).toBe(-1);
    expect(room.game.stack).toBe(18);
    expect(room.game.stackLast).toBe(10);
    expect(room.game.current).toBe(2);
  });

  it('Coringa Comprar até 24 completa a mão de todos e mantém a cor escolhida', () => {
    const room = createRoom(3);
    room.game.hands = [
      [card('wild', 'draw24', 1), card('red', '4', 2), card('blue', '7', 3)],
      Array.from({ length: 20 }, (_, index) => card('green', '1', index + 10)),
      Array.from({ length: 23 }, (_, index) => card('blue', '2', index + 40)),
    ];
    room.game.deck = Array.from({ length: 27 }, (_, index) => card('yellow', String(index + 1), index + 100));

    playCard(room, 0, 1, 'green');

    expect(room.game.hands.map((hand) => hand.length)).toEqual([24, 24, 24]);
    expect(room.game.color).toBe('green');
    expect(room.game.current).toBe(1);
    expect(room.game.stack).toBe(0);
    expect(room.game.message).toContain('Todos compraram cartas até terem 24 na mão');
  });

  it('Pular avança dois assentos e Inverter muda o sentido', () => {
    const room = createRoom(4);
    room.game.hands[0] = [card('red', 'skip', 1), card('blue', '3', 2)];
    playCard(room, 0, 1);
    expect(room.game.current).toBe(2);
    room.game.current = 2;
    room.game.color = 'red';
    room.game.hands[2] = [card('red', 'rev', 3), card('green', '5', 4)];
    playCard(room, 2, 3);
    expect(room.game.direction).toBe(-1);
    expect(room.game.current).toBe(1);
  });

  it('Inverter com dois jogadores deixa a vez com quem jogou', () => {
    const room = createRoom(2);
    room.game.hands[0] = [card('red', 'rev', 1), card('green', '5', 2)];
    playCard(room, 0, 1);
    expect(room.game.direction).toBe(-1);
    expect(room.game.current).toBe(0);
  });

  it('Pular Todos mantém a vez com quem jogou', () => {
    const room = createRoom(4);
    room.game.hands[0] = [card('red', 'skipAll', 1), card('blue', '3', 2)];
    playCard(room, 0, 1);
    expect(room.game.current).toBe(0);
  });

  it('o 0 gira todas as mãos e o 7 troca a mão com o jogador escolhido', () => {
    const room = createRoom(3);
    room.game.hands = [
      [card('red', '0', 1), card('green', '2', 2)],
      [card('red', '4', 3)],
      [card('blue', '6', 4)],
    ];
    playCard(room, 0, 1);
    expect(room.game.hands[0].map(({ id }) => id)).toEqual([4]);
    expect(room.game.hands[1].map(({ id }) => id)).toEqual([2]);
    expect(room.game.hands[2].map(({ id }) => id)).toEqual([3]);

    room.game.current = 0;
    room.game.color = 'red';
    room.game.hands[0] = [card('red', '7', 5), card('green', '2', 6)];
    room.game.hands[1] = [card('blue', '9', 7)];
    playCard(room, 0, 5, undefined, 1);
    expect(room.game.hands[0].map(({ id }) => id)).toEqual([7]);
    expect(room.game.hands[1].map(({ id }) => id)).toEqual([6]);
  });

  it('Descartar Tudo descarta somente as cartas da mesma cor selecionadas', () => {
    const room = createRoom(3);
    room.game.hands[0] = [
      card('red', 'discardAll', 1),
      card('red', '2', 2),
      card('red', 'skip', 3),
      card('blue', '4', 4),
    ];
    playCard(room, 0, 1, undefined, undefined, undefined, [2]);
    expect(room.game.hands[0].map(({ id }) => id)).toEqual([3, 4]);
    expect(room.game.discard.map(({ id }) => id)).toEqual([1000, 2, 1]);
  });

  it('Coringa Descartar Tudo descarta somente as cartas selecionadas da cor escolhida', () => {
    const room = createRoom(3);
    room.game.hands[0] = [
      card('wild', 'wildDiscardAll', 1),
      card('red', '2', 2),
      card('red', 'skip', 3),
      card('blue', '4', 4),
      card('wild', 'w4', 5),
    ];

    playCard(room, 0, 1, 'red', undefined, undefined, [2]);

    expect(room.game.hands[0].map(({ id }) => id)).toEqual([3, 4, 5]);
    expect(room.game.discard.map(({ id }) => id)).toEqual([1000, 2, 1]);
    expect(room.game.discard.at(-1)).toEqual(card('wild', 'wildDiscardAll', 1));
    expect(room.game.color).toBe('red');
    expect(room.game.current).toBe(1);
  });

  it('rejeita cartas fora da cor escolhida no Coringa Descartar Tudo', () => {
    const room = createRoom(3);
    room.game.hands[0] = [
      card('wild', 'wildDiscardAll', 1),
      card('red', '2', 2),
      card('blue', '4', 3),
    ];

    expect(() => playCard(room, 0, 1, 'red', undefined, undefined, [3]))
      .toThrow('Selecione ao menos uma carta da cor escolhida para descartar.');
    expect(room.game.hands[0].map(({ id }) => id)).toEqual([1, 2, 3]);
  });

  it('rejeita descarte de carta que não seja da mesma cor', () => {
    const room = createRoom(3);
    room.game.hands[0] = [
      card('red', 'discardAll', 1),
      card('red', '2', 2),
      card('blue', '4', 4),
    ];
    expect(() => playCard(room, 0, 1, undefined, undefined, undefined, [4]))
      .toThrow('Selecione ao menos uma carta da mesma cor para descartar.');
    expect(room.game.hands[0].map(({ id }) => id)).toEqual([1, 2, 4]);
  });

  it('o Curinga Inverter +4 em dois jogadores inverte, pula o adversário e faz quem jogou comprar quatro', () => {
    const room = createRoom(2);
    room.game.hands[0] = [card('wild', 'w4', 1), card('green', '5', 2)];
    room.game.hands[1] = [card('blue', '3', 3)];
    room.game.deck = Array.from({ length: 8 }, (_, index) => card('yellow', String(index + 1), index + 10));
    playCard(room, 0, 1, 'red', undefined, () => 0);
    expect(room.game.direction).toBe(-1);
    expect(room.game.hands[0]).toHaveLength(5);
    expect(room.game.hands[1]).toHaveLength(1);
    expect(room.game.current).toBe(0);
    expect(room.game.stack).toBe(0);
  });

  it('a Roleta Colorida compra uma carta por vez até encontrar a cor escolhida', () => {
    const room = createRoom(3);
    room.game.hands[0] = [card('wild', 'roulette', 1), card('red', '5', 2)];
    room.game.deck = [card('blue', '1', 3), card('yellow', '2', 4), card('green', '3', 5)];
    playCard(room, 0, 1);
    expect(room.game.challenge).toMatchObject({ type: 'roulette', target: 1 });
    resolveRoulette(room, 'yellow');
    expect(room.game.hands[1]).toHaveLength(0);
    expect(room.game.challenge).toMatchObject({ color: 'yellow' });

    drawRouletteCard(room);
    expect(room.game.hands[1].map(({ id }) => id)).toEqual([5]);
    expect(room.game.challenge).toMatchObject({ type: 'roulette', target: 1 });
    expect(room.game.deck.map(({ id }) => id)).toEqual([3, 4]);

    drawRouletteCard(room);
    expect(room.game.hands[1].map(({ id }) => id)).toEqual([5, 4]);
    expect(room.game.deck.map(({ id }) => id)).toEqual([3]);
    expect(room.game.color).toBe('yellow');
    expect(room.game.current).toBe(2);
    expect(room.game.challenge).toBeNull();
  });

  it('Coringa Ataque Final revela a mão, faz o alvo comprar pelas cartas de ação e o pula', () => {
    const room = createRoom(3);
    room.game.hands[0] = [
      card('wild', 'attackFinal', 1),
      card('red', 'skip', 2),
      card('wild', 'w4', 3),
      card('blue', '5', 4),
    ];
    room.game.hands[1] = [card('green', '2', 5)];
    room.game.deck = [card('yellow', '1', 6), card('green', '3', 7)];

    playCard(room, 0, 1);

    expect(room.game.hands[1].map(({ id }) => id)).toEqual([5, 7, 6]);
    expect(room.game.current).toBe(2);
    expect(room.game.revealedHand).toMatchObject({
      player: 0,
      actionCount: 2,
      cards: [card('red', 'skip', 2), card('wild', 'w4', 3), card('blue', '5', 4)],
    });
    expect(room.game.message).toContain('comprou 2 cartas');
  });

  it('elimina o alvo quando o Ataque Final revela sete ou mais cartas de ação ou curingas', () => {
    const room = createRoom(3);
    room.game.hands[0] = [
      card('wild', 'attackFinal', 1),
      card('red', 'skip', 2),
      card('red', 'rev', 3),
      card('red', '+2', 4),
      card('red', 'discardAll', 5),
      card('red', 'skipAll', 6),
      card('wild', 'w4', 7),
      card('wild', 'roulette', 8),
    ];
    room.game.deck = Array.from({ length: 7 }, (_, index) => card('blue', String(index + 1), index + 10));

    playCard(room, 0, 1);

    expect(room.game.hands[1]).toHaveLength(7);
    expect(room.game.eliminated).toContain(1);
    expect(room.game.current).toBe(2);
    expect(room.game.revealedHand.actionCount).toBe(7);
    expect(room.game.message).toContain('foi eliminado');
  });

  it('elimina com 25 cartas e mantém um jogador com 24 cartas ativo', () => {
    const room = createRoom(3);
    room.game.hands[0] = Array.from({ length: 24 }, (_, index) => card('red', '1', index));
    expect(checkMercy(room, 0)).toBe(false);
    room.game.hands[0].push(card('blue', '2', 25));
    expect(checkMercy(room, 0)).toBe(true);
    expect(checkMercy(room, 0)).toBe(false);
    expect(room.game.eliminated).toEqual([0]);
  });

  it('calcula valores de cartas numéricas, ações coloridas e curingas', () => {
    expect(cardValue(card('green', '9', 1))).toBe(9);
    expect(cardValue(card('red', 'discardAll', 2))).toBe(20);
    expect(cardValue(card('wild', 'w10', 3))).toBe(50);
  });

  it('concede 250 pontos por adversário eliminado e soma as cartas dos jogadores ativos', () => {
    const room = createRoom(3);
    room.game.hands[0] = [card('red', '3', 1)];
    room.game.hands[1] = [card('wild', 'w10', 2)];
    room.game.hands[2] = [card('green', 'skip', 3)];
    room.game.eliminated = [2];
    endRound(room, 0);
    expect(room.game.points).toBe(303);
    expect(room.scores[0]).toBe(303);
    expect(room.game.phase).toBe('over');
  });
});

describe('prazo do UNO', () => {
  it('aplica a compra de duas cartas somente após 2,5 segundos simulados', () => {
    vi.useFakeTimers();
    try {
      const room = createRoom(3);
      room.game.unoPlayer = 0;
      room.game.unoToken = 7;
      room.game.hands[0] = [card('red', '4', 1)];
      room.game.deck = [card('blue', '6', 2), card('green', '8', 3)];
      const expired = vi.fn(() => resolveUnoPenalty(room, () => 0));

      scheduleUnoPenalty(room, expired);
      vi.advanceTimersByTime(2499);
      expect(expired).not.toHaveBeenCalled();
      expect(room.game.hands[0]).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(expired).toHaveBeenCalledOnce();
      expect(room.game.hands[0]).toHaveLength(3);
      expect(room.game.unoPlayer).toBe(-1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignora o prazo antigo quando o jogador confirma UNO antes de expirar', () => {
    vi.useFakeTimers();
    try {
      const room = createRoom(3);
      room.game.unoPlayer = 0;
      room.game.unoToken = 1;
      const expired = vi.fn();
      scheduleUnoPenalty(room, expired);
      room.game.unoPlayer = -1;
      vi.advanceTimersByTime(2500);
      expect(expired).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('simulação em massa', () => {
  it('conclui 100 partidas determinísticas sem perder cartas ou travar turnos', () => {
    for (let match = 0; match < 100; match++) {
      let seed = match + 1;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      const getRandomInt = (max) => Math.floor(random() * max);
      const room = createRoom(2 + (match % 6));
      deal(room, getRandomInt);

      let turns = 0;
      while (room.game.phase === 'play' && turns < 2000) {
        const game = room.game;
        if (game.challenge?.type === 'roulette') {
          if (game.challenge.color) drawRouletteCard(room, getRandomInt);
          else resolveRoulette(room, ['red', 'yellow', 'green', 'blue'][getRandomInt(4)]);
        }
        else if (game.unoPlayer >= 0) resolveUnoPenalty(room, getRandomInt);
        else moveBot(room, getRandomInt, random);
        turns++;

        const cardsInPlay = game.deck.length + game.discard.length + game.hands.reduce((total, hand) => total + hand.length, 0);
        expect(cardsInPlay, `partida ${match + 1}, turno ${turns}`).toBe(184);
        expect(game.phase !== 'play' || game.current === -1 || !game.eliminated.includes(game.current), `turno ${turns} de jogador eliminado`).toBe(true);
      }
      expect(room.game.phase, `partida ${match + 1} não terminou em 2000 turnos`).toBe('over');
      expect(room.game.winner).toBeGreaterThanOrEqual(0);
      expect(room.game.winner).toBeLessThan(room.seats.length);
      expect(turns).toBeLessThan(2000);
    }
  }, 15_000);
});
