/**
 * 丹药(消耗品)增益的时长上限 —— 落地判据。
 *
 * 起因(承接 xian ISS-232 的思路,适配云隐自己的 addBuff 叠法):云隐丹药的叠加是"加上",
 * 吃得比时长勤就能无限攒(20 分钟一颗、连吃一天还剩半天),"什么时候吃"的决策随之消失。
 * 决定:给**凡丹药能给的增益**加上限,取"单颗时长的 2 倍"(见 core/buffCap 的
 * CONSUMABLE_BUFF_CAP_MULT)。
 *
 * 这份用例钉四件事(它查的是**真实内容** data/pills × data/buffs,不是造出来的样本):
 *   ① 每条丹药增益都有上限,且等于"单颗时段 × 2";
 *   ② 反复服用也攒不过上限(贴顶再服一点不加);三档文案语义 full/partial/none 各自成立;
 *   ③ 不归它管的状态(闭关 / 重伤 / 事件祝福)一律没有上限,免得上限被无意扩大;
 *   ④ 刻意注入一份越界坏档,证明确实被钳回上限 —— 谁删了钳制,这条就红。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { PILLS } from '@/data/pills'
import { buffDef } from '@/data/buffs'
import {
  CONSUMABLE_BUFF_CAP_MULT,
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

/** 丹药能给的增益 id(防空转:内容表被挪走、buffId 全丢,判据就变成空跑) */
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

describe('封顶口径(buffCapSec / isConsumableBuff)', () => {
  it('丹药增益的上限 = 单颗时长 × 2(口径写在装配层)', () => {
    const dur = buffDef('buff_juling')!.durationSec
    expect(buffCapSec('buff_juling')).toBe(dur * CONSUMABLE_BUFF_CAP_MULT)
    expect(buffCapSec('buff_juling')).toBe(dur * 2)
  })

  it('造化丹给的 blessing 样 buff 也算消耗增益:同口径封顶(与 xian 一致)', () => {
    // p_zaohua → bless_daoyun 的 kind 是 blessing,不是 pill —— 若按 kind 一刀切就漏了它
    const zaohua = PILLS.find(x => x.id === 'p_zaohua')
    expect(zaohua?.buffId).toBe('bless_daoyun')
    expect(isConsumableBuff('bless_daoyun')).toBe(true)
    expect(buffCapSec('bless_daoyun')).toBe(buffDef('bless_daoyun')!.durationSec * 2)
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
  const capSec = buffCapSec('buff_juling')! // 3600
  // 一次性实例:endsAt = 施放时刻 + 单颗时长(×1 / ×2)
  const once = (at: number) => [{ defId: 'buff_juling', endsAt: at + 1 * durSec * 1000 }]
  const twice = (at: number) => [{ defId: 'buff_juling', endsAt: at + 2 * durSec * 1000 }]

  it('空列表不误报(否则提示就成了狼来了)', () => {
    expect(buffOverflowOf([], 'buff_juling', 0)).toBe('none')
  })

  it('刚服一颗 / 离上限还远:足额兑现 → none', () => {
    expect(buffOverflowOf(once(0), 'buff_juling', 0)).toBe('none')
    // 剩 600 秒(已过 1200),再服一颗余 2400,仍未越限 —— 不报
    expect(buffOverflowOf(once(0), 'buff_juling', (durSec - 600) * 1000)).toBe('none')
  })

  it('贴着上限、加上去会越过:只延续到顶 → partial', () => {
    // 已攒 2× 天余 2400,再服一颗(1800)会越过 3600 —— 被削到上限
    expect(buffOverflowOf(twice(0), 'buff_juling', (durSec - 600) * 1000)).toBe('partial')
  })

  it('已经顶死:一点也加不上去 → full(界面报"这一颗白费了")', () => {
    expect(buffOverflowOf(twice(0), 'buff_juling', 0)).toBe('full')
    expect(capSec).toBe(2 * durSec)
  })
})

describe('addBuff 封顶边界(store 集成)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function remainOf(buffs: readonly BuffInstance[], defId: string, now: number): number {
    return Math.max(0, (buffs.find(b => b.defId === defId)?.endsAt ?? now) - now) / 1000
  }

  it('连服再多也攒不过上限:endsAt 与 added 都钳在单颗两倍', () => {
    const cultivation = useCultivationStore()
    const t0 = 5_000_000
    for (let i = 0; i < 5; i++) cultivation.addBuff('buff_juling', t0)

    const capSec = buffCapSec('buff_juling')!
    expect(remainOf(cultivation.buffs, 'buff_juling', t0)).toBe(capSec)
    // 本命累积(UI 的进度条分母/叠 N)同样封顶,免得"剩 1 份却显示全程 5 份"
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
    const full = 5 * buffDef('buff_juling')!.durationSec * 1000 // 5 倍,远超 2 倍上限
    // 恶意/老坏档:endsAt 与 added 都被撸到 5 倍 —— 模拟"无限囤"时代的残留
    cultivation.$patch({ buffs: [{ defId: 'buff_juling', endsAt: t0 + full, added: full }] })
    cultivation.addBuff('buff_juling', t0)

    expect(remainOf(cultivation.buffs, 'buff_juling', t0)).toBe(capSec)
    expect(cultivation.buffs[0]!.added).toBe(capSec * 1000)
    // 二次再服仍停在顶,不因坏档残留继续膨胀
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

    inv.addPill('p_juling', 4)

    // 第一颗:足额 —— 正常反馈
    expect(usePill('p_juling')).toBe(true)
    expect(lastToast()).toContain('药力化开')

    // 过 20 分钟(剩 10 分钟)再服:这颗足额加,还不越限 —— 仍正常
    vi.advanceTimersByTime(1200 * 1000)
    expect(usePill('p_juling')).toBe(true)
    expect(lastToast()).toContain('药力化开')

    // 第三颗仍在这一刻(已攒 40 分钟=上限):加上去会越过 —— 只延续到顶
    expect(usePill('p_juling')).toBe(true)
    expect(lastToast()).toContain('只延续到顶')

    // 第四颗:彻底顶死 —— 白费
    expect(usePill('p_juling')).toBe(true)
    expect(lastToast()).toContain('这一颗白费了')
  })

  it('三种话术各在 toast 里真实出现过一次(防空转/防文案缺失)', () => {
    const t0 = 1_000_000
    vi.setSystemTime(t0)
    const inv = useInventoryStore()
    const ui = useUiStore()
    inv.addPill('p_juling', 4)
    usePill('p_juling')
    vi.advanceTimersByTime(1200 * 1000)
    usePill('p_juling')
    usePill('p_juling')
    usePill('p_juling')
    const texts = ui.toasts.map(t => t.text)
    expect(texts.some(t => t.includes('药力化开'))).toBe(true)
    expect(texts.some(t => t.includes('只延续到顶'))).toBe(true)
    expect(texts.some(t => t.includes('这一颗白费了'))).toBe(true)
  })

  it('增益丹批量连服退化为单服:贴顶不静默,一句"白费了"说得明白', () => {
    const t0 = 1_000_000
    vi.setSystemTime(t0)
    const inv = useInventoryStore()
    const ui = useUiStore()
    const lastToast = () => ui.toasts[ui.toasts.length - 1]?.text ?? ''

    // 已有两枚聚灵顶到上限,手里还有 5 枚,想"连服 ×5"——
    // 批量路径必须退化成单服,而不是报一个误导性的「连服 5 枚」
    const cultivation = useCultivationStore()
    inv.addPill('p_juling', 5)
    // 手动把 buff 顶满(占 40 分钟),再造 5 枚库存
    cultivation.addBuff('buff_juling', t0)
    cultivation.addBuff('buff_juling', t0)
    const eaten = usePillBatch('p_juling', 5)

    expect(eaten).toBe(1) // 只会吃 1 枚,不白白连吃 5 枚
    expect(inv.pills['p_juling'] ?? 0).toBe(4)
    expect(lastToast()).toContain('这一颗白费了')
  })
})
