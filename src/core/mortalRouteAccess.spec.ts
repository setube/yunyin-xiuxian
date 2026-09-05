/* eslint-disable no-console */
/**
 * 本世路线可达性审计
 *
 * 锚点被实测证明是体验污染源:三世的首段全部是青云山麓,
 * 起手路线形状也被钉死。根因不在表现层 ——
 * **旧 REGIONS 解锁链仍握有路线准入权。**
 *
 * 本轮把准入权迁到 mortalWorld.route,并验证同一条原则在各种状态下都成立:
 *
 *   **本世路线决定本世可达性。**
 *
 * 判据不是「首段不是锁着的」,而是:
 * **新号在不依赖任何旧区域解锁状态的情况下,能否完整走完随机生成的路线。**
 *
 * 另有一条必须写进测试的约束:按 route index 开放,**不按 tier**。
 * 生成器允许 `3 → 9 → 7 → 14 → 11` 这类回落,若按层级判定,
 * 第 7 段会因为层级低于前一段而被判为早该开放,直接与路线顺序矛盾。
 * 层级是路线的特征,不是解锁顺序。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { advanceRoute, canEnterNode, canEnterRegion, ensureMortalWorld, entryBlockReason, isNodeCleared, rerollMortalWorld } from './mortalWorldService'
import { generateMortalWorld } from './mortalWorldGen'
import { useAdventureStore } from '@/stores/adventure'
import { REGIONS, regionDef } from '@/data/regions'
import { startExploration } from './exploration'

function regionName(id: string): string {
  return regionDef(id)?.name ?? id
}

beforeEach(() => {
  setActivePinia(createPinia())
})

/** 从头走完整条路线,返回每一步的可达性读数 */
function walkRoute(): { step: number; name: string; couldEnter: boolean }[] {
  const adventure = useAdventureStore()
  const w = adventure.mortalWorld!
  const out: { step: number; name: string; couldEnter: boolean }[] = []
  for (const [i, p] of w.chain.entries()) {
    out.push({ step: i + 1, name: p.name, couldEnter: canEnterNode(p.nodeId) })
    // 通过这一段,下一段才该开
    advanceRoute(p.fromId)
  }
  return out
}

describe('路线可达性 · 新号', () => {
  it('新号不依赖任何旧解锁状态即可走完整条路线', () => {
    const adventure = useAdventureStore()
    // 关键:把旧解锁链清空,证明路线不再依赖它
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
    // 一步都没走
    expect(canEnterNode(w.chain[0]!.nodeId)).toBe(true)
    for (let i = 1; i < w.chain.length; i += 1) {
      expect(canEnterNode(w.chain[i]!.nodeId)).toBe(false)
    }
    console.log(`\n首段可进,其余 ${w.chain.length - 1} 段上锁 —— 探索顺序未被破坏`)
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
    // 找一条带回落的路线(后一段层级低于前一段)
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

    // 按 tier 判定的话,这一段「层级更低」会被误判为早该开放
    expect(canEnterNode(world!.chain[dipIndex]!.nodeId)).toBe(false)
    // 走到它的前一段才开
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
    // 按层级升序排出来的顺序,与路线顺序不同
    const byTier = [...world!.chain].sort((a, b) => a.tier - b.tier).map(p => p.nodeId)
    const byRoute = world!.chain.map(p => p.nodeId)
    expect(byTier).not.toEqual(byRoute)
    // 而可达性只跟路线顺序走
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
    // 旧解锁状态不影响路线:首段可进,其余待通
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
    // 节点 id 含段序,故同一 region 在不同段是不同节点
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
    // 旧解锁链正常:青云山麓已开
    adventure.unlocked = ['qingyun']
    adventure.cleared = []
    const w = ensureMortalWorld()!
    const inRoute = new Set(w.chain.map(p => p.fromId))

    // 找一处已解锁、但不在本世路线里的地界
    const outsider = adventure.unlocked.find(id => !inRoute.has(id))
    if (!outsider) {
      // 青云山麓恰好被抽进路线时换一处已解锁的
      adventure.unlocked = [...adventure.unlocked, 'luoxia']
    }
    const outside = adventure.unlocked.find(id => !inRoute.has(id))!
    expect(inRoute.has(outside)).toBe(false)

    // 曾经这里返回 false:本世之界一生成,诸界总览十四处全部点不动
    expect(startExploration(outside, 'normal')).toBe(true)
    adventure.setSession(null)
    console.log(
      `\n本世路线含 ${inRoute.size} 处;路线外的「${regionName(outside)}」仍可出发` +
        '\n—— 本世路线是主线,旧地图不该被它锁死'
    )
  })

  it('路线外的地界仍受旧解锁链约束,不是全开', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = ['qingyun']
    adventure.cleared = []
    const w = ensureMortalWorld()!
    const inRoute = new Set(w.chain.map(p => p.fromId))
    // 既不在路线里、旧链也没开的地界,仍然进不去
    const locked = REGIONS.find(r => !inRoute.has(r.id) && !adventure.unlocked.includes(r.id))!
    expect(startExploration(locked.id, 'normal')).toBe(false)
    console.log(`\n「${locked.name}」既不在本世路线、旧链也未开 → 仍进不去`)
  })

  it('路线只追加可达性,不收回旧链已给出的权限', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = REGIONS.map(r => r.id)
    adventure.cleared = []
    const w = ensureMortalWorld()!
    // 路线中段:旧链已开,故仍可进 —— 路线不没收既有权限
    expect(startExploration(w.chain[1]!.fromId, 'normal')).toBe(true)
    adventure.setSession(null)
    // 路线外的地界:旧链开了就能进
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
 * 界面与守卫必须共用同一个准入谓词,且任何状态下都走得动。
 *
 * 两次玩家反馈把这条不变量逼了出来:
 *
 * 1.「显示了进入按钮但依旧进不去」—— 判据分了两份:地图按钮读
 *    adventure.unlocked,守卫在地界属于本世路线时只看 canEnterNode。
 * 2.「进甲要先解锁乙,进乙要先解锁丙」—— 把界面改成服从守卫之后,
 *    路线内「只认段序」的语义暴露出更严重的后果:新号旧链只开一处,
 *    而路线首段常排在地界表靠后、被按旧链截断的可见范围挡住,
 *    实测**整页 0 个出发按钮**;拦截理由又指向同样被拦的前一段,
 *    连成一串推诿。
 *
 * 所以这里钉两条:
 *   **凡是界面给出出发按钮的地界,守卫都必须放行。**
 *   **任何存档状态下,至少有一处地界可进。**
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
    // 玩家反馈「进甲要先解锁乙,进乙要先解锁丙」的根因就是这条不成立:
    // 新号旧链只开一处时实测 0 个出发按钮
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
    // 上一条若只统计「可进的地界数」会得出旧语义也没问题的错误结论 ——
    // 路线首段在旧语义下**是可进的**,只是被历练页按旧链截断的可见范围挡住了。
    // 死锁出在可见性,不在谓词,所以这里必须照着视图的算法数**可见的按钮**。
    const OPEN = 1
    // 死锁的成立条件比「首段靠后」更严格:旧链开着的那几处必须**全是**
    // 路线成员且都还没轮到,此时它们在旧语义下逐个被路线拦住,
    // 而路线首段又在可见范围之外 —— 于是一个能点的都不剩
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
    // 关键:指向首段(眼下可去),而不是 mid 在路线上的前一段(它自己也被拦着)
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
    // 锚点存在的唯一理由是「首段必须进得去」;可达性迁移后前提消失
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
    // 七种骨架的起点都是 2 或 3,且 jitterTiers 刻意不扰动首点
    //(首点决定「这一世从多深处起步」,乱动会破坏低起点的手感)
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
