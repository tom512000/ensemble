import { randomBytes, randomUUID } from 'node:crypto';
import type { GuestSession } from '@ensemble/shared';
import { requireCondition } from './errors.js';

export interface Session extends GuestSession {
  roomCode: string | null;
  socketId: string | null;
  lastSeen: number;
}
export class SessionStore {
  private sessions = new Map<string, Session>();
  create(nickname: string, now = Date.now()): Session {
    this.sweep(now);
    requireCondition(
      this.sessions.size < 10_000,
      'SERVER_FULL',
      'Le serveur est très sollicité. Réessayez bientôt.',
    );
    const session = {
      id: randomUUID(),
      token: randomBytes(32).toString('hex'),
      nickname,
      roomCode: null,
      socketId: null,
      lastSeen: now,
    };
    this.sessions.set(session.token, session);
    return session;
  }
  get(token: string) {
    return this.sessions.get(token);
  }
  byId(id: string) {
    return [...this.sessions.values()].find((s) => s.id === id);
  }
  sweep(now: number) {
    for (const [token, session] of this.sessions) {
      if (!session.socketId && !session.roomCode && now - session.lastSeen > 86_400_000)
        this.sessions.delete(token);
    }
  }
}
