import { Deck } from './deck.js';
import { Player } from '../player.js';
import { buildStandardDeck, cardLabel } from '../data/cards.js';
import { SKILL_REGISTRY } from '../data/skills/index.js';
import { runTurn } from './turn.js';
import { applyDamage } from './damage.js';
import { dealRoles, ROLE_NAME, SIDE_NAME } from './identity.js';

// 时机常量
export const Trigger = {
  PHASE_START: 'phaseStart',       // {player, phase}
  PHASE_END: 'phaseEnd',           // {player}
  BECOME_TARGET: 'becomeTarget',   // {card, source, target} → {blocked:true} 拦截
  DAMAGED: 'damaged',              // {source, target, amount, card, nature}
  BEFORE_JUDGE: 'beforeJudge',     // {player, judgeCard, reason} → {card} 改判
};

export class Game {
  // mode：'1v1'（两人单挑）| 'identity'（身份局）；roles：身份局按座位排列的身份
  constructor({ heroes, controllers, logger, mode = null, roles = null }) {
    this.logFn = logger || ((msg) => {});
    this.players = heroes.map((hero, i) => new Player(hero, controllers[i], i));
    this.mode = mode || (heroes.length === 2 ? '1v1' : 'identity');
    if (this.mode === 'identity') {
      const rs = roles || dealRoles(heroes.length);
      this.players.forEach((p, i) => {
        p.role = rs[i];
        // 主公明置身份；5 人及以上主公体力上限 +1
        if (p.role === 'lord') {
          p.roleRevealed = true;
          if (heroes.length >= 5) { p.maxHp += 1; p.hp += 1; }
        }
      });
    }
    this.winners = [];
    this.winnerSide = null;
    this.loyalty = this.players.map(() => 0);
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
    this.asking = null;       // 当前询问：{ player, method, args }
    this.indicator = null;    // 最近一次指定目标：{ seq, from, to: [座位] }
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
      // 阵亡角色的技能不再触发
      if (h.owner && !h.owner.alive) continue;
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
  // asking 记录「正在等谁做什么决定」，供 UI 显示对方思考中/等待提示
  async ask(player, method, ...args) {
    this.asking = { player, method, args };
    this.notify();
    try {
      return await player.controller[method](player, ...args);
    } finally {
      this.asking = null;
      this.notify();
    }
  }

  // ---------- 座位 ----------
  // 1v1 专用：唯一的对手。身份局请使用 others()
  opponentOf(p) {
    return this.others(p)[0] || null;
  }

  alivePlayers() {
    return this.players.filter(p => p.alive);
  }

  // 按座位顺序（逆时针）排列的存活角色；默认从当前回合角色开始（询问/结算顺序基准）
  seatOrder(from = null) {
    const start = from ? from.seat : (this.currentTurnSeat ?? 0);
    return [...this.players.slice(start), ...this.players.slice(0, start)].filter(p => p.alive);
  }

  // 除 p 以外的存活角色，从 p 的下家开始
  others(p) {
    // 按座位比较：规则判定可能传入 afterLosing 生成的角色视图（非同一对象）
    return this.seatOrder(p).filter(x => x.seat !== p.seat);
  }

  // p 的下家（下一名存活角色）
  nextAlive(p) {
    return this.others(p)[0] || p;
  }

  get lord() {
    return this.players.find(p => p.role === 'lord') || null;
  }

  // ---------- 牌堆 ----------

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
    this.log(`${player.name} 装备了 ${cardLabel(card)}${old ? `（替换 ${cardLabel(old)}）` : ''}`);
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

  // ---------- 指示线 ----------
  // 使用牌/技能指定目标时调用：UI 据此从使用者头像向各目标画指示线（官方的目标指示器）。
  // seq 单调递增，UI 以此判断是否为新的一次指定。
  pointAt(from, tos) {
    const to = (tos || []).filter(t => t && t !== from);
    if (!from || !to.length) return;
    this.indicator = { seq: (this.indicator?.seq || 0) + 1, from: from.seat, to: to.map(t => t.seat) };
    this.notify();
  }

  // ---------- 公开行为记录（身份推断） ----------
  // 所有人都能看到的行为：谁对谁使用了有害/有益的牌。据此维护每名角色的「忠诚度」：
  // 伤害主公或疑似忠方 → 降低；帮助主公或打击疑似反贼 → 升高。只依赖公开信息（主公身份、阵亡亮出的身份）。
  sideOf(p) {
    if (p.role === 'lord') return 2;
    if (p.roleRevealed) return { loyalist: 1, rebel: -1, renegade: 0 }[p.role] ?? 0;
    const v = this.loyalty[p.seat];
    return v > 0.5 ? 1 : v < -0.5 ? -1 : 0;
  }

  recordRelation(from, to, kind, w = 1) {
    if (this.mode !== 'identity' || !from || !to || from === to) return;
    if (from.role === 'lord') return; // 主公立场已知，无需推断
    const side = this.sideOf(to);
    if (!side) return;
    this.loyalty[from.seat] += (kind === 'help' ? 1 : -1) * side * w;
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
    let current;
    if (this.mode === '1v1') {
      this.log(`对局开始：${this.players.map(p => p.name).join(' vs ')}`);
      // 官方单挑规则：起始手牌数等于武将体力上限；为平衡先手，先手首个摸牌阶段少摸一张
      for (const p of this.players) this.drawCards(p, p.maxHp);
      current = this.players[Math.round(Math.random())];
      this.log(`${current.name} 先手`);
      this.firstTurnPending = true;
    } else {
      // 身份局：起手各 4 张，主公先行
      current = this.lord;
      this.log(`身份局开始：主公 ${current.name}（${current.maxHp} 体力）`);
      for (const p of this.seatOrder(current)) this.drawCards(p, 4);
    }
    while (!this.over) {
      await runTurn(this, current);
      if (this.over) break;
      current = this.nextAlive(current);
      if (++this.turnCount > 500) {
        this.log('回合数超限，判定为平局');
        break;
      }
    }
    if (this.mode === 'identity' && this.winnerSide) {
      this.log(`游戏结束，${SIDE_NAME[this.winnerSide]}获胜：${this.winners.map(p => `${p.name}（${ROLE_NAME[p.role]}）`).join('、')}`);
    } else if (this.winner) this.log(`游戏结束，胜者：${this.winner.name}`);
    return this.winner;
  }
}
