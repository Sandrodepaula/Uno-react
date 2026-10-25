import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import './style.css';

const COLORS = ['red', 'yellow', 'green', 'blue'];
const COLOR_NAMES = { red: 'Vermelho', yellow: 'Amarelo', green: 'Verde', blue: 'Azul' };
const SYMBOLS = { skip: '⊘', rev: '⇄', '+2': '+2', discardAll: 'D', wildDiscardAll: 'D', skipAll: '⊘ALL', w: '★', w4: '+4', w6: '+6', w8rev: '⇄', w10: '+10', roulette: 'R', draw24: '24', attackFinal: '+' };
const CARD_NAMES = { skip: 'Pular', rev: 'Inverter', '+2': 'Comprar 2', discardAll: 'Descartar Tudo', wildDiscardAll: 'Descartar Tudo', skipAll: 'Pular Todos', w4: 'Inverter Comprar 4', w6: 'Comprar 6', w8rev: 'Inverter Comprar 8', w10: 'Comprar 10', roulette: 'Roleta Colorida', draw24: 'Comprar até 24', attackFinal: 'Ataque Final' };
const DRAW_VALUES = { '+2': 2, w4: 4, w6: 6, w8rev: 8, w10: 10 };
const socket = io();

export function Card({ card, back = false, playable = false, selected = false, onClick, pop = false }) {
  const label = back ? (playable ? 'Comprar do baralho' : 'Carta fechada') : `${card.color === 'wild' ? 'Coringa' : COLOR_NAMES[card.color]} ${CARD_NAMES[card.value] ?? card.value}`;
  const symbol = back ? 'UNO' : (SYMBOLS[card.value] ?? card.value);
  const draw8Reverse = !back && card.value === 'w8rev';
  const draw24 = !back && card.value === 'draw24';
  const wildDiscardAll = !back && card.value === 'wildDiscardAll';
  const eyeIcon = <span className="eye-icon"><span className="eye"><b /></span>{Array.from({ length: 6 }, (_, index) => <s key={index} />)}</span>;
  const spreadIcon = <span className="spread">{Array.from({ length: 4 }, (_, index) => <s key={index} />)}</span>;
  const discardPile = <u>{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</u>;
  return (
    <div
      className={`card ${back ? 'back' : card.color} ${!back && card.value === 'attackFinal' ? 'attack-final' : ''} ${draw8Reverse ? 'draw8-reverse' : ''} ${draw24 ? 'draw24' : ''} ${wildDiscardAll ? 'discard-all' : ''} ${playable ? 'playable' : ''} ${selected ? 'selected' : ''} ${pop ? 'pop' : ''}`}
      role={playable ? 'button' : undefined}
      tabIndex={playable ? 0 : undefined}
      aria-label={label}
      onClick={playable ? onClick : undefined}
      onKeyDown={playable ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <span className="corner top">
        {draw8Reverse ? <><em>⇄</em><strong>+8</strong></> : draw24 ? eyeIcon : wildDiscardAll ? <>{spreadIcon}<em /></> : symbol}
      </span>
      <i className="oval">
        <b>
          {draw8Reverse ? Array.from({ length: 7 }, (_, index) => <i key={index} />)
            : draw24 ? eyeIcon
              : wildDiscardAll ? <>{spreadIcon}<em />{discardPile}</>
                : symbol}
        </b>
      </i>
      <span className="corner bottom">
        {draw8Reverse ? <><em>⇄</em><strong>+8</strong></> : draw24 ? eyeIcon : wildDiscardAll ? <>{spreadIcon}<em /></> : symbol}
      </span>
    </div>
  );
}

export function App() {
  const [state, setState] = useState(null);
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingCard, setPendingCard] = useState(null);
  const [showColor, setShowColor] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [selectedDiscardIds, setSelectedDiscardIds] = useState([]);
  const [selectedDiscardColor, setSelectedDiscardColor] = useState(null);

  useEffect(() => {
    const onUpdate = (next) => { setState(next); setNotice(''); };
    const onError = (message) => setNotice(message);
    const onLeft = () => { setState(null); setNotice('Você saiu da sala.'); };
    socket.on('state:update', onUpdate);
    socket.on('game:error', onError);
    socket.on('room:left', onLeft);
    return () => {
      socket.off('state:update', onUpdate);
      socket.off('game:error', onError);
      socket.off('room:left', onLeft);
    };
  }, []);

  const game = state?.game;
  const hand = game?.hand ?? [];
  const myTurn = Boolean(game && game.phase === 'play' && !game.challenge && !game.mercyPending && game.current === state?.players.findIndex((player) => player.id === state.playerId));
  const drawnCard = hand.find((card) => card.id === game?.drawn);
  const isEliminated = Boolean(state?.players.find((player) => player.id === state.playerId)?.eliminated);
  const canPlay = (card) => game && (game.stack ? (DRAW_VALUES[card.value] ?? 0) >= game.stackLast : card.color === 'wild' || card.color === game.color || card.value === game.topCard.value);
  const drawnCardPlayable = Boolean(drawnCard && canPlay(drawnCard));
  const stuck = myTurn && game.drawn == null && !hand.some(canPlay);
  const send = (event, payload) => socket.emit(event, payload);

  const chooseCard = (card) => {
    if (!myTurn || !canPlay(card) || (game.drawn != null && game.drawn !== card.id)) return;
    if (card.value === '7') {
      setPendingCard(card);
      setShowSwap(true);
    } else if (card.value === 'discardAll') {
      setPendingCard(card);
      setSelectedDiscardIds([]);
      setSelectedDiscardColor(card.color);
      setShowDiscard(true);
    } else if (card.color === 'wild' && !['roulette', 'attackFinal'].includes(card.value)) {
      setPendingCard(card);
      setShowColor(true);
    } else send('game:play', { cardId: card.id });
  };

  const draw = () => {
    if (myTurn && game.drawn == null) send('game:draw');
  };

  if (!state) {
    return (
      <div className="overlay lobby">
        <section className="panel">
          <h1>UNO</h1>
          <p>Entre em uma sala ou crie uma para jogar com seus amigos.</p>
          <label htmlFor="nickname">Seu nome</label>
          <input id="nickname" maxLength="14" placeholder="Jogador" value={name} onChange={(event) => setName(event.target.value)} />
          <button className="primary" onClick={() => send('room:create', { name })}>Criar sala</button>
          <div className="join-row">
            <input aria-label="Código da sala" maxLength="6" placeholder="Código da sala" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} />
            <button onClick={() => send('room:join', { code: roomCode, name })} disabled={roomCode.trim().length !== 6}>Entrar</button>
          </div>
          {notice && <p className="notice" role="alert">{notice}</p>}
          {!socket.connected && <p className="muted">Conectando ao servidor...</p>}
        </section>
      </div>
    );
  }

  const isLobby = state.phase === 'lobby';
  const opponents = state.players.filter((player) => player.id !== state.playerId);
  const winner = game?.winner == null ? null : state.players[game.winner];
  const champion = game?.winner != null && state.players[game.winner]?.score >= 1000;

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>UNO</h1>
        <div className="room-tag">Sala <strong>{state.code}</strong><button className="copy" onClick={() => navigator.clipboard?.writeText(state.code)}>Copiar</button></div>
        <div className="turn">{game?.phase === 'play' ? game.challenge ? 'Roleta Colorida' : `${game.direction === 1 ? '↻' : '↺'} ${state.players[game.current]?.name ? `Vez: ${state.players[game.current].name}` : ''}` : ''}</div>
        {state.isHost && !isLobby && <button className="quit" onClick={() => send('room:close-game')}>Encerrar partida</button>}
      </header>

      {isLobby ? (
        <main className="overlay">
          <section className="panel">
            <h2>Sala de espera</h2>
            <p>Compartilhe o código <strong>{state.code}</strong> para convidar outras pessoas.</p>
            <ul className="player-list">
              {state.players.map((player) => (
                <li key={player.id}>
                  <span>{player.name}{player.id === state.hostId ? ' (anfitrião)' : ''}{player.bot ? ' 🤖' : ''}</span>
                  {state.isHost && player.bot && <button className="remove" aria-label={`Remover ${player.name}`} onClick={() => send('room:remove-bot', { id: player.id })}>×</button>}
                </li>
              ))}
            </ul>
            <div className="lobby-actions">
              {state.isHost && state.players.length < 7 && <button onClick={() => send('room:add-bot')}>Adicionar bot</button>}
              {state.isHost && <button className="primary" disabled={state.players.length < 2} onClick={() => send('room:start')}>Iniciar partida</button>}
              {!state.isHost && <span className="muted">Aguardando o anfitrião iniciar...</span>}
              <button className="secondary" onClick={() => send('room:leave')}>Sair da sala</button>
            </div>
            <p className="muted">{state.players.length}/7 jogadores{state.players.length < 2 && state.isHost ? ' · Adicione um bot ou espere alguém entrar' : ''}</p>
            {state.notice && <p className="notice" role="status">{state.notice}</p>}
            {notice && <p className="notice" role="alert">{notice}</p>}
          </section>
        </main>
      ) : (
        <>
          <main className="table-area">
            {opponents.map((player, index) => {
              const angle = Math.PI * (index + 1) / (opponents.length + 1);
              return (
                <div className={`opponent ${player.isCurrent && game.phase === 'play' ? 'active' : ''}`} key={player.id}
                  style={{ left: `${50 - 38 * Math.cos(angle)}%`, top: `${54 - 44 * Math.sin(angle)}%` }}>
                  {!player.eliminated && <div className="fan" aria-hidden="true">{Array.from({ length: Math.min(player.cardCount, 4) }, (_, i) => <Card key={i} back />)}</div>}
                  <strong>{player.name}{player.eliminated ? ' · Eliminado' : ''}</strong>
                  <small>{player.eliminated ? 'Regra da Misericórdia' : `${player.cardCount} cartas · ${player.score} pts`}</small>
                </div>
              );
            })}
            <div className="center-table">
              <Card back playable={myTurn && game.drawn == null} onClick={draw} />
              {game?.topCard && <Card card={game.topCard} pop />}
              <span className={`color-indicator ${game?.color}`} title={`Cor atual: ${COLOR_NAMES[game?.color]}`} />
            </div>
            <p className="message" role="status">{game?.message}{myTurn ? game.drawn != null ? drawnCardPlayable ? ' Sua vez: jogue a carta comprada ou passe.' : ' Sua vez: a carta comprada não é jogável; passe a vez.' : stuck ? ' Sua vez: compre uma carta.' : ' Sua vez: jogue uma carta ou compre do baralho.' : ''}{state.players.find((player) => player.id === state.playerId)?.bot ? '' : ''}</p>
          </main>
          <div className="action-bar">
            {game?.unoAvailable && <button className="uno-button" onClick={() => send('game:uno')}>UNO!</button>}
            {game?.mercyAvailable && (
              <button className="coin mercy playable" aria-label="Confirmar eliminação pela Regra da Misericórdia" title="Confirmar eliminação pela Regra da Misericórdia" onClick={() => send('game:mercy:confirm')}>
                <span className="logo">UNO</span>
                <span className="mask">
                  <i className="eye left" />
                  <i className="eye right" />
                  <span className="mouth"><b>7</b></span>
                </span>
              </button>
            )}
            {myTurn && (
              <button disabled={game.drawn == null} onClick={() => send('game:pass')}>Passar a vez</button>
            )}
          </div>
          <section className="hand" aria-label="Suas cartas">
            {isEliminated ? <p className="eliminated-message">Você foi eliminado pela Regra da Misericórdia.</p> : hand.map((card) => {
              const playable = myTurn && canPlay(card) && (game.drawn == null || game.drawn === card.id);
              return <Card key={card.id} card={card} playable={playable} onClick={() => chooseCard(card)} />;
            })}
          </section>

          {game?.phase === 'play' && game.revealedHand && (
            <div className="overlay">
              <section className="panel reveal-panel" role="dialog" aria-modal="true" aria-labelledby="revealed-hand-title">
                <h2 id="revealed-hand-title">{game.revealedHand.playerName} revelou a mão</h2>
                <p>
                  O alvo comprou {game.revealedHand.actionCount} carta{game.revealedHand.actionCount === 1 ? '' : 's'}
                  {game.revealedHand.actionCount >= 7 ? ' e foi eliminado.' : ' e perdeu a vez.'}
                </p>
                <div className="hand revealed-hand" aria-label="Mão revelada">
                  {game.revealedHand.cards.map((card) => <Card key={card.id} card={card} />)}
                </div>
                <button className="primary" onClick={() => send('game:reveal:dismiss')}>Continuar</button>
              </section>
            </div>
          )}

          {game?.challenge?.type === 'roulette' && game.challenge.targetId === state.playerId && (
            <div className="overlay">
              <section className="panel">
                <h2>Roleta Colorida</h2>
                {game.challenge.color ? (
                  <>
                    <p>Compre uma carta por vez até encontrar uma carta {COLOR_NAMES[game.challenge.color].toLowerCase()}. Você ficará com todas e perderá a vez.</p>
                    <button className="primary" onClick={() => send('game:roulette:draw')}>Comprar uma carta</button>
                  </>
                ) : (
                  <>
                    <p>Escolha uma cor. Depois, compre as cartas uma por uma até encontrar uma dessa cor.</p>
                    <div className="color-grid">{COLORS.map((color) => (
                      <button key={color} className={`color-choice ${color}`} onClick={() => send('game:roulette', { color })}>{COLOR_NAMES[color]}</button>
                    ))}</div>
                  </>
                )}
              </section>
            </div>
          )}

          {showColor && (
            <div className="overlay">
              <section className="panel color-panel">
                <h2>Escolha uma cor</h2>
                <div className="color-grid">{COLORS.map((color) => (
                  <button key={color} className={`color-choice ${color}`} onClick={() => {
                    setShowColor(false);
                    if (pendingCard.value === 'wildDiscardAll') {
                      setSelectedDiscardColor(color);
                      setSelectedDiscardIds([]);
                      setShowDiscard(true);
                    } else {
                      send('game:play', { cardId: pendingCard.id, color });
                      setPendingCard(null);
                    }
                  }}>{COLOR_NAMES[color]}</button>
                ))}</div>
              </section>
            </div>
          )}

          {showSwap && pendingCard && (
            <div className="overlay">
              <section className="panel">
                <h2>Troca 7</h2>
                <p>Escolha outro jogador para trocar todas as cartas da mão.</p>
                <div className="lobby-actions">
                  {state.players.map((player, index) => (
                    player.id !== state.playerId && !player.eliminated && (
                      <button key={player.id} onClick={() => {
                        send('game:play', { cardId: pendingCard.id, targetPlayer: index });
                        setPendingCard(null);
                        setShowSwap(false);
                      }}>{player.name}</button>
                    )
                  ))}
                </div>
              </section>
            </div>
          )}

          {showDiscard && pendingCard && (
            <div className="overlay">
              <section className="panel" role="dialog" aria-modal="true" aria-labelledby="discard-dialog-title">
                <h2 id="discard-dialog-title">Descartar cartas</h2>
                <p>Selecione as cartas {COLOR_NAMES[selectedDiscardColor].toLowerCase()} que deseja descartar.</p>
                <div className="hand discard-selection" aria-label="Cartas disponíveis para descarte">
                  {hand.filter((card) => card.id !== pendingCard.id && card.color === selectedDiscardColor).map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      playable
                      selected={selectedDiscardIds.includes(card.id)}
                      onClick={() => setSelectedDiscardIds((selected) => selected.includes(card.id)
                        ? selected.filter((id) => id !== card.id)
                        : [...selected, card.id])}
                    />
                  ))}
                </div>
                <div className="lobby-actions">
                  <button
                    className="primary"
                    disabled={hand.some((card) => card.id !== pendingCard.id && card.color === selectedDiscardColor) && selectedDiscardIds.length === 0}
                    onClick={() => {
                      send('game:play', {
                        cardId: pendingCard.id,
                        ...(pendingCard.value === 'wildDiscardAll' ? { color: selectedDiscardColor } : {}),
                        discardCardIds: selectedDiscardIds,
                      });
                      setPendingCard(null);
                      setSelectedDiscardIds([]);
                      setSelectedDiscardColor(null);
                      setShowDiscard(false);
                    }}
                  >Descartar selecionadas ({selectedDiscardIds.length})</button>
                  <button className="secondary" onClick={() => {
                    setPendingCard(null);
                    setSelectedDiscardIds([]);
                    setSelectedDiscardColor(null);
                    setShowDiscard(false);
                  }}>Cancelar</button>
                </div>
              </section>
            </div>
          )}

          {game?.phase === 'over' && (
            <div className="overlay">
              <section className="panel">
                <h2>{winner?.name} venceu a rodada! +{game.points} pts</h2>
                {champion && <p>{winner.name} é o campeão (1000 pts)!</p>}
                <p>{state.players.map((player) => `${player.name}: ${player.score}`).join(' | ')}</p>
                {state.isHost && <button className="primary" onClick={() => send('room:next-round')}>{champion ? 'Nova partida' : 'Próxima rodada'}</button>}
              </section>
            </div>
          )}
          {notice && <div className="toast" role="alert">{notice}</div>}
        </>
      )}
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
