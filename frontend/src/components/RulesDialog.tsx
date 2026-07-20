import { useEffect, useRef, useState } from "react";

export function RulesDialog() {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeys);
    closeButtonRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleDialogKeys);
      previousFocus?.focus();
    };
  }, [open]);

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
            ref={dialogRef}
            className="rules-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rules-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="dialog-header">
              <h2 id="rules-title">ステラクエスト Duelの遊び方</h2>
              <button
                ref={closeButtonRef}
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
              <section>
                <h3>画面操作</h3>
                <p>左の「次にすること」を確認し、選べるカードを押してから画面下の操作欄で確定します。</p>
              </section>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
