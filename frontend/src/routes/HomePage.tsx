import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function HomePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const token = await auth.accessToken();
        const response = await api.context(token);
        const context = response.data.context;
        if (context?.gameId) {
          navigate(`/games/${context.gameId}`, { replace: true });
        } else if (context) {
          navigate(`/rooms/${context.roomId}`, { replace: true });
        }
      } catch {
        // ホーム操作は継続可能なため、復帰確認失敗は表示しない。
      }
    })();
  }, [auth, navigate]);

  async function createRoom() {
    setBusy(true);
    setError("");
    try {
      const token = await auth.accessToken();
      const response = await api.createRoom(token, crypto.randomUUID());
      navigate(`/rooms/${response.data.room.roomId}`);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "ルームを作成できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const token = await auth.accessToken();
      const response = await api.joinRoom(
        token,
        roomId.trim().toUpperCase(),
        crypto.randomUUID(),
      );
      navigate(`/rooms/${response.data.room.roomId}`);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "ルームに参加できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">STELLA QUEST</p>
          <h1>Duel Lobby</h1>
        </div>
        <button className="text-button" onClick={() => void auth.signOut()}>
          ログアウト
        </button>
      </header>
      <section className="action-grid">
        <article className="panel">
          <h2>新しい対戦</h2>
          <p>ルームを作り、6桁のIDを対戦相手に共有します。</p>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void createRoom()}
          >
            ルームを作成
          </button>
        </article>
        <article className="panel">
          <h2>ルームへ参加</h2>
          <form className="stack" onSubmit={joinRoom}>
            <label>
              ルームID
              <input
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                maxLength={6}
                pattern="[A-Za-z2-9]{6}"
                placeholder="A2B3C4"
                required
              />
            </label>
            <button className="secondary-button" disabled={busy}>
              参加
            </button>
          </form>
        </article>
      </section>
      {error && <p className="error-message">{error}</p>}
    </main>
  );
}
