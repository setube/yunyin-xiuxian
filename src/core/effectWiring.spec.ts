/**
 * 来源到底有没有接上 —— 每个系统都必须真能动到玩家的数
 *
 * 「装备属性没生效」这类事故的共同形状是:数据写了、界面也显示,但**没有一条路
 * 把它送进玩家的数**。它骗得过类型检查(键是对的),也骗得过逐函数的单元测试
 * (每个函数各自都对)—— 只有从「装上 / 学会 / 服下 / 升一级」一路走到「面板变了」
 * 才现形。故这里逐个来源走**真实通路**,判据只有一条:**动没动到数**。
 *
 * 覆盖:装备(平铺/词条/固有/强化/卸下可逆)、法宝(被动/祭炼/收回)、
 * 功法(主修/辅修/升级/悟道分支)、丹药(即时四项/增益状态)、灵兽、称号、天赋、
 * 洞府建筑、灵脉、以及天界一侧的器魂换装。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { useDongfuStore } from '@/stores/dongfu'
import { useEndgameStore } from '@/stores/endgame'
import { useResourcesStore } from '@/stores/resources'
import { usePill } from '@/core/pillService'
import { investVein } from '@/core/veinService'
import { modOf } from './statsCalc'
import { toNum } from '@/utils/gnum'
import { ARTIFACT_MAX_LEVEL } from '@/data/artifacts'
import { gongfaDef } from '@/data/gongfa'
import { branchesFor } from '@/data/gongfaBranches'
import { buffDef } from '@/data/buffs'
import { talentDef } from '@/data/talents'
import { titleDef } from '@/data/titles'
import { todayWeather } from '@/core/weather'
import { askDivination } from '@/core/divinationService'
import { readingMods } from '@/core/divination'
import { DAO_FRUIT_COMBAT_BONUS } from '@/data/constants'
import { fateChart, fateMods, fateSeed } from '@/core/fate'
import { PILLS } from '@/data/pills'
import type { EquipmentInstance } from '@/types'

function freshCharacter(major = 3): ReturnType<typeof usePlayerStore> {
  const player = usePlayerStore()
  player.initCharacter('接线自检', { roots: [{ element: 'wood', aptitude: 80 }] } as never)
  player.major = major
  return player
}

function item(partial: Partial<EquipmentInstance> & { uid: string; templateId: string }): EquipmentInstance {
  return { quality: 'heaven', tier: 10, level: 0, affixes: [], ...partial }
}

/** 某味丹药的 id(按族里最基础那一味找,免得写死一个将来会改的 id) */
function pillWith(pred: (p: (typeof PILLS)[number]) => boolean): string {
  const def = PILLS.find(pred)
  expect(def, '丹药表里找不到这一族的丹 —— 判据失去对象').toBeDefined()
  return def!.id
}

describe('装备 → 面板', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('平铺:装上一件武器攻击变高;卸下回到原值', () => {
    const player = freshCharacter()
    const inv = useInventoryStore()
    const bare = toNum(player.finalStats.attack)
    inv.items = [item({ uid: 'w', templateId: 'w_zhuxian' })]
    inv.equip('w', 'weapon')
    const armed = toNum(player.finalStats.attack)
    expect(armed, '装上武器攻击没变 —— 平铺没进面板').toBeGreaterThan(bare)
    inv.unequip('weapon')
    expect(toNum(player.finalStats.attack), '卸下后没回到原值').toBeCloseTo(bare, 6)
  })

  it('词条:攻击词条既进面板,也真的抬高攻击', () => {
    const player = freshCharacter()
    const inv = useInventoryStore()
    const pctBefore = modOf(player.finalStats.mods, 'attackPct')
    const atkBefore = toNum(player.finalStats.attack)
    inv.items = [item({ uid: 'w', templateId: 'w_zhuxian', affixes: [{ id: 'atk2', roll: 1 }] })]
    inv.equip('w', 'weapon')
    const gain = modOf(player.finalStats.mods, 'attackPct') - pctBefore
    expect(gain, '词条没并进面板').toBeGreaterThan(0)
    expect(toNum(player.finalStats.attack), '词条加了却不见攻击变高').toBeGreaterThan(atkBefore)
  })

  it('固有:模板 fixedMods 也进面板(不是只写在数据里)', () => {
    const player = freshCharacter()
    const inv = useInventoryStore()
    inv.items = [item({ uid: 'x', templateId: 'wr_jieyun', tier: 20 })]
    inv.equip('x', 'wrist')
    expect(modOf(player.finalStats.mods, 'tribulationResist')).toBeGreaterThan(0)
  })

  it('强化:每 +1 级都更高(强化不是只改标签)', () => {
    const player = freshCharacter()
    const inv = useInventoryStore()
    inv.items = [item({ uid: 'w', templateId: 'w_zhuxian', level: 0 })]
    inv.equip('w', 'weapon')
    const a = toNum(player.finalStats.attack)
    inv.replaceItem({ ...inv.findItem('w')!, level: 5 })
    expect(toNum(player.finalStats.attack), '强化等级没进数值').toBeGreaterThan(a)
  })
})

describe('法宝 → 面板', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('祭炼随身:被动进面板,祭炼满了更高,收回后退出', () => {
    const player = freshCharacter()
    const inv = useInventoryStore()
    const bare = modOf(player.finalStats.mods, 'attackPct')
    inv.artifacts = [{ defId: 'af_zhenyue', level: 0 }]
    inv.toggleArtifact('af_zhenyue', 2)
    const lv0 = modOf(player.finalStats.mods, 'attackPct')
    expect(lv0, '法宝被动没进面板').toBeGreaterThan(bare)
    inv.artifacts = [{ defId: 'af_zhenyue', level: ARTIFACT_MAX_LEVEL }]
    expect(modOf(player.finalStats.mods, 'attackPct'), '祭炼没有让被动更强').toBeGreaterThan(lv0)
    inv.toggleArtifact('af_zhenyue', 2)
    expect(modOf(player.finalStats.mods, 'attackPct'), '收回法宝后面板没退回去').toBeCloseTo(bare, 6)
  })
})

describe('功法 → 面板', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('主修:装配、升级、满级悟道分支,三层都得进面板', () => {
    const player = freshCharacter()
    const cul = useCultivationStore()
    const def = gongfaDef('m_taixuan')!
    const base = modOf(player.finalStats.mods, 'cultivationSpeed')
    cul.learn(def.id)
    cul.equipMain(def.id)
    const lv1 = modOf(player.finalStats.mods, 'cultivationSpeed')
    expect(lv1, '主修装配没进面板').toBeGreaterThan(base)
    for (let i = 0; i < def.maxLevel - 1; i += 1) cul.upgrade(def.id)
    const maxed = modOf(player.finalStats.mods, 'cultivationSpeed')
    expect(maxed, '功法升级没有让加成变高').toBeGreaterThan(lv1)
    const atMax = { ...player.finalStats.mods }
    const branch = branchesFor(def.id).find(b => Object.keys(b.mods).length > 0)!
    expect(cul.chooseBranch(def.id, branch.id), '择道失败').toBe(true)
    /**
     * 判据按**分支自己的词条**走:那份数据写了什么,面板就该多什么。
     * (写死某个键会误判 —— b_taixuan_sha「杀伐」给的是攻击,不是修炼速度。)
     */
    for (const [key, value] of Object.entries(branch.mods)) {
      const k = key as keyof typeof player.finalStats.mods
      expect(modOf(player.finalStats.mods, k as never), `${branch.name} 的 ${key} 没并进面板`).toBeCloseTo(
        (atMax[k] ?? 0) + (value as number),
        6
      )
    }
    expect(maxed).toBeGreaterThan(0)
  })

  it('辅修也进面板(不是只有主修算数)', () => {
    const player = freshCharacter()
    const cul = useCultivationStore()
    const before = modOf(player.finalStats.mods, 'maxHpPct')
    cul.learn('s_lianti')
    cul.toggleSub('s_lianti', 7)
    expect(modOf(player.finalStats.mods, 'maxHpPct'), '辅修没进面板').toBeGreaterThan(before)
  })
})

describe('丹药 → 资源与状态', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('即时丹:修为 / 灵气 / 寿元 / 悟道点四项都真的加', () => {
    const player = freshCharacter()
    const res = useResourcesStore()
    const inv = useInventoryStore()
    // 从表里找:固定修为、按上限回灵气、延寿、给悟道点各一味(不写死 id)
    const expPill = pillWith(p => (p.instant?.expFixed ?? 0) > 0 && p.minRealm <= player.major)
    const qiPill = pillWith(p => (p.instant?.qiPct ?? 0) > 0 && p.minRealm <= player.major)
    const lifePill = pillWith(p => (p.instant?.lifespanYears ?? 0) > 0 && p.minRealm <= player.major)
    const wudaoPill = pillWith(p => (p.instant?.wudao ?? 0) > 0 && p.minRealm <= player.major)

    const exp0 = toNum(player.exp)
    const qi0 = res.qi
    const life0 = player.lifespanMax
    const wudao0 = res.wudao
    for (const id of [expPill, qiPill, lifePill, wudaoPill]) inv.addPill(id, 1)
    for (const id of [expPill, qiPill, lifePill, wudaoPill]) {
      expect(usePill(id), `服下「${id}」失败`).toBe(true)
    }
    expect(toNum(player.exp), '修为丹没加修为').toBeGreaterThan(exp0)
    expect(res.qi, '回灵丹没加灵气').toBeGreaterThan(qi0)
    expect(player.lifespanMax, '延寿丹没加寿元上限').toBeGreaterThan(life0)
    expect(res.wudao, '悟道丹没加悟道点').toBeGreaterThan(wudao0)
  })

  it('增益丹:状态上身后面板出现对应词条,过期后自己退出', () => {
    const player = freshCharacter()
    const cul = useCultivationStore()
    const inv = useInventoryStore()
    const pillId = pillWith(p => {
      const b = p.buffId ? buffDef(p.buffId) : undefined
      return !!b && (b.mods.attackPct ?? 0) > 0 && p.minRealm <= player.major
    })
    const buffId = PILLS.find(p => p.id === pillId)!.buffId!
    const buff = buffDef(buffId)!
    const before = modOf(player.finalStats.mods, 'attackPct')
    inv.addPill(pillId, 1)
    expect(usePill(pillId)).toBe(true)
    expect(modOf(player.finalStats.mods, 'attackPct'), '增益丹上身了却没进面板').toBeGreaterThanOrEqual(
      before + (buff.mods.attackPct ?? 0) - 1e-9
    )
    // 过期:把时间推过有效期末尾,状态该自己退掉
    const later = Date.now() + buff.durationSec * 1000 + 1000
    cul.pruneBuffs(later)
    expect(modOf(player.finalStats.mods, 'attackPct'), '状态过期后还在加').toBeCloseTo(before, 6)
  })
})

describe('灵兽 / 称号 / 天赋 / 洞府建筑 / 灵脉 → 面板', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('灵兽:出战加成进面板,暂别后退出', () => {
    const player = freshCharacter()
    const before = modOf(player.finalStats.mods, 'spiritStoneGain')
    player.setPet('pet_jinchan')
    expect(modOf(player.finalStats.mods, 'spiritStoneGain'), '灵兽加成没进面板').toBeGreaterThan(before)
    player.setPet(null)
    expect(modOf(player.finalStats.mods, 'spiritStoneGain')).toBeCloseTo(before, 6)
  })

  it('称号:佩戴即进面板', () => {
    const player = freshCharacter()
    const def = titleDef('ti_churu')!
    const before = modOf(player.finalStats.mods, 'cultivationSpeed')
    player.setTitle(def.id)
    expect(modOf(player.finalStats.mods, 'cultivationSpeed'), '称号没进面板').toBeGreaterThan(before)
  })

  it('天赋:加一条即进面板', () => {
    const player = freshCharacter()
    const def = talentDef('t_jianxin')!
    const before = modOf(player.finalStats.mods, 'attackPct')
    player.addTalent(def.id)
    expect(modOf(player.finalStats.mods, 'attackPct'), '天赋没进面板').toBeGreaterThanOrEqual(
      before + (def.mods.attackPct ?? 0) - 1e-9
    )
  })

  it('洞府建筑:升级即进面板', () => {
    const player = freshCharacter()
    const before = modOf(player.finalStats.mods, 'qiRegen')
    useDongfuStore().setLevel('array', 5) // 聚灵阵:灵气恢复 +10%/级
    expect(modOf(player.finalStats.mods, 'qiRegen'), '建筑等级没进面板').toBeGreaterThan(before)
  })

  it('灵脉:投点即进面板', () => {
    const player = freshCharacter()
    const res = useResourcesStore()
    const dongfu = useDongfuStore()
    res.addStone({ m: 1, e: 30 })
    const before = modOf(player.finalStats.mods, 'cultivationSpeed')
    expect(investVein('gather'), '聚灵脉投资失败').toBe(true)
    expect(dongfu.veinPoints.gather, '投资没有记在灵脉上').toBeGreaterThan(0)
    expect(modOf(player.finalStats.mods, 'cultivationSpeed'), '灵脉没进面板').toBeGreaterThan(before)
  })

  /**
   * 环境三源(天时 / 命格 / 在身之卦)与道果 —— 它们都该走 finalStats.mods 那条路
   * (见 player.ts 上方的注释:并进去即全链路生效)。天时与命格由日期/灵根确定性推出,
   * 控制不了也不必控制:判据是**面板里那一路的来源明细,恰好等于那一路算出来的东西**。
   */
  it('天时:面板天时那一路 = 今日天时的 mods,且名号带着气象(接线,不靠运气)', () => {
    const player = freshCharacter()
    // 名号是「天时·仙雨」这类 —— 停了渠道上,得让玩家看得见是天上哪片云,故按前缀找
    const row = player.finalStats.breakdown.find(r => r.name.startsWith('天时·'))
    expect(row, '面板里没有天时这一路').toBeDefined()
    expect(row!.mods).toEqual(todayWeather().mods)
    expect(row!.name).toBe(`天时·${todayWeather().name}`)
  })

  it('命格:面板「命格」那一路 = 本世命格算出来的 mods', () => {
    const player = freshCharacter()
    const row = player.finalStats.breakdown.find(r => r.name === '命格')
    expect(row, '面板里没有「命格」这一路').toBeDefined()
    expect(row!.mods).toEqual(fateMods(fateChart(fateSeed(player.linggen, player.reincarnation.count))))
  })

  it('在身之卦:问一卦即进面板,过期的卦不算数', () => {
    const player = freshCharacter()
    const res = useResourcesStore()
    res.addSmall('wudao', 100)
    const bare = { ...player.finalStats.mods }
    const out = askDivination()
    expect(out.ok, out.reason ?? '问卦被拒').toBe(true)
    const row = player.finalStats.breakdown.find(r => r.name === '在身之卦')
    expect(row, '面板里没有「在身之卦」这一路').toBeDefined()
    // 接线判据:面板那一路 = 这一卦算出来的 mods
    expect(row!.mods).toEqual(readingMods(out.reading!))
    // 过期:把这一卦的有效期挪到过去,那一份就该退掉
    player.setDivination({ ...player.divination!, castAt: Date.now() - 120_000, expiresAt: Date.now() - 1000 })
    const after = player.finalStats.breakdown.find(r => r.name === '在身之卦')
    expect(after?.mods ?? {}, '过期的卦还挂在面板上').toEqual({})
    expect(player.activeDivination, '过期的卦仍被当作在身').toBeNull()
    for (const k of Object.keys(row!.mods)) {
      expect(player.finalStats.mods[k as never] ?? 0, `过期的卦还在加 ${k}`).toBeCloseTo(bare[k as never] ?? 0, 6)
    }
  })

  it('道果:加一枚,攻防血三围数值一起抬(它是乘在基础上的那一项)', () => {
    const player = freshCharacter()
    const atk = toNum(player.finalStats.attack)
    const def = toNum(player.finalStats.defense)
    const hp = toNum(player.finalStats.maxHp)
    player.addDaoFruit(1)
    expect(toNum(player.finalStats.attack), '道果没进攻击').toBeGreaterThan(atk)
    expect(toNum(player.finalStats.defense), '道果没进防御').toBeGreaterThan(def)
    expect(toNum(player.finalStats.maxHp), '道果没进气海').toBeGreaterThan(hp)
    expect(DAO_FRUIT_COMBAT_BONUS).toBeGreaterThan(0)
  })
})

/**
 * 天界这一侧的契约(口径换过一次,现在是):
 *   ①**基础三维作数** —— 换上一件更好的装备,天界三维跟着变高;
 *   ②**器魂是叠加层** —— 凡器照常在,器魂再叠上去;
 *   ③敌人不跟着玩家涨(那一半在 celestialCaliber.spec 里盯着)。
 */
describe('天界 → 基础三维作数', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('凡界装备的平铺三维在天界也作数:换一件更厚的,天界三维跟着涨', () => {
    const player = freshCharacter(12)
    const inv = useInventoryStore()
    const loot = (uid: string, tier: number): EquipmentInstance =>
      item({ uid, templateId: 'w_zhuxian', tier, affixes: [{ id: 'crit1', roll: 1 }] })
    inv.items = [loot('low', 3)]
    inv.equip('low', 'weapon')
    const mortalLow = toNum(player.finalStats.attack)
    const celestialLow = toNum(player.celestialStats.attack)
    inv.items = [loot('high', 20)]
    inv.equip('high', 'weapon')
    expect(toNum(player.finalStats.attack), '凡界:层级更高的武器该更强').toBeGreaterThan(mortalLow)
    expect(toNum(player.celestialStats.attack), '天界:同一件装备的平铺没算进去').toBeGreaterThan(celestialLow)
  })

  it('器魂是叠加层:带着器魂时,凡界装备照常在面板里', () => {
    const player = freshCharacter(12)
    const inv = useInventoryStore()
    const eg = useEndgameStore()
    eg.souls = [{ uid: 's1', type: 'fengmang', grade: 3, fromName: '旧剑' }] as never
    eg.equippedSouls = ['s1']
    const before = modOf(player.celestialStats.mods, 'attackPct')
    inv.items = [item({ uid: 'w', templateId: 'w_zhuxian', affixes: [{ id: 'atk2', roll: 1 }] })]
    inv.equip('w', 'weapon')
    expect(modOf(player.celestialStats.mods, 'attackPct'), '凡器词条被器魂顶掉了').toBeGreaterThan(before)
    expect(modOf(player.celestialStats.mods, 'attackPct'), '器魂那一份也该在').toBeGreaterThan(0)
  })
})
