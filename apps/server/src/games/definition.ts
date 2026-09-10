import type { GameId } from '@ensemble/shared';

/** Un jeu sait fabriquer une manche et dire quand elle est finie. Le reste — rooms, lobby,
 *  présence, transport — appartient à la plateforme et ne change pas d'un jeu à l'autre. */
export interface GameDefinition<Settings, State> {
  id: GameId;
  create(settings: Settings, now: number): State;
  isFinished(state: State): boolean;
}
