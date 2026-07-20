import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import { createRequestId } from "../api/request-id";
import type { RoomView } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AudioControls } from "../components/AudioControls";
import { RulesDialog } from "../components/RulesDialog";

function isClosedRoom(room: RoomView): boolean {
  return room.status === "CLOSED" || room.status === "EXPIRED";
}

function roomStatusLabel(room: RoomView | null): string {
  if (room === null) return "ルーム情報を確認しています";
  if (room.status === "READY") return "2人そろいました";
  if (room.status === "WAITING") return "対戦相手を待っています";
  return "ルームを終了しています";
}

export function WaitingRoomPage() {
  const { roomId = "" } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomView | null>(null);
  const [startMethod, setStartMethod] =
    useState<"RANDOM" | "OWNER_FIRST" | "GUEST_FIRST">("RANDOM");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const token = await auth.accessToken();
      const response = await api.room(token, roomId);
      setRoom(response.data.room);
      if (isClosedRoom(response.data.room)) {
        navigate("/", { replace: true });
      } else if (response.data.room.gameId) {
        navigate(`/games/${response.data.room.gameId}`, { replace: true });
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "ルーム状態を取得できませんでした。",
      );
    }
  }, [auth, navigate, roomId]);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function leave() {
    if (!room) return;
    setBusy(true);
    try {
      const token = await auth.accessToken();
      await api.leaveRoom(token, room, createRequestId());
      navigate("/", { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "VERSION_CONFLICT") {
        await refresh();
      } else {
        setError(cause instanceof ApiError ? cause.message : "退出できませんでした。");
      }
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!room) return;
    setBusy(true);
    try {
      const token = await auth.accessToken();
      const response = await api.startRoom(
        token,
        room,
        startMethod,
        createRequestId(),
      );
      navigate(`/games/${response.data.game.gameId}`, { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "開始できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell room-shell">
      <header className="app-masthead">
        <div className="wordmark">
          <span>STELLA QUEST</span>
          <strong>対戦準備</strong>
        </div>
        <div className="utility-actions">
          <AudioControls />
          <RulesDialog />
        </div>
      </header>

      <section className="match-docket" aria-labelledby="room-title">
        <header className="docket-heading">
          <div>
            <p className="section-code">ルームID</p>
            <h1 id="room-title" className="room-code">{roomId}</h1>
          </div>
          <p className="room-status" aria-live="polite">
            {roomStatusLabel(room)}
          </p>
        </header>

        <p className="room-instruction">
          このIDを対戦相手へ共有してください。カードはゲーム開始後に配られます。
        </p>

        <div className="seat-map" aria-label="参加プレイヤー">
          <section className="seat owner-seat">
            <span>ルーム作成者</span>
            <strong>{room?.owner.displayName ?? "読み込み中"}</strong>
          </section>
          <span className="versus-mark" aria-hidden="true">対</span>
          <section className="seat guest-seat">
            <span>参加者</span>
            <strong>{room?.guest?.displayName ?? "参加待ち"}</strong>
          </section>
        </div>

        <section className="start-console" aria-labelledby="start-console-title">
          <div>
            <p className="section-code">開始手順</p>
            <h2 id="start-console-title">スタートプレイヤーを決める</h2>
          </div>
          {room?.viewerRole === "OWNER" ? (
            <label>
              決め方
              <select
                value={startMethod}
                onChange={(event) =>
                  setStartMethod(event.target.value as typeof startMethod)
                }
              >
                <option value="RANDOM">ランダム</option>
                <option value="OWNER_FIRST">自分から</option>
                <option value="GUEST_FIRST">相手から</option>
              </select>
            </label>
          ) : (
            <p>ルーム作成者が開始方法を選びます。</p>
          )}
        </section>

        <footer className="docket-actions">
          <button className="text-button danger" disabled={busy} onClick={() => void leave()}>
            {busy ? "処理中…" : "ルームを退出"}
          </button>
          {room?.viewerRole === "OWNER" && (
            <button
              className="primary-button"
              disabled={busy || room.status !== "READY"}
              onClick={() => void start()}
            >
              {busy ? "開始中…" : "ゲーム開始"}
            </button>
          )}
        </footer>

        {error && <p className="error-message">{error}</p>}
      </section>
    </main>
  );
}
