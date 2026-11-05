/**
 * 灵材谱与悟道录的呈现:守渐进披露本身,每一层多说哪一句、少说哪一句。
 * 故障注入:把三句话一次性端出来,第一组用例红。
 * 只测纯函数(describeXxx / branchStage),不挂 Pinia:materialCodex 与 branchCodex 只是读 store 再转调的薄封装。
 */
import { describe, it, expect } from 'vitest'
import { LORE_MAX, LORE_STAGE_NAMES, MATERIALS, materialDef } from '@/data/materials'
import { GONGFA_BRANCHES, gongfaBranchDef } from '@/data/gongfaBranches'
import { gongfaDef, gongfaMaxLevel } from '@/data/gongfa'
import {
  ARTIFACT_STAGE_MAX,
  ARTIFACT_STAGE_NAMES,
  BRANCH_STAGE_MAX,
  BRANCH_STAGE_NAMES,
  EQUIP_STAGE_MAX,
  EQUIP_STAGE_NAMES,
  PILL_NO_RECIPE_HINT,
  PILL_STAGE_MAX,
  PILL_STAGE_NAMES,
  artifactStage,
  branchStage,
  describeArtifact,
  describeBranch,
  describeEquipment,
  describeMaterial,
  describePill,
  type EquipSeen,
  equipStage,
  pillStage,
  codexOwnedCount
} from './codex'
import {
  ARTIFACT_LEVEL_BONUS,
  ARTIFACT_MAX_LEVEL,
  ARTIFACTS,
  artifactDef,
  artifactQualityMult,
  artifactValue
} from '@/data/artifacts'
import { EQUIPMENT_TEMPLATES, equipmentTemplate } from '@/data/equipment'
import { PILLS } from '@/data/pills'
import { QUALITIES, qualityDef, qualityTextColor } from '@/data/qualities'
import { ICONS } from '@/ui/icons'
import type { QualityId } from '@/types'
import { cnNumber, formatPercent } from '@/utils/format'

const qingzhi = materialDef('mat_qingzhi')!
const chiyan = materialDef('mat_chiyan')!
const youming = materialDef('mat_youming')!

describe('灵材谱:按认知层渐进披露', () => {
  it('未识时不给任何正文,只给一句"还差什么"', () => {
    const e = describeMaterial(qingzhi, 0, 0)
    expect(e.desc).toBe('')
    expect(e.badge, '未识不该有满层标记').toBe('')
    expect(e.hint).toBeTruthy()
    expect(e.stageName).toBe(LORE_STAGE_NAMES[0])
  })

  it('每高一层多揭一句,不多不少', () => {
    for (let lv = 0; lv <= LORE_MAX; lv += 1) {
      const lines = describeMaterial(qingzhi, lv, 0).desc.split('\n').filter(Boolean)
      // 前 lv 句 lore,「已知性」起另附两行数值
      expect(lines.length, `第 ${lv} 层揭示的行数不对`).toBe(lv + (lv >= 2 ? 2 : 0))
      for (let i = 0; i < lv; i += 1) expect(lines[i]).toBe(qingzhi.lore[i])
    }
  })

  it('药性与器性数值到「已知性」才摊开 —— 那正是这一层的字面意思', () => {
    expect(describeMaterial(chiyan, 1, 9).desc).not.toContain('药性')
    const known = describeMaterial(chiyan, 2, 9).desc
    expect(known).toContain(`药力 ${chiyan.medicinal.potency}`)
    expect(known).toContain(`硬度 ${chiyan.forging.hardness}`)
  })

  it('性味评语与数值同向', () => {
    // 赤炎灵芝 thermal 34 / 玄阴藤 thermal -30
    expect(describeMaterial(chiyan, LORE_MAX, 0).desc).toContain('大热')
    expect(describeMaterial(materialDef('mat_xuanyin')!, LORE_MAX, 0).desc).toContain('至寒')
    expect(describeMaterial(youming, LORE_MAX, 0).desc, '幽冥花毒性 46,不该轻描淡写').toContain('剧毒')
    expect(describeMaterial(qingzhi, LORE_MAX, 0).desc).toContain('无毒')
  })

  it('到顶才有「通」字,也才不再提示还差什么', () => {
    const top = describeMaterial(qingzhi, LORE_MAX, 12)
    expect(top.badge).toBe('通')
    expect(top.hint, '已到顶还催人上进就是噪音').toBe('')
    expect(top.stageName).toBe(LORE_STAGE_NAMES[LORE_MAX])
  })

  it('越界的层数被钳回合法区间,不至于把界面撑穿', () => {
    expect(describeMaterial(qingzhi, 99, 0).stage).toBe(LORE_MAX)
    expect(describeMaterial(qingzhi, -5, 0).stage).toBe(0)
    expect(describeMaterial(qingzhi, 2.9, 0).stage).toBe(2)
  })

  it('脚注记的是照面回数 —— 认知推进的底料', () => {
    expect(describeMaterial(qingzhi, 1, 0).foot.value).toBe('未曾照面')
    expect(describeMaterial(qingzhi, 1, 7).foot.value).toBe('7 回')
  })

  it('十六味灵材各有三句可揭之言,没有半途而废的条目', () => {
    for (const def of MATERIALS) {
      expect(def.lore.length, `${def.name} 的认知文本不足三句`).toBe(3)
      expect(describeMaterial(def, LORE_MAX, 1).desc.split('\n').length).toBe(5)
    }
  })
})

describe('悟道录:未见 / 已见 / 已择', () => {
  const branch = GONGFA_BRANCHES[0]!
  const sibling = GONGFA_BRANCHES.find(x => x.gongfaId === branch.gongfaId && x.id !== branch.id)!
  const fullLevel = gongfaMaxLevel(gongfaDef(branch.gongfaId)!)

  it('功法未满级则歧路未现', () => {
    expect(branchStage(branch, { [branch.gongfaId]: fullLevel - 1 }, {})).toBe(0)
    expect(branchStage(branch, {}, {})).toBe(0)
  })

  it('功法满级,诸路皆现', () => {
    expect(branchStage(branch, { [branch.gongfaId]: fullLevel }, {})).toBe(1)
  })

  it('择了一条,另一条仍留在录上 —— 没走的那条路也是路', () => {
    const learned = { [branch.gongfaId]: fullLevel }
    const picked = { [branch.gongfaId]: branch.id }
    expect(branchStage(branch, learned, picked)).toBe(BRANCH_STAGE_MAX)
    expect(branchStage(sibling, learned, picked), '未择的分支不该退回未见').toBe(1)
  })

  it('未见时不泄露分支给什么', () => {
    const e = describeBranch(branch, 0)
    expect(e.desc).toBe('')
    expect(e.badge).toBe('')
    expect(e.stageName).toBe(BRANCH_STAGE_NAMES[0])
    expect(e.hint).toBeTruthy()
  })

  it('已见即摊开立意与词条 —— 择前就得看得见', () => {
    const e = describeBranch(branch, 1)
    expect(e.desc).toContain(branch.desc)
    expect(e.desc, '词条须是人话,不是键名').toContain('攻击')
    expect(e.hint, '「一经择定不可更改」这句必须在按下之前出现').toContain('不可更改')
  })

  it('已择的那条标「择」、着金色,且不再提示', () => {
    const e = describeBranch(branch, BRANCH_STAGE_MAX)
    expect(e.badge).toBe('择')
    expect(e.color).toContain('gold')
    expect(e.hint).toBe('')
  })

  it('分支重名时,靠所属功法辨认', () => {
    const dupes = new Map<string, number>()
    for (const b of GONGFA_BRANCHES) dupes.set(b.name, (dupes.get(b.name) ?? 0) + 1)
    const repeated = [...dupes].filter(([, n]) => n > 1)
    expect(repeated.length, '本表确有重名分支,脚注给功法名才有意义').toBeGreaterThan(0)
    expect(describeBranch(branch, 1).foot.value).toBe(gongfaDef(branch.gongfaId)!.name)
  })

  it('七十七条分支都挂得上一部实有的功法', () => {
    for (const b of GONGFA_BRANCHES) {
      expect(gongfaDef(b.gongfaId), `${b.name} 指向不存在的功法 ${b.gongfaId}`).toBeDefined()
      expect(describeBranch(b, 1).meta, `${b.name} 在悟道录里没有出处`).not.toBe('')
      expect(gongfaBranchDef(b.id), `${b.name} 的 id 查不回自身`).toBeDefined()
    }
  })
})

/**
 * 用具三类的收录深度:不回写「第几层」,按已有状态分层揭示。
 * 装备看见过的最好成色(lore.equipLore),法宝看祭炼重数(背包),丹方看掌握度(lore.recipeLore)。
 */
describe('图鉴 · 用具三类的收录深度', () => {
  it('装备:没见过就没收录;见过一件即入门;上手一档由玩家推进;天品看运气', () => {
    const t = equipmentTemplate('w_xuantie')!
    expect(equipStage(undefined, false)).toBe(0)
    // 旧档:收录过但无成色记录,仍算入目
    expect(equipStage(undefined, true)).toBe(1)
    const seen = (quality: QualityId, tier: number): EquipSeen => ({ q: qualityDef(quality).rank, t: tier })
    expect(equipStage(seen('mortal', 30), true)).toBe(1)
    // 第二档不看成色,看是否用过(强化或装备过即算)
    expect(equipStage({ ...seen('mortal', 30), u: 1 }, true)).toBe(2)
    expect(equipStage({ ...seen('excellent', 12), u: 1 }, true)).toBe(2)
    expect(equipStage(seen('heaven', 12), true)).toBe(3)
    expect(describeEquipment(t, seen('heaven', 18), true).desc).toContain('见过最好成色:天品 · 最高 18 阶')
    expect(describeEquipment(t, undefined, true).badge).toBe('')
    expect(describeEquipment(t, seen('heaven', 18), true).stageName).toBe(EQUIP_STAGE_NAMES[EQUIP_STAGE_MAX])
  })

  it('装备:到顶才给「极」字,未到顶都给得出还差什么', () => {
    const t = equipmentTemplate('w_zhuqing')!
    const top = describeEquipment(t, { q: qualityDef('divine').rank, t: 32 }, true)
    expect(top.badge).toBe('极')
    expect(top.hint, '到顶了还催人上进就是噪音').toBe('')
    const cases: { stage: number; seen?: EquipSeen; collected: boolean }[] = [
      { stage: 0, collected: false },
      { stage: 1, seen: { q: qualityDef('mortal').rank, t: 3 }, collected: true },
      { stage: 2, seen: { q: qualityDef('excellent').rank, t: 5, u: 1 }, collected: true }
    ]
    for (const { stage, seen, collected } of cases) {
      const e = describeEquipment(t, seen, collected)
      expect(e.stage).toBe(stage)
      expect(e.hint, `第 ${stage} 层没有给出下一步`).not.toBe('')
    }
  })

  it('装备:低阶模板的「用过了」提示按该阶上限说人话,不拿永远够不着的天品吊玩家', () => {
    // 玄铁重剑 2 阶,掉落窗口到不了天品(fromTier 16)
    const low = equipmentTemplate('w_xuantie')!
    expect(low.tier).toBeLessThan(qualityDef('heaven').fromTier!)
    const lowSeen = { q: qualityDef('excellent').rank, t: 2, u: 1 } // 用了,见过精品(该阶上限)
    const lowHint = describeEquipment(low, lowSeen, true).hint
    expect(lowHint, '低阶模板不该承诺天品').not.toContain('天品')
    // 星云长兵 17 阶(≥ 天品 fromTier 16),才导向天品
    const high = equipmentTemplate('w_xingyun')!
    const highHint = describeEquipment(high, { q: qualityDef('fine').rank, t: 17, u: 1 }, true).hint
    expect(highHint, '够得着天品的模板仍指引天品').toContain('天品')
  })

  /**
   * 神品(divine, rank 8)是全表顶,24 阶起的模板提示不许说「神品以上」。
   * 故障注入:把 equipStage2Hint 的顶格分支删掉,本条红。
   */
  it('顶格模板的提示不拿「神品以上」这种不存在的成色吊玩家', () => {
    const topRank = Math.max(...QUALITIES.map(q => q.rank))
    const ceiling = qualityDef('divine')
    expect(ceiling.rank, '神品应是全表最高那一档').toBe(topRank)

    const top = EQUIPMENT_TEMPLATES.filter(t => t.tier >= ceiling.fromTier)
    expect(top.length, '24 阶以上应有装备模板').toBeGreaterThan(0)
    const said = top
      .map(t => describeEquipment(t, { q: 0, t: t.tier, u: 1 }, true).hint)
      .filter(h => h.includes('以上'))
    expect(said, `这些模板的提示在指一个不存在的成色:${[...new Set(said)].slice(0, 3).join(' / ')}`).toEqual([])

    // 阳性对照:星云长兵 17 阶上限是天品,照旧说「以上」
    const mid = equipmentTemplate('w_xingyun')!
    expect(describeEquipment(mid, { q: 0, t: 17, u: 1 }, true).hint).toContain('天品以上')
  })

  it('法宝:祭炼重数决定深度,到九重封顶;功用行给的是本人那一份', () => {
    const fuchen = artifactDef('af_xuanxu')!
    expect(artifactStage(0, false)).toBe(0)
    expect(artifactStage(0, true)).toBe(1)
    expect(artifactStage(3, true)).toBe(2)
    expect(artifactStage(ARTIFACT_MAX_LEVEL, true)).toBe(ARTIFACT_STAGE_MAX)
    const mid = describeArtifact(fuchen, 3, true)
    expect(mid.foot.value).toBe(`3/${ARTIFACT_MAX_LEVEL} 重`)
    /** 吸命基线 230% × 品阶倍率(玄虚拂尘灵品)× 祭炼三重 (1+0.08×3);图鉴给这一份,不是基线 */
    const scaled = 2.3 * artifactQualityMult(fuchen.quality) * (1 + 3 * ARTIFACT_LEVEL_BONUS)
    expect(mid.desc, '图鉴里的数得按玩家自己的品阶与祭炼重数算').toContain(formatPercent(scaled))
    expect(describeArtifact(fuchen, ARTIFACT_MAX_LEVEL, true).badge).toBe('满')
    expect(describeArtifact(fuchen, ARTIFACT_MAX_LEVEL, true).hint).toBe('')
  })

  /**
   * 零重就在顶的法宝(神鞭、无相念珠、全部护盾法宝)祭炼只涨被动,提示不许承诺「神通各强」。
   * 故障注入:把提示语改回固定那一句,本条红。
   */
  it('法宝谱的提示按件给话:零重封顶的只说涨被动,不承诺神通也涨', () => {
    const capped = describeArtifact(artifactDef('af_shenbian')!, 0, true) // 破甲零重就在 50% 的顶
    expect(capped.hint, '零重已封顶的法宝不该承诺「神通各强」').not.toContain('神通各强')
    expect(capped.hint, '要说清楚祭炼在这件上买到的是什么').toContain('只涨被动')

    const normal = describeArtifact(artifactDef('af_xuanxu')!, 0, true) // 吸命的伤害侧还能涨
    expect(normal.hint, '还能涨的那件照旧说清被动与神通都涨').toContain('神通各强')
  })

  /**
   * 封顶判据须看吸命回补侧:神魔镜回补基线 0.6 × 品阶倍率 3.08,零重即满十成;主体零重 8.01,仍在涨。
   * 故障注入:把 `cappedAtZero` 改回只看 `active.capped`,本条红。
   */
  it('封顶判据也看吸命的回补:神魔镜的回补零重就到顶,不许承诺它也会涨', () => {
    const mirror = describeArtifact(artifactDef('af_shenmojing')!, 0, true)
    /** 回补已满、主体仍涨(0/1/9 重:8.01 / 8.65 / 13.78):不许「神通各强」,也不许「只涨被动」 */
    expect(mirror.hint, '神魔镜的回补零重即十成,不该承诺「神通各强」').not.toContain('神通各强')
    expect(mirror.hint, '主体仍在涨,不能说成只涨被动').not.toContain('只涨被动')
    expect(mirror.hint, '要说清哪一侧满了、哪一侧还涨').toContain('回补零重已满')
    expect(mirror.hint).toContain('神通主体')

    // 阳性对照:玄虚拂尘回补零重 86.9%,照旧承诺都涨
    const fuchen = describeArtifact(artifactDef('af_xuanxu')!, 0, true)
    expect(fuchen.hint).toContain('神通各强')
    expect(artifactValue(artifactDef('af_xuanxu')!, 0).active.heal).toBeLessThan(1)

    // 阳性对照:主体零重封顶的神鞭/无相念珠照旧说「只涨被动」
    for (const id of ['af_shenbian', 'af_wuxiangzhu']) {
      expect(describeArtifact(artifactDef(id)!, 0, true).hint, `${id} 主体零重封顶`).toContain('只涨被动')
    }
  })

  /**
   * 深度 2 与深度 1 共用同一句「祭炼买到什么」,按件给话。
   * 故障注入:把深度 2 那句改回不分件的固定文案,本条红。
   */
  it('深度 2 的提示也按件给话,不再拿「炼到九重才算用透」催人', () => {
    const mid = describeArtifact(artifactDef('af_shenmojing')!, 1, true)
    expect(mid.stage, '祭炼过一重即深度 2').toBe(2)
    expect(mid.hint, '神通早就到顶了,不该再拿「用透」催人').not.toContain('才算把它用透')
    // 神魔镜:回补已满、主体仍涨
    expect(mid.hint, '要说清楚往后买的是什么').toContain('被动与神通主体各强')

    // 还能涨的那一件报祭炼收益
    const fuchenMid = describeArtifact(artifactDef('af_xuanxu')!, 1, true)
    expect(fuchenMid.hint, '「才算把它用透」已删').not.toContain('才算把它用透')
    expect(fuchenMid.hint).toContain('神通各强')

    // 阳性对照:主体封顶的那件照旧说「只涨被动」
    const whipMid = describeArtifact(artifactDef('af_shenbian')!, 1, true)
    expect(whipMid.hint).toContain('只涨被动')
  })

  it('提示语里的增幅从 ARTIFACT_LEVEL_BONUS 现算;「炼到九重」那句已删', () => {
    const hint = describeArtifact(artifactDef('af_xuanxu')!, 1, true).hint
    expect(hint, `增幅改了,提示语还在说旧数字:${hint}`).toContain(formatPercent(ARTIFACT_LEVEL_BONUS))
    expect(hint, '重数上限不再写进提示语').not.toContain(`${cnNumber(ARTIFACT_MAX_LEVEL)}重`)
  })

  it('丹方:已录 → 已得方 → 通晓;无方之丹到「已录」即顶并说明缘由', () => {
    const craftable = PILLS.find(p => p.recipe)!
    expect(pillStage(craftable, false, 0)).toBe(0)
    expect(pillStage(craftable, true, 0)).toBe(1)
    expect(pillStage(craftable, true, 0.4)).toBe(2)
    expect(pillStage(craftable, true, 1)).toBe(PILL_STAGE_MAX)

    const drop = PILLS.find(p => !p.recipe)!
    expect(pillStage(drop, true, 1), '无方之丹没有「得方」这一档').toBe(1)
    const e = describePill(drop, true, 1)
    expect(e.hint, '无方之丹要明说自己无方').toBe(PILL_NO_RECIPE_HINT)
    expect(e.badge).toBe('')
    expect(e.foot.value).toBe('偶得')
  })

  it('丹方:掌握度写进脚注,未到手与通晓各自给一句话', () => {
    const craftable = PILLS.find(p => p.recipe)!
    expect(describePill(craftable, true, 0.42).foot.value).toBe('42%')
    expect(describePill(craftable, true, 0).hint).toContain('需得丹方')
    const top = describePill(craftable, true, 1)
    expect(top.stageName).toBe(PILL_STAGE_NAMES[PILL_STAGE_MAX])
    expect(top.badge).toBe('通')
    expect(top.hint).toBe('')
  })

  it('三张梯子的层数与名目一一对得上(界面拿 stageName 直接显示)', () => {
    expect(EQUIP_STAGE_NAMES.length).toBe(EQUIP_STAGE_MAX + 1)
    expect(ARTIFACT_STAGE_NAMES.length).toBe(ARTIFACT_STAGE_MAX + 1)
    expect(PILL_STAGE_NAMES.length).toBe(PILL_STAGE_MAX + 1)
  })

  it('未收录的条目不会凭空有深度,但正文照样写得出来', () => {
    for (const t of EQUIPMENT_TEMPLATES) {
      const e = describeEquipment(t, undefined, false)
      expect(e.stage).toBe(0)
      expect(e.desc, '未收录也要留着风味与功用,收录之后才有对比').not.toBe('')
    }
    for (const a of ARTIFACTS) {
      expect(describeArtifact(a, 0, false).stage).toBe(0)
      expect(describeArtifact(a, 0, false).desc).not.toBe('')
    }
    for (const p of PILLS) {
      expect(describePill(p, false, 0).stage).toBe(0)
      expect(describePill(p, false, 0).desc).not.toBe('')
    }
  })
})

/**
 * 图鉴册的「形制一致」:同册里法宝谱与灵兽册都给图标与品阶色,装备册是全站最大的一册(288 件)
 * 却两者皆无 —— 它本来最该有。数据早就备好了:`EquipmentTemplate.icon` 由 data/equipment
 * 按名字字眼挑(见 data/equipmentIcon.spec),品阶色取「当文字用」那一组。
 *
 * 色必须走 qualityTextColor,不能用品阶原色:玄/天/仙/神四档原色在日/夜各有一档
 * 过不了 4.5:1(见 data/qualities 的 TEXT_COLOR)。
 * 故障注入:把 describeEquipment 的 icon / color 删掉,本条红。
 */
describe('图鉴形制 · 装备册也有图标与品阶色', () => {
  it('每件装备都带图标,且图标键真的注册在 ui/icons', () => {
    for (const t of EQUIPMENT_TEMPLATES) {
      const e = describeEquipment(t, { q: 0, t: t.tier, u: 1 }, true)
      expect(e.icon, `${t.name} 缺图标 —— 装备册是唯一没有图标的一册`).toBe(t.icon)
      expect(t.icon in ICONS, `${t.name} 的图标键 ${t.icon} 未注册`).toBe(true)
    }
  })

  it('品阶色走「当文字用」那一组,不拿原色顶文字', () => {
    for (const t of EQUIPMENT_TEMPLATES) {
      const e = describeEquipment(t, { q: 0, t: t.tier, u: 1 }, true)
      expect(e.color, `${t.name} 缺品阶色`).toBeTruthy()
      // 与 qualityTextColor 同源:四档有暗版/亮版的档位必须取暗版
      const seen = qualityOfRankForTest(0)
      expect(e.color, `${t.name} 用了品阶原色,夜/日主题会跌破 AA`).toBe(qualityTextColor(seen.id))
    }
  })

  it('未收录也照给图标与色 —— 标签流里那枚「???」之外仍有可辨的形制', () => {
    for (const t of EQUIPMENT_TEMPLATES.slice(0, 20)) {
      const e = describeEquipment(t, undefined, false)
      expect(e.icon).toBe(t.icon)
      expect(e.color).toBeTruthy()
    }
  })
})

/** 与 describeEquipment 内部的 qualityOfRank 同口径:rank 0 = 凡品 */
function qualityOfRankForTest(rank: number) {
  return QUALITIES.find(q => q.rank === Math.max(0, Math.min(8, rank))) ?? QUALITIES[0]!
}

/**
 * 图鉴册的品阶字色只有一套。
 *
 * 装备册与法宝谱同在收藏页,同一册里同一个品阶的字色不该有两种 ——
 * 玩家会把「颜色深一档」误读成品阶差异。
 * 而玄/天/仙/神四档的品阶**原色**当文字用时,在日/夜主题各有一档过不了 4.5:1
 * (见 data/qualities 的 TEXT_COLOR 与 palette.spec 的角章判据)。
 * 故三处(装备册 / 法宝谱 / 悟道录)一律走 qualityTextColor。
 *
 * 故障注入:把任一处改回 qualityDef(...).color,本条红。
 */
describe('图鉴形制 · 品阶字色只有一套', () => {
  it('装备册、法宝谱、悟道录都走「当文字用」那一组', () => {
    // 三处都必须与 qualityTextColor 同源
    for (const t of EQUIPMENT_TEMPLATES) {
      expect(describeEquipment(t, { q: 0, t: t.tier, u: 1 }, true).color).toBe(
        qualityTextColor(qualityDef('mortal').id)
      )
    }
    for (const a of ARTIFACTS) {
      const e = describeArtifact(a, 0, true)
      expect(e.color, `${a.name}(${a.quality}) 用了品阶原色,四档在日/夜会跌破 AA`).toBe(
        qualityTextColor(a.quality)
      )
    }
    for (const br of GONGFA_BRANCHES) {
      const g = gongfaDef(br.gongfaId)
      if (!g) continue
      // 未择取所属功法的品阶文字色;已择另取金色(那是「已经选定了」,不是品阶)
      const picked = describeBranch(br, BRANCH_STAGE_MAX).color
      const open = describeBranch(br, 1).color
      expect(open, `${br.name} 未择时的字色应与所属功法的品阶文字色一致`).toBe(qualityTextColor(g.quality))
      expect(picked, `${br.name} 已择时应另取金,不跟着品阶走`).toBe('var(--color-gold-ink)')
    }
  })

  it('四档有暗版/亮版的品阶,原色确实与文字色不同 —— 这条判据才不是空集', () => {
    const differ = QUALITIES.filter(q => q.color !== qualityTextColor(q.id)).map(q => q.id)
    expect(differ.length, '四档原色与文字色若都相同,本条判据形同虚设').toBe(4)
    expect(differ.sort()).toEqual(['divine', 'heaven', 'immortal', 'profound'].sort())
  })
})

describe('codexOwnedCount(「已收 N」统一口径)', () => {
  const defs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('只数实际落进 defs 的那几枚,重复与已被移出的旧 id 不多报', () => {
    // 损坏 / 旧版迁移的档:收藏 ids 混入旧 id('z')与重复('b'×3)
    expect(codexOwnedCount(['a', 'b', 'b', 'b', 'z'], defs)).toBe(2)
    expect(codexOwnedCount([], defs), '空集计 0').toBe(0)
    expect(codexOwnedCount(['a', 'b', 'c'], defs), '健康档全落进 defs,如数计入').toBe(3)
  })
})
