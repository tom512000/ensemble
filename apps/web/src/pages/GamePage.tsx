import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Heart, Plus, UsersRound } from 'lucide-react';
import {
  DEFAULT_BY_GAME,
  GAME_IDS,
  gameMeta,
  type GameId,
  type RoomSettings,
} from '@ensemble/shared';
import { errorMessage, useRealtime } from '../lib/realtime';
import { Modal, NicknameForm, SettingsFields } from '../components/ui';
import { SortingIllustration } from '../components/ObjectArt';
export function GamePage() {
  const { rooms, session, status, command } = useRealtime();
  const navigate = useNavigate();
  const params = useParams<{ gameId: string }>();
  const gameId = (GAME_IDS as readonly string[]).includes(params.gameId ?? '')
    ? (params.gameId as GameId)
    : null;
  const [createOpen, setCreateOpen] = useState(false);
  const [settings, setSettings] = useState<RoomSettings>(() => ({
    ...DEFAULT_BY_GAME[gameId ?? 'sorting'],
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'lobby' | 'all'>('lobby');
  const meta = gameMeta(gameId ?? 'sorting');
  const sortingRooms = rooms.filter(
    (room) => room.gameId === gameId && (filter === 'all' || room.status === 'lobby'),
  );
  async function create() {
    setBusy(true);
    setError('');
    try {
      const result = await command({ type: 'room:create', gameId: gameId!, settings });
      void navigate('/games/' + gameId + '/rooms/' + result.code);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (!gameId)
    return (
      <main className="page-container">
        <div className="empty-state">
          <h1>Ce jeu n’existe pas.</h1>
          <p>Il est peut-être encore en préparation.</p>
          <Link className="button secondary" to="/">
            Voir la collection
          </Link>
        </div>
      </main>
    );
  return (
    <main className="page-container">
      <Link className="back-link" to="/">
        <ArrowLeft size={16} />
        La collection
      </Link>
      <section className="game-intro">
        <div>
          <p className="eyebrow">{meta.tagline}</p>
          <h1>
            {meta.name}
            <span className="accent-dot">.</span>
          </h1>
          <p>{meta.description}</p>
          <div className="game-tags">
            <span>
              <UsersRound size={16} />
              2–8 joueurs
            </span>
            <span>
              <Heart size={16} />
              Coopératif
            </span>
            <span>À votre rythme</span>
          </div>
          <button className="button" onClick={() => setCreateOpen(true)}>
            <Plus size={18} />
            Créer une partie
          </button>
        </div>
        <SortingIllustration mini />
      </section>
      <section className="rooms-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">UNE PLACE VOUS ATTEND</p>
            <h2>Les tables de jeu</h2>
          </div>
          <div className="segmented">
            <button
              className={filter === 'lobby' ? 'active' : ''}
              onClick={() => setFilter('lobby')}
            >
              Ouvertes
            </button>
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              Toutes
            </button>
          </div>
        </div>
        {sortingRooms.length ? (
          <div className="room-list">
            {sortingRooms.map((room) => (
              <article className="room-row" key={room.id}>
                <div className="table-icon">
                  <UsersRound size={23} />
                </div>
                <div className="room-row-title">
                  <h3>La table de {room.hostName}</h3>
                  <p>
                    {room.settings.game === 'wanted'
                      ? room.settings.levels +
                        ' niveaux · ' +
                        room.settings.startHeads +
                        ' têtes au départ'
                      : room.settings.bottleCount +
                        ' objets · ' +
                        room.settings.colorCount +
                        ' couleurs'}{' '}
                    · {room.code}
                  </p>
                </div>
                <span className={'status-chip ' + room.status}>
                  {room.status === 'lobby'
                    ? 'On s’installe'
                    : room.status === 'playing'
                      ? 'On range !'
                      : 'Bien rangé'}
                </span>
                <span className="room-capacity">
                  <UsersRound size={16} />
                  {room.playerCount}/{room.settings.maxPlayers}
                </span>
                {room.status === 'lobby' && room.playerCount < room.settings.maxPlayers ? (
                  <Link
                    className="button secondary compact"
                    to={'/games/' + room.gameId + '/rooms/' + room.code}
                  >
                    Rejoindre <ArrowRight size={16} />
                  </Link>
                ) : (
                  <span className="unavailable-label">
                    {room.status === 'lobby'
                      ? 'Complète'
                      : room.status === 'playing'
                        ? 'En cours'
                        : 'Terminée'}
                  </span>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <UsersRound size={30} />
            </div>
            <h3>La première table pourrait être la vôtre.</h3>
            <p>Installez-vous, invitez vos proches… et laissez le jeu commencer.</p>
            <button className="button secondary" onClick={() => setCreateOpen(true)}>
              <Plus size={17} />
              Ouvrir une table
            </button>
          </div>
        )}
        <p className="rooms-footnote">
          <span className={'presence-dot ' + (status === 'connected' ? 'online' : '')} />
          {session
            ? status === 'connected'
              ? 'Les tables se mettent à jour en direct.'
              : 'Connexion au serveur en cours…'
            : 'Choisissez un pseudo pour rejoindre la partie.'}
        </p>
      </section>
      {createOpen && (
        <Modal
          title={session ? 'Votre petite table.' : 'Avant de s’installer…'}
          onClose={() => setCreateOpen(false)}
        >
          {session ? (
            <div className="stack">
              <p className="muted">Quelques bouteilles, vos proches, et le temps devant vous.</p>
              <SettingsFields value={settings} onChange={setSettings} />
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <button
                className="button"
                disabled={busy || status !== 'connected'}
                onClick={() => void create()}
              >
                {busy
                  ? 'On prépare la table…'
                  : status !== 'connected'
                    ? 'Connexion…'
                    : 'Créer la partie'}
                <ArrowRight size={18} />
              </button>
              <p className="form-hint">Vous pourrez partager le lien depuis le lobby.</p>
            </div>
          ) : (
            <NicknameForm />
          )}
        </Modal>
      )}
    </main>
  );
}
