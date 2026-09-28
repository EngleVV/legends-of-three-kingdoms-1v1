import { Deck } from './deck.js';
import { Player } from '../player.js';
import { buildStandardDeck, cardLabel } from '../data/cards.js';
import { SKILL_REGISTRY } from '../data/skills/index.js';
import { runTurn } from './turn.js';
import { applyDamage } from './damage.js';

// 时机常量
export const Trigger = {
  PHASE_START: 'phaseStart',       // {player, phase}
  PHASE_END: 'phaseEnd',           // {player}
  BECOME_TARGET: 'becomeTarget',   // {card, source, target} → {blocked:true} 拦截
  DAMAGED: 'damaged',              // {source, target, amount, card, nature}
  BEFORE_JUDGE: 'beforeJudge',     // {player, judgeCard, reason} → {card} 改判
};

export class Game {
  constructor({ heroes, controllers, logger }) {
    this.logFn = logger || ((msg) => {});
    this.players = heroes.map((hero, i) => new Player(hero, controllers[i], i));
    // 让 controller 能访问局面（AI 决策需要）
    controllers.forEach((c, i) => { if (c) c.game = this; });
    this.deck = new Deck(buildStandardDeck());
    this.over = false;
    this.winner = null;
    this.turnCount = 0;
    this.hooks = [];
    this.onUpdate = null; // UI 渲染回调
    this.pendingDiscard = []; // 待进弃牌堆的结算中卡牌（奸雄可捡）
    this.currentTurnSeat = 0; // 当前回合角色座位
    this.currentPhase = null; // 当前阶段（供 UI 显示处理区）
    this.lastAction = null;   // 最近一次出牌 {player, card, targets}
    this.wugu = null;         // 五谷丰登结算中：{ cards, taken: {cardId: 玩家名} }
  }

  log(msg) {
    this.logFn(msg);
    this.notify();
  }

  notify() {
    if (this.onUpdate) this.onUpdate();
  }

  // ---------- 钩子系统 ----------
  registerHeroHooks() {
    for (const p of this.players) {
      for (const skillId of p.hero.skills) {
        const skill = SKILL_REGISTRY[skillId];
        if (!skill) continue;
        for (const hook of skill.hooks) {
          // 绑定技能持有者
          this.hooks.push({
            trigger: hook.trigger,
            priority: hook.priority ?? 0,
            canTrigger: hook.canTrigger ? (ctx, g) => hook.canTrigger(ctx, g, p) : null,
            handler: (ctx, g) => hook.handler(ctx, g, p),
            skillId,
            owner: p,
          });
        }
      }
    }
    this.hooks.sort((a, b) => a.priority - b.priority);
  }

  async emit(trigger, ctx) {
    const results = [];
    for (const h of this.hooks) {
      if (h.trigger !== trigger) continue;
      if (this.over) break;
      if (h.canTrigger && !(await h.canTrigger(ctx, this))) continue;
      const r = await h.handler(ctx, this);
      if (r) results.push({ ...r, from: h.owner, skillId: h.skillId });
    }
    return results;
  }

  blocked(results) {
    return results.some(r => r.blocked);
  }

  // ---------- 基础询问（包装，供 UI 刷新） ----------
  async ask(player, method, ...args) {
    this.notify();
    const r = await player.controller[method](player, ...args);
    this.notify();
    return r;
  }

  // ---------- 牌堆 ----------
  opponentOf(p) {
    return this.players[1 - p.seat];
  }

  // 按座位顺序排列的角色列表；默认从当前回合角色开始（询问/结算顺序基准）
  seatOrder(from = null) {
    const start = from ? from.seat : (this.currentTurnSeat ?? 0);
    return [...this.players.slice(start), ...this.players.slice(0, start)];
  }

  drawOne() {
    return this.deck.drawOne();
  }

  drawCards(player, n) {
    for (let i = 0; i < n; i++) {
      const c = this.drawOne();
      if (c) player.hand.push(c);
    }
    this.log(`${player.name} 摸 ${n} 张牌`);
  }

  discardCards(cards, { pending = false } = {}) {
    if (!cards || cards.length === 0) return;
    if (pending) {
      // 结算中的牌先挂起（奸雄可获取），下一张牌结算前落入弃牌堆
      this.pendingDiscard.push(...cards);
    } else {
      this.flushPending();
      this.deck.discard(cards);
    }
    this.notify();
  }

  flushPending() {
    if (this.pendingDiscard.length) {
      this.deck.discard(this.pendingDiscard.splice(0));
    }
  }

  // 卡牌是否还在“结算中暂存区”（供奸雄获取）
  takePending(card) {
    const i = this.pendingDiscard.findIndex(c => c.id === card.id);
    if (i >= 0) {
      this.pendingDiscard.splice(i, 1);
      return true;
    }
    return false;
  }

  // ---------- 装备 ----------
  equipCard(player, card) {
    const slot = card.subType;
    const old = player.equip[slot];
    if (old) this.deck.discard([old]);
    player.removeFromHand([card]);
    player.equip[slot] = card;
    this.log(`${player.name} 装备了 ${cardLabel(card)}`);
  }

  async loseEquip(target, slot) {
    const card = target.equip[slot];
    if (!card) return null;
    target.equip[slot] = null;
    this.deck.discard([card]);
    this.log(`${target.name} 的 ${cardLabel(card)} 被置入弃牌堆`);
    return card;
  }

  // 从目标的区域中取出一张牌并返回（不做后续处置，由调用方决定获得还是弃置）。
  // zone: 'hand'（手牌不可见，随机取一张）| 装备栏位 key | 判定区的牌名。
  // 顺手牵羊 / 过河拆桥 / 反馈 共用，避免各写一份导致遗漏某个区域。
  // UI 上虽然让玩家点选某一张牌背，但牌背顺序与真实手牌无关（官方同样洗乱显示），故统一随机。
  takeCardFromArea(target, zone) {
    if (zone === 'hand') {
      if (!target.hand.length) return null;
      const c = target.hand[Math.floor(Math.random() * target.hand.length)];
      target.removeFromHand([c]);
      return c;
    }
    if (target.equip[zone]) {
      const c = target.equip[zone];
      target.equip[zone] = null;
      return c;
    }
    const i = target.judgeZone.findIndex(c => c.name === zone);
    if (i >= 0) return target.judgeZone.splice(i, 1)[0];
    return null;
  }

  // ---------- 伤害/回复 ----------
  async damage(source, target, amount, card = null, nature = 'normal') {
    await applyDamage(this, source, target, amount, card, nature);
  }

  heal(player, amount = 1) {
    if (player.hp >= player.maxHp) return false;
    player.hp = Math.min(player.maxHp, player.hp + amount);
    this.log(`${player.name} 回复 ${amount} 点体力（${player.hp}/${player.maxHp}）`);
    return true;
  }

  // ---------- 主流程 ----------
  async run() {
    this.registerHeroHooks();
    this.log(`对局开始：${this.players.map(p => p.name).join(' vs ')}`);
    for (const p of this.players) this.drawCards(p, 4);
    let current = Math.round(Math.random());
    this.log(`${this.players[current].name} 先手`);
    while (!this.over) {
      await runTurn(this, this.players[current]);
      current = 1 - current;
      if (++this.turnCount > 500) {
        this.log('回合数超限，判定为平局');
        break;
      }
    }
    if (this.winner) this.log(`游戏结束，胜者：${this.winner.name}`);
    return this.winner;
  }
}
