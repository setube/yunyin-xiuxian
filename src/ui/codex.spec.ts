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
  artifactQualityMult
} from '@/data/artifacts'
import { EQUIPMENT_TEMPLATES, equipmentTemplate } from '@/data/equipment'
import { PILLS } from '@/data/pills'
import { qualityDef } from '@/data/qualities'
import type { QualityId } from '@/types'
import { formatPercent } from '@/utils/format'

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
