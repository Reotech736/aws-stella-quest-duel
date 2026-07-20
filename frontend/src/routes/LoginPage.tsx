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
    <main className="entry-shell">
      <section className="entry-intro" aria-labelledby="product-title">
        <p className="kicker">招待制・二人対戦</p>
        <h1 id="product-title">
          ステラクエスト
          <span>Duel</span>
        </h1>
        <p className="entry-lede">
          星明りを守りながら、六つの感情を集めるオンライン対戦です。
        </p>
        <dl className="entry-notes">
          <div>
            <dt>対戦人数</dt>
            <dd>2人＋ダミー</dd>
          </div>
          <div>
            <dt>公開範囲</dt>
            <dd>招待ユーザー限定</dd>
          </div>
        </dl>
      </section>

      <section className="auth-sheet" aria-labelledby="auth-title">
        <p className="section-code">接続 / 01</p>
        <h2 id="auth-title">
          {auth.needsNewPassword ? "新しいパスワードを設定" : "対戦席へ入る"}
        </h2>
        <p className="sheet-description">
          管理者から案内された認証情報を入力してください。
        </p>
        <form className="form-stack" onSubmit={submit} aria-busy={submitting}>
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
            {submitting
              ? "確認中…"
              : auth.needsNewPassword
                ? "パスワードを確定"
                : "ログイン"}
          </button>
        </form>
      </section>
    </main>
  );
}
