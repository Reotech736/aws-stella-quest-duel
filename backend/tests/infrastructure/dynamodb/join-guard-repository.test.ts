import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";

import { recordJoinFailure } from "../../../src/domain/room/join-guard";
import type {
  DocumentClientPort,
  SupportedDocumentCommand,
} from "../../../src/infrastructure/dynamodb/client";
import type { JoinGuardItem } from "../../../src/infrastructure/dynamodb/items";
import {
  JoinGuardPersistenceConflictError,
  JoinGuardRepository,
} from "../../../src/infrastructure/dynamodb/join-guard-repository";

class FakeDocumentClient implements DocumentClientPort {
  readonly commands: SupportedDocumentCommand[] = [];
  error: unknown;

  async send(command: SupportedDocumentCommand): Promise<unknown> {
    this.commands.push(command);
    if (this.error !== undefined) {
      throw this.error;
    }
    return {};
  }
}

const current: JoinGuardItem = {
  PK: "USER#user-1",
  SK: "JOIN_GUARD",
  entityType: "JOIN_GUARD",
  windowStartedAt: "2026-07-05T12:00:00.000Z",
  failedCount: 1,
  updatedAt: "2026-07-05T12:00:00.000Z",
  purgeAt: 1_783_256_400,
};

describe("JoinGuardRepository", () => {
  it("初回失敗をアイテム未作成条件で保存する", async () => {
    const client = new FakeDocumentClient();
    const repository = new JoinGuardRepository(client, "TestTable");
    const next = recordJoinFailure(
      null,
      "2026-07-05T12:00:00.000Z",
    );

    await repository.saveFailure("user-1", next, null);

    const command = client.commands[0] as PutCommand;
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input).toMatchObject({
      TableName: "TestTable",
      Item: {
        PK: "USER#user-1",
        SK: "JOIN_GUARD",
        entityType: "JOIN_GUARD",
        failedCount: 1,
      },
      ConditionExpression:
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    });
  });

  it("既存状態の全競合判定属性を条件にして更新する", async () => {
    const client = new FakeDocumentClient();
    const repository = new JoinGuardRepository(client, "TestTable");
    const next = recordJoinFailure(
      current,
      "2026-07-05T12:01:00.000Z",
    );

    await repository.saveFailure("user-1", next, current);

    const command = client.commands[0] as PutCommand;
    expect(command.input.ConditionExpression).toBe(
      "windowStartedAt = :windowStartedAt AND failedCount = :failedCount AND updatedAt = :updatedAt AND attribute_not_exists(blockedUntil)",
    );
    expect(command.input.ExpressionAttributeValues).toEqual({
      ":windowStartedAt": current.windowStartedAt,
      ":failedCount": 1,
      ":updatedAt": current.updatedAt,
    });
  });

  it("条件競合を専用エラーへ変換する", async () => {
    const client = new FakeDocumentClient();
    client.error = {
      name: "ConditionalCheckFailedException",
    };
    const repository = new JoinGuardRepository(client, "TestTable");

    await expect(
      repository.saveFailure(
        "user-1",
        recordJoinFailure(current, "2026-07-05T12:01:00.000Z"),
        current,
      ),
    ).rejects.toThrow(JoinGuardPersistenceConflictError);
  });

  it("異なるユーザーの既存状態を更新対象にできない", async () => {
    const client = new FakeDocumentClient();
    const repository = new JoinGuardRepository(client, "TestTable");

    await expect(
      repository.saveFailure(
        "other-user",
        recordJoinFailure(current, "2026-07-05T12:01:00.000Z"),
        current,
      ),
    ).rejects.toThrow("更新対象のJoin Guardキーが一致しません。");
    expect(client.commands).toHaveLength(0);
  });
});
