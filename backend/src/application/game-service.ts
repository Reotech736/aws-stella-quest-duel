import type { CardId } from "../domain/game/card";
import { GameDomainError } from "../domain/game/errors";
import {
  abandonGameIfExpired,
  resignGame,
} from "../domain/game/game-end";
import {
  endFinalPlayerTurn,
  selectCollection,
  selectDiscardTop,
} from "../domain/game/round-resolution";
import { endStartPlayerTurn } from "../domain/game/round";
import { drawCards, playCard } from "../domain/game/turn";
import type { GameState, PlayerId } from "../domain/game/types";
import {
  createGameEventItem,
  createRequestItem,
} from "../infrastructure/dynamodb/item-builders";
import type {
  GameEventActionType,
  RequestItem,
  RoomItem,
} from "../infrastructure/dynamodb/items";
import type { SaveGameActionInput } from "../infrastructure/dynamodb/game-state-repository";
import {
  decideIdempotency,
  type RequestScope,
} from "../infrastructure/dynamodb/request-repository";
import type { AuthenticatedUser } from "./context-room-service";
import { ApplicationError } from "./errors";

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MILLISECONDS = 30 * DAY_MILLISECONDS;

export type GameCommand =
  | { readonly type: "DRAW_CARDS" }
  | { readonly type: "PLAY_CARD"; readonly cardId: CardId }
  | { readonly type: "END_TURN" }
  | { readonly type: "SELECT_COLLECTION"; readonly cardId: CardId }
  | { readonly type: "SELECT_DISCARD_TOP"; readonly cardId: CardId };

export interface GameRepositoryPort {
  get(
    gameId: string,
    consistency: "strong" | "eventual",
  ): Promise<GameState | null>;
  saveAction(input: SaveGameActionInput): Promise<void>;
}

export interface GameRoomRepositoryPort {
  getRoom(
    roomId: string,
    consistency: "strong" | "eventual",
  ): Promise<RoomItem | null>;
}

export interface GameRequestRepositoryPort {
  get(scope: RequestScope, requestId: string): Promise<RequestItem | null>;
}

export interface GameServiceDependencies {
  readonly games: GameRepositoryPort;
  readonly rooms: GameRoomRepositoryPort;
  readonly requests: GameRequestRepositoryPort;
  readonly now: () => Date;
  readonly createId: () => string;
  readonly random: () => number;
}

function epochSeconds(date: Date, milliseconds: number): number {
  return Math.ceil((date.getTime() + milliseconds) / 1000);
}

function playerIdFor(state: GameState, userId: string): PlayerId | null {
  if (state.players.OWNER.userId === userId) {
    return "OWNER";
  }
  if (state.players.GUEST.userId === userId) {
    return "GUEST";
  }
  return null;
}

function assertViewer(state: GameState, userId: string): PlayerId {
  const playerId = playerIdFor(state, userId);
  if (playerId === null) {
    throw new ApplicationError(
      "GAME_NOT_FOUND",
      "ゲームが見つかりません。",
      404,
    );
  }
  return playerId;
}

function mapDomainError(error: unknown): never {
  if (error instanceof GameDomainError) {
    throw new ApplicationError(error.code, error.message, 409);
  }
  throw error;
}

export class GameService {
  constructor(private readonly dependencies: GameServiceDependencies) {}

  async getGame(
    user: AuthenticatedUser,
    gameId: string,
  ): Promise<{ state: GameState; viewer: PlayerId }> {
    const state = await this.dependencies.games.get(gameId, "eventual");
    if (state === null) {
      throw new ApplicationError(
        "GAME_NOT_FOUND",
        "ゲームが見つかりません。",
        404,
      );
    }
    const viewer = assertViewer(state, user.userId);
    const current = await this.#abandonIfNeeded(state);
    return { state: current, viewer };
  }

  async executeCommand(
    user: AuthenticatedUser,
    gameId: string,
    expectedVersion: number,
    command: GameCommand,
    requestId: string,
    requestHash: string,
  ): Promise<{ state: GameState; viewer: PlayerId; replay: boolean }> {
    const replay = await this.#idempotency(
      user,
      gameId,
      requestId,
      requestHash,
    );
    if (replay) {
      const state = await this.#requiredGame(gameId, "strong");
      return {
        state,
        viewer: assertViewer(state, user.userId),
        replay: true,
      };
    }

    const state = await this.#requiredGame(gameId, "strong");
    const viewer = assertViewer(state, user.userId);
    const activeState = await this.#abandonIfNeeded(state);
    if (activeState.status !== "IN_PROGRESS") {
      throw new ApplicationError(
        "GAME_ALREADY_ENDED",
        "ゲームは終了しています。",
        409,
      );
    }
    if (activeState.version !== expectedVersion) {
      throw new ApplicationError(
        "VERSION_CONFLICT",
        "ゲーム状態が更新されています。",
        409,
      );
    }
    const now = this.dependencies.now();
    const metadata = {
      actionAt: now.toISOString(),
      abandonAt: new Date(
        now.getTime() + DAY_MILLISECONDS,
      ).toISOString(),
    };
    let next: GameState;
    try {
      switch (command.type) {
        case "DRAW_CARDS":
          next = drawCards({
            state: activeState,
            actor: viewer,
            random: this.dependencies.random,
            ...metadata,
          });
          break;
        case "PLAY_CARD":
          next = playCard({
            state: activeState,
            actor: viewer,
            cardId: command.cardId,
            random: this.dependencies.random,
            ...metadata,
          });
          break;
        case "END_TURN":
          next =
            activeState.startPlayer === viewer &&
            activeState.playedCards.length === 1
              ? endStartPlayerTurn({
                  state: activeState,
                  actor: viewer,
                  random: this.dependencies.random,
                  ...metadata,
                })
              : endFinalPlayerTurn({
                  state: activeState,
                  actor: viewer,
                  ...metadata,
                });
          break;
        case "SELECT_COLLECTION":
          next = selectCollection({
            state: activeState,
            actor: viewer,
            cardId: command.cardId,
            ...metadata,
          });
          break;
        case "SELECT_DISCARD_TOP":
          next = selectDiscardTop({
            state: activeState,
            actor: viewer,
            cardId: command.cardId,
            ...metadata,
          });
      }
    } catch (error) {
      mapDomainError(error);
    }

    const persisted = {
      ...next,
      nextEventSeq: activeState.nextEventSeq + 1,
    };
    await this.#saveUserAction({
      user,
      previous: activeState,
      next: persisted,
      requestId,
      requestHash,
      actionType: command.type,
      command,
      now,
    });
    return { state: persisted, viewer, replay: false };
  }

  async resign(
    user: AuthenticatedUser,
    gameId: string,
    expectedVersion: number,
    requestId: string,
    requestHash: string,
  ): Promise<{ state: GameState; viewer: PlayerId; replay: boolean }> {
    const replay = await this.#idempotency(
      user,
      gameId,
      requestId,
      requestHash,
    );
    if (replay) {
      const state = await this.#requiredGame(gameId, "strong");
      return {
        state,
        viewer: assertViewer(state, user.userId),
        replay: true,
      };
    }
    const state = await this.#requiredGame(gameId, "strong");
    const viewer = assertViewer(state, user.userId);
    if (state.version !== expectedVersion) {
      throw new ApplicationError(
        "VERSION_CONFLICT",
        "ゲーム状態が更新されています。",
        409,
      );
    }
    const now = this.dependencies.now();
    let ended: GameState;
    try {
      ended = resignGame({
        state,
        actor: viewer,
        actionAt: now.toISOString(),
      });
    } catch (error) {
      mapDomainError(error);
    }
    const persisted = {
      ...ended,
      nextEventSeq: state.nextEventSeq + 1,
    };
    await this.#saveUserAction({
      user,
      previous: state,
      next: persisted,
      requestId,
      requestHash,
      actionType: "GAME_ENDED",
      command: { type: "RESIGN" },
      now,
    });
    return { state: persisted, viewer, replay: false };
  }

  async #requiredGame(
    gameId: string,
    consistency: "strong" | "eventual",
  ): Promise<GameState> {
    const state = await this.dependencies.games.get(gameId, consistency);
    if (state === null) {
      throw new ApplicationError(
        "GAME_NOT_FOUND",
        "ゲームが見つかりません。",
        404,
      );
    }
    return state;
  }

  async #idempotency(
    user: AuthenticatedUser,
    gameId: string,
    requestId: string,
    requestHash: string,
  ): Promise<boolean> {
    const stored = await this.dependencies.requests.get(
      { type: "GAME", id: gameId },
      requestId,
    );
    const decision = decideIdempotency(stored, {
      actorUserId: user.userId,
      requestHash,
    });
    if (decision.kind === "CONFLICT") {
      throw new ApplicationError(
        "IDEMPOTENCY_KEY_REUSED",
        "同じ冪等性キーが異なる操作に使用されています。",
        409,
      );
    }
    return decision.kind === "REPLAY";
  }

  async #saveUserAction(input: {
    readonly user: AuthenticatedUser;
    readonly previous: GameState;
    readonly next: GameState;
    readonly requestId: string;
    readonly requestHash: string;
    readonly actionType: GameEventActionType;
    readonly command: GameCommand | { readonly type: "RESIGN" };
    readonly now: Date;
  }): Promise<void> {
    const event = createGameEventItem({
      gameId: input.next.gameId,
      eventId: this.dependencies.createId(),
      seq: input.previous.nextEventSeq,
      actorUserId: input.user.userId,
      actionType: input.actionType,
      payload: {
        version: input.next.version,
        ...(input.command.type === "PLAY_CARD"
          ? { playedCardId: input.command.cardId }
          : {}),
        ...(input.command.type === "SELECT_COLLECTION"
          ? { collectedCardId: input.command.cardId }
          : {}),
        ...(input.command.type === "SELECT_DISCARD_TOP"
          ? { discardTopCardId: input.command.cardId }
          : {}),
        ...(input.command.type === "DRAW_CARDS"
          ? {
              drawCount:
                input.next.hands[
                  assertViewer(input.next, input.user.userId)
                ].length -
                input.previous.hands[
                  assertViewer(input.previous, input.user.userId)
                ].length,
            }
          : {}),
        ...(input.next.result === null
          ? {}
          : {
              endReason: input.next.result.endReason,
            }),
      },
      createdAt: input.now.toISOString(),
      purgeAt: epochSeconds(input.now, THIRTY_DAYS_MILLISECONDS),
    });
    const request = createRequestItem({
      scope: "GAME",
      scopeId: input.next.gameId,
      requestId: input.requestId,
      requestHash: input.requestHash,
      actorUserId: input.user.userId,
      resultStatus: "SUCCEEDED",
      resultVersion: input.next.version,
      resultResourceId: input.next.gameId,
      createdAt: input.now.toISOString(),
      purgeAt: epochSeconds(input.now, DAY_MILLISECONDS),
    });
    await this.dependencies.games.saveAction({
      state: input.next,
      expectedVersion: input.previous.version,
      event,
      request,
      ...(input.next.status === "IN_PROGRESS"
        ? {}
        : {
            completion: await this.#completion(input.next),
            purgeAt: epochSeconds(
              input.now,
              THIRTY_DAYS_MILLISECONDS,
            ),
          }),
    });
  }

  async #abandonIfNeeded(state: GameState): Promise<GameState> {
    const now = this.dependencies.now();
    const result = abandonGameIfExpired(state, now.toISOString());
    if (!result.didAbandon) {
      return state;
    }
    const abandoned = {
      ...result.state,
      nextEventSeq: state.nextEventSeq + 1,
    };
    await this.dependencies.games.saveAction({
      state: abandoned,
      expectedVersion: state.version,
      event: createGameEventItem({
        gameId: state.gameId,
        eventId: this.dependencies.createId(),
        seq: state.nextEventSeq,
        actorUserId: "SYSTEM",
        actionType: "GAME_ABANDONED",
        payload: {
          version: abandoned.version,
          endReason: "ABANDONED",
        },
        createdAt: now.toISOString(),
        purgeAt: epochSeconds(now, THIRTY_DAYS_MILLISECONDS),
      }),
      completion: await this.#completion(abandoned),
      purgeAt: epochSeconds(now, THIRTY_DAYS_MILLISECONDS),
    });
    return abandoned;
  }

  async #completion(state: GameState) {
    const room = await this.dependencies.rooms.getRoom(
      state.roomId,
      "strong",
    );
    if (room === null || room.status !== "IN_GAME") {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "ゲームに対応するルームを取得できません。",
        500,
      );
    }
    const endedAt = state.result?.endedAt ?? this.dependencies.now().toISOString();
    return {
      room: {
        ...room,
        status: "CLOSED" as const,
        version: room.version + 1,
        closedAt: endedAt,
        closeReason:
          state.status === "ABANDONED"
            ? ("GAME_ABANDONED" as const)
            : ("GAME_COMPLETED" as const),
        purgeAt: Math.ceil(
          (Date.parse(endedAt) + THIRTY_DAYS_MILLISECONDS) / 1000,
        ),
      },
      expectedRoomVersion: room.version,
      ownerUserId: state.players.OWNER.userId,
      guestUserId: state.players.GUEST.userId,
    };
  }
}
