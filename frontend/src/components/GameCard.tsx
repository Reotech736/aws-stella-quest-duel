import { useState } from "react";

import type { CardView } from "../api/types";
import { colorLabel, gemCount } from "../game/presentation";

interface GameCardProps {
  readonly card: CardView;
  readonly faceDown?: boolean;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly onClick?: () => void;
}

const NUMBER_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
const GEM_ROWS = ["top", "bottom"] as const;

function gemSlots(number: number): readonly ("left" | "center" | "right")[] {
  if (number <= 2) return ["left", "center", "right"];
  if (number <= 4) return ["left", "right"];
  return ["center"];
}

function hasRedArtwork(card: CardView): card is CardView & { readonly number: number } {
  return card.color === "RED" && card.number !== undefined && card.number >= 1 && card.number <= 6;
}

export function GameCard({
  card,
  faceDown = false,
  disabled,
  selected = false,
  onClick,
}: GameCardProps) {
  const [failedAssetKey, setFailedAssetKey] = useState<string | null>(null);
  const isRest = card.color === "REST";
  const assetKey = hasRedArtwork(card) ? `red-${card.number}` : null;
  const showLayeredArtwork = !faceDown && assetKey !== null && failedAssetKey !== assetKey;
  const artworkNumber = showLayeredArtwork ? card.number : undefined;
  const label = faceDown
    ? `${colorLabel(card.color)}のカード（裏向き）`
    : isRest
      ? "休憩カード"
      : `${colorLabel(card.color)} ${card.number ?? "不明"}`;
  const className = [
    "game-card",
    `color-${card.color.toLowerCase()}`,
    faceDown ? "card-back" : "card-face",
    showLayeredArtwork ? "has-card-art" : "",
    selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const fallbackContent = (
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
  const handleAssetError = () => {
    if (assetKey !== null) setFailedAssetKey(assetKey);
  };
  const content = faceDown ? (
    <>
      <span className="card-back-star" aria-hidden="true">✦</span>
      <span className="card-color-name">{colorLabel(card.color)}</span>
    </>
  ) : artworkNumber !== undefined ? (
    <span className="card-artwork" data-card-artwork={assetKey}>
      <img
        className="card-art-layer card-illustration"
        src={`/assets/cards/red/illustration-${artworkNumber}.png`}
        alt=""
        aria-hidden="true"
        onError={handleAssetError}
      />
      <img
        className="card-art-layer card-frame"
        src="/assets/cards/red/frame-red.png"
        alt=""
        aria-hidden="true"
        onError={handleAssetError}
      />
      {NUMBER_POSITIONS.map((position) => (
        <img
          key={position}
          className={`card-art-layer card-number card-number-${position}`}
          src={`/assets/cards/numbers/number-${artworkNumber}.png`}
          alt=""
          aria-hidden="true"
          onError={handleAssetError}
        />
      ))}
      {GEM_ROWS.flatMap((row) =>
        gemSlots(artworkNumber).map((slot) => (
          <img
            key={`${row}-${slot}`}
            className={`card-art-layer card-gem card-gem-${row} card-gem-${slot}`}
            src="/assets/cards/red/gem-red.png"
            alt=""
            aria-hidden="true"
            data-gem-row={row}
            data-gem-slot={slot}
            onError={handleAssetError}
          />
        )),
      )}
      <span className="card-gem-count" aria-label={`宝石${gemCount(artworkNumber)}個`} />
    </span>
  ) : (
    fallbackContent
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
