// UIController：把引擎的每次询问转为页面上的选择会话（Promise）
import { Controller } from '../controller.js';

export class UIController extends Controller {
  constructor() {
    super();
    this.pending = null;
  }

  _begin(mode, opts = {}) {
    return new Promise(resolve => {
      this.pending = { mode, opts, resolve, selected: [], seq: [], skillId: null, asSha: false };
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
    if (pend.mode === 'play' || pend.mode === 'respond') {
      // 丈八蛇矛：可选两张手牌当【杀】（其余情况单选）
      const me = this.game?.players[0];
      const zhangba = me?.equip.weapon?.name === 'zhangba';
      if (i >= 0) { pend.selected.splice(i, 1); pend.asSha = false; return; }
      if (zhangba && pend.selected.length === 1
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
      const max = pend.opts?.count ?? Infinity;
      if (i >= 0) pend.selected.splice(i, 1);
      else if (pend.selected.length < max) pend.selected.push(card);
    }
  }

  // 武圣：把已选的牌改以【杀】名义使用
  useAsSha() {
    const pend = this.pending;
    if (pend && pend.mode === 'play' && pend.selected.length === 1) pend.asSha = true;
  }

  toggleGuanxing(card) {
    const pend = this.pending;
    if (!pend) return;
    const i = pend.seq.findIndex(c => c.id === card.id);
    if (i >= 0) pend.seq.splice(i, 1);
    else pend.seq.push(card);
  }

  startSkill(skillId) {
    const pend = this.pending;
    if (!pend || pend.mode !== 'play') return;
    pend.skillId = skillId;
    pend.selected = [];
  }

  backToPlay() {
    const pend = this.pending;
    if (!pend) return;
    pend.skillId = null;
    pend.selected = [];
    pend.asSha = false;
  }
}
