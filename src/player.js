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
    // 引擎的每回合统计（出【杀】次数、是否跳过出牌阶段……），每回合重置
    this.flags = {};
    // 技能状态：按作用域存放，由引擎在对应时机统一清空（见 resetState）
    //   phase：每个阶段开始时清空（出牌阶段限一次等）
    //   turn：每个回合开始和结束时清空（本回合生效的效果）
    //   round：每轮开始时清空
    //   game：整局保留（限定技、觉醒技、标记）
    this.state = { phase: {}, turn: {}, round: {}, game: {} };
    // 获得/失去的技能（扩展武将用：如觉醒获得技能）
    this.gainedSkills = [];
    this.lostSkills = [];
    // 身份局：role = lord | loyalist | rebel | renegade；1v1 为 null
    this.role = null;
    this.roleRevealed = false;
    // 连环状态（铁索连环）
    this.chained = false;
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
    // 离开装备区的牌（白银狮子等在失去时生效）
    (this.lostEquipCards ||= []).push(c);
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
    // shaBonus：本回合下一张【杀】的伤害加成（酒）；skipDraw / skipPlay：跳过摸牌 / 出牌阶段（兵粮寸断 / 乐不思蜀）
    this.flags = { shaUsed: 0, shaPlayed: false, skipPlay: false, skipDraw: false, shaBonus: 0 };
  }

  // 某技能在某作用域下的状态对象（不存在时创建）
  st(scope, id) {
    const bucket = this.state[scope];
    if (!bucket) throw new Error(`未知的技能状态作用域 ${scope}`);
    return (bucket[id] ??= {});
  }

  resetState(scope) {
    this.state[scope] = {};
  }

  describe() {
    return `${this.name}(${this.hp}/${this.maxHp} 血, 手牌 ${this.hand.length})`;
  }

  static cardSummary(card) {
    return cardLabel(card);
  }
}
