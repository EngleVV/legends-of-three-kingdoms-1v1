// Controller 接口：引擎通过这些异步询问获得玩家决策。
// 人类（UI 弹窗）与 AI（启发式）实现同一接口；默认全部"取消"。
// 询问的 reason 是发起询问的技能/卡牌 id，界面文案与 AI 决策都按 reason 查其定义（prompt / ai 字段）。
export class Controller {
  // 出牌阶段：返回 {card, targets[, victim]} / {cards, card, targets}（多张当一张）/ {skillId, cards, targets} / null(结束出牌)
  async askPlayCard(player) { return null; }

  // 响应牌：req = {type:'sha'|'shan', reason, info} → 返回 card 或 {card, as} 或 {cards, as} 或 null
  async askRespondCard(player, req) { return null; }

  // 濒死求桃：info = {dying} → 返回桃牌或 null
  async askPeach(player, info) { return null; }

  // 无懈可击：effect = {card, source, target, name, isNullify} → 返回无懈牌或 null
  async askNullify(player, effect) { return null; }

  // 是否发动技能/装备效果：→ boolean
  async askSkillInvoke(player, skillId, info) { return false; }

  // 选牌：opts = { reason, count, from, optional, includeEquip, exclude, noJudge, info }
  //   from: 'self'（自己的牌）| 'discard-phase' | 'target-area'（目标区域，返回区域描述 zone）
  //         | 'horse'（返回坐骑栏位）| 'wugu'（从 info.candidates 中选）
  async askChooseCards(player, opts) { return null; }

  // 选择角色：opts = { reason, candidates, min, max, optional, info } → 返回角色数组（空 / null 表示放弃）
  async askChoosePlayers(player, opts) { return null; }

  // 选择一项：opts = { reason, options: [{id, label}], info } → 返回所选 id
  async askChooseOption(player, opts) { return opts.options[0]?.id; }

  // 排列牌：opts = { reason, cards } → 返回 {top, bottom}
  //   top：置于牌堆顶的牌（数组第一个为最顶，即下次最先摸到）；bottom：置于牌堆底；未出现的牌视为沉底
  async askArrange(player, opts) { return { top: opts.cards, bottom: [] }; }
}
