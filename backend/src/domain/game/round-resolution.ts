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

export interface SelectCollectionInput extends ActionMetadata {
  readonly state: GameState;
  readonly actor: PlayerId;
  readonly cardId: CardId;
}

export interface SelectDiscardTopInput extends ActionMetadata {
  readonly state: GameState;
  readonly actor: PlayerId;
  readonly cardId: CardId;
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

function completeByEnlightenment(
  state: GameState,
  winner: PlayerId,
  metadata: ActionMetadata,
): GameState {
  return {
    ...state,
    ...updateActionMetadata(state, metadata),
    status: "COMPLETED",
    phase: "COMPLETED",
    pendingChoice: null,
    result: {
      endReason: "ENLIGHTENMENT",
      winner,
      loser: otherPlayer(winner),
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

function assertChoiceActor(state: GameState, actor: PlayerId): void {
  if (state.status !== "IN_PROGRESS") {
    throw new GameDomainError(
      "GAME_ALREADY_ENDED",
      "終了済みのゲームは操作できません。",
    );
  }

  if (state.currentActor !== actor) {
    throw new GameDomainError(
      "NOT_CURRENT_ACTOR",
      "現在の選択を行うプレイヤーではありません。",
    );
  }
}

function hasEnlightenment(collection: readonly CardId[]): boolean {
  const collectedNumbers = new Set(
    collection.flatMap((cardId) => {
      const card = getCard(cardId);
      return card.type === "EMOTION" ? [card.number] : [];
    }),
  );

  return [1, 2, 3, 4, 5, 6].every((number) =>
    collectedNumbers.has(number as 1 | 2 | 3 | 4 | 5 | 6),
  );
}

export function selectCollection(input: SelectCollectionInput): GameState {
  const { state, actor, cardId } = input;

  assertChoiceActor(state, actor);

  if (
    state.phase !== "AWAITING_COLLECTION_CHOICE" ||
    state.pendingChoice?.type !== "COLLECTION" ||
    state.pendingChoice.actor !== actor
  ) {
    throw new GameDomainError(
      "ACTION_NOT_ALLOWED",
      "現在は収集カードを選択できません。",
    );
  }

  if (!state.pendingChoice.candidateCardIds.includes(cardId)) {
    throw new GameDomainError(
      "INVALID_CHOICE",
      "指定したカードは収集候補ではありません。",
    );
  }

  const collectedCard = getCard(cardId);

  if (collectedCard.type !== "EMOTION") {
    throw new GameDomainError(
      "INVALID_CHOICE",
      "休憩カードは収集できません。",
    );
  }

  const playedCardIndex = state.playedCards.findIndex(
    (playedCard) => playedCard.cardId === cardId,
  );

  if (playedCardIndex < 0) {
    throw new GameDomainError(
      "INVALID_CHOICE",
      "指定したカードはプレイエリアにありません。",
    );
  }

  const previousCollection = state.collections[actor];
  const isDuplicateNumber = previousCollection.some((collectedCardId) => {
    const previousCard = getCard(collectedCardId);
    return (
      previousCard.type === "EMOTION" &&
      previousCard.number === collectedCard.number
    );
  });
  const penalty = isDuplicateNumber ? collectedCard.gemCount : 0;
  const tokens = state.starlightTokens[actor];
  const lostLight = Math.min(tokens.light, penalty);
  const nextCollection = [...previousCollection, cardId];
  const nextState: GameState = {
    ...state,
    playedCards: state.playedCards.toSpliced(playedCardIndex, 1),
    collections: {
      ...state.collections,
      [actor]: nextCollection,
    },
    starlightTokens: {
      ...state.starlightTokens,
      [actor]: {
        light: tokens.light - lostLight,
        dark: tokens.dark + lostLight,
      },
    },
  };

  if (nextState.starlightTokens[actor].light === 0) {
    return completeByLightLoss(nextState, actor, input);
  }

  if (hasEnlightenment(nextCollection)) {
    return completeByEnlightenment(nextState, actor, input);
  }

  const automaticDiscardTop = lastRestCardId(nextState.playedCards);

  if (automaticDiscardTop !== null) {
    return beginNextRound(
      nextState,
      actor,
      automaticDiscardTop,
      actor,
      input,
    );
  }

  return {
    ...nextState,
    ...updateActionMetadata(state, input),
    phase: "AWAITING_DISCARD_TOP_CHOICE",
    currentActor: actor,
    pendingChoice: {
      type: "DISCARD_TOP",
      actor,
      candidateCardIds: nextState.playedCards.map(
        (playedCard) => playedCard.cardId,
      ),
    },
  };
}

export function selectDiscardTop(input: SelectDiscardTopInput): GameState {
  const { state, actor, cardId } = input;

  assertChoiceActor(state, actor);

  if (
    state.phase !== "AWAITING_DISCARD_TOP_CHOICE" ||
    state.pendingChoice?.type !== "DISCARD_TOP" ||
    state.pendingChoice.actor !== actor
  ) {
    throw new GameDomainError(
      "ACTION_NOT_ALLOWED",
      "現在は捨て札トップを選択できません。",
    );
  }

  if (!state.pendingChoice.candidateCardIds.includes(cardId)) {
    throw new GameDomainError(
      "INVALID_CHOICE",
      "指定したカードは捨て札トップ候補ではありません。",
    );
  }

  return beginNextRound(state, actor, cardId, actor, input);
}
