import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleDialogKeys);
      document.body.style.overflow = previousOverflow;
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
      {open && createPortal(
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
              <section className="rules-introduction">
                <p className="section-code">最初に読む</p>
                <h3>ゲームの目的</h3>
                <p>
                  数字1〜6の感情カードを1枚ずつ集めて「悟り」を開くか、
                  相手の星明りをすべて闇面にすると勝利です。
                  自分の星明りをすべて失うと敗北します。
                </p>
              </section>
              <section>
                <p className="section-code">01</p>
                <h3>準備と公開情報</h3>
                <ul>
                  <li>スタートプレイヤーを決めてから、感情カード48枚と休憩カード6枚を混ぜます。</li>
                  <li>2人へ5枚ずつ配り、星明り5つをすべて光面で始めます。</li>
                  <li>手札の枚数と色、星明り、収集カードは全員に公開されます。</li>
                  <li>手札の数字と、山札トップより下のカードは誰にも見えません。</li>
                </ul>
              </section>
              <section>
                <p className="section-code">02</p>
                <h3>1ラウンドの順番</h3>
                <ol>
                  <li>スタートプレイヤーが手札から1枚出します。</li>
                  <li>ダミーが山札トップをそのまま出します。</li>
                  <li>もう1人が手札から1枚出します。</li>
                  <li>勝者が感情カードを1枚獲得し、残りから次の捨て札トップを決めます。休憩カードがあれば自動でトップになります。</li>
                </ol>
              </section>
              <section>
                <p className="section-code">03</p>
                <h3>リードカラー</h3>
                <p>
                  最初に出た感情カードの色がリードカラーです。
                  後から出す人は、その色を手札に持っていれば必ず同じ色を出します。
                  持っていない場合は任意の色を出せます。休憩カードはいつでも出せます。
                </p>
              </section>
              <section>
                <p className="section-code">04</p>
                <h3>トランプと勝敗</h3>
                <p>
                  捨て札トップの感情カードと同じ色がトランプカラーです。
                  強さは「スーパートランプ ＞ 最大のトランプカラー ＞ 最大のリードカラー」。
                  捨て札トップが休憩カードならトランプカラーはありません。
                </p>
              </section>
              <section>
                <p className="section-code">05</p>
                <h3>スーパートランプ</h3>
                <p>
                  捨て札トップ、または同じラウンドですでに出たカードと
                  「色と数字が両方同じ」感情カードです。
                  2枚出た場合は、後から出たスーパートランプが勝ちます。
                </p>
              </section>
              <section>
                <p className="section-code">06</p>
                <h3>ダミーと勝者なし</h3>
                <p>
                  ダミーは山札トップを出しますが、ゲームそのものには勝利しません。
                  ダミーがラウンドに勝った場合は全カードを捨て、最後に出した人が次を始めます。
                  黒い星は中央へ戻ります。
                </p>
              </section>
              <section>
                <p className="section-code">07</p>
                <h3>休憩カード</h3>
                <p>
                  色と数字を持たず、勝敗判定と獲得候補から除外されます。
                  必ず捨て札トップになります。最初に出た場合は、次の感情カードがリードカラーです。
                  3枚とも休憩なら勝者なしとなり、黒い星は移動しません。
                </p>
              </section>
              <section>
                <p className="section-code">08</p>
                <h3>黒い星と連勝</h3>
                <p>
                  ラウンド勝者が黒い星を受け取り、次のスタートプレイヤーになります。
                  黒い星を持ったまま続けて勝つと、星明りを1つ失います。
                </p>
              </section>
              <section>
                <p className="section-code">09</p>
                <h3>同じ数字の収集</h3>
                <p>
                  すでに収集した数字をもう一度獲得すると星明りを失います。
                  数字1・2は3つ、3・4は2つ、5・6は1つを闇面にします。
                </p>
              </section>
              <section>
                <p className="section-code">10</p>
                <h3>星明りで追加ドロー</h3>
                <p>
                  手札が10枚未満かつ光面が2つ以上なら、自分の手番中に光を1つ闇面にして
                  最大3枚引けます。1回ずつ処理し、手札が10枚になったら実行できません。
                  カードを出す前後に複数回行えます。
                </p>
              </section>
              <section>
                <p className="section-code">11</p>
                <h3>空の手札と山札</h3>
                <p>
                  手札が尽きると、光面の数だけ自動補充します。光面が1つなら例外として2枚です。
                  山札が尽きた場合は、捨て札トップを残して他を混ぜ直します。
                </p>
              </section>
              <section>
                <p className="section-code">12</p>
                <h3>勝利判定の注意</h3>
                <p>
                  1〜6を集めた時点で即座に勝利します。ただし同時に最後の星明りを失った場合は敗北です。
                  相手の星明りがすべて闇面になった場合も勝利します。
                </p>
              </section>
              <section className="rules-operation">
                <p className="section-code">画面操作</p>
                <h3>迷ったとき</h3>
                <p>
                  琥珀色の「次にすること」を確認してください。カードは1回押すと選択、
                  同じカードをもう一度押すと確定します。選択後に画面下の確定ボタンを押しても進められます。
                </p>
              </section>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
