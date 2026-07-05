import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";

import type {
  DocumentClientPort,
  SupportedDocumentCommand,
} from "../../../src/infrastructure/dynamodb/client";
import { createRequestItem } from "../../../src/infrastructure/dynamodb/item-builders";
import {
  decideIdempotency,
  RequestRepository,
} from "../../../src/infrastructure/dynamodb/request-repository";

class FakeDocumentClient implements DocumentClientPort {
  readonly commands: SupportedDocumentCommand[] = [];
  response: unknown = {};

  async send(command: SupportedDocumentCommand): Promise<unknown> {
    this.commands.push(command);
    return this.response;
  }
}

const stored = createRequestItem({
  scope: "GAME",
  scopeId: "game-1",
  requestId: "01970000-0000-7000-8000-000000000001",
  requestHash: "sha256:same",
  actorUserId: "user-1",
  resultStatus: "SUCCEEDED",
  resultVersion: 3,
  createdAt: "2026-07-05T12:00:00.000Z",
  purgeAt: 1_780_000_000,
});

describe("RequestRepository", () => {
  it.each([
    ["USER", "user-1", "USER#user-1"],
    ["ROOM", "A2B3C4", "ROOM#A2B3C4"],
    ["GAME", "game-1", "GAME#game-1"],
  ] as const)(
    "%sスコープの冪等性記録を強整合で取得する",
    async (type, id, expectedPk) => {
      const client = new FakeDocumentClient();
      client.response = {
        Item: {
          ...stored,
          PK: expectedPk,
          scope: type,
        },
      };
      const repository = new RequestRepository(client, "TestTable");

      const result = await repository.get(
        {
          type,
          id,
        },
        stored.requestId,
      );

      expect(result?.scope).toBe(type);
      const command = client.commands[0] as GetCommand;
      expect(command.input).toMatchObject({
        Key: {
          PK: expectedPk,
          SK: `REQUEST#${stored.requestId}`,
        },
        ConsistentRead: true,
      });
    },
  );

  it("未保存・同一リクエスト・キー再利用を区別する", () => {
    expect(
      decideIdempotency(null, {
        requestHash: "sha256:same",
        actorUserId: "user-1",
      }),
    ).toEqual({
      kind: "NEW",
    });

    expect(
      decideIdempotency(stored, {
        requestHash: "sha256:same",
        actorUserId: "user-1",
      }).kind,
    ).toBe("REPLAY");

    expect(
      decideIdempotency(stored, {
        requestHash: "sha256:different",
        actorUserId: "user-1",
      }).kind,
    ).toBe("CONFLICT");

    expect(
      decideIdempotency(stored, {
        requestHash: "sha256:same",
        actorUserId: "other-user",
      }).kind,
    ).toBe("CONFLICT");
  });

  it("記録がない場合はnullを返す", async () => {
    const client = new FakeDocumentClient();
    const repository = new RequestRepository(client, "TestTable");

    await expect(
      repository.get(
        {
          type: "USER",
          id: "user-1",
        },
        "request-1",
      ),
    ).resolves.toBeNull();
  });
});
