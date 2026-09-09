import { createId } from '../../lib/id';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
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
  const size = useRef({ width: 0, height: 0 });
  const sequence = useRef(0);
  const enabled = useRef(status === 'connected' && room.status === 'playing');
  const lastBottleStates = useRef(new Map<string, Bottle>());
  useEffect(() => {
    currentRoom.current = room;
    enabled.current = status === 'connected' && room.status === 'playing';
    for (const bottle of room.game!.bottles) {
      const previous = lastBottleStates.current.get(bottle.id);
      const existing = targets.current.get(bottle.id);
      if (!existing)
        targets.current.set(bottle.id, {
          current: { ...bottle.position },
          target: { ...bottle.position },
          tilt: bottle.tilt,
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
    const rect = boardRef.current!.getBoundingClientRect();
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
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        size.current = { width: entry.contentRect.width, height: entry.contentRect.height };
    });
    observer.observe(board);
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
      for (const [id, target] of targets.current) {
        const element = bottles.current.get(id);
        if (!element) continue;
        const local = active?.bottleId === id ? active : null;
        if (local) target.current = { ...local.position };
        else {
          target.current.x += (target.target.x - target.current.x) * alpha;
          target.current.y += (target.target.y - target.current.y) * alpha;
        }
        const state = currentRoom.current.game!.bottles.find((b) => b.id === id);
        const sorted = state?.sorted;
        // Any bottle in someone's hand stands upright, which also keeps its name tag readable.
        const wanted = sorted || local || state?.lock ? 0 : (state?.tilt ?? 0);
        target.tilt += (wanted - target.tilt) * alpha;
        element.style.transform =
          'translate3d(' +
          target.current.x * size.current.width +
          'px,' +
          target.current.y * size.current.height +
          'px,0) translate(-50%,-50%) scale(' +
          (sorted ? 0.46 : local ? 1.07 : 1) +
          ') rotate(' +
          target.tilt.toFixed(2) +
          'deg)';
        element.style.zIndex = local ? '50' : sorted ? '2' : '5';
        element.style.visibility = 'visible';
        element.dataset.dragging = local ? 'true' : 'false';
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
  return {
    boardRef,
    bottles,
    cursors,
    onPointerMove,
    onPointerLeave: () => {
      pointer.current = null;
    },
    onPointerUp: (event: ReactPointerEvent) => endPointer(event),
    onPointerCancel: (event: ReactPointerEvent) => endPointer(event, true),
    onLostPointerCapture: (event: ReactPointerEvent) => {
      if (drag.current && !drag.current.ended) endPointer(event, true);
    },
    grabBottle: (event: ReactPointerEvent<HTMLButtonElement>, bottle: Bottle) => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      void begin(bottle, pointAt(event.clientX, event.clientY), event.pointerId);
    },
    keyboardGrab: (bottle: Bottle) => {
      void begin(bottle, bottle.position, null);
    },
    keyboardDrop: (position: Point) => {
      const active = drag.current;
      if (active?.pointerId === null && !active.ended) {
        active.position = position;
        active.ended = true;
        void finish(active);
      }
    },
  };
}
