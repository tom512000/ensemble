import { z } from 'zod';

export const COLORS = ['coral', 'blue', 'sage', 'honey', 'lavender', 'peach'] as const;
export type BottleColor = (typeof COLORS)[number];
export const COLOR_META: Record<BottleColor, { label: string; hex: string; symbol: string }> = {
  coral: { label: 'Corail', hex: '#df806f', symbol: '●' },
  blue: { label: 'Azur', hex: '#7aabcc', symbol: '◆' },
  sage: { label: 'Sauge', hex: '#94ac79', symbol: '▲' },
  honey: { label: 'Miel', hex: '#ddba5e', symbol: '★' },
  lavender: { label: 'Lavande', hex: '#a596bd', symbol: '✿' },
  peach: { label: 'Pêche', hex: '#e7a777', symbol: '♥' },
};
export const PLAYER_COLORS = [
  '#486b52',
  '#b85b49',
  '#4d7da5',
  '#997247',
  '#8769ad',
  '#b0507a',
  '#447e7b',
  '#7e7931',
];
export const WORLD = { width: 1200, height: 700 } as const;
export const NETWORK_INTERVAL_MS = 40;
export const LOCK_TTL_MS = 3000;
export const RECONNECT_GRACE_MS = 30_000;
export const nicknameSchema = z
  .string()
  .trim()
  .min(2, 'Deux caractères minimum.')
  .max(20, 'Vingt caractères maximum.')
  .regex(/^[\p{L}\p{N} _.'-]+$/u, 'Utilisez des lettres, chiffres, espaces ou tirets.');
export const settingsSchema = z
  .object({
    bottleCount: z.number().int().min(6).max(60),
    maxPlayers: z.number().int().min(2).max(8),
    colorCount: z.number().int().min(3).max(6),
  })
  .strict();
export type RoomSettings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: RoomSettings = { bottleCount: 30, maxPlayers: 4, colorCount: 6 };
export const pointSchema = z
  .object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) })
  .strict();
export type Point = z.infer<typeof pointSchema>;
const codeSchema = z.string().regex(/^[A-Z2-9]{6}$/);
const request = { requestId: z.uuid() };
const inRoom = { ...request, code: codeSchema };
const drag = {
  code: codeSchema,
  roundId: z.uuid(),
  bottleId: z.string().min(1).max(40),
  dragId: z.uuid(),
};
export const commandSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...request,
      type: z.literal('room:create'),
      gameId: z.literal('sorting'),
      settings: settingsSchema,
    })
    .strict(),
  z.object({ ...inRoom, type: z.literal('room:join') }).strict(),
  z.object({ ...inRoom, type: z.literal('room:leave') }).strict(),
  z.object({ ...inRoom, type: z.literal('room:sync') }).strict(),
  z.object({ ...inRoom, type: z.literal('room:update'), settings: settingsSchema }).strict(),
  z.object({ ...inRoom, type: z.literal('game:start') }).strict(),
  z.object({ ...inRoom, type: z.literal('game:restart') }).strict(),
  z.object({ ...request, ...drag, type: z.literal('bottle:grab') }).strict(),
  z
    .object({ ...request, ...drag, type: z.literal('bottle:release'), position: pointSchema })
    .strict(),
  z.object({ ...request, ...drag, type: z.literal('bottle:cancel') }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type CommandInput = Command extends infer C
  ? C extends Command
    ? Omit<C, 'requestId'>
    : never
  : never;
export const motionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('cursor:move'),
      code: codeSchema,
      position: pointSchema.nullable(),
      seq: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('bottle:move'),
      ...drag,
      position: pointSchema,
      seq: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type Motion = z.infer<typeof motionSchema>;
export interface Player {
  id: string;
  nickname: string;
  color: string;
  connected: boolean;
  sorted: number;
}
export interface Bottle {
  id: string;
  color: BottleColor;
  shape: number;
  /** Degrees of lean while loose; a sorted bottle always straightens up. */
  tilt: number;
  position: Point;
  home: Point;
  sorted: boolean;
  sortedBy: string | null;
  lock: { playerId: string; dragId: string; expiresAt: number } | null;
}
export interface SortingState {
  roundId: string;
  bottles: Bottle[];
  startedAt: number;
  finishedAt: number | null;
}
export type RoomStatus = 'lobby' | 'playing' | 'finished';
export interface RoomSummary {
  id: string;
  code: string;
  gameId: 'sorting';
  hostId: string;
  hostName: string;
  status: RoomStatus;
  createdAt: number;
  playerCount: number;
  connectedCount: number;
  settings: RoomSettings;
}
export interface RoomState extends RoomSummary {
  players: Player[];
  game: SortingState | null;
}
export interface GuestSession {
  id: string;
  nickname: string;
  token: string;
}
export interface AppError {
  code: string;
  message: string;
}
export type Reply = { ok: true; data: { code?: string } } | { ok: false; error: AppError };
export type RemoteMotion =
  | { type: 'cursor:move'; playerId: string; position: Point | null }
  | { type: 'bottle:move'; playerId: string; bottleId: string; dragId: string; position: Point };
export interface ServerEvents {
  'session:ready': (player: { id: string; nickname: string; roomCode: string | null }) => void;
  'session:replaced': () => void;
  'rooms:list': (rooms: RoomSummary[]) => void;
  'room:state': (room: RoomState) => void;
  'room:closed': (error: AppError) => void;
  'bottle:state': (update: {
    code: string;
    roundId: string;
    bottle: Bottle;
    players: Player[];
  }) => void;
  motion: (motion: RemoteMotion) => void;
}
export interface ClientEvents {
  command: (command: Command, ack: (reply: Reply) => void) => void;
  motion: (motion: Motion) => void;
}
export interface Bin {
  color: BottleColor;
  x: number;
  y: number;
  width: number;
  height: number;
}
export function getBins(colorCount: number): Bin[] {
  const gap = 0.018;
  const width = (0.94 - gap * (colorCount - 1)) / colorCount;
  return COLORS.slice(0, colorCount).map((color, i) => ({
    color,
    x: 0.03 + i * (width + gap),
    y: 0.055,
    width,
    height: 0.26,
  }));
}
export function binAt(point: Point, colorCount: number): Bin | undefined {
  return getBins(colorCount).find(
    (b) =>
      point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height,
  );
}
export const GAMES = [
  {
    id: 'sorting',
    name: 'À sa place',
    description:
      'Un peu de bazar, beaucoup de douceur. Triez les couleurs et faites de la place, ensemble.',
    minPlayers: 2,
    maxPlayers: 8,
  },
] as const;
