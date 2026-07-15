import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

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
  const content = (
    <>
      <span>{card.color}</span>
      <strong>{card.number ?? (card.color === "REST" ? "休" : "?")}</strong>
    </>
  );
  const label = `${card.color} ${card.number ?? (card.color === "REST" ? "休憩" : "不明")}`;

  return onClick ? (
    <button
      className={`game-card color-${card.color.toLowerCase()}`}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <div
      className={`game-card color-${card.color.toLowerCase()}`}
      role="img"
      aria-label={label}
    >
      {content}
    </div>
  );
}

function instruction(game: GameView): string {
  if (game.status !== "IN_PROGRESS") {
    return "ゲームは終了しました。結果を確認してください。";
  }

  const isViewerTurn =
    game.currentActorPlayerId === game.viewerPlayerId;
  if (!isViewerTurn) {
    if (game.phase === "AWAITING_COLLECTION_CHOICE") {
      return "相手が獲得するカードを選んでいます。";
    }
    if (game.phase === "AWAITING_DISCARD_TOP_CHOICE") {
      return "相手が次の捨て札を選んでいます。";
    }
    return "相手の操作を待っています。";
  }

  switch (game.phase) {
    case "PLAYER_TURN_BEFORE_PLAY":
      return "手札からプレイするカードを選んでください。";
    case "PLAYER_TURN_AFTER_PLAY":
      return "必要なら星明りでカードを引き、手番終了を押してください。";
    case "AWAITING_COLLECTION_CHOICE":
      return "場のカードから獲得する感情カードを選んでください。";
    case "AWAITING_DISCARD_TOP_CHOICE":
      return "残りのカードから次の捨て札トップを選んでください。";
    case "COMPLETED":
    case "ABANDONED":
      return "ゲームは終了しました。結果を確認してください。";
  }
}

function resultReason(reason: string): string {
  switch (reason) {
    case "ENLIGHTENMENT":
      return "1から6の感情を集めました";
    case "LIGHT_LOST":
      return "すべての星明りを失いました";
    case "RESIGNATION":
      return "投了しました";
    case "ABANDONED":
      return "長時間操作がなく終了しました";
    default:
      return reason;
  }
}

export function GamePage() {
  const { gameId = "" } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const [game, setGame] = useState<GameView | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
    setNotice("");
    try {
      const previousViewer = game.players.find((player) => player.isViewer);
      const token = await auth.accessToken();
      const response = await api.command(
        token,
        game,
        value,
        crypto.randomUUID(),
      );
      const nextGame = response.data.game;
      const nextViewer = nextGame.players.find((player) => player.isViewer);
      const messages: string[] = [];
      if (
        value.type === "PLAY_CARD" &&
        previousViewer?.handCount === 1 &&
        nextViewer !== undefined &&
        nextViewer.handCount > 0
      ) {
        messages.push(
          `手札が尽きたため、${nextViewer.handCount}枚補充されました。`,
        );
      }
      if (
        previousViewer !== undefined &&
        nextViewer !== undefined &&
        nextViewer.collection.length > previousViewer.collection.length
      ) {
        messages.push("感情カードを獲得しました。");
      }
      setNotice(messages.join(" "));
      setGame(nextGame);
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
      <section className="game-instruction" aria-live="polite">
        <strong>{instruction(game)}</strong>
        <small>現在のフェーズ: {game.phase}</small>
      </section>
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
        <div className="discard-pile">
          <p>捨て札</p>
          {game.discardTop ? (
            <Card card={game.discardTop} disabled />
          ) : (
            <span>なし</span>
          )}
        </div>
      </section>
      <section className="collections-panel panel" aria-label="獲得カード">
        <h2>獲得カード</h2>
        <div className="collection-grid">
          {game.players.map((player) => (
            <section key={player.playerId}>
              <h3>
                {player.displayName}
                {player.isViewer ? "（あなた）" : ""}
              </h3>
              <div className="collection-cards">
                {player.collection.length === 0 ? (
                  <span className="empty-collection">まだありません</span>
                ) : (
                  player.collection.map((card, index) => (
                    <Card key={card.cardId ?? index} card={card} />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
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
        {notice && <p className="notice-message">{notice}</p>}
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
            <p>終了理由: {resultReason(game.result.endReason)}</p>
            <button
              className="primary-button"
              onClick={() => navigate("/", { replace: true })}
            >
              ロビーへ戻る
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
