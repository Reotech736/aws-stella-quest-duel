import { describe, expect, it } from "vitest";

import { resignGame } from "../../src/domain/game/game-end";
import { initializeGame } from "../../src/domain/game/initialize-game";
import type { GameState } from "../../src/domain/game/types";
import {
  createGameView,
  type GamePlayerView,
} from "../../src/presentation/game-view";

function createGame(overrides: Partial<GameState> = {}): GameState {
  const game = initializeGame({
    gameId: "game-1",
    roomId: "A2B3C4",
    players: {
      OWNER: {
        userId: "owner-user-secret",
        displayName: "Owner",
      },
      GUEST: {
        userId: "guest-user-secret",
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
    deck: ["R1a", "B6a"],
    discardPile: ["Y2a"],
    hands: {
      OWNER: ["R3a", "X2"],
      GUEST: ["B4a", "G5a"],
    },
    collections: {
      OWNER: ["Y1a"],
      GUEST: ["G2a"],
    },
    ...overrides,
  };
}

function player(
  players: readonly GamePlayerView[],
  playerId: "OWNER" | "GUEST",
): GamePlayerView {
  const result = players.find((candidate) => candidate.playerId === playerId);

  if (result === undefined) {
    throw new Error(`${playerId}の表示情報がありません。`);
  }

  return result;
}

describe("createGameView", () => {
  it("本人の手札だけカードIDと数字を公開する", () => {
    const view = createGameView(createGame(), "OWNER");
    const owner = player(view.players, "OWNER");
    const guest = player(view.players, "GUEST");

    expect(owner.hand).toEqual([
      {
        cardId: "R3a",
        type: "EMOTION",
        color: "RED",
        number: 3,
      },
      {
        cardId: "X2",
        type: "REST",
        color: "REST",
      },
    ]);
    expect(guest.hand).toEqual([
      {
        color: "BLUE",
      },
      {
        color: "GREEN",
      },
    ]);
    expect(JSON.stringify(guest.hand)).not.toContain("cardId");
    expect(JSON.stringify(guest.hand)).not.toContain("number");
  });

  it("閲覧者が変わると手札の公開範囲を反転する", () => {
    const view = createGameView(createGame(), "GUEST");
    const owner = player(view.players, "OWNER");
    const guest = player(view.players, "GUEST");

    expect(owner.isViewer).toBe(false);
    expect(owner.hand).toEqual([
      {
        color: "RED",
      },
      {
        color: "REST",
      },
    ]);
    expect(guest.isViewer).toBe(true);
    expect(guest.hand[0]).toMatchObject({
      cardId: "B4a",
      number: 4,
    });
  });

  it("CognitoユーザーIDをレスポンスへ含めない", () => {
    const view = createGameView(createGame(), "OWNER");
    const serialized = JSON.stringify(view);

    expect(serialized).not.toContain("owner-user-secret");
    expect(serialized).not.toContain("guest-user-secret");
    expect(serialized).not.toContain("userId");
  });

  it("デッキは残り枚数とトップ色だけを公開する", () => {
    const view = createGameView(createGame(), "OWNER");

    expect(view.deck).toEqual({
      remainingCount: 2,
      topColor: "BLUE",
    });
    expect(JSON.stringify(view.deck)).not.toContain("B6a");
    expect(JSON.stringify(view.deck)).not.toContain("R1a");
    expect(JSON.stringify(view.deck)).not.toContain("number");
  });

  it("捨て札、プレイ済みカード、収集カードは完全公開する", () => {
    const game = createGame({
      playedCards: [
        {
          actor: "OWNER",
          cardId: "R6a",
        },
        {
          actor: "DUMMY",
          cardId: "X1",
        },
      ],
    });

    const view = createGameView(game, "GUEST");

    expect(view.discardTop).toEqual({
      cardId: "Y2a",
      type: "EMOTION",
      color: "YELLOW",
      number: 2,
    });
    expect(view.playedCards).toEqual([
      {
        actor: "OWNER",
        card: {
          cardId: "R6a",
          type: "EMOTION",
          color: "RED",
          number: 6,
        },
      },
      {
        actor: "DUMMY",
        card: {
          cardId: "X1",
          type: "REST",
          color: "REST",
        },
      },
    ]);
    expect(player(view.players, "OWNER").collection).toEqual([
      {
        cardId: "Y1a",
        type: "EMOTION",
        color: "YELLOW",
        number: 1,
      },
    ]);
  });

  it("現在の閲覧者が実行可能な操作だけを返す", () => {
    const game = createGame({
      currentActor: "GUEST",
      startPlayer: "OWNER",
      phase: "PLAYER_TURN_BEFORE_PLAY",
      hands: {
        OWNER: ["R1a"],
        GUEST: ["B2a", "R3a", "X2"],
      },
      playedCards: [
        {
          actor: "OWNER",
          cardId: "B1a",
        },
        {
          actor: "DUMMY",
          cardId: "G4a",
        },
      ],
    });

    const guestView = createGameView(game, "GUEST");
    const ownerView = createGameView(game, "OWNER");

    expect(guestView.availableActions).toEqual({
      canDrawCards: true,
      canPlayCard: true,
      playableCardIds: ["B2a", "X2"],
      canEndTurn: false,
      collectionCandidateCardIds: [],
      discardTopCandidateCardIds: [],
      canResign: true,
    });
    expect(ownerView.availableActions).toEqual({
      canDrawCards: false,
      canPlayCard: false,
      playableCardIds: [],
      canEndTurn: false,
      collectionCandidateCardIds: [],
      discardTopCandidateCardIds: [],
      canResign: true,
    });
  });

  it("選択候補は選択者の実行可能操作にだけ含める", () => {
    const game = createGame({
      currentActor: "OWNER",
      phase: "AWAITING_COLLECTION_CHOICE",
      pendingChoice: {
        type: "COLLECTION",
        actor: "OWNER",
        candidateCardIds: ["R6a", "B2a"],
      },
    });

    const ownerView = createGameView(game, "OWNER");
    const guestView = createGameView(game, "GUEST");

    expect(ownerView.pendingChoice).toEqual({
      type: "COLLECTION",
      actorPlayerId: "OWNER",
      candidateCardIds: ["R6a", "B2a"],
    });
    expect(ownerView.availableActions.collectionCandidateCardIds).toEqual([
      "R6a",
      "B2a",
    ]);
    expect(guestView.pendingChoice).toEqual(ownerView.pendingChoice);
    expect(guestView.availableActions.collectionCandidateCardIds).toEqual([]);
  });

  it("終了後は操作を無効化し、プレイヤーIDによる結果を返す", () => {
    const endedGame = resignGame({
      state: createGame(),
      actor: "GUEST",
      actionAt: "2026-07-05T13:00:00.000Z",
    });

    const view = createGameView(endedGame, "OWNER");

    expect(view.availableActions).toEqual({
      canDrawCards: false,
      canPlayCard: false,
      playableCardIds: [],
      canEndTurn: false,
      collectionCandidateCardIds: [],
      discardTopCandidateCardIds: [],
      canResign: false,
    });
    expect(view.result).toEqual({
      endReason: "RESIGNATION",
      winnerPlayerId: "OWNER",
      loserPlayerId: "GUEST",
      resignedByPlayerId: "GUEST",
      endedAt: "2026-07-05T13:00:00.000Z",
    });
  });
});
