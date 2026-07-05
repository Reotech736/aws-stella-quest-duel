import { PutCommand } from "@aws-sdk/lib-dynamodb";

import type { JoinGuardState } from "../../domain/room/join-guard";
import type { DocumentClientPort } from "./client";
import type { JoinGuardItem } from "./items";
import { joinGuardKey } from "./keys";

export class JoinGuardPersistenceConflictError extends Error {
  constructor(cause: unknown) {
    super("参加試行制限の条件付き書き込みが競合しました。", {
      cause,
    });
    this.name = "JoinGuardPersistenceConflictError";
  }
}

function isConditionalConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ConditionalCheckFailedException"
  );
}

function assertSameItem(userId: string, current: JoinGuardItem | null): void {
  const key = joinGuardKey(userId);
  if (
    current !== null &&
    (key.PK !== current.PK || key.SK !== current.SK)
  ) {
    throw new Error("更新対象のJoin Guardキーが一致しません。");
  }
}

export class JoinGuardRepository {
  readonly #client: DocumentClientPort;
  readonly #tableName: string;

  constructor(client: DocumentClientPort, tableName: string) {
    if (tableName.trim().length === 0) {
      throw new Error("DynamoDBテーブル名は空文字にできません。");
    }
    this.#client = client;
    this.#tableName = tableName;
  }

  async saveFailure(
    userId: string,
    next: JoinGuardState,
    current: JoinGuardItem | null,
  ): Promise<void> {
    assertSameItem(userId, current);
    const item: JoinGuardItem = {
      ...joinGuardKey(userId),
      entityType: "JOIN_GUARD",
      ...next,
    };

    const command =
      current === null
        ? new PutCommand({
            TableName: this.#tableName,
            Item: item,
            ConditionExpression:
              "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          })
        : new PutCommand({
            TableName: this.#tableName,
            Item: item,
            ConditionExpression:
              "windowStartedAt = :windowStartedAt AND failedCount = :failedCount AND updatedAt = :updatedAt AND " +
              (current.blockedUntil === undefined
                ? "attribute_not_exists(blockedUntil)"
                : "blockedUntil = :blockedUntil"),
            ExpressionAttributeValues: {
              ":windowStartedAt": current.windowStartedAt,
              ":failedCount": current.failedCount,
              ":updatedAt": current.updatedAt,
              ...(current.blockedUntil === undefined
                ? {}
                : {
                    ":blockedUntil": current.blockedUntil,
                  }),
            },
          });

    try {
      await this.#client.send(command);
    } catch (error) {
      if (isConditionalConflict(error)) {
        throw new JoinGuardPersistenceConflictError(error);
      }
      throw error;
    }
  }
}
