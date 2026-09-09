import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Clock3, Heart, RotateCcw, Sparkles } from 'lucide-react';
import { COLOR_META, getBins, type RoomState } from '@ensemble/shared';
import { Avatar } from '../../components/ui';
import { BottleArt } from '../../components/BottleArt';
import { errorMessage, useRealtime } from '../../lib/realtime';
import { useBoardEngine } from './useBoardEngine';

function elapsedLabel(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
export function SortingBoard({ room }: { room: RoomState }) {
  const { session, status, command, notify } = useRealtime();
  const engine = useBoardEngine(room);
  const [now, setNow] = useState(Date.now());
  const [restarting, setRestarting] = useState(false);
  const game = room.game!;
  const sortedCount = game.bottles.filter((b) => b.sorted).length;
  const finished = room.status === 'finished';
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
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
          {elapsedLabel(Math.max(0, (game.finishedAt ?? now) - game.startedAt))}
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
          data-dense={game.bottles.length >= 40}
          ref={engine.boardRef}
          onPointerMove={engine.onPointerMove}
          onPointerLeave={engine.onPointerLeave}
          onPointerUp={engine.onPointerUp}
          onPointerCancel={engine.onPointerCancel}
          onLostPointerCapture={engine.onLostPointerCapture}
        >
          <div className="board-grain" />
          {getBins(room.settings.colorCount).map((bin) => (
            <button
              className="sorting-bin"
              key={bin.color}
              data-bin={bin.color}
              aria-label={'Bac ' + COLOR_META[bin.color].label}
              onClick={() =>
                engine.keyboardDrop({ x: bin.x + bin.width / 2, y: bin.y + bin.height / 2 })
              }
              style={
                {
                  left: bin.x * 100 + '%',
                  top: bin.y * 100 + '%',
                  width: bin.width * 100 + '%',
                  height: bin.height * 100 + '%',
                  '--bin-color': COLOR_META[bin.color].hex,
                } as CSSProperties
              }
            >
              <span className="bin-label">
                <i>{COLOR_META[bin.color].symbol}</i>
                {COLOR_META[bin.color].label}
              </span>
              <span className="bin-bottom" />
            </button>
          ))}
          <div className="board-divider">
            <span>UNE COULEUR, UNE PLACE</span>
          </div>
          {game.bottles.map((bottle) => {
            const owner = room.players.find((p) => p.id === bottle.lock?.playerId);
            return (
              <button
                key={bottle.id}
                ref={(element) => {
                  if (element) engine.bottles.current.set(bottle.id, element);
                  else engine.bottles.current.delete(bottle.id);
                }}
                className={
                  'game-bottle' + (bottle.sorted ? ' sorted' : '') + (bottle.lock ? ' held' : '')
                }
                data-bottle={bottle.id}
                data-color={bottle.color}
                data-sorted={bottle.sorted}
                data-owner={bottle.lock?.playerId ?? ''}
                aria-label={
                  'Bouteille ' +
                  COLOR_META[bottle.color].label +
                  ' ' +
                  bottle.id +
                  (bottle.sorted ? ', rangée' : '')
                }
                aria-disabled={
                  bottle.sorted ||
                  status !== 'connected' ||
                  Boolean(owner && owner.id !== session?.id)
                }
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
                <BottleArt color={bottle.color} shape={bottle.shape} />
                {owner && (
                  <span className="bottle-owner">
                    {owner.id === session?.id ? 'Vous' : owner.nickname}
                  </span>
                )}
                {bottle.sorted && <span className="sorted-spark">✦</span>}
              </button>
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
