const WINDOW_MILLISECONDS = 15 * 60 * 1000;
const BLOCK_MILLISECONDS = 15 * 60 * 1000;
const RETENTION_SECONDS = 24 * 60 * 60;
const FAILURE_LIMIT = 5;

export interface JoinGuardState {
  readonly windowStartedAt: string;
  readonly failedCount: number;
  readonly blockedUntil?: string;
  readonly updatedAt: string;
  readonly purgeAt: number;
}

export class JoinAttemptBlockedError extends Error {
  constructor(readonly blockedUntil: string) {
    super(`参加試行は${blockedUntil}まで制限されています。`);
    this.name = "JoinAttemptBlockedError";
  }
}

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label}は有効な日時にしてください。`);
  }
  return timestamp;
}

function toPurgeAt(timestamp: number): number {
  return Math.ceil(timestamp / 1000) + RETENTION_SECONDS;
}

export function isJoinAttemptBlocked(
  guard: JoinGuardState | null,
  now: string,
): boolean {
  const nowTimestamp = parseTimestamp(now, "now");
  if (guard?.blockedUntil === undefined) {
    return false;
  }

  return (
    parseTimestamp(guard.blockedUntil, "blockedUntil") > nowTimestamp
  );
}

export function recordJoinFailure(
  current: JoinGuardState | null,
  now: string,
): JoinGuardState {
  const nowTimestamp = parseTimestamp(now, "now");
  const activeBlockedUntil = current?.blockedUntil;

  if (
    current !== null &&
    activeBlockedUntil !== undefined &&
    isJoinAttemptBlocked(current, now)
  ) {
    throw new JoinAttemptBlockedError(activeBlockedUntil);
  }

  const currentWindowStartedAt =
    current === null
      ? null
      : parseTimestamp(current.windowStartedAt, "windowStartedAt");
  const windowExpired =
    currentWindowStartedAt === null ||
    nowTimestamp - currentWindowStartedAt >= WINDOW_MILLISECONDS;
  const windowStartedAt = windowExpired
    ? new Date(nowTimestamp).toISOString()
    : current!.windowStartedAt;
  const failedCount = windowExpired ? 1 : current!.failedCount + 1;
  const blockedUntil =
    failedCount >= FAILURE_LIMIT
      ? new Date(nowTimestamp + BLOCK_MILLISECONDS).toISOString()
      : undefined;
  const retentionBase = blockedUntil
    ? parseTimestamp(blockedUntil, "blockedUntil")
    : nowTimestamp;

  return {
    windowStartedAt,
    failedCount,
    ...(blockedUntil === undefined ? {} : { blockedUntil }),
    updatedAt: new Date(nowTimestamp).toISOString(),
    purgeAt: toPurgeAt(retentionBase),
  };
}
