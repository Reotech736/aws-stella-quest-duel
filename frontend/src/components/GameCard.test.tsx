import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GameCard } from "./GameCard";

describe("GameCard", () => {
  it.each([
    [1, 3],
    [2, 3],
    [3, 2],
    [4, 2],
    [5, 1],
    [6, 1],
  ])("数字%sに宝石%s個を表示する", (number, gems) => {
    render(
      <GameCard
        card={{ type: "EMOTION", color: "RED", number }}
      />,
    );

    expect(screen.getByLabelText(`宝石${gems}個`)).toBeInTheDocument();
  });

  it("裏向きカードでは数字を公開しない", () => {
    render(
      <GameCard
        card={{ type: "EMOTION", color: "BLUE", number: 6 }}
        faceDown
      />,
    );

    expect(
      screen.getByRole("img", { name: "青のカード（裏向き）" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("6")).not.toBeInTheDocument();
  });
});
