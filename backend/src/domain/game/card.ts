export const EMOTION_COLORS = ["RED", "YELLOW", "BLUE", "GREEN"] as const;

export type EmotionColor = (typeof EMOTION_COLORS)[number];
export type CardColor = EmotionColor | "REST";
export type EmotionNumber = 1 | 2 | 3 | 4 | 5 | 6;
export type EmotionCardCopy = "a" | "b";
export type RestCardIndex = 1 | 2 | 3 | 4 | 5 | 6;

type EmotionColorCode = "R" | "Y" | "B" | "G";

export type EmotionCardId =
  `${EmotionColorCode}${EmotionNumber}${EmotionCardCopy}`;
export type RestCardId = `X${RestCardIndex}`;
export type CardId = EmotionCardId | RestCardId;

export interface EmotionCard {
  readonly id: EmotionCardId;
  readonly type: "EMOTION";
  readonly color: EmotionColor;
  readonly number: EmotionNumber;
  readonly gemCount: 1 | 2 | 3;
}

export interface RestCard {
  readonly id: RestCardId;
  readonly type: "REST";
  readonly color: "REST";
}

export type Card = EmotionCard | RestCard;

const emotionNumbers: readonly EmotionNumber[] = [1, 2, 3, 4, 5, 6];
const emotionCardCopies: readonly EmotionCardCopy[] = ["a", "b"];
const restCardIndexes: readonly RestCardIndex[] = [1, 2, 3, 4, 5, 6];

const colorCodes: Readonly<Record<EmotionColor, EmotionColorCode>> = {
  RED: "R",
  YELLOW: "Y",
  BLUE: "B",
  GREEN: "G",
};

function gemCountFor(number: EmotionNumber): 1 | 2 | 3 {
  if (number <= 2) {
    return 1;
  }

  if (number <= 4) {
    return 2;
  }

  return 3;
}

export function createCardSet(): Card[] {
  const emotionCards = EMOTION_COLORS.flatMap((color) =>
    emotionNumbers.flatMap((number) =>
      emotionCardCopies.map(
        (copy): EmotionCard => ({
          id: `${colorCodes[color]}${number}${copy}`,
          type: "EMOTION",
          color,
          number,
          gemCount: gemCountFor(number),
        }),
      ),
    ),
  );

  const restCards = restCardIndexes.map(
    (index): RestCard => ({
      id: `X${index}`,
      type: "REST",
      color: "REST",
    }),
  );

  return [...emotionCards, ...restCards];
}

const cardCatalog = new Map<CardId, Card>(
  createCardSet().map((card) => [card.id, card]),
);

export function createDeck(): CardId[] {
  return createCardSet().map((card) => card.id);
}

export function getCard(cardId: CardId): Card {
  const card = cardCatalog.get(cardId);

  if (card === undefined) {
    throw new Error(`存在しないカードIDです: ${cardId}`);
  }

  return card;
}
