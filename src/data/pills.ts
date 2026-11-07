/**
 * 丹药库 —— 72 味。
 *
 * 定价法则(spec 钉:core/pillValue.spec.ts,新丹须逐条过):
 * - A 掉落上限:掉落品药力 ≤ 同族、规格不低于它的最近可炼对照 × 0.6。
 * - B 品质单调:同族同线内,品质越高药力不越低。
 * - C 增益唯一:没有两味丹指向同一个 buff。
 * - D 计价单位:固定点数(expFixed)只用于准入境界 0 的入门丹(每上一个大境界贬值 5.2 倍)。
 * - E 掉落非空:每个大境界都掉得出东西。
 * - F 资源重置须可炼:满额回资源(灵气 ≥80%)必须付出制备代价。
 * - H 不碾压顶端:掉落线顶端不越过同族可炼线顶端。
 * - G 修为丹按等效闭关时长(expSecs)计价;按当前一层需求的百分比计价会让「囤低阶丹、到高境界服」
 *   成为最优解。详见 src/types 里 expSecs 字段。
 *
 * 各计价轴随境界走势不同,跨丹比较须折算到同一境界,口径见 core/pillValue.ts。
 */
import type { PillDef, PillQuality } from '@/types'
import { qualityDef, qualityTextColor } from './qualities'

function p(
  id: string,
  name: string,
  quality: PillQuality,
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
  p('p_ningshen', '凝神丹', 'fine', 0, '心神凝定,宜于小进阶之前;大关天劫,丹力不入', {
    kind: 'buff',
    buffId: 'buff_ningshen',
    recipe: { herb: 10, stoneBase: 18 },
    alchemyLevel: 2
  }),
  p('p_juling', '聚灵丹', 'excellent', 0, '一炷香内修炼加快(30 分钟)', {
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
  p('p_shenxing', '神行丹', 'excellent', 1, '脚下生风,同程妖踪更密,行程不减', {
    kind: 'buff',
    buffId: 'buff_shenxing',
    recipe: { herb: 18, stoneBase: 32 },
    alchemyLevel: 3
  }),
  p('p_pojing', '破境丹', 'spirit', 1, '破境只开小进阶;大关天劫,此丹不与', {
    kind: 'buff',
    buffId: 'buff_pojing',
    recipe: { herb: 30, stoneBase: 60 },
    alchemyLevel: 4
  }),
  /**
   * 修为线按等效闭关时长计价(法则 G);每味写「服之如闭关 X」,括号内为等价现代时长。
   * 对齐历练:一场遭遇 = 12 秒等效(BATTLE_EXP_SECS),丹的时长 ≈ 其灵草成本折算的场次 × 3
   * (玄元丹 24 味 ≈ 24 场 ≈ 五分钟,定 15 分)。
   */
  p('p_xuanyuan', '玄元丹', 'spirit', 2, '玄元之气化入丹中,服之如闭关一刻(15 分钟)', {
    instant: { expSecs: 900 },
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
  /** 灵乳:一口回满,照法则 F 入可炼线;定价约为回灵丹单位灵气成本的两倍 */
  p(
    'p_lingru',
    '灵乳',
    'spirit',
    2,
    '万年钟乳凝成的灵液,一口涤尽枯竭',
    { instant: { qiPct: 1 }, recipe: { herb: 16, stoneBase: 32 }, alchemyLevel: 4 },
    'droplets'
  ),
  p('p_dahuan', '大还丹', 'profound', 4, '服之如闭关一炷香(30 分钟)', {
    instant: { expSecs: 1800 },
    recipe: { herb: 47, stoneBase: 100 },
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
  p('p_taixu', '太虚丹', 'earth', 5, '丹成有太虚幻境相随,服之如闭关半个时辰(1 小时)', {
    instant: { expSecs: 3600 },
    recipe: { herb: 70, stoneBase: 130 },
    alchemyLevel: 8
  }),
  p('p_wanshou', '万寿金丹', 'earth', 6, '延寿千载,金丹光华内蕴', {
    instant: { lifespanYears: 1000 },
    recipe: { herb: 150, stoneBase: 350 },
    alchemyLevel: 9
  }),
  p('p_jiuzhuan', '九转还魂丹', 'heaven', 7, '九转丹成,服之如闭关一个时辰(2 小时)', {
    instant: { expSecs: 7200 },
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
  /** 妖血丹:照法则 D 准入 0,照法则 A 定在聚气丹的六成 */
  p('p_yaoxue', '妖血丹', 'fine', 0, '以妖血炼成,药力狂暴,散修行走在外的常备之物', { instant: { expFixed: 45 } }),
  /** 雷灵丹:走修为线,照法则 A 定在玄元丹的六成;战意归战灵丹独有(法则 C) */
  p('p_leiling', '雷灵丹', 'spirit', 3, '雷灵之力灌顶淬体,痛楚过后如闭关将近一刻(9 分钟)', { instant: { expSecs: 540 } }, 'zap'),
  p('p_fengsui', '凤髓膏', 'profound', 4, '凤髓所炼,延寿百载', { instant: { lifespanYears: 100 } }, 'flame'),
  /** 龙气丹:照法则 A 定在同为玄品的大还丹的六成 */
  p('p_longqi', '龙气丹', 'profound', 4, '一缕真龙之气,服之如闭关一刻有余(18 分钟)', { instant: { expSecs: 1080 } }),
  /** 仙尘散:照法则 H 压在悟道丹之下 */
  p('p_xianchen', '仙尘散', 'earth', 6, '仙人遗蜕所化之尘,拈起一撮,悟道点 +18', { instant: { wudao: 18 } }, 'star'),
  p('p_pantao', '蟠桃', 'earth', 5, '瑶池灵桃,延寿五百载', { instant: { lifespanYears: 500 } }, 'leaf'),
  p('p_zaohua', '造化丹', 'heaven', 5, '服之道韵加身', { kind: 'buff', buffId: 'bless_daoyun' }, 'star'),
  /** 混沌丹:照法则 H 压在九转还魂丹之下 */
  p('p_hundun', '混沌丹', 'immortal', 8, '混沌初分时的一缕本源,服之如闭关六刻(90 分钟)', { instant: { expSecs: 5400 } }),

  // ============ 仙界及以上(准入境界 9-20)============
  /** 修为线自九转还魂丹向上;同族可炼线内药力序与品质序一致(法则 B) */
  p('p_taichu', '太初丹', 'immortal', 10, '太初之气凝丹,服之如闭关一个半时辰(3 小时)', {
    instant: { expSecs: 10800 },
    recipe: { herb: 260, stoneBase: 640 },
    alchemyLevel: 10
  }),
  p('p_xiancheng', '仙成丹', 'divine', 14, '仙道既成,一枚抵两个时辰苦修(4 小时)', {
    instant: { expSecs: 14400 },
    recipe: { herb: 340, stoneBase: 900 },
    alchemyLevel: 10
  }),
  p('p_daoyuan', '道源丹', 'divine', 18, '一炉道源,吞服者如闭关两个半时辰(5 小时)', {
    instant: { expSecs: 18000 },
    recipe: { herb: 410, stoneBase: 1120 },
    alchemyLevel: 10
  }),
  /** 神王境与混沌两境的本境丹(见 contentDensity 的「每境一味」判据) */
  p('p_shenwu', '神悟丹', 'divine', 16, '一炉神悟,胜过经年面壁', {
    instant: { wudao: 106 },
    recipe: { herb: 420, stoneBase: 1200 },
    alchemyLevel: 10
  }),
  p('p_hunyuan', '混元丹', 'divine', 19, '混元一炉,吞之抵三个时辰闭关(6 小时)', {
    instant: { expSecs: 21600 },
    recipe: { herb: 490, stoneBase: 1550 },
    alchemyLevel: 10
  }),
  p('p_daozu', '道祖丹', 'divine', 20, '万道之祖留下的方子,一炉殊难成一枚', {
    instant: { wudao: 150 },
    recipe: { herb: 520, stoneBase: 1700 },
    alchemyLevel: 10
  }),
  /** 寿元线自万寿金丹向上;掉落线顶端在可炼线之下(法则 H) */
  p('p_yongchang', '永昌丹', 'immortal', 13, '服之添寿三千载', {
    instant: { lifespanYears: 3000 },
    recipe: { herb: 320, stoneBase: 820 },
    alchemyLevel: 10
  }),
  p('p_wugou', '无垢金丹', 'divine', 17, '金丹无垢,增寿万载', {
    instant: { lifespanYears: 10000 },
    recipe: { herb: 440, stoneBase: 1300 },
    alchemyLevel: 10
  }),
  /** 悟道线自悟道丹向上 */
  p('p_daoyindan', '道音丹', 'immortal', 12, '耳畔道音不绝,悟道点 +60', {
    instant: { wudao: 60 },
    recipe: { herb: 300, stoneBase: 760 },
    alchemyLevel: 10
  }),
  /** 灵气线:一口回满,照法则 F 须可炼 */
  p(
    'p_xiantianquan',
    '仙泉玉液',
    'immortal',
    11,
    '仙泉一盏,灵气涤尽,余者溢入经脉',
    { instant: { qiPct: 1.6 }, recipe: { herb: 90, stoneBase: 260 }, alchemyLevel: 10 },
    'droplets'
  ),
  /** 增益线:每 buff 仅一味丹产出(法则 C);增益定义见 data/buffs.ts */
  p('p_xianlidan', '仙力丹', 'immortal', 10, '服之仙力贯体,出手重若崩山', {
    kind: 'buff',
    buffId: 'buff_xianli',
    recipe: { herb: 240, stoneBase: 620 },
    alchemyLevel: 10
  }),
  p('p_shenweidan', '神威丹', 'divine', 15, '神威临世,诸邪辟易', {
    kind: 'buff',
    buffId: 'buff_shenwei',
    recipe: { herb: 360, stoneBase: 1000 },
    alchemyLevel: 10
  }),
  p('p_benyuandan', '本源丹', 'divine', 18, '混沌本源入体,修行转疾', {
    kind: 'buff',
    buffId: 'buff_hundun',
    recipe: { herb: 260, stoneBase: 560 },
    alchemyLevel: 10
  }),

  // ============ 神/道品丹方 ============
  p('p_taiyi', '太乙丹', 'immortal', 12, '太乙近道,服之如闭关十三刻有余(200 分钟)', {
    instant: { expSecs: 12000 },
    recipe: { herb: 285, stoneBase: 800 },
    alchemyLevel: 8
  }),
  // ---- 仙品修速丹 ----
  // 增益 2/3×1800=1200 秒,介于聚灵丹 900 与神元丹 1260 之间(法则 B);
  // 定 1200 而非中位 1080:造化丹(720)对本品须不过六成(法则 A)。
  p('p_xianyun', '仙韵丹', 'immortal', 11, '仙韵绕体,服之修炼加速三分之二(一个时辰)', {
    kind: 'buff',
    buffId: 'buff_xianyun',
    recipe: { herb: 200, stoneBase: 600 },
    alchemyLevel: 10
  }),
  p('p_shenlian', '神炼金丹', 'divine', 16, '神火炼就的金丹,服之如闭关十八刻(270 分钟)', {
    instant: { expSecs: 16200 },
    recipe: { herb: 380, stoneBase: 1160 },
    alchemyLevel: 9
  }),
  p('p_yiyuan', '一元始丹', 'dao', 20, '一元复始,服之如闭关三个半时辰(7 小时)', {
    instant: { expSecs: 25200 },
    recipe: { herb: 560, stoneBase: 1900 },
    alchemyLevel: 9
  }),
  p('p_shenshi', '神识丹', 'divine', 14, '神识洞明,悟道点 +85', {
    instant: { wudao: 85 },
    recipe: { herb: 350, stoneBase: 980 },
    alchemyLevel: 8
  }),
  p('p_tiandao', '天道金丹', 'dao', 20, '拈之如亲聆天道,悟道点 +200', {
    instant: { wudao: 200 },
    recipe: { herb: 520, stoneBase: 1800 },
    alchemyLevel: 9
  }),
  p('p_shoulu', '寿禄丹', 'immortal', 10, '福寿绵长,增寿一千五百载', {
    instant: { lifespanYears: 1500 },
    recipe: { herb: 300, stoneBase: 780 },
    alchemyLevel: 8
  }),
  p('p_shenshou', '神寿金丹', 'divine', 15, '神寿不凋,增寿四千载', {
    instant: { lifespanYears: 4000 },
    recipe: { herb: 420, stoneBase: 1200 },
    alchemyLevel: 9
  }),
  p('p_wuliang', '无量寿丹', 'dao', 19, '增寿三万载', {
    instant: { lifespanYears: 30000 },
    recipe: { herb: 460, stoneBase: 1500 },
    alchemyLevel: 9
  }),
  /** 灵气线道品封顶;照法则 F 须可炼 */
  p(
    'p_daoye',
    '道液',
    'dao',
    18,
    '一滴道液,浩气盈溢,几近周天自转;混沌海深处方凝得成',
    { instant: { qiPct: 2.4 }, recipe: { herb: 120, stoneBase: 420 }, alchemyLevel: 9 },
    'droplets'
  ),
  p('p_shenyuan', '神元丹', 'divine', 16, '神元入体,周天运转更疾', {
    kind: 'buff',
    buffId: 'buff_shenyuan',
    recipe: { herb: 300, stoneBase: 900 },
    alchemyLevel: 9
  }),
  p('p_huntian', '混天丹', 'dao', 20, '一气混元,吐纳之间日月无光', {
    kind: 'buff',
    buffId: 'buff_huntian',
    recipe: { herb: 340, stoneBase: 1500 },
    alchemyLevel: 9
  }),
  p('p_daluo', '大罗金丹', 'immortal', 13, '大罗金身不坏,仙力贯体', {
    kind: 'buff',
    buffId: 'buff_daluo',
    recipe: { herb: 260, stoneBase: 820 },
    alchemyLevel: 8
  }),
  p('p_zhenshan', '镇神丹', 'divine', 17, '神威镇世,诸天辟易', {
    kind: 'buff',
    buffId: 'buff_zhenshan',
    recipe: { herb: 360, stoneBase: 1100 },
    alchemyLevel: 9
  }),
  p('p_daotai', '道胎丹', 'dao', 19, '道胎不灭,万劫不改', {
    kind: 'buff',
    buffId: 'buff_daotai',
    recipe: { herb: 420, stoneBase: 1350 },
    alchemyLevel: 9
  }),

  // ============ 高界掉落(仅掉落,无方;照法则 A 压在可炼同规格的六成之下)============
  p('p_xianyao', '仙药丹', 'immortal', 9, '仙山深处的野药结丹,服之如闭关六刻(90 分钟)', { instant: { expSecs: 5400 } }),
  p('p_quanlu', '泉露', 'spirit', 6, '灵泉石壁凝出的露水,饮之灵气回涌', { instant: { qiPct: 0.3 } }, 'droplets'),
  p('p_xianquanlu', '仙泉露', 'immortal', 10, '仙泉一滴,灵气回涌', { instant: { qiPct: 0.5 } }, 'droplets'),
  p('p_yudao', '玉道丹', 'immortal', 11, '玉质道纹凝成的丹,拈之如聆道音', { instant: { wudao: 32 } }),
  p('p_xianshou', '仙寿丹', 'heaven', 12, '仙家野生灵果炼成,增寿八百载', { instant: { lifespanYears: 800 } }, 'leaf'),
  // ---- 神界 / 混沌海掉落线 ----
  p('p_shenyin', '神引丹', 'divine', 14, '神域游离的仙气凝丹,服之如闭关九刻(135 分钟)', { instant: { expSecs: 8100 } }),
  p('p_hundunjing', '混沌精', 'dao', 18, '混沌初分时漏出的一缕精气,服之如闭关十三刻有余(200 分钟)', { instant: { expSecs: 12000 } }, 'sparkles'),
  p('p_shenfeng', '神风余韵', 'divine', 15, '神风过处道痕犹存,悟道点 +55', { instant: { wudao: 55 } }, 'wind'),
  p('p_hundunhuo', '混沌火种', 'dao', 19, '开天火种,一点道火不灭,悟道点 +85', { instant: { wudao: 85 } }, 'flame'),
  p('p_shenpan', '神蟠桃', 'divine', 15, '神界蟠桃,增寿两千五百载', { instant: { lifespanYears: 2500 } }, 'leaf'),
  p('p_hundunshou', '混沌寿果', 'dao', 19, '混沌古果,增寿九千载', { instant: { lifespanYears: 9000 } }, 'leaf'),
  p('p_shenlu', '神露', 'divine', 15, '神泉一滴,灵气回涌', { instant: { qiPct: 0.55 } }, 'droplets')
]

const BY_ID = new Map(PILLS.map(x => [x.id, x]))

export function pillDef(id: string): PillDef | undefined {
  return BY_ID.get(id)
}

// ============ 丹药品阶解析 ============
// 道品(dao)为丹药专属顶档(见 src/types 的 PillQuality),不入共享品质表 QUALITIES(只到神品 rank 8)。
// 读丹药品阶的 rank / 名 / 色须走下面三个函数;qualityDef(pill.quality) 会把道品兜底成凡品。

/** 道品在品质序里的位置:神品之上半档 */
export const DAO_QUALITY_RANK = 9
export const DAO_QUALITY_NAME = '道品'
/** 须与天品暗金、神品朱砂区分 */
export const DAO_QUALITY_COLOR = '#E9B949'

export function pillRank(def: Pick<PillDef, 'quality'>): number {
  return def.quality === 'dao' ? DAO_QUALITY_RANK : qualityDef(def.quality).rank
}

export function pillQualityName(def: Pick<PillDef, 'quality'>): string {
  return def.quality === 'dao' ? DAO_QUALITY_NAME : qualityDef(def.quality).name
}

export function pillQualityColor(def: Pick<PillDef, 'quality'>): string {
  return def.quality === 'dao' ? DAO_QUALITY_COLOR : qualityDef(def.quality).color
}

/**
 * 丹名**当文字用**的颜色。
 *
 * 与 `pillQualityColor` 分开:那个是「这味丹属于哪一档」的识别色,
 * 光环/图标都用它,判据也拿它比对。而文字要求 4.5:1,道品原色
 * `#E9B949` 在日主题只有 1.59,天/仙/玄三档也各有短板。
 */
export function pillQualityTextColor(def: Pick<PillDef, 'quality'>): string {
  return def.quality === 'dao' ? 'var(--color-quality-dao-text)' : qualityTextColor(def.quality)
}
