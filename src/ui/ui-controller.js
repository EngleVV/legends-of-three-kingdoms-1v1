// UIController：把引擎的每次询问转为页面上的选择会话（Promise）
import { Controller } from '../controller.js';

export class UIController extends Controller {
  constructor() {
    super();
    this.pending = null;
  }

  _begin(mode, opts = {}) {
    return new Promise(resolve => {
      // targets/victim：出牌阶段选中的目标（借刀杀人的 victim 为其【杀】的目标）
      this.pending = { mode, opts, resolve, selected: [], skillId: null, asSha: false, targets: [], victim: null };
      // 观星：官方初始把所有牌放在「牌堆顶」一行，玩家再调整顺序或拖到「牌堆底」
      if (mode === 'guanxing') this.pending.gx = { top: [...opts.cards], bottom: [] };
      // pending 就绪后必须重绘，否则横幅/可点牌停留在旧状态，玩家会看到"卡死"
      this.game?.notify();
    });
  }

  _finish(result) {
    const p = this.pending;
    this.pending = null;
    if (p) p.resolve(result);
  }

  askPlayCard() { return this._begin('play'); }
  askRespondCard(p, req) { return this._begin('respond', { req }); }
  askPeach(p, info) { return this._begin('peach', { info }); }
  askNullify(p, effect) { return this._begin('nullify', { effect }); }
  askSkillInvoke(p, skillId, info) { return this._begin('invoke', { skillId, info }); }
  askChooseCards(p, opts) {
    if (opts.from === 'target-area' || opts.from === 'horse') return this._begin('pick-zone', { opts });
    if (opts.from === 'wugu') return this._begin('pick-wugu', { opts });
    return this._begin('pick-hand', { opts });
  }
  askChooseJudgeReplace(p, info) { return this._begin('judge-replace', { info }); }
  askGuanxing(p, cards) { return this._begin('guanxing', { cards }); }

  // ---- 供 app.js 事件处理调用 ----
  toggleCard(card) {
    const pend = this.pending;
    if (!pend) return;
    const i = pend.selected.findIndex(c => c.id === card.id);
    if (pend.mode === 'play' && pend.skillId) {
      // 制衡（弃置任意张）/ 仁德（交出任意张）：多选，再点一次取消；丈八蛇矛至多两张
      const max = pend.skillId === 'zhangba' ? 2 : Infinity;
      if (i >= 0) pend.selected.splice(i, 1);
      else if (pend.selected.length < max) pend.selected.push(card);
    } else if (pend.mode === 'play') {
      // 出牌阶段单选（丈八蛇矛的双牌【杀】需先点「丈八蛇矛」按钮）
      if (i >= 0) { pend.selected.splice(i, 1); pend.asSha = false; return; }
      pend.selected = [card];
      pend.asSha = false;
    } else if (pend.mode === 'respond') {
      // 响应【杀】时，装备丈八蛇矛可选两张手牌当【杀】打出（其余情况单选）
      const me = this.game?.players[0];
      const zhangba = me?.equip.weapon?.name === 'zhangba';
      if (i >= 0) { pend.selected.splice(i, 1); pend.asSha = false; return; }
      const inHand = c => me.hand.some(h => h.id === c.id);
      if (zhangba && pend.selected.length === 1 && inHand(pend.selected[0]) && inHand(card)
        && pend.selected[0].name !== 'sha' && card.name !== 'sha') {
        // 已选 1 张非杀牌，再选 1 张非杀牌 → 组成合成【杀】
        pend.selected.push(card);
        pend.asSha = false;
        return;
      }
      pend.selected = [card];
      pend.asSha = false;
    } else if (pend.mode === 'peach' || pend.mode === 'nullify' || pend.mode === 'judge-replace') {
      // 单选
      pend.selected = i >= 0 ? [] : [card];
    } else {
      // 多选（pick-hand）
      const max = pend.opts?.opts?.count ?? Infinity;
      if (i >= 0) pend.selected.splice(i, 1);
      else if (pend.selected.length < max) pend.selected.push(card);
    }
  }

  // 武圣：把已选的牌改以【杀】名义使用
  useAsSha() {
    const pend = this.pending;
    if (pend && pend.mode === 'play' && pend.selected.length === 1) pend.asSha = true;
  }

  // 观星：把一张牌移到 row（'top'|'bottom'）的第 index 位；index 省略则放到末尾
  moveGuanxing(cardId, row, index = Infinity) {
    const gx = this.pending?.gx;
    if (!gx) return;
    let card = null;
    for (const r of ['top', 'bottom']) {
      const i = gx[r].findIndex(c => c.id === cardId);
      if (i >= 0) {
        card = gx[r].splice(i, 1)[0];
        // 同行内后移：移除后目标下标需左移一位
        if (r === row && i < index) index--;
      }
    }
    if (!card) return;
    gx[row].splice(Math.max(0, Math.min(index, gx[row].length)), 0, card);
  }

  startSkill(skillId) {
    const pend = this.pending;
    if (!pend || pend.mode !== 'play') return;
    pend.skillId = skillId;
    pend.selected = [];
    pend.targets = [];
    pend.victim = null;
  }

  backToPlay() {
    const pend = this.pending;
    if (!pend) return;
    pend.skillId = null;
    pend.selected = [];
    pend.asSha = false;
    pend.targets = [];
    pend.victim = null;
  }
}
