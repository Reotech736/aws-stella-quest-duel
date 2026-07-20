import type { GameView } from "../api/types";
import { GameCard } from "./GameCard";

type CollectionLedgerProps = {
  readonly players: GameView["players"];
};

export function CollectionLedger({ players }: CollectionLedgerProps) {
  return (
    <aside className="collection-ledger" aria-label="獲得カード">
      <header>
        <p className="section-code">収集台帳</p>
        <h2>獲得カード</h2>
      </header>
      <div className="collection-entries">
        {players.map((player) => (
          <section key={player.playerId} className="collection-entry">
            <h3>
              {player.displayName}
              {player.isViewer ? "（あなた）" : ""}
            </h3>
            <div className="collection-cards">
              {player.collection.length === 0 ? (
                <span className="empty-collection">まだありません</span>
              ) : (
                player.collection.map((card, index) => (
                  <GameCard key={card.cardId ?? index} card={card} />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
