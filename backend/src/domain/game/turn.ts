import { getCard, type CardId, type EmotionColor } from "./card";
import { drawFromPiles } from "./deck";
import { GameDomainError } from "./errors";
import type { RandomSource } from "./shuffle";
import type { GameState, PlayerId } from "./types";

const MAX_HAND_SIZE = 10;
const PAID_DRAW_LIMIT = 3;

interface ActionMetadata {
  readonly actionAt: string;
  readonly abandonAt: string;
}

export interface DrawCardsInput extends ActionMetadata {
  readonly state: GameState;
  readonly actor: PlayerId;
  readonly random: RandomSource;
}

export interface PlayCardInput extends ActionMetadata {
  readonly state: GameState;
  readonly actor: PlayerId;
  readonly cardId: CardId;
  readonly random: RandomSource;
}

function assertGameInProgress(state: GameState): void {
  if (state.status !== "IN_PROGRESS") {
    throw new GameDomainError(
      "GAME_ALREADY_ENDED",
      "終了済みのゲームは操作できません。",
    );
  }
}

function assertCurrentActor(state: GameState, actor: PlayerId): void {
  if (state.currentActor !== actor) {
    throw new GameDomainError(
      "NOT_CURRENT_ACTOR",
      "現在の手番プレイヤーではありません。",
    );
  }
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

export function getLeadColor(state: GameState): EmotionColor | null {
  for (const playedCard of state.playedCards) {
    const card = getCard(playedCard.cardId);

    if (card.type === "EMOTION") {
      return card.color;
    }
  }

  return null;
}

export function isCardPlayable(
  state: GameState,
  actor: PlayerId,
  cardId: CardId,
): boolean {
  const selectedCard = getCard(cardId);

  if (selectedCard.type === "REST") {
    return true;
  }

  const leadColor = getLeadColor(state);

  if (leadColor === null || selectedCard.color === leadColor) {
    return true;
  }

  return !state.hands[actor].some((handCardId) => {
    const handCard = getCard(handCardId);
    return handCard.type === "EMOTION" && handCard.color === leadColor;
  });
}

export function drawCards(input: DrawCardsInput): GameState {
  const { state, actor } = input;

  assertGameInProgress(state);
  assertCurrentActor(state, actor);

  if (
    state.phase !== "PLAYER_TURN_BEFORE_PLAY" &&
    state.phase !== "PLAYER_TURN_AFTER_PLAY"
  ) {
    throw new GameDomainError(
      "ACTION_NOT_ALLOWED",
      "現在のフェーズでは追加ドローできません。",
    );
  }

  const hand = state.hands[actor];
  const tokens = state.starlightTokens[actor];

  if (hand.length >= MAX_HAND_SIZE || tokens.light < 2) {
    throw new GameDomainError(
      "DRAW_NOT_ALLOWED",
      "手札枚数または星明りが追加ドローの条件を満たしていません。",
    );
  }

  const requestedCount = Math.min(
    PAID_DRAW_LIMIT,
    MAX_HAND_SIZE - hand.length,
  );
  const drawResult = drawFromPiles({
    deck: state.deck,
    discardPile: state.discardPile,
    count: requestedCount,
    random: input.random,
  });

  return {
    ...state,
    ...updateActionMetadata(state, input),
    deck: drawResult.deck,
    discardPile: drawResult.discardPile,
    hands: {
      ...state.hands,
      [actor]: [...hand, ...drawResult.drawnCards],
    },
    starlightTokens: {
      ...state.starlightTokens,
      [actor]: {
        light: tokens.light - 1,
        dark: tokens.dark + 1,
      },
    },
  };
}

function refillCountFor(lightTokens: number): number {
  return lightTokens === 1 ? 2 : lightTokens;
}

export function playCard(input: PlayCardInput): GameState {
  const { state, actor, cardId } = input;

  assertGameInProgress(state);
  assertCurrentActor(state, actor);

  if (state.phase !== "PLAYER_TURN_BEFORE_PLAY") {
    throw new GameDomainError(
      "ACTION_NOT_ALLOWED",
      "現在のフェーズではカードをプレイできません。",
    );
  }

  const hand = state.hands[actor];
  const cardIndex = hand.indexOf(cardId);

  if (cardIndex < 0) {
    throw new GameDomainError(
      "CARD_NOT_IN_HAND",
      "指定したカードは手札にありません。",
    );
  }

  if (!isCardPlayable(state, actor, cardId)) {
    throw new GameDomainError(
      "CARD_NOT_PLAYABLE",
      "リードカラーに従ってカードをプレイしてください。",
    );
  }

  const nextHand = hand.toSpliced(cardIndex, 1);
  let deck = [...state.deck];
  let discardPile = [...state.discardPile];

  if (nextHand.length === 0) {
    const refillResult = drawFromPiles({
      deck,
      discardPile,
      count: refillCountFor(state.starlightTokens[actor].light),
      random: input.random,
    });

    deck = refillResult.deck;
    discardPile = refillResult.discardPile;
    nextHand.push(...refillResult.drawnCards);
  }

  return {
    ...state,
    ...updateActionMetadata(state, input),
    phase: "PLAYER_TURN_AFTER_PLAY",
    deck,
    discardPile,
    hands: {
      ...state.hands,
      [actor]: nextHand,
    },
    playedCards: [
      ...state.playedCards,
      {
        actor,
        cardId,
      },
    ],
  };
}

export function assertCanEndTurn(state: GameState, actor: PlayerId): void {
  assertGameInProgress(state);
  assertCurrentActor(state, actor);

  if (state.phase !== "PLAYER_TURN_AFTER_PLAY") {
    throw new GameDomainError(
      "ACTION_NOT_ALLOWED",
      "カードをプレイする前に手番を終了できません。",
    );
  }
}
