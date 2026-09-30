// 诊断脚本：用 UIController 管道 + 自动应答模拟人类玩家，跑完整对局
// 用法：node tests/ui-sim.js [局数]
import { Game } from '../src/core/game.js';
import { UIController } from '../src/ui/ui-controller.js';
import { HEROES, HERO_LIST } from '../src/data/heroes.js';
import {
  choosePlay, chooseRespond, choosePeach, chooseNullify,
  chooseCards, choosePlayers, chooseOption, chooseArrange,
} from '../src/ai/strategy.js';

class AutoUI extends UIController {
  _begin(mode, opts = {}) {
    const pr = super._begin(mode, opts);
    queueMicrotask(() => this._auto());
    return pr;
  }

  _auto() {
    const pend = this.pending;
    if (!pend) return;
    const me = this.game.players[0];
    const g = this.game;
    try {
      switch (pend.mode) {
        case 'play': return this._finish(choosePlay(g, me));
        case 'respond': return this._finish(chooseRespond(g, me, pend.opts.req));
        case 'peach': return this._finish(choosePeach(g, me, pend.opts.info));
        case 'nullify': return this._finish(chooseNullify(g, me, pend.opts.effect));
        case 'invoke': return this._finish(true);
        case 'pick-hand': case 'pick-zone': case 'pick-wugu':
          return this._finish(chooseCards(g, me, pend.opts.opts));
        case 'pick-player': return this._finish(choosePlayers(g, me, pend.opts.opts));
        case 'pick-option': return this._finish(chooseOption(g, me, pend.opts.opts));
        case 'arrange': return this._finish(chooseArrange(g, me, pend.opts));
        default: return this._finish(null);
      }
    } catch (e) {
      console.error('自动应答异常，mode =', pend.mode, e);
      this._finish(null);
    }
  }
}

const rounds = Number(process.argv[2] || 20);
let done = 0;
const ids = HERO_LIST.map(h => h.id);

for (let i = 0; i < rounds; i++) {
  const h1 = HEROES[ids[i % ids.length]];
  const h2 = HEROES[ids[(i + 3) % ids.length]];
  const ui = new AutoUI();
  let lastLog = '';
  const game = new Game({
    heroes: [h1, h2],
    controllers: [ui, null], // 占位，下面替换
  });
  // AI 侧用最朴素控制器（全取消）会拖延对局，改用 strategy 驱动
  const { AIController } = await import('../src/ai/ai-controller.js');
  const ai = new AIController(0);
  game.players[1].controller = ai;
  ai.game = game;

  const timeout = setTimeout(() => {
    console.error(`第 ${i + 1} 局卡住！${h1.name} vs ${h2.name}，最后日志：${lastLog}`);
    console.error('pending =', JSON.stringify(ui.pending?.mode), JSON.stringify(ui.pending?.opts?.req?.reason || ''));
    process.exit(1);
  }, 5000);

  try {
    await game.run();
  } catch (e) {
    console.error(`第 ${i + 1} 局异常：`, e);
    process.exit(1);
  }
  clearTimeout(timeout);
  done++;
  lastLog = 'finished';
}
console.log(`${done}/${rounds} 局全部完成，无卡死`);
