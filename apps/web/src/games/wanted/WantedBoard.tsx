import { memo, useEffect, useState, type CSSProperties } from 'react';
import { Check, Clock3, Eye, RotateCcw, Sparkles } from 'lucide-react';
import { headWidth, type RoomState, type WantedHead, type WantedState } from '@ensemble/shared';
import { Avatar } from '../../components/ui';
import { HeadArt } from '../../components/HeadArt';
import { errorMessage, useRealtime } from '../../lib/realtime';

function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** Mémoïsé : une foule peut compter plus de cent têtes, et une désignation ne doit pas
 *  toutes les redessiner. */
const Head = memo(function Head({
  head,
  disabled,
  onPick,
}: {
  head: WantedHead;
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      className="crowd-head"
      data-head={head.id}
      aria-label={'Tête ' + head.id}
      disabled={disabled}
      onClick={() => onPick(head.id)}
      style={
        {
          left: head.position.x * 100 + '%',
          top: head.position.y * 100 + '%',
          '--tilt': head.tilt.toFixed(2) + 'deg',
        } as CSSProperties
      }
    >
      <HeadArt look={head.look} />
    </button>
  );
});

export function WantedBoard({ room, game }: { room: RoomState; game: WantedState }) {
  const { session, status, command, notify } = useRealtime();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const finished = room.status === 'finished';
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // Un mauvais choix ne bloque pas : il se signale et s'efface.
  useEffect(() => {
    if (!wrong) return;
    const t = setTimeout(() => setWrong(null), 600);
    return () => clearTimeout(t);
  }, [wrong]);

  async function pick(headId: string) {
    if (busy || finished || status !== 'connected') return;
    setBusy(true);
    try {
      await command({ type: 'wanted:pick', code: room.code, roundId: game.roundId, headId });
    } catch (error) {
      setWrong(headId);
      notify(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const mine = game.misses[session?.id ?? ''] ?? 0;
  return (
    <section className="game-session wanted-session">
      <div className="game-toolbar">
        <div>
          <p className="eyebrow">TROUVEZ CELLE QUI EST SEULE</p>
          <h1>
            Niveau <em>{game.level}</em> sur {game.levels}
          </h1>
        </div>
        <div className="game-team">
          {room.players.map((player) => (
            <span className={!player.connected ? 'disconnected' : ''} key={player.id}>
              <Avatar player={player} small />
            </span>
          ))}
        </div>
        <div className="game-timer">
          <Clock3 size={16} />
          {elapsed((game.finishedAt ?? now) - game.startedAt)}
        </div>
      </div>
      <div className="progress-row">
        <span>
          <Eye size={16} />
          {game.heads.length} têtes · une seule n’a pas de jumelle
        </span>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Niveaux franchis"
          aria-valuemin={0}
          aria-valuemax={game.levels}
          aria-valuenow={game.level - 1}
        >
          <div style={{ width: ((game.level - 1) / game.levels) * 100 + '%' }} />
        </div>
        <strong data-testid="wanted-level">
          {game.level}
          <span> / {game.levels}</span>
        </strong>
      </div>
      <div className="board-wrap">
        <div
          className="crowd-board"
          data-testid="crowd-board"
          data-level={game.level}
          style={{ '--head-size': headWidth(game.heads.length) * 100 + '%' } as CSSProperties}
        >
          <div className="board-grain" />
          {game.heads.map((head) => (
            <Head
              key={head.id}
              head={head}
              disabled={finished || status !== 'connected'}
              onPick={(id) => void pick(id)}
            />
          ))}
          {wrong && <span className="crowd-miss">Pas celle-là…</span>}
          {status !== 'connected' && (
            <div className="board-connection">
              <span className="spin">◌</span>
              <strong>On retrouve la connexion…</strong>
            </div>
          )}
        </div>
      </div>
      <div className="board-instructions">
        <span>
          <Sparkles size={15} />
          Cliquez la tête qui n’a pas de jumelle.
        </span>
        <span>
          {mine
            ? mine + ' essai' + (mine > 1 ? 's' : '') + ' manqué' + (mine > 1 ? 's' : '')
            : 'Aucun faux pas.'}
        </span>
      </div>
      {finished && (
        <div className="victory-panel" role="status">
          <div className="victory-medallion">
            <Check size={35} />
          </div>
          <p className="eyebrow">PLUS RIEN NE VOUS ÉCHAPPE</p>
          <h2>
            Tous les niveaux, <em>ensemble.</em>
          </h2>
          <p>
            {game.levels} niveaux franchis en {elapsed((game.finishedAt ?? now) - game.startedAt)}.
          </p>
          <div className="contributions">
            {room.players.map((player) => (
              <div key={player.id}>
                <Avatar player={player} small />
                <span>{player.nickname}</span>
                <strong>
                  {player.sorted} <span>trouvées</span>
                </strong>
              </div>
            ))}
          </div>
          {room.hostId === session?.id ? (
            <button
              className="button"
              disabled={restarting || status !== 'connected'}
              onClick={() => {
                setRestarting(true);
                void command({ type: 'game:restart', code: room.code })
                  .catch((error) => notify(errorMessage(error)))
                  .finally(() => setRestarting(false));
              }}
            >
              <RotateCcw size={17} />
              On recommence ?
            </button>
          ) : (
            <p className="muted">L’hôte peut relancer une partie.</p>
          )}
        </div>
      )}
    </section>
  );
}
