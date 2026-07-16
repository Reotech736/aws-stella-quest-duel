import { useState } from "react";

export function RulesDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="text-button"
        onClick={() => setOpen(true)}
      >
        ルール
      </button>
      {open && (
        <div className="dialog-backdrop" onMouseDown={() => setOpen(false)}>
          <section
            className="rules-dialog panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rules-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="dialog-header">
              <h2 id="rules-title">ステラクエスト Duelの遊び方</h2>
              <button
                type="button"
                className="text-button"
                aria-label="ルールを閉じる"
                onClick={() => setOpen(false)}
              >
                閉じる
              </button>
            </header>
            <div className="rules-content">
              <section>
                <h3>勝利条件</h3>
                <p>数字1〜6を1枚ずつ集めるか、相手の光をすべて失わせると勝利です。</p>
              </section>
              <section>
                <h3>カードの強さ</h3>
                <p>スーパートランプ、トランプカラー、リードカラーの順に強さを判定します。</p>
              </section>
              <section>
                <h3>休憩カード</h3>
                <p>色と数字を持たず、勝敗判定から除外されます。リードカラーに関係なく出せます。</p>
              </section>
              <section>
                <h3>星明り</h3>
                <p>5枚すべてを光面で始めます。重複収集では、数字1・2は3枚、3・4は2枚、5・6は1枚を闇面にします。</p>
              </section>
              <section>
                <h3>追加ドロー</h3>
                <p>手札が10枚未満かつ光が2枚以上なら、光を1枚失って最大3枚引けます。</p>
              </section>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
