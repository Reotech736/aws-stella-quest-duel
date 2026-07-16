import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AudioControls } from "../components/AudioControls";
import { AudioProvider } from "./AudioContext";

describe("AudioProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("初期状態では効果音をミュートしBGMを準備中とする", () => {
    render(
      <AudioProvider>
        <AudioControls />
      </AudioProvider>,
    );

    fireEvent.click(screen.getByText("音"));

    expect(screen.getByRole("checkbox", { name: "効果音" })).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "BGM（準備中）" }),
    ).toBeDisabled();
  });

  it("効果音設定をブラウザへ保存する", () => {
    render(
      <AudioProvider>
        <AudioControls />
      </AudioProvider>,
    );

    fireEvent.click(screen.getByText("音"));
    fireEvent.click(screen.getByRole("checkbox", { name: "効果音" }));

    expect(window.localStorage.getItem("stella-quest-duel.audio")).toContain(
      '"sfxEnabled":true',
    );
  });
});
