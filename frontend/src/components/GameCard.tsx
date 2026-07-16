import type { CardView } from "../api/types";
import { colorLabel, gemCount } from "../game/presentation";

interface GameCardProps {
  readonly card: CardView;
  readonly faceDown?: boolean;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly onClick?: () => void;
}

export function GameCard({
  card,
  faceDown = false,
  disabled,
  selected = false,
  onClick,
}: GameCardProps) {
  const isRest = card.color === "REST";
  const label = faceDown
    ? `${colorLabel(card.color)}のカード（裏向き）`
    : isRest
      ? "休憩カード"
      : `${colorLabel(card.color)} ${card.number ?? "不明"}`;
  const className = [
    "game-card",
    `color-${card.color.toLowerCase()}`,
    faceDown ? "card-back" : "card-face",
    selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const content = faceDown ? (
    <>
      <span className="card-back-star" aria-hidden="true">✦</span>
      <span className="card-color-name">{colorLabel(card.color)}</span>
    </>
  ) : (
    <>
      <span className="card-color-name">{colorLabel(card.color)}</span>
      <strong>{isRest ? "休" : (card.number ?? "?")}</strong>
      {!isRest && card.number !== undefined && (
        <span className="card-gems" aria-label={`宝石${gemCount(card.number)}個`}>
          {Array.from({ length: gemCount(card.number) }, (_, index) => (
            <i key={index} aria-hidden="true" />
          ))}
        </span>
      )}
    </>
  );

  return onClick ? (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <div className={className} role="img" aria-label={label}>
      {content}
    </div>
  );
}
