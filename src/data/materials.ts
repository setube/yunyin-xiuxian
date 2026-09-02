/**
 * 灵材谱(Phase 32.3)—— 具体灵材及其双向属性
 *
 * 同一块材料,炼丹看的是药性(药力/温性/毒性),炼器看的是器性(硬度/灵性/导灵)。
 * 认知分四层:未知 → 已辨识 → 已知性 → 已通用。层数决定玩家在生产时能用上它多少。
 *
 * 注意:Phase 32.3 库存仍是 herb/ore 两个标量(见 stores/resources.ts),
 * 灵材在此只有"身份与认知",尚无独立存量。实体化留给 Phase 32.4。
 */
import type { ElementId } from '@/types'

export type MaterialBucket = 'herb' | 'ore'

/** 认知层上限:0 未知 / 1 已辨识 / 2 已知性 / 3 已通用 */
export const LORE_MAX = 3

export const LORE_STAGE_NAMES = ['未识', '已辨识', '已知性', '已通用'] as const

export interface MaterialDef {
  id: string
  name: string
  /** 归属的库存大类,决定它消耗哪种资源 */
  bucket: MaterialBucket
  /** 阶位 1~9,决定它在什么层级现世、入什么阶的方子 */
  rank: number
  element: ElementId
  /** 药性 —— 炼丹视角。thermal 负数为寒性 */
  medicinal: { potency: number; thermal: number; toxin: number }
  /** 器性 —— 炼器视角 */
  forging: { hardness: number; spirit: number; conduct: number }
  /** 三层认知文本:辨识时 / 知性时 / 通用时各解锁一句 */
  lore: readonly [string, string, string]
}

function m(
  id: string,
  name: string,
  bucket: MaterialBucket,
  rank: number,
  element: ElementId,
  medicinal: [number, number, number],
  forging: [number, number, number],
  lore: readonly [string, string, string]
): MaterialDef {
  return {
    id,
    name,
    bucket,
    rank,
    element,
    medicinal: { potency: medicinal[0], thermal: medicinal[1], toxin: medicinal[2] },
    forging: { hardness: forging[0], spirit: forging[1], conduct: forging[2] },
    lore
  }
}

export const MATERIALS: MaterialDef[] = [
  // ---- 灵草一系 ----
  m('mat_qingzhi', '青芝草', 'herb', 1, 'wood', [12, 2, 0], [2, 8, 6], [
    '田埂上随处可见的青色小芝,修士入门第一味药。',
    '药力平和,微温无毒,几乎与任何主药相合。',
    '万金油般的辅药:低阶方子里它负责把药性兜住,不出彩也不坏事。'
  ]),
  m('mat_chiyan', '赤炎灵芝', 'herb', 2, 'fire', [26, 34, 4], [6, 14, 10], [
    '菌盖赤如烙铁,靠近时掌心发烫。',
    '大热之性,药力刚猛而带微毒——寒方忌用,热方为君。',
    '与火属灵焰同炼可激出全部药力;若以寒焰强压,药性会在炉中对冲成废渣。'
  ]),
  m('mat_xuanyin', '玄阴藤', 'herb', 3, 'water', [34, -30, 8], [10, 20, 22], [
    '藤身乌青,昼伏夜长,断口渗出冰凉汁液。',
    '至阴之性,能压伏躁烈药力,自身却带三分阴毒。',
    '压制赤炎一类烈药的首选;配伍失当则整炉转寒,药力尽失。'
  ]),
  m('mat_zihenlan', '紫纹兰', 'herb', 4, 'wood', [45, 6, 2], [8, 34, 26], [
    '叶脉紫纹如篆,风过有清香。',
    '药力醇厚绵长,近乎无毒,是提纯药力的良材。',
    '淬药一步全靠它承接火候;紫纹兰足,丹药药力上限便高一截。'
  ]),
  m('mat_jiuye', '九叶还魂草', 'herb', 5, 'light', [62, 10, 0], [12, 46, 30], [
    '九叶轮生,少一叶便不是它。',
    '生生不息之性,能续断脉、养元神,毫无毒性。',
    '凝丹一步的定海神针:有它在炉,炸炉多半也能保住半炉残丹。'
  ]),
  m('mat_youming', '幽冥花', 'herb', 6, 'dark', [78, -18, 46], [14, 58, 38], [
    '开在阴地无根之处,花色近墨,采时要屏息。',
    '剧毒,却也是唯一能撬动神魂类药性的引子。',
    '养丹一步若压不住它的毒,成丹便是毒丹;压住了,就是神魂丹药的丹心。'
  ]),
  m('mat_leixin', '雷心竹', 'herb', 7, 'thunder', [96, 22, 14], [40, 66, 74], [
    '竹节中空,劈开时有细小电弧窜出。',
    '药力霸道,以雷淬体最宜,寻常炉鼎盛不住它的躁动。',
    '雷心竹入方,炉温必须全程压在窄区间内——控火不足者不必强试。'
  ]),
  m('mat_taixushen', '太虚灵参', 'herb', 8, 'chaos', [128, 0, 6], [18, 92, 58], [
    '参形似人,须发俱全,离土三息便虚化半分。',
    '药性混沌未分,随主药而转,可为君可为佐。',
    '八阶以上方子的通用丹基;它能把不相容的药性强行调和到一炉。'
  ]),

  // ---- 矿石一系 ----
  m('mat_jingtie', '精铁', 'ore', 1, 'metal', [2, 4, 0], [22, 4, 8], [
    '凡铁中挑出的一点精粹,凡俗铁匠也认得。',
    '质地匀实,受火即软,是练手用的入门器材。',
    '低阶法器的胎骨:不出彩,但胜在铭纹刻得住。'
  ]),
  m('mat_xuantie', '玄铁', 'ore', 2, 'metal', [3, -4, 0], [38, 10, 12], [
    '色黑而沉,同体积重出精铁数倍。',
    '性微寒,耐高温,锻打时需比精铁多三成火候。',
    '玄铁是分水岭:锻打技艺不到,再多玄铁也只能出钝器。'
  ]),
  m('mat_hansui', '寒髓晶', 'ore', 3, 'ice', [16, -42, 2], [30, 28, 40], [
    '深谷冰隙里析出的晶簇,握久了手指发麻。',
    '极寒,能给炽热器胚淬火定形,也能入寒性丹方压制药性。',
    '双用之材:淬火时它是器材,压药时它是药材——用途取决于你怎么看它。'
  ]),
  m('mat_chitong', '赤铜砂', 'ore', 4, 'fire', [20, 38, 6], [44, 24, 62], [
    '砂粒赤红,倒在铁板上会自己聚成一团。',
    '导灵极佳,带火性,是引灵入器的关键。',
    '铭纹若要通灵,赤铜砂必须掺进胎骨,否则纹是死纹。'
  ]),
  m('mat_xingwen', '星纹钢', 'ore', 5, 'metal', [8, 0, 0], [70, 42, 48], [
    '断面有细密银纹,如夜空星河。',
    '硬度与灵性兼备,是少有的不需妥协的器材。',
    '星纹钢的纹路本身就是天成铭纹,顺纹刻铭事半功倍,逆纹则前功尽弃。'
  ]),
  m('mat_xirang', '息壤', 'ore', 6, 'earth', [30, 8, 0], [58, 74, 34], [
    '一捧看似寻常的黄土,放着放着会自己多出来一些。',
    '生生不息,能自行修补器身细微裂痕。',
    '掺入息壤的法器会自愈,但也因此难以改形——定型前想清楚。'
  ]),
  m('mat_leiwen', '雷纹陨铁', 'ore', 7, 'thunder', [24, 26, 10], [88, 68, 96], [
    '天外落下的铁块,表面雷纹是坠落时烧出来的。',
    '导灵冠绝群材,亦最难驯——锻打时它会反噬锤头。',
    '雷纹陨铁只认高温快锻:炉火一弱,雷性便顺着锤子窜回你的经脉。'
  ]),
  m('mat_taiyi', '太乙玄金', 'ore', 9, 'chaos', [40, 0, 0], [128, 110, 88], [
    '金非金,玉非玉,映不出人影。',
    '万法不侵,唯有仙焰能使其软化。',
    '仙器胎骨。凡火凡炉见了它只会白费材料——这不是技艺问题,是资格问题。'
  ])
]

const BY_ID = new Map(MATERIALS.map(x => [x.id, x]))

export function materialDef(id: string): MaterialDef | undefined {
  return BY_ID.get(id)
}

/** 某阶位附近现世的灵材(用于采集时抽取"遇见了什么") */
export function materialsNearRank(rank: number, bucket?: MaterialBucket): MaterialDef[] {
  const pool = MATERIALS.filter(x => (bucket === undefined || x.bucket === bucket) && x.rank <= rank + 1)
  // 层级越高越少见低阶材料,但永远不彻底消失
  return pool.length > 0 ? pool : MATERIALS.filter(x => x.rank === 1)
}
