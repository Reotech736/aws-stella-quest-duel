import { describe, expect, it } from "vitest";

import type { CardId } from "../../../src/domain/game/card";
import { GameDomainError } from "../../../src/domain/game/errors";
import { initializeGame } from "../../../src/domain/game/initialize-game";
import {
  endFinalPlayerTurn,
  selectCollection,
  selectDiscardTop,
} from "../../../src/domain/game/round-resolution";
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

function chooseCollection(
  state: GameState,
  cardId: CardId,
  actor: "OWNER" | "GUEST" = "OWNER",
): GameState {
  return selectCollection({
    state,
    actor,
    cardId,
    actionAt: "2026-07-05T12:11:00.000Z",
    abandonAt: "2026-07-06T12:11:00.000Z",
  });
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

describe("selectCollection", () => {
  it("自分以外がプレイした感情カードも収集できる", () => {
    const pendingChoice = endTurn(createFinalTurnState());

    const result = chooseCollection(pendingChoice, "G1a");

    expect(result.collections.OWNER).toEqual(["G1a"]);
    expect(result.playedCards.map((card) => card.cardId)).toEqual([
      "B5a",
      "B2a",
    ]);
    expect(result.phase).toBe("AWAITING_DISCARD_TOP_CHOICE");
    expect(result.pendingChoice).toEqual({
      type: "DISCARD_TOP",
      actor: "OWNER",
      candidateCardIds: ["B5a", "B2a"],
    });
  });

  it("同じ数字を収集すると宝石数と同じ光面を失う", () => {
    const state = createFinalTurnState({
      collections: {
        OWNER: ["R5b"],
        GUEST: [],
      },
    });
    const pendingChoice = endTurn(state);

    const result = chooseCollection(pendingChoice, "B5a");

    expect(result.collections.OWNER).toEqual(["R5b", "B5a"]);
    expect(result.starlightTokens.OWNER).toEqual({
      light: 2,
      dark: 3,
    });
    expect(result.status).toBe("IN_PROGRESS");
  });

  it("重複収集で最後の光を失うと収集カードを残して敗北する", () => {
    const state = createFinalTurnState({
      collections: {
        OWNER: ["R5b"],
        GUEST: [],
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
    const pendingChoice = endTurn(state);

    const result = chooseCollection(pendingChoice, "B5a");

    expect(result.status).toBe("COMPLETED");
    expect(result.result).toEqual({
      endReason: "LIGHT_LOST",
      winner: "GUEST",
      loser: "OWNER",
      resignedBy: null,
      endedAt: "2026-07-05T12:11:00.000Z",
    });
    expect(result.collections.OWNER).toEqual(["R5b", "B5a"]);
    expect(result.discardPile).toEqual(["R1a"]);
    expect(result.blackStarHolder).toBeNull();
  });

  it("数字1から6が揃うと悟りで勝利する", () => {
    const state = createFinalTurnState({
      playedCards: playedCards("Y6a", "G1a", "Y2a"),
      collections: {
        OWNER: ["R1a", "Y2b", "B3a", "G4a", "R5a"],
        GUEST: [],
      },
    });
    const pendingChoice = endTurn(state);

    const result = chooseCollection(pendingChoice, "Y6a");

    expect(result.status).toBe("COMPLETED");
    expect(result.result).toEqual({
      endReason: "ENLIGHTENMENT",
      winner: "OWNER",
      loser: "GUEST",
      resignedBy: null,
      endedAt: "2026-07-05T12:11:00.000Z",
    });
    expect(result.collections.OWNER).toEqual([
      "R1a",
      "Y2b",
      "B3a",
      "G4a",
      "R5a",
      "Y6a",
    ]);
    expect(result.discardPile).toEqual(["R1a"]);
  });

  it("残りカードに休憩カードがあれば自動でトップにして次ラウンドへ進む", () => {
    const state = createFinalTurnState({
      playedCards: playedCards("B5a", "X1", "B2a"),
    });
    const pendingChoice = endTurn(state);

    const result = chooseCollection(pendingChoice, "B5a");

    expect(result.phase).toBe("PLAYER_TURN_BEFORE_PLAY");
    expect(result.pendingChoice).toBeNull();
    expect(result.discardPile.at(-1)).toBe("X1");
    expect(result.blackStarHolder).toBe("OWNER");
    expect(result.startPlayer).toBe("OWNER");
    expect(result.currentActor).toBe("OWNER");
    expect(result.playedCards).toEqual([]);
  });

  it("収集候補ではないカードを拒否する", () => {
    const pendingChoice = endTurn(createFinalTurnState());

    expectDomainError(
      () => chooseCollection(pendingChoice, "G6a"),
      "INVALID_CHOICE",
    );
  });

  it("選択者ではないプレイヤーの操作を拒否する", () => {
    const pendingChoice = endTurn(createFinalTurnState());

    expectDomainError(
      () => chooseCollection(pendingChoice, "B5a", "GUEST"),
      "NOT_CURRENT_ACTOR",
    );
  });
});

describe("selectDiscardTop", () => {
  it("選んだカードをトップにして勝者から次ラウンドを始める", () => {
    const pendingCollection = endTurn(createFinalTurnState());
    const pendingDiscard = chooseCollection(pendingCollection, "G1a");

    const result = selectDiscardTop({
      state: pendingDiscard,
      actor: "OWNER",
      cardId: "B2a",
      actionAt: "2026-07-05T12:12:00.000Z",
      abandonAt: "2026-07-06T12:12:00.000Z",
    });

    expect(result.phase).toBe("PLAYER_TURN_BEFORE_PLAY");
    expect(result.discardPile.at(-1)).toBe("B2a");
    expect(result.playedCards).toEqual([]);
    expect(result.pendingChoice).toBeNull();
    expect(result.blackStarHolder).toBe("OWNER");
    expect(result.startPlayer).toBe("OWNER");
    expect(result.currentActor).toBe("OWNER");
  });

  it("候補ではないカードを捨て札トップにできない", () => {
    const pendingCollection = endTurn(createFinalTurnState());
    const pendingDiscard = chooseCollection(pendingCollection, "G1a");

    expectDomainError(
      () =>
        selectDiscardTop({
          state: pendingDiscard,
          actor: "OWNER",
          cardId: "Y6a",
          actionAt: "2026-07-05T12:12:00.000Z",
          abandonAt: "2026-07-06T12:12:00.000Z",
        }),
      "INVALID_CHOICE",
    );
  });
});
