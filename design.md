# Design — Stella Quest Duel

Hallmarkによるアプリ全体の固定デザインシステムです。各画面はこの文書と`frontend/src/styles/tokens.css`を参照し、画面ごとに別テーマを作りません。

## Genre

`editorial`を基礎にした、初心者向けのゲーム用Workbenchです。古い星図の読みやすい組版と、黒鉄・銀の卓上道具の手触りを合わせます。

## Macrostructure family

- Entry pages: 左に短い案内、右に操作を置くSplit Ledger
- Lobby pages: 主操作を大きく、補助操作を細い台帳として置くCommand Desk
- Room page: ルームIDを中心に、2人の席を向かい合わせるMatch Docket
- Game page: 左の情報レール、中央の卓上、右の収集台帳からなるWorkbench

モバイルではすべて一列へ畳み、情報レール、卓上、収集台帳、操作帯の順に並べます。

## Theme

- `--color-paper`: `oklch(15.5% 0.018 260)`
- `--color-paper-2`: `oklch(19.5% 0.020 257)`
- `--color-paper-3`: `oklch(23.5% 0.022 254)`
- `--color-ink`: `oklch(92% 0.018 84)`
- `--color-ink-2`: `oklch(73% 0.016 78)`
- `--color-rule`: `oklch(42% 0.022 250)`
- `--color-rule-2`: `oklch(29% 0.020 252)`
- `--color-silver`: `oklch(75% 0.012 250)`
- `--color-accent`: `oklch(79% 0.140 78)`
- `--color-accent-ink`: `oklch(18% 0.026 68)`
- `--color-focus`: `oklch(83% 0.180 82)`

琥珀色は主要操作、現在手番、選択、フォーカスだけに使い、1画面の5%以下に抑えます。カードを最も彩度の高い要素として扱います。

## Typography

- Display: `Yu Mincho`, `Hiragino Mincho ProN`, `Noto Serif JP`, serif。weight 600、style normal
- Body: `BIZ UDPGothic`, `Yu Gothic UI`, `Hiragino Kaku Gothic ProN`, `Noto Sans JP`, sans-serif
- Mono: `Cascadia Mono`, `SFMono-Regular`, `Consolas`, monospace
- Display tracking: `0.02em`
- 見出しはuprightとし、グラデーション文字や過剰な大文字英語を使わない

## Spacing and shape

- 4px基準の名前付きスケールを使い、画面内で任意の余白を追加しない
- パネルは原則として角丸4px、入力とボタンは2px
- 円形は星明りトークンなど、実際に円形である要素だけに使う
- 面を入れ子にせず、罫線、余白、見出しの強弱で領域を分ける

## Motion

- CSSだけを使い、120〜320msの短い変化に限定する
- カード選択、場への到着、収集、補充、黒い星、星明り反転だけを演出する
- `prefers-reduced-motion`では移動と反転を停止し、必要なら短いopacity変化だけにする

## Microinteractions stance

- 成功は短い文言と盤面変化で示し、祝祭的なtoastやパーティクルは使わない
- `:focus-visible`は遅延なしで銀と琥珀の二重線を表示する
- loading中は操作名を進行形へ変え、二重送信を無効化する
- errorとsuccessは色だけでなく見出しと文言を持つ

## CTA voice

- Primary: 琥珀の単色面、黒い文字、直線的な2px角。命令形の短い日本語
- Secondary: 黒鉄面と銀の罫線
- Tertiary: 背景なしの文字操作。危険操作だけ赤い罫線を使う
- クリック可能な文言は全幅で1行を維持する

## Per-page allowances

- アプリ画面に装飾目的のhero、巨大な抽象図形、ガラス表現を追加しない
- 星図の罫線や座標表示は、盤面と状態の位置関係を補助する場合だけ使う
- カード、星明りトークン、黒い星の画像資産は変更しない

## What pages MUST share

- ロゴタイプ、色、書体、罫線、ボタン、フォーカス、余白、モーション
- 状態説明は「現在」「次にすること」「補足情報」の順に読む
- APIの内部列挙値を利用者へ表示しない

## What pages MAY differ on

- ログイン、ロビー、待機室、対戦画面は目的に合わせて構造を変えてよい
- 情報量に応じて1〜3列を使うが、モバイルでは必ず1列へ畳む

