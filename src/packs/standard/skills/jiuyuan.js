import { defineSkill } from '../../../core/registry.js';

export default defineSkill({
  id: 'jiuyuan', name: '救援', lord: true, locked: true,
  desc: '主公技，锁定技，其他吴势力角色在你濒死时对你使用【桃】，你额外回复 1 点体力。',
  triggers: {
    peachUsed: {
      locked: true,
      can: (ctx, owner) => ctx.target === owner && ctx.source !== owner && ctx.source.hero.kingdom === '吴',
      run(ctx) {
        ctx.amount += 1;
        ctx.notes.push('【救援】额外回复 1 点');
      },
    },
  },
});
