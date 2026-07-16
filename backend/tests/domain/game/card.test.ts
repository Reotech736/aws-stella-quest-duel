import { describe, expect, it } from "vitest";

import {
  EMOTION_COLORS,
  createCardSet,
  createDeck,
  getCard,
} from "../../../src/domain/game/card";

describe("createCardSet", () => {
  it("重複しない54枚のカードを生成する", () => {
    const cards = createCardSet();
    const cardIds = cards.map((card) => card.id);

    expect(cards).toHaveLength(54);
    expect(new Set(cardIds)).toHaveLength(54);
    expect(createDeck()).toEqual(cardIds);
  });

  it("各色に数字1から6が2枚ずつ存在する", () => {
    const emotionCards = createCardSet().filter(
      (card) => card.type === "EMOTION",
    );

    expect(emotionCards).toHaveLength(48);

    for (const color of EMOTION_COLORS) {
      const cardsOfColor = emotionCards.filter((card) => card.color === color);

      expect(cardsOfColor).toHaveLength(12);

      for (const number of [1, 2, 3, 4, 5, 6]) {
        expect(
          cardsOfColor.filter((card) => card.number === number),
        ).toHaveLength(2);
      }
    }
  });

  it("休憩カードを6枚生成する", () => {
    const restCards = createCardSet().filter((card) => card.type === "REST");

    expect(restCards.map((card) => card.id)).toEqual([
      "X1",
      "X2",
      "X3",
      "X4",
      "X5",
      "X6",
    ]);
  });

  it.each([
    ["R1a", 3],
    ["Y2b", 3],
    ["B3a", 2],
    ["G4b", 2],
    ["R5a", 1],
    ["Y6b", 1],
  ] as const)("%sの宝石数を%s個とする", (cardId, expectedGemCount) => {
    const card = getCard(cardId);

    expect(card.type).toBe("EMOTION");

    if (card.type === "EMOTION") {
      expect(card.gemCount).toBe(expectedGemCount);
    }
  });
});
