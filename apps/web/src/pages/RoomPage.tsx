import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Crown, Leaf, LoaderCircle, LogOut, UsersRound } from 'lucide-react';
import { gameMeta, type RoomSettings, type RoomState } from '@ensemble/shared';
import { errorMessage, useRealtime } from '../lib/realtime';
import { Avatar, CopyInvite, NicknameForm, SettingsFields } from '../components/ui';
import { SortingBoard } from '../games/sorting/SortingBoard';
import { WantedBoard } from '../games/wanted/WantedBoard';

function Lobby({ room }: { room: RoomState }) {
  const { session, command, status } = useRealtime();
  const [settings, setSettings] = useState<RoomSettings>(room.settings);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const host = session?.id === room.hostId;
  // On ne recopie que lorsque les réglages changent réellement, pour ne pas écraser une
  // saisie de l'hôte à chaque room:state (arrivée d'un joueur, etc.).
  const settingsKey = JSON.stringify(room.settings);
  useEffect(() => {
    setSettings(JSON.parse(settingsKey) as RoomSettings);
  }, [settingsKey]);
  const changed = JSON.stringify(settings) !== JSON.stringify(room.settings);
  async function apply(start: boolean) {
    setBusy(true);
    setError('');
    try {
      if (changed) await command({ type: 'room:update', code: room.code, settings });
      if (start) await command({ type: 'game:start', code: room.code });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="lobby-grid">
      <section className="lobby-main">
        <p className="eyebrow">BIENVENUE À LA TABLE</p>
        <h1>On s’installe ?</h1>
        <p className="muted">Invitez vos proches. Le rangement peut attendre encore un peu.</p>
        <CopyInvite code={room.code} gameId={room.gameId} />
        <div className="players-heading">
          <h3>La petite équipe</h3>
          <span>
            {room.playerCount}/{room.settings.maxPlayers} joueurs
          </span>
        </div>
        <div className="player-seats">
          {room.players.map((player) => (
            <div
              className={'player-seat' + (!player.connected ? ' disconnected' : '')}
              key={player.id}
            >
              <Avatar player={player} />
              <div>
                <strong>
                  {player.nickname}
                  {player.id === session?.id ? ' (vous)' : ''}
                </strong>
                <span>{player.connected ? 'Bien installé·e' : 'Reconnexion en cours…'}</span>
              </div>
              {player.id === room.hostId && (
                <span className="host-label">
                  <Crown size={15} />
                  Hôte
                </span>
              )}
            </div>
          ))}
          {Array.from({ length: room.settings.maxPlayers - room.players.length }, (_, i) => (
            <div key={i} className="empty-seat">
              <span>+</span>Une place pour un proche
            </div>
          ))}
        </div>
        <p className="lobby-note">
          <Leaf size={16} />
          Tout le monde joue ensemble. Personne ne perd.
        </p>
      </section>
      <aside className="settings-card">
        <span className="settings-icon">✳</span>
        <p className="eyebrow">LA RECETTE DU BON MOMENT</p>
        <h2>Un peu, beaucoup ?</h2>
        <SettingsFields
          value={settings}
          onChange={setSettings}
          disabled={!host || busy || status !== 'connected'}
          minimumPlayers={Math.max(2, room.playerCount)}
        />
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {host ? (
          <div className="stack">
            {changed && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void apply(false)}
              >
                Enregistrer les réglages
              </button>
            )}
            <button
              className="button"
              disabled={busy || status !== 'connected'}
              onClick={() => void apply(true)}
            >
              {busy ? 'Un instant…' : 'Tout le monde est là, on joue !'}
              <ArrowRight size={17} />
            </button>
            <p className="form-hint">Vous pouvez aussi commencer en solo pour essayer.</p>
          </div>
        ) : (
          <div className="waiting-host">
            <LoaderCircle size={17} className="spin" />
            L’hôte lancera la partie.
          </div>
        )}
      </aside>
    </div>
  );
}
export function RoomPage() {
  const params = useParams<{ code: string; gameId: string }>();
  const code = (params.code ?? '').toUpperCase();
  const gameId = params.gameId ?? 'sorting';
  const { session, status, room, command, clearRoom } = useRealtime();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const joining = useRef('');
  const navigate = useNavigate();
  useEffect(() => {
    if (!session || status !== 'connected' || room?.code === code) return;
    const key = session.id + code + retry;
    if (joining.current === key) return;
    joining.current = key;
    setError('');
    void command({ type: 'room:join', code }).catch((error) => setError(errorMessage(error)));
  }, [session, status, room?.code, code, command, retry]);
  // A round takes over the window: the site header, the footer and the page margins would
  // otherwise eat two thirds of the screen, leaving the board too small to play comfortably.
  const playing = Boolean(room && room.code === code && room.status !== 'lobby');
  useEffect(() => {
    if (!playing) return;
    document.body.dataset.immersive = 'true';
    return () => {
      delete document.body.dataset.immersive;
    };
  }, [playing]);
  async function leave() {
    try {
      if (room?.code === code) await command({ type: 'room:leave', code });
      clearRoom();
      void navigate('/games/sorting');
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  if (!session)
    return (
      <main className="page-container">
        <Link className="back-link" to={'/games/' + gameId}>
          <ArrowLeft size={16} />
          Les tables
        </Link>
        <section className="join-card">
          <span className="join-flower">✳</span>
          <p className="eyebrow">UNE INVITATION À JOUER</p>
          <h1>
            On vous garde
            <br />
            une place.
          </h1>
          <NicknameForm />
        </section>
      </main>
    );
  if (error || !room || room.code !== code)
    return (
      <main className="page-container">
        <div className="empty-state">
          <UsersRound size={36} />
          <h1>{error ? 'Une petite interruption.' : 'On rejoint votre table…'}</h1>
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button
                className="button secondary"
                onClick={() => {
                  setError('');
                  setRetry((r) => r + 1);
                }}
              >
                Réessayer
              </button>
            </>
          ) : (
            <LoaderCircle className="spin" />
          )}
          <Link className="back-link" to={'/games/' + gameId}>
            <ArrowLeft size={16} />
            Voir les tables
          </Link>
        </div>
      </main>
    );
  return (
    <main className={'page-container room-page ' + (playing ? 'in-game' : '')}>
      <div className="room-topline">
        <Link className="back-link" to={'/games/' + room.gameId}>
          {gameMeta(room.gameId).name} <span>/</span>Table {room.code}
        </Link>
        <button
          className="text-button"
          onClick={() => void leave()}
          disabled={status !== 'connected'}
        >
          <LogOut size={15} />
          Quitter la table
        </button>
      </div>
      {room.status === 'lobby' ? (
        <Lobby room={room} />
      ) : room.game?.game === 'wanted' ? (
        <WantedBoard key={room.game.roundId} room={room} game={room.game} />
      ) : room.game?.game === 'sorting' ? (
        <SortingBoard key={room.game.roundId} room={room} game={room.game} />
      ) : null}
    </main>
  );
}
