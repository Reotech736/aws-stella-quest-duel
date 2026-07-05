import { useState, type FormEvent } from "react";

import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (auth.needsNewPassword) {
        await auth.confirmNewPassword(password);
      } else {
        await auth.signIn(username, password);
      }
      setPassword("");
    } catch {
      setError("ログイン情報を確認してください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-shell narrow-shell">
      <section className="panel hero-panel">
        <p className="eyebrow">PRIVATE BETA</p>
        <h1>ステラクエスト Duel</h1>
        <p>招待されたプレイヤー向けの二人対戦版です。</p>
        <form className="stack" onSubmit={submit}>
          {!auth.needsNewPassword && (
            <label>
              ユーザー名
              <input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </label>
          )}
          <label>
            {auth.needsNewPassword ? "新しいパスワード" : "パスワード"}
            <input
              type="password"
              autoComplete={
                auth.needsNewPassword
                  ? "new-password"
                  : "current-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="error-message">{error}</p>}
          <button className="primary-button" disabled={submitting}>
            {auth.needsNewPassword ? "パスワードを確定" : "ログイン"}
          </button>
        </form>
      </section>
    </main>
  );
}
