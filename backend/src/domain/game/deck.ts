import type { CardId } from "./card";
import { shuffleCards, type RandomSource } from "./shuffle";

export interface DrawFromPilesInput {
  readonly deck: readonly CardId[];
  readonly discardPile: readonly CardId[];
  readonly count: number;
  readonly random: RandomSource;
}

export interface DrawFromPilesResult {
  readonly deck: CardId[];
  readonly discardPile: CardId[];
  readonly drawnCards: CardId[];
}

export function drawFromPiles(
  input: DrawFromPilesInput,
): DrawFromPilesResult {
  let deck = [...input.deck];
  let discardPile = [...input.discardPile];
  const drawnCards: CardId[] = [];

  while (drawnCards.length < input.count) {
    if (deck.length === 0) {
      const discardTop = discardPile.at(-1);

      if (discardTop === undefined || discardPile.length === 1) {
        break;
      }

      const recyclableCards = discardPile.slice(0, -1);
      deck = shuffleCards(recyclableCards, input.random);
      discardPile = [discardTop];
    }

    const card = deck.pop();

    if (card === undefined) {
      break;
    }

    drawnCards.push(card);
  }

  return {
    deck,
    discardPile,
    drawnCards,
  };
}
