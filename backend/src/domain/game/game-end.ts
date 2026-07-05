import { GameDomainError } from "./errors";
import type { GameState, PlayerId } from "./types";

export interface ResignGameInput {
  readonly state: GameState;
  readonly actor: PlayerId;
  readonly actionAt: string;
}

export interface AbandonGameResult {
  readonly state: GameState;
  readonly didAbandon: boolean;
}

function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === "OWNER" ? "GUEST" : "OWNER";
}

function parseTimestamp(timestamp: string, label: string): number {
  const milliseconds = Date.parse(timestamp);

  if (!Number.isFinite(milliseconds)) {
    throw new RangeError(`${label}がISO 8601日時ではありません。`);
  }

  return milliseconds;
}

export function resignGame(input: ResignGameInput): GameState {
  const { state, actor, actionAt } = input;

  if (state.status !== "IN_PROGRESS") {
    throw new GameDomainError(
      "GAME_ALREADY_ENDED",
      "終了済みのゲームでは投了できません。",
    );
  }

  parseTimestamp(actionAt, "投了日時");

  return {
    ...state,
    status: "COMPLETED",
    version: state.version + 1,
    phase: "COMPLETED",
    pendingChoice: null,
    lastActionAt: actionAt,
    result: {
      endReason: "RESIGNATION",
      winner: otherPlayer(actor),
      loser: actor,
      resignedBy: actor,
      endedAt: actionAt,
    },
  };
}

export function abandonGameIfExpired(
  state: GameState,
  detectedAt: string,
): AbandonGameResult {
  if (state.status !== "IN_PROGRESS") {
    return {
      state,
      didAbandon: false,
    };
  }

  const abandonAt = parseTimestamp(state.abandonAt, "放棄期限");
  const detectedAtMilliseconds = parseTimestamp(detectedAt, "検出日時");

  if (detectedAtMilliseconds < abandonAt) {
    return {
      state,
      didAbandon: false,
    };
  }

  return {
    didAbandon: true,
    state: {
      ...state,
      status: "ABANDONED",
      version: state.version + 1,
      phase: "ABANDONED",
      pendingChoice: null,
      result: {
        endReason: "ABANDONED",
        winner: null,
        loser: null,
        resignedBy: null,
        endedAt: detectedAt,
      },
    },
  };
}
