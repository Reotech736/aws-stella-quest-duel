import {
  GetCommand,
  type GetCommandOutput,
} from "@aws-sdk/lib-dynamodb";

import type { DocumentClientPort } from "./client";
import type { RequestItem } from "./items";
import {
  gameRequestKey,
  roomRequestKey,
  userRequestKey,
} from "./keys";

export interface RequestScope {
  readonly type: "USER" | "ROOM" | "GAME";
  readonly id: string;
}

export interface IdempotencyCandidate {
  readonly requestHash: string;
  readonly actorUserId: string;
}

export type IdempotencyDecision =
  | {
      readonly kind: "NEW";
    }
  | {
      readonly kind: "REPLAY";
      readonly request: RequestItem;
    }
  | {
      readonly kind: "CONFLICT";
      readonly request: RequestItem;
    };

function requestKeyFor(scope: RequestScope, requestId: string) {
  switch (scope.type) {
    case "USER":
      return userRequestKey(scope.id, requestId);
    case "ROOM":
      return roomRequestKey(scope.id, requestId);
    case "GAME":
      return gameRequestKey(scope.id, requestId);
  }
}

export function decideIdempotency(
  stored: RequestItem | null,
  candidate: IdempotencyCandidate,
): IdempotencyDecision {
  if (stored === null) {
    return {
      kind: "NEW",
    };
  }

  if (
    stored.requestHash === candidate.requestHash &&
    stored.actorUserId === candidate.actorUserId
  ) {
    return {
      kind: "REPLAY",
      request: stored,
    };
  }

  return {
    kind: "CONFLICT",
    request: stored,
  };
}

export class RequestRepository {
  readonly #client: DocumentClientPort;
  readonly #tableName: string;

  constructor(client: DocumentClientPort, tableName: string) {
    if (tableName.trim().length === 0) {
      throw new Error("DynamoDBテーブル名は空文字にできません。");
    }
    this.#client = client;
    this.#tableName = tableName;
  }

  async get(
    scope: RequestScope,
    requestId: string,
  ): Promise<RequestItem | null> {
    const response = (await this.#client.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: requestKeyFor(scope, requestId),
        ConsistentRead: true,
      }),
    )) as GetCommandOutput;

    if (response.Item === undefined) {
      return null;
    }
    if (response.Item.entityType !== "REQUEST") {
      throw new Error("取得したアイテムはREQUESTではありません。");
    }
    if (
      response.Item.scope !== scope.type ||
      response.Item.requestId !== requestId
    ) {
      throw new Error("取得した冪等性記録がリクエストキーと一致しません。");
    }

    return response.Item as RequestItem;
  }
}
