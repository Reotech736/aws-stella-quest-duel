export interface ApiMeta {
  readonly traceId: string;
  readonly serverTime: string;
  readonly idempotentReplay?: boolean;
}

export interface ApiResponse<T> {
  readonly data: T;
  readonly meta: ApiMeta;
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
  readonly meta?: ApiMeta;
}

export interface ContextView {
  readonly status: "WAITING" | "READY" | "IN_GAME";
  readonly role: "OWNER" | "GUEST";
  readonly roomId: string;
  readonly gameId: string | null;
}

export interface RoomView {
  readonly roomId: string;
  readonly status: "WAITING" | "READY" | "IN_GAME" | "CLOSED" | "EXPIRED";
  readonly version: number;
  readonly viewerRole: "OWNER" | "GUEST";
  readonly owner: { readonly displayName: string };
  readonly guest: { readonly displayName: string } | null;
  readonly gameId: string | null;
  readonly createdAt: string;
  readonly waitingExpiresAt: string;
}

export interface CardView {
  readonly cardId?: string;
  readonly type?: "EMOTION" | "REST";
  readonly color: string;
  readonly number?: number;
}

export interface PlayerView {
  readonly playerId: "OWNER" | "GUEST";
  readonly displayName: string;
  readonly isViewer: boolean;
  readonly hand: CardView[];
  readonly handCount: number;
  readonly collection: CardView[];
  readonly starlight: { readonly light: number; readonly dark: number };
}

export interface GameView {
  readonly gameId: string;
  readonly roomId: string;
  readonly status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
  readonly version: number;
  readonly phase: string;
  readonly viewerPlayerId: "OWNER" | "GUEST";
  readonly currentActorPlayerId: "OWNER" | "GUEST";
  readonly startPlayerId: "OWNER" | "GUEST";
  readonly blackStarHolderPlayerId: "OWNER" | "GUEST" | null;
  readonly players: PlayerView[];
  readonly deck: { readonly remainingCount: number; readonly topColor: string | null };
  readonly discardTop: CardView | null;
  readonly playedCards: Array<{
    readonly actor: "OWNER" | "GUEST" | "DUMMY";
    readonly card: CardView;
  }>;
  readonly pendingChoice: {
    readonly type: "COLLECTION" | "DISCARD_TOP";
    readonly actorPlayerId: "OWNER" | "GUEST";
    readonly candidateCardIds: string[];
  } | null;
  readonly availableActions: {
    readonly canDrawCards: boolean;
    readonly canPlayCard: boolean;
    readonly playableCardIds: string[];
    readonly canEndTurn: boolean;
    readonly collectionCandidateCardIds: string[];
    readonly discardTopCandidateCardIds: string[];
    readonly canResign: boolean;
  };
  readonly result: {
    readonly endReason: string;
    readonly winnerPlayerId: "OWNER" | "GUEST" | null;
    readonly loserPlayerId: "OWNER" | "GUEST" | null;
  } | null;
}
