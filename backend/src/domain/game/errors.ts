export type GameDomainErrorCode =
  | "GAME_ALREADY_ENDED"
  | "NOT_CURRENT_ACTOR"
  | "ACTION_NOT_ALLOWED"
  | "CARD_NOT_IN_HAND"
  | "CARD_NOT_PLAYABLE"
  | "DRAW_NOT_ALLOWED"
  | "INVALID_CHOICE";

export class GameDomainError extends Error {
  readonly code: GameDomainErrorCode;

  constructor(code: GameDomainErrorCode, message: string) {
    super(message);
    this.name = "GameDomainError";
    this.code = code;
  }
}
