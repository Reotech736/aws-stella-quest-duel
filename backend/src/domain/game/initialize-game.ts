import { createDeck, type CardId } from "./card";
import { shuffleCards, type RandomSource } from "./shuffle";
import {
  PLAYER_IDS,
  type GamePlayer,
  type GameState,
  type PlayerId,
} from "./types";

const INITIAL_HAND_SIZE = 5;
const INITIAL_LIGHT_TOKENS = 5;

export interface InitializeGameInput {
  readonly gameId: string;
  readonly roomId: string;
  readonly players: Record<PlayerId, Omit<GamePlayer, "playerId" | "role">>;
  readonly startPlayer: PlayerId;
  readonly lastActionAt: string;
  readonly abandonAt: string;
  readonly random: RandomSource;
}

function drawTopCard(deck: CardId[]): CardId {
  const card = deck.pop();

  if (card === undefined) {
    throw new Error("デッキにカードがありません。");
  }

  return card;
}

export function initializeGame(input: InitializeGameInput): GameState {
  if (input.players.OWNER.userId === input.players.GUEST.userId) {
    throw new Error("同じユーザーを両方のプレイヤーに設定できません。");
  }

  const deck = shuffleCards(createDeck(), input.random);
  const hands: Record<PlayerId, CardId[]> = {
    OWNER: [],
    GUEST: [],
  };

  for (let cardIndex = 0; cardIndex < INITIAL_HAND_SIZE; cardIndex += 1) {
    for (const playerId of PLAYER_IDS) {
      hands[playerId].push(drawTopCard(deck));
    }
  }

  const initialDiscard = drawTopCard(deck);

  return {
    gameId: input.gameId,
    roomId: input.roomId,
    status: "IN_PROGRESS",
    version: 1,
    players: {
      OWNER: {
        ...input.players.OWNER,
        playerId: "OWNER",
        role: "OWNER",
      },
      GUEST: {
        ...input.players.GUEST,
        playerId: "GUEST",
        role: "GUEST",
      },
    },
    phase: "PLAYER_TURN_BEFORE_PLAY",
    currentActor: input.startPlayer,
    startPlayer: input.startPlayer,
    blackStarHolder: null,
    deck,
    discardPile: [initialDiscard],
    hands,
    playedCards: [],
    collections: {
      OWNER: [],
      GUEST: [],
    },
    starlightTokens: {
      OWNER: {
        light: INITIAL_LIGHT_TOKENS,
        dark: 0,
      },
      GUEST: {
        light: INITIAL_LIGHT_TOKENS,
        dark: 0,
      },
    },
    pendingChoice: null,
    lastActionAt: input.lastActionAt,
    abandonAt: input.abandonAt,
    nextEventSeq: 1,
    result: null,
  };
}
