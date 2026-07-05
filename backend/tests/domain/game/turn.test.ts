import { describe, expect, it } from "vitest";

import {
  createDeck,
  type CardId,
} from "../../../src/domain/game/card";
import { GameDomainError } from "../../../src/domain/game/errors";
import { initializeGame } from "../../../src/domain/game/initialize-game";
import {
  assertCanEndTurn,
  drawCards,
  getLeadColor,
  isCardPlayable,
  playCard,
} from "../../../src/domain/game/turn";
import type { GameState } from "../../../src/domain/game/types";

function createGame(overrides: Partial<GameState> = {}): GameState {
  const game = initializeGame({
    gameId: "game-1",
    roomId: "A2B3C4",
    players: {
      OWNER: {
        userId: "owner-user",
        displayName: "Owner",
      },
      GUEST: {
        userId: "guest-user",
        displayName: "Guest",
      },
    },
    startPlayer: "OWNER",
    lastActionAt: "2026-07-05T12:00:00.000Z",
    abandonAt: "2026-07-06T12:00:00.000Z",
    random: () => 0,
  });

  return {
    ...game,
    ...overrides,
  };
}

function actionMetadata() {
  return {
    actionAt: "2026-07-05T12:01:00.000Z",
    abandonAt: "2026-07-06T12:01:00.000Z",
    random: () => 0,
  };
}

function expectDomainError(
  action: () => unknown,
  expectedCode: GameDomainError["code"],
): void {
  try {
    action();
    throw new Error("エラーが発生しませんでした。");
  } catch (error) {
    expect(error).toBeInstanceOf(GameDomainError);
    expect((error as GameDomainError).code).toBe(expectedCode);
  }
}

describe("カードプレイ可否", () => {
  it("最初の感情カードをリードカラーとする", () => {
    const game = createGame({
      playedCards: [
        {
          actor: "OWNER",
          cardId: "X1",
        },
        {
          actor: "DUMMY",
          cardId: "B3a",
        },
      ],
    });

    expect(getLeadColor(game)).toBe("BLUE");
  });

  it("リードカラーを持つ場合は同色へ従う", () => {
    const game = createGame({
      currentActor: "GUEST",
      hands: {
        OWNER: ["G1a"],
        GUEST: ["R1a", "B2a", "Y3a"],
      },
      playedCards: [
        {
          actor: "OWNER",
          cardId: "B3a",
        },
      ],
    });

    expect(isCardPlayable(game, "GUEST", "B2a")).toBe(true);
    expect(isCardPlayable(game, "GUEST", "R1a")).toBe(false);
  });

  it("休憩カードはリードカラーを持っていてもプレイできる", () => {
    const game = createGame({
      currentActor: "GUEST",
      hands: {
        OWNER: ["G1a"],
        GUEST: ["B2a", "X1"],
      },
      playedCards: [
        {
          actor: "OWNER",
          cardId: "B3a",
        },
      ],
    });

    expect(isCardPlayable(game, "GUEST", "X1")).toBe(true);
  });

  it("リードカラーを持たない場合は別の色をプレイできる", () => {
    const game = createGame({
      currentActor: "GUEST",
      hands: {
        OWNER: ["G1a"],
        GUEST: ["R1a", "Y3a"],
      },
      playedCards: [
        {
          actor: "OWNER",
          cardId: "B3a",
        },
      ],
    });

    expect(isCardPlayable(game, "GUEST", "R1a")).toBe(true);
  });
});

describe("playCard", () => {
  it("手札からカードをプレイしてプレイ後フェーズへ進む", () => {
    const game = createGame({
      hands: {
        OWNER: ["R1a", "B2a"],
        GUEST: ["G3a"],
      },
    });

    const result = playCard({
      state: game,
      actor: "OWNER",
      cardId: "R1a",
      ...actionMetadata(),
    });

    expect(result.hands.OWNER).toEqual(["B2a"]);
    expect(result.playedCards.at(-1)).toEqual({
      actor: "OWNER",
      cardId: "R1a",
    });
    expect(result.phase).toBe("PLAYER_TURN_AFTER_PLAY");
    expect(result.version).toBe(game.version + 1);
    expect(result.lastActionAt).toBe("2026-07-05T12:01:00.000Z");
    expect(game.hands.OWNER).toEqual(["R1a", "B2a"]);
    expect(game.playedCards).toEqual([]);
  });

  it("最後の手札をプレイした直後に光面と同じ枚数を補充する", () => {
    const game = createGame({
      deck: ["R2a", "Y2a", "B2a", "G2a", "R3a"],
      hands: {
        OWNER: ["R1a"],
        GUEST: ["G3a"],
      },
      starlightTokens: {
        OWNER: {
          light: 3,
          dark: 2,
        },
        GUEST: {
          light: 5,
          dark: 0,
        },
      },
    });

    const result = playCard({
      state: game,
      actor: "OWNER",
      cardId: "R1a",
      ...actionMetadata(),
    });

    expect(result.hands.OWNER).toEqual(["R3a", "G2a", "B2a"]);
    expect(result.deck).toEqual(["R2a", "Y2a"]);
    expect(result.starlightTokens.OWNER).toEqual({
      light: 3,
      dark: 2,
    });
  });

  it("光面が1枚の場合は最後の手札のプレイ後に2枚補充する", () => {
    const game = createGame({
      deck: ["R2a", "Y2a"],
      hands: {
        OWNER: ["R1a"],
        GUEST: ["G3a"],
      },
      starlightTokens: {
        OWNER: {
          light: 1,
          dark: 4,
        },
        GUEST: {
          light: 5,
          dark: 0,
        },
      },
    });

    const result = playCard({
      state: game,
      actor: "OWNER",
      cardId: "R1a",
      ...actionMetadata(),
    });

    expect(result.hands.OWNER).toEqual(["Y2a", "R2a"]);
  });

  it("手札にないカードを拒否する", () => {
    const game = createGame({
      hands: {
        OWNER: ["R1a"],
        GUEST: ["G3a"],
      },
    });

    expectDomainError(
      () =>
        playCard({
          state: game,
          actor: "OWNER",
          cardId: "B2a",
          ...actionMetadata(),
        }),
      "CARD_NOT_IN_HAND",
    );
  });

  it("リードカラーに従わないカードを拒否する", () => {
    const game = createGame({
      currentActor: "GUEST",
      hands: {
        OWNER: ["G1a"],
        GUEST: ["R1a", "B2a"],
      },
      playedCards: [
        {
          actor: "OWNER",
          cardId: "B3a",
        },
      ],
    });

    expectDomainError(
      () =>
        playCard({
          state: game,
          actor: "GUEST",
          cardId: "R1a",
          ...actionMetadata(),
        }),
      "CARD_NOT_PLAYABLE",
    );
  });

  it("同じ手番に2枚目をプレイできない", () => {
    const game = createGame({
      phase: "PLAYER_TURN_AFTER_PLAY",
    });

    expectDomainError(
      () =>
        playCard({
          state: game,
          actor: "OWNER",
          cardId: game.hands.OWNER[0] as CardId,
          ...actionMetadata(),
        }),
      "ACTION_NOT_ALLOWED",
    );
  });

  it("終了済みゲームではプレイできない", () => {
    const game = createGame({
      status: "COMPLETED",
      phase: "COMPLETED",
    });

    expectDomainError(
      () =>
        playCard({
          state: game,
          actor: "OWNER",
          cardId: game.hands.OWNER[0] as CardId,
          ...actionMetadata(),
        }),
      "GAME_ALREADY_ENDED",
    );
  });
});

describe("drawCards", () => {
  it.each([
    [7, 3],
    [8, 2],
    [9, 1],
  ])("手札%s枚から%s枚引く", (handSize, expectedDrawCount) => {
    const hand = createDeck().slice(0, handSize);
    const game = createGame({
      deck: ["G1a", "G2a", "G3a"],
      hands: {
        OWNER: hand,
        GUEST: ["B1a"],
      },
    });

    const result = drawCards({
      state: game,
      actor: "OWNER",
      ...actionMetadata(),
    });

    expect(result.hands.OWNER).toHaveLength(handSize + expectedDrawCount);
    expect(result.starlightTokens.OWNER).toEqual({
      light: 4,
      dark: 1,
    });
  });

  it("カードプレイ後かつ手番終了前にも実行できる", () => {
    const game = createGame({
      phase: "PLAYER_TURN_AFTER_PLAY",
      deck: ["G1a", "G2a", "G3a"],
      hands: {
        OWNER: ["R1a"],
        GUEST: ["B1a"],
      },
    });

    const result = drawCards({
      state: game,
      actor: "OWNER",
      ...actionMetadata(),
    });

    expect(result.hands.OWNER).toEqual(["R1a", "G3a", "G2a", "G1a"]);
  });

  it.each([
    {
      handSize: 10,
      light: 5,
    },
    {
      handSize: 1,
      light: 1,
    },
  ])(
    "手札$handSize枚、光面$light枚では実行できない",
    ({ handSize, light }) => {
      const hand = createDeck().slice(0, handSize);
      const game = createGame({
        hands: {
          OWNER: hand,
          GUEST: ["B1a"],
        },
        starlightTokens: {
          OWNER: {
            light,
            dark: 5 - light,
          },
          GUEST: {
            light: 5,
            dark: 0,
          },
        },
      });

      expectDomainError(
        () =>
          drawCards({
            state: game,
            actor: "OWNER",
            ...actionMetadata(),
          }),
        "DRAW_NOT_ALLOWED",
      );
    },
  );

  it("1回ごとに状態を再検証して複数回実行できる", () => {
    const game = createGame({
      deck: ["G1a", "G2a", "G3a", "Y1a", "Y2a", "Y3a"],
      hands: {
        OWNER: ["R1a", "R2a", "R3a"],
        GUEST: ["B1a"],
      },
    });

    const firstDraw = drawCards({
      state: game,
      actor: "OWNER",
      ...actionMetadata(),
    });
    const secondDraw = drawCards({
      state: firstDraw,
      actor: "OWNER",
      ...actionMetadata(),
    });

    expect(firstDraw.hands.OWNER).toHaveLength(6);
    expect(secondDraw.hands.OWNER).toHaveLength(9);
    expect(secondDraw.starlightTokens.OWNER).toEqual({
      light: 3,
      dark: 2,
    });
    expect(secondDraw.version).toBe(game.version + 2);
  });

  it("プレイ前後に1回ずつ再検証しながら追加ドローできる", () => {
    const game = createGame({
      deck: [
        "G1a",
        "G2a",
        "G3a",
        "Y1a",
        "Y2a",
        "Y3a",
        "B1a",
        "B2a",
      ],
      hands: {
        OWNER: ["R1a", "R2a", "R3a"],
        GUEST: ["B3a"],
      },
    });

    const firstDraw = drawCards({
      state: game,
      actor: "OWNER",
      ...actionMetadata(),
    });
    const secondDraw = drawCards({
      state: firstDraw,
      actor: "OWNER",
      ...actionMetadata(),
    });
    const played = playCard({
      state: secondDraw,
      actor: "OWNER",
      cardId: "R1a",
      ...actionMetadata(),
    });
    const afterPlayDraw = drawCards({
      state: played,
      actor: "OWNER",
      ...actionMetadata(),
    });

    expect(firstDraw.hands.OWNER).toHaveLength(6);
    expect(secondDraw.hands.OWNER).toHaveLength(9);
    expect(played.hands.OWNER).toHaveLength(8);
    expect(afterPlayDraw.hands.OWNER).toHaveLength(10);
    expect(afterPlayDraw.starlightTokens.OWNER).toEqual({
      light: 2,
      dark: 3,
    });
  });

  it("別プレイヤーは追加ドローできない", () => {
    const game = createGame();

    expectDomainError(
      () =>
        drawCards({
          state: game,
          actor: "GUEST",
          ...actionMetadata(),
        }),
      "NOT_CURRENT_ACTOR",
    );
  });
});

describe("assertCanEndTurn", () => {
  it("カードプレイ後は手番終了できる", () => {
    const game = createGame({
      phase: "PLAYER_TURN_AFTER_PLAY",
    });

    expect(() => assertCanEndTurn(game, "OWNER")).not.toThrow();
  });

  it("カードプレイ前は手番終了できない", () => {
    const game = createGame();

    expectDomainError(
      () => assertCanEndTurn(game, "OWNER"),
      "ACTION_NOT_ALLOWED",
    );
  });

  it("別プレイヤーは操作できない", () => {
    const game = createGame({
      phase: "PLAYER_TURN_AFTER_PLAY",
    });

    expectDomainError(
      () => assertCanEndTurn(game, "GUEST"),
      "NOT_CURRENT_ACTOR",
    );
  });
});
