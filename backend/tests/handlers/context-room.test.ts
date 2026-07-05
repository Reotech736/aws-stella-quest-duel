import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";

import type { ContextRoomService } from "../../src/application/context-room-service";
import { ApplicationError } from "../../src/application/errors";
import { createContextRoomHandler } from "../../src/handlers/context-room";
import type { RoomItem } from "../../src/infrastructure/dynamodb/items";

function event(
  routeKey: string,
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: "2.0",
    routeKey,
    rawPath: routeKey.split(" ")[1] ?? "/",
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "test",
      apiId: "test",
      domainName: "test",
      domainPrefix: "test",
      http: {
        method: routeKey.split(" ")[0] ?? "GET",
        path: "/",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "vitest",
      },
      requestId: "trace-1",
      routeKey,
      stage: "$default",
      time: "05/Jul/2026:12:00:00 +0000",
      timeEpoch: 1_783_256_400_000,
      authorizer: {
        principalId: "owner-user",
        integrationLatency: 0,
        jwt: {
          claims: {
            sub: "owner-user",
            username: "Owner",
          },
          scopes: [],
        },
      },
    },
    isBase64Encoded: false,
    ...overrides,
  };
}

const room: RoomItem = {
  PK: "ROOM#A2B3C4",
  SK: "META",
  entityType: "ROOM",
  roomId: "A2B3C4",
  status: "WAITING",
  ownerUserId: "owner-user",
  ownerDisplayName: "Owner",
  version: 1,
  createdAt: "2026-07-05T12:00:00.000Z",
  waitingExpiresAt: "2026-07-06T12:00:00.000Z",
};

describe("context-room handler", () => {
  it("ルーム作成をアプリケーションサービスへ渡して公開レスポンスを返す", async () => {
    const createRoom = vi.fn().mockResolvedValue({
      room,
      replay: false,
    });
    const handler = createContextRoomHandler({
      createRoom,
    } as unknown as ContextRoomService);

    const response = await handler(
      event("POST /v1/rooms", {
        headers: {
          "idempotency-key": "request-1",
        },
        body: "{}",
      }),
    );
    const body = JSON.parse(response.body ?? "{}");

    expect(response.statusCode).toBe(201);
    expect(createRoom).toHaveBeenCalledWith(
      {
        userId: "owner-user",
        displayName: "Owner",
      },
      "request-1",
      expect.any(String),
    );
    expect(body.data.room).toMatchObject({
      roomId: "A2B3C4",
      owner: {
        displayName: "Owner",
      },
      guest: null,
    });
    expect(body.data.room.ownerUserId).toBeUndefined();
  });

  it("不正な参加用ルームIDを400にする", async () => {
    const handler = createContextRoomHandler({
      joinRoom: vi.fn().mockRejectedValue(
        new ApplicationError(
          "VALIDATION_ERROR",
          "ルームIDの形式が不正です。",
          400,
        ),
      ),
    } as unknown as ContextRoomService);
    const response = await handler(
      event("POST /v1/rooms/join", {
        headers: {
          "idempotency-key": "request-1",
        },
        body: JSON.stringify({
          roomId: "I00000",
        }),
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body ?? "{}").error.code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("JWTのユーザー情報がない場合は401にする", async () => {
    const handler = createContextRoomHandler(
      {} as unknown as ContextRoomService,
    );
    const unauthorized = event("GET /v1/me/context");
    unauthorized.requestContext.authorizer.jwt.claims = {};

    const response = await handler(unauthorized);

    expect(response.statusCode).toBe(401);
  });
});
