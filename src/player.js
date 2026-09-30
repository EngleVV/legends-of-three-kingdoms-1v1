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

  // 从手牌或装备区移除（贯石斧/制衡/武圣等可动用装备区的牌）
  removeCards(cards) {
    this.removeFromHand(cards);
    const ids = new Set(cards.map(c => c.id));
    for (const k of Object.keys(this.equip)) {
      if (this.equip[k] && ids.has(this.equip[k].id)) this.equip[k] = null;
    }
  }

  // 该牌是否为自己的牌（手牌或装备区）
  owns(card) {
    return !!card && (this.hand.some(h => h.id === card.id)
      || Object.values(this.equip).some(e => e && e.id === card.id));
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
