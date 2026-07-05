import { describe, expect, it } from "vitest";

import { abandonGameIfExpired, resignGame } from "../../../src/domain/game/game-end";
import { initializeGame } from "../../../src/domain/game/initialize-game";
import {
  fromGameStateItem,
  toGameStateItem,
} from "../../../src/infrastructure/dynamodb/game-state-mapper";

function createGame() {
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
    startPlayer: "OWNER",
    lastActionAt: "2026-07-05T12:00:00.000Z",
    abandonAt: "2026-07-06T12:00:00.000Z",
    random: () => 0,
  });
}

describe("game state mapper", () => {
  it("進行中ゲームを完全な内部状態のまま保存・復元する", () => {
    const game = createGame();

    const item = toGameStateItem(game);

    expect(item.PK).toBe("GAME#game-1");
    expect(item.SK).toBe("STATE");
    expect(item.entityType).toBe("GAME_STATE");
    expect(item.deck).toEqual(game.deck);
    expect(item.hands).toEqual(game.hands);
    expect(item.endReason).toBeUndefined();
    expect(item.purgeAt).toBeUndefined();
    expect(fromGameStateItem(item)).toEqual(game);
  });

  it("終了結果のプレイヤーIDをCognitoユーザーIDへ変換する", () => {
    const resigned = resignGame({
      state: createGame(),
      actor: "GUEST",
      actionAt: "2026-07-05T13:00:00.000Z",
    });

    const item = toGameStateItem(resigned, 1_783_256_400);

    expect(item.endReason).toBe("RESIGNATION");
    expect(item.winnerUserId).toBe("owner-user");
    expect(item.loserUserId).toBe("guest-user");
    expect(item.resignedBy).toBe("guest-user");
    expect(item.endedAt).toBe("2026-07-05T13:00:00.000Z");
    expect(item.purgeAt).toBe(1_783_256_400);
    expect(fromGameStateItem(item)).toEqual(resigned);
  });

  it("放棄終了では勝者と敗者を保存しない", () => {
    const abandoned = abandonGameIfExpired(
      createGame(),
      "2026-07-06T12:00:00.000Z",
    ).state;

    const item = toGameStateItem(abandoned);

    expect(item.endReason).toBe("ABANDONED");
    expect(item.winnerUserId).toBeUndefined();
    expect(item.loserUserId).toBeUndefined();
    expect(item.resignedBy).toBeUndefined();
    expect("winnerUserId" in item).toBe(false);
    expect("loserUserId" in item).toBe(false);
    expect("resignedBy" in item).toBe(false);
    expect(fromGameStateItem(item)).toEqual(abandoned);
  });

  it("参加者ではない終了結果ユーザーIDを拒否する", () => {
    const item = {
      ...toGameStateItem(createGame()),
      status: "COMPLETED" as const,
      phase: "COMPLETED" as const,
      endReason: "LIGHT_LOST" as const,
      endedAt: "2026-07-05T13:00:00.000Z",
      winnerUserId: "unknown-user",
      loserUserId: "guest-user",
    };

    expect(() => fromGameStateItem(item)).toThrow(
      "終了結果のユーザーIDがゲーム参加者と一致しません。",
    );
  });
});
