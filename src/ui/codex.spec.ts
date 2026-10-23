/**
 * Phase 32.7:灵材谱与悟道录的呈现
 *
 * 这两类图鉴不是"收没收录"的二态,而是把已有的认知层原样搬到界面上。
 * 所以这里守的是**渐进披露本身** —— 每一层该多说哪一句、少说哪一句。
 * 若哪天有人图省事把三句话一次性端出来,四层认知在界面上就退化成了布尔值,
 * 下面第一组测试会先叫起来。
 *
 * 只测纯函数(describeXxx / branchStage),不挂 Pinia —— materialCodex 与
 * branchCodex 只是读 store 再转调这几个函数的薄封装,没有独立逻辑可测。
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
import { QUALITIES, qualityDef } from '@/data/qualities'
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
      // 前 lv 句 lore,外加"已知性"起附上的两行数值
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
    // 赤炎灵芝 thermal 34 / 玄阴藤 thermal -30 —— 两端各取一个
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
 * 用具三类的收录深度 —— 与灵材谱同规:不回写一份「第几层」,而是按已有状态分层揭示。
 *
 * 装备看「见过的成色」(lore.equipLore,记最好的一件),法宝看祭炼重数(背包),
 * 丹方看掌握度(lore.recipeLore)。三条梯子各自的顶都要给得出下一步该做什么,
 * 到顶则闭嘴;而无方之丹要明说自己没有方子 —— 那是玩家一辈子也推不动的那一档。
 */
describe('图鉴 · 用具三类的收录深度', () => {
  it('装备:没见过就没收录;见过一件即入门;上手一档由玩家推进;天品看运气', () => {
    const t = equipmentTemplate('w_xuantie')!
    expect(equipStage(undefined, false)).toBe(0)
    // 旧档:收录过但没有成色记录 —— 仍算入目,只是记不下最好的一件
    expect(equipStage(undefined, true)).toBe(1)
    const seen = (quality: QualityId, tier: number): EquipSeen => ({ q: qualityDef(quality).rank, t: tier })
    expect(equipStage(seen('mortal', 30), true)).toBe(1)
    // 第二档不看成色,看「你有没有亲手用过它」——强化或装备过即算
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
    // 玄铁重剑只属 2 阶 —— 天品 fromTier 16,它的掉落窗口到不了天品,别承诺它
    const low = equipmentTemplate('w_xuantie')!
    expect(low.tier).toBeLessThan(qualityDef('heaven').fromTier!)
    const lowSeen = { q: qualityDef('excellent').rank, t: 2, u: 1 } // 用了,见过精品(该阶上限)
    const lowHint = describeEquipment(low, lowSeen, true).hint
    expect(lowHint, '低阶模板不该承诺天品').not.toContain('天品')
    // 星云长兵 17 阶(≥ 天品 fromTier 16)—— 才该导向天品
    const high = equipmentTemplate('w_xingyun')!
    const highHint = describeEquipment(high, { q: qualityDef('fine').rank, t: 17, u: 1 }, true).hint
    expect(highHint, '够得着天品的模板仍指引天品').toContain('天品')
  })

  /**
   * 上限就是全表最高那一档时,「见一件神品以上的成色」是一句空话。
   *
   * 神品(divine, rank 8)是全表顶,它上面什么也没有。而 24 阶起的模板(fromTier ≤ 24
   * 即含神品)只要还没见过神品,提示就照着模板句式念「以上」—— 实测 81 件(24~32 阶
   * 的全部装备)都落在这里:玩家照这句话去刷,刷的是一个不存在的成色。
   *
   * 故障注入:把 equipStage2Hint 的顶格分支删掉,本条必红。
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

    // 阳性对照:没到顶的那一档照旧说「以上」(星云长兵 17 阶的上限是天品,不是神品)
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
    /**
     * 吸命伤害的基线是 230%,乘上它自己的品阶(玄虚拂尘是灵品),再按祭炼三重
     * ×(1+0.08×3)—— 图鉴给的必须是这一份,不是表里那行基线数字。
     */
    const scaled = 2.3 * artifactQualityMult(fuchen.quality) * (1 + 3 * ARTIFACT_LEVEL_BONUS)
    expect(mid.desc, '图鉴里的数得按玩家自己的品阶与祭炼重数算').toContain(formatPercent(scaled))
    expect(describeArtifact(fuchen, ARTIFACT_MAX_LEVEL, true).badge).toBe('满')
    expect(describeArtifact(fuchen, ARTIFACT_MAX_LEVEL, true).hint).toBe('')
  })

  /**
   * 「祭炼过后,被动与神通各强八分」对零重就在顶的那几件是假话 ——
   * 神鞭(破甲)、无相念珠(净念)、神魔镜(回补)、以及全部护盾法宝,祭炼只涨被动。
   * 图鉴对所有已录法宝都印同一句,等于劝人花钱买不存在的收益。
   *
   * 故障注入:把提示语改回固定那一句,本条必红。
   */
  it('法宝谱的提示按件给话:零重封顶的只说涨被动,不承诺神通也涨', () => {
    const capped = describeArtifact(artifactDef('af_shenbian')!, 0, true) // 破甲零重就在 50% 的顶
    expect(capped.hint, '零重已封顶的法宝不该承诺「神通各强」').not.toContain('神通各强')
    expect(capped.hint, '要说清楚祭炼在这件上买到的是什么').toContain('只涨被动')

    const normal = describeArtifact(artifactDef('af_xuanxu')!, 0, true) // 吸命的伤害侧还能涨
    expect(normal.hint, '还能涨的那件照旧说清被动与神通都涨').toContain('神通各强')
  })

  /**
   * 封顶判据漏看吸命的回补那一侧 —— 神魔镜(神品)的回补基线 0.6 乘上 3.08 的品阶
   * 倍率,零重就吃满十成;而它的主体伤害零重才 8.01,离任何顶都远。
   * 只看主体的判据于是判它「还能涨」,那句「被动与神通各强八分」照念不误 ——
   * 实测炼到九重,回补仍是 100%(0/3/9 三个等级逐字相同),白花的悟道点一分也没
   * 买到那句话承诺的东西。
   *
   * 故障注入:把 `cappedAtZero` 改回只看 `active.capped`,本条必红。
   */
  it('封顶判据也看吸命的回补:神魔镜的回补零重就到顶,不许承诺它也会涨', () => {
    const mirror = describeArtifact(artifactDef('af_shenmojing')!, 0, true)
    /**
     * 回补满了,但**主体还在涨**(实测 0/1/9 重:8.01 / 8.65 / 13.78)。
     * 故这里不许承诺「神通各强」,也不许反过来说「只涨被动」—— 那是另一半谎话。
     */
    expect(mirror.hint, '神魔镜的回补零重即十成,不该承诺「神通各强」').not.toContain('神通各强')
    expect(mirror.hint, '主体仍在涨,不能说成只涨被动').not.toContain('只涨被动')
    expect(mirror.hint, '要说清哪一侧满了、哪一侧还涨').toContain('回补零重已满')
    expect(mirror.hint).toContain('神通主体')

    // 阳性对照:回补还没到顶的那一件(玄虚拂尘零重 86.9%)照旧承诺都涨
    const fuchen = describeArtifact(artifactDef('af_xuanxu')!, 0, true)
    expect(fuchen.hint).toContain('神通各强')
    expect(artifactValue(artifactDef('af_xuanxu')!, 0).active.heal).toBeLessThan(1)

    // 阳性对照:主体真的冻住的那几件(神鞭/无相念珠)照旧说「只涨被动」
    for (const id of ['af_shenbian', 'af_wuxiangzhu']) {
      expect(describeArtifact(artifactDef(id)!, 0, true).hint, `${id} 主体零重封顶`).toContain('只涨被动')
    }
  })

  /**
   * 同一条谎话在深度 2 那一行还有一份:「炼到九重,才算把它用透」对零重就封顶的
   * 几件同样是假话 —— 神魔镜炼到九重,神通与炼第一重时逐字相同(实测 0/3/9 三个
   * 等级的主体伤害 8.01/9.30/13.78 在涨,而回补三个等级全是 100%),「用透」的是
   * 被动,不是这一句让人以为的那件法宝的全部。玩家在这一行看到的承诺,与下一行
   * 「下一重」给的那笔账对不上。
   *
   * 故障注入:把深度 2 那句改回不分子女的固定文案,本条必红。
   */
  it('深度 2 的提示也按件给话:零重封顶的不再拿「炼到九重才算用透」催人', () => {
    const mid = describeArtifact(artifactDef('af_shenmojing')!, 1, true)
    expect(mid.stage, '祭炼过一重即深度 2').toBe(2)
    expect(mid.hint, '神通早就到顶了,不该再拿「用透」催人').not.toContain('才算把它用透')
    // 神魔镜只有回补满了、主体还在涨:既不能说「用透」,也不能说成只买被动
    expect(mid.hint, '要说清楚往后买的是什么').toContain('仍让被动与神通主体各强')

    // 阳性对照:还能涨的那一件照旧用「用透」那一句
    const fuchenMid = describeArtifact(artifactDef('af_xuanxu')!, 1, true)
    expect(fuchenMid.hint).toContain('才算把它用透')

    // 阳性对照:主体真的冻住的那件照旧说「只买被动」
    const whipMid = describeArtifact(artifactDef('af_shenbian')!, 1, true)
    expect(whipMid.hint).toContain('只买被动')
  })

  it('提示语里的重数上限从 ARTIFACT_MAX_LEVEL 现算,不是写死的「九」', () => {
    const hint = describeArtifact(artifactDef('af_xuanxu')!, 1, true).hint
    // 句子里写的是中文数词(「九重」),故比对现算出来的那一个,而不是阿拉伯数字
    expect(hint, `重数上限改了,提示语还在说旧数字:${hint}`).toContain(`${cnNumber(ARTIFACT_MAX_LEVEL)}重`)
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
    expect(describePill(craftable, true, 0).hint).toContain('方子还没到手')
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

describe('codexOwnedCount(「已收 N」统一口径)', () => {
  const defs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('只数实际落进 defs 的那几枚,重复与已被移出的旧 id 不多报', () => {
    // 收藏 ids 可能混入旧 id('z')与重复('b'×3)—— 损坏 / 旧版迁移的档会残留
    expect(codexOwnedCount(['a', 'b', 'b', 'b', 'z'], defs)).toBe(2)
    expect(codexOwnedCount([], defs), '空集计 0').toBe(0)
    expect(codexOwnedCount(['a', 'b', 'c'], defs), '健康档全落进 defs,如数计入').toBe(3)
  })
})
