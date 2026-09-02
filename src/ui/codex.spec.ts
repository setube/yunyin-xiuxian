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
import { gongfaDef } from '@/data/gongfa'
import { BRANCH_STAGE_MAX, BRANCH_STAGE_NAMES, branchStage, describeBranch, describeMaterial } from './codex'

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
  const fullLevel = gongfaDef(branch.gongfaId)!.maxLevel ?? 9

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
