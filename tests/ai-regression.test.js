import { test } from 'node:test';
import assert from 'node:assert';
import { Game } from '../src/core/game.js';
import { AIController } from '../src/ai/ai-controller.js';
import { HERO_LIST } from '../src/data/heroes.js';

test('AI vs AI：100 局回归，无死循环、无异常', async () => {
  const results = { over: 0, draw: 0 };
  for (let i = 0; i < 100; i++) {
    const h1 = HERO_LIST[i % HERO_LIST.length];
    const h2 = HERO_LIST[(i * 5 + 3) % HERO_LIST.length];
    const g = new Game({
      heroes: [h1, h2],
      controllers: [new AIController(), new AIController()],
      logger: () => {},
    });
    const winner = await g.run();
    assert.ok(g.over || g.turnCount > 500, `第 ${i} 局 (${h1.name} vs ${h2.name}) 异常中断`);
    if (g.over) {
      results.over++;
      assert.ok(winner.hp > 0, '胜者必须存活');
    } else {
      results.draw++;
    }
  }
  assert.ok(results.over > 80, `绝大多数对局应分出胜负（胜 ${results.over}/100）`);
});
