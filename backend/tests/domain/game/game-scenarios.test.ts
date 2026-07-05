import { describe, expect, it } from "vitest";

import { initializeGame } from "../../../src/domain/game/initialize-game";
import { endStartPlayerTurn } from "../../../src/domain/game/round";
import {
  endFinalPlayerTurn,
  selectCollection,
  selectDiscardTop,
} from "../../../src/domain/game/round-resolution";
import { drawCards, playCard } from "../../../src/domain/game/turn";
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

function actionTime(minute: number) {
  const minuteText = minute.toString().padStart(2, "0");

  return {
    actionAt: `2026-07-05T12:${minuteText}:00.000Z`,
    abandonAt: `2026-07-06T12:${minuteText}:00.000Z`,
  };
}

describe("ゲーム進行シナリオ", () => {
  it("プレイ後の追加ドローで変化したデッキトップをダミーがプレイする", () => {
    const game = createGame({
      deck: ["G1a", "G2a", "G3a", "B6a", "Y5a"],
      hands: {
        OWNER: ["R1a", "R2a"],
        GUEST: ["B2a"],
      },
    });
    const played = playCard({
      state: game,
      actor: "OWNER",
      cardId: "R1a",
      random: () => 0,
      ...actionTime(1),
    });
    const drawn = drawCards({
      state: played,
      actor: "OWNER",
      random: () => 0,
      ...actionTime(2),
    });
    const ended = endStartPlayerTurn({
      state: drawn,
      actor: "OWNER",
      random: () => 0,
      ...actionTime(3),
    });

    expect(drawn.hands.OWNER).toEqual(["R2a", "Y5a", "B6a", "G3a"]);
    expect(ended.playedCards.at(-1)).toEqual({
      actor: "DUMMY",
      cardId: "G2a",
    });
  });

  it("空手札の即時補充後に変化したデッキトップをダミーがプレイする", () => {
    const game = createGame({
      deck: ["G1a", "G2a", "B6a"],
      hands: {
        OWNER: ["R1a"],
        GUEST: ["B2a"],
      },
      starlightTokens: {
        OWNER: {
          light: 2,
          dark: 3,
        },
        GUEST: {
          light: 5,
          dark: 0,
        },
      },
    });
    const played = playCard({
      state: game,
      actor: "OWNER",
      cardId: "R1a",
      random: () => 0,
      ...actionTime(1),
    });
    const ended = endStartPlayerTurn({
      state: played,
      actor: "OWNER",
      random: () => 0,
      ...actionTime(2),
    });

    expect(played.hands.OWNER).toEqual(["B6a", "G2a"]);
    expect(ended.playedCards.at(-1)).toEqual({
      actor: "DUMMY",
      cardId: "G1a",
    });
  });

  it("人間2人とダミーの1ラウンドを解決して次ラウンドを開始する", () => {
    const game = createGame({
      deck: ["Y6a", "G1a"],
      discardPile: ["R3a"],
      hands: {
        OWNER: ["B5a", "R1a"],
        GUEST: ["B2a", "Y1a"],
      },
    });
    const ownerPlayed = playCard({
      state: game,
      actor: "OWNER",
      cardId: "B5a",
      random: () => 0,
      ...actionTime(1),
    });
    const afterDummy = endStartPlayerTurn({
      state: ownerPlayed,
      actor: "OWNER",
      random: () => 0,
      ...actionTime(2),
    });
    const guestPlayed = playCard({
      state: afterDummy,
      actor: "GUEST",
      cardId: "B2a",
      random: () => 0,
      ...actionTime(3),
    });
    const pendingCollection = endFinalPlayerTurn({
      state: guestPlayed,
      actor: "GUEST",
      ...actionTime(4),
    });
    const pendingDiscard = selectCollection({
      state: pendingCollection,
      actor: "OWNER",
      cardId: "B5a",
      ...actionTime(5),
    });
    const nextRound = selectDiscardTop({
      state: pendingDiscard,
      actor: "OWNER",
      cardId: "B2a",
      ...actionTime(6),
    });

    expect(nextRound.collections.OWNER).toEqual(["B5a"]);
    expect(nextRound.discardPile.at(-1)).toBe("B2a");
    expect(nextRound.blackStarHolder).toBe("OWNER");
    expect(nextRound.startPlayer).toBe("OWNER");
    expect(nextRound.currentActor).toBe("OWNER");
    expect(nextRound.phase).toBe("PLAYER_TURN_BEFORE_PLAY");
    expect(nextRound.playedCards).toEqual([]);
    expect(nextRound.version).toBe(game.version + 6);
  });
});
