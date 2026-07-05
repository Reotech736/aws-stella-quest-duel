import { describe, expect, it } from "vitest";

import type { CardId } from "../../../src/domain/game/card";
import { GameDomainError } from "../../../src/domain/game/errors";
import { initializeGame } from "../../../src/domain/game/initialize-game";
import {
  determineRoundOutcome,
  endStartPlayerTurn,
} from "../../../src/domain/game/round";
import { playCard } from "../../../src/domain/game/turn";
import type { GameState, PlayedCard } from "../../../src/domain/game/types";

function playedCards(
  ownerCard: CardId,
  dummyCard: CardId,
  guestCard: CardId,
): PlayedCard[] {
  return [
    {
      actor: "OWNER",
      cardId: ownerCard,
    },
    {
      actor: "DUMMY",
      cardId: dummyCard,
    },
    {
      actor: "GUEST",
      cardId: guestCard,
    },
  ];
}

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

describe("determineRoundOutcome", () => {
  it("最大のリードカラーをプレイした参加者が勝つ", () => {
    const outcome = determineRoundOutcome(
      playedCards("B2a", "B5a", "G6a"),
      "R1a",
    );

    expect(outcome).toEqual({
      winner: "DUMMY",
      winningCardId: "B5a",
      reason: "LEAD",
      leadColor: "BLUE",
      trumpColor: "RED",
    });
  });

  it("最大のトランプカラーをプレイした参加者が勝つ", () => {
    const outcome = determineRoundOutcome(
      playedCards("B6a", "R2a", "R5a"),
      "R1a",
    );

    expect(outcome.winner).toBe("GUEST");
    expect(outcome.winningCardId).toBe("R5a");
    expect(outcome.reason).toBe("TRUMP");
  });

  it("捨て札トップと同色同数のスーパートランプが勝つ", () => {
    const outcome = determineRoundOutcome(
      playedCards("B6a", "R2a", "G1a"),
      "R2b",
    );

    expect(outcome.winner).toBe("DUMMY");
    expect(outcome.winningCardId).toBe("R2a");
    expect(outcome.reason).toBe("SUPER_TRUMP");
  });

  it("先にプレイされた同色同数カードと一致した後出しが勝つ", () => {
    const outcome = determineRoundOutcome(
      playedCards("B3a", "R6a", "B3b"),
      "G1a",
    );

    expect(outcome.winner).toBe("GUEST");
    expect(outcome.winningCardId).toBe("B3b");
    expect(outcome.reason).toBe("SUPER_TRUMP");
  });

  it("複数のスーパートランプでは最後にプレイされたカードが勝つ", () => {
    const outcome = determineRoundOutcome(
      playedCards("R3a", "B2a", "B2b"),
      "R3b",
    );

    expect(outcome.winner).toBe("GUEST");
    expect(outcome.winningCardId).toBe("B2b");
    expect(outcome.reason).toBe("SUPER_TRUMP");
  });

  it("休憩カードを勝者候補から除外する", () => {
    const outcome = determineRoundOutcome(
      playedCards("X1", "B2a", "X2"),
      "G1a",
    );

    expect(outcome.winner).toBe("DUMMY");
    expect(outcome.winningCardId).toBe("B2a");
    expect(outcome.reason).toBe("LEAD");
    expect(outcome.leadColor).toBe("BLUE");
  });

  it("捨て札トップが休憩カードならトランプなしとする", () => {
    const outcome = determineRoundOutcome(
      playedCards("B2a", "R6a", "B4a"),
      "X1",
    );

    expect(outcome.winner).toBe("GUEST");
    expect(outcome.winningCardId).toBe("B4a");
    expect(outcome.reason).toBe("LEAD");
    expect(outcome.trumpColor).toBeNull();
  });

  it("全員が休憩カードなら勝者なしとする", () => {
    const outcome = determineRoundOutcome(
      playedCards("X1", "X2", "X3"),
      "R1a",
    );

    expect(outcome).toEqual({
      winner: null,
      winningCardId: null,
      reason: "ALL_REST",
      leadColor: null,
      trumpColor: "RED",
    });
  });

  it("3枚揃う前の勝者判定を拒否する", () => {
    expect(() =>
      determineRoundOutcome(playedCards("R1a", "B2a", "G3a").slice(0, 2), "Y1a"),
    ).toThrow(RangeError);
  });
});

describe("endStartPlayerTurn", () => {
  it("その時点のデッキトップをダミーがプレイする", () => {
    const game = createGame({
      deck: ["R2a", "Y2a", "B2a"],
      hands: {
        OWNER: ["R1a", "G1a"],
        GUEST: ["B1a"],
      },
    });
    const afterPlay = playCard({
      state: game,
      actor: "OWNER",
      cardId: "R1a",
      actionAt: "2026-07-05T12:01:00.000Z",
      abandonAt: "2026-07-06T12:01:00.000Z",
      random: () => 0,
    });

    const result = endStartPlayerTurn({
      state: afterPlay,
      actor: "OWNER",
      actionAt: "2026-07-05T12:02:00.000Z",
      abandonAt: "2026-07-06T12:02:00.000Z",
      random: () => 0,
    });

    expect(result.playedCards).toEqual([
      {
        actor: "OWNER",
        cardId: "R1a",
      },
      {
        actor: "DUMMY",
        cardId: "B2a",
      },
    ]);
    expect(result.deck).toEqual(["R2a", "Y2a"]);
    expect(result.currentActor).toBe("GUEST");
    expect(result.phase).toBe("PLAYER_TURN_BEFORE_PLAY");
    expect(result.version).toBe(afterPlay.version + 1);
  });

  it("デッキが空なら捨て札トップを残して再構築する", () => {
    const game = createGame({
      phase: "PLAYER_TURN_AFTER_PLAY",
      deck: [],
      discardPile: ["R2a", "Y2a", "B2a"],
      playedCards: [
        {
          actor: "OWNER",
          cardId: "G1a",
        },
      ],
    });

    const result = endStartPlayerTurn({
      state: game,
      actor: "OWNER",
      actionAt: "2026-07-05T12:02:00.000Z",
      abandonAt: "2026-07-06T12:02:00.000Z",
      random: () => 0,
    });

    expect(result.playedCards.at(-1)).toEqual({
      actor: "DUMMY",
      cardId: expect.stringMatching(/^(R2a|Y2a)$/),
    });
    expect(result.discardPile).toEqual(["B2a"]);
  });

  it("スタートプレイヤー以外はダミー前の終了処理を実行できない", () => {
    const game = createGame({
      currentActor: "GUEST",
      phase: "PLAYER_TURN_AFTER_PLAY",
      playedCards: [
        {
          actor: "GUEST",
          cardId: "G1a",
        },
      ],
    });

    try {
      endStartPlayerTurn({
        state: game,
        actor: "GUEST",
        actionAt: "2026-07-05T12:02:00.000Z",
        abandonAt: "2026-07-06T12:02:00.000Z",
        random: () => 0,
      });
      throw new Error("エラーが発生しませんでした。");
    } catch (error) {
      expect(error).toBeInstanceOf(GameDomainError);
      expect((error as GameDomainError).code).toBe("ACTION_NOT_ALLOWED");
    }
  });
});
