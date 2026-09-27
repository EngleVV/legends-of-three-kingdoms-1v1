import { cardLabel } from './data/cards.js';

export class Player {
  constructor(hero, controller, seat) {
    this.hero = hero;
    this.controller = controller;
    this.seat = seat;
    this.name = hero.name;
    this.maxHp = hero.hp;
    this.hp = hero.hp;
    this.hand = [];
    this.equip = { weapon: null, armor: null, 'horse+': null, 'horse-': null };
    this.judgeZone = [];
    // 每回合重置的临时状态
    this.flags = {};
  }

  get alive() {
    return this.hp > 0;
  }

  removeFromHand(cards) {
    const ids = new Set(cards.map(c => c.id));
    this.hand = this.hand.filter(c => !ids.has(c.id));
  }

  allCards() {
    return [
      ...this.hand,
      ...Object.values(this.equip).filter(Boolean),
      ...this.judgeZone,
    ];
  }

  resetTurnFlags() {
    this.flags = { shaUsed: 0, rendeGiven: 0, zhihengUsed: false, skipPlay: false };
  }

  describe() {
    return `${this.name}(${this.hp}/${this.maxHp} 血, 手牌 ${this.hand.length})`;
  }

  static cardSummary(card) {
    return cardLabel(card);
  }
}
