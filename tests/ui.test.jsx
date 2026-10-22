// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

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

  it('solicita a escolha de outro jogador ao jogar um 7', () => {
    renderGame(gameState({ hand: [{ color: 'red', value: '7', id: 17 }] }));

    fireEvent.click(screen.getByRole('button', { name: 'Vermelho 7' }));
    expect(screen.getByText('Troca 7')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Beto' }));

    expect(socketMock.emitted).toContainEqual(['game:play', { cardId: 17, targetPlayer: 1 }]);
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

  it('desabilita jogadas quando é a vez de outro jogador', () => {
    renderGame(gameState({
      hand: [{ color: 'red', value: '5', id: 50 }],
      game: { current: 1 },
    }));

    expect(screen.queryByRole('button', { name: 'Vermelho 5' })).toBeNull();
    expect(screen.getByText(/Vez: Beto/)).toBeTruthy();
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
