import { describe, expect, it } from "vitest";

import { createDeck } from "../../../src/domain/game/card";
import { shuffleCards } from "../../../src/domain/game/shuffle";

describe("shuffleCards", () => {
  it("元のデッキを変更せず、同じ54枚を並べ替える", () => {
    const deck = createDeck();
    const originalDeck = [...deck];
    const shuffled = shuffleCards(deck, () => 0);

    expect(deck).toEqual(originalDeck);
    expect(shuffled).not.toEqual(originalDeck);
    expect(new Set(shuffled)).toEqual(new Set(originalDeck));
  });

  it.each([-0.1, 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "範囲外の乱数%sを拒否する",
    (randomValue) => {
      expect(() => shuffleCards(createDeck(), () => randomValue)).toThrow(
        RangeError,
      );
    },
  );
});
