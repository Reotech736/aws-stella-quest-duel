import type { CardView, GameView } from "../api/types";

export type GamePlayerId = "OWNER" | "GUEST";

const colorLabels: Readonly<Record<string, string>> = {
  RED: "赤",
  YELLOW: "黄",
  BLUE: "青",
  GREEN: "緑",
  REST: "休憩",
};

const phaseLabels: Readonly<Record<GameView["phase"], string>> = {
  PLAYER_TURN_BEFORE_PLAY: "カードを選ぶ",
  PLAYER_TURN_AFTER_PLAY: "手番を終える",
  AWAITING_COLLECTION_CHOICE: "獲得カードを選ぶ",
  AWAITING_DISCARD_TOP_CHOICE: "次の捨て札を選ぶ",
  COMPLETED: "ゲーム終了",
  ABANDONED: "ゲーム終了",
};

export function colorLabel(color: string | null): string {
  if (color === null) return "なし";
  return colorLabels[color] ?? color;
}

export function phaseLabel(phase: GameView["phase"]): string {
  return phaseLabels[phase];
}

export function playerName(game: GameView, playerId: GamePlayerId): string {
  return (
    game.players.find((player) => player.playerId === playerId)?.displayName ??
    "プレイヤー"
  );
}

export function actorName(
  game: GameView,
  actor: GameView["playedCards"][number]["actor"],
): string {
  return actor === "DUMMY" ? "ダミー" : playerName(game, actor);
}

export function leadColor(game: GameView): string | null {
  return (
    game.playedCards.find((played) => played.card.color !== "REST")?.card
      .color ?? null
  );
}

export function trumpColor(discardTop: CardView | null): string | null {
  if (discardTop === null || discardTop.color === "REST") return null;
  return discardTop.color;
}

export function gemCount(number: number | undefined): number {
  if (number === undefined) return 0;
  if (number <= 2) return 3;
  if (number <= 4) return 2;
  return 1;
}
