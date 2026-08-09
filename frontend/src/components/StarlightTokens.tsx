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
            className={`starlight-token ${isLight ? "is-light" : "is-dark"}`}
            title={isLight ? "光面" : "闇面"}
            aria-hidden="true"
          >
            <span className="starlight-token-face starlight-token-light">
              <img src="/assets/game-pieces/starlight-light.png" alt="" />
            </span>
            <span className="starlight-token-face starlight-token-dark">
              <img src="/assets/game-pieces/starlight-dark.png" alt="" />
            </span>
          </span>
        );
      })}
    </div>
  );
}
