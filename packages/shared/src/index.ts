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
/**
 * Measured, not guessed. On the production bundle with the CPU throttled 6x, 300 objects
 * hold a 60 fps median; 400 falls off a cliff. See docs/architecture.md.
 */
export const MAX_BOTTLES = 300;
/** Six silhouettes in one flat style. The label, not the shape, tells you where an object goes. */
export const SHAPES = [
  { id: 'bottle', label: 'Bouteille' },
  { id: 'jar', label: 'Bocal' },
  { id: 'can', label: 'Canette' },
  { id: 'flask', label: 'Flacon' },
  { id: 'carton', label: 'Brique' },
  { id: 'tube', label: 'Tube' },
] as const;
export const MAX_SHAPES = SHAPES.length;
/** Objects are drawn in a 64x100 box, so they are markedly taller than they are wide. */
export const OBJECT_ASPECT = 100 / 64;
/**
 * Width of one object as a fraction of the board.
 *
 * Sized so every object together covers about a third of the board, whatever the count.
 * A denser target looks generous for a moment and then becomes unplayable: at 120 objects
 * the previous formula asked for 73% coverage, which no scatter can place without piling
 * objects on top of each other.
 */
export function objectWidth(bottleCount: number): number {
  const share = WORLD.width * WORLD.height * 0.34;
  const ideal = Math.sqrt(share / (OBJECT_ASPECT * Math.max(1, bottleCount)));
  return Math.min(64, Math.max(26, ideal)) / WORLD.width;
}
export const NETWORK_INTERVAL_MS = 40;
export const LOCK_TTL_MS = 3000;
export const RECONNECT_GRACE_MS = 30_000;
export const nicknameSchema = z
  .string()
  .trim()
  .min(2, 'Deux caractères minimum.')
  .max(20, 'Vingt caractères maximum.')
  .regex(/^[\p{L}\p{N} _.'-]+$/u, 'Utilisez des lettres, chiffres, espaces ou tirets.');
export const GAME_IDS = ['sorting', 'wanted'] as const;
export type GameId = (typeof GAME_IDS)[number];

/** Traits d'une tête. Deux têtes sont identiques si et seulement si tous leurs traits le sont. */
export const HEAD_TRAITS = ['skin', 'hair', 'eyes', 'mouth', 'extra', 'hue'] as const;
export type HeadTrait = (typeof HEAD_TRAITS)[number];
export const TRAIT_CHOICES: Record<HeadTrait, number> = {
  skin: 4,
  hair: 6,
  eyes: 5,
  mouth: 5,
  extra: 4,
  hue: 5,
};
export type HeadLook = Record<HeadTrait, number>;
export const WANTED_LEVELS = { min: 3, max: 15 } as const;
export const WANTED_HEADS = { min: 6, max: 120 } as const;
/** Taille d'une tête, en fraction de la largeur du plateau. Serveur et client s'accordent ici. */
export function headWidth(count: number): number {
  const ideal = Math.sqrt((WORLD.width * WORLD.height * 0.3) / Math.max(1, count));
  return Math.min(108, Math.max(34, ideal)) / WORLD.width;
}
export const WANTED_PACES = ['douce', 'normale', 'corsee'] as const;
export type WantedPace = (typeof WANTED_PACES)[number];

export const sortingSettingsSchema = z
  .object({
    game: z.literal('sorting'),
    bottleCount: z.number().int().min(6).max(MAX_BOTTLES),
    maxPlayers: z.number().int().min(2).max(8),
    colorCount: z.number().int().min(3).max(6),
    shapeCount: z.number().int().min(1).max(MAX_SHAPES),
  })
  .strict();
export type SortingSettings = z.infer<typeof sortingSettingsSchema>;

export const wantedSettingsSchema = z
  .object({
    game: z.literal('wanted'),
    maxPlayers: z.number().int().min(2).max(8),
    levels: z.number().int().min(WANTED_LEVELS.min).max(WANTED_LEVELS.max),
    startHeads: z.number().int().min(WANTED_HEADS.min).max(40),
    pace: z.enum(WANTED_PACES),
  })
  .strict();
export type WantedSettings = z.infer<typeof wantedSettingsSchema>;

/** Les réglages portent leur jeu : le lobby et les rooms restent communs. */
export const settingsSchema = z.discriminatedUnion('game', [
  sortingSettingsSchema,
  wantedSettingsSchema,
]);
export type RoomSettings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: SortingSettings = {
  game: 'sorting',
  bottleCount: 40,
  maxPlayers: 4,
  colorCount: 6,
  shapeCount: 4,
};
export const DEFAULT_WANTED_SETTINGS: WantedSettings = {
  game: 'wanted',
  maxPlayers: 4,
  levels: 8,
  startHeads: 10,
  pace: 'normale',
};
export const DEFAULT_BY_GAME: Record<GameId, RoomSettings> = {
  sorting: DEFAULT_SETTINGS,
  wanted: DEFAULT_WANTED_SETTINGS,
};
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
      gameId: z.enum(GAME_IDS),
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
  z
    .object({
      ...inRoom,
      type: z.literal('wanted:pick'),
      roundId: z.uuid(),
      headId: z.string().min(1).max(40),
    })
    .strict(),
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
  bins: Bin[];
  bottles: Bottle[];
  startedAt: number;
  finishedAt: number | null;
}
export interface WantedHead {
  id: string;
  position: Point;
  tilt: number;
  scale: number;
  look: HeadLook;
}
/**
 * L'état public ne dit jamais laquelle est l'intruse : le serveur seul tranche.
 * La réponse reste déductible en analysant les têtes, ce qui est le principe même du jeu ;
 * l'objectif est que personne ne puisse s'attribuer une trouvaille que le serveur refuse.
 */
export interface WantedState {
  roundId: string;
  level: number;
  levels: number;
  heads: WantedHead[];
  startedAt: number;
  levelStartedAt: number;
  finishedAt: number | null;
  /** Dernière bonne réponse, pour l'animation et le décompte. */
  lastFound: { playerId: string; headId: string; level: number } | null;
  misses: Record<string, number>;
}
export type GameState = ({ game: 'sorting' } & SortingState) | ({ game: 'wanted' } & WantedState);
export type RoomStatus = 'lobby' | 'playing' | 'finished';
export interface RoomSummary {
  id: string;
  code: string;
  gameId: GameId;
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
  game: GameState | null;
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
export type BinEdge = 'top' | 'right' | 'bottom' | 'left';
/**
 * Crates are laid out randomly along the borders, so they are part of the round the
 * server broadcasts rather than something each client recomputes.
 */
export interface Bin {
  color: BottleColor;
  edge: BinEdge;
  x: number;
  y: number;
  width: number;
  height: number;
}
export function binAt(point: Point, bins: Bin[]): Bin | undefined {
  return bins.find(
    (b) =>
      point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height,
  );
}
export const GAMES = [
  {
    id: 'sorting',
    name: 'À sa place',
    tagline: 'RANGEMENT',
    description:
      'Un peu de bazar, beaucoup de douceur. Triez les couleurs et faites de la place, ensemble.',
    minPlayers: 2,
    maxPlayers: 8,
  },
  {
    id: 'wanted',
    name: 'Tout seul',
    tagline: 'OBSERVATION',
    description:
      'Dans la foule, une tête n’a pas de jumelle. Trouvez-la avant les autres, niveau après niveau.',
    minPlayers: 2,
    maxPlayers: 8,
  },
] as const satisfies readonly {
  id: GameId;
  name: string;
  tagline: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
}[];
export function gameMeta(id: GameId) {
  return GAMES.find((g) => g.id === id)!;
}
