/**
 * 「另一页在写档」的判定范围。
 *
 * storage 事件在别的标签页写入时触发,本页自己的写入不回调 —— 正好用来判重。
 * 但判定一开始写的是 `key.startsWith('yunyin.')`,把 `yunyin.__theme`(首帧主题小键)
 * 也算成了「在写档」。
 *
 * 实测后果:A 页开着,另一页切一次主题 → A 页置上 otherTab;
 * 而 otherTab 只在心跳超时时复位(复位路径只有 watchOtherTabSave(false) 一处),
 * 于是它一直挂着,下次真开两页时那条提示已经被去重掉了。
 *
 * 判据落在源码上:判定必须用分片键集合,不能用前缀。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(__dirname, './storage.ts'), 'utf-8')

/**
 * 造一个能记事件的假窗口:storage.ts 在模块顶层往 window / document 上挂监听,
 * 行为判据要能真的把它们触发起来。
 *
 * `swallow` 用来做故障注入:清单里的事件照常被「挂上」但收不到派发,
 * 等价于那段监听没写 —— 判据若照样绿,说明它没在验这条路径。
 */
function installFakePage(swallow: string[] = []): {
  disk: Map<string, string>
  fire: (target: 'window' | 'document', type: string) => void
  /**
   * 派发一条「别的标签页写了某键」的 storage 事件。
   * `newValue === null` 表示那条键被删掉了(对面卸载时删自己的心跳键)。
   */
  fireStorage: (e: { key: string; newValue: string | null }) => void
} {
  const disk = new Map<string, string>()
  const listeners = new Map<string, Set<(e?: unknown) => void>>()
  const record = (target: string) => ({
    addEventListener: (type: string, fn: (e?: unknown) => void) => {
      if (swallow.includes(type)) return
      const key = `${target}:${type}`
      const set = listeners.get(key) ?? new Set()
      set.add(fn)
      listeners.set(key, set)
    },
    removeEventListener: (type: string, fn: (e?: unknown) => void) => listeners.get(`${target}:${type}`)?.delete(fn)
  })
  vi.stubGlobal('window', record('window'))
  vi.stubGlobal('document', { ...record('document'), visibilityState: 'visible' })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => void disk.set(k, v),
    removeItem: (k: string) => void disk.delete(k),
    clear: () => disk.clear(),
    key: (i: number) => [...disk.keys()][i] ?? null,
    get length() {
      return disk.size
    }
  })
  return {
    disk,
    fire: (target, type) => {
      for (const fn of listeners.get(`${target}:${type}`) ?? []) fn()
    },
    fireStorage: e => {
      for (const fn of listeners.get('window:storage') ?? []) fn(e)
    }
  }
}

/** 派发一条「别的标签页写了某键」的 storage 事件 */
function fireStorageEvent(page: ReturnType<typeof installFakePage>, key: string, newValue: string | null = '1'): void {
  page.fireStorage({ key, newValue })
}

/** 本页心跳键:storage.ts 用 `yunyin.__live.<时间戳>.<序号>` 命名 */
const liveKeys = (disk: Map<string, string>): string[] => [...disk.keys()].filter(k => k.includes('__live.'))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('另一页在写档 · 判定范围', () => {
  it('只认存档分片,不用 yunyin. 前缀一刀切', () => {
    expect(SRC, '判定用了前缀,会把 __theme / __live 之外的辅助键也算进来').not.toMatch(
      /e\.key\.startsWith\(SAVE_PREFIX\)\s*&&/
    )
    expect(SRC, '缺分片键集合').toContain('const SAVE_SLICE_KEYS = new Set(PERSISTED_STORES.map(id => SAVE_PREFIX + id))')
    expect(SRC, '判重没有走分片键集合').toContain('if (SAVE_SLICE_KEYS.has(e.key))')
  })

  it('心跳单独处理:每页一个键,靠扫全部键判活页数', () => {
    /*
     * 原先两页共用一个 yunyin.__live 键 —— 谁都读到「刚被自己刷新」的时间戳,
     * 对面关掉之后自己的 ping 每 4 秒把那个键写成新的,过期判据永远不成立,
     * 警告一旦挂上就再也不消失(实测开两页再关一页,13 秒后仍在)。
     * 故改成一页一个键:扫全部心跳键、排掉自己,才知道还有几页活着。
     */
    expect(SRC, '心跳前缀要能匹配多页').toContain('const LIVE_PREFIX = SAVE_PREFIX + \'__live.\'')
    expect(SRC, '本页的键要独立').toContain('const MY_LIVE_KEY = LIVE_PREFIX +')
    expect(SRC, '判活页数要排掉自己').toContain('key === MY_LIVE_KEY')
    expect(SRC, '心跳事件要扫全部键').toContain('if (e.key.startsWith(LIVE_PREFIX))')
    // 心跳必须在分片判定之前 return,否则会落到分片分支
    const liveIdx = SRC.indexOf('if (e.key.startsWith(LIVE_PREFIX))')
    const sliceIdx = SRC.indexOf('if (SAVE_SLICE_KEYS.has(e.key))')
    expect(liveIdx, '心跳判定应排在分片判定之前').toBeLessThan(sliceIdx)
  })

  it('本页心跳键不用 Math.random —— 会吃掉测试的 mockReturnValueOnce 配额', () => {
    // 实测:模块顶层调一次 Math.random,earlyGameBuffs 的「灵机一动」用例整条序列错位
    expect(SRC, '本页键该用时间戳+递增,不用 Math.random').not.toMatch(/MY_LIVE_KEY = [\s\S]{0,40}Math\.random/)
  })

  it('heartbeat 停用时删的是自己的键', () => {
    expect(SRC, '该删本页的键,不是删公共键').toContain('localStorage.removeItem(MY_LIVE_KEY)')
  })

  it('卸载时删掉本页心跳键 —— 单页刷新不该被当成「另一页」', () => {
    /*
     * 心跳只记「最后写下的时刻」,分不出「还开着但没来得及再写」与「这一份页面已经没了」。
     * 过期窗口 12 秒,于是刷新之后上一份页面留下的键仍在窗口内 —— 新页面开局 4 秒
     * 就对自己报「存档已在另一页打开」。实测:刷新一次即误报,设置页常驻提示跟着亮 12 秒;
     * 关掉页签再 12 秒内重开同样中招。
     */
    expect(SRC, '卸载时须删本页心跳键').toMatch(/addEventListener\(['"]pagehide['"], dropAlive\)/)
    expect(SRC, '桌面端的 beforeunload 也要删').toMatch(/addEventListener\(['"]beforeunload['"], dropAlive\)/)
    expect(SRC, '删键该走 dropAlive,不是在两处各写一遍 removeItem').toMatch(/function dropAlive\(\)/)
  })

  it('首帧主题键不在分片清单里(否则判定又把它算进来)', () => {
    // PERSISTED_STORES 是导出的常量,这里用源码断言避免把整个 store 链拉进单测
    const list = /export const PERSISTED_STORES = \[([\s\S]*?)\] as const/.exec(SRC)
    expect(list, 'PERSISTED_STORES 变了形状,判据要跟着改').toBeTruthy()
    expect(list![1]!, '首帧主题键不该进分片清单 —— 它不是进度').not.toContain('__theme')
    expect(list![1]!, '心跳键不该进分片清单').not.toContain('__live')
  })
})

/**
 * 单页刷新不许被自己上一份页面当成「另一页」。
 *
 * 上一版只验源码里写了那句监听,没验它真的在卸载时生效 —— 而这两件事并不等价:
 * 监听挂错事件、或挂在了心跳开关里面(只有开局后才挂得上),源码断言照样绿。
 * 这里直接走模块加载 → 开局心跳 → 触发卸载事件 → 重载后的可见行为。
 */
describe('另一页在写档 · 卸载后不被自己当成对面', () => {
  it('pagehide 之后本页心跳键消失 —— 刷新不会把上一份页面算成活页', async () => {
    const page = installFakePage()
    vi.useFakeTimers()
    const { watchOtherTabSave } = await import('./storage')
    watchOtherTabSave(true)
    expect(liveKeys(page.disk), '开局后该写下自己的心跳键').toHaveLength(1)

    page.fire('window', 'pagehide')

    expect(liveKeys(page.disk), '卸载时没删自己的心跳键 —— 刷新后新页面会把它算成另一个活页').toHaveLength(0)
    watchOtherTabSave(false)
    vi.useRealTimers()
  })

  it('故障注入:摘掉 pagehide 监听,上面那条立刻红', async () => {
    // 这条证明上一条不是恒真 —— 少了监听,刷新后就真会被自己上一份页面骗到
    const page = installFakePage(['pagehide', 'beforeunload'])
    vi.useFakeTimers()
    const { watchOtherTabSave } = await import('./storage')
    watchOtherTabSave(true)
    page.fire('window', 'pagehide')
    expect(liveKeys(page.disk), '监听摘掉了键却还是没了 —— 上一条的判据没在验 pagehide').toHaveLength(1)
    watchOtherTabSave(false)
    vi.useRealTimers()
  })
})

/**
 * 对面在后台时提示不许闪。
 *
 * 心跳只在本页可见时才发,另一页切到后台心跳就停了 —— 可它仍在按 5 秒一次的节奏写档,
 * 写的正是同一份存档。只认心跳的话,本页 12 秒后判定「对面没了」,常驻提示熄灭;
 * 下一次写档事件又把它点亮;4 秒后再熄灭。
 * 实测(另一页钉在 hidden 且持续写档 40 秒):提示 true/false 交替 8 次,每次点亮还重弹一条 toast。
 */
describe('另一页在写档 · 对面切到后台', () => {
  it('对面只在后台写档、不发心跳:提示保持亮着,不闪', async () => {
    const page = installFakePage()
    vi.useFakeTimers()
    const { watchOtherTabSave, isOtherTabSaving, subscribeOtherTabSave } = await import('./storage')
    /** 每一次状态翻转都记下来 —— 「总算下来是 true」和「一直没熄过」是两回事 */
    const flips: boolean[] = []
    const unsubscribe = subscribeOtherTabSave(active => flips.push(active))
    watchOtherTabSave(true)

    // 对面写了一片存档,但它的心跳键已经过期(后台不发心跳)
    fireStorageEvent(page, 'yunyin.player')
    expect(isOtherTabSaving(), '见到对面写档却没认出来').toBe(true)
    // 首次点亮是正常的那一次;从这里往后一次都不许再翻
    flips.length = 0

    // 本页每 4 秒 ping 一次,连着跑 20 秒:心跳停了,写档证据还在窗口里
    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(4000)
      fireStorageEvent(page, 'yunyin.player')
    }
    expect(flips, `提示翻转了 ${flips.length} 次 —— 对面一直在写档却判成「没了」`).toEqual([])
    expect(isOtherTabSaving()).toBe(true)

    unsubscribe()
    watchOtherTabSave(false)
    vi.useRealTimers()
  })

  it('对面连写档也停了:过了写档窗口就该判成没了', async () => {
    const page = installFakePage()
    vi.useFakeTimers()
    const { watchOtherTabSave, isOtherTabSaving } = await import('./storage')
    watchOtherTabSave(true)
    fireStorageEvent(page, 'yunyin.player')
    expect(isOtherTabSaving()).toBe(true)

    // 30 秒写档窗口 + 一次心跳周期:两条证据都过期
    vi.advanceTimersByTime(34000)
    expect(isOtherTabSaving(), '对面既不发心跳也不再写档,却仍判成活着 —— 对面关掉后警告不会消').toBe(false)

    watchOtherTabSave(false)
    vi.useRealTimers()
  })

  it('对面卸载(删掉自己的心跳键):提示立刻能消,不被写档证据多撑一个窗口', async () => {
    const page = installFakePage()
    vi.useFakeTimers()
    const { watchOtherTabSave, isOtherTabSaving } = await import('./storage')
    watchOtherTabSave(true)

    // 对面写过档 -> 提示亮;接着它卸载,删掉自己的心跳键
    fireStorageEvent(page, 'yunyin.player')
    expect(isOtherTabSaving()).toBe(true)
    fireStorageEvent(page, 'yunyin.__live.peer.1', null)

    /*
     * 删键是「那一页真的没了」的硬证据,写档证据要一并作废。
     * 不然它还会把提示多撑 30 秒 —— 玩家刚关掉另一页,那条提示却留在屏幕上。
     */
    expect(isOtherTabSaving(), '对面已经卸载,提示却被写档证据撑着').toBe(false)

    watchOtherTabSave(false)
    vi.useRealTimers()
  })

  it('停表后清掉写档证据 —— 重开一页不该继承上一次的假警报', async () => {
    const page = installFakePage()
    vi.useFakeTimers()
    const first = await import('./storage')
    first.watchOtherTabSave(true)
    fireStorageEvent(page, 'yunyin.player')
    expect(first.isOtherTabSaving()).toBe(true)
    first.watchOtherTabSave(false)

    // 同一个页面重新开表(例如关卡后重进设置):上一次的写档时间戳不该还算数
    const second = await import('./storage')
    second.watchOtherTabSave(true)
    expect(second.isOtherTabSaving(), '停表时没清写档证据 —— 重开就冒出一条对面并不存在的警告').toBe(false)
    second.watchOtherTabSave(false)
    vi.useRealTimers()
  })
})
