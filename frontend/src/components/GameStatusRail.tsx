import type { GameView } from "../api/types";
import { colorLabel, phaseLabel } from "../game/presentation";
import { AudioControls } from "./AudioControls";
import { RulesDialog } from "./RulesDialog";

type GameStatusRailProps = {
  readonly game: GameView;
  readonly instruction: string;
  readonly leadColor: string | null;
  readonly trumpColor: string | null;
  readonly blackStarHolderName: string;
};

export function GameStatusRail({
  game,
  instruction,
  leadColor,
  trumpColor,
  blackStarHolderName,
}: GameStatusRailProps) {
  return (
    <aside className="status-rail" aria-labelledby="status-rail-title">
      <div>
        <p className="section-code">対戦進行</p>
        <h2 id="status-rail-title">次にすること</h2>
        <p className="instruction-copy" aria-live="polite">
          {instruction}
        </p>
      </div>

      <dl className="status-ledger">
        <div>
          <dt>現在</dt>
          <dd>{phaseLabel(game.phase)}</dd>
        </div>
        <div>
          <dt>リード</dt>
          <dd>{colorLabel(leadColor)}</dd>
        </div>
        <div>
          <dt>トランプ</dt>
          <dd>{colorLabel(trumpColor)}</dd>
        </div>
      </dl>

      <section className="black-star-state" aria-label={`黒い星: ${blackStarHolderName}`}>
        <img
          key={`${blackStarHolderName}-${game.version}`}
          src="/assets/game-pieces/black-star.png"
          alt=""
        />
        <div>
          <span>黒い星</span>
          <strong>{blackStarHolderName}</strong>
        </div>
      </section>

      <div className="rail-tools" aria-label="ゲーム設定">
        <AudioControls />
        <RulesDialog />
      </div>
    </aside>
  );
}
