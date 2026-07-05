import { describe, expect, it } from "vitest";

import { drawFromPiles } from "../../../src/domain/game/deck";

describe("drawFromPiles", () => {
  it("配列末尾からカードを引く", () => {
    const result = drawFromPiles({
      deck: ["R1a", "Y2a", "B3a"],
      discardPile: ["G4a"],
      count: 2,
      random: () => 0,
    });

    expect(result.drawnCards).toEqual(["B3a", "Y2a"]);
    expect(result.deck).toEqual(["R1a"]);
    expect(result.discardPile).toEqual(["G4a"]);
  });

  it("捨て札トップを残してデッキを再構築する", () => {
    const result = drawFromPiles({
      deck: [],
      discardPile: ["R1a", "Y2a", "B3a"],
      count: 2,
      random: () => 0,
    });

    expect(result.drawnCards).toHaveLength(2);
    expect(new Set(result.drawnCards)).toEqual(new Set(["R1a", "Y2a"]));
    expect(result.discardPile).toEqual(["B3a"]);
    expect(result.deck).toEqual([]);
  });

  it("再構築後も不足する場合は引ける枚数だけ引く", () => {
    const result = drawFromPiles({
      deck: [],
      discardPile: ["R1a", "B3a"],
      count: 3,
      random: () => 0,
    });

    expect(result.drawnCards).toEqual(["R1a"]);
    expect(result.discardPile).toEqual(["B3a"]);
  });
});
