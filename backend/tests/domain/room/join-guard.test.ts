import { describe, expect, it } from "vitest";

import {
  isJoinAttemptBlocked,
  JoinAttemptBlockedError,
  recordJoinFailure,
  type JoinGuardState,
} from "../../../src/domain/room/join-guard";

describe("join guard", () => {
  it("15分以内の5回目の失敗から15分間ブロックする", () => {
    let guard: JoinGuardState | null = null;

    for (let minute = 0; minute < 5; minute += 1) {
      guard = recordJoinFailure(
        guard,
        `2026-07-05T12:0${minute}:00.000Z`,
      );
    }

    if (guard === null) {
      throw new Error("Join Guardが生成されませんでした。");
    }

    expect(guard).toMatchObject({
      windowStartedAt: "2026-07-05T12:00:00.000Z",
      failedCount: 5,
      blockedUntil: "2026-07-05T12:19:00.000Z",
      updatedAt: "2026-07-05T12:04:00.000Z",
    });
    expect(guard.purgeAt).toBe(
      Date.parse("2026-07-06T12:19:00.000Z") / 1000,
    );
    expect(
      isJoinAttemptBlocked(guard, "2026-07-05T12:18:59.999Z"),
    ).toBe(true);
    expect(
      isJoinAttemptBlocked(guard, "2026-07-05T12:19:00.000Z"),
    ).toBe(false);
  });

  it("15分経過後の失敗は新しいウィンドウの1回目にする", () => {
    const current = recordJoinFailure(
      null,
      "2026-07-05T12:00:00.000Z",
    );

    const next = recordJoinFailure(
      current,
      "2026-07-05T12:15:00.000Z",
    );

    expect(next.failedCount).toBe(1);
    expect(next.windowStartedAt).toBe("2026-07-05T12:15:00.000Z");
    expect(next.blockedUntil).toBeUndefined();
  });

  it("ブロック中は失敗回数を追加しない", () => {
    const current: JoinGuardState = {
      windowStartedAt: "2026-07-05T12:00:00.000Z",
      failedCount: 5,
      blockedUntil: "2026-07-05T12:20:00.000Z",
      updatedAt: "2026-07-05T12:05:00.000Z",
      purgeAt: Date.parse("2026-07-06T12:20:00.000Z") / 1000,
    };

    expect(() =>
      recordJoinFailure(current, "2026-07-05T12:10:00.000Z"),
    ).toThrow(JoinAttemptBlockedError);
  });

  it("不正な日時を拒否する", () => {
    expect(() => recordJoinFailure(null, "not-a-date")).toThrow(
      "nowは有効な日時にしてください。",
    );
  });
});
