import { getCard, type CardId } from "./card";
import { GameDomainError } from "./errors";
import { determineRoundOutcome } from "./round";
import { assertCanEndTurn } from "./turn";
import type { GameState, PlayedCard, PlayerId } from "./types";

interface ActionMetadata {
  readonly actionAt: string;
  readonly abandonAt: string;
}

export interface EndFinalPlayerTurnInput extends ActionMetadata {
  readonly state: GameState;
  readonly actor: PlayerId;
}

function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === "OWNER" ? "GUEST" : "OWNER";
}

function updateActionMetadata(
  state: GameState,
  metadata: ActionMetadata,
): Pick<GameState, "version" | "lastActionAt" | "abandonAt"> {
  return {
    version: state.version + 1,
    lastActionAt: metadata.actionAt,
    abandonAt: metadata.abandonAt,
  };
}

function lastRestCardId(playedCards: readonly PlayedCard[]): CardId | null {
  for (let index = playedCards.length - 1; index >= 0; index -= 1) {
    const playedCard = playedCards[index];

    if (playedCard !== undefined && getCard(playedCard.cardId).type === "REST") {
      return playedCard.cardId;
    }
  }

  return null;
}

function appendToDiscardWithTop(
  discardPile: readonly CardId[],
  playedCards: readonly PlayedCard[],
  topCardId: CardId,
): CardId[] {
  const topCardIndex = playedCards.findIndex(
    (playedCard) => playedCard.cardId === topCardId,
  );

  if (topCardIndex < 0) {
    throw new Error("捨て札トップ候補がプレイエリアにありません。");
  }

  const otherCardIds = playedCards
    .filter((_, index) => index !== topCardIndex)
    .map((playedCard) => playedCard.cardId);

  return [...discardPile, ...otherCardIds, topCardId];
}

function completeByLightLoss(
  state: GameState,
  loser: PlayerId,
  metadata: ActionMetadata,
): GameState {
  return {
    ...state,
    ...updateActionMetadata(state, metadata),
    status: "COMPLETED",
    phase: "COMPLETED",
    pendingChoice: null,
    result: {
      endReason: "LIGHT_LOST",
      winner: otherPlayer(loser),
      loser,
      resignedBy: null,
      endedAt: metadata.actionAt,
    },
  };
}

function beginNextRound(
  state: GameState,
  startPlayer: PlayerId,
  discardTop: CardId,
  blackStarHolder: PlayerId | null,
  metadata: ActionMetadata,
): GameState {
  return {
    ...state,
    ...updateActionMetadata(state, metadata),
    phase: "PLAYER_TURN_BEFORE_PLAY",
    currentActor: startPlayer,
    startPlayer,
    blackStarHolder,
    discardPile: appendToDiscardWithTop(
      state.discardPile,
      state.playedCards,
      discardTop,
    ),
    playedCards: [],
    pendingChoice: null,
  };
}

function resolveDummyWin(
  state: GameState,
  lastHumanPlayer: PlayerId,
  metadata: ActionMetadata,
): GameState {
  const dummyCard = state.playedCards.find(
    (playedCard) => playedCard.actor === "DUMMY",
  );

  if (dummyCard === undefined) {
    throw new Error("ダミーがプレイしたカードを特定できません。");
  }

  const discardTop = lastRestCardId(state.playedCards) ?? dummyCard.cardId;

  return beginNextRound(
    state,
    lastHumanPlayer,
    discardTop,
    null,
    metadata,
  );
}

function resolveAllRest(
  state: GameState,
  metadata: ActionMetadata,
): GameState {
  const discardTop = lastRestCardId(state.playedCards);

  if (discardTop === null) {
    throw new Error("全員休憩の捨て札トップを特定できません。");
  }

  const nextStartPlayer = state.blackStarHolder ?? state.startPlayer;

  return beginNextRound(
    state,
    nextStartPlayer,
    discardTop,
    state.blackStarHolder,
    metadata,
  );
}

function beginHumanWinnerResolution(
  state: GameState,
  winner: PlayerId,
  metadata: ActionMetadata,
): GameState {
  let nextState = state;

  if (state.blackStarHolder === winner) {
    const tokens = state.starlightTokens[winner];
    const nextLight = Math.max(0, tokens.light - 1);
    nextState = {
      ...state,
      starlightTokens: {
        ...state.starlightTokens,
        [winner]: {
          light: nextLight,
          dark: tokens.dark + (tokens.light - nextLight),
        },
      },
    };

    if (nextLight === 0) {
      return completeByLightLoss(nextState, winner, metadata);
    }
  }

  const candidateCardIds = nextState.playedCards
    .filter((playedCard) => getCard(playedCard.cardId).type === "EMOTION")
    .map((playedCard) => playedCard.cardId);

  if (candidateCardIds.length === 0) {
    throw new Error("収集可能な感情カードがありません。");
  }

  return {
    ...nextState,
    ...updateActionMetadata(state, metadata),
    phase: "AWAITING_COLLECTION_CHOICE",
    currentActor: winner,
    pendingChoice: {
      type: "COLLECTION",
      actor: winner,
      candidateCardIds,
    },
  };
}

export function endFinalPlayerTurn(
  input: EndFinalPlayerTurnInput,
): GameState {
  const { state, actor } = input;

  assertCanEndTurn(state, actor);

  if (
    actor === state.startPlayer ||
    state.playedCards.length !== 3 ||
    state.playedCards.at(-1)?.actor !== actor
  ) {
    throw new GameDomainError(
      "ACTION_NOT_ALLOWED",
      "ラウンド最後のプレイヤーだけがこの終了処理を実行できます。",
    );
  }

  const discardTop = state.discardPile.at(-1);

  if (discardTop === undefined) {
    throw new Error("ラウンド開始時の捨て札トップがありません。");
  }

  const outcome = determineRoundOutcome(state.playedCards, discardTop);

  if (outcome.reason === "ALL_REST") {
    return resolveAllRest(state, input);
  }

  if (outcome.winner === "DUMMY") {
    return resolveDummyWin(state, actor, input);
  }

  if (outcome.winner === null) {
    throw new Error("ラウンド勝者を特定できません。");
  }

  return beginHumanWinnerResolution(state, outcome.winner, input);
}
