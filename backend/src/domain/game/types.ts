import type { CardId } from "./card";

export const PLAYER_IDS = ["OWNER", "GUEST"] as const;

export type PlayerId = (typeof PLAYER_IDS)[number];
export type GameActor = PlayerId | "DUMMY";
export type GameStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
export type GamePhase =
  | "PLAYER_TURN_BEFORE_PLAY"
  | "PLAYER_TURN_AFTER_PLAY"
  | "AWAITING_COLLECTION_CHOICE"
  | "AWAITING_DISCARD_TOP_CHOICE"
  | "COMPLETED"
  | "ABANDONED";

export interface GamePlayer {
  readonly playerId: PlayerId;
  readonly userId: string;
  readonly displayName: string;
  readonly role: PlayerId;
}

export interface PlayedCard {
  readonly actor: GameActor;
  readonly cardId: CardId;
}

export interface StarlightTokens {
  readonly light: number;
  readonly dark: number;
}

export interface PendingChoice {
  readonly type: "COLLECTION" | "DISCARD_TOP";
  readonly actor: PlayerId;
  readonly candidateCardIds: CardId[];
}

export interface GameResult {
  readonly endReason:
    | "ENLIGHTENMENT"
    | "LIGHT_LOST"
    | "RESIGNATION"
    | "ABANDONED";
  readonly winner: PlayerId | null;
  readonly loser: PlayerId | null;
  readonly resignedBy: PlayerId | null;
  readonly endedAt: string;
}

export interface GameState {
  readonly gameId: string;
  readonly roomId: string;
  readonly status: GameStatus;
  readonly version: number;
  readonly players: Record<PlayerId, GamePlayer>;
  readonly phase: GamePhase;
  readonly currentActor: PlayerId;
  readonly startPlayer: PlayerId;
  readonly blackStarHolder: PlayerId | null;
  readonly deck: CardId[];
  readonly discardPile: CardId[];
  readonly hands: Record<PlayerId, CardId[]>;
  readonly playedCards: PlayedCard[];
  readonly collections: Record<PlayerId, CardId[]>;
  readonly starlightTokens: Record<PlayerId, StarlightTokens>;
  readonly pendingChoice: PendingChoice | null;
  readonly lastActionAt: string;
  readonly abandonAt: string;
  readonly nextEventSeq: number;
  readonly result: GameResult | null;
}
