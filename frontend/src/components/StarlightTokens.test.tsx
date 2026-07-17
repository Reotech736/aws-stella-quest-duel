import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StarlightTokens } from "./StarlightTokens";

describe("StarlightTokens", () => {
  it("光面と闇面を指定枚数の画像で表示する", () => {
    const { container } = render(<StarlightTokens light={3} dark={2} />);

    expect(screen.getByRole("img", { name: "星明り: 光3枚、闇2枚" })).toBeInTheDocument();
    expect(
      container.querySelectorAll("img[src='/assets/game-pieces/starlight-light.png']"),
    ).toHaveLength(3);
    expect(
      container.querySelectorAll("img[src='/assets/game-pieces/starlight-dark.png']"),
    ).toHaveLength(2);
  });
});
