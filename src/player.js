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
    // 身份局：role = lord | loyalist | rebel | renegade；1v1 为 null
    this.role = null;
    this.roleRevealed = false;
    this.dead = false;
  }

  // 濒死（体力 ≤ 0 但尚未阵亡）的角色仍然存活，官方可在此时对其使用【桃】
  get alive() {
    return !this.dead;
  }

  // 失去牌的记录：连营（失去最后的手牌）、枭姬（失去装备区的牌）由 Game.flushLoseTriggers 在下一个决策点结算
  removeFromHand(cards) {
    const ids = new Set(cards.map(c => c.id));
    const before = this.hand.length;
    this.hand = this.hand.filter(c => !ids.has(c.id));
    if (before > 0 && this.hand.length === 0) this.lostLastHand = true;
  }

  // 清空某个装备栏位（统一入口，记录失去装备）
  clearEquip(slot) {
    if (!this.equip[slot]) return null;
    const c = this.equip[slot];
    this.equip[slot] = null;
    this.lostEquip = (this.lostEquip || 0) + 1;
    return c;
  }

  // 从手牌或装备区移除（贯石斧/制衡/武圣等可动用装备区的牌）
  removeCards(cards) {
    this.removeFromHand(cards);
    const ids = new Set(cards.map(c => c.id));
    for (const k of Object.keys(this.equip)) {
      if (this.equip[k] && ids.has(this.equip[k].id)) this.clearEquip(k);
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
    // used：出牌阶段限一次的技能是否已用（按技能 id）
    this.flags = { shaUsed: 0, rendeGiven: 0, zhihengUsed: false, skipPlay: false, used: {} };
  }

  describe() {
    return `${this.name}(${this.hp}/${this.maxHp} 血, 手牌 ${this.hand.length})`;
  }

  static cardSummary(card) {
    return cardLabel(card);
  }
}
