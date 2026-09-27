// 渲染：状态 → DOM（全量重绘）
import {
  CARD_NAME, cardLabel, isRed, canTarget, distance, attackRange,
  canUseInPlayPhase, canUseZhangbaSha, canUseAsSha, canZhangbaPair, canUseCardAs,
  shaLeftOf, shaLimitOf, EQUIP_RANGE,
} from '../data/cards.js';
import { hasSkill, HERO_LIST } from '../data/heroes.js';
import { realsOf } from '../core/util.js';

const SUIT_SYM = { '♠': '♠', '♥': '♥', '♣': '♣', '♦': '♦' };
const RANK_STR = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
// 官方牌面的类别标识
const TYPE_LABEL = { basic: '基本', trick: '锦囊', delayed: '延时锦囊' };
const SUBTYPE_LABEL = { weapon: '武器', armor: '防具', 'horse+': '坐骑', 'horse-': '坐骑' };

export function cardHtml(card, { small = false, selectable = false, selected = false, virtualSha = false } = {}) {
  const type = card.type || 'basic';
  const cls = ['card', isRed(card) ? 'red' : 'black', `t-${type}`];
  if (small) cls.push('small');
  if (selectable) cls.push('selectable');
  if (selected) cls.push('selected');
  if (virtualSha) cls.push('virtual-sha');
  const cname = CARD_NAME[card.name] || card.name;
  // 合成牌（丈八蛇矛）无花色/点数，需容错
  const rank = card.rank == null ? '' : (RANK_STR[card.rank] ?? card.rank);
  const suit = SUIT_SYM[card.suit] || '';
  // 类别标识：装备按子类显示「武器/防具/坐骑」，其余按牌类
  const cat = type === 'equip' ? (SUBTYPE_LABEL[card.subType] || '装备') : (TYPE_LABEL[type] || '');
  // 武器显示攻击范围（官方牌面右上角）
  const range = type === 'equip' && card.subType === 'weapon' ? EQUIP_RANGE[card.name] : null;
  // len-N 让 CSS 按牌名字数缩放字号，保证竖排单列不折行
  return `<div class="${cls.join(' ')}" data-card-id="${card.id}">
    <div class="corner"><span class="rank">${rank}</span><span class="suit">${suit}</span></div>
    ${range ? `<span class="range">${range}</span>` : ''}
    <div class="cname len-${cname.length}">${cname}</div>
    ${cat ? `<span class="cat">${cat}</span>` : ''}
  </div>`;
}

// 体力：官方勾玉，按剩余比例变色（残血脉动）
function hpHtml(p) {
  const hp = Math.max(0, p.hp);
  const ratio = p.maxHp > 0 ? hp / p.maxHp : 0;
  const state = hp <= 1 ? 'low' : ratio > 0.66 ? 'high' : ratio > 0.33 ? 'mid' : 'low';
  const full = '<i class="magatama full"></i>'.repeat(hp);
  const empty = '<i class="magatama empty"></i>'.repeat(Math.max(0, p.maxHp - hp));
  return `<div class="hp-hearts s-${state}">${full}${empty}<span class="hp-num">${p.hp}/${p.maxHp}</span></div>`;
}

const SLOT_LABEL = { weapon: '武器', armor: '防具', 'horse+': '+1马', 'horse-': '-1马' };
const EQUIP_SLOTS = ['weapon', 'armor', 'horse+', 'horse-'];

// 装备区：固定 4 槽位，空槽显示占位，避免布局跳动
// pick 用于制衡等「可弃置装备」的场景，标记哪些装备可点选/已选
function equipHtml(p, pick = null) {
  return EQUIP_SLOTS.map(slot => {
    const c = p.equip[slot];
    const opts = c && pick
      ? { small: true, selectable: true, selected: pick.has(c.id) }
      : { small: true };
    return `<div class="slot">
      <div class="zone-label">${SLOT_LABEL[slot]}</div>
      <div class="mini-cards">${c ? cardHtml(c, opts) : '<span class="slot-ph">—</span>'}</div>
    </div>`;
  }).join('');
}

function judgeHtml(p) {
  const cards = p.judgeZone.map(c => cardHtml(c, { small: true })).join('');
  return `<div class="zone judge">
    <div class="zone-label">判定区</div>
    <div class="mini-cards">${cards || '<span class="slot-ph">—</span>'}</div>
  </div>`;
}

// 对手手牌：牌背堆叠（最多画 8 张）
function handBackHtml(n) {
  const backs = '<i class="cardback"></i>'.repeat(Math.min(n, 8));
  return `<div class="hand-back"><div class="backs">${backs}</div><span class="hand-num">手牌 ${n}</span></div>`;
}

const KINGDOM_CLASS = { 蜀: 'k-shu', 魏: 'k-wei', 吴: 'k-wu', 群: 'k-qun' };

function playerZoneHtml(game, p, isSelf, equipPick = null) {
  const skillNames = p.hero.skills.map(s => SKILL_CNAME[s] || s).join(' · ');
  const isTurn = game.players[game.currentTurnSeat ?? 0] === p;
  // 头像图缺失时自行移除，回落为纯文字武将牌（不留白块）
  return `
    <div class="hero-plate${isTurn ? ' acting' : ''}">
      <div class="avatar" data-seat="${p.seat}">
        <img class="portrait" src="assets/heroes/${p.hero.id}.png" alt="" onerror="this.remove()">
        <span class="kingdom ${KINGDOM_CLASS[p.hero.kingdom] || ''}">${p.hero.kingdom}</span>
        <span class="hero-name">${p.name}</span>
      </div>
      ${hpHtml(p)}
      <div class="skills">${skillNames}</div>
    </div>
    <div class="zones">
      ${judgeHtml(p)}
      <div class="zone equips">${equipHtml(p, equipPick)}</div>
    </div>
    ${isSelf ? '' : handBackHtml(p.hand.length)}
  `;
}

const SKILL_CNAME = {
  rende: '仁德', jianxiong: '奸雄', zhiheng: '制衡', wusheng: '武圣',
  paoxiao: '咆哮', guanxing: '观星', kongcheng: '空城', fankui: '反馈',
  guicai: '鬼才', wushuang: '无双',
};

// ---------- 出牌阶段可选牌判断 ----------
// 全部委托给引擎的统一判据，避免 UI/引擎规则不一致。
// 一张牌可被点选的情形：① 能以本名使用；② 能被武圣转化为【杀】；③ 能作为丈八蛇矛的合成材料。
function usableAlone(game, p, card) {
  return canUseInPlayPhase(game, p, card)
    || (canUseAsSha(p, card) && canUseInPlayPhase(game, p, card, 'sha'));
}

function playableCheck(game, p, card) {
  return usableAlone(game, p, card) || canUseZhangbaSha(game, p);
}

// 距离 / 攻击范围 / 杀次数 提示
function rangeInfoHtml(game) {
  const [me, opp] = game.players;
  const d = distance(me, opp);
  const r = attackRange(me);
  const out = d <= r ? '' : '（对方在攻击范围外）';
  const limit = shaLimitOf(me);
  const shaInfo = limit === Infinity
    ? '【杀】不限次数'
    : `本回合还可出 ${shaLeftOf(me)} 张【杀】`;
  return `距离 ${d} · 攻击范围 ${r}${out} · ${shaInfo}`;
}

// 目标需选择的牌
const NEED_TARGET = ['sha', 'juedou', 'le', 'shunshou', 'guohe', 'jiedao'];

function respondCandidates(p, req) {
  if (!req) return [];
  // 能单独当所需牌打出的（牌名相符或武圣转化）
  const direct = p.hand.filter(c => canUseCardAs(p, c, req.type));
  // 丈八蛇矛：需要【杀】时，任意两张手牌均可作为合成材料
  if (req.type === 'sha' && canZhangbaPair(p)) return p.hand;
  return direct;
}

// ---------- 主渲染 ----------
export function renderGame(game, ui, logs) {
  const [me, opp] = game.players;
  const pend = ui.pending;

  const oppTargetable = pend?.mode === 'play' && pend.skillId !== 'zhiheng' && (
    (pend.skillId === 'rende' && pend.selected.length > 0) ||
    // 丈八蛇矛：两张手牌合成【杀】需指定目标
    (pend.skillId === null && pend.selected.length === 2) ||
    (pend.skillId === null && pend.selected.length === 1 && (
      NEED_TARGET.includes(pend.selected[0].name)
      // 武圣：以【杀】名义使用同样需要指定目标
      || pend.asSha
      || (!canUseInPlayPhase(game, me, pend.selected[0])
          && canUseAsSha(me, pend.selected[0])
          && canUseInPlayPhase(game, me, pend.selected[0], 'sha'))
    ))
  );

  document.getElementById('opp-row').innerHTML = playerZoneHtml(game, opp, false);
  document.getElementById('opp-row').classList.toggle('targetable', !!oppTargetable);
  // 制衡可弃置装备区的牌，故此时自己的装备需要可点选
  const equipPick = pend?.mode === 'play' && pend.skillId === 'zhiheng'
    ? new Set(pend.selected.map(c => c.id))
    : null;
  document.getElementById('self-row').innerHTML = playerZoneHtml(game, me, true, equipPick);

  // 手牌
  const handEl = document.getElementById('hand-row');
  let handSelectable = new Set(), selectedIds = new Set(), virtualShaIds = new Set();
  if (pend) {
    selectedIds = new Set(pend.selected.map(c => c.id));
    if (pend.mode === 'play') {
      if (pend.skillId) {
        handSelectable = new Set(me.hand.map(c => c.id));
      } else {
        handSelectable = new Set(me.hand.filter(c => playableCheck(game, me, c)).map(c => c.id));
      }
    } else if (pend.mode === 'respond') {
      handSelectable = new Set(respondCandidates(me, pend.opts.req).map(c => c.id));
      // 武圣转化标记：仅标注「牌名不符但可转化」的牌
      for (const c of me.hand) {
        if (c.name !== pend.opts.req.type && canUseCardAs(me, c, pend.opts.req.type)) {
          virtualShaIds.add(c.id);
        }
      }
    } else if (pend.mode === 'peach') {
      handSelectable = new Set(me.hand.filter(c => c.name === 'tao').map(c => c.id));
    } else if (pend.mode === 'nullify') {
      handSelectable = new Set(me.hand.filter(c => c.name === 'wuxie').map(c => c.id));
    } else if (pend.mode === 'judge-replace') {
      handSelectable = new Set(me.hand.map(c => c.id));
    } else if (pend.mode === 'pick-hand') {
      handSelectable = new Set(me.hand.map(c => c.id));
    }
  }
  handEl.innerHTML = me.hand.map(c =>
    cardHtml(c, { selectable: handSelectable.has(c.id), selected: selectedIds.has(c.id), virtualSha: virtualShaIds.has(c.id) })
  ).join('') || '<div class="hand-empty">（无手牌）</div>';

  // 中央：牌堆计数（紧凑，不再放溢出的卡牌）+ 处理区
  document.getElementById('deck-info').innerHTML = `
    <div class="pile"><span class="pile-n">${game.deck.remaining}</span><span class="pile-t">牌堆</span></div>
    <div class="pile"><span class="pile-n">${game.deck.discardPile.length}</span><span class="pile-t">弃牌</span></div>`;
  document.getElementById('field').innerHTML = fieldHtml(game);

  const logEl = document.getElementById('log');
  logEl.innerHTML = logs.slice(-80).map(l => l.html).join('');
  logEl.scrollTop = logEl.scrollHeight;

  // 横幅
  document.getElementById('banner').innerHTML = bannerHtml(game, ui);
}

// ---------- 中央处理区 ----------
const PHASE_NAME = {
  prepare: '准备', judge: '判定', draw: '摸牌', play: '出牌', discard: '弃牌', end: '结束',
};

function fieldHtml(game) {
  const turnP = game.players[game.currentTurnSeat ?? 0];
  const phase = PHASE_NAME[game.currentPhase] || '';
  const act = game.lastAction;
  // 优先展示「结算中」的牌（官方处理区语义），否则展示最近一次出牌，再否则展示弃牌堆顶
  let cards, label;
  if (game.pendingDiscard.length) {
    cards = game.pendingDiscard.slice(-4);
    label = '结算中';
  } else if (act) {
    cards = realsOf(act.card).slice(0, 4);
    const targetNames = (act.targets || []).map(t => t.name).join('、');
    label = `${act.player.name}${targetNames ? ` → ${targetNames}` : ''}`;
  } else {
    cards = game.deck.discardPile.slice(-4);
    label = cards.length ? '弃牌堆' : '';
  }
  return `
    <div class="field-head">
      <span class="turn-tag">${turnP.name} 的回合</span>
      ${phase ? `<span class="phase-tag">${phase}阶段</span>` : ''}
    </div>
    <div class="field-body">
      ${label ? `<span class="field-act">${label}</span>` : ''}
      <div class="mini-cards field-cards">${cards.map(c => cardHtml(c)).join('')}</div>
    </div>`;
}

// ---------- 横幅 ----------
function bannerHtml(game, ui) {
  const [me, opp] = game.players;
  const pend = ui.pending;
  if (!pend) {
    const turnPlayer = game.players[game.currentTurnSeat ?? 0];
    return `<span class="hint">${turnPlayer === me ? '对方行动中…' : '等待对方…'}</span>`;
  }
  const btn = (action, label, { primary = false, disabled = false } = {}) =>
    `<button data-action="${action}" ${primary ? 'class="primary"' : ''} ${disabled ? 'disabled' : ''}>${label}</button>`;

  let prompt = '', hint = '', buttons = '';

  switch (pend.mode) {
    case 'play': {
      if (pend.skillId === 'zhiheng') {
        const n = pend.selected.length;
        prompt = '【制衡】选择要弃置的牌（任意张）';
        hint = '手牌与装备区的牌都可以弃置';
        buttons = btn('confirm-zhiheng', `确定${n ? `（${n}）` : ''}`, { primary: true, disabled: n === 0 }) + btn('cancel-skill', '返回');
      } else if (pend.skillId === 'rende') {
        const n = pend.selected.length;
        prompt = '【仁德】选择要交出的手牌，然后点击对方头像';
        hint = `已选 ${n} 张（累计满 2 张可回复 1 点体力）`;
        buttons = btn('cancel-skill', '返回');
      } else {
        const sel = pend.selected[0];
        prompt = '出牌阶段';
        hint = rangeInfoHtml(game);
        if (pend.selected.length === 2) {
          // 丈八蛇矛：两张手牌合成【杀】，需指定目标
          prompt = '【丈八蛇矛】将两张手牌当【杀】，请点击对方头像为目标';
          buttons = btn('cancel-skill', '取消选择');
        } else if (sel) {
          const selfOk = canUseInPlayPhase(game, me, sel);
          const asShaOk = canUseAsSha(me, sel) && canUseInPlayPhase(game, me, sel, 'sha');
          const pairOk = canZhangbaPair(me) && canUseZhangbaSha(game, me);
          const cname = CARD_NAME[sel.name] || sel.name;

          if (pend.asSha || (!selfOk && asShaOk)) {
            // 武圣：以【杀】名义使用，需指定目标
            prompt = `【武圣】将 ${cname} 当【杀】使用，请点击对方头像为目标`;
            buttons = btn('cancel-skill', '取消选择');
          } else if (!selfOk) {
            // 只能作为丈八蛇矛的合成材料（如【闪】【无懈可击】）
            prompt = `已选【${cname}】，请再选一张手牌组成【杀】`;
            buttons = btn('cancel-skill', '取消选择');
          } else if (NEED_TARGET.includes(sel.name)) {
            prompt = `已选【${cname}】，请点击对方头像为目标`;
            buttons = (asShaOk ? btn('use-as-sha', '当【杀】使用') : '') + btn('cancel-skill', '取消选择');
          } else {
            prompt = `使用【${cname}】？`;
            if (pairOk) hint = '也可再选一张手牌组成【杀】';
            buttons = btn('confirm-play', '确定', { primary: true })
              + (asShaOk ? btn('use-as-sha', '当【杀】使用') : '')
              + btn('cancel-skill', '取消选择');
          }
        } else {
          const hasActiveSkill = hasSkill(me, 'zhiheng') || hasSkill(me, 'rende');
          buttons =
            (hasSkill(me, 'zhiheng') ? btn('skill-zhiheng', '制衡') : '') +
            (hasSkill(me, 'rende') ? btn('skill-rende', '仁德') : '') +
            btn('end-play', '结束出牌', { primary: !hasActiveSkill });
        }
      }
      break;
    }
    case 'respond': {
      const req = pend.opts.req;
      // 提示语必须由「需要打出什么」(req.type) 决定；reason 只提供「为什么」的上下文。
      // 早先把两者混在一张表里，导致对方使用【杀】时错误提示“请打出【杀】”。
      const need = req.type === 'sha' ? '【杀】' : '【闪】';
      const because = {
        sha: '对方使用【杀】',
        juedou: '决斗',
        nanman: '南蛮入侵',
        wanjian: '万箭齐发',
        qinglong: '青龙偃月刀追杀',
        jiedao: '借刀杀人',
      }[req.reason];
      prompt = because ? `${because}，请打出${need}` : `请打出${need}`;
      const n = pend.selected.length;
      // 「确定」只在选择确实合法时可用：单张需牌名相符或有转化途径（武圣），
      // 两张则须是丈八蛇矛的合成【杀】。否则玩家会以为响应成功却实际白挨伤害。
      const composite = n === 2 && req.type === 'sha' && canZhangbaPair(me);
      const single = n === 1 && canUseCardAs(me, pend.selected[0], req.type);
      if (composite) hint = '【丈八蛇矛】以两张手牌当【杀】打出';
      else if (n === 1 && !single) hint = canZhangbaPair(me)
        ? '该牌不能单独当此牌使用，请再选一张组成【杀】'
        : '该牌不能当此牌使用';
      buttons = btn('confirm-respond', '确定', { primary: true, disabled: !(single || composite) })
        + btn('cancel', '取消');
      break;
    }
    case 'peach': {
      prompt = pend.opts.info.dying === me ? '你正在濒死！请使用【桃】' : `请对 ${pend.opts.info.dying.name} 使用【桃】`;
      buttons = btn('confirm-peach', '确定', { primary: true, disabled: pend.selected.length !== 1 }) + btn('cancel', '放弃');
      break;
    }
    case 'nullify': {
      const e = pend.opts.effect;
      prompt = e.isNullify ? '是否用【无懈可击】抵消对方的【无懈可击】？' : `是否用【无懈可击】抵消【${e.name}】？`;
      buttons = btn('confirm-nullify', '确定', { primary: true, disabled: pend.selected.length !== 1 }) + btn('cancel', '不抵消');
      break;
    }
    case 'invoke': {
      const name = pend.opts.skillId === 'bagua' ? '八卦阵'
        : pend.opts.skillId === 'jianxiong' ? '奸雄（获得伤害你的牌）'
        : pend.opts.skillId === 'fankui' ? '反馈（获得伤害来源一张牌）'
        : pend.opts.skillId === 'cixiong' ? '雌雄双股剑' : pend.opts.skillId;
      prompt = `是否发动【${name}】？`;
      buttons = btn('yes', '发动', { primary: true }) + btn('no', '不发动');
      break;
    }
    case 'judge-replace': {
      const { judgeCard, reason, player: judger } = pend.opts.info;
      const whose = !judger || judger === me ? '你' : judger.name;
      prompt = `【鬼才】是否替换${whose}的判定牌？（${reason}，当前判定：${cardLabel(judgeCard)}）`;
      buttons = btn('confirm-judge-replace', '确定', { primary: true, disabled: pend.selected.length !== 1 }) + btn('cancel', '不替换');
      break;
    }
    case 'pick-hand': {
      const { count, reason, optional } = pend.opts.opts;
      const text = {
        'discard-phase': `请选择 ${count} 张手牌弃置`,
        'guanshi': '【贯石斧】弃 2 张牌强制命中？',
        'cixiong-discard': '【雌雄双股剑】弃 1 张手牌（取消则让对方摸牌）',
      }[reason] || `请选择 ${count} 张手牌`;
      prompt = text;
      const ok = pend.selected.length === count;
      buttons = btn('confirm-pick', '确定', { primary: true, disabled: !ok }) +
        (optional ? btn('cancel', '取消') : '');
      break;
    }
    case 'pick-zone': {
      const { from, reason, info } = pend.opts.opts;
      const t = info?.target;
      prompt = reason === 'qilin' ? '【麒麟弓】弃置对方一匹马' : `选择 ${t ? t.name : '对方'} 的一张牌`;
      const zones = from === 'horse'
        ? (t.equip['horse+'] ? ['horse+'] : []).concat(t.equip['horse-'] ? ['horse-'] : [])
        : [...(t.hand.length ? ['hand'] : []), ...(t.equip.weapon ? ['weapon'] : []), ...(t.equip.armor ? ['armor'] : []),
           ...t.judgeZone.map(c => c.name), ...(t.equip['horse+'] ? ['horse+'] : []), ...(t.equip['horse-'] ? ['horse-'] : [])];
      const zoneLabel = z => z === 'hand' ? '手牌（随机）'
        : SLOT_LABEL[z] || (t.judgeZone.some(c => c.name === z) ? CARD_NAME[z] : z);
      // 无懈链期间对方可能把牌打光：无区可选时允许跳过，避免死局
      const fallback = zones.length === 0
        ? btn('cancel', '无牌可选，跳过') 
        : zones.map(z => btn(`zone:${z}`, zoneLabel(z))).join('') +
          (pend.opts.opts.optional ? btn('cancel', '取消') : '');
      buttons = fallback;
      break;
    }
    case 'pick-wugu': {
      prompt = '【五谷丰登】选择一张牌';
      buttons = pend.opts.opts.info.candidates.map(c => cardHtml(c, { small: true, selectable: true })).join('');
      break;
    }
    case 'guanxing': {
      const rest = pend.opts.cards.filter(c => !pend.seq.some(s => s.id === c.id));
      prompt = '【观星】点击牌置于牌堆顶（先点的最先摸到），未点击的沉入牌堆底';
      hint = `牌堆顶 ${pend.seq.length} 张 / 沉底 ${rest.length} 张`;
      buttons = pend.seq.map(c => cardHtml(c, { small: true, selected: true })).join('') +
        rest.map(c => cardHtml(c, { small: true, selectable: true })).join('') +
        btn('confirm-guanxing', '确定', { primary: true });
      break;
    }
  }
  return `<span class="prompt">${prompt}</span>${hint ? `<span class="hint">${hint}</span>` : ''}<span style="flex:1"></span>${buttons}`;
}

// ---------- 选将界面 ----------
export function renderSetup(selectedId) {
  const el = document.getElementById('setup');
  el.classList.remove('hidden');
  document.getElementById('game').classList.add('hidden');
  el.innerHTML = `
    <h1>三 国 杀</h1>
    <h2>1v1 · 标准版 · 选择你的武将</h2>
    <div id="hero-grid">
      ${HERO_LIST.map(h => `
        <div class="hero-card ${h.id === selectedId ? 'selected' : ''}" data-hero="${h.id}">
          <div class="face"><img src="assets/heroes/${h.id}.png" alt="" onerror="this.remove()"></div>
          <div class="name">${h.name}</div>
          <div class="kingdom-line">${h.kingdom} · ${h.hp} 体力</div>
          <div class="skills">${h.skills.map(s => SKILL_CNAME[s] || s).join('、')}</div>
        </div>`).join('')}
    </div>
    <button class="primary" data-action="start-game" ${selectedId ? '' : 'disabled'}>开始对局</button>
  `;
}

export function renderResult(game) {
  if (!game.over) return;
  const [me] = game.players;
  const win = game.winner === me;
  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  overlay.innerHTML = `
    <div>
      <div class="result ${win ? 'win' : 'lose'}">${win ? '胜 利' : '失 败'}</div>
      <div style="text-align:center;color:#c9b78a;margin-top:12px;font-size:16px">胜者：${game.winner.name}</div>
      <div style="text-align:center"><button data-action="restart">再来一局</button></div>
    </div>`;
  document.body.appendChild(overlay);
}
