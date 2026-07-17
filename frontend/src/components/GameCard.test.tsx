import { fireEvent, render, screen } from "@testing-library/react";
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
    const { container } = render(
      <GameCard
        card={{ type: "EMOTION", color: "RED", number }}
      />,
    );

    expect(screen.getByLabelText(`宝石${gems}個`)).toBeInTheDocument();
    expect(container.querySelectorAll(".card-gem")).toHaveLength(gems * 2);
  });

  it.each([
    ["RED", "red"],
    ["BLUE", "blue"],
    ["GREEN", "green"],
    ["YELLOW", "yellow"],
  ])("%sの感情カードを共通レイヤーで表示する", (color, assetColor) => {
    const { container } = render(
      <GameCard card={{ type: "EMOTION", color, number: 4 }} />,
    );

    expect(
      container.querySelector(`[data-card-artwork='front-${assetColor}-4']`),
    ).toBeInTheDocument();
    expect(container.querySelector(".card-illustration")).toHaveAttribute(
      "src",
      `/assets/cards/${assetColor}/illustration-4.png`,
    );
    expect(container.querySelector(".card-frame")).toHaveAttribute(
      "src",
      `/assets/cards/${assetColor}/frame-${assetColor}.png`,
    );
    expect(container.querySelectorAll(".card-number")).toHaveLength(4);
    expect(container.querySelectorAll("[data-gem-slot='left']")).toHaveLength(2);
    expect(container.querySelectorAll("[data-gem-slot='right']")).toHaveLength(2);
    expect(container.querySelector("[data-gem-slot='center']")).not.toBeInTheDocument();
  });

  it("休憩カードを専用イラストとフレームで表示する", () => {
    const { container } = render(
      <GameCard card={{ type: "REST", color: "REST" }} />,
    );

    expect(container.querySelector("[data-card-artwork='front-rest']")).toBeInTheDocument();
    expect(container.querySelector(".card-illustration")).toHaveAttribute(
      "src",
      "/assets/cards/rest/illustration-rest.png",
    );
    expect(container.querySelector(".card-frame")).toHaveAttribute(
      "src",
      "/assets/cards/rest/frame-rest.png",
    );
    expect(container.querySelector(".card-number")).not.toBeInTheDocument();
    expect(container.querySelector(".card-gem")).not.toBeInTheDocument();
  });

  it("未対応色は従来表示へフォールバックする", () => {
    const { container } = render(
      <GameCard card={{ type: "EMOTION", color: "PURPLE", number: 4 }} />,
    );

    expect(container.querySelector(".card-artwork")).not.toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("画像の読み込みに失敗した場合は従来表示へフォールバックする", () => {
    const { container } = render(
      <GameCard card={{ type: "EMOTION", color: "RED", number: 3 }} />,
    );

    const illustration = container.querySelector(".card-illustration");
    expect(illustration).not.toBeNull();
    fireEvent.error(illustration!);

    expect(container.querySelector(".card-artwork")).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("裏向きカードでは数字を公開しない", () => {
    const { container } = render(
      <GameCard
        card={{ type: "EMOTION", color: "BLUE", number: 6 }}
        faceDown
      />,
    );

    expect(
      screen.getByRole("img", { name: "青のカード（裏向き）" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("6")).not.toBeInTheDocument();
    expect(container.querySelector("[data-card-artwork='back-blue']")).toBeInTheDocument();
    expect(container.querySelector(".card-back-image")).toHaveAttribute(
      "src",
      "/assets/cards/backs/back-blue.png",
    );
  });
});
