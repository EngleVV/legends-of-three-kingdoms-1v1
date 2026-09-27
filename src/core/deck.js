export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Deck {
  constructor(cards) {
    this.cards = shuffle(cards);
    this.discardPile = [];
  }

  drawOne() {
    if (this.cards.length === 0) {
      if (this.discardPile.length === 0) return null; // 理论上 104 张不会发生
      this.cards = shuffle(this.discardPile.splice(0));
    }
    return this.cards.pop();
  }

  discard(cards) {
    this.discardPile.push(...cards);
  }

  // 将牌按顺序放回牌堆顶（数组第一个为最顶）
  putOnTop(cards) {
    this.cards.push(...[...cards].reverse());
  }

  // 将牌置于牌堆底（数组第一个沉得最深）
  putOnBottom(cards) {
    this.cards.unshift(...cards);
  }

  get remaining() {
    return this.cards.length;
  }
}
