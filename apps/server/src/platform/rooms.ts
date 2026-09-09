import { randomInt, randomUUID } from 'node:crypto';
import {
  LOCK_TTL_MS,
  PLAYER_COLORS,
  RECONNECT_GRACE_MS,
  type Bottle,
  type Command,
  type Motion,
  type Player,
  type RoomSettings,
  type RoomState,
  type RoomSummary,
  type SortingState,
} from '@ensemble/shared';
import { grab, owns, release, sortingGame } from '../games/sorting.js';
import { requireCondition } from './errors.js';
import type { Session, SessionStore } from './sessions.js';

interface Member extends Player {
  disconnectedAt: number | null;
}
interface Room {
  id: string;
  code: string;
  gameId: 'sorting';
  hostId: string;
  createdAt: number;
  status: RoomState['status'];
  settings: RoomSettings;
  players: Map<string, Member>;
  game: SortingState | null;
  contributors: Map<string, Player>;
}
export interface CompletedResult {
  id: string;
  roomId: string;
  code: string;
  gameId: string;
  settings: RoomSettings;
  startedAt: number;
  finishedAt: number;
  players: Player[];
}
export interface RoomHooks {
  state: (room: RoomState) => void;
  bottle: (code: string, roundId: string, bottle: Bottle, players: Player[]) => void;
  list: () => void;
  closed: (code: string) => void;
  finished: (result: CompletedResult) => void;
}
const noop = () => {};
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  private rooms = new Map<string, Room>();
  hooks: RoomHooks = { state: noop, bottle: noop, list: noop, closed: noop, finished: noop };
  constructor(
    private sessions: SessionStore,
    private now = Date.now,
    private maxRooms = 500,
  ) {}
  list(): RoomSummary[] {
    return [...this.rooms.values()]
      .map((r) => this.summary(r))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  snapshot(code: string): RoomState {
    const room = this.get(code);
    return { ...this.summary(room), players: this.players(room), game: structuredClone(room.game) };
  }
  private players(room: Room): Player[] {
    return [...room.players.values()].map(({ disconnectedAt: _disconnectedAt, ...player }) => ({
      ...player,
    }));
  }
  private summary(room: Room): RoomSummary {
    return {
      id: room.id,
      code: room.code,
      gameId: room.gameId,
      hostId: room.hostId,
      hostName: room.players.get(room.hostId)?.nickname ?? 'Ensemble',
      status: room.status,
      createdAt: room.createdAt,
      playerCount: room.players.size,
      connectedCount: [...room.players.values()].filter((p) => p.connected).length,
      settings: { ...room.settings },
    };
  }
  private get(code: string) {
    const room = this.rooms.get(code);
    requireCondition(room, 'ROOM_NOT_FOUND', 'Cette partie est introuvable ou a expiré.');
    return room;
  }
  private member(session: Session, code: string) {
    const room = this.get(code);
    requireCondition(
      session.roomCode === code && room.players.has(session.id),
      'NOT_IN_ROOM',
      'Rejoignez cette partie pour continuer.',
    );
    return room;
  }
  private host(session: Session, code: string) {
    const room = this.member(session, code);
    requireCondition(
      room.hostId === session.id,
      'HOST_ONLY',
      'Seul l’hôte peut effectuer cette action.',
    );
    return room;
  }
  private changed(room: Room) {
    this.hooks.state(this.snapshot(room.code));
    this.hooks.list();
  }
  private bottleChanged(room: Room, bottle: Bottle) {
    this.hooks.bottle(room.code, room.game!.roundId, structuredClone(bottle), this.players(room));
  }
  create(session: Session, settings: RoomSettings) {
    requireCondition(
      !session.roomCode,
      'ALREADY_IN_ROOM',
      'Quittez votre partie actuelle avant d’en créer une autre.',
    );
    requireCondition(
      this.rooms.size < this.maxRooms,
      'SERVER_FULL',
      'Toutes les tables sont occupées. Réessayez bientôt.',
    );
    let code: string;
    do {
      code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
    } while (this.rooms.has(code));
    const room: Room = {
      id: randomUUID(),
      code,
      gameId: 'sorting',
      hostId: session.id,
      createdAt: this.now(),
      status: 'lobby',
      settings: { ...settings },
      players: new Map(),
      game: null,
      contributors: new Map(),
    };
    this.rooms.set(code, room);
    this.join(session, code);
    return code;
  }
  join(session: Session, code: string) {
    const room = this.get(code);
    requireCondition(
      !session.roomCode || session.roomCode === code,
      'ALREADY_IN_ROOM',
      'Quittez votre partie actuelle avant de rejoindre celle-ci.',
    );
    const existing = room.players.get(session.id);
    if (existing) {
      existing.connected = true;
      existing.disconnectedAt = null;
      session.roomCode = code;
      this.changed(room);
      return;
    }
    requireCondition(
      room.status === 'lobby',
      'GAME_STARTED',
      room.status === 'finished'
        ? 'Cette partie est terminée.'
        : 'La partie a déjà commencé. Rejoignez une table ouverte.',
    );
    requireCondition(
      room.players.size < room.settings.maxPlayers,
      'ROOM_FULL',
      'Cette table est complète. Une autre vous attend !',
    );
    const used = new Set([...room.players.values()].map((p) => p.color));
    room.players.set(session.id, {
      id: session.id,
      nickname: session.nickname,
      color: PLAYER_COLORS.find((c) => !used.has(c))!,
      connected: true,
      sorted: 0,
      disconnectedAt: null,
    });
    session.roomCode = code;
    this.changed(room);
  }
  leave(session: Session, code: string) {
    if (session.roomCode !== code) return;
    const room = this.rooms.get(code);
    session.roomCode = null;
    if (!room) return;
    this.unlockPlayer(room, session.id);
    room.players.delete(session.id);
    if (!room.players.size) {
      this.rooms.delete(code);
      this.hooks.closed(code);
      this.hooks.list();
      return;
    }
    this.electHost(room);
    this.changed(room);
  }
  reconnect(session: Session) {
    if (!session.roomCode) return;
    const room = this.rooms.get(session.roomCode);
    const player = room?.players.get(session.id);
    if (!room || !player) {
      session.roomCode = null;
      return;
    }
    if (
      player.disconnectedAt !== null &&
      this.now() - player.disconnectedAt >= RECONNECT_GRACE_MS
    ) {
      this.leave(session, room.code);
      return;
    }
    player.connected = true;
    player.disconnectedAt = null;
    this.changed(room);
  }
  disconnect(session: Session) {
    if (!session.roomCode) return;
    const room = this.rooms.get(session.roomCode);
    const player = room?.players.get(session.id);
    if (!room || !player) return;
    player.connected = false;
    player.disconnectedAt = this.now();
    this.unlockPlayer(room, session.id);
    this.changed(room);
  }
  private unlockPlayer(room: Room, playerId: string) {
    for (const bottle of room.game?.bottles ?? []) {
      if (bottle.lock?.playerId === playerId) {
        bottle.lock = null;
        bottle.position = { ...bottle.home };
        this.bottleChanged(room, bottle);
      }
    }
  }
  private electHost(room: Room) {
    if (room.players.get(room.hostId)?.connected) return;
    room.hostId =
      [...room.players.values()].find((p) => p.connected)?.id ??
      room.players.keys().next().value ??
      room.hostId;
  }
  update(session: Session, code: string, settings: RoomSettings) {
    const room = this.host(session, code);
    requireCondition(
      room.status === 'lobby',
      'NOT_LOBBY',
      'Les réglages sont disponibles avant le départ.',
    );
    requireCondition(
      settings.maxPlayers >= room.players.size,
      'CAPACITY_TOO_SMALL',
      'La capacité doit accueillir les joueurs déjà présents.',
    );
    room.settings = { ...settings };
    this.changed(room);
  }
  start(session: Session, code: string) {
    const room = this.host(session, code);
    requireCondition(room.status === 'lobby', 'NOT_LOBBY', 'Cette partie a déjà commencé.');
    room.game = sortingGame.create(room.settings, this.now());
    room.status = 'playing';
    room.contributors.clear();
    for (const player of room.players.values()) player.sorted = 0;
    this.changed(room);
  }
  restart(session: Session, code: string) {
    const room = this.host(session, code);
    requireCondition(
      room.status === 'finished',
      'NOT_FINISHED',
      'Terminez cette partie avant de rejouer.',
    );
    room.status = 'lobby';
    room.game = null;
    room.contributors.clear();
    for (const player of room.players.values()) player.sorted = 0;
    this.changed(room);
  }
  private playing(session: Session, code: string, roundId: string, bottleId: string) {
    const room = this.member(session, code);
    requireCondition(
      room.status === 'playing' && room.game?.roundId === roundId,
      'NOT_PLAYING',
      'Cette manche n’est plus en cours.',
    );
    const bottle = room.game.bottles.find((b) => b.id === bottleId);
    requireCondition(bottle, 'BOTTLE_NOT_FOUND', 'Cette bouteille est introuvable.');
    return { room, bottle, game: room.game };
  }
  handle(session: Session, command: Command): { code?: string } {
    switch (command.type) {
      case 'room:create':
        return { code: this.create(session, command.settings) };
      case 'room:join':
        this.join(session, command.code);
        return { code: command.code };
      case 'room:leave':
        this.leave(session, command.code);
        return {};
      case 'room:sync':
        this.member(session, command.code);
        return { code: command.code };
      case 'room:update':
        this.update(session, command.code, command.settings);
        return {};
      case 'game:start':
        this.start(session, command.code);
        return {};
      case 'game:restart':
        this.restart(session, command.code);
        return {};
      default: {
        const { room, bottle, game } = this.playing(
          session,
          command.code,
          command.roundId,
          command.bottleId,
        );
        if (command.type === 'bottle:grab') {
          requireCondition(
            !game.bottles.some(
              (b) =>
                b.id !== bottle.id &&
                b.lock?.playerId === session.id &&
                b.lock.expiresAt > this.now(),
            ),
            'ALREADY_HOLDING',
            'Une bouteille à la fois.',
          );
          grab(bottle, session.id, command.dragId, this.now());
        } else {
          owns(bottle, session.id, command.dragId, this.now());
          if (command.type === 'bottle:cancel') {
            bottle.lock = null;
            bottle.position = { ...bottle.home };
          } else {
            const sorted = release(
              game,
              bottle,
              command.position,
              room.settings.colorCount,
              session.id,
            );
            if (sorted) {
              const player = room.players.get(session.id)!;
              player.sorted++;
              room.contributors.set(session.id, {
                id: player.id,
                nickname: player.nickname,
                color: player.color,
                connected: player.connected,
                sorted: player.sorted,
              });
            }
          }
        }
        this.bottleChanged(room, bottle);
        if (sortingGame.isFinished(game)) {
          game.finishedAt = this.now();
          room.status = 'finished';
          for (const player of this.players(room)) room.contributors.set(player.id, player);
          this.hooks.finished({
            id: game.roundId,
            roomId: room.id,
            code: room.code,
            gameId: room.gameId,
            settings: { ...room.settings },
            startedAt: game.startedAt,
            finishedAt: game.finishedAt,
            players: [...room.contributors.values()],
          });
          this.changed(room);
        }
        return {};
      }
    }
  }
  motion(session: Session, motion: Motion) {
    if (motion.type === 'cursor:move') {
      this.member(session, motion.code);
      return;
    }
    const { bottle } = this.playing(session, motion.code, motion.roundId, motion.bottleId);
    owns(bottle, session.id, motion.dragId, this.now());
    bottle.position = motion.position;
    bottle.lock!.expiresAt = this.now() + LOCK_TTL_MS;
  }
  sweep() {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      if (now - room.createdAt > 4 * 3_600_000) {
        for (const id of room.players.keys()) {
          const session = this.sessions.byId(id);
          if (session) session.roomCode = null;
        }
        this.rooms.delete(room.code);
        this.hooks.closed(room.code);
        this.hooks.list();
        continue;
      }
      for (const player of [...room.players.values()]) {
        if (player.disconnectedAt !== null && now - player.disconnectedAt >= RECONNECT_GRACE_MS) {
          const session = this.sessions.byId(player.id);
          if (session) this.leave(session, room.code);
        }
      }
      for (const bottle of room.game?.bottles ?? []) {
        if (bottle.lock && bottle.lock.expiresAt <= now) {
          bottle.lock = null;
          bottle.position = { ...bottle.home };
          this.bottleChanged(room, bottle);
        }
      }
    }
    this.sessions.sweep(now);
  }
}
