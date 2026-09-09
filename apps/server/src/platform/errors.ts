export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function requireCondition(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new GameError(code, message);
}
