// 军争篇 52 张：每种花色 A~K 各一张。与标准版 108 张合计 160 张
const suit = (s, names) => names.map((name, i) => ({ name, suit: s, rank: i + 1 }));

export default [
  ...suit('♠', ['gudingdao', 'tengjia', 'jiu', 'leisha', 'leisha', 'leisha', 'leisha', 'leisha', 'jiu', 'bingliang', 'tiesuo', 'tiesuo', 'wuxie']),
  ...suit('♣', ['baiyin', 'tengjia', 'jiu', 'bingliang', 'leisha', 'leisha', 'leisha', 'leisha', 'jiu', 'tiesuo', 'tiesuo', 'tiesuo', 'tiesuo']),
  ...suit('♥', ['wuxie', 'huogong', 'huogong', 'huosha', 'tao', 'tao', 'huosha', 'shan', 'shan', 'huosha', 'shan', 'shan', 'wuxie']),
  // ♦K 骅骝（+1 马）
  ...suit('♦', ['zhuque', 'tao', 'tao', 'huosha', 'huosha', 'shan', 'shan', 'shan', 'jiu', 'shan', 'shan', 'huogong', 'ma+1']),
];
