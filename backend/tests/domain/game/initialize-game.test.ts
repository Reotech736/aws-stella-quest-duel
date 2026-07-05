import { describe, expect, it } from "vitest";

import { initializeGame } from "../../../src/domain/game/initialize-game";

function initializeTestGame() {
  return initializeGame({
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
    startPlayer: "GUEST",
    lastActionAt: "2026-07-05T12:00:00.000Z",
    abandonAt: "2026-07-06T12:00:00.000Z",
    random: () => 0,
  });
}

describe("initializeGame", () => {
  it("各プレイヤーへ5枚配り、1枚を初期捨て札にする", () => {
    const game = initializeTestGame();

    expect(game.hands.OWNER).toHaveLength(5);
    expect(game.hands.GUEST).toHaveLength(5);
    expect(game.discardPile).toHaveLength(1);
    expect(game.deck).toHaveLength(43);

    const allCardIds = [
      ...game.deck,
      ...game.discardPile,
      ...game.hands.OWNER,
      ...game.hands.GUEST,
    ];

    expect(allCardIds).toHaveLength(54);
    expect(new Set(allCardIds)).toHaveLength(54);
  });

  it("決定済みのスタートプレイヤーから最初の手番を始める", () => {
    const game = initializeTestGame();

    expect(game.startPlayer).toBe("GUEST");
    expect(game.currentActor).toBe("GUEST");
    expect(game.phase).toBe("PLAYER_TURN_BEFORE_PLAY");
  });

  it("星明り、黒い星、収集エリアを初期状態にする", () => {
    const game = initializeTestGame();

    expect(game.starlightTokens).toEqual({
      OWNER: {
        light: 5,
        dark: 0,
      },
      GUEST: {
        light: 5,
        dark: 0,
      },
    });
    expect(game.blackStarHolder).toBeNull();
    expect(game.collections).toEqual({
      OWNER: [],
      GUEST: [],
    });
    expect(game.playedCards).toEqual([]);
    expect(game.pendingChoice).toBeNull();
  });

  it("デッキと捨て札の末尾をトップとして扱う", () => {
    const game = initializeTestGame();

    expect(game.discardPile.at(-1)).toBeDefined();
    expect(game.deck.at(-1)).toBeDefined();
  });

  it("同じユーザーを対戦相手として設定できない", () => {
    expect(() =>
      initializeGame({
        gameId: "game-1",
        roomId: "A2B3C4",
        players: {
          OWNER: {
            userId: "same-user",
            displayName: "Owner",
          },
          GUEST: {
            userId: "same-user",
            displayName: "Guest",
          },
        },
        startPlayer: "OWNER",
        lastActionAt: "2026-07-05T12:00:00.000Z",
        abandonAt: "2026-07-06T12:00:00.000Z",
        random: () => 0,
      }),
    ).toThrow("同じユーザーを両方のプレイヤーに設定できません。");
  });
});
