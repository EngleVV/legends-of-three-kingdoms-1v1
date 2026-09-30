# 扩展包与武将扩展指南

新增武将、技能、卡牌**只需在扩展包目录里写定义**，不改引擎、界面和 AI。引擎通过时机与修正点调用技能，界面按询问的 `reason` 读取技能的 `prompt`，AI 按 `reason` 读取技能的 `ai`。

## 目录

```
packs/
├── index.js              # 扩展包登记处：import 后 registerPack
└── standard/             # 标准包
    ├── index.js          # 扩展包对象 { id, name, avatarDir, heroes, skills, cards, deck }
    ├── heroes.js         # 武将数据
    ├── deck.js           # 牌堆 [{ name: 卡牌 id, suit, rank }]
    ├── cards/            # 卡牌定义（基本 / 锦囊 / 延时锦囊 / 装备）
    └── skills/           # 一技能一文件
```

## 新增一个扩展包

1. 新建 `packs/<包 id>/index.js`：

```js
import heroes from './heroes.js';
import xxx from './skills/xxx.js';

export default {
  id: 'wind', name: '风包',
  avatarDir: 'assets/heroes/wind',   // 头像按「avatarDir/武将 id.png」查找，缺图时显示纯文字武将牌
  heroes,                            // [{ id, name, kingdom, hp, gender, skills: [...], lordSkills: [...] }]
  skills: [xxx],
  cards: [],                         // 新卡牌定义（可选）
  deck: [],                          // 新增进牌堆的牌（可选）
};
```

2. 在 `packs/index.js` 中 `import` 并 `registerPack(...)`。选将界面会自动出现该扩展包的筛选按钮。
3. 运行 `npm test`：`tests/registry.test.js` 会检查技能是否登记、时机名是否合法、可选发动的技能是否有 AI 决策，并跑 AI 对局检查缺失的决策函数与牌数守恒。

## 技能模板

```js
import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'xxx', name: '某技', desc: '技能描述（界面悬停、选将说明、默认提示都用它）',
  lord: true,       // 主公技（仅身份为主公时拥有），放在武将的 lordSkills 里
  locked: true,     // 锁定技（界面标注）

  // ---- 触发技：挂在引擎时机上（全部时机见 core/registry.js 的 EVENTS） ----
  triggers: {
    damaged: {
      can: (ctx, owner, game) => ctx.target === owner,   // 是否满足发动条件
      info: ctx => ({ source: ctx.source }),              // 询问「是否发动」时传给玩家/AI 的信息
      // optional: false  不由引擎询问是否发动（在 run 里自行询问，如每点伤害分别询问）
      // locked: true     强制发动
      async run(ctx, owner, game) {
        game.skillLog(owner, 'xxx');                      // 战报「X 发动【某技】」
        // 通过修改 ctx 影响后续结算：ctx.amount / ctx.target / ctx.result / ctx.skip / ctx.stop ...
      },
    },
  },

  // ---- 锁定技的数值/规则修正（见 MODIFIERS） ----
  modifiers: {
    distanceFrom: () => -1,                                 // 你计算与其他角色的距离 -1
    targetable: ctx => !(ctx.card === 'sha'),               // 不能成为【杀】的目标
  },

  // ---- 转化技：将牌当另一种牌使用或打出 ----
  viewAs: [{ as: 'sha', ok: card => card.suit === '♥', equip: true /* 可用装备区的牌 */, when: (game, p) => true }],

  // ---- 主动技（出牌阶段点技能按钮发动） ----
  active: {
    cards: { min: 1, max: 1, zone: 'hand' },               // zone: 'hand' | 'any'（含装备区）
    targets: { min: 1, max: 1, ok: (game, p, t, picked) => t !== p },
    limit: { phase: 1 },                                    // 出牌阶段限一次（次数由引擎记录）
    usable: (game, p) => p.hand.length > 0,
    async run(game, player, { cards, targets }) { /* 效果 */ },
  },

  // ---- 该技能发起的判定：鬼才等改判技能、界面说明据此判断结果好坏 ----
  judge: { name: '某技', effective: card => card.suit !== '♥', good: true, desc: '非红桃：生效' },

  // ---- AI 决策（按需提供；缺失时 AI 取消并被完整性测试发现） ----
  ai: {
    invoke: (game, p, info) => true,                        // 是否发动
    order: 100, play: (game, p) => ({ skillId: 'xxx', cards: [...], targets: [...] }),  // 主动技
    chooseCards: (game, p, opts) => [...],                  // 本技能发起的选牌
    choosePlayers: (game, p, opts) => [...],                // 本技能发起的选角色
    chooseOption: (game, p, opts) => opts.options[0].id,    // 本技能发起的选择一项
    respond: (game, p, req) => card,                        // 本技能要求别人打出牌时，别人如何响应
  },

  // ---- 界面文案（按需提供；缺失时使用「是否发动【某技】？」等默认文案） ----
  // h：{ who(角色), cn(牌名), label(牌), cards(牌组), names(角色组), nth(第几张) }
  prompt: {
    invoke: (info, h) => [`是否对 ${h.who(info.source)} 发动【某技】？`, '说明'],
    chooseCards: (opts, h, n) => ['提示', '说明', '放弃按钮文字'],
    choosePlayers: (opts, h, picked) => ['提示', '说明', '放弃按钮文字'],
    chooseOption: (opts, h) => ['提示', '说明'],
    respond: (req, h) => '提示',
    active: (n, h) => '选牌阶段提示',
    target: (picked, h, n) => '选目标阶段提示',
    hint: me => '主动技的补充说明',
  },
});
```

### 技能状态

技能自己的计数/标记存在 `player.st(scope, id)` 里，引擎在对应时机统一清空：

| scope | 清空时机 | 例 |
| --- | --- | --- |
| `phase` | 每个阶段开始 | 出牌阶段限一次（`active.limit` 自动使用） |
| `turn` | 回合开始与结束 | 裸衣本回合伤害 +1、仁德本回合已给出张数 |
| `round` | 每轮开始 | 每轮限一次 |
| `game` | 不清空 | 限定技、觉醒技、标记 |

### 与玩家交互

在 `run` 里通过 `game.ask(player, method, opts)` 询问，`opts.reason` 填技能 id，界面与 AI 会据此找到本技能的 `prompt` / `ai`：

| 方法 | 用途 |
| --- | --- |
| `askSkillInvoke(id, info)`（或 `game.invoke(owner, id, info)`） | 是否发动 |
| `askChooseCards({ reason, count, from, optional, includeEquip, exclude, info })` | 选牌（自己的牌 / 目标区域 / 坐骑） |
| `askChoosePlayers({ reason, candidates, min, max, optional, info })` | 选角色 |
| `askChooseOption({ reason, options: [{ id, label }], info })` | 选择一项（如选花色） |
| `askArrange({ reason, cards })` | 排列牌（置于牌堆顶/底） |
| `askRespondCard({ type, reason, info })`（或 `respond(game, player, req)`） | 要求打出牌 |

## 卡牌模板

卡牌与技能共用 `triggers` / `modifiers` / `viewAs` / `ai` / `prompt`：装备牌在装备区时，其效果与技能一样参与结算。

```js
import { defineCard } from '../../../core/registry.js';

export default defineCard({
  id: 'xxx', name: '某牌', type: 'trick',                  // basic | trick | delayed | equip
  subType: 'weapon', range: 3,                             // 装备栏位与武器攻击范围
  kind: 'sha', nature: 'fire',                             // 牌类与属性（火【杀】：牌类是【杀】，火焰伤害）
  target: { distance: 1, min: 1, max: 2, ok: (game, from, to) => true },
                                                           // 需要目标：distance 为 'attack' | 数字 | 省略；
                                                           //   min/max 目标数（铁索连环 1~2 名）；self: true 可对自己使用
  usable: (game, p) => true,                               // 出牌阶段使用条件
  respondOnly: true,                                       // 只能响应使用（闪、无懈可击）
  rescue: 'any',                                           // 濒死可当求救牌：'any' 桃 | 'self' 酒（仅自救）
  recast: true,                                            // 可重铸：置入弃牌堆并摸一张牌（不是使用）
  harmful: true,                                           // 有害锦囊（AI 考虑用无懈抵消）
  async use(game, { player, card, reals, targets, victim }) { /* 效果 */ },
  onLose(game, player, card) { /* 离开装备区时（白银狮子回复体力） */ },
  ai: { order: 50, play: (game, p, use) => ({ card: use.card, targets: [...], recast: false }), value: 5 },
  prompt: { use: (game, me, card) => '是否使用【某牌】？' },
});

属性伤害与铁索连环由引擎统一结算：伤害走 `beforeDamage`（来源方：酒/古锭刀等）→ `receiveDamage`
（目标方：藤甲/白银狮子）→ 扣体力 → 濒死 → `damaged` → 连环传导。牌是否对目标有效由 `effective`
修正决定（藤甲挡普通【杀】/南蛮/万箭）。
```
