import type {
  ApiErrorBody,
  ApiResponse,
  ContextView,
  GameView,
  RoomView,
} from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
  idempotencyKey?: string,
): Promise<ApiResponse<T>> {
  if (!apiBaseUrl) {
    throw new ApiError(
      "API_NOT_CONFIGURED",
      "VITE_API_BASE_URLが設定されていません。",
      0,
    );
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(idempotencyKey
        ? { "idempotency-key": idempotencyKey }
        : {}),
      ...init.headers,
    },
  });
  const body = (await response.json()) as ApiResponse<T> | ApiErrorBody;
  if (!response.ok || "error" in body) {
    const error = body as ApiErrorBody;
    throw new ApiError(
      error.error.code,
      error.error.message,
      response.status,
    );
  }
  return body as ApiResponse<T>;
}

export const api = {
  context(token: string) {
    return request<{ context: ContextView | null }>(
      "/v1/me/context",
      token,
    );
  },
  createRoom(token: string, key: string) {
    return request<{ room: RoomView }>(
      "/v1/rooms",
      token,
      { method: "POST", body: "{}" },
      key,
    );
  },
  joinRoom(token: string, roomId: string, key: string) {
    return request<{ room: RoomView }>(
      "/v1/rooms/join",
      token,
      {
        method: "POST",
        body: JSON.stringify({ roomId }),
      },
      key,
    );
  },
  room(token: string, roomId: string) {
    return request<{ room: RoomView }>(`/v1/rooms/${roomId}`, token);
  },
  leaveRoom(token: string, room: RoomView, key: string) {
    return request<{ left: boolean; roomClosed: boolean }>(
      `/v1/rooms/${room.roomId}/leave`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: room.version }),
      },
      key,
    );
  },
  startRoom(
    token: string,
    room: RoomView,
    startMethod: "RANDOM" | "OWNER_FIRST" | "GUEST_FIRST",
    key: string,
  ) {
    return request<{ room: RoomView; game: GameView }>(
      `/v1/rooms/${room.roomId}/start`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: room.version,
          startMethod,
        }),
      },
      key,
    );
  },
  game(token: string, gameId: string) {
    return request<{ game: GameView }>(`/v1/games/${gameId}`, token);
  },
  command(
    token: string,
    game: GameView,
    command: Record<string, unknown>,
    key: string,
  ) {
    return request<{ acceptedCommand: string; game: GameView }>(
      `/v1/games/${game.gameId}/commands`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: game.version,
          command,
        }),
      },
      key,
    );
  },
  resign(token: string, game: GameView, key: string) {
    return request<{ game: GameView }>(
      `/v1/games/${game.gameId}/resign`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: game.version,
          confirmed: true,
        }),
      },
      key,
    );
  },
};
