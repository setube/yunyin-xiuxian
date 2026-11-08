/* eslint-disable no-console */
/**
 * 本世路线可达性审计:本世路线决定本世可达性。
 * 判据:新号不依赖任何旧区域解锁状态,能完整走完随机生成的路线。
 * 按 route index 开放,不按 tier(路线允许层级回落;层级是路线特征,不是解锁顺序)。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { skeletonOf } from './mortalIdentity'
import { createPinia, setActivePinia } from 'pinia'
import { advanceRoute, canEnterNode, canEnterRegion, ensureMortalWorld, entryBlockReason, isNodeCleared, rerollMortalWorld } from './mortalWorldService'
import { generateMortalWorld } from './mortalWorldGen'
import { useAdventureStore } from '@/stores/adventure'
import { REGIONS, regionDef } from '@/data/regions'
import { startExploration, clearRegionAndUnlockNext } from './exploration'

function regionName(id: string): string {
  return regionDef(id)?.name ?? id
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
})

/** 从头走完整条路线,返回每一步的可达性读数 */
function walkRoute(): { step: number; name: string; couldEnter: boolean }[] {
  const adventure = useAdventureStore()
  const w = adventure.mortalWorld!
  const out: { step: number; name: string; couldEnter: boolean }[] = []
  for (const [i, p] of w.chain.entries()) {
    out.push({ step: i + 1, name: p.name, couldEnter: canEnterNode(p.nodeId) })
    advanceRoute(p.fromId)
  }
  return out
}

describe('路线可达性 · 新号', () => {
  it('新号不依赖任何旧解锁状态即可走完整条路线', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = []
    adventure.cleared = []
    const w = ensureMortalWorld()
    expect(w).not.toBeNull()

    const walk = walkRoute()
    console.log('\n新号(旧解锁链清空)逐段推进:')
    for (const s of walk) console.log(`  ${s.step}. ${s.name.padEnd(10)} ${s.couldEnter ? '可进入' : '× 上锁'}`)
    for (const s of walk) expect(s.couldEnter).toBe(true)
    console.log(`\n${walk.length} 段全部可依次进入,与 adventure.unlocked 无关`)
  })

  it('未通前一段时,后续段全部上锁', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = []
    const w = ensureMortalWorld()!
    expect(canEnterNode(w.chain[0]!.nodeId)).toBe(true)
    for (let i = 1; i < w.chain.length; i += 1) {
      expect(canEnterNode(w.chain[i]!.nodeId)).toBe(false)
    }
    console.log(`\n首段可进,其余 ${w.chain.length - 1} 段上锁 —— 历练顺序未被破坏`)
  })

  it('推进是逐段的:通一段只开下一段', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = []
    const w = ensureMortalWorld()!
    advanceRoute(w.chain[0]!.fromId)
    expect(canEnterNode(w.chain[1]!.nodeId)).toBe(true)
    if (w.chain.length > 2) expect(canEnterNode(w.chain[2]!.nodeId)).toBe(false)
    console.log('\n通第一段 → 第二段开,第三段仍锁')
  })
})

describe('路线可达性 · 按 route index 而非 tier', () => {
  it('回落路线上,层级更低的后续段仍须等前一段通过', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = []
    let world = null
    for (let seed = 1; seed < 400 && !world; seed += 1) {
      const w = generateMortalWorld(seed * 7919)
      const dips = w.chain.some((p, i) => i > 0 && p.tier < w.chain[i - 1]!.tier)
      if (dips) world = w
    }
    expect(world).not.toBeNull()
    adventure.setMortalWorld(world)

    const tiers = world!.chain.map(p => p.tier)
    const dipIndex = world!.chain.findIndex((p, i) => i > 0 && p.tier < world!.chain[i - 1]!.tier)
    console.log(`\n回落路线:${tiers.join(' → ')}(第 ${dipIndex + 1} 段层级低于前一段)`)

    expect(canEnterNode(world!.chain[dipIndex]!.nodeId)).toBe(false)
    for (let i = 0; i < dipIndex; i += 1) advanceRoute(world!.chain[i]!.fromId)
    expect(canEnterNode(world!.chain[dipIndex]!.nodeId)).toBe(true)
    console.log('层级低不等于早开放 —— 层级是路线特征,不是解锁顺序')
  })

  it('整条路线的可达顺序与层级排序无关', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = []
    let world = null
    for (let seed = 1; seed < 400 && !world; seed += 1) {
      const w = generateMortalWorld(seed * 104729)
      if (w.chain.some((p, i) => i > 0 && p.tier < w.chain[i - 1]!.tier)) world = w
    }
    adventure.setMortalWorld(world)
    const byTier = [...world!.chain].sort((a, b) => a.tier - b.tier).map(p => p.nodeId)
    const byRoute = world!.chain.map(p => p.nodeId)
    expect(byTier).not.toEqual(byRoute)
    const walk = walkRoute()
    for (const s of walk) expect(s.couldEnter).toBe(true)
    console.log('\n层级序与路线序不同,可达性只认路线序')
  })
})

describe('路线可达性 · 旧存档与换界', () => {
  it('旧存档部分解锁:路线仍从首段起走', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = ['qingyun', 'luoxia']
    adventure.cleared = ['qingyun']
    const w = ensureMortalWorld()!
    expect(canEnterNode(w.chain[0]!.nodeId)).toBe(true)
    const openedByOldState = w.chain.slice(1).filter(p => canEnterNode(p.nodeId))
    expect(openedByOldState).toHaveLength(0)
    console.log('\n旧解锁状态不会把路线中段提前打开')
  })

  it('旧存档全部解锁:本世路线的**进度**仍要逐段推,不会整条通关', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = REGIONS.map(r => r.id)
    adventure.cleared = REGIONS.map(r => r.id)
    const w = ensureMortalWorld()!
    for (let i = 1; i < w.chain.length; i += 1) {
      expect(canEnterNode(w.chain[i]!.nodeId)).toBe(false)
    }
    console.log(
      '\n全解锁的老存档进入新世界,路线进度(canEnterNode)仍从第一段起算。' +
        '\n注意区分两件事:**路线进度**要逐段推,但**地界准入**(canEnterRegion)' +
        '\n会回落旧解锁链,所以老存档确实能不按路线顺序去打那些地界。' +
        '\n这是为了避免新号「整页 0 个按钮」而付出的代价,不是疏漏'
    )
  })

  it('旧档全解锁的路线节点仍能推进:已清区域不把本世路线锁死', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = REGIONS.map(r => r.id)
    adventure.cleared = REGIONS.map(r => r.id)
    const w = ensureMortalWorld()!
    const first = w.chain[0]!
    // 首段地界旧链已清(boss 判定按旧链变 null,死锁入口),本世节点未通
    expect(adventure.cleared).toContain(first.fromId)
    expect(isNodeCleared(first.nodeId)).toBe(false)
    clearRegionAndUnlockNext(first.fromId)
    expect(isNodeCleared(first.nodeId), '旧档已清区域的首段也要能推进本世路线').toBe(true)
    if (w.chain.length > 1) {
      expect(canEnterNode(w.chain[1]!.nodeId), '路线由此向前').toBe(true)
    }
  })

  it('换界即换路:本世进度不跨界继承', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = []
    const w1 = ensureMortalWorld()!
    advanceRoute(w1.chain[0]!.fromId)
    expect(isNodeCleared(w1.chain[0]!.nodeId)).toBe(true)

    const w2 = rerollMortalWorld()!
    expect(adventure.mortalCleared).toHaveLength(0)
    expect(canEnterNode(w2.chain[0]!.nodeId)).toBe(true)
    if (w2.chain.length > 1) expect(canEnterNode(w2.chain[1]!.nodeId)).toBe(false)
    console.log('\nreroll 后进度清零,新的天地从第一段重新走')
  })

  it('节点 id 随路线位置生成,同一区域换段不会串味', () => {
    const a = generateMortalWorld(11111)
    const b = generateMortalWorld(22222)
    const shared = a.chain.filter(p => b.chain.some(q => q.fromId === p.fromId))
    for (const p of shared) {
      const q = b.chain.find(x => x.fromId === p.fromId)!
      if (a.chain.indexOf(p) !== b.chain.indexOf(q)) {
        expect(p.nodeId).not.toBe(q.nodeId)
      }
    }
    console.log(`\n两世共有 ${shared.length} 处地界;段序不同则节点 id 不同`)
  })
})

describe('路线可达性 · 本世路线是主线,不是唯一入口', () => {
  it('回归:路线之外的地界仍要能走 —— 玩家反馈「历练没法打了」', () => {
    const adventure = useAdventureStore()
    const w = ensureMortalWorld()!
    const inRoute = new Set(w.chain.map(p => p.fromId))

    // 路线外地界须动态挑:世界种子取 Date.now(),写死某处会偶发被抽进路线
    const outside = REGIONS.find(r => !inRoute.has(r.id) && !adventure.unlocked.includes(r.id))!
    adventure.unlocked = [outside.id]
    expect(inRoute.has(outside.id)).toBe(false)

    expect(startExploration(outside.id, 'normal')).toBe(true)
    adventure.setSession(null)
    console.log(
      `\n本世路线含 ${inRoute.size} 处;路线外的「${regionName(outside.id)}」仍可出发` +
        '\n—— 本世路线是主线,旧地图不该被它锁死'
    )
  })

  it('路线外的地界仍受旧解锁链约束,不是全开', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = ['qingyun']
    adventure.cleared = []
    const w = ensureMortalWorld()!
    const inRoute = new Set(w.chain.map(p => p.fromId))
    const locked = REGIONS.find(r => !inRoute.has(r.id) && !adventure.unlocked.includes(r.id))!
    expect(startExploration(locked.id, 'normal')).toBe(false)
    console.log(`\n「${locked.name}」既不在本世路线、旧链也未开 → 仍进不去`)
  })

  it('路线只追加可达性,不收回旧链已给出的权限', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = REGIONS.map(r => r.id)
    adventure.cleared = []
    const w = ensureMortalWorld()!
    expect(startExploration(w.chain[1]!.fromId, 'normal')).toBe(true)
    adventure.setSession(null)
    const outside = REGIONS.find(r => !w.chain.some(p => p.fromId === r.id))!
    expect(startExploration(outside.id, 'normal')).toBe(true)
    adventure.setSession(null)
    console.log(
      `\n旧链全开的老存档:路线中段「${w.chain[1]!.name}」与路线外「${outside.name}」都可进` +
        '\n代价是老存档能绕开路线顺序;换来的是不会走不动'
    )
  })

  it('旧链为空时路线顺序完全生效 —— 该起作用的地方没被削弱', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = []
    adventure.cleared = []
    const w = ensureMortalWorld()!
    expect(startExploration(w.chain[0]!.fromId, 'normal')).toBe(true)
    adventure.setSession(null)
    for (let i = 1; i < w.chain.length; i += 1) {
      expect(startExploration(w.chain[i]!.fromId, 'normal')).toBe(false)
    }
    console.log(`\n新号:仅首段「${w.chain[0]!.name}」可进,其余 ${w.chain.length - 1} 段仍须逐段走`)
  })
})

/**
 * 界面与守卫共用同一个准入谓词。钉两条:
 *   界面给出出发按钮的地界,守卫必须放行;
 *   任何存档状态下至少有一处地界可进。
 */
describe('路线可达性 · 界面与守卫共用一个谓词', () => {
  it('回归:界面谓词与守卫结论逐处一致', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = REGIONS.map(r => r.id)
    adventure.cleared = []
    ensureMortalWorld()
    let enterable = 0
    for (const r of REGIONS) {
      const uiSays = canEnterRegion(r.id)
      const guardSays = startExploration(r.id, 'normal')
      expect(guardSays, `${r.name}:界面说 ${uiSays},守卫说 ${guardSays}`).toBe(uiSays)
      if (guardSays) {
        enterable += 1
        adventure.setSession(null)
      }
    }
    console.log(`\n${REGIONS.length} 处地界逐个比对,界面与守卫结论完全一致(其中 ${enterable} 处可进)`)
  })

  it('回归:任何旧链进度下都至少有一处可进 —— 不会整页 0 个按钮', () => {
    console.log('\n旧链已开  可进处数  路线首段')
    for (const open of [0, 1, 2, 3, 5, 8, 13, REGIONS.length]) {
      setActivePinia(createPinia())
      const adventure = useAdventureStore()
      adventure.unlocked = REGIONS.slice(0, open).map(r => r.id)
      adventure.cleared = []
      const w = ensureMortalWorld()!
      const openable = REGIONS.filter(r => canEnterRegion(r.id))
      console.log(`${String(open).padStart(6)} ${String(openable.length).padStart(9)}    ${w.chain[0]!.name}`)
      expect(openable.length, `旧链开 ${open} 处时无处可去`).toBeGreaterThan(0)
    }
  })

  it('故障注入:还原旧的两套判据,新号的历练页确实一个按钮都没有', () => {
    // 死锁出在可见性不在谓词:须照视图算法数可见按钮,只数可进地界数会误判旧语义无问题
    const OPEN = 1
    // 死锁条件:旧链开着的几处全是路线成员且未轮到,且路线首段在可见范围外
    let world = null
    for (let seed = 1; seed < 3000 && !world; seed += 1) {
      const w = generateMortalWorld(seed * 7919)
      const headPos = REGIONS.findIndex(r => r.id === w.chain[0]!.fromId)
      const openAllBlocked = REGIONS.slice(0, OPEN).every(r => {
        const at = w.chain.findIndex(p => p.fromId === r.id)
        return at > 0
      })
      if (headPos > OPEN && openAllBlocked) world = w
    }
    expect(world, '未找到能复现死锁的路线').not.toBeNull()

    setActivePinia(createPinia())
    const adventure = useAdventureStore()
    adventure.unlocked = REGIONS.slice(0, OPEN).map(r => r.id)
    adventure.cleared = []
    adventure.setMortalWorld(world)

    // 旧语义:路线内只认段序;历练页按「未解锁」截断
    const oldCanEnter = (id: string): boolean => {
      const node = world!.chain.find(p => p.fromId === id)
      if (node) return canEnterNode(node.nodeId)
      return adventure.unlocked.includes(id)
    }
    const oldRows = REGIONS.map(r => ({ unlocked: adventure.unlocked.includes(r.id), canEnter: oldCanEnter(r.id) }))
    const oldCut = oldRows.findIndex(r => !r.unlocked)
    const oldVisible = oldCut < 0 ? oldRows : oldRows.slice(0, oldCut + 1)
    const oldButtons = oldVisible.filter(r => r.canEnter).length

    // 现语义:路线回落旧链;截断条件带上 canEnter
    const newRows = REGIONS.map(r => ({ unlocked: adventure.unlocked.includes(r.id), canEnter: canEnterRegion(r.id) }))
    const newCut = newRows.findIndex(r => !r.unlocked && !r.canEnter)
    const newVisible = newCut < 0 ? newRows : newRows.slice(0, newCut + 1)
    const newButtons = newVisible.filter(r => r.canEnter).length

    expect(oldButtons, '旧语义应当复现出「整页 0 个按钮」').toBe(0)
    expect(newButtons).toBeGreaterThan(0)
    console.log(
      `\n路线首段「${world!.chain[0]!.name}」排在地界表第 ${REGIONS.findIndex(r => r.id === world!.chain[0]!.fromId) + 1} 位,` +
        `旧链只开 ${OPEN} 处` +
        `\n  旧语义:可见 ${oldVisible.length} 行,出发按钮 ${oldButtons} 个 ← 玩家卡死在这里` +
        `\n  现语义:可见 ${newVisible.length} 行,出发按钮 ${newButtons} 个`
    )
  })

  it('拒绝不再静默,且理由指向眼下就能去的那一段', () => {
    setActivePinia(createPinia())
    const adventure = useAdventureStore()
    adventure.unlocked = []
    adventure.cleared = []
    const w = ensureMortalWorld()!
    const mid = w.chain[2]!
    const reason = entryBlockReason(mid.fromId)
    expect(reason).not.toBeNull()
    // 指向首段(眼下可去),不指向 mid 在路线上的前一段(它自己也被拦)
    expect(reason).toContain(w.chain[0]!.name)
    expect(reason).not.toContain(w.chain[1]!.name)
    expect(entryBlockReason(w.chain[0]!.fromId)).toBeNull()
    console.log(
      `\n「${mid.name}」被拒的理由:${reason}` +
        `\n它在路线上的前一段是「${w.chain[1]!.name}」,但那一段自己也进不去,` +
        '\n所以理由不提它 —— 一串「先通乙、乙要先通丙」正是这么来的'
    )
  })

  it('理由只对路线内的拦截给出:路线外仍用旧链那句话', () => {
    setActivePinia(createPinia())
    const adventure = useAdventureStore()
    adventure.unlocked = ['qingyun']
    adventure.cleared = []
    const w = ensureMortalWorld()!
    const inRoute = new Set(w.chain.map(p => p.fromId))
    const outsideLocked = REGIONS.find(r => !inRoute.has(r.id) && !adventure.unlocked.includes(r.id))!
    expect(canEnterRegion(outsideLocked.id)).toBe(false)
    expect(entryBlockReason(outsideLocked.id)).toBeNull()
    console.log(`\n路线外的「${outsideLocked.name}」仍走旧链话术,不与本世路线的理由混淆`)
  })
})

describe('路线可达性 · 锚点已可删除', () => {
  it('生成器不再需要 anchorRegionId,首段自由', () => {
    const firsts = new Set<string>()
    for (let i = 0; i < 12; i += 1) firsts.add(generateMortalWorld(i * 7919 + 3).chain[0]!.fromId)
    expect(firsts.size).toBeGreaterThan(1)
    console.log(
      `\n十二次生成出现 ${firsts.size} 种首段地界:${[...firsts].slice(0, 6).join('、')}…` +
        '\n锚点时期三世的首段全部是青云山麓,起手形状也被钉死;现在首段回到生成器手里'
    )
  })

  it('但首段层级仍只有两种取值 —— 骨架模板的既有局限,不是锚点残留', () => {
    const tiers = new Set<number>()
    for (let i = 0; i < 12; i += 1) tiers.add(generateMortalWorld(i * 104729 + 7).chain[0]!.tier)
    // 七种骨架的起点都是 2 或 3,jitterTiers 不扰动首点
    expect(tiers.size).toBeGreaterThan(1)
    expect(Math.max(...tiers)).toBeLessThanOrEqual(4)
    console.log(
      `\n十二次生成的首段层级:${[...tiers].sort((a, b) => a - b).join('、')} ——` +
        '\n首段**地界**已自由,但起步**层级**仍集中在 2~3。' +
        '\n这是骨架模板的既有局限(七种模板起点都在低位、首点不参与扰动),' +
        '\n不是锚点残留;要变需扩模板库,属生成器范畴'
    )
  })
})

/**
 * 本世之界的种子与跨世去重:同秒内连转须得不同种子;四门验收的 history 须含前几世,不止当前世界。
 * 故障注入:种子退回 `return second` → 前两条红;historyOf 退回 `cur ? [cur.seed] : []` → 第三条红。
 */
describe('本世之界 · 同一秒内的两次生成不能是同一方天地', () => {
  it('同一秒内连转两世,种子与骨架都不同', () => {
    // 冻住墙钟,否则两次 reroll 几乎不会落在同一秒
    vi.useFakeTimers()
    vi.setSystemTime(1_760_000_000_000)

    const w1 = rerollMortalWorld()!
    const w2 = rerollMortalWorld()!
    expect(w1, '第一世应生成成功').not.toBeNull()
    expect(w2, '第二世应生成成功').not.toBeNull()
    expect(w2.seed, '同一秒内的两次转世不能拿同一个种子').not.toBe(w1.seed)
    expect(skeletonOf(w2), '同一秒内的两次转世不能是同一方天地').not.toBe(skeletonOf(w1))
  })

  it('同秒三次生成,三颗种子两两不同', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_760_000_000_000)
    const seeds = [rerollMortalWorld()!, rerollMortalWorld()!, rerollMortalWorld()!].map(w => w.seed)
    expect(new Set(seeds).size, '三次生成三颗种子,不许撞').toBe(3)
  })

  it('同秒步进与验收门的候选链错开:步进取的不是 7919', () => {
    // generateGatedMortal 的候选序列是 baseSeed + t * 7919:步进须与 7919 互质,取 7919 只是平移进同一条链
    const src = readFileSync(new URL('./mortalWorldService.ts', import.meta.url), 'utf8')
    expect(src, '同秒步进必须与验收门的候选步长(7919)错开').toMatch(/SEED_STEP = 104729/)
  })
})

describe('本世之界 · 跨世去重真的接上了历史', () => {
  it('转世后换的一方天地,不能与上一世同一骨架', () => {
    const w1 = ensureMortalWorld()!
    const w2 = rerollMortalWorld()!
    expect(w1, '第一世应生成成功').not.toBeNull()
    expect(w2, '第二世应生成成功').not.toBeNull()
    expect(skeletonOf(w2), '转世后换的一方天地,不能与上一世同一骨架').not.toBe(skeletonOf(w1))
  })

  it('连续三世,种子两两不同且第三世不回到第一世的骨架', () => {
    const w1 = ensureMortalWorld()!
    const w2 = rerollMortalWorld()!
    const w3 = rerollMortalWorld()!
    expect(new Set([w1.seed, w2.seed, w3.seed]).size, '三世三颗种子,前世的种子不会原样重现').toBe(3)
    // 种子不同不等于世界不同,再钉骨架
    expect(skeletonOf(w3), '第三世不该回到第一世的骨架').not.toBe(skeletonOf(w1))
  })

  /**
   * 须读源码判:清空 history 时行为类用例仍全绿。
   * 故障注入:退回 `cur ? [cur] : []`,本用例红。
   */
  it('history 的原料是历世账本,不是当前世界', () => {
    const src = readFileSync(new URL('./mortalWorldService.ts', import.meta.url), 'utf8')
    expect(src, '历史必须由历世账本喂给验收门,不能只与当前世界去重').toMatch(
      /for \(const seed of ledger\.seeds\)/
    )
    expect(src, '不许退回 historyOf 只收当前世界的旧写法').not.toMatch(
      /for \(const seed of (cur \? \[cur\.seed\] : \[\]|\[cur\])\)/
    )
  })

  it('历史里的种子仍能原样重建那一世(账目对得上)', () => {
    const w1 = ensureMortalWorld()!
    rerollMortalWorld()
    // 种子是重建一世的唯一凭据
    const rebuilt = generateMortalWorld(w1.seed)
    expect(rebuilt.seed).toBe(w1.seed)
    expect(rebuilt.chain.length).toBe(w1.chain.length)
    expect(skeletonOf(rebuilt)).toBe(skeletonOf(w1))
  })
})

/**
 * 凝界不许压在建页那一帧上。
 *
 * 凝一界要试 3~9 个种子,每个候选跑 6 构筑 × 8 次 × 5 段的战斗审计 ——
 * 实测 112~468ms。原先它写在 `world` 那个 computed 里同步跑,进页时主线程直接卡这么久
 * (实测首帧 168~272ms,期间白屏无任何反馈)。
 *
 * 现改为:computed 只读 store 里已凝好的世界,凝界挪到挂载之后单独一拍,
 * 期间页面先渲染「凝界中」。实测骨架 28~55ms 即可见,世界在 182~404ms 内就绪。
 *
 * 故障注入:把 `ensureMortalWorld()` 写回 computed → 首条红。
 */
describe('凝界 · 不阻塞建页', () => {
  const VIEW = readFileSync(resolve(__dirname, '../views/MortalWorldView.vue'), 'utf-8')

  it('computed 只读已凝好的世界,不在里面现场生成', () => {
    const start = VIEW.indexOf('const view = computed(')
    expect(start, '找不到 view 这个 computed,判据会假绿').toBeGreaterThan(0)
    const end = VIEW.indexOf('})', start)
    const body = VIEW.slice(start, end)
    expect(body, 'computed 里又在现场凝界 —— 进页会卡这么久').not.toContain('ensureMortalWorld')
    expect(body, 'computed 该只读 store', ).toContain('adventure.mortalWorld')
  })

  it('凝界改在挂载之后跑,且先让「凝界中」画出来', () => {
    expect(VIEW, '凝界该挪到 onMounted').toMatch(/onMounted\(async \(\) => \{/)
    expect(VIEW, '凝界前要先让状态真的画出来').toContain('requestAnimationFrame')
    // 模板里要有「凝界中」这一档,且与「此世未成」分开
    expect(VIEW, '生成期间要有可读状态').toContain('凝界中')
    expect(VIEW, '「此世未成」仍是生成失败那一档,不该被挪作他用').toContain('此世未成')
    const tpl = VIEW.slice(0, VIEW.lastIndexOf('</template>'))
    expect(tpl, '凝界中该排在「此世未成」之前 —— 否则生成期间显示的是「未成」').toMatch(
      /凝界中[\s\S]*此世未成/
    )
  })

  it('已经凝好过就不再重复凝', () => {
    const m = /onMounted\(async \(\) => \{([\s\S]*?)\n  \}\)/.exec(VIEW)
    expect(m, '找不到挂载钩子,判据会假绿').not.toBeNull()
    expect(m![1], '挂载时该先看 store 里有没有').toContain('adventure.mortalWorld')
  })
})
