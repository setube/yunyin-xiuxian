/**
 * 丹药增益的时长上限:四个时辰(= 8 小时,CONSUMABLE_BUFF_CAP_SEC);查真实内容 data/pills × data/buffs。
 * 故障注入:删掉 addBuff 的上限钳制,越界坏档那条红。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { PILLS } from '@/data/pills'
import { buffDef } from '@/data/buffs'
import {
  CONSUMABLE_BUFF_CAP_SEC,
  buffCapSec,
  buffOverflowOf,
  isConsumableBuff
} from './buffCap'
import { useCultivationStore } from '@/stores/cultivation'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { useUiStore } from '@/stores/ui'
import { usePill, usePillBatch } from './pillService'
import type { BuffInstance } from '@/types'
import { SHICHEN_SEC } from '@/data/timeUnits'
import { BUFFS } from '@/data/buffs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gameNow, setEnginePaused } from './enginePause'

/** 丹药能给的增益 id */
const pillBuffs = PILLS.filter(p => p.buffId).map(p => p.buffId!)

function freshCharacter(): void {
  usePlayerStore().initCharacter('封顶自检', { roots: [{ element: 'wood', aptitude: 80 }] } as never)
}

describe('前置:服用增益的弹药是真实存在的', () => {
  it('有一条以上带增益的丹药,且它们都被登记为可消耗增益', () => {
    expect(pillBuffs.length).toBeGreaterThanOrEqual(8)
    for (const defId of pillBuffs) {
      expect(buffDef(defId), `丹药指向不存在的增益 ${defId}`).toBeDefined()
      expect(isConsumableBuff(defId)).toBe(true)
    }
  })
})

/**
 * 时钟回拨不许缩短合法 buff。
 *
 * 封顶的上界原写 `now + capMs`,而 `now` 是「读档 / 服丹那一刻」——
 * 时钟往回拨过之后它会早于 buff 的真实起点,上界随之缩到 `endsAt` 之前,
 * 一条合法 buff 被当场砍短(实测回拨 1 小时、剩 7h50m 的 buff 被砍 50 分钟)。
 * 参照点应取 buff 自己的起点(`endsAt - added`),它不随墙钟漂移。
 */
describe('封顶 · 时钟回拨不缩短合法 buff', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('读档复钳:回拨后合法 buff 原样保留', () => {
    vi.useFakeTimers()
    try {
      const cultivation = useCultivationStore()
      const now = Date.now()
      const capMs = CONSUMABLE_BUFF_CAP_SEC * 1000
      const endsAt = now + capMs - 600_000 // 还剩 7h50m,合法
      cultivation.$patch({ buffs: [{ defId: 'buff_wudao', endsAt, added: capMs }] } as never)

      vi.setSystemTime(now - 3600_000) // 回拨 1 小时
      cultivation.sanitize()
      expect(cultivation.buffs[0]?.endsAt, '回拨把合法 buff 砍短了').toBe(endsAt)
    } finally {
      vi.useRealTimers()
    }
  })

  it('服丹封顶:回拨后再服一颗,不缩短已有 buff', () => {
    const cultivation = useCultivationStore()
    const now = Date.now()
    const capMs = CONSUMABLE_BUFF_CAP_SEC * 1000
    const endsAt = now + capMs - 600_000
    cultivation.$patch({ buffs: [{ defId: 'buff_wudao', endsAt, added: capMs }] } as never)

    cultivation.addBuff('buff_wudao', now - 3600_000) // 回拨后服丹
    expect(cultivation.buffs[0]?.endsAt ?? 0, '服一颗丹反而把 buff 砍短了').toBeGreaterThanOrEqual(endsAt)
  })
})

describe('封顶口径(buffCapSec / isConsumableBuff)', () => {
  it('丹药增益的上限 = 四个时辰,不随单颗时长缩放(口径写在装配层)', () => {
    expect(CONSUMABLE_BUFF_CAP_SEC).toBe(4 * SHICHEN_SEC)
    expect(buffCapSec('buff_juling')).toBe(CONSUMABLE_BUFF_CAP_SEC)
    const shortIds = PILLS.filter(p => p.buffId && buffDef(p.buffId)!.durationSec < 1800).map(p => p.buffId!)
    expect(shortIds.length, '内容里没有短时长丹药,这条判据形同虚设').toBeGreaterThan(0)
    for (const defId of shortIds) expect(buffCapSec(defId)).toBe(CONSUMABLE_BUFF_CAP_SEC)
  })

  it('造化丹给的 blessing 样 buff 也算消耗增益:同口径封顶', () => {
    // bless_daoyun 的 kind 是 blessing:按 kind 判会漏
    const zaohua = PILLS.find(x => x.id === 'p_zaohua')
    expect(zaohua?.buffId).toBe('bless_daoyun')
    expect(isConsumableBuff('bless_daoyun')).toBe(true)
    expect(buffCapSec('bless_daoyun')).toBe(CONSUMABLE_BUFF_CAP_SEC)
  })

  it('不归它管的状态没有上限:闭关 / 重伤 / 事件祝福', () => {
    for (const defId of ['retreat', 'injury', 'bless_qingfeng']) {
      expect(isConsumableBuff(defId), `${defId} 不该是可消耗增益`).toBe(false)
      expect(buffCapSec(defId), `${defId} 不该有上限`).toBeUndefined()
    }
  })
})

describe('三档文案的依据(buffOverflowOf 纯函数)', () => {
  const durSec = buffDef('buff_juling')!.durationSec // 1800
  const capSec = buffCapSec('buff_juling')! // 28800
  const once = (at: number) => [{ defId: 'buff_juling', endsAt: at + 1 * durSec * 1000 }]
  const nearCap = (at: number) => [{ defId: 'buff_juling', endsAt: at + (capSec - 600) * 1000 }]

  it('空列表不误报(否则提示就成了狼来了)', () => {
    expect(buffOverflowOf([], 'buff_juling', 0)).toBe('none')
  })

  it('刚服一颗 / 离上限还远:足额兑现 → none', () => {
    expect(buffOverflowOf(once(0), 'buff_juling', 0)).toBe('none')
    expect(buffOverflowOf(once(0), 'buff_juling', (durSec - 600) * 1000)).toBe('none')
  })

  it('贴着上限、加上去会越过:只延续到顶 → partial', () => {
    expect(buffOverflowOf(nearCap(0), 'buff_juling', 0)).toBe('partial')
  })

  it('已经顶死:一点也加不上去 → full(界面报"白费")', () => {
    const atCap = (at: number) => [{ defId: 'buff_juling', endsAt: at + capSec * 1000 }]
    expect(buffOverflowOf(atCap(0), 'buff_juling', 0)).toBe('full')
    expect(capSec).toBe(4 * SHICHEN_SEC)
  })
})

describe('addBuff 封顶边界(store 集成)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function remainOf(buffs: readonly BuffInstance[], defId: string, now: number): number {
    return Math.max(0, (buffs.find(b => b.defId === defId)?.endsAt ?? now) - now) / 1000
  }

  it('连服再多也攒不过上限:endsAt 与 added 都钳在四个时辰', () => {
    const cultivation = useCultivationStore()
    const t0 = 5_000_000
    // 20 颗 × 30 分 = 10 小时 > 四个时辰
    for (let i = 0; i < 20; i++) cultivation.addBuff('buff_juling', t0)

    const capSec = buffCapSec('buff_juling')!
    expect(remainOf(cultivation.buffs, 'buff_juling', t0)).toBe(capSec)
    // added 是 UI 进度条分母/叠 N,同样封顶
    expect(cultivation.buffs[0]!.added).toBe(capSec * 1000)
  })

  it('不归管的状态照旧线性叠加(上限没有被无意扩大)', () => {
    const cultivation = useCultivationStore()
    const t0 = 5_000_000
    cultivation.addBuff('injury', t0)
    cultivation.addBuff('injury', t0 + 10_000)
    const injury = buffDef('injury')!
    expect(remainOf(cultivation.buffs, 'injury', t0 + 10_000)).toBe(injury.durationSec * 2 - 10)
  })

  it('故障注入:一份"囤破上限"的坏档,再服被钳回上限;钳制被删这条就红', () => {
    const cultivation = useCultivationStore()
    const t0 = 5_000_000
    const capSec = buffCapSec('buff_juling')!
    const full = 20 * buffDef('buff_juling')!.durationSec * 1000 // 10 小时
    cultivation.$patch({ buffs: [{ defId: 'buff_juling', endsAt: t0 + full, added: full }] })
    cultivation.addBuff('buff_juling', t0)

    expect(remainOf(cultivation.buffs, 'buff_juling', t0)).toBe(capSec)
    expect(cultivation.buffs[0]!.added).toBe(capSec * 1000)
    cultivation.addBuff('buff_juling', t0)
    expect(cultivation.buffs[0]!.endsAt).toBe(t0 + capSec * 1000)
  })
})

describe('服用丹药的三档文案(usePill 端到端)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    freshCharacter()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('连服:足额 → 只延续到顶 → 完全白费,三种话术都说得明白', () => {
    const t0 = 1_000_000
    vi.setSystemTime(t0)
    const inv = useInventoryStore()
    const ui = useUiStore()
    const lastToast = () => ui.toasts[ui.toasts.length - 1]?.text ?? ''

    inv.addPill('p_juling', 3)

    // 足额
    expect(usePill('p_juling')).toBe(true)
    expect(lastToast()).toContain('药力化开')

    // 16 颗 × 30 分顶到四个时辰,再走 15 分钟:这一颗只延续到顶
    const cultivation = useCultivationStore()
    for (let i = 0; i < 16; i++) cultivation.addBuff('buff_juling', t0)
    vi.advanceTimersByTime(900 * 1000)
    expect(usePill('p_juling')).toBe(true)
    expect(lastToast()).toContain('只延续到顶')

    // 已顶满再服:白费
    expect(usePill('p_juling')).toBe(true)
    expect(lastToast()).toContain('药力已顶满,白费')
  })

  it('三种话术各在 toast 里真实出现过一次(防空转/防文案缺失)', () => {
    const t0 = 1_000_000
    vi.setSystemTime(t0)
    const inv = useInventoryStore()
    const ui = useUiStore()
    const cultivation = useCultivationStore()
    // toast 2.6 秒即退,下面要推进 15 分钟:逐次收下文本
    const seen: string[] = []
    const collectTitles = () => seen.push(ui.toasts[ui.toasts.length - 1]?.text ?? '')
    inv.addPill('p_juling', 3)
    // 足额
    usePill('p_juling')
    collectTitles()
    // 只延续到顶
    for (let i = 0; i < 16; i++) cultivation.addBuff('buff_juling', t0)
    vi.advanceTimersByTime(900 * 1000)
    usePill('p_juling')
    collectTitles()
    // 白费
    usePill('p_juling')
    collectTitles()
    expect(seen.some(t => t.includes('药力化开'))).toBe(true)
    expect(seen.some(t => t.includes('只延续到顶'))).toBe(true)
    expect(seen.some(t => t.includes('药力已顶满,白费'))).toBe(true)
  })

  it('增益丹批量连服退化为单服:贴顶不静默,一句"白费"说得明白', () => {
    const t0 = 1_000_000
    vi.setSystemTime(t0)
    const inv = useInventoryStore()
    const ui = useUiStore()
    const lastToast = () => ui.toasts[ui.toasts.length - 1]?.text ?? ''

    const cultivation = useCultivationStore()
    inv.addPill('p_juling', 5)
    for (let i = 0; i < 16; i++) cultivation.addBuff('buff_juling', t0)
    const eaten = usePillBatch('p_juling', 5)

    expect(eaten).toBe(1)
    expect(inv.pills['p_juling'] ?? 0).toBe(4)
    expect(lastToast()).toContain('药力已顶满,白费')
  })
})

describe('读档复钳上限(sanitize 不放过超限 buff)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('5× 越限的坏档 buff:sanitize 后 added 夹回上限、endsAt 钳到 now+上限,不整段横跨', () => {
    const cultivation = useCultivationStore()
    const now = Date.now()
    const capMs = buffCapSec('buff_juling')! * 1000
    const full = 20 * buffDef('buff_juling')!.durationSec * 1000 // 10 小时
    cultivation.$patch({ buffs: [{ defId: 'buff_juling', endsAt: now + full, added: full }] })
    cultivation.sanitize()
    expect(cultivation.buffs[0]!.added).toBe(capMs)
    expect(cultivation.buffs[0]!.endsAt).toBeGreaterThan(now + capMs - 5000) // ±取 Date.now 偏差
    expect(cultivation.buffs[0]!.endsAt).toBeLessThanOrEqual(now + capMs + 5000)
  })

  it('合法(≤上限)的 buff 读档后原样保留(修形非空转)', () => {
    const cultivation = useCultivationStore()
    const now = Date.now()
    const dur = buffDef('buff_juling')!.durationSec * 1000 // 单颗时长 ≤ 四个时辰
    cultivation.$patch({ buffs: [{ defId: 'buff_juling', endsAt: now + dur, added: dur }] })
    cultivation.sanitize()
    expect(cultivation.buffs[0]!.endsAt).toBe(now + dur)
    expect(cultivation.buffs[0]!.added).toBe(dur)
  })

  it('无上限的 buff(闭关/重伤/祝福)读档不受钳制,仅保证有限数字', () => {
    const cultivation = useCultivationStore()
    const now = Date.now()
    cultivation.buffs = [{ defId: 'injury', endsAt: now + 5000, added: 5000 } as never]
    cultivation.sanitize()
    expect(cultivation.buffs[0]!.endsAt).toBe(now + 5000)
  })
})

/**
 * 服丹判「顶没顶」与写 endsAt 同读游戏时钟 gameNow(),与界面一致;读墙钟会在暂停恢复后多出一段药力。
 * 故障注入:把 usePill 里的 gameNow() 改回 Date.now(),第一条判据红。
 */
describe('服丹与界面读同一把游戏时钟', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    freshCharacter()
    setEnginePaused(false)
  })
  afterEach(() => {
    setEnginePaused(false)
    vi.useRealTimers()
  })

  it('暂停中服丹:endsAt 落在冻结时刻上,不按墙钟往前走', () => {
    const cultivation = useCultivationStore()
    const inv = useInventoryStore()
    const def = buffDef('buff_juling')!
    vi.setSystemTime(1_000_000)
    setEnginePaused(true)
    const frozen = gameNow()
    // 墙钟走 10 分钟
    vi.setSystemTime(1_000_000 + 600_000)
    expect(gameNow(), '暂停中游戏时钟就该冻住').toBe(frozen)

    inv.addPill('p_juling', 1)
    expect(usePill('p_juling')).toBe(true)
    const endsAt = cultivation.buffs.find(b => b.defId === 'buff_juling')!.endsAt
    expect(
      endsAt,
      `暂停中服下的丹药写成了墙钟时刻(${endsAt - frozen}ms 偏移)—— 恢复后会再顺延一次,药力凭空多出一段`
    ).toBe(frozen + def.durationSec * 1000)
  })

  it('判「顶没顶」与写 endsAt 用同一个时刻:暂停中连服不会各算各的', () => {
    const cultivation = useCultivationStore()
    const inv = useInventoryStore()
    const def = buffDef('buff_juling')!
    const capMs = buffCapSec('buff_juling')! * 1000
    vi.setSystemTime(2_000_000)
    setEnginePaused(true)
    const frozen = gameNow()
    vi.setSystemTime(2_000_000 + 3_600_000)

    inv.addPill('p_juling', 60)
    for (let i = 0; i < 40; i += 1) usePill('p_juling', true)
    const buff = cultivation.buffs.find(b => b.defId === 'buff_juling')!
    expect(buff.endsAt, '暂停中写出的到期时刻越过了上限').toBeLessThanOrEqual(frozen + capMs)
    expect(buff.added).toBeLessThanOrEqual(capMs)
    expect(def.durationSec).toBeGreaterThan(0)
  })
  /**
   * 「至多四个时辰」只对丹药 buff 出现:那一行须 v-if="capText"(判 buffCapSec 有无)。
   * 故障注入:把那一行改成无条件渲染,本条红。
   */
  it('丹药详情把「至多四个时辰」念出来,非丹药来源不念', () => {
    const dlg = readFileSync(resolve(__dirname, '../components/cultivation/BuffDialog.vue'), 'utf8')
    expect(dlg, '至多那一行要读 buffCapSec').toContain('buffCapSec')
    expect(dlg, '非丹药来源没有这条顶,那一行不许无条件渲染').toContain('v-if="capText"')
    expect(dlg, '界面自己写死了上限秒数').not.toMatch(/28\s*800/)
    // 阳性对照:防空集假绿
    const consumable = BUFFS.filter(b => buffCapSec(b.id) !== undefined)
    expect(consumable.length, '一味受上限管的丹药增益都没有 —— 这条钉不住什么').toBeGreaterThan(0)
    // 阴性对照
    expect(BUFFS.length - consumable.length, '所有增益都受上限管,v-if 就失去意义').toBeGreaterThan(0)
  })
})
