import type { CardId } from "../../domain/game/card";
import type {
  GamePhase,
  GamePlayer,
  GameResult,
  GameState,
  GameStatus,
  PendingChoice,
  PlayedCard,
  PlayerId,
  StarlightTokens,
} from "../../domain/game/types";

export interface BaseItem {
  readonly PK: string;
  readonly SK: string;
  readonly entityType:
    | "ROOM"
    | "ACTIVE_CONTEXT"
    | "JOIN_GUARD"
    | "GAME_STATE"
    | "GAME_EVENT"
    | "REQUEST";
}

export type RoomStatus =
  | "WAITING"
  | "READY"
  | "IN_GAME"
  | "CLOSED"
  | "EXPIRED";

export type RoomCloseReason =
  | "OWNER_LEFT"
  | "STARTED"
  | "EXPIRED"
  | "GAME_COMPLETED"
  | "GAME_ABANDONED";

export interface RoomItem extends BaseItem {
  readonly entityType: "ROOM";
  readonly roomId: string;
  readonly status: RoomStatus;
  readonly ownerUserId: string;
  readonly ownerDisplayName: string;
  readonly guestUserId?: string;
  readonly guestDisplayName?: string;
  readonly gameId?: string;
  readonly version: number;
  readonly createdAt: string;
  readonly waitingExpiresAt: string;
  readonly closedAt?: string;
  readonly closeReason?: RoomCloseReason;
  readonly purgeAt?: number;
}

export interface ActiveContextItem extends BaseItem {
  readonly entityType: "ACTIVE_CONTEXT";
  readonly userId: string;
  readonly roomId: string;
  readonly gameId?: string;
  readonly role: PlayerId;
  readonly contextStatus: "WAITING" | "READY" | "IN_GAME";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface JoinGuardItem extends BaseItem {
  readonly entityType: "JOIN_GUARD";
  readonly windowStartedAt: string;
  readonly failedCount: number;
  readonly blockedUntil?: string;
  readonly updatedAt: string;
  readonly purgeAt: number;
}

export interface GameStateItem extends BaseItem {
  readonly entityType: "GAME_STATE";
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
  readonly endedAt?: string;
  readonly endReason?: GameResult["endReason"];
  readonly winnerUserId?: string;
  readonly loserUserId?: string;
  readonly resignedBy?: string;
  readonly purgeAt?: number;
}

export type GameEventActionType =
  | "GAME_STARTED"
  | "DRAW_CARDS"
  | "PLAY_CARD"
  | "END_TURN"
  | "SELECT_COLLECTION"
  | "SELECT_DISCARD_TOP"
  | "RESIGN"
  | "GAME_ENDED"
  | "GAME_ABANDONED";

export interface GameEventPayload {
  readonly version: number;
  readonly playedCardId?: CardId;
  readonly collectedCardId?: CardId;
  readonly discardTopCardId?: CardId;
  readonly drawCount?: number;
  readonly endReason?: GameResult["endReason"];
}

export interface GameEventItem extends BaseItem {
  readonly entityType: "GAME_EVENT";
  readonly gameId: string;
  readonly eventId: string;
  readonly seq: number;
  readonly actorUserId: string | "SYSTEM";
  readonly actionType: GameEventActionType;
  readonly payload: GameEventPayload;
  readonly createdAt: string;
  readonly purgeAt: number;
}

export interface RequestItem extends BaseItem {
  readonly entityType: "REQUEST";
  readonly requestId: string;
  readonly requestHash: string;
  readonly actorUserId: string;
  readonly scope: "USER" | "ROOM" | "GAME";
  readonly resultStatus: "SUCCEEDED" | "FAILED";
  readonly resultVersion?: number;
  readonly resultResourceId?: string;
  readonly createdAt: string;
  readonly purgeAt: number;
}

export type StellaQuestDuelItem =
  | RoomItem
  | ActiveContextItem
  | JoinGuardItem
  | GameStateItem
  | GameEventItem
  | RequestItem;

export type { GameState };
