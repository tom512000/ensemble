import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Check, Clock3, Heart, RotateCcw, Sparkles } from 'lucide-react';
import {
  COLOR_META,
  objectWidth,
  type Bin,
  type Bottle,
  type Player,
  type RoomState,
  type SortingState,
} from '@ensemble/shared';
import { Avatar } from '../../components/ui';
import { ObjectArt } from '../../components/ObjectArt';
import { errorMessage, useRealtime } from '../../lib/realtime';
import { useBoardEngine } from './useBoardEngine';

type Engine = ReturnType<typeof useBoardEngine>;

/**
 * Memoised on purpose: a board can hold hundreds of objects, and storing one of them must
 * not re-render the rest. Unchanged objects keep their identity across a bottle:state
 * update, so React skips them entirely.
 */
const GameObject = memo(function GameObject({
  bottle,
  owner,
  isSelf,
  locked,
  engine,
}: {
  bottle: Bottle;
  owner: Player | undefined;
  isSelf: boolean;
  locked: boolean;
  engine: Engine;
}) {
  return (
    <button
      ref={(element) => {
        if (element) engine.bottles.current.set(bottle.id, element);
        else engine.bottles.current.delete(bottle.id);
      }}
      className={'game-bottle' + (bottle.sorted ? ' sorted' : '') + (bottle.lock ? ' held' : '')}
      data-bottle={bottle.id}
      data-color={bottle.color}
      data-sorted={bottle.sorted}
      data-owner={bottle.lock?.playerId ?? ''}
      aria-label={
        COLOR_META[bottle.color].label + ' ' + bottle.id + (bottle.sorted ? ', rangé' : '')
      }
      aria-disabled={bottle.sorted || locked || Boolean(owner && !isSelf)}
      tabIndex={bottle.sorted ? -1 : 0}
      onPointerDown={(event) => engine.grabBottle(event, bottle)}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          engine.keyboardGrab(bottle);
        }
      }}
      style={{ '--owner-color': owner?.color ?? 'transparent' } as CSSProperties}
    >
      <ObjectArt color={bottle.color} shape={bottle.shape} />
      {owner && <span className="bottle-owner">{isSelf ? 'Vous' : owner.nickname}</span>}
      {bottle.sorted && <span className="sorted-spark">✦</span>}
    </button>
  );
});

function Crate({ bin, stored, onDrop }: { bin: Bin; stored: number; onDrop: () => void }) {
  const meta = COLOR_META[bin.color];
  return (
    <button
      className="sorting-bin"
      data-bin={bin.color}
      data-edge={bin.edge}
      aria-label={'Bac ' + meta.label + ', ' + stored + ' rangés'}
      onClick={onDrop}
      style={
        {
          left: bin.x * 100 + '%',
          top: bin.y * 100 + '%',
          width: bin.width * 100 + '%',
          height: bin.height * 100 + '%',
          '--bin-color': meta.hex,
        } as CSSProperties
      }
    >
      <span className="bin-label">
        <i>{meta.symbol}</i>
        {meta.label}
      </span>
      {stored > 0 && <span className="bin-count">{stored}</span>}
      <span className="bin-bottom" />
    </button>
  );
}

function elapsedLabel(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

/**
 * The clock owns its own state. Ticking it inside the board would rebuild every object's
 * element once a second, which is pure waste on a board holding hundreds of them.
 */
function Elapsed({ startedAt, finishedAt }: { startedAt: number; finishedAt: number | null }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (finishedAt !== null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [finishedAt]);
  return <>{elapsedLabel(Math.max(0, (finishedAt ?? now) - startedAt))}</>;
}
export function SortingBoard({ room, game }: { room: RoomState; game: SortingState }) {
  const { session, status, command, notify } = useRealtime();
  const engine = useBoardEngine(room, game);
  const [restarting, setRestarting] = useState(false);
  const sortedCount = game.bottles.filter((b) => b.sorted).length;
  const finished = room.status === 'finished';
  const storedPerColor = useMemo(() => {
    const counts = new Map<string, number>();
    for (const bottle of game.bottles)
      if (bottle.sorted) counts.set(bottle.color, (counts.get(bottle.color) ?? 0) + 1);
    return counts;
  }, [game.bottles]);
  const players = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  return (
    <section className="game-session">
      <div className="game-toolbar">
        <div>
          <p className="eyebrow">LE BONHEUR DE RANGER ENSEMBLE</p>
          <h1>
            Chaque chose <em>à sa place.</em>
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
          <Elapsed startedAt={game.startedAt} finishedAt={game.finishedAt} />
        </div>
      </div>
      <div className="progress-row">
        <span>
          <Sparkles size={16} />
          {sortedCount ? 'Ça prend joliment forme.' : 'Un petit geste après l’autre.'}
        </span>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Bouteilles rangées"
          aria-valuemin={0}
          aria-valuemax={game.bottles.length}
          aria-valuenow={sortedCount}
        >
          <div style={{ width: (sortedCount / game.bottles.length) * 100 + '%' }} />
        </div>
        <strong data-testid="sorted-count">
          {sortedCount}
          <span> / {game.bottles.length} rangées</span>
        </strong>
      </div>
      <div className="board-wrap">
        <div
          className="sorting-board"
          data-testid="sorting-board"
          style={{ '--object-size': objectWidth(game.bottles.length) * 100 + '%' } as CSSProperties}
          ref={engine.boardRef}
          onPointerMove={engine.onPointerMove}
          onPointerLeave={engine.onPointerLeave}
          onPointerUp={engine.onPointerUp}
          onPointerCancel={engine.onPointerCancel}
          onLostPointerCapture={engine.onLostPointerCapture}
        >
          <div className="board-grain" />
          {game.bins.map((bin) => (
            <Crate
              key={bin.color}
              bin={bin}
              stored={storedPerColor.get(bin.color) ?? 0}
              onDrop={() =>
                engine.keyboardDrop({ x: bin.x + bin.width / 2, y: bin.y + bin.height / 2 })
              }
            />
          ))}
          {game.bottles.map((bottle) => {
            const owner = bottle.lock ? players.get(bottle.lock.playerId) : undefined;
            return (
              <GameObject
                key={bottle.id}
                bottle={bottle}
                owner={owner}
                isSelf={owner?.id === session?.id}
                locked={status !== 'connected'}
                engine={engine}
              />
            );
          })}
          {room.players
            .filter((player) => player.id !== session?.id && player.connected)
            .map((player) => (
              <div
                key={player.id}
                className="remote-cursor"
                data-cursor={player.id}
                ref={(element) => {
                  if (element) engine.cursors.current.set(player.id, element);
                  else engine.cursors.current.delete(player.id);
                }}
                style={{ '--cursor-color': player.color } as CSSProperties}
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24">
                  <path d="m3 2 17 12-8 1-4 7Z" />
                </svg>
                <span>{player.nickname}</span>
              </div>
            ))}
          {status !== 'connected' && (
            <div className="board-connection">
              <span className="spin">◌</span>
              <strong>On retrouve la connexion…</strong>
              <p>Votre rangement vous attend.</p>
            </div>
          )}
        </div>
      </div>
      <div className="board-instructions">
        <span>
          <Heart size={15} />
          Glissez chaque bouteille dans le bac de sa couleur.
        </span>
        <span>Clavier : Entrée sur une bouteille, puis sur un bac. Échap pour annuler.</span>
      </div>
      {finished && (
        <div className="victory-panel" role="status">
          <div className="victory-medallion">
            <Check size={35} />
          </div>
          <p className="eyebrow">TOUT EST À SA PLACE</p>
          <h2>
            C’est encore mieux <em>ensemble.</em>
          </h2>
          <p>
            {game.bottles.length} bouteilles, {room.players.length} petites mains à l’œuvre et un
            joli résultat en {elapsedLabel(game.finishedAt! - game.startedAt)}.
          </p>
          <div className="contributions">
            {room.players.map((player) => (
              <div key={player.id}>
                <Avatar player={player} small />
                <span>{player.nickname}</span>
                <strong>
                  {player.sorted} <span>rangées</span>
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
              On remet un peu de bazar ?
            </button>
          ) : (
            <p className="muted">L’hôte peut préparer une nouvelle partie.</p>
          )}
        </div>
      )}
    </section>
  );
}
