const EVENT_SEQUENCE_WIDTH = 12;
const MAX_EVENT_SEQUENCE = 999_999_999_999;

export interface DynamoKey {
  readonly PK: string;
  readonly SK: string;
}

function assertIdentifier(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label}は空文字にできません。`);
  }
}

export function roomKey(roomId: string): DynamoKey {
  assertIdentifier(roomId, "roomId");
  return {
    PK: `ROOM#${roomId}`,
    SK: "META",
  };
}

export function activeContextKey(userId: string): DynamoKey {
  assertIdentifier(userId, "userId");
  return {
    PK: `USER#${userId}`,
    SK: "ACTIVE_CONTEXT",
  };
}

export function joinGuardKey(userId: string): DynamoKey {
  assertIdentifier(userId, "userId");
  return {
    PK: `USER#${userId}`,
    SK: "JOIN_GUARD",
  };
}

export function gameStateKey(gameId: string): DynamoKey {
  assertIdentifier(gameId, "gameId");
  return {
    PK: `GAME#${gameId}`,
    SK: "STATE",
  };
}

export function gameEventKey(
  gameId: string,
  sequence: number,
  eventId: string,
): DynamoKey {
  assertIdentifier(gameId, "gameId");
  assertIdentifier(eventId, "eventId");

  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    sequence > MAX_EVENT_SEQUENCE
  ) {
    throw new RangeError(
      `event sequenceは1以上${MAX_EVENT_SEQUENCE}以下の整数にしてください。`,
    );
  }

  return {
    PK: `GAME#${gameId}`,
    SK: `EVENT#${sequence.toString().padStart(EVENT_SEQUENCE_WIDTH, "0")}#${eventId}`,
  };
}

function requestKey(
  partitionType: "USER" | "ROOM" | "GAME",
  partitionId: string,
  requestId: string,
): DynamoKey {
  assertIdentifier(partitionId, `${partitionType.toLowerCase()}Id`);
  assertIdentifier(requestId, "requestId");
  return {
    PK: `${partitionType}#${partitionId}`,
    SK: `REQUEST#${requestId}`,
  };
}

export function userRequestKey(
  userId: string,
  requestId: string,
): DynamoKey {
  return requestKey("USER", userId, requestId);
}

export function roomRequestKey(
  roomId: string,
  requestId: string,
): DynamoKey {
  return requestKey("ROOM", roomId, requestId);
}

export function gameRequestKey(
  gameId: string,
  requestId: string,
): DynamoKey {
  return requestKey("GAME", gameId, requestId);
}
