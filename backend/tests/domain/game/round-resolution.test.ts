import { describe, expect, it } from "vitest";

import type { CardId } from "../../../src/domain/game/card";
import { initializeGame } from "../../../src/domain/game/initialize-game";
import { endFinalPlayerTurn } from "../../../src/domain/game/round-resolution";
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

function createFinalTurnState(overrides: Partial<GameState> = {}): GameState {
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
    phase: "PLAYER_TURN_AFTER_PLAY",
    currentActor: "GUEST",
    playedCards: playedCards("B5a", "G1a", "B2a"),
    discardPile: ["R1a"],
    ...overrides,
  };
}

function endTurn(state: GameState): GameState {
  return endFinalPlayerTurn({
    state,
    actor: "GUEST",
    actionAt: "2026-07-05T12:10:00.000Z",
    abandonAt: "2026-07-06T12:10:00.000Z",
  });
}

describe("endFinalPlayerTurn", () => {
  it("人間勝者の収集カード選択へ進む", () => {
    const state = createFinalTurnState();

    const result = endTurn(state);

    expect(result.phase).toBe("AWAITING_COLLECTION_CHOICE");
    expect(result.currentActor).toBe("OWNER");
    expect(result.pendingChoice).toEqual({
      type: "COLLECTION",
      actor: "OWNER",
      candidateCardIds: ["B5a", "G1a", "B2a"],
    });
    expect(result.version).toBe(state.version + 1);
  });

  it("黒い星保持者が連勝すると光面を1枚失う", () => {
    const state = createFinalTurnState({
      blackStarHolder: "OWNER",
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

    const result = endTurn(state);

    expect(result.starlightTokens.OWNER).toEqual({
      light: 1,
      dark: 4,
    });
    expect(result.phase).toBe("AWAITING_COLLECTION_CHOICE");
  });

  it("連勝ペナルティで最後の光を失うと収集前に敗北する", () => {
    const state = createFinalTurnState({
      blackStarHolder: "OWNER",
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

    const result = endTurn(state);

    expect(result.status).toBe("COMPLETED");
    expect(result.phase).toBe("COMPLETED");
    expect(result.result).toEqual({
      endReason: "LIGHT_LOST",
      winner: "GUEST",
      loser: "OWNER",
      resignedBy: null,
      endedAt: "2026-07-05T12:10:00.000Z",
    });
    expect(result.collections.OWNER).toEqual([]);
    expect(result.discardPile).toEqual(["R1a"]);
    expect(result.playedCards).toEqual(state.playedCards);
    expect(result.blackStarHolder).toBe("OWNER");
  });

  it("ダミー勝利時は収集せず、ダミーカードを捨て札トップにする", () => {
    const state = createFinalTurnState({
      blackStarHolder: "OWNER",
      playedCards: playedCards("B2a", "B5a", "G1a"),
    });

    const result = endTurn(state);

    expect(result.phase).toBe("PLAYER_TURN_BEFORE_PLAY");
    expect(result.startPlayer).toBe("GUEST");
    expect(result.currentActor).toBe("GUEST");
    expect(result.blackStarHolder).toBeNull();
    expect(result.collections).toEqual(state.collections);
    expect(result.playedCards).toEqual([]);
    expect(result.discardPile.at(-1)).toBe("B5a");
  });

  it("ダミー勝利時も最後の休憩カードを捨て札トップにする", () => {
    const state = createFinalTurnState({
      playedCards: playedCards("X1", "B5a", "X2"),
    });

    const result = endTurn(state);

    expect(result.startPlayer).toBe("GUEST");
    expect(result.discardPile.at(-1)).toBe("X2");
  });

  it("全員休憩では黒い星保持者が次ラウンドを開始する", () => {
    const state = createFinalTurnState({
      blackStarHolder: "GUEST",
      playedCards: playedCards("X1", "X2", "X3"),
    });

    const result = endTurn(state);

    expect(result.startPlayer).toBe("GUEST");
    expect(result.currentActor).toBe("GUEST");
    expect(result.blackStarHolder).toBe("GUEST");
    expect(result.discardPile.at(-1)).toBe("X3");
    expect(result.playedCards).toEqual([]);
  });

  it("全員休憩で黒い星が中央なら同じスタートプレイヤーを維持する", () => {
    const state = createFinalTurnState({
      blackStarHolder: null,
      playedCards: playedCards("X1", "X2", "X3"),
    });

    const result = endTurn(state);

    expect(result.startPlayer).toBe("OWNER");
    expect(result.currentActor).toBe("OWNER");
    expect(result.blackStarHolder).toBeNull();
  });
});
