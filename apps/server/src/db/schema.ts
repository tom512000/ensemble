import { integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { Player, RoomSettings } from '@ensemble/shared';
export const gameResults = pgTable('game_results', {
  id: uuid('id').primaryKey(),
  roomId: uuid('room_id').notNull(),
  code: varchar('code', { length: 6 }).notNull(),
  gameId: varchar('game_id', { length: 40 }).notNull(),
  settings: jsonb('settings').$type<RoomSettings>().notNull(),
  players: jsonb('players').$type<Player[]>().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
  durationMs: integer('duration_ms').notNull(),
});
