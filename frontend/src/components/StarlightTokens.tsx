interface StarlightTokensProps {
  readonly light: number;
  readonly dark: number;
}

export function StarlightTokens({ light, dark }: StarlightTokensProps) {
  return (
    <div
      className="starlight-tokens"
      role="img"
      aria-label={`星明り: 光${light}枚、闇${dark}枚`}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const isLight = index < light;
        return (
          <span
            key={index}
            className={`starlight-token ${isLight ? "light-side" : "dark-side"}`}
            title={isLight ? "光面" : "闇面"}
            aria-hidden="true"
          >
            <img
              src={`/assets/game-pieces/starlight-${isLight ? "light" : "dark"}.png`}
              alt=""
            />
          </span>
        );
      })}
    </div>
  );
}
