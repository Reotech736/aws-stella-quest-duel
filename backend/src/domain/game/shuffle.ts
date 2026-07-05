import type { CardId } from "./card";

export type RandomSource = () => number;

export function shuffleCards(
  cards: readonly CardId[],
  random: RandomSource,
): CardId[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = random();

    if (
      !Number.isFinite(randomValue) ||
      randomValue < 0 ||
      randomValue >= 1
    ) {
      throw new RangeError("乱数は0以上1未満である必要があります。");
    }

    const swapIndex = Math.floor(randomValue * (index + 1));
    const currentCard = shuffled[index];
    const swapCard = shuffled[swapIndex];

    if (currentCard === undefined || swapCard === undefined) {
      throw new Error("シャッフル対象のカードを取得できません。");
    }

    shuffled[index] = swapCard;
    shuffled[swapIndex] = currentCard;
  }

  return shuffled;
}
