// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const { socketMock } = vi.hoisted(() => {
  const listeners = new Map();
  return {
    socketMock: {
      connected: true,
      listeners,
      emitted: [],
      on(event, callback) {
        listeners.set(event, callback);
      },
      off(event) {
        listeners.delete(event);
      },
      emit(...args) {
        this.emitted.push(args);
      },
      dispatch(event, payload) {
        listeners.get(event)?.(payload);
      },
      reset() {
        listeners.clear();
        this.emitted.length = 0;
      },
    },
  };
});

vi.mock('socket.io-client', () => ({ io: () => socketMock }));

import { App } from '../src/main.jsx';

function gameState({ hand = [], game = {}, players = undefined } = {}) {
  const defaultPlayers = [
    { id: 'p0', name: 'Alice', score: 0, cardCount: hand.length, isCurrent: true },
    { id: 'p1', name: 'Beto', score: 0, cardCount: 3, isCurrent: false },
    { id: 'p2', name: 'Caio', score: 0, cardCount: 4, isCurrent: false },
  ];
  return {
    code: 'ABC123',
    phase: 'play',
    hostId: 'p0',
    playerId: 'p0',
    isHost: true,
    players: players ?? defaultPlayers,
    game: {
      phase: 'play',
      current: 0,
      direction: 1,
      color: 'red',
      topCard: { color: 'red', value: '5', id: 50 },
      hand,
      stack: 0,
      stackLast: 0,
      drawn: null,
      challenge: null,
      mercyPending: false,
      mercyAvailable: false,
      message: '',
      ...game,
    },
  };
}

function renderGame(state) {
  render(<App />);
  act(() => socketMock.dispatch('state:update', state));
}

afterEach(() => {
  cleanup();
  socketMock.reset();
});

describe('interface do jogo', () => {
  it('identifica a moeda como Sem Misericórdia e confirma a eliminação ao clicar', () => {
    renderGame(gameState({
      hand: Array.from({ length: 25 }, (_, index) => ({ color: 'red', value: '1', id: index })),
      game: { current: 0, mercyPending: true, mercyAvailable: true },
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Sem Misericórdia' }));

    expect(socketMock.emitted).toContainEqual(['game:mercy:confirm', undefined]);
    expect(screen.getByText('Sem Misericórdia')).toBeTruthy();
  });

  it('cria uma sala pela tela inicial', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Criar sala' }));
    expect(socketMock.emitted).toContainEqual(['room:create', { name: '' }]);
  });

  it('permite escolher a cor ao jogar um curinga', () => {
    renderGame(gameState({ hand: [{ color: 'wild', value: 'w6', id: 12 }] }));

    fireEvent.click(screen.getByRole('button', { name: 'Coringa Comprar 6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Azul' }));

    expect(socketMock.emitted).toContainEqual(['game:play', { cardId: 12, color: 'blue' }]);
  });

  it('permite escolher uma cor ao jogar o Coringa Inverter +8', () => {
    renderGame(gameState({ hand: [{ color: 'wild', value: 'w8rev', id: 18 }] }));

    fireEvent.click(screen.getByRole('button', { name: 'Coringa Inverter Comprar 8' }));
    fireEvent.click(screen.getByRole('button', { name: 'Verde' }));

    expect(socketMock.emitted).toContainEqual(['game:play', { cardId: 18, color: 'green' }]);
  });

  it('permite escolher a cor para o Coringa Comprar até 24', () => {
    renderGame(gameState({ hand: [{ color: 'wild', value: 'draw24', id: 24 }] }));

    fireEvent.click(screen.getByRole('button', { name: 'Coringa Comprar até 24' }));
    fireEvent.click(screen.getByRole('button', { name: 'Azul' }));

    expect(socketMock.emitted).toContainEqual(['game:play', { cardId: 24, color: 'blue' }]);
  });

  it('permite escolher a cor ao jogar Coringa Descartar Tudo', () => {
    renderGame(gameState({
      hand: [
        { color: 'wild', value: 'wildDiscardAll', id: 25 },
        { color: 'yellow', value: '2', id: 26 },
        { color: 'yellow', value: 'skip', id: 27 },
        { color: 'red', value: '4', id: 28 },
      ],
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Coringa Descartar Tudo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Amarelo' }));
    const dialog = screen.getByRole('dialog', { name: 'Descartar cartas' });
    expect(within(dialog).queryByLabelText('Vermelho 4')).toBeNull();
    fireEvent.click(within(dialog).getByLabelText('Amarelo 2'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Descartar selecionadas (1)' }));

    expect(socketMock.emitted).toContainEqual(['game:play', {
      cardId: 25,
      color: 'yellow',
      discardCardIds: [26],
    }]);
  });

  it('joga o Coringa Ataque Final sem pedir escolha de cor', () => {
    renderGame(gameState({ hand: [{ color: 'wild', value: 'attackFinal', id: 31 }] }));

    fireEvent.click(screen.getByRole('button', { name: 'Coringa Ataque Final' }));

    expect(socketMock.emitted).toContainEqual(['game:play', { cardId: 31 }]);
  });

  it('exibe a mão revelada pelo Ataque Final e permite continuar', () => {
    renderGame(gameState({
      game: {
        revealedHand: {
          playerId: 'p1',
          playerName: 'Beto',
          actionCount: 2,
          cards: [
            { color: 'red', value: 'skip', id: 32 },
            { color: 'wild', value: 'w4', id: 33 },
          ],
        },
      },
    }));

    expect(screen.getByRole('heading', { name: 'Beto revelou a mão' })).toBeTruthy();
    expect(screen.getByLabelText('Vermelho Pular')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(socketMock.emitted).toContainEqual(['game:reveal:dismiss', undefined]);
  });

  it('solicita a escolha de outro jogador ao jogar um 7', () => {
    renderGame(gameState({ hand: [{ color: 'red', value: '7', id: 17 }] }));

    fireEvent.click(screen.getByRole('button', { name: 'Vermelho 7' }));
    expect(screen.getByText('Troca 7')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Beto' }));

    expect(socketMock.emitted).toContainEqual(['game:play', { cardId: 17, targetPlayer: 1 }]);
  });

  it('permite selecionar parcialmente cartas da cor ao jogar Descartar Tudo', () => {
    renderGame(gameState({
      hand: [
        { color: 'red', value: 'discardAll', id: 1 },
        { color: 'red', value: '2', id: 2 },
        { color: 'red', value: 'skip', id: 3 },
        { color: 'blue', value: '4', id: 4 },
      ],
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Vermelho Descartar Tudo' }));
    const dialog = screen.getByRole('dialog', { name: 'Descartar cartas' });
    expect(within(dialog).queryByRole('button', { name: 'Azul 4' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vermelho 2' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Descartar selecionadas (1)' }));

    expect(socketMock.emitted).toContainEqual(['game:play', { cardId: 1, discardCardIds: [2] }]);
  });

  it('solicita a cor escolhida pelo alvo da Roleta Colorida', () => {
    renderGame(gameState({
      hand: [{ color: 'wild', value: 'roulette', id: 23 }],
      game: { challenge: { type: 'roulette', targetId: 'p0' }, current: -1 },
    }));

    expect(screen.getByRole('heading', { name: 'Roleta Colorida' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Verde' }));

    expect(socketMock.emitted).toContainEqual(['game:roulette', { color: 'green' }]);
  });

  it('permite ao alvo comprar uma carta por vez na Roleta Colorida', () => {
    renderGame(gameState({
      hand: [{ color: 'wild', value: 'roulette', id: 23 }],
      game: {
        challenge: { type: 'roulette', targetId: 'p0', color: 'green' },
        current: -1,
      },
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Comprar uma carta' }));

    expect(socketMock.emitted).toContainEqual(['game:roulette:draw', undefined]);
  });

  it('desabilita jogadas quando é a vez de outro jogador', () => {
    renderGame(gameState({
      hand: [{ color: 'red', value: '5', id: 50 }],
      game: { current: 1 },
    }));

    expect(screen.queryByRole('button', { name: 'Vermelho 5' })).toBeNull();
    expect(screen.getByText(/Vez: Beto/)).toBeTruthy();
  });

  it('permite comprar do baralho mesmo tendo uma carta jogável', () => {
    renderGame(gameState({ hand: [{ color: 'red', value: '5', id: 50 }] }));

    fireEvent.click(screen.getByRole('button', { name: 'Comprar do baralho' }));

    expect(socketMock.emitted).toContainEqual(['game:draw', undefined]);
  });

  it('só permite passar a vez depois de comprar uma carta', () => {
    const state = gameState({ hand: [{ color: 'red', value: '5', id: 50 }] });
    renderGame(state);

    expect(screen.getByRole('button', { name: 'Passar a vez' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Comprar do baralho' }));

    const purchasedState = {
      ...state,
      game: {
        ...state.game,
        hand: [...state.game.hand, { color: 'blue', value: '9', id: 91 }],
        drawn: 91,
      },
    };
    act(() => socketMock.dispatch('state:update', purchasedState));
    expect(screen.getByRole('button', { name: 'Passar a vez' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Passar a vez' }));

    expect(socketMock.emitted).toContainEqual(['game:pass', undefined]);
  });

  it('mostra o aviso de eliminação em vez da mão do jogador', () => {
    const players = [
      { id: 'p0', name: 'Alice', score: 0, cardCount: 25, isCurrent: false, eliminated: true },
      { id: 'p1', name: 'Beto', score: 0, cardCount: 3, isCurrent: true },
    ];
    renderGame(gameState({
      hand: [{ color: 'red', value: '1', id: 1 }],
      players,
      game: { current: 1 },
    }));

    expect(screen.getByText('Você foi eliminado pela Regra da Misericórdia.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Vermelho 1' })).toBeNull();
  });
});
