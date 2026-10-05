/**
 * 地界物产的行文 —— 那一档阶位。
 *
 * 掉落装备的阶位与 region.tier 同源:afterWin / 离线结算 / 镇压产出把 gear 喂给
 * generateEquipment 时用的都是这一档。从前阶位藏在数值里 —— 玩家压了高级远境、
 * 掉出远超当前的高阶装备,却回溯不出「这是哪来的」。出发前亮出「产 X 阶之物」,
 * 阶位成了可预期的信息,数值爆炸才不是无迹可寻。
 */
export function produceTierText(tier: number): string {
  return `产 ${tier} 阶之物`
}
