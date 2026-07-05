import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { RoomView } from "../api/types";
import { useAuth } from "../auth/AuthContext";

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
      if (response.data.room.gameId) {
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
      await api.leaveRoom(token, room, crypto.randomUUID());
      navigate("/", { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "退出できませんでした。");
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
        crypto.randomUUID(),
      );
      navigate(`/games/${response.data.game.gameId}`, { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "開始できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell narrow-shell">
      <section className="panel room-panel">
        <p className="eyebrow">WAITING ROOM</p>
        <h1 className="room-code">{roomId}</h1>
        <p>このIDを対戦相手に共有してください。</p>
        <div className="player-slots">
          <div>
            <span>OWNER</span>
            <strong>{room?.owner.displayName ?? "読み込み中"}</strong>
          </div>
          <div>
            <span>GUEST</span>
            <strong>{room?.guest?.displayName ?? "参加待ち"}</strong>
          </div>
        </div>
        {room?.viewerRole === "OWNER" && (
          <label>
            スタートプレイヤー
            <select
              value={startMethod}
              onChange={(event) =>
                setStartMethod(
                  event.target.value as typeof startMethod,
                )
              }
            >
              <option value="RANDOM">ランダム</option>
              <option value="OWNER_FIRST">自分から</option>
              <option value="GUEST_FIRST">相手から</option>
            </select>
          </label>
        )}
        <div className="button-row">
          <button className="text-button" disabled={busy} onClick={() => void leave()}>
            退出
          </button>
          {room?.viewerRole === "OWNER" && (
            <button
              className="primary-button"
              disabled={busy || room.status !== "READY"}
              onClick={() => void start()}
            >
              ゲーム開始
            </button>
          )}
        </div>
        {error && <p className="error-message">{error}</p>}
      </section>
    </main>
  );
}
