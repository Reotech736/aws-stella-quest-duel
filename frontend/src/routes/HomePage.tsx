import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AudioControls } from "../components/AudioControls";
import { RulesDialog } from "../components/RulesDialog";

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
    <main className="app-shell lobby-shell">
      <header className="app-masthead">
        <div className="wordmark">
          <span>STELLA QUEST</span>
          <strong>対戦ロビー</strong>
        </div>
        <div className="utility-actions">
          <AudioControls />
          <RulesDialog />
          <button className="text-button" onClick={() => void auth.signOut()}>
            ログアウト
          </button>
        </div>
      </header>
      <section className="lobby-command" aria-labelledby="new-match-title">
        <div className="command-copy">
          <p className="section-code">新しい対戦 / 01</p>
          <h1 id="new-match-title">星明りを並べ、対戦相手を招く。</h1>
          <p>
            対戦ルームを作ると6桁のIDが発行されます。相手へIDを共有し、
            2人そろったらスタートプレイヤーを決めます。
          </p>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void createRoom()}
          >
            {busy ? "作成中…" : "ルームを作成"}
          </button>
        </div>

        <aside className="join-ledger" aria-labelledby="join-room-title">
          <p className="section-code">招待から参加 / 02</p>
          <h2 id="join-room-title">ルームIDを持っていますか</h2>
          <form className="form-stack" onSubmit={joinRoom} aria-busy={busy}>
            <label>
              6桁のルームID
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
              {busy ? "確認中…" : "このルームへ参加"}
            </button>
          </form>
        </aside>
      </section>
      {error && <p className="error-message">{error}</p>}
    </main>
  );
}
