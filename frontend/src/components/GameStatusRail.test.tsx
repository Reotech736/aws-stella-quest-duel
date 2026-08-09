import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GameView } from "../api/types";
import { GameStatusRail } from "./GameStatusRail";

const game = {
  phase: "PLAYER_TURN_BEFORE_PLAY",
} as GameView;

describe("GameStatusRail", () => {
  it("対戦記録を最新5件からセッション内の全件へ展開できる", () => {
    const activityLog = [
      "記録1",
      "記録2",
      "記録3",
      "記録4",
      "記録5",
      "記録6",
    ];

    render(
      <GameStatusRail
        game={game}
        instruction="カードを選んでください。"
        leadColor="BLUE"
        trumpColor="RED"
        blackStarHolderName="中央"
        activityLog={activityLog}
      />,
    );

    expect(screen.queryByText("記録1")).not.toBeInTheDocument();
    expect(screen.getByText("記録6")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "すべて表示（6件）" }));

    expect(screen.getByText("記録1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "最新5件だけ表示" }),
    ).toHaveAttribute("aria-expanded", "true");
  });
});
