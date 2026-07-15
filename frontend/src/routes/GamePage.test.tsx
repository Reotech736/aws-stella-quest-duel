import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameView } from "../api/types";
import { GamePage } from "./GamePage";

const { apiMock, navigateMock } = vi.hoisted(() => ({
  apiMock: {
    command: vi.fn(),
    game: vi.fn(),
    resign: vi.fn(),
  },
  navigateMock: vi.fn(),
}));

vi.mock("../api/client", () => ({
  ApiError: class ApiError extends Error {},
  api: apiMock,
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    accessToken: async () => "token",
  }),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
  useParams: () => ({ gameId: "game-1" }),
}));

const game: GameView = {
  gameId: "game-1",
  roomId: "CRA6GP",
  status: "IN_PROGRESS",
  version: 1,
  phase: "PLAYER_TURN_BEFORE_PLAY",
  viewerPlayerId: "OWNER",
  currentActorPlayerId: "OWNER",
  startPlayerId: "OWNER",
  blackStarHolderPlayerId: null,
  players: [
    {
      playerId: "OWNER",
      displayName: "player1",
      isViewer: true,
      hand: [{ cardId: "B1a", type: "EMOTION", color: "BLUE", number: 1 }],
      handCount: 1,
      collection: [],
      starlight: { light: 5, dark: 0 },
    },
    {
      playerId: "GUEST",
      displayName: "player2",
      isViewer: false,
      hand: [{ color: "RED" }],
      handCount: 1,
      collection: [],
      starlight: { light: 5, dark: 0 },
    },
  ],
  deck: { remainingCount: 42, topColor: "GREEN" },
  discardTop: { cardId: "R3a", type: "EMOTION", color: "RED", number: 3 },
  playedCards: [],
  pendingChoice: null,
  availableActions: {
    canDrawCards: true,
    canPlayCard: true,
    playableCardIds: ["B1a"],
    canEndTurn: false,
    collectionCandidateCardIds: [],
    discardTopCandidateCardIds: [],
    canResign: true,
  },
  result: null,
};

describe("GamePage", () => {
  beforeEach(() => {
    apiMock.command.mockReset();
    apiMock.game.mockReset();
    apiMock.resign.mockReset();
    navigateMock.mockReset();
  });

  it("表向きの捨て札は色と数字を表示する", async () => {
    apiMock.game.mockResolvedValue({ data: { game } });

    render(
      <MemoryRouter>
        <GamePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("捨て札")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "RED 3" })).toBeInTheDocument();
  });

  it("両プレイヤーの獲得カードを公開表示する", async () => {
    const gameWithCollections: GameView = {
      ...game,
      players: [
        {
          ...game.players[0],
          collection: [
            { cardId: "G4a", type: "EMOTION", color: "GREEN", number: 4 },
          ],
        },
        {
          ...game.players[1],
          collection: [
            { cardId: "Y6a", type: "EMOTION", color: "YELLOW", number: 6 },
          ],
        },
      ],
    };
    apiMock.game.mockResolvedValue({ data: { game: gameWithCollections } });

    render(
      <MemoryRouter>
        <GamePage />
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText("獲得カード")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "GREEN 4" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "YELLOW 6" })).toBeInTheDocument();
  });

  it.each([
    ["PLAYER_TURN_BEFORE_PLAY", "手札からプレイするカードを選んでください。"],
    [
      "PLAYER_TURN_AFTER_PLAY",
      "必要なら星明りでカードを引き、手番終了を押してください。",
    ],
    [
      "AWAITING_COLLECTION_CHOICE",
      "場のカードから獲得する感情カードを選んでください。",
    ],
    [
      "AWAITING_DISCARD_TOP_CHOICE",
      "残りのカードから次の捨て札トップを選んでください。",
    ],
  ] as const)("%s の操作指示を表示する", async (phase, message) => {
    apiMock.game.mockResolvedValue({ data: { game: { ...game, phase } } });

    render(
      <MemoryRouter>
        <GamePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("最後の手札を出して自動補充された枚数を通知する", async () => {
    const replenished: GameView = {
      ...game,
      version: 2,
      phase: "PLAYER_TURN_AFTER_PLAY",
      players: [
        {
          ...game.players[0],
          hand: [
            { cardId: "B2a", type: "EMOTION", color: "BLUE", number: 2 },
            { cardId: "G1a", type: "EMOTION", color: "GREEN", number: 1 },
            { cardId: "R3a", type: "EMOTION", color: "RED", number: 3 },
            { cardId: "Y4a", type: "EMOTION", color: "YELLOW", number: 4 },
            { cardId: "X1", type: "REST", color: "REST" },
          ],
          handCount: 5,
        },
        game.players[1],
      ],
    };
    apiMock.game.mockResolvedValue({ data: { game } });
    apiMock.command.mockResolvedValue({ data: { game: replenished } });

    render(
      <MemoryRouter>
        <GamePage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "BLUE 1" }));

    expect(
      await screen.findByText("手札が尽きたため、5枚補充されました。"),
    ).toBeInTheDocument();
  });

  it("ゲーム終了後にロビーへ戻れる", async () => {
    const completed: GameView = {
      ...game,
      status: "COMPLETED",
      phase: "COMPLETED",
      availableActions: {
        ...game.availableActions,
        canDrawCards: false,
        canPlayCard: false,
        playableCardIds: [],
        canResign: false,
      },
      result: {
        endReason: "LIGHT_LOST",
        winnerPlayerId: "GUEST",
        loserPlayerId: "OWNER",
      },
    };
    apiMock.game.mockResolvedValue({ data: { game: completed } });

    render(
      <MemoryRouter>
        <GamePage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "ロビーへ戻る" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });
});
