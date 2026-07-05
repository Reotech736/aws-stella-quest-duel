import { describe, expect, it } from "vitest";

import { GameDomainError } from "../../../src/domain/game/errors";
import {
  abandonGameIfExpired,
  resignGame,
} from "../../../src/domain/game/game-end";
import { initializeGame } from "../../../src/domain/game/initialize-game";
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

describe("resignGame", () => {
  it("手番外でも投了者を敗者、相手を勝者として終了する", () => {
    const game = createGame({
      currentActor: "OWNER",
      phase: "AWAITING_COLLECTION_CHOICE",
      pendingChoice: {
        type: "COLLECTION",
        actor: "OWNER",
        candidateCardIds: ["R1a"],
      },
    });

    const result = resignGame({
      state: game,
      actor: "GUEST",
      actionAt: "2026-07-05T13:00:00.000Z",
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.phase).toBe("COMPLETED");
    expect(result.pendingChoice).toBeNull();
    expect(result.version).toBe(game.version + 1);
    expect(result.lastActionAt).toBe("2026-07-05T13:00:00.000Z");
    expect(result.result).toEqual({
      endReason: "RESIGNATION",
      winner: "OWNER",
      loser: "GUEST",
      resignedBy: "GUEST",
      endedAt: "2026-07-05T13:00:00.000Z",
    });
  });

  it("終了済みゲームへの投了を拒否する", () => {
    const game = createGame({
      status: "ABANDONED",
      phase: "ABANDONED",
    });

    try {
      resignGame({
        state: game,
        actor: "OWNER",
        actionAt: "2026-07-05T13:00:00.000Z",
      });
      throw new Error("エラーが発生しませんでした。");
    } catch (error) {
      expect(error).toBeInstanceOf(GameDomainError);
      expect((error as GameDomainError).code).toBe("GAME_ALREADY_ENDED");
    }
  });
});

describe("abandonGameIfExpired", () => {
  it("放棄期限前は状態を変更しない", () => {
    const game = createGame();

    const result = abandonGameIfExpired(
      game,
      "2026-07-06T11:59:59.999Z",
    );

    expect(result.didAbandon).toBe(false);
    expect(result.state).toBe(game);
  });

  it("放棄期限と同時刻なら勝者なしで終了する", () => {
    const game = createGame();

    const result = abandonGameIfExpired(
      game,
      "2026-07-06T12:00:00.000Z",
    );

    expect(result.didAbandon).toBe(true);
    expect(result.state.status).toBe("ABANDONED");
    expect(result.state.phase).toBe("ABANDONED");
    expect(result.state.version).toBe(game.version + 1);
    expect(result.state.lastActionAt).toBe(game.lastActionAt);
    expect(result.state.abandonAt).toBe(game.abandonAt);
    expect(result.state.result).toEqual({
      endReason: "ABANDONED",
      winner: null,
      loser: null,
      resignedBy: null,
      endedAt: "2026-07-06T12:00:00.000Z",
    });
  });

  it("すでに終了したゲームは変更しない", () => {
    const game = createGame({
      status: "COMPLETED",
      phase: "COMPLETED",
    });

    const result = abandonGameIfExpired(
      game,
      "2026-07-07T12:00:00.000Z",
    );

    expect(result.didAbandon).toBe(false);
    expect(result.state).toBe(game);
  });

  it("不正な検出日時を拒否する", () => {
    const game = createGame();

    expect(() => abandonGameIfExpired(game, "invalid")).toThrow(RangeError);
  });
});
