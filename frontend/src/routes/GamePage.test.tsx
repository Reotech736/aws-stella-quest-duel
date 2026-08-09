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
    window.localStorage.clear();
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
    expect(screen.getByRole("img", { name: "赤 3" })).toBeInTheDocument();
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
    expect(screen.getByRole("img", { name: "緑 4" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "黄 6" })).toBeInTheDocument();
  });

  it.each([
    [
      "PLAYER_TURN_BEFORE_PLAY",
      "手札からカードを選び、プレイを確定してください。",
    ],
    [
      "PLAYER_TURN_AFTER_PLAY",
      "必要なら星明りでカードを引き、手番を終了してください。",
    ],
    [
      "AWAITING_COLLECTION_CHOICE",
      "場から獲得する感情カードを選び、確定してください。",
    ],
    [
      "AWAITING_DISCARD_TOP_CHOICE",
      "残りから次の捨て札トップを選び、確定してください。",
    ],
  ] as const)("%s の操作指示を表示する", async (phase, message) => {
    apiMock.game.mockResolvedValue({ data: { game: { ...game, phase } } });

    render(
      <MemoryRouter>
        <GamePage />
      </MemoryRouter>,
    );

    expect((await screen.findAllByText(message)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("heading", { name: "次にすること" })).toBeInTheDocument();
    expect(screen.getByText("現在")).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole("button", { name: "青 1" }));
    expect(apiMock.command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "このカードを出す" }));

    expect(
      await screen.findAllByText("手札が尽きたため、5枚補充されました。"),
    ).not.toHaveLength(0);
  });

  it("同じカードを2回押すとプレイを確定する", async () => {
    const afterPlay: GameView = {
      ...game,
      version: 2,
      phase: "PLAYER_TURN_AFTER_PLAY",
      availableActions: {
        ...game.availableActions,
        canPlayCard: false,
        playableCardIds: [],
        canEndTurn: true,
      },
    };
    apiMock.game.mockResolvedValue({ data: { game } });
    apiMock.command.mockResolvedValue({ data: { game: afterPlay } });

    render(
      <MemoryRouter>
        <GamePage />
      </MemoryRouter>,
    );

    const card = await screen.findByRole("button", { name: "青 1" });
    fireEvent.click(card);
    expect(apiMock.command).not.toHaveBeenCalled();
    fireEvent.click(card);

    await waitFor(() => {
      expect(apiMock.command).toHaveBeenCalledWith(
        "token",
        game,
        { type: "PLAY_CARD", cardId: "B1a" },
        expect.any(String),
      );
    });
  });

  it("自動終了を選ぶとカードプレイ後に手番を終了する", async () => {
    const afterPlay: GameView = {
      ...game,
      version: 2,
      phase: "PLAYER_TURN_AFTER_PLAY",
      availableActions: {
        ...game.availableActions,
        canPlayCard: false,
        playableCardIds: [],
        canEndTurn: true,
      },
    };
    const afterEnd: GameView = {
      ...afterPlay,
      version: 3,
      currentActorPlayerId: "GUEST",
      phase: "PLAYER_TURN_BEFORE_PLAY",
      availableActions: {
        ...afterPlay.availableActions,
        canEndTurn: false,
      },
    };
    apiMock.game.mockResolvedValue({ data: { game } });
    apiMock.command
      .mockResolvedValueOnce({ data: { game: afterPlay } })
      .mockResolvedValueOnce({ data: { game: afterEnd } });

    render(
      <MemoryRouter>
        <GamePage />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: /カードを出したら手番を自動終了/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "青 1" }));
    fireEvent.click(screen.getByRole("button", { name: "このカードを出す" }));

    await waitFor(() => expect(apiMock.command).toHaveBeenCalledTimes(2));
    expect(apiMock.command.mock.calls[1]?.[2]).toEqual({ type: "END_TURN" });
    expect(window.localStorage.getItem("stella-quest-duel.auto-end-turn")).toBe("true");
  });

  it("星明りを5枚の表裏として表示し、内部の役割名を表示しない", async () => {
    apiMock.game.mockResolvedValue({ data: { game } });

    render(
      <MemoryRouter>
        <GamePage />
      </MemoryRouter>,
    );

    expect(
      (await screen.findAllByRole("img", {
        name: "星明り: 光5枚、闇0枚",
      })).length,
    ).toBe(2);
    expect(screen.queryByText("OWNER")).not.toBeInTheDocument();
    expect(screen.queryByText("GUEST")).not.toBeInTheDocument();
    expect(screen.queryByText("DUMMY")).not.toBeInTheDocument();
  });

  it("ルール画面に正しい重複収集ペナルティを表示する", async () => {
    apiMock.game.mockResolvedValue({ data: { game } });

    render(
      <MemoryRouter>
        <GamePage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "ルール" }));

    expect(
      screen.getByText(
        /数字1・2は3つ、3・4は2つ、5・6は1つを闇面にします。/,
      ),
    ).toBeInTheDocument();
  });

  it("ゲーム終了後に結果を閉じて盤面を確認し、再表示できる", async () => {
    const completed: GameView = {
      ...game,
      status: "COMPLETED",
      phase: "COMPLETED",
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

    fireEvent.click(
      await screen.findByRole("button", { name: "盤面を確認する" }),
    );

    expect(screen.queryByText("敗北")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "対戦結果を表示" }));
    expect(await screen.findByText("敗北")).toBeInTheDocument();
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
