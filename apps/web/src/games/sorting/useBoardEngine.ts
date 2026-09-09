import { createId } from '../../lib/id';
import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  NETWORK_INTERVAL_MS,
  type Bottle,
  type Point,
  type RemoteMotion,
  type RoomState,
} from '@ensemble/shared';
import { errorMessage, useRealtime } from '../../lib/realtime';

interface Drag {
  bottleId: string;
  dragId: string;
  position: Point;
  offset: Point;
  pointerId: number | null;
  granted: boolean;
  ended: boolean;
  cancelled: boolean;
  finishing: boolean;
}
interface AnimatedPoint {
  current: Point;
  target: Point;
}
interface BottleAnimation extends AnimatedPoint {
  /** Eased separately from the position so straightening up reads as its own gesture. */
  tilt: number;
  /** Last values pushed to the DOM, so a settled object costs nothing per frame. */
  written: string;
  layer: string;
  dragging: string;
}
interface CursorPoint extends AnimatedPoint {
  seenAt: number;
  visible: boolean;
}
const clamp = (value: number) => Math.min(1, Math.max(0, value));
export function useBoardEngine(room: RoomState) {
  const { socket, session, status, command, notify } = useRealtime();
  const boardRef = useRef<HTMLDivElement>(null);
  const bottles = useRef(new Map<string, HTMLButtonElement>());
  const cursors = useRef(new Map<string, HTMLDivElement>());
  const targets = useRef(new Map<string, BottleAnimation>());
  const remoteCursors = useRef(new Map<string, CursorPoint>());
  const currentRoom = useRef(room);
  const drag = useRef<Drag | null>(null);
  const pointer = useRef<Point | null>(null);
  /**
   * The board's box, cached. Reading it during a pointer move would force the browser to
   * lay out every object again, right after the animation frame moved them: the pointer
   * fires often enough that this alone stalled a busy board.
   */
  const size = useRef({ width: 0, height: 0, left: 0, top: 0 });
  const sequence = useRef(0);
  const enabled = useRef(status === 'connected' && room.status === 'playing');
  const lastBottleStates = useRef(new Map<string, Bottle>());
  // Looked up every frame for every object: this must never become a linear scan.
  const byId = useRef(new Map<string, Bottle>());
  useEffect(() => {
    currentRoom.current = room;
    enabled.current = status === 'connected' && room.status === 'playing';
    byId.current = new Map(room.game!.bottles.map((bottle) => [bottle.id, bottle]));
    for (const bottle of room.game!.bottles) {
      const previous = lastBottleStates.current.get(bottle.id);
      const existing = targets.current.get(bottle.id);
      if (!existing)
        targets.current.set(bottle.id, {
          current: { ...bottle.position },
          target: { ...bottle.position },
          tilt: bottle.tilt,
          written: '',
          layer: '',
          dragging: '',
        });
      else if (!bottle.lock || previous?.lock?.dragId !== bottle.lock.dragId)
        existing.target = { ...bottle.position };
      const active = drag.current;
      if (
        active?.bottleId === bottle.id &&
        active.granted &&
        !active.ended &&
        previous?.lock?.dragId === active.dragId &&
        bottle.lock?.dragId !== active.dragId
      ) {
        drag.current = null;
        notify('La prise a été libérée. Vous pouvez reprendre la bouteille.');
      }
      lastBottleStates.current.set(bottle.id, bottle);
    }
    if (!enabled.current) drag.current = null;
    for (const id of remoteCursors.current.keys()) {
      if (!room.players.some((player) => player.id === id && player.connected))
        remoteCursors.current.delete(id);
    }
  }, [room, status, notify]);
  function pointAt(clientX: number, clientY: number): Point {
    const rect = size.current;
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: clamp((clientX - rect.left) / rect.width),
      y: clamp((clientY - rect.top) / rect.height),
    };
  }
  function reconcile(id: string) {
    const bottle = currentRoom.current.game!.bottles.find((b) => b.id === id);
    const target = targets.current.get(id);
    if (bottle && target) target.target = { ...bottle.position };
  }
  async function finish(active: Drag) {
    if (!active.granted || active.finishing) return;
    active.finishing = true;
    try {
      const common = {
        code: currentRoom.current.code,
        roundId: currentRoom.current.game!.roundId,
        bottleId: active.bottleId,
        dragId: active.dragId,
      };
      await command(
        active.cancelled
          ? { ...common, type: 'bottle:cancel' }
          : { ...common, type: 'bottle:release', position: active.position },
      );
    } catch (error) {
      notify(errorMessage(error));
      if (socket?.connected)
        void command({ type: 'room:sync', code: currentRoom.current.code }).catch(() => {});
    } finally {
      if (drag.current === active) drag.current = null;
      reconcile(active.bottleId);
    }
  }
  async function begin(bottle: Bottle, position: Point, pointerId: number | null) {
    if (
      !enabled.current ||
      drag.current ||
      bottle.sorted ||
      (bottle.lock && bottle.lock.playerId !== session?.id)
    )
      return;
    const active: Drag = {
      bottleId: bottle.id,
      dragId: createId(),
      position: { ...bottle.position },
      offset: { x: bottle.position.x - position.x, y: bottle.position.y - position.y },
      pointerId,
      granted: false,
      ended: false,
      cancelled: false,
      finishing: false,
    };
    drag.current = active;
    try {
      await command({
        type: 'bottle:grab',
        code: room.code,
        roundId: room.game!.roundId,
        bottleId: bottle.id,
        dragId: active.dragId,
      });
      active.granted = true;
      if (active.ended || drag.current !== active) {
        active.cancelled ||= drag.current !== active;
        void finish(active);
      }
    } catch (error) {
      if (drag.current === active) drag.current = null;
      reconcile(bottle.id);
      notify(errorMessage(error));
    }
  }
  const cancelRef = useRef<() => void>(() => {});
  cancelRef.current = () => {
    const active = drag.current;
    if (!active) return;
    active.cancelled = true;
    active.ended = true;
    void finish(active);
  };
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    // One read here, never during a pointer move.
    const measure = () => {
      const rect = board.getBoundingClientRect();
      size.current = {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
      };
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    // Scrolling moves the board without resizing it, so the offsets are refreshed too.
    window.addEventListener('scroll', measure, { passive: true, capture: true });
    window.addEventListener('resize', measure, { passive: true });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = (motion: RemoteMotion) => {
      if (motion.type === 'bottle:move') {
        const target = targets.current.get(motion.bottleId);
        if (target && drag.current?.bottleId !== motion.bottleId) target.target = motion.position;
      } else if (motion.position) {
        const existing = remoteCursors.current.get(motion.playerId);
        remoteCursors.current.set(motion.playerId, {
          current: existing?.current ?? { ...motion.position },
          target: motion.position,
          visible: true,
          seenAt: performance.now(),
        });
      } else {
        const existing = remoteCursors.current.get(motion.playerId);
        if (existing) existing.visible = false;
      }
    };
    socket?.on('motion', onMotion);
    let frame = 0,
      previousTime = 0,
      lastCursor = 0,
      lastMove = 0;
    let previousCursor = '';
    let previousMove = '';
    const tick = (time: number) => {
      const delta = Math.min(100, time - (previousTime || time));
      previousTime = time;
      const alpha = reducedMotion.matches ? 1 : 1 - Math.exp(-delta / 45);
      const active = drag.current;
      // While an object is held, the pointer sweeps over dozens of others. Letting each one
      // run its hover filter repaints the board continuously, so hovering is switched off.
      const holding = active ? 'true' : 'false';
      if (board.dataset.holding !== holding) board.dataset.holding = holding;
      for (const [id, target] of targets.current) {
        const element = bottles.current.get(id);
        if (!element) continue;
        const local = active?.bottleId === id ? active : null;
        if (local) target.current = { ...local.position };
        else {
          target.current.x += (target.target.x - target.current.x) * alpha;
          target.current.y += (target.target.y - target.current.y) * alpha;
        }
        const state = byId.current.get(id);
        const sorted = state?.sorted === true;
        // Any object in someone's hand stands upright, which also keeps its name tag readable.
        const wanted = sorted || local || state?.lock ? 0 : (state?.tilt ?? 0);
        target.tilt += (wanted - target.tilt) * alpha;
        // Rounded so a settled object produces an identical string and skips the DOM write.
        const transform =
          'translate3d(' +
          (target.current.x * size.current.width).toFixed(2) +
          'px,' +
          (target.current.y * size.current.height).toFixed(2) +
          'px,0) translate(-50%,-50%) scale(' +
          (sorted ? 0.46 : local ? 1.07 : 1) +
          ') rotate(' +
          target.tilt.toFixed(2) +
          'deg)';
        if (transform !== target.written) {
          element.style.transform = transform;
          target.written = transform;
        }
        const layer = local ? '50' : sorted ? '2' : '5';
        if (layer !== target.layer) {
          element.style.zIndex = layer;
          element.style.visibility = 'visible';
          target.layer = layer;
        }
        const dragging = local ? 'true' : 'false';
        if (dragging !== target.dragging) {
          element.dataset.dragging = dragging;
          target.dragging = dragging;
        }
      }
      for (const [id, element] of cursors.current) {
        const cursor = remoteCursors.current.get(id);
        if (!cursor || !cursor.visible || time - cursor.seenAt > 3500) {
          element.style.opacity = '0';
          continue;
        }
        cursor.current.x += (cursor.target.x - cursor.current.x) * alpha;
        cursor.current.y += (cursor.target.y - cursor.current.y) * alpha;
        element.style.transform =
          'translate3d(' +
          cursor.current.x * size.current.width +
          'px,' +
          cursor.current.y * size.current.height +
          'px,0)';
        element.style.opacity = '1';
      }
      if (socket?.connected && enabled.current) {
        const cursorKey = JSON.stringify(pointer.current);
        if (
          time - lastCursor >= NETWORK_INTERVAL_MS &&
          (cursorKey !== previousCursor || time - lastCursor > 1000)
        ) {
          socket.volatile.emit('motion', {
            type: 'cursor:move',
            code: currentRoom.current.code,
            position: pointer.current,
            seq: sequence.current++,
          });
          lastCursor = time;
          previousCursor = cursorKey;
        }
        if (active?.granted && !active.ended) {
          const moveKey = active.dragId + JSON.stringify(active.position);
          if (
            time - lastMove >= NETWORK_INTERVAL_MS &&
            (moveKey !== previousMove || time - lastMove > 400)
          ) {
            socket.volatile.emit('motion', {
              type: 'bottle:move',
              code: currentRoom.current.code,
              roundId: currentRoom.current.game!.roundId,
              bottleId: active.bottleId,
              dragId: active.dragId,
              position: active.position,
              seq: sequence.current++,
            });
            lastMove = time;
            previousMove = moveKey;
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const cancel = () => cancelRef.current();
    const visibility = () => {
      if (document.hidden) {
        pointer.current = null;
        cancel();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelRef.current();
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', measure, { capture: true });
      window.removeEventListener('resize', measure);
      socket?.off('motion', onMotion);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [socket]);
  function onPointerMove(event: ReactPointerEvent) {
    const point = pointAt(event.clientX, event.clientY);
    pointer.current = point;
    const active = drag.current;
    if (active && active.pointerId === event.pointerId && !active.ended)
      active.position = {
        x: clamp(point.x + active.offset.x),
        y: clamp(point.y + active.offset.y),
      };
  }
  function endPointer(event: ReactPointerEvent, cancelled = false) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || active.ended) return;
    onPointerMove(event);
    active.ended = true;
    active.cancelled = cancelled;
    void finish(active);
  }
  // The handlers are rebuilt every render so they always read fresh state, but the object
  // handed to the board keeps one identity. That is what lets each object memoise: sorting
  // one item re-renders one item instead of all of them.
  const latest = useRef({ onPointerMove, endPointer, begin, finish, pointAt });
  latest.current = { onPointerMove, endPointer, begin, finish, pointAt };
  return useMemo(
    () => ({
      boardRef,
      bottles,
      cursors,
      onPointerMove: (event: ReactPointerEvent) => latest.current.onPointerMove(event),
      onPointerLeave: () => {
        pointer.current = null;
      },
      onPointerUp: (event: ReactPointerEvent) => latest.current.endPointer(event),
      onPointerCancel: (event: ReactPointerEvent) => latest.current.endPointer(event, true),
      onLostPointerCapture: (event: ReactPointerEvent) => {
        if (drag.current && !drag.current.ended) latest.current.endPointer(event, true);
      },
      grabBottle: (event: ReactPointerEvent<HTMLButtonElement>, bottle: Bottle) => {
        if (!event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        void latest.current.begin(
          bottle,
          latest.current.pointAt(event.clientX, event.clientY),
          event.pointerId,
        );
      },
      keyboardGrab: (bottle: Bottle) => {
        void latest.current.begin(bottle, bottle.position, null);
      },
      keyboardDrop: (position: Point) => {
        const active = drag.current;
        if (active?.pointerId === null && !active.ended) {
          active.position = position;
          active.ended = true;
          void latest.current.finish(active);
        }
      },
    }),
    // Refs only: this API is created once for the life of the board.
    [boardRef, bottles, cursors, pointer, drag],
  );
}
