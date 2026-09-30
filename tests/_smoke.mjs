import { Game } from '../src/core/game.js';
import { AIController } from '../src/ai/ai-controller.js';
import { HERO_LIST, SKILL_INFO } from '../src/data/heroes.js';
import { MISSING_AI, allCards } from '../src/core/registry.js';
const N = +process.argv[2] || 50, n = +process.argv[3] || 2;
let errs = 0; const cnt = {};
const names = allCards().map(c => c.name).concat(['连环状态', '传导', '重铸', '火焰伤害', '雷电伤害', '（酒）', '跳过摸牌', '被点燃', '白银狮子】防止']);
for (let i = 0; i < N; i++) {
  const hs = [...HERO_LIST].sort(() => Math.random() - .5).slice(0, n);
  const logs = [];
  const g = new Game({ heroes: hs, controllers: hs.map(() => new AIController()), logger: m => { logs.push(m); for (const k of names) if (m.includes(k)) cnt[k] = (cnt[k] || 0) + 1; }, decks: ['standard', 'junzheng'] });
  try {
    await g.run();
    const total = g.deck.cards.length + g.deck.discardPile.length + g.pendingDiscard.length + g.players.reduce((s, p) => s + p.allCards().length, 0);
    if (total !== 160) { errs++; console.log('conservation', total, hs.map(h=>h.id), logs.slice(-6).join('\n')); }
    if (logs.some(l => l.includes('失败'))) { console.log('reject:', logs.filter(l => l.includes('失败')).slice(0,3)); }
  } catch (e) { errs++; console.log(hs.map(h => h.id), e.stack.split('\n').slice(0,5).join('\n')); console.log(logs.slice(-6).join('\n')); }
}
console.log('errors', errs, 'missing', [...MISSING_AI]);
console.log(Object.entries(cnt).map(([k,v])=>`${k}:${v}`).join(' '));
