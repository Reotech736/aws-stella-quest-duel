import type {
  GameResult,
  GameState,
  PlayerId,
} from "../../domain/game/types";
import type { GameStateItem } from "./items";
import { gameStateKey } from "./keys";

function userIdForPlayer(
  state: GameState,
  playerId: PlayerId | null,
): string | undefined {
  return playerId === null ? undefined : state.players[playerId].userId;
}

function playerIdForUser(
  item: GameStateItem,
  userId: string | undefined,
): PlayerId | null {
  if (userId === undefined) {
    return null;
  }

  if (item.players.OWNER.userId === userId) {
    return "OWNER";
  }

  if (item.players.GUEST.userId === userId) {
    return "GUEST";
  }

  throw new Error("終了結果のユーザーIDがゲーム参加者と一致しません。");
}

export function toGameStateItem(
  state: GameState,
  purgeAt?: number,
): GameStateItem {
  const winnerUserId =
    state.result === null
      ? undefined
      : userIdForPlayer(state, state.result.winner);
  const loserUserId =
    state.result === null
      ? undefined
      : userIdForPlayer(state, state.result.loser);
  const resignedBy =
    state.result === null
      ? undefined
      : userIdForPlayer(state, state.result.resignedBy);
  const resultAttributes =
    state.result === null
      ? {}
      : {
          endedAt: state.result.endedAt,
          endReason: state.result.endReason,
          ...(winnerUserId === undefined ? {} : { winnerUserId }),
          ...(loserUserId === undefined ? {} : { loserUserId }),
          ...(resignedBy === undefined ? {} : { resignedBy }),
        };
  const ttlAttribute = purgeAt === undefined ? {} : { purgeAt };

  return {
    ...gameStateKey(state.gameId),
    entityType: "GAME_STATE",
    gameId: state.gameId,
    roomId: state.roomId,
    status: state.status,
    version: state.version,
    players: state.players,
    phase: state.phase,
    currentActor: state.currentActor,
    startPlayer: state.startPlayer,
    blackStarHolder: state.blackStarHolder,
    deck: state.deck,
    discardPile: state.discardPile,
    hands: state.hands,
    playedCards: state.playedCards,
    collections: state.collections,
    starlightTokens: state.starlightTokens,
    pendingChoice: state.pendingChoice,
    lastActionAt: state.lastActionAt,
    abandonAt: state.abandonAt,
    nextEventSeq: state.nextEventSeq,
    ...resultAttributes,
    ...ttlAttribute,
  };
}

function restoreResult(item: GameStateItem): GameResult | null {
  if (item.endReason === undefined) {
    return null;
  }

  if (item.endedAt === undefined) {
    throw new Error("終了済みゲームにendedAtがありません。");
  }

  return {
    endReason: item.endReason,
    winner: playerIdForUser(item, item.winnerUserId),
    loser: playerIdForUser(item, item.loserUserId),
    resignedBy: playerIdForUser(item, item.resignedBy),
    endedAt: item.endedAt,
  };
}

export function fromGameStateItem(item: GameStateItem): GameState {
  return {
    gameId: item.gameId,
    roomId: item.roomId,
    status: item.status,
    version: item.version,
    players: item.players,
    phase: item.phase,
    currentActor: item.currentActor,
    startPlayer: item.startPlayer,
    blackStarHolder: item.blackStarHolder,
    deck: item.deck,
    discardPile: item.discardPile,
    hands: item.hands,
    playedCards: item.playedCards,
    collections: item.collections,
    starlightTokens: item.starlightTokens,
    pendingChoice: item.pendingChoice,
    lastActionAt: item.lastActionAt,
    abandonAt: item.abandonAt,
    nextEventSeq: item.nextEventSeq,
    result: restoreResult(item),
  };
}
