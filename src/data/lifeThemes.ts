/**
 * 这一世的命题(Phase 32.5)—— 让第 N 世不是第 1 世的复播
 *
 * 每次转世择一条命题。命题不是 buff,是一句自己对自己立下的话:
 * 这一世我要做什么。它给的也不是属性,而是宿慧与一条随神魂不灭的所得。
 *
 * ## 三件事凑成一条命题
 *
 * - **立题**(vow):这一世打算做什么,一句话说清。
 * - **禁忌**(taboo):有些题得守规矩。犯了即破题 —— 不扣任何东西,只是这一世
 *   的话没说到底。放置游戏里点错一次就废掉一周目是不能接受的,所以破题
 *   永远只是"落空",不是"惩罚"。
 * - **判据**(metric):达成与否由代码算得出来,不靠自觉。全部以「本世」计,
 *   跨世累计的计数器在开世时取快照,判定时取差值(见 core/samsaraService.ts)。
 *
 * ## 命题按阶开放
 *
 * 初入轮回的人不会想着"建立完整的炼丹知识体系"——他连药材都叫不出名字。
 * minStage 保证命题的分量与玩家此刻的处境相称。
 */
import type { SkillId } from './crafting'

/** 犯之即破题的忌讳 */
export type LifeTaboo = 'pill' | 'artifact'

export const TABOO_NAMES: Record<LifeTaboo, string> = {
  pill: '服食丹药',
  artifact: '祭用法宝'
}

/** 达成判据 —— 每一种都要能从存档里算出来 */
export type LifeThemeMetric =
  /** 本世境界达到某大境界 */
  | { kind: 'realm'; major: number }
  /** 本世某计数器增量达标 */
  | { kind: 'counter'; key: import('@/types').CounterKey; n: number }
  /** 认得(层 ≥ stage)的灵材数达标 —— 认知跨世不灭,故此项按总量计 */
  | { kind: 'materialLore'; stage: number; n: number }
  /** 通晓的丹方数达标 */
  | { kind: 'recipeMastered'; n: number }
  /** 某项技艺熟练度达标 */
  | { kind: 'skill'; id: SkillId; level: number }
  /** 洞悉(认知层 = 3)的敌人种数达标 */
  | { kind: 'enemyLore'; n: number }
  /** 本世择定的悟道分支数达标 */
  | { kind: 'branch'; n: number }
  /** 本世雪耻的宿敌数达标 */
  | { kind: 'avenge'; n: number }
  /** 数条判据须尽数达成 —— 进度取各条中最落后的一条 */
  | { kind: 'all'; of: LifeThemeMetric[] }

export interface LifeThemeDef {
  id: string
  name: string
  /** 立题:这一世打算做什么 */
  vow: string
  /** 判据的可读表述 */
  goal: string
  metric: LifeThemeMetric
  /** 犯之即破题 */
  taboo?: LifeTaboo
  /** 达成后随神魂不灭的所得(叙事,实际收益是宿慧) */
  legacy: string
  /** 达成所得宿慧 */
  insight: number
  /** 需至少此阶方会出现 */
  minStage: number
}

function t(
  id: string,
  name: string,
  minStage: number,
  insight: number,
  vow: string,
  goal: string,
  metric: LifeThemeMetric,
  legacy: string,
  taboo?: LifeTaboo
): LifeThemeDef {
  return { id, name, vow, goal, metric, taboo, legacy, insight, minStage }
}

export const LIFE_THEMES: LifeThemeDef[] = [
  // ---- 初入轮回也接得住的题:先把一条路走到看得见的地方 ----
  t(
    'lt_jindan',
    '结丹',
    0,
    22,
    '这一世,先把丹结了再说别的。',
    '本世修至金丹',
    { kind: 'realm', major: 2 },
    '你记得结丹那一刻气机是怎么盘拢的——往后每一世都少走一段弯路。'
  ),
  t(
    'lt_lishi',
    '踏遍山川',
    0,
    24,
    '这一世不急着冲境界,先把这方天地走一遍。',
    '本世历练 60 场',
    { kind: 'counter', key: 'explores', n: 60 },
    '山川的形貌刻进了神魂,哪条谷通往哪片林,你再不会迷路。'
  ),
  t(
    'lt_shicai',
    '识百草',
    0,
    26,
    '这一世要弄清楚,采回来的到底是些什么。',
    '认得 10 味灵材',
    { kind: 'materialLore', stage: 1, n: 10 },
    '草木的名字从此跟着你走,下一世睁眼便叫得出来。'
  ),

  // ---- 熟知凡间:开始给自己立规矩 ----
  t(
    'lt_bugu',
    '不假外物',
    1,
    40,
    '这一世不靠丹药,看看单凭自身能走到哪一步。',
    '整世未服一粒丹药,且修至元婴',
    { kind: 'realm', major: 3 },
    '你摸清了自身气机的底：哪些坎是真的过不去,哪些只是被丹药糊弄过去了。',
    'pill'
  ),
  t(
    'lt_danfang',
    '丹道立言',
    1,
    38,
    '这一世要把丹方一张张吃透,不再照方抓药。',
    '通晓 6 张丹方',
    { kind: 'recipeMastered', n: 6 },
    '方子背进了骨子里,炉前不必再翻书。'
  ),
  t(
    'lt_wenhuo',
    '问火',
    1,
    36,
    '这一世要弄明白火。药是死的,火是活的。',
    '控火练至精通',
    { kind: 'skill', id: 'flame', level: 72 },
    '你对火候的手感成了本能,换了炉、换了焰,也压得住。'
  ),

  // ---- 熟知修仙界:开始和世界较劲 ----
  t(
    'lt_xuechi',
    '雪耻',
    2,
    44,
    '这一世要回去,把上一世没打赢的那一场打赢。',
    '本世雪耻一名宿敌',
    { kind: 'avenge', n: 1 },
    '那道横在心里的坎平了。宿敌的招式你记了几世,如今它对你再无秘密。'
  ),
  t(
    'lt_yuedi',
    '阅敌',
    2,
    42,
    '这一世不为杀,为看清楚它们到底怎么打。',
    '洞悉 8 种敌手',
    { kind: 'enemyLore', n: 8 },
    '妖物的行止在你眼里成了可读之物:何时发狂、何时护身,一望即知。'
  ),
  t(
    'lt_lianqi',
    '铸器',
    2,
    40,
    '这一世要亲手打一件称手的东西出来。',
    '锻打练至娴熟',
    { kind: 'skill', id: 'smithing', level: 58 },
    '锤下去的力道有了准头,材质的性子隔着火你也摸得出来。'
  ),
  t(
    'lt_zejian',
    '独行',
    2,
    46,
    '这一世不借法宝之力,只以己身与所修之法应世。',
    '整世未祭一件法宝,且斩敌 400',
    { kind: 'counter', key: 'kills', n: 400 },
    '不依外物的打法逼出了真本事,收招放招都比从前干净。',
    'artifact'
  ),

  // ---- 熟知天界:开始验证道路本身 ----
  t(
    'lt_zedao',
    '证道',
    3,
    52,
    '这一世要把几条路都走到尽头,亲自比一比。',
    '本世择定 3 条悟道之路',
    { kind: 'branch', n: 3 },
    '几条道的分野你亲手验过,再择时不必犹疑。'
  ),
  t(
    'lt_tongyao',
    '通药',
    3,
    56,
    '这一世要把每一味药的用法都试到底,不只是认得。',
    '通晓 8 味灵材的用法',
    { kind: 'materialLore', stage: 3, n: 8 },
    '药性在你手里成了可拆可配的东西,而不是方子上一行照抄的字。'
  ),
  t(
    'lt_dujie',
    '渡劫',
    3,
    54,
    '这一世要迎着天劫上去,渡够为止。',
    '本世渡劫 4 次',
    { kind: 'counter', key: 'tribulations', n: 4 },
    '劫云压顶时的那份镇定留了下来——你见过它,它吓不住你。'
  ),

  // ---- 百世老修:题目本身就是问题 ----
  t(
    'lt_dacheng',
    '登顶',
    4,
    70,
    '这一世不做别的,只看看这条路的尽头究竟在哪。',
    '本世修至大乘',
    { kind: 'realm', major: 7 },
    '尽头的风景你亲眼看过一回,此后再攀不为求证,只为走得更从容。'
  ),
  t(
    'lt_zhushu',
    '著书',
    4,
    75,
    '这一世要把毕生所知写下来,替后来的自己省几百年。',
    '通晓 12 张丹方且认得 14 味灵材',
    {
      kind: 'all',
      of: [
        { kind: 'recipeMastered', n: 12 },
        { kind: 'materialLore', stage: 1, n: 14 }
      ]
    },
    '一部只写给自己的书。往后每一世翻开,都是现成的答案。'
  )
]

const BY_ID = new Map(LIFE_THEMES.map(x => [x.id, x]))

export function lifeThemeDef(id: string): LifeThemeDef | undefined {
  return BY_ID.get(id)
}

/** 该阶可接的命题 */
export function themesForStage(stageIndex: number): LifeThemeDef[] {
  return LIFE_THEMES.filter(x => x.minStage <= stageIndex)
}
