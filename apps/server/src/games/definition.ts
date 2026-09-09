import type { RoomSettings } from '@ensemble/shared';

export interface GameDefinition<State> {
  id: string;
  create(settings: RoomSettings, now: number): State;
  isFinished(state: State): boolean;
}
