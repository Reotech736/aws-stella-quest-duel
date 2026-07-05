import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { CardView, GameView } from "../api/types";
import { useAuth } from "../auth/AuthContext";

function Card({
  card,
  disabled,
  onClick,
}: {
  readonly card: CardView;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}) {
  return (
    <button
      className={`game-card color-${card.color.toLowerCase()}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{card.color}</span>
      <strong>{card.number ?? (card.color === "REST" ? "休" : "?")}</strong>
    </button>
  );
}

export function GamePage() {
  const { gameId = "" } = useParams();
  const auth = useAuth();
  const [game, setGame] = useState<GameView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const token = await auth.accessToken();
      const response = await api.game(token, gameId);
      setGame(response.data.game);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "ゲームを取得できませんでした。");
    }
  }, [auth, gameId]);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function command(value: Record<string, unknown>) {
    if (!game || busy) return;
    setBusy(true);
    setError("");
    try {
      const token = await auth.accessToken();
      const response = await api.command(
        token,
        game,
        value,
        crypto.randomUUID(),
      );
      setGame(response.data.game);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "操作を実行できませんでした。");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resign() {
    if (!game || !window.confirm("このゲームを投了しますか？")) return;
    setBusy(true);
    try {
      const token = await auth.accessToken();
      const response = await api.resign(token, game, crypto.randomUUID());
      setGame(response.data.game);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "投了できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  if (!game) {
    return <main className="page-shell">星明りを集めています。</main>;
  }
  const viewer = game.players.find((player) => player.isViewer);
  const opponent = game.players.find((player) => !player.isViewer);
  const selectable = new Set([
    ...game.availableActions.collectionCandidateCardIds,
    ...game.availableActions.discardTopCandidateCardIds,
  ]);

  return (
    <main className="game-shell">
      <header className="game-header">
        <div>
          <p className="eyebrow">GAME {game.gameId.slice(0, 8)}</p>
          <h1>{game.status === "IN_PROGRESS" ? "対戦中" : "ゲーム終了"}</h1>
        </div>
        <div className="turn-indicator">
          {game.currentActorPlayerId === game.viewerPlayerId
            ? "あなたの手番"
            : "相手の手番"}
        </div>
      </header>
      <section className="player-summary opponent">
        <strong>{opponent?.displayName}</strong>
        <span>手札 {opponent?.handCount}</span>
        <span>光 {opponent?.starlight.light}</span>
      </section>
      <div className="hand opponent-hand" aria-label="相手の手札">
        {opponent?.hand.map((card, index) => (
          <Card key={`${card.color}-${index}`} card={card} disabled />
        ))}
      </div>
      <section className="table-area">
        <div className="deck-info">
          <span>山札 {game.deck.remainingCount}</span>
          <span>トップ {game.deck.topColor ?? "なし"}</span>
        </div>
        <div className="played-cards">
          {game.playedCards.map((played, index) => (
            <div key={`${played.actor}-${index}`}>
              <small>{played.actor}</small>
              <Card
                card={played.card}
                disabled={!played.card.cardId || !selectable.has(played.card.cardId)}
                onClick={() => {
                  if (!played.card.cardId) return;
                  void command({
                    type:
                      game.pendingChoice?.type === "COLLECTION"
                        ? "SELECT_COLLECTION"
                        : "SELECT_DISCARD_TOP",
                    cardId: played.card.cardId,
                  });
                }}
              />
            </div>
          ))}
        </div>
        <p>捨て札: {game.discardTop?.color ?? "なし"}</p>
      </section>
      <section className="controls panel">
        <div className="button-row">
          <button
            className="secondary-button"
            disabled={busy || !game.availableActions.canDrawCards}
            onClick={() => void command({ type: "DRAW_CARDS" })}
          >
            星明りで3枚引く
          </button>
          <button
            className="primary-button"
            disabled={busy || !game.availableActions.canEndTurn}
            onClick={() => void command({ type: "END_TURN" })}
          >
            手番終了
          </button>
          <button
            className="text-button danger"
            disabled={busy || !game.availableActions.canResign}
            onClick={() => void resign()}
          >
            投了
          </button>
        </div>
        {error && <p className="error-message">{error}</p>}
      </section>
      <section className="hand-area">
        <div className="player-summary">
          <strong>{viewer?.displayName}</strong>
          <span>光 {viewer?.starlight.light}</span>
          <span>闇 {viewer?.starlight.dark}</span>
        </div>
        <div className="hand">
          {viewer?.hand.map((card, index) => (
            <Card
              key={card.cardId ?? index}
              card={card}
              disabled={
                busy ||
                !card.cardId ||
                !game.availableActions.playableCardIds.includes(card.cardId)
              }
              onClick={() => {
                if (card.cardId) {
                  void command({ type: "PLAY_CARD", cardId: card.cardId });
                }
              }}
            />
          ))}
        </div>
      </section>
      {game.result && (
        <div className="result-overlay">
          <section className="panel">
            <h2>
              {game.result.winnerPlayerId === game.viewerPlayerId
                ? "勝利"
                : game.result.winnerPlayerId === null
                  ? "勝者なし"
                  : "敗北"}
            </h2>
            <p>終了理由: {game.result.endReason}</p>
          </section>
        </div>
      )}
    </main>
  );
}
