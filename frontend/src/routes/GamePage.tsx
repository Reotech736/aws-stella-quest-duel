import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { GameView } from "../api/types";
import { useAudio } from "../audio/AudioContext";
import { useAuth } from "../auth/AuthContext";
import { AudioControls } from "../components/AudioControls";
import { GameCard } from "../components/GameCard";
import { RulesDialog } from "../components/RulesDialog";
import { StarlightTokens } from "../components/StarlightTokens";
import {
  actorName,
  colorLabel,
  leadColor,
  phaseLabel,
  playerName,
  trumpColor,
} from "../game/presentation";

function instruction(game: GameView): string {
  if (game.status !== "IN_PROGRESS") {
    return "ゲームは終了しました。結果を確認してください。";
  }

  const isViewerTurn = game.currentActorPlayerId === game.viewerPlayerId;
  if (!isViewerTurn) {
    if (game.phase === "AWAITING_COLLECTION_CHOICE") {
      return `${playerName(game, game.currentActorPlayerId)}さんが獲得するカードを選んでいます。`;
    }
    if (game.phase === "AWAITING_DISCARD_TOP_CHOICE") {
      return `${playerName(game, game.currentActorPlayerId)}さんが次の捨て札を選んでいます。`;
    }
    return `${playerName(game, game.currentActorPlayerId)}さんの操作を待っています。`;
  }

  switch (game.phase) {
    case "PLAYER_TURN_BEFORE_PLAY":
      return "手札からカードを選び、プレイを確定してください。";
    case "PLAYER_TURN_AFTER_PLAY":
      return "必要なら星明りでカードを引き、手番を終了してください。";
    case "AWAITING_COLLECTION_CHOICE":
      return "場から獲得する感情カードを選び、確定してください。";
    case "AWAITING_DISCARD_TOP_CHOICE":
      return "残りから次の捨て札トップを選び、確定してください。";
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

function confirmLabel(game: GameView): string {
  switch (game.phase) {
    case "PLAYER_TURN_BEFORE_PLAY":
      return "このカードを出す";
    case "AWAITING_COLLECTION_CHOICE":
      return "このカードを獲得する";
    case "AWAITING_DISCARD_TOP_CHOICE":
      return "捨て札トップにする";
    default:
      return "選択を確定する";
  }
}

function selectionCommand(
  game: GameView,
  cardId: string,
): Record<string, unknown> | null {
  switch (game.phase) {
    case "PLAYER_TURN_BEFORE_PLAY":
      return { type: "PLAY_CARD", cardId };
    case "AWAITING_COLLECTION_CHOICE":
      return { type: "SELECT_COLLECTION", cardId };
    case "AWAITING_DISCARD_TOP_CHOICE":
      return { type: "SELECT_DISCARD_TOP", cardId };
    default:
      return null;
  }
}

export function GamePage() {
  const { gameId = "" } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const audio = useAudio();
  const [game, setGame] = useState<GameView | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const previousGameRef = useRef<GameView | null>(null);

  const refresh = useCallback(async () => {
    try {
      const token = await auth.accessToken();
      const response = await api.game(token, gameId);
      setGame((current) => {
        if (current?.version !== response.data.game.version) {
          setSelectedCardId(null);
        }
        return response.data.game;
      });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "ゲームを取得できませんでした。",
      );
    }
  }, [auth, gameId]);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (game === null) return;
    const previous = previousGameRef.current;
    if (previous !== null && previous.version !== game.version) {
      const previousViewer = previous.players.find((player) => player.isViewer);
      const currentViewer = game.players.find((player) => player.isViewer);
      if (
        game.status !== "IN_PROGRESS" &&
        previous.status === "IN_PROGRESS"
      ) {
        audio.playSfx("gameEnd");
      } else if (
        currentViewer !== undefined &&
        previousViewer !== undefined &&
        currentViewer.starlight.light < previousViewer.starlight.light
      ) {
        audio.playSfx("lightLost");
      } else if (
        game.currentActorPlayerId === game.viewerPlayerId &&
        previous.currentActorPlayerId !== previous.viewerPlayerId
      ) {
        audio.playSfx("turn");
      }
    }
    previousGameRef.current = game;
  }, [audio, game]);

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
      setSelectedCardId(null);
      setGame(nextGame);
      audio.playSfx("confirm");
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "操作を実行できませんでした。",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmSelection() {
    if (!game || selectedCardId === null) return;
    const value = selectionCommand(game, selectedCardId);
    if (value !== null) await command(value);
  }

  async function resign() {
    if (!game || !window.confirm("このゲームを投了しますか？")) return;
    setBusy(true);
    try {
      const token = await auth.accessToken();
      const response = await api.resign(token, game, crypto.randomUUID());
      setGame(response.data.game);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "投了できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!game) {
    return <main className="page-shell">星明りを集めています。</main>;
  }

  const viewer = game.players.find((player) => player.isViewer);
  const opponent = game.players.find((player) => !player.isViewer);
  const selectablePlayedCards = new Set([
    ...game.availableActions.collectionCandidateCardIds,
    ...game.availableActions.discardTopCandidateCardIds,
  ]);
  const currentLeadColor = leadColor(game);
  const currentTrumpColor = trumpColor(game.discardTop);
  const blackStarHolderName =
    game.blackStarHolderPlayerId === null
      ? "中央"
      : playerName(game, game.blackStarHolderPlayerId);
  const drawCount = Math.min(3, Math.max(0, 10 - (viewer?.handCount ?? 10)));

  return (
    <main className="game-shell">
      <header className="game-header">
        <div>
          <p className="eyebrow">GAME {game.gameId.slice(0, 8)}</p>
          <h1>{game.status === "IN_PROGRESS" ? "対戦中" : "ゲーム終了"}</h1>
        </div>
        <div className="game-header-actions">
          <AudioControls />
          <RulesDialog />
          <div className="turn-indicator">
            {game.currentActorPlayerId === game.viewerPlayerId
              ? "あなたの手番"
              : `${playerName(game, game.currentActorPlayerId)}さんの手番`}
          </div>
        </div>
      </header>

      <section className="game-instruction" aria-live="polite">
        <strong>{instruction(game)}</strong>
        <div className="status-strip">
          <span>進行: {phaseLabel(game.phase)}</span>
          <span>リード: {colorLabel(currentLeadColor)}</span>
          <span>トランプ: {colorLabel(currentTrumpColor)}</span>
        </div>
      </section>

      {opponent && (
        <section className="player-zone opponent-zone">
          <header className="player-summary">
            <div>
              <strong>{opponent.displayName}</strong>
              <span className="player-role">対戦相手</span>
            </div>
            <div className="player-badges">
              {game.startPlayerId === opponent.playerId && (
                <span className="start-player-badge">✦ スタート</span>
              )}
              {game.blackStarHolderPlayerId === opponent.playerId && (
                <span className="black-star-badge">★ 黒い星</span>
              )}
              <span>手札 {opponent.handCount}枚</span>
            </div>
          </header>
          <StarlightTokens {...opponent.starlight} />
          <div className="hand opponent-hand" aria-label="相手の手札">
            {opponent.hand.map((card, index) => (
              <GameCard
                key={`${card.color}-${index}`}
                card={card}
                faceDown
              />
            ))}
          </div>
        </section>
      )}

      <section className="table-area" aria-label="中央の盤面">
        <div className="table-status">
          <span className="black-star-marker" key={`${blackStarHolderName}-${game.version}`}>
            <img src="/assets/game-pieces/black-star.png" alt="" />
          </span>
          <span>黒い星: {blackStarHolderName}</span>
        </div>
        <div className="table-columns">
          <section className="pile-zone deck-pile" aria-label="山札">
            <h2>山札</h2>
            <div className="card-stack" aria-hidden="true">
              <span />
              <span />
              {game.deck.topColor && (
                <GameCard card={{ color: game.deck.topColor }} faceDown />
              )}
            </div>
            <strong>{game.deck.remainingCount}枚</strong>
            <small>トップ: {colorLabel(game.deck.topColor)}</small>
          </section>

          <section className="trick-zone" aria-label="プレイされたカード">
            <h2>場のカード</h2>
            <div className="played-cards">
              {game.playedCards.length === 0 && (
                <span className="empty-table">まだカードはありません</span>
              )}
              {game.playedCards.map((played, index) => {
                const cardId = played.card.cardId;
                const canSelect =
                  cardId !== undefined && selectablePlayedCards.has(cardId);
                return (
                  <div key={`${played.actor}-${index}`} className="played-card-slot">
                    <small>{actorName(game, played.actor)}</small>
                    <GameCard
                      card={played.card}
                      selected={cardId === selectedCardId}
                      onClick={
                        canSelect
                          ? () => {
                              setSelectedCardId(cardId);
                              audio.playSfx("select");
                            }
                          : undefined
                      }
                      disabled={busy}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="pile-zone discard-pile" aria-label="捨て札">
            <h2>捨て札</h2>
            {game.discardTop ? (
              <GameCard card={game.discardTop} />
            ) : (
              <span className="empty-table">なし</span>
            )}
          </section>
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
                    <GameCard key={card.cardId ?? index} card={card} />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="controls panel" aria-label="操作">
        {selectedCardId && (
          <div className="selection-confirmation">
            <span>カードを選択中</span>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void confirmSelection()}
            >
              {confirmLabel(game)}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setSelectedCardId(null)}
            >
              選び直す
            </button>
          </div>
        )}
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !game.availableActions.canDrawCards}
            onClick={() => void command({ type: "DRAW_CARDS" })}
          >
            星明りで{drawCount}枚引く
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={busy || !game.availableActions.canEndTurn}
            onClick={() => void command({ type: "END_TURN" })}
          >
            手番終了
          </button>
          <button
            type="button"
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

      {viewer && (
        <section className="player-zone viewer-zone">
          <header className="player-summary">
            <div>
              <strong>{viewer.displayName}</strong>
              <span className="player-role">あなた</span>
            </div>
            <div className="player-badges">
              {game.startPlayerId === viewer.playerId && (
                <span className="start-player-badge">✦ スタート</span>
              )}
              {game.blackStarHolderPlayerId === viewer.playerId && (
                <span className="black-star-badge">★ 黒い星</span>
              )}
              <span>手札 {viewer.handCount}枚</span>
            </div>
          </header>
          <StarlightTokens {...viewer.starlight} />
          <div className="hand" aria-label="あなたの手札">
            {viewer.hand.map((card, index) => {
              const cardId = card.cardId;
              const canSelect =
                cardId !== undefined &&
                game.availableActions.playableCardIds.includes(cardId);
              return (
                <GameCard
                  key={cardId ?? index}
                  card={card}
                  selected={cardId === selectedCardId}
                  onClick={
                    canSelect
                      ? () => {
                          setSelectedCardId(cardId);
                          audio.playSfx("select");
                        }
                      : undefined
                  }
                  disabled={busy}
                />
              );
            })}
          </div>
        </section>
      )}

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
              type="button"
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
