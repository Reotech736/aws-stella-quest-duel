import {
  getCard,
  type CardId,
  type EmotionCard,
  type EmotionColor,
} from "./card";
import { drawFromPiles } from "./deck";
import { GameDomainError } from "./errors";
import type { RandomSource } from "./shuffle";
import { assertCanEndTurn } from "./turn";
import type {
  GameActor,
  GameState,
  PlayedCard,
  PlayerId,
} from "./types";

export type RoundWinReason =
  | "SUPER_TRUMP"
  | "TRUMP"
  | "LEAD"
  | "ALL_REST";

export interface RoundOutcome {
  readonly winner: GameActor | null;
  readonly winningCardId: CardId | null;
  readonly reason: RoundWinReason;
  readonly leadColor: EmotionColor | null;
  readonly trumpColor: EmotionColor | null;
}

export interface EndStartPlayerTurnInput {
  readonly state: GameState;
  readonly actor: PlayerId;
  readonly actionAt: string;
  readonly abandonAt: string;
  readonly random: RandomSource;
}

interface PlayedEmotionCard {
  readonly playedCard: PlayedCard;
  readonly card: EmotionCard;
}

function emotionCardOf(playedCard: PlayedCard): PlayedEmotionCard | null {
  const card = getCard(playedCard.cardId);

  if (card.type === "REST") {
    return null;
  }

  return {
    playedCard,
    card,
  };
}

function sameFace(first: EmotionCard, second: EmotionCard): boolean {
  return first.color === second.color && first.number === second.number;
}

function findLastSuperTrump(
  playedCards: readonly PlayedCard[],
  discardTop: CardId,
): PlayedEmotionCard | null {
  const discardCard = getCard(discardTop);
  const earlierEmotionCards: EmotionCard[] = [];
  let lastSuperTrump: PlayedEmotionCard | null = null;

  for (const playedCard of playedCards) {
    const playedEmotion = emotionCardOf(playedCard);

    if (playedEmotion === null) {
      continue;
    }

    const matchesDiscard =
      discardCard.type === "EMOTION" &&
      sameFace(playedEmotion.card, discardCard);
    const matchesEarlier = earlierEmotionCards.some((earlierCard) =>
      sameFace(playedEmotion.card, earlierCard),
    );

    if (matchesDiscard || matchesEarlier) {
      lastSuperTrump = playedEmotion;
    }

    earlierEmotionCards.push(playedEmotion.card);
  }

  return lastSuperTrump;
}

function highestNumber(
  cards: readonly PlayedEmotionCard[],
): PlayedEmotionCard | null {
  let strongest: PlayedEmotionCard | null = null;

  for (const candidate of cards) {
    if (strongest === null || candidate.card.number > strongest.card.number) {
      strongest = candidate;
    }
  }

  return strongest;
}

export function determineRoundOutcome(
  playedCards: readonly PlayedCard[],
  discardTop: CardId,
): RoundOutcome {
  if (playedCards.length !== 3) {
    throw new RangeError(
      "ラウンド勝者判定には3枚のプレイ済みカードが必要です。",
    );
  }

  const playedEmotionCards = playedCards
    .map(emotionCardOf)
    .filter((card): card is PlayedEmotionCard => card !== null);
  const leadColor = playedEmotionCards.at(0)?.card.color ?? null;
  const discardCard = getCard(discardTop);
  const trumpColor =
    discardCard.type === "EMOTION" ? discardCard.color : null;

  if (playedEmotionCards.length === 0) {
    return {
      winner: null,
      winningCardId: null,
      reason: "ALL_REST",
      leadColor: null,
      trumpColor,
    };
  }

  const superTrump = findLastSuperTrump(playedCards, discardTop);

  if (superTrump !== null) {
    return {
      winner: superTrump.playedCard.actor,
      winningCardId: superTrump.playedCard.cardId,
      reason: "SUPER_TRUMP",
      leadColor,
      trumpColor,
    };
  }

  if (trumpColor !== null) {
    const strongestTrump = highestNumber(
      playedEmotionCards.filter((card) => card.card.color === trumpColor),
    );

    if (strongestTrump !== null) {
      return {
        winner: strongestTrump.playedCard.actor,
        winningCardId: strongestTrump.playedCard.cardId,
        reason: "TRUMP",
        leadColor,
        trumpColor,
      };
    }
  }

  const strongestLead = highestNumber(
    playedEmotionCards.filter((card) => card.card.color === leadColor),
  );

  if (strongestLead === null) {
    throw new Error("リードカラーのカードを特定できません。");
  }

  return {
    winner: strongestLead.playedCard.actor,
    winningCardId: strongestLead.playedCard.cardId,
    reason: "LEAD",
    leadColor,
    trumpColor,
  };
}

function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === "OWNER" ? "GUEST" : "OWNER";
}

export function endStartPlayerTurn(
  input: EndStartPlayerTurnInput,
): GameState {
  const { state, actor } = input;

  assertCanEndTurn(state, actor);

  if (
    actor !== state.startPlayer ||
    state.playedCards.length !== 1 ||
    state.playedCards[0]?.actor !== actor
  ) {
    throw new GameDomainError(
      "ACTION_NOT_ALLOWED",
      "ダミーの前に手番を終了できるのはスタートプレイヤーだけです。",
    );
  }

  const dummyDraw = drawFromPiles({
    deck: state.deck,
    discardPile: state.discardPile,
    count: 1,
    random: input.random,
  });
  const dummyCard = dummyDraw.drawnCards[0];

  if (dummyCard === undefined) {
    throw new Error("ダミーがプレイするカードを用意できません。");
  }

  return {
    ...state,
    version: state.version + 1,
    phase: "PLAYER_TURN_BEFORE_PLAY",
    currentActor: otherPlayer(state.startPlayer),
    deck: dummyDraw.deck,
    discardPile: dummyDraw.discardPile,
    playedCards: [
      ...state.playedCards,
      {
        actor: "DUMMY",
        cardId: dummyCard,
      },
    ],
    lastActionAt: input.actionAt,
    abandonAt: input.abandonAt,
  };
}
