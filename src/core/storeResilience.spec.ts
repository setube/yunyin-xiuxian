import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia, type Store } from 'pinia'
import type { BondState } from '@/core/daoluService'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { usePacingTelemetry } from '@/stores/pacingTelemetry'
import { useLoreStore } from '@/stores/lore'
import { useResourcesStore } from '@/stores/resources'
import { useMarketStore } from '@/stores/market'
import { useEndgameStore } from '@/stores/endgame'
import { useInventoryStore } from '@/stores/inventory'
import { EQUIP_COUNTER_MAX } from '@/data/constants'
import { useApprenticeStore } from '@/stores/apprentice'
import { sanitizeOfflineInputs } from './offline'

/**
 * store 清单从源码倒推(手写清单漏补时静默少测):
 * 一 ?raw 读 store 源码,调过 persistConfig('x') 的即持久化 store;
 * 二 从整模块取其 useXxxStore 导出,取不到说明命名变了(当红)。
 */
const STORE_SRC = import.meta.glob('../stores/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const STORE_MODULES = import.meta.glob('../stores/*.ts', { eager: true }) as Record<string, Record<string, unknown>>

interface StoreEntry {
  name: string
  file: string
  /** 该分片的存档键(persistConfig 的实参) */
  slice: string
  use: () => Store & { sanitize?: () => void }
}

function persistedStores(): StoreEntry[] {
  const out: StoreEntry[] = []
  for (const [file, src] of Object.entries(STORE_SRC)) {
    if (file.endsWith('.spec.ts')) continue
    const slice = /persistConfig\(\s*'([a-zA-Z]+)'\s*\)/.exec(src)?.[1]
    if (!slice) continue
    const mod = STORE_MODULES[file]
    out.push({ name: file.split('/').pop()!.replace('.ts', ''), file, slice, use: storeExportOf(mod ?? {}) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** 找出模块里取 store 的导出:命名不统一,凡 useXxx 函数都试调,返回带 $id 的 pinia store 即是 */
function storeExportOf(mod: Record<string, unknown>): () => Store & { sanitize?: () => void } {
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value !== 'function' || !/^use[A-Z]/.test(name)) continue
    try {
      setActivePinia(createPinia())
      const store = (value as () => Store)()
      if (store && typeof store === 'object' && typeof store.$id === 'string') {
        return value as () => Store & { sanitize?: () => void }
      }
    } catch {
      // 非 store 的 composable
    }
  }
  return () => ({ $id: '' }) as unknown as Store & { sanitize?: () => void }
}

const PERSISTED = persistedStores()

/** 有 sanitize 的持久化 store:韧性用例按此清单跑 */
const STORES = PERSISTED.filter(s => {
  setActivePinia(createPinia())
  return typeof s.use().sanitize === 'function'
}).map(s => ({ name: s.name, use: s.use as () => Store & { sanitize: () => void } }))

describe('坏档韧性 · 清单从源码倒推', () => {
  it('每个持久化 store 都取得到,且都写了 sanitize', () => {
    expect(PERSISTED.length, '一个持久化 store 都没扫到,断言形同虚设').toBeGreaterThan(8)
    for (const s of PERSISTED) {
      setActivePinia(createPinia())
      const store = s.use()
      expect(store.$id, `${s.file} 里找不到 store 导出(导出名是否改过?)`).toBeTruthy()
      expect(
        typeof store.sanitize,
        `${s.file} 落了盘却没有 sanitize —— 这一片坏档时没人兜(用例也永远测不到它)`
      ).toBe('function')
    }
  })

  it('清单与存档分片对得上:每个持久化 store 的键都真在存档范围里', () => {
    for (const s of PERSISTED) {
      expect(s.slice, `${s.file} 的分片键没解析出来`).toMatch(/^[a-zA-Z]+$/)
    }
    const keys = PERSISTED.map(s => s.slice).sort()
    expect(new Set(keys).size, `两个 store 共用同一个分片键:${keys.join('、')}`).toBe(keys.length)
  })

  it('遥测:events 被写坏后,sanitize 修形,record 仍能继续记', () => {
    // record() 直接对 events 调 slice,分片写坏时每次记录都抛错
    setActivePinia(createPinia())
    const t = usePacingTelemetry()
    t.$patch({
      events: [{ type: 'x', kind: 'modal', label: '好的那条', at: 1 }, null, { at: 'x' }, { type: 'y', kind: '乱写' }] as never,
      enabled: 'yes' as never
    })
    t.sanitize()
    expect(t.events.map(e => e.label), '只该留下形状完整的那条').toEqual(['好的那条'])
    expect(t.enabled).toBe(true)
    t.record('enlightenment', 'modal', '顿悟')
    expect(t.events.length, '修形之后仍要能继续记录').toBe(2)
  })

  it('读档兜底清单亲自修平遥测:坏掉的 pacing 分片经 sanitizeOfflineInputs 归零', () => {
    // 读档口:engine.start → sanitizeOfflineInputs
    setActivePinia(createPinia())
    const t = usePacingTelemetry()
    t.$patch({ events: null as never, enabled: 'yes' as never })
    sanitizeOfflineInputs()
    expect(t.events, '读档兜底清单必须覆盖 pacing,把 null 修回空数组').toEqual([])
    expect(t.enabled).toBe(true)
    t.record('enlightenment', 'modal', '顿悟')
    expect(t.events.length, '修形之后仍要能继续记录').toBe(1)
  })

  it('装备见闻:条目形状烂掉就整条丢掉,不冒充「见过一件凡品 · 0 阶」', () => {
    setActivePinia(createPinia())
    const lore = useLoreStore()
    lore.$patch({
      equipLore: { good: { q: 3, t: 9, u: 1 }, nullq: { q: null, t: 2 }, text: 'nope', half: { q: 1 }, badu: { q: 1, t: 2, u: 9 } } as never
    })
    lore.sanitize()
    expect(Object.keys(lore.equipLore).sort(), '只该留下形状完整的条目').toEqual(['badu', 'good'])
    expect(lore.equipSeen('good')).toEqual({ q: 3, t: 9, u: 1 })
    expect(lore.equipSeen('badu')!.u, 'u 只认 1,别的值一律归零').toBe(0)
  })
})

describe('坏档韧性 · 每个字段被抹掉后 sanitize 都要跑得完', () => {
  for (const { name, use } of STORES) {
    it(`${name}:逐个字段灌 undefined,不炸且仍可序列化`, () => {
      setActivePinia(createPinia())
      const keys = Object.keys(use().$state)
      expect(keys.length, `${name} 取不到持久化字段,断言形同虚设`).toBeGreaterThan(0)

      const failures: string[] = []
      for (const key of keys) {
        setActivePinia(createPinia())
        const store = use()
        try {
          store.$patch({ [key]: undefined } as never)
          store.sanitize()
          JSON.stringify(store.$state)
          // 白屏发生在渲染期读 computed:把 store 上每个非函数属性都读一遍
          for (const prop of Object.keys(store)) {
            const v = (store as unknown as Record<string, unknown>)[prop]
            if (typeof v === 'function') continue
            try {
              JSON.stringify(v)
            } catch {
              // 循环引用不算坏档;只为触发 computed 求值
            }
          }
        } catch (e) {
          failures.push(`${key}: ${(e as Error).message}`)
        }
      }
      expect(failures, `${name}.sanitize 在这些字段缺失时会抛错:\n${failures.join('\n')}`).toEqual([])
    })
  }
})

/**
 * 恶意值:形状对、内容是垃圾。
 *
 * **有限极大值同样算恶意**:`1e300` 与 `Number.MAX_VALUE` 都能过
 * `Number.isFinite`,于是「只挡非有限」的守卫对它们一路放行,
 * 界面再经 formatNum 印成「1.00e300」。实测 resources.qi/wudao 与
 * endgame.daoSource 三条就是这样原样通过的 —— 补进这一组后当场暴露。
 */
const HOSTILE: unknown[] = [
  null,
  0,
  -1,
  NaN,
  '',
  'x',
  [],
  {},
  [null],
  { a: null },
  true,
  [{ uid: null }],
  1e300,
  Number.MAX_VALUE
]

describe('坏档韧性 · 恶意值也不该炸', () => {
  for (const { name, use } of STORES) {
    it(`${name}:每个字段灌一遍恶意值,sanitize + 计算属性都不许抛`, () => {
      setActivePinia(createPinia())
      const keys = Object.keys(use().$state)

      const failures: string[] = []
      for (const key of keys) {
        for (const hostile of HOSTILE) {
          setActivePinia(createPinia())
          const store = use()
          try {
            store.$patch({ [key]: hostile } as never)
            store.sanitize()
            for (const prop of Object.keys(store)) {
              const v = (store as unknown as Record<string, unknown>)[prop]
              if (typeof v === 'function') continue
              try {
                JSON.stringify(v)
              } catch {
                // 循环引用不算坏档
              }
            }
          } catch (e) {
            failures.push(`${key} = ${JSON.stringify(hostile) ?? String(hostile)} → ${(e as Error).message}`)
          }
        }
      }
      expect(failures, `${name} 在这些恶意值下会抛错:\n${[...new Set(failures)].join('\n')}`).toEqual([])
    })
  }
})

/**
 * 第二条:被修回来的值还得是「有限且不离谱」。
 *
 * 上面那条只要求「不抛」——`1e300` 原样躺在 state 里同样不抛,
 * 于是 `resources.qi` / `resources.wudao` / `endgame.daoSource` 三条
 * 一直没被发现。它们的界面读数会印成「1.00e300」。
 *
 * 判据:灌一遍恶意值后,store.$state 里**每个数字**都必须是有限数;
 * 若某个字段原本是资源读数,还要求它不超过一个宽到不可能误伤的上界。
 * 这里只查数字类型 —— 字符串/数组/对象的合法性由各 store 自己的用例管。
 */
describe('坏档韧性 · 修回来的数字不许是有限巨值', () => {
  /**
   * 宽到不可能误伤。取 1e17 是因为 `player.lifespanBonusYears` 的**正当上界**
   * 就是 1.0125e16(一千万年),首版取 1e16 把它误判成超量级 —— 那是一个
   * 健康的封顶值,不是坏档。仍然远低于 `1e300` 那个量级,拦得住真正的巨值。
   */
  const SANE_NUMBER = 1e17

  for (const { name, use } of STORES) {
    it(`${name}:灌恶意值后,state 里的数字都有限且不离谱`, () => {
      setActivePinia(createPinia())
      const keys = Object.keys(use().$state)
      const bad: string[] = []
      /*
       * 只查**原本就是数字**的字段。
       *
       * 灌 `NaN` 给一个对象字段(regionEvent / secretRealm 等)时,
       * `store.$state` 里那个键会整个变成 NaN —— 那不是「没修回来」,
       * 是这条判据在拿对象字段当数字量。对象的合法性由各 store 自己的用例管。
       */
      setActivePinia(createPinia())
      const numericKeys = keys.filter(k => typeof (use().$state as unknown as Record<string, unknown>)[k] === 'number')
      for (const key of numericKeys) {
        for (const hostile of HOSTILE) {
          setActivePinia(createPinia())
          const store = use()
          store.$patch({ [key]: hostile } as never)
          store.sanitize()
          const after = (store.$state as unknown as Record<string, unknown>)[key]
          if (typeof after !== 'number') continue
          if (!Number.isFinite(after)) bad.push(`${key} = ${String(hostile)} → ${after}`)
          else if (Math.abs(after) > SANE_NUMBER) bad.push(`${key} = ${String(hostile)} → ${after}(超量级)`)
        }
      }
      expect(bad, `${name} 有字段没被修回来:\n${[...new Set(bad)].slice(0, 6).join('\n')}`).toEqual([])
    })
  }
})

/** 小数资源与道源这几条有明确上界,单独钉死 */
describe('坏档韧性 · 复杂状态的值也要修回来(不只是"不炸")', () => {
  it('道侣:三维夹回 0~100、坏 id 作废、坏意图整块丢掉', () => {
    setActivePinia(createPinia())
    const player = usePlayerStore()
    const bad = {
      daoluId: 'dl_qingli',
      stage: 'nope',
      fate: 999,
      trust: NaN,
      accord: -5,
      shared: -3,
      metAt: -1,
      fallen: 'x',
      doneEvents: ['be_relic', 42],
      opportunities: -2,
      nextEventAt: NaN,
      intent: { wish: 1, sparks: 'bad' }
    } as unknown as BondState
    player.$patch({ bond: bad })
    player.sanitize()
    const b = player.bond!
    expect(b.fate).toBe(100)
    expect(b.trust).toBe(0)
    expect(b.accord).toBe(0)
    expect(b.stage).toBe('met')
    expect(b.shared).toBe(0)
    expect(b.doneEvents).toEqual(['be_relic'])
    expect(b.intent).toBeNull()
    expect(b.fallen).toBe(false)

    player.$patch({ bond: { ...b, daoluId: 'dl_nope' } as unknown as BondState })
    player.sanitize()
    expect(player.bond).toBeNull()
  })

  it('寿元加算:非数字被修回 0,坏档不再把 lifespanMax 烧成 NaN', () => {
    // lifespanMax 为 NaN 时引擎判据 `age < lifespanMax` 恒假,下一拍即「大限已至」
    setActivePinia(createPinia())
    const player = usePlayerStore()
    player.$patch({ lifespanBonusYears: 'abc' } as never)
    player.sanitize()
    expect(player.lifespanBonusYears).toBe(0)
    expect(Number.isFinite(player.lifespanMax)).toBe(true)
    expect(player.lifespanMax).toBeGreaterThan(0)

    player.$patch({ lifespanBonusYears: NaN } as never)
    player.sanitize()
    expect(player.lifespanBonusYears).toBe(0)
    expect(Number.isFinite(player.lifespanMax)).toBe(true)

    // 合法延寿值不被误伤
    player.$patch({ lifespanBonusYears: 200 } as never)
    player.sanitize()
    expect(player.lifespanBonusYears).toBe(200)
  })

  /**
   * dead 只认严格 true:字符串 "false" 与数字 1 都是真值。
   * 判死会让在线收益整拍跳过、离线结算整段返回 null、主页常驻「陨落」—— 一份写坏的布尔钉死整局。
   */
  it('身故标记只认严格 true:数字型布尔不再把整局判死', () => {
    setActivePinia(createPinia())
    const player = usePlayerStore()
    for (const hostile of ['false', 1, 'x', []] as unknown[]) {
      setActivePinia(createPinia())
      const p2 = usePlayerStore()
      p2.$patch({ dead: hostile } as never)
      p2.sanitize()
      expect(p2.dead, `dead = ${JSON.stringify(hostile)} 被当成真值,整局会判死`).toBe(false)
    }
    // 真正的身故档不受这次收紧影响
    setActivePinia(createPinia())
    const dead = usePlayerStore()
    dead.$patch({ dead: true } as never)
    dead.sanitize()
    expect(dead.dead, '真身故档被修成活着,死亡提示与转世入口会消失').toBe(true)
    // 对照:player 已能正确读回
    expect(player.dead).toBe(false)
  })

  it('道号:坏档写成数字时修回空串,拼接与 trim 不再抛', () => {
    setActivePinia(createPinia())
    const player = usePlayerStore()
    player.$patch({ name: 42 } as never)
    player.sanitize()
    expect(typeof player.name).toBe('string')
    expect(() => player.name.trim()).not.toThrow()
  })

  it('道童:坏羁绊夹回非负整数,老档缺 bond 补 0', () => {
    setActivePinia(createPinia())
    const a = useApprenticeStore()
    a.$patch({
      apprentices: [
        { uid: 'b1', archId: 'ap_luanniao', level: 1, bond: NaN, task: null },
        { uid: 'b2', archId: 'ap_youxia', level: 1, bond: -5, task: null },
        { uid: 'b3', archId: 'ap_daotong', level: 1, task: null }
      ] as never
    })
    a.sanitize()
    expect(a.apprentices).toHaveLength(3)
    expect(a.apprentices.find(x => x.uid === 'b1')!.bond, 'NaN 夹回 0').toBe(0)
    expect(a.apprentices.find(x => x.uid === 'b2')!.bond, '负值夹回 0').toBe(0)
    expect(a.apprentices.find(x => x.uid === 'b3')!.bond, '老档缺 bond 补 0').toBe(0)
  })

  it('资源:负数/NaN 被夹回 0,合法正数不因守卫被误伤', () => {
    // 写入路径(addSmall/setQi)以 Math.max(0, …) 兜底,负数只来自坏档,sanitize 须一并归零
    setActivePinia(createPinia())
    const r = useResourcesStore()
    r.qi = -50
    r.wudao = -3
    // 灵草五品账:坏值逐品夹回 0
    r.herbByGrade = { 1: NaN, 2: -3, 3: 7, 4: 'x', 5: Infinity } as never
    r.ore = 7
    r.sanitize()
    expect(r.qi).toBe(0)
    expect(r.wudao).toBe(0)
    expect(r.herbOf(1)).toBe(0)
    expect(r.herbOf(2)).toBe(0)
    expect(r.herbOf(3)).toBe(7)
    expect(r.herbOf(4)).toBe(0)
    expect(r.herbOf(5)).toBe(0)
    expect(r.ore).toBe(7)
  })
})

describe('坏档韧性 · 活状态(引擎每 tick 都读的那些)', () => {
  it('历练会话:区域认不得或时间戳坏了就结束会话,不硬撑', () => {
    setActivePinia(createPinia())
    const adventure = useAdventureStore()
    adventure.$patch({
      session: { regionId: 'nope', mode: 'normal', startedAt: 1, endsAt: 2, nextBattleAt: 3, wins: -1, losses: NaN, events: -5, stoneGain: {}, expGain: {}, itemGain: -2 }
    } as never)
    adventure.sanitize()
    expect(adventure.session).toBeNull()

    adventure.$patch({
      session: { regionId: 'qingyun', mode: '怪', startedAt: -1, endsAt: NaN, nextBattleAt: 3, wins: -1, losses: 2.7, events: -5, stoneGain: {}, expGain: {}, itemGain: -2 }
    } as never)
    adventure.sanitize()
    expect(adventure.session).toBeNull()
  })

  it('历练会话:stoneGain/expGain 损坏(null/裸数字)被 gn() 归一,不再让首胜崩', () => {
    setActivePinia(createPinia())
    const adventure = useAdventureStore()
    // null 须归一为 GNum:否则首胜 add(null,…) 抛 TypeError,被 tickSafe 吞掉后历练永久卡死
    adventure.$patch({
      session: { regionId: 'qingyun', mode: 'normal', startedAt: 1, endsAt: 2, nextBattleAt: 3, wins: 0, losses: 0, events: 0, stoneGain: null, expGain: null, itemGain: 0 }
    } as never)
    adventure.sanitize()
    expect(adventure.session).not.toBeNull()
    expect(adventure.session!.stoneGain).toEqual({ m: 0, e: 0 })
    expect(adventure.session!.expGain).toEqual({ m: 0, e: 0 })

    // 裸数字也归一成 GNum
    adventure.$patch({
      session: { regionId: 'qingyun', mode: 'normal', startedAt: 1, endsAt: 2, nextBattleAt: 3, wins: 0, losses: 0, events: 0, stoneGain: 123, expGain: 456, itemGain: 0 }
    } as never)
    adventure.sanitize()
    expect(adventure.session!.stoneGain.m).toBeCloseTo(1.23, 10)
    expect(adventure.session!.expGain.m).toBeCloseTo(4.56, 10)
  })

  it('区域动态事件:endsAt 坏了就清掉(否则要么永不失效要么当场失效)', () => {
    setActivePinia(createPinia())
    const player = usePlayerStore()
    player.$patch({ regionEvent: { regionId: 'qingyun', eventId: 'yaochao', endsAt: NaN } } as never)
    player.sanitize()
    expect(player.regionEvent).toBeNull()
  })
})

describe('坏档韧性 · 新增持久化分片已挂进读档兜底清单', () => {
  it('坊市货架由 sanitizeOfflineInputs 修平:坏 pillId 的格被丢弃,不再因 renderSlot 白屏', () => {
    setActivePinia(createPinia())
    const market = useMarketStore()
    market.$patch({
      stock: [{ kind: 'pill', idx: 0, pillId: 'p_nope', count: 1, price: { m: 1, e: 0 }, sold: false }],
      stockedAt: Date.now()
    })
    sanitizeOfflineInputs()
    expect(market.stock, '坏 pillId 的货格应被修掉,renderSlot 才不致 undefined.name').toEqual([])
  })
})

/*
 * 坏档韧性 · 毒化之后不许残留负数
 *
 * 上两类用例分别在验「不炸」与「单个字段修回来」。它们漏掉的是**跨字段的口径不一致**:
 * 同一个 sanitize 里,几个同类字段都写了下限,只有某一个漏了 —— 逐个读很难看出来。
 *
 * 这条把每个持久化 store 的全部数值字段一次性毒化成 -999,过一遍 sanitize,
 * 再扫残留的负数。两个真实缺陷就是这么抓到的(player.lifespanBonusYears 与
 * dongfu.frac:前者让寿元上限算出 -849,后者让灵田余数要加满 999 才产出)。
 *
 * 排除项:少数字段的负数是**有意义**的,列在 NEGATIVE_OK 里并写明理由 ——
 * 不做白名单就会逼着把哨兵值改掉。
 */
const NEGATIVE_OK: Record<string, string[]> = {
  // 哨兵:-1 表示「尚未镇压过任何区域」,suppressionProgress 靠它区分「老档无此字段」与「真没镇压过」
  player: ['suppressLife']
}

/** 把一份 state 里的所有有限数字改成 -999(保留字符串/布尔/结构形状) */
function poisonNumbers(v: unknown, depth = 0): unknown {
  if (depth > 6) return v
  if (typeof v === 'number') return -999
  if (Array.isArray(v)) return v.map(x => poisonNumbers(x, depth + 1))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = poisonNumbers(x, depth + 1)
    return out
  }
  return v
}

/**
 * 递归收集负的有限数字,路径写成 a.b[0].c。
 *
 * GNum(`{m,e}`)整块跳过:它的 m/e 可以为负(表示极小的量),`toNum` 会算出 0 附近的值,
 * 那不是「玩家看到的负数」。毒化后 exp 会规范化成 `{m:-9.99, e:-997}` 就是这种情形。
 */
function isGNum(v: unknown): v is { m: number; e: number } {
  return !!v && typeof v === 'object' && !Array.isArray(v) && 'm' in v && 'e' in v &&
    typeof (v as { m: unknown }).m === 'number' && typeof (v as { e: unknown }).e === 'number'
}

function collectNegatives(v: unknown, path: string, out: string[], depth = 0): void {
  if (depth > 6) return
  if (typeof v === 'number') {
    if (Number.isFinite(v) && v < 0) out.push(path)
    return
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => collectNegatives(x, `${path}[${i}]`, out, depth + 1))
    return
  }
  if (v && typeof v === 'object') {
    if (isGNum(v)) return
    for (const [k, x] of Object.entries(v)) collectNegatives(x, `${path}.${k}`, out, depth + 1)
  }
}

describe('坏档韧性 · 毒化之后不许残留负数', () => {
  for (const { name, use } of STORES) {
    it(`${name}:全部数字灌成 -999 后,sanitize 不许留下负值`, () => {
      setActivePinia(createPinia())
      const store = use()
      store.$patch(poisonNumbers(JSON.parse(JSON.stringify(store.$state ?? {}))) as never)
      store.sanitize()
      const negatives: string[] = []
      collectNegatives(store, '', negatives)
      const allowed = NEGATIVE_OK[name] ?? []
      const bad = negatives.filter(path => !allowed.some(a => path.split('.').includes(a)))
      expect(bad, `${name} 在毒化之后残留了负值(界面会把它印给玩家看):\n${bad.join('\n')}`).toEqual([])
    })
  }
})

/**
 * 坏档韧性 · 毒成「有限的巨大值」之后不许残留天文数字
 *
 * 上一条毒的是 -999,它只压到「下界」那一侧。而 `Number.isFinite` 挡不住**上界**:
 * 坏档写 `age: 1e300` / `createdAt: 8640000000000001` 都是有限数,一路通过
 * `asFiniteNumber`,再被渲染成 `1.00e300 载`、`NaN月NaN日`、`Invalid Date`。
 *
 * 这一条把每个持久化 store 的全部数值字段一次毒成 `Number.MAX_VALUE`,过 sanitize,
 * 再扫「仍然天文数字」的残留。判据的阈值放过 GNum(它本来就按指数存大数)
 * 与少数**合法**的大数值字段(列在 HUGE_OK 里并写明理由)。
 */
const HUGE_LIMIT = 1e15

/**
 * 这些字段本来就允许很大,列出来并写明理由 —— 不做白名单会逼着把真实设计改掉。
 *
 * 资源类(qi / ore / page / dust / wudao / daoSource)与修为:它们是玩家的存量,
 * 走 `formatGN` 渲染,而 formatGN 对超出单位表的量级有**有意的**科学计数兜底
 * (`1.80e308`),AGENTS.md 记着这一条。喂给它们的坏值不会崩、不会印 NaN,
 * 只是显示成科学计数 —— 与「时间戳坏成不了日期」不是一回事。
 * 上一段毒化以外的东西(refund/rounds 之类计数)由各自的 spec 负责。
 */
const HUGE_OK: Record<string, string[]> = {
  /*
   * lifespanBonusYears / age:上界是 lifespanOf(MAX_MAJOR) × 10 ≈ 1.01e16,
   * 这个数**本身就是设计上限**(最高境界寿元的一万倍),不是残留 —— 判据要放过它。
   * 真实游玩到不了,但它是被 sanitize 明确夹到这里的,不是漏网。
   */
  player: ['exp', 'lifespanBonusYears', 'age'],
  resources: ['qi', 'ore', 'page', 'dust', 'wudao', 'spiritStone', 'herbByGrade'],
  endgame: ['daoSource'],
  game: [],
  lore: ['skillExp'],
  // 极端值下 age/lifespanBonusYears 会被夹回开局值,这里不该再剩
  dongfu: [],
  settings: []
}

/** 把一份 state 里的所有有限数字改成 Number.MAX_VALUE(保留字符串/布尔/结构形状) */
function inflateNumbers(v: unknown, depth = 0): unknown {
  if (depth > 6) return v
  if (typeof v === 'number') return Number.MAX_VALUE
  if (Array.isArray(v)) return v.map(x => inflateNumbers(x, depth + 1))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = inflateNumbers(x, depth + 1)
    return out
  }
  return v
}

/** 递归收集「仍然大得不像话」的有限数字 */
function collectHuge(v: unknown, path: string, out: string[], depth = 0): void {
  if (depth > 6) return
  if (typeof v === 'number') {
    if (Number.isFinite(v) && Math.abs(v) > HUGE_LIMIT) out.push(`${path}=${v}`)
    return
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => collectHuge(x, `${path}[${i}]`, out, depth + 1))
    return
  }
  if (v && typeof v === 'object') {
    if (isGNum(v)) return
    for (const [k, x] of Object.entries(v)) collectHuge(x, `${path}.${k}`, out, depth + 1)
  }
}

describe('坏档韧性 · 毒成有限巨值之后不留天文数字', () => {
  for (const { name, use } of STORES) {
    it(`${name}:全部数字灌成 MAX_VALUE 后,sanitize 不许留下天文数字`, () => {
      setActivePinia(createPinia())
      const store = use()
      store.$patch(inflateNumbers(JSON.parse(JSON.stringify(store.$state ?? {}))) as never)
      store.sanitize()
      const huge: string[] = []
      /*
       * 只扫 `$state`,不扫整个 store —— 后者会走进 Pinia 内部的 `_p` / `_hmrPayload`,
       * 那里装着 **computed getter 的缓存**(realm.lifespanYears、qiCapValue、finalStats…)。
       * 那些是从坏输入算出来的派生值,不是持久化状态;把它们算进来等于要求「坏输入也别把算式算大」,
       * 而真正的判据是「存下来的字段有没有被修好」。
       */
      collectHuge(JSON.parse(JSON.stringify(store.$state ?? {})), '', huge)
      const allowed = HUGE_OK[name] ?? []
      const bad = huge.filter(p => !allowed.some(a => p.split('=')[0]!.split('.').includes(a)))
      expect(bad, `${name} 在灌成巨值之后残留了天文数字(界面会把它印给玩家看):\n${bad.join('\n')}`).toEqual([])
    })
  }
})

/**
 * 三条具体字段的上界 —— 都是审查意见指出的,而且**首版的修法各错一处**。
 *
 * 一 **灵气上界不能凭感觉取**。最高境界的气海实测 `qiCap(MAX_MAJOR, maxSub) = 1.172e16`,
 *    乘 `QI_BANK_MULT = 10` 的积余是 **1.172e17** —— 正常存档能到这么高。
 *    首版取 1e15,会把后期玩家的有效灵气清零。
 * 二 **道源越界要归零,不是夹到上界**。夹到 1e9 等于凭空送十亿道源,
 *    而道源可以直接花掉(熔炉、器魂)。
 * 三 **灵草分账同样要上界**。首版只改了小数资源,漏了 `herbByGrade`。
 */
describe('坏档韧性 · 三条上界的取值与退路', () => {
  /** 正常档不该被这些守卫误伤 */
  it('灵气:真实上限以内原样保留', () => {
    setActivePinia(createPinia())
    const r = useResourcesStore()
    // 1.172e17 是「最高境界气海 × 积余倍率」,正常存档能到这里
    for (const v of [0, 1e6, 1.17e17]) {
      r.$patch({ qi: v } as never)
      r.sanitize()
      expect(r.qi, `正常档的灵气 ${v} 被误清`).toBe(v)
    }
  })

  it('灵气:坏档巨值归零', () => {
    setActivePinia(createPinia())
    const r = useResourcesStore()
    r.$patch({ qi: 1e300 } as never)
    r.sanitize()
    expect(r.qi, '1e300 没被清').toBe(0)
  })

  it('道源:越界归零,不是夹到上界(否则等于送钱)', () => {
    setActivePinia(createPinia())
    const e = useEndgameStore()
    for (const v of [1e300, 1e12]) {
      e.$patch({ daoSource: v } as never)
      e.sanitize()
      expect(e.daoSource, `${v} 被夹成了 ${e.daoSource} —— 应该归零`).toBe(0)
    }
  })

  it('道源:上限以内原样保留', () => {
    setActivePinia(createPinia())
    const e = useEndgameStore()
    for (const v of [0, 1234, 1e8]) {
      e.$patch({ daoSource: v } as never)
      e.sanitize()
      expect(e.daoSource, `正常值 ${v} 被改`).toBe(v)
    }
  })

  it('灵草分账:巨值归零,正常值保留', () => {
    setActivePinia(createPinia())
    const r = useResourcesStore()
    r.$patch({ herbByGrade: { 1: 1e300, 2: 500, 3: 0, 4: 0, 5: 0 } } as never)
    r.sanitize()
    expect(r.herbOf(1), '巨量灵草没被清').toBe(0)
    expect(r.herbOf(2), '正常灵草被误清').toBe(500)
  })
})

/**
 * 装备的两个计数器也要有上界。
 *
 * `reforgeCount` / `transferCount` 只用于显示(「已重铸 N 次」),
 * 而那一处是**裸插值**、没有格式化兜底 —— 坏档写 `1e300` 会印成
 * 「已重铸 1e+300 次」。实测 sanitize 原先原样保留。
 *
 * 这与上一轮那批上界是同一条思路:只用于展示的字段同样需要守卫,
 * 因为展示路径不一定经过格式化函数。
 */
describe('坏档韧性 · 装备计数器的上界', () => {
  const patchWith = (v: unknown): ReturnType<typeof useInventoryStore> => {
    setActivePinia(createPinia())
    const inv = useInventoryStore()
    inv.$patch({
      items: [
        { uid: 'x', templateId: 'w_zidian', quality: 'mortal', tier: 1, level: 0, affixes: [], reforgeCount: v, transferCount: v }
      ]
    } as never)
    inv.sanitize()
    return inv
  }

  it('巨值被夹到上界,不再原样保留', () => {
    for (const v of [1e300, 1e20, 1e10]) {
      const it = patchWith(v).items[0]
      expect(it?.reforgeCount, `reforgeCount ${v} 没被夹住`).toBeLessThanOrEqual(EQUIP_COUNTER_MAX)
      expect(it?.transferCount, `transferCount ${v} 没被夹住`).toBeLessThanOrEqual(EQUIP_COUNTER_MAX)
    }
  })

  it('真实累计不该被夹 —— 两项操作本身没有上限', () => {
    /*
     * 首版把上界取成一万,而每次重铸都会 +1、几世累计可以越过一万 ——
     * 那样读档时会把真实历史夹掉(审查意见指出的)。上界只为拦坏档,
     * 不该卡在「常见量级」。
     */
    for (const v of [5000, 50000, 5_000_000]) {
      const it = patchWith(v).items[0]
      expect(it?.reforgeCount, `真实累计 ${v} 被误夹`).toBe(v)
      expect(it?.transferCount, `真实累计 ${v} 被误夹`).toBe(v)
    }
  })

  it('上界本身仍在裸插值可读的范围内', () => {
    // 裸插值在 1e21 起改用科学计数法;上界必须远低于它
    expect(EQUIP_COUNTER_MAX, '上界太高,裸插值会印出 1e+N').toBeLessThan(1e21)
    expect(String(EQUIP_COUNTER_MAX)).not.toMatch(/e\+/)
  })
})

/**
 * 历练会话的四个计数也要有上界。
 *
 * 它们只用于显示(「胜 N 场 · 际遇 M 次 · 拾获 K 件」),
 * 而 `formatNum` 在单位表之外仍会印成 `1.00e300`。
 * 与装备计数器同一条思路:展示字段同样需要守卫。
 */
describe('坏档韧性 · 历练会话计数的上界', () => {
  it('巨值被夹住,真实累计不误伤', () => {
    const patch = (v: unknown): number | undefined => {
      setActivePinia(createPinia())
      const a = useAdventureStore()
      a.$patch({
        session: { regionId: 'qingyun', startedAt: 1, endsAt: 2, nextBattleAt: 3, wins: v, losses: v, events: v, itemGain: v }
      } as never)
      a.sanitize()
      return a.session?.wins
    }
    expect(patch(1e300), '巨值没被夹住').toBeLessThanOrEqual(1e8)
    // 一场历练的正常量级不该被夹
    expect(patch(500), '正常值被误夹').toBe(500)
  })
})

/**
 * 远征运行态的计数要封顶 —— 它们会**乘进战斗属性**。
 *
 * `run.winStacks` 经 `stackedMods(mods, perWin, run.winStacks)` 直接乘进攻防,
 * 坏档写 `1e300` 会让玩家攻击瞬间无限大;而原先只有下限、原样保留。
 *
 * 上界不是随手取的:一趟远征是「入界 + 每层择路 + 界主」共
 * `EXPEDITION_ROUTE_LAYERS + 2 = 5` 战,故叠层不可能超过 5;留一档余量到 16。
 */
describe('坏档韧性 · 远征运行态的计数上界', () => {
  const patchRun = (v: unknown): { winStacks?: number; bonus?: number } | undefined => {
    setActivePinia(createPinia())
    const e = useEndgameStore()
    e.$patch({
      worldRun: { worldId: 'chiyan', pactId: null, gateId: null, layer: 1, bonus: v, rows: [], carriedHpPct: 1, totalRounds: 0, winStacks: v }
    } as never)
    e.sanitize()
    return e.worldRun as { winStacks?: number; bonus?: number } | undefined
  }

  it('巨值被夹住', () => {
    for (const v of [1e300, 1e12]) {
      const r = patchRun(v)
      expect(r?.winStacks, `winStacks ${v} 没被夹住`).toBeLessThanOrEqual(16)
      expect(r?.bonus, `bonus ${v} 没被夹住`).toBeLessThanOrEqual(256)
    }
  })

  it('正常叠层不被误夹', () => {
    // 一趟远征最多 5 战,叠层 0..5 都是正常值
    for (const v of [0, 3, 5]) {
      const r = patchRun(v)
      expect(r?.winStacks, `正常叠层 ${v} 被误夹`).toBe(v)
    }
  })

  it('正常路线奖励不被误夹 —— bonus 会并入最终结算', () => {
    /*
     * 这一条是审查意见指出的高危处:`run.bonus` 是**累计的路线奖励**,
     * `reward = world.rewardDaoSource + run.bonus` 直接把它算进道源。
     * 首版让它与叠层共用 16 的上界,会吞掉玩家已经挣到的奖励。
     *
     * 节点 bonus 实测 8/10/12/14/16,三层各取一个 → 正常上限 48。
     */
    for (const v of [0, 16, 32, 48]) {
      const r = patchRun(v)
      expect(r?.bonus, `正常路线奖励 ${v} 被误夹`).toBe(v)
    }
  })

  it('两条上界各按自己的真实范围定,不共用', () => {
    // 叠层与道源是两个量级的数,共用上界必有一方被误夹
    const r = patchRun(48)
    expect(r?.bonus, 'bonus 的正常上限 48 被叠层那条上界误夹').toBe(48)
    expect(r?.winStacks, '叠层仍该夹到 16').toBe(16)
  })
})
