import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomView } from "../api/types";
import { WaitingRoomPage } from "./WaitingRoomPage";

const { apiMock, navigateMock } = vi.hoisted(() => ({
  apiMock: {
    leaveRoom: vi.fn(),
    room: vi.fn(),
  },
  navigateMock: vi.fn(),
}));

vi.mock("../api/client", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
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
  useParams: () => ({ roomId: "CRA6GP" }),
}));

const waitingRoom: RoomView = {
  roomId: "CRA6GP",
  status: "READY",
  version: 2,
  viewerRole: "GUEST",
  owner: { displayName: "player1" },
  guest: { displayName: "player2" },
  gameId: null,
  createdAt: "2026-07-16T00:00:00.000Z",
  waitingExpiresAt: "2026-07-17T00:00:00.000Z",
};

function closedRoom(): RoomView {
  return {
    ...waitingRoom,
    status: "CLOSED",
    version: 3,
  };
}

describe("WaitingRoomPage", () => {
  beforeEach(() => {
    apiMock.room.mockReset();
    apiMock.leaveRoom.mockReset();
    navigateMock.mockReset();
  });

  it("閉鎖済みルームを取得した場合はロビーへ戻る", async () => {
    apiMock.room.mockResolvedValue({ data: { room: closedRoom() } });

    render(
      <MemoryRouter>
        <WaitingRoomPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("退出時の競合後に閉鎖済みルームを取得した場合はロビーへ戻る", async () => {
    apiMock.room
      .mockResolvedValueOnce({ data: { room: waitingRoom } })
      .mockResolvedValueOnce({ data: { room: closedRoom() } });
    const { ApiError } = await import("../api/client");
    apiMock.leaveRoom.mockRejectedValue(
      new ApiError("VERSION_CONFLICT", "ルーム状態が更新されています。", 409),
    );

    render(
      <MemoryRouter>
        <WaitingRoomPage />
      </MemoryRouter>,
    );

    await screen.findByText("player2");
    fireEvent.click(screen.getByRole("button", { name: "ルームを退出" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("内部の役割名を利用者向けの名称に置き換える", async () => {
    apiMock.room.mockResolvedValue({ data: { room: waitingRoom } });

    render(
      <MemoryRouter>
        <WaitingRoomPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("ルーム作成者")).toBeInTheDocument();
    expect(screen.getByText("参加者")).toBeInTheDocument();
    expect(screen.queryByText("OWNER")).not.toBeInTheDocument();
    expect(screen.queryByText("GUEST")).not.toBeInTheDocument();
  });
});
