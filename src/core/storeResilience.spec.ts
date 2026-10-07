/**
 * 坏档韧性 —— 缺字段不该白屏
 *
 * 存档会被写坏、被改坏,或在旧版本里根本没有某一栏。游戏为此在各 store 里
 * 备了 sanitize():读档后把形状不对的字段修回默认值。
 *
 * 但「修」的前提是它自己别先炸。本轮实测:player.sanitize 只挡了
 * suppressQualified,没挡 suppressedRegions,于是 `for...of` 直接抛错 ——
 * 玩家看到的是白屏,而不是「回到云隐山下」。
 *
 * 故这里不看某一条字段有没有写进 sanitize,而是**逐个字段灌 undefined**:
 * 声明了 sanitize 的每个 store,每个持久化字段被抹掉后,sanitize 都必须跑完、
 * 且结果仍可 JSON 序列化。将来新增字段忘了兜底,这里会先红。
 */
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia, type Store } from 'pinia'
import type { BondState } from '@/core/daoluService'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { usePacingTelemetry } from '@/stores/pacingTelemetry'
import { useLoreStore } from '@/stores/lore'
import { useResourcesStore } from '@/stores/resources'
import { sanitizeOfflineInputs } from './offline'

/**
 * store 清单**从源码倒推**,不再手写。
 *
 * 手写清单的失效方式总是静默的:新加一个持久化 store、忘了往这张表里补一行,
 * 坏档用例就少测一片,而测试照旧全绿。pacingTelemetry 正是这么漏掉的 ——
 * 它落了盘、却没有 sanitize,record() 直接对可能为 null 的 events 调 slice。
 *
 * 故这里分两步取清单:
 *   一 用 ?raw 读每个 store 源码,凡调过 persistConfig('x') 的都是持久化 store;
 *   二 用整模块取它的 useXxxStore 导出 —— 对不上就说明命名变了(也当红)。
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

/**
 * 从模块里找出「取 store」的那个导出。
 *
 * 命名不统一(usePlayerStore / usePacingTelemetry / useUiStore),故不靠正则碰运气:
 * 凡 useXxx 开头的函数都试着调一次,能返回带 $id 的 pinia store 就是它。
 */
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
      // 不是 store 的 composable,跳过
    }
  }
  return () => ({ $id: '' }) as unknown as Store & { sanitize?: () => void }
}

const PERSISTED = persistedStores()

/** 有 sanitize 的那些 —— 韧性用例按这份清单跑 */
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
    // 这条是这轮补 sanitize 的动机:record() 直接对 events 调 slice,
    // 分片被写坏(null / 数组里塞 null)时,任何一次互动记录都会抛错
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
    // 症结曾是「pacing 有 sanitize 但没人调」—— 每条 store 的 sanitize 单测都绿,
    // 却漏了把它挂进读档兜底清单。这里走真实的读档口(engine.start → sanitizeOfflineInputs),
    // 灌一个 JSON 合法、形状却烂掉的 events,断言它被清单修回可用的空数组。
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
          /**
           * 只跑 sanitize 不够:真正的白屏发生在**渲染期读 computed** 的时候
           * (如 cultivation.gongfaMods 对 null 的 gongfaBranch 调 Object.entries)。
           * 故这里把 store 上每个非函数属性都读一遍 —— 等价于把这个页面渲染一次。
           */
          for (const prop of Object.keys(store)) {
            const v = (store as unknown as Record<string, unknown>)[prop]
            if (typeof v === 'function') continue
            try {
              JSON.stringify(v)
            } catch {
              // 循环引用(如 ref 自身)不是坏档问题;这里只为触发 computed 求值
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

/** 坏档不只"缺字段":也可能是形状对、内容是垃圾(数组里塞 null、记录值塞 null) */
const HOSTILE: unknown[] = [null, 0, -1, NaN, '', 'x', [], {}, [null], { a: null }, true, [{ uid: null }]]

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
                // 循环引用不是坏档问题
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
    // lifespanMax = floor(base×(1+pct) + lifespanBonusYears);字段一旦是字符串/NaN,
    // 结果变 NaN,而引擎死亡判据是 `age < lifespanMax` 恒为 false → 下一拍即「油尽灯枯」。
    // sanitize 此前逐字段修形,唯独漏了这一栏(写坏/导入坏档的必死路径)。
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

    // 合法的延寿数值(丹药/事件给的 +X 载)不因守卫被误伤
    player.$patch({ lifespanBonusYears: 200 } as never)
    player.sanitize()
    expect(player.lifespanBonusYears).toBe(200)
  })

  it('资源:负数/NaN 被夹回 0,合法正数不因守卫被误伤', () => {
    // 游戏内写入路径(addSmall/setQi)都以 Math.max(0, …) 兜底,负数只能来自坏档;
    // sanitize 此前只修非有限值,负数会原样存活并显示成负库存。与 settings.sanitize 对齐后一并归零。
    setActivePinia(createPinia())
    const r = useResourcesStore()
    r.qi = -50
    r.wudao = -3
    r.herb = NaN
    r.ore = 7
    r.sanitize()
    expect(r.qi).toBe(0)
    expect(r.wudao).toBe(0)
    expect(r.herb).toBe(0)
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
    // null 形状:旧版 sanitize 经 ...s 原样保留,首胜 add(null,…) 读 .m 抛 TypeError、
    // 被 tickSafe 吞掉后历练永久卡死;现在必须归一为合法 GNum
    adventure.$patch({
      session: { regionId: 'qingyun', mode: 'normal', startedAt: 1, endsAt: 2, nextBattleAt: 3, wins: 0, losses: 0, events: 0, stoneGain: null, expGain: null, itemGain: 0 }
    } as never)
    adventure.sanitize()
    expect(adventure.session).not.toBeNull()
    expect(adventure.session!.stoneGain).toEqual({ m: 0, e: 0 })
    expect(adventure.session!.expGain).toEqual({ m: 0, e: 0 })

    // 裸数字:也归一成 GNum,而不是 (123).m → undefined 的静默归零路径
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
