// Controller 接口：引擎通过这些异步询问获得玩家决策。
// 人类（UI 弹窗）与 AI（启发式）实现同一接口；默认全部"取消"。
export class Controller {
  // 出牌阶段：返回 {card, targets} / {skillId, cards, targets} / null(结束出牌)
  async askPlayCard(player) { return null; }

  // 响应牌：req = {type:'sha'|'shan', reason, info} → 返回 card 或 {card, as} 或 null
  async askRespondCard(player, req) { return null; }

  // 濒死求桃：info = {dying} → 返回桃牌或 null
  async askPeach(player, info) { return null; }

  // 无懈可击：effect = {card, source, target, name, isNullify} → 返回无懈牌或 null
  async askNullify(player, effect) { return null; }

  // 是否发动技能（八卦阵/雌雄等）：→ boolean
  async askSkillInvoke(player, skillId, info) { return false; }

  // 通用选牌：
  //   from: 'self'(弃牌/贯石斧) | 'discard-phase' | 'target-area'(顺/拆, 返回 zone 描述)
  //         | 'horse'(麒麟弓, 返回 slot) | 'wugu'(五谷选牌)
  //   count: 需要数量; optional: 可取消
  async askChooseCards(player, opts) { return null; }

  // 鬼才改判：info = {judgeCard, reason} → 返回手牌或 null
  async askChooseJudgeReplace(player, info) { return null; }

  // 观星：cards 为亮出的牌，返回 {top, bottom}
  //   top：置于牌堆顶的牌（数组第一个为最顶，即下次最先摸到）
  //   bottom：置于牌堆底的牌；未出现在任一数组中的牌视为沉底
  async askGuanxing(player, cards) { return { top: cards, bottom: [] }; }

  // 出牌阶段的额外信息询问（借刀受害者等）
  async askVictim(player, info) { return info.victim || player; }
}
