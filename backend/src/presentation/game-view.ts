import {
  getCard,
  type CardColor,
  type CardId,
  type EmotionColor,
  type EmotionNumber,
} from "../domain/game/card";
import { isCardPlayable } from "../domain/game/turn";
import {
  PLAYER_IDS,
  type GameActor,
  type GamePhase,
  type GameState,
  type GameStatus,
  type PlayerId,
} from "../domain/game/types";

export interface PublicEmotionCardView {
  readonly cardId: CardId;
  readonly type: "EMOTION";
  readonly color: EmotionColor;
  readonly number: EmotionNumber;
}

export interface PublicRestCardView {
  readonly cardId: CardId;
  readonly type: "REST";
  readonly color: "REST";
}

export type PublicCardView = PublicEmotionCardView | PublicRestCardView;

export interface HiddenHandCardView {
  readonly color: CardColor;
}

export interface GamePlayerView {
  readonly playerId: PlayerId;
  readonly displayName: string;
  readonly role: PlayerId;
  readonly isViewer: boolean;
  readonly hand: readonly (PublicCardView | HiddenHandCardView)[];
  readonly handCount: number;
  readonly collection: readonly PublicCardView[];
  readonly starlight: {
    readonly light: number;
    readonly dark: number;
  };
}

export interface AvailableActionsView {
  readonly canDrawCards: boolean;
  readonly canPlayCard: boolean;
  readonly playableCardIds: readonly CardId[];
  readonly canEndTurn: boolean;
  readonly collectionCandidateCardIds: readonly CardId[];
  readonly discardTopCandidateCardIds: readonly CardId[];
  readonly canResign: boolean;
}

export interface GameView {
  readonly gameId: string;
  readonly roomId: string;
  readonly status: GameStatus;
  readonly version: number;
  readonly phase: GamePhase;
  readonly viewerPlayerId: PlayerId;
  readonly currentActorPlayerId: PlayerId;
  readonly startPlayerId: PlayerId;
  readonly blackStarHolderPlayerId: PlayerId | null;
  readonly players: readonly GamePlayerView[];
  readonly deck: {
    readonly remainingCount: number;
    readonly topColor: CardColor | null;
  };
  readonly discardTop: PublicCardView | null;
  readonly playedCards: readonly {
    readonly actor: GameActor;
    readonly card: PublicCardView;
  }[];
  readonly pendingChoice: {
    readonly type: "COLLECTION" | "DISCARD_TOP";
    readonly actorPlayerId: PlayerId;
    readonly candidateCardIds: readonly CardId[];
  } | null;
  readonly availableActions: AvailableActionsView;
  readonly lastActionAt: string;
  readonly abandonAt: string;
  readonly result: {
    readonly endReason:
      | "ENLIGHTENMENT"
      | "LIGHT_LOST"
      | "RESIGNATION"
      | "ABANDONED";
    readonly winnerPlayerId: PlayerId | null;
    readonly loserPlayerId: PlayerId | null;
    readonly resignedByPlayerId: PlayerId | null;
    readonly endedAt: string;
  } | null;
}

function publicCard(cardId: CardId): PublicCardView {
  const card = getCard(cardId);

  if (card.type === "REST") {
    return {
      cardId,
      type: "REST",
      color: "REST",
    };
  }

  return {
    cardId,
    type: "EMOTION",
    color: card.color,
    number: card.number,
  };
}

function hiddenHand(hand: readonly CardId[]): HiddenHandCardView[] {
  return hand
    .map((cardId) => ({
      color: getCard(cardId).color,
    }))
    .toSorted((first, second) => first.color.localeCompare(second.color));
}

function playerView(
  state: GameState,
  playerId: PlayerId,
  viewer: PlayerId,
): GamePlayerView {
  const player = state.players[playerId];
  const isViewer = playerId === viewer;

  return {
    playerId,
    displayName: player.displayName,
    role: player.role,
    isViewer,
    hand: isViewer
      ? state.hands[playerId].map(publicCard)
      : hiddenHand(state.hands[playerId]),
    handCount: state.hands[playerId].length,
    collection: state.collections[playerId].map(publicCard),
    starlight: {
      light: state.starlightTokens[playerId].light,
      dark: state.starlightTokens[playerId].dark,
    },
  };
}

function availableActions(
  state: GameState,
  viewer: PlayerId,
): AvailableActionsView {
  const isInProgress = state.status === "IN_PROGRESS";
  const isCurrentActor = state.currentActor === viewer;
  const isBeforePlay =
    isInProgress &&
    isCurrentActor &&
    state.phase === "PLAYER_TURN_BEFORE_PLAY";
  const isAfterPlay =
    isInProgress &&
    isCurrentActor &&
    state.phase === "PLAYER_TURN_AFTER_PLAY";
  const playableCardIds = isBeforePlay
    ? state.hands[viewer].filter((cardId) =>
        isCardPlayable(state, viewer, cardId),
      )
    : [];
  const tokens = state.starlightTokens[viewer];
  const canDrawCards =
    (isBeforePlay || isAfterPlay) &&
    state.hands[viewer].length < 10 &&
    tokens.light >= 2;
  const canChooseCollection =
    isInProgress &&
    isCurrentActor &&
    state.phase === "AWAITING_COLLECTION_CHOICE" &&
    state.pendingChoice?.type === "COLLECTION" &&
    state.pendingChoice.actor === viewer;
  const canChooseDiscardTop =
    isInProgress &&
    isCurrentActor &&
    state.phase === "AWAITING_DISCARD_TOP_CHOICE" &&
    state.pendingChoice?.type === "DISCARD_TOP" &&
    state.pendingChoice.actor === viewer;

  return {
    canDrawCards,
    canPlayCard: playableCardIds.length > 0,
    playableCardIds,
    canEndTurn: isAfterPlay,
    collectionCandidateCardIds: canChooseCollection
      ? state.pendingChoice.candidateCardIds
      : [],
    discardTopCandidateCardIds: canChooseDiscardTop
      ? state.pendingChoice.candidateCardIds
      : [],
    canResign: isInProgress,
  };
}

export function createGameView(
  state: GameState,
  viewer: PlayerId,
): GameView {
  const deckTop = state.deck.at(-1);
  const discardTop = state.discardPile.at(-1);

  return {
    gameId: state.gameId,
    roomId: state.roomId,
    status: state.status,
    version: state.version,
    phase: state.phase,
    viewerPlayerId: viewer,
    currentActorPlayerId: state.currentActor,
    startPlayerId: state.startPlayer,
    blackStarHolderPlayerId: state.blackStarHolder,
    players: PLAYER_IDS.map((playerId) =>
      playerView(state, playerId, viewer),
    ),
    deck: {
      remainingCount: state.deck.length,
      topColor: deckTop === undefined ? null : getCard(deckTop).color,
    },
    discardTop: discardTop === undefined ? null : publicCard(discardTop),
    playedCards: state.playedCards.map((playedCard) => ({
      actor: playedCard.actor,
      card: publicCard(playedCard.cardId),
    })),
    pendingChoice:
      state.pendingChoice === null
        ? null
        : {
            type: state.pendingChoice.type,
            actorPlayerId: state.pendingChoice.actor,
            candidateCardIds: [...state.pendingChoice.candidateCardIds],
          },
    availableActions: availableActions(state, viewer),
    lastActionAt: state.lastActionAt,
    abandonAt: state.abandonAt,
    result:
      state.result === null
        ? null
        : {
            endReason: state.result.endReason,
            winnerPlayerId: state.result.winner,
            loserPlayerId: state.result.loser,
            resignedByPlayerId: state.result.resignedBy,
            endedAt: state.result.endedAt,
          },
  };
}
