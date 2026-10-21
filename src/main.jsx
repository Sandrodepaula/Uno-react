import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import './style.css';

const COLORS = ['red', 'yellow', 'green', 'blue'];
const COLOR_NAMES = { red: 'Vermelho', yellow: 'Amarelo', green: 'Verde', blue: 'Azul' };
const SYMBOLS = { skip: '⊘', rev: '⇄', '+2': '+2', w: '★', w4: '+4' };
const socket = io();

function Card({ card, back = false, playable = false, onClick, pop = false }) {
  const label = back ? 'Carta fechada' : `${card.color === 'wild' ? 'Coringa' : COLOR_NAMES[card.color]} ${SYMBOLS[card.value] ?? card.value}`;
  const symbol = back ? 'UNO' : (SYMBOLS[card.value] ?? card.value);
  return (
    <div
      className={`card ${back ? 'back' : card.color} ${playable ? 'playable' : ''} ${pop ? 'pop' : ''}`}
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
      <span className="corner top">{symbol}</span>
      <i className="oval"><b>{symbol}</b></i>
      <span className="corner bottom">{symbol}</span>
    </div>
  );
}

function App() {
  const [state, setState] = useState(null);
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingCard, setPendingCard] = useState(null);
  const [showColor, setShowColor] = useState(false);

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
  const myTurn = Boolean(game && game.phase === 'play' && !game.challenge && game.current === state?.players.findIndex((player) => player.id === state.playerId));
  const canPlay = (card) => game && (game.stack ? card.value === '+2' : card.color === 'wild' || card.color === game.color || card.value === game.topCard.value);
  const stuck = myTurn && game.drawn == null && !hand.some(canPlay);
  const send = (event, payload) => socket.emit(event, payload);

  const chooseCard = (card) => {
    if (!myTurn || !canPlay(card) || (game.drawn != null && game.drawn !== card.id)) return;
    if (card.color === 'wild') {
      setPendingCard(card);
      setShowColor(true);
    } else send('game:play', { cardId: card.id });
  };

  const draw = () => {
    if (myTurn && game.drawn == null && (game.stack || !hand.some(canPlay))) send('game:draw');
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
  const champion = game?.winner != null && state.players[game.winner]?.score >= 500;

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>UNO</h1>
        <div className="room-tag">Sala <strong>{state.code}</strong><button className="copy" onClick={() => navigator.clipboard?.writeText(state.code)}>Copiar</button></div>
        <div className="turn">{game?.phase === 'play' ? `${game.direction === 1 ? '↻' : '↺'} ${state.players[game.current]?.name ? `Vez: ${state.players[game.current].name}` : 'Desafio +4'}` : ''}</div>
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
                  <div className="fan" aria-hidden="true">{Array.from({ length: Math.min(player.cardCount, 4) }, (_, i) => <Card key={i} back />)}</div>
                  <strong>{player.name}</strong>
                  <small>{player.cardCount} cartas · {player.score} pts</small>
                </div>
              );
            })}
            <div className="center-table">
              <Card back playable={stuck} onClick={draw} />
              {game?.topCard && <Card card={game.topCard} pop />}
              <span className={`color-indicator ${game?.color}`} title={`Cor atual: ${COLOR_NAMES[game?.color]}`} />
            </div>
            <p className="message" role="status">{game?.message}{myTurn ? stuck ? ' Sua vez: compre uma carta.' : ' Sua vez!' : ''}{state.players.find((player) => player.id === state.playerId)?.bot ? '' : ''}</p>
          </main>
          <div className="action-bar">
            {game?.unoAvailable && <button className="uno-button" onClick={() => send('game:uno')}>UNO!</button>}
            {myTurn && game?.drawn != null && <button onClick={() => send('game:pass')}>Passar a vez</button>}
          </div>
          <section className="hand" aria-label="Suas cartas">
            {hand.map((card) => {
              const playable = myTurn && canPlay(card) && (game.drawn == null || game.drawn === card.id);
              return <Card key={card.id} card={card} playable={playable} onClick={() => chooseCard(card)} />;
            })}
          </section>

          {game?.challenge?.targetId === state.playerId && (
            <div className="overlay">
              <section className="panel">
                <h2>Desafiar o +4?</h2>
                <p>Se quem jogou tinha a cor anterior na mão, essa pessoa compra 4. Se não tinha, você compra 6.</p>
                <div className="lobby-actions">
                  <button className="primary" onClick={() => send('game:challenge', { challenge: true })}>Desafiar</button>
                  <button onClick={() => send('game:challenge', { challenge: false })}>Comprar 4</button>
                </div>
              </section>
            </div>
          )}

          {showColor && (
            <div className="overlay">
              <section className="panel color-panel">
                <h2>Escolha uma cor</h2>
                <div className="color-grid">{COLORS.map((color) => (
                  <button key={color} className={`color-choice ${color}`} onClick={() => {
                    send('game:play', { cardId: pendingCard.id, color });
                    setPendingCard(null);
                    setShowColor(false);
                  }}>{COLOR_NAMES[color]}</button>
                ))}</div>
              </section>
            </div>
          )}

          {game?.phase === 'over' && (
            <div className="overlay">
              <section className="panel">
                <h2>{winner?.name} venceu a rodada! +{game.points} pts</h2>
                {champion && <p>{winner.name} é o campeão (500 pts)!</p>}
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

createRoot(document.getElementById('root')).render(<App />);
