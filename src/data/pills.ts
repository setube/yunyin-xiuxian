/**
 * 丹药库 —— 32 味,24 味可炼制,8 味仅掉落。
 *
 * ## 定价法则(Phase 32.6 丹药价值审计)
 *
 * 玩家问的从来不是"这个数是不是太大",而是"凭什么"。凭什么一味白捡的丹,
 * 比一炉四十味灵草炼出来的还管用?下面七条就是那个"凭什么",由
 * core/pillValue.spec.ts 逐条守住 —— 往后每添一味新丹,都得先过这七关。
 *
 * - **A 掉落上限**:掉落品的药力 ≤ 同族、规格不低于它的最近可炼对照 × 0.6。
 *   这个比例不是拍脑袋定的:寿元线上凤髓膏对千年延寿丹、蟠桃对万寿金丹,
 *   两处都恰是五成 —— 游戏自己早就写对了,只是其余四条线没跟上。
 * - **B 品质单调**:同族同线内,品质越高药力不越低。品质标签不参与任何效果计算,
 *   这条是替它兜底,让它至少与药力序对得上。
 * - **C 增益唯一**:没有两味丹指向同一个 buff。共用等于零成本复制一张方子的产出。
 * - **D 计价单位**:固定点数(expFixed)只用于准入境界 0 的入门丹 —— 它每上一个
 *   大境界贬值 5.2 倍,配给高境界的丹等于让它在首次现身那一刻就已过期。
 * - **E 掉落非空**:每个大境界都掉得出东西。
 * - **F 资源重置须可炼**:满额回资源(灵气 ≥80%)必须付出制备代价。灵气是突破的
 *   门槛资源,一枚回满即抵两次半突破 —— 战术上最强的即时效果不能是白捡的。
 * - **H 不碾压顶端**:掉落线顶端不越过同族可炼线顶端,否则炼丹在那条线上失去意义。
 *
 * 五条计价轴随境界的走势各不相同(百分比恒定 / 固定点数指数贬值 / 寿元绝对值不变),
 * 所以跨丹比较必须统一到同一境界折算。折算口径见 core/pillValue.ts。
 */
import type { PillDef, QualityId } from '@/types'

function p(
  id: string,
  name: string,
  quality: QualityId,
  minRealm: number,
  desc: string,
  body: Partial<Pick<PillDef, 'kind' | 'instant' | 'buffId' | 'recipe' | 'alchemyLevel'>>,
  icon = 'flask'
): PillDef {
  return {
    id,
    name,
    quality,
    minRealm,
    desc,
    icon,
    kind: body.kind ?? 'instant',
    instant: body.instant,
    buffId: body.buffId,
    recipe: body.recipe,
    alchemyLevel: body.alchemyLevel
  }
}

export const PILLS: PillDef[] = [
  // ---- 可炼制 ----
  p('p_jvqisan', '聚气散', 'mortal', 0, '最粗浅的灵药,聊胜于无', {
    instant: { expFixed: 30 },
    recipe: { herb: 4, stoneBase: 8 },
    alchemyLevel: 1
  }),
  p('p_jvqidan', '聚气丹', 'fine', 0, '服之灵气涌动,修为小进', {
    instant: { expFixed: 80 },
    recipe: { herb: 8, stoneBase: 15 },
    alchemyLevel: 1
  }),
  p('p_huichun', '回灵丹', 'fine', 0, '回复五成灵气', { instant: { qiPct: 0.5 }, recipe: { herb: 6, stoneBase: 10 }, alchemyLevel: 1 }),
  p(
    'p_wudaocha',
    '悟道茶',
    'fine',
    0,
    '以灵茶入道,战斗中所悟更多',
    { kind: 'buff', buffId: 'buff_wudao', recipe: { herb: 8, stoneBase: 12 }, alchemyLevel: 2 },
    'leaf'
  ),
  p('p_ningshen', '凝神丹', 'fine', 0, '突破前服用,心神凝定', {
    kind: 'buff',
    buffId: 'buff_ningshen',
    recipe: { herb: 10, stoneBase: 18 },
    alchemyLevel: 2
  }),
  p('p_juling', '聚灵丹', 'excellent', 0, '半个时辰内修炼倍增', {
    kind: 'buff',
    buffId: 'buff_juling',
    recipe: { herb: 14, stoneBase: 25 },
    alchemyLevel: 2
  }),
  p('p_zhanling', '战灵丹', 'excellent', 1, '战意沸腾,攻防俱增', {
    kind: 'buff',
    buffId: 'buff_zhanli',
    recipe: { herb: 16, stoneBase: 30 },
    alchemyLevel: 3
  }),
  p('p_huxin', '护心丹', 'excellent', 1, '护住心脉,减免伤害', {
    kind: 'buff',
    buffId: 'buff_huxin',
    recipe: { herb: 16, stoneBase: 30 },
    alchemyLevel: 3
  }),
  p('p_shenxing', '神行丹', 'excellent', 1, '脚下生风,历练如飞', {
    kind: 'buff',
    buffId: 'buff_shenxing',
    recipe: { herb: 18, stoneBase: 32 },
    alchemyLevel: 3
  }),
  p('p_pojing', '破境丹', 'spirit', 1, '冲击境界的至宝,机不可失', {
    kind: 'buff',
    buffId: 'buff_pojing',
    recipe: { herb: 30, stoneBase: 60 },
    alchemyLevel: 4
  }),
  p('p_xuanyuan', '玄元丹', 'spirit', 2, '玄元之气化入丹中,修为大进', {
    instant: { expReqPct: 0.12 },
    recipe: { herb: 24, stoneBase: 45 },
    alchemyLevel: 4
  }),
  p('p_jingang', '金刚液', 'spirit', 2, '服之肉身坚若金刚', {
    kind: 'buff',
    buffId: 'buff_jingang',
    recipe: { herb: 26, stoneBase: 48 },
    alchemyLevel: 4
  }),
  p('p_tianyun', '天运丹', 'spirit', 3, '窃一缕天运,福泽加身', {
    kind: 'buff',
    buffId: 'buff_tianyun',
    recipe: { herb: 30, stoneBase: 55 },
    alchemyLevel: 5
  }),
  p('p_xuanming', '玄冥护体丹', 'spirit', 3, '渡劫前服用,可抵雷霆', {
    kind: 'buff',
    buffId: 'buff_xuanming',
    recipe: { herb: 32, stoneBase: 60 },
    alchemyLevel: 5
  }),
  p('p_yanshou', '延寿丹', 'spirit', 2, '延寿三十载', {
    instant: { lifespanYears: 30 },
    recipe: { herb: 40, stoneBase: 80 },
    alchemyLevel: 5
  }),
  /**
   * 灵乳(Phase 32.6 从"仅掉落"改入可炼线)。
   *
   * 一口回满灵气这件事本身没有错 —— 灵气是突破的门槛资源,一枚顶两次半突破,
   * 它本就该是战术上最锋利的那一味。错的是它过去不要钱:准入境界 0、无需丹方、
   * 零材料、零炸炉风险,炼气期掉出来的每一枚丹都是它。
   *
   * 所以校准的方向不是把「回满」削成「回半」(那只会让它变成一味零成本的回灵丹,
   * 异常仍在),而是照法则 F 给它成本:丹方须另行习得、准入金丹、炉火四转。
   *
   * 定价刻意只取回灵丹单位灵气成本的两倍上下 —— 再贵就没人炼了。灵乳与回灵丹
   * 的差别不在便宜多少,而在**一枚顶两枚**:同为四转灵品的规格、十三倍于回灵丹的
   * 灵石开销(按境界层级折算),换一次干净利落的满额重置。
   */
  p(
    'p_lingru',
    '灵乳',
    'spirit',
    2,
    '万年钟乳凝成的灵液,一口涤尽枯竭 —— 灵材难得,火候更难',
    { instant: { qiPct: 1 }, recipe: { herb: 16, stoneBase: 32 }, alchemyLevel: 4 },
    'droplets'
  ),
  p('p_dahuan', '大还丹', 'profound', 4, '起死人肉白骨,修为暴涨', {
    instant: { expReqPct: 0.2 },
    recipe: { herb: 50, stoneBase: 100 },
    alchemyLevel: 6
  }),
  p('p_wudaodan', '悟道丹', 'profound', 3, '服之如聆道音,悟道点 +20', {
    instant: { wudao: 20 },
    recipe: { herb: 45, stoneBase: 90 },
    alchemyLevel: 6
  }),
  p('p_qianshou', '千年延寿丹', 'profound', 4, '延寿两百载', {
    instant: { lifespanYears: 200 },
    recipe: { herb: 80, stoneBase: 160 },
    alchemyLevel: 7
  }),
  p('p_taixu', '太虚丹', 'earth', 5, '丹成有太虚幻境相随', {
    instant: { expReqPct: 0.25 },
    recipe: { herb: 90, stoneBase: 200 },
    alchemyLevel: 8
  }),
  p('p_wanshou', '万寿金丹', 'earth', 6, '延寿千载,金丹光华内蕴', {
    instant: { lifespanYears: 1000 },
    recipe: { herb: 150, stoneBase: 350 },
    alchemyLevel: 9
  }),
  p('p_jiuzhuan', '九转还魂丹', 'heaven', 7, '九转丹成,天地同贺', {
    instant: { expReqPct: 0.3 },
    recipe: { herb: 200, stoneBase: 500 },
    alchemyLevel: 10
  }),
  p('p_gangqisan', '罡气散', 'excellent', 1, '服之罡气环身,盾出伤随', {
    kind: 'buff',
    buffId: 'buff_gangdun',
    recipe: { herb: 18, stoneBase: 35 },
    alchemyLevel: 3
  }),
  p('p_pofudan', '破釜丹', 'spirit', 2, '断却生路,方见杀机', {
    kind: 'buff',
    buffId: 'buff_pofu',
    recipe: { herb: 28, stoneBase: 50 },
    alchemyLevel: 4
  }),
  // ---- 仅掉落 / 事件 ----
  /**
   * 妖血丹(Phase 32.6 由准入境界 1 降回 0,药力 100 → 45)。
   *
   * 它的旧毛病不是"比灵乳弱",是**一出生就已过期**:准入筑基期却用固定点数计价,
   * 玩家第一次见到它时,那一百点修为已经贬得只值一次呼吸。
   * 照法则 D 让它回到入门位置,照法则 A 定在聚气丹的六成上 ——
   * 它的战术位置本就是「便宜、常用、低风险的战斗续航」,不必跟灵乳比回复量。
   */
  p('p_yaoxue', '妖血丹', 'fine', 0, '以妖血炼成,药力狂暴,散修行走在外的常备之物', { instant: { expFixed: 45 } }),
  /**
   * 雷灵丹(Phase 32.6 由增益改为即时修为)。
   *
   * 它过去与战灵丹指向同一个「战意沸腾」—— 一味白捡的丹零成本复制了一张
   * 灵品丹方的全部产出,违反法则 C。现改走修为线,定在玄元丹的六成上(法则 A),
   * 战意重归战灵丹独有。
   */
  p('p_leiling', '雷灵丹', 'spirit', 3, '雷灵之力灌顶淬体,痛楚过后修为暴涨', { instant: { expReqPct: 0.07 } }, 'zap'),
  p('p_fengsui', '凤髓膏', 'profound', 4, '凤髓所炼,延寿百载', { instant: { lifespanYears: 100 } }, 'flame'),
  /** 龙气丹:照法则 A 定在同为玄品的大还丹的五成(0.2 → 0.1) */
  p('p_longqi', '龙气丹', 'profound', 4, '一缕真龙之气,修为大涨', { instant: { expReqPct: 0.1 } }),
  /**
   * 仙尘散(Phase 32.6 悟道点 50 → 18)。
   *
   * 照法则 H:白捡的一撮尘,不该胜过四十五味灵草炼足六转的悟道丹。
   */
  p('p_xianchen', '仙尘散', 'earth', 6, '仙人遗蜕所化之尘,拈起一撮,悟道点 +18', { instant: { wudao: 18 } }, 'star'),
  p('p_pantao', '蟠桃', 'earth', 5, '瑶池灵桃,延寿五百载', { instant: { lifespanYears: 500 } }, 'leaf'),
  p('p_zaohua', '造化丹', 'heaven', 5, '服之道韵加身', { kind: 'buff', buffId: 'bless_daoyun' }, 'star'),
  /** 混沌丹:照法则 H 退到九转还魂丹之下(0.35 → 0.15)—— 全表最强的修为丹不该是白捡的 */
  p('p_hundun', '混沌丹', 'immortal', 8, '混沌初分时的一缕本源', { instant: { expReqPct: 0.15 } })
]

const BY_ID = new Map(PILLS.map(x => [x.id, x]))

export function pillDef(id: string): PillDef | undefined {
  return BY_ID.get(id)
}
