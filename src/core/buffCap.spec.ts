/**
 * 丹药(消耗品)增益的时长上限 —— 落地判据。
 *
 * 起因(承接 xian ISS-232 的思路,适配云隐自己的 addBuff 叠法):云隐丹药的叠加是"加上",
 * 吃得比时长勤就能无限攒(20 分钟一颗、连吃一天还剩半天),"什么时候吃"的决策随之消失。
 * 决定:给**凡丹药能给的增益**加上限,统一取**四个时辰**(= 8 小时,见 core/buffCap 的
 * CONSUMABLE_BUFF_CAP_SEC)。
 *
 * 这份用例钉四件事(它查的是**真实内容** data/pills × data/buffs,不是造出来的样本):
 *   ① 每条丹药增益都有上限,且等于"四个时辰"(不随单颗时长缩放);
 *   ② 反复服用也攒不过上限(贴顶再服一点不加);三档文案语义 full/partial/none 各自成立;
 *   ③ 不归它管的状态(闭关 / 重伤 / 事件祝福)一律没有上限,免得上限被无意扩大;
 *   ④ 刻意注入一份越界坏档,证明确实被钳回上限 —— 谁删了钳制,这条就红。
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
import { gameNow, setEnginePaused } from './enginePause'

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
  it('丹药增益的上限 = 四个时辰,不随单颗时长缩放(口径写在装配层)', () => {
    expect(CONSUMABLE_BUFF_CAP_SEC).toBe(4 * SHICHEN_SEC)
    expect(buffCapSec('buff_juling')).toBe(CONSUMABLE_BUFF_CAP_SEC)
    // 单颗时长不同的丹药,上限是同一个数 —— 玩家读到的「至多四个时辰」是同一句话
    const shortIds = PILLS.filter(p => p.buffId && buffDef(p.buffId)!.durationSec < 1800).map(p => p.buffId!)
    expect(shortIds.length, '内容里没有短时长丹药,这条判据形同虚设').toBeGreaterThan(0)
    for (const defId of shortIds) expect(buffCapSec(defId)).toBe(CONSUMABLE_BUFF_CAP_SEC)
  })

  it('造化丹给的 blessing 样 buff 也算消耗增益:同口径封顶', () => {
    // p_zaohua → bless_daoyun 的 kind 是 blessing,不是 pill —— 若按 kind 一刀切就漏了它
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
  // 一次性实例:endsAt = 施放时刻 + 单颗时长;nearCap = 距上限只剩 600 秒
  const once = (at: number) => [{ defId: 'buff_juling', endsAt: at + 1 * durSec * 1000 }]
  const nearCap = (at: number) => [{ defId: 'buff_juling', endsAt: at + (capSec - 600) * 1000 }]

  it('空列表不误报(否则提示就成了狼来了)', () => {
    expect(buffOverflowOf([], 'buff_juling', 0)).toBe('none')
  })

  it('刚服一颗 / 离上限还远:足额兑现 → none', () => {
    expect(buffOverflowOf(once(0), 'buff_juling', 0)).toBe('none')
    // 剩 600 秒(已过 1200),再服一颗余 2400,远未越限 —— 不报
    expect(buffOverflowOf(once(0), 'buff_juling', (durSec - 600) * 1000)).toBe('none')
  })

  it('贴着上限、加上去会越过:只延续到顶 → partial', () => {
    // 余量距上限只差 600,再服一颗(1800)会越过 —— 被削到上限
    expect(buffOverflowOf(nearCap(0), 'buff_juling', 0)).toBe('partial')
  })

  it('已经顶死:一点也加不上去 → full(界面报"这一颗白费了")', () => {
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
    // 单颗一炷香(30 分),连服 20 颗 = 10 小时 > 四个时辰,必然触顶
    for (let i = 0; i < 20; i++) cultivation.addBuff('buff_juling', t0)

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
    const full = 20 * buffDef('buff_juling')!.durationSec * 1000 // 10 小时,远超四个时辰
    // 恶意/老坏档:endsAt 与 added 都被撸到 10 小时 —— 模拟"无限囤"时代的残留
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

    inv.addPill('p_juling', 3)

    // 第一颗:足额 —— 正常反馈(此刻身上没有聚灵)
    expect(usePill('p_juling')).toBe(true)
    expect(lastToast()).toContain('药力化开')

    // 把聚灵顶到四个时辰(单颗 30 分 × 16 颗),再走过 15 分钟:
    // 余量距上限只差一刻钟,这一颗加上去会越过 —— 只延续到顶
    const cultivation = useCultivationStore()
    for (let i = 0; i < 16; i++) cultivation.addBuff('buff_juling', t0)
    vi.advanceTimersByTime(900 * 1000)
    expect(usePill('p_juling')).toBe(true)
    expect(lastToast()).toContain('只延续到顶')

    // 顶回四个时辰后当场再服:一点也加不上去 —— 白费
    expect(usePill('p_juling')).toBe(true)
    expect(lastToast()).toContain('这一颗白费了')
  })

  it('三种话术各在 toast 里真实出现过一次(防空转/防文案缺失)', () => {
    const t0 = 1_000_000
    vi.setSystemTime(t0)
    const inv = useInventoryStore()
    const ui = useUiStore()
    const cultivation = useCultivationStore()
    // toast 有 2.6 秒退出计时,而下面要跨 15 分钟推进游戏钟 —— 逐次收下文本,别指望最后还能翻到
    const seen: string[] = []
    const collectTitles = () => seen.push(ui.toasts[ui.toasts.length - 1]?.text ?? '')
    inv.addPill('p_juling', 3)
    // 足额:身上无聚灵时服一颗
    usePill('p_juling')
    collectTitles()
    // 只延续到顶:先把余量顶到距上限不足一颗,再服
    for (let i = 0; i < 16; i++) cultivation.addBuff('buff_juling', t0)
    vi.advanceTimersByTime(900 * 1000)
    usePill('p_juling')
    collectTitles()
    // 白费:此刻已经顶死
    usePill('p_juling')
    collectTitles()
    expect(seen.some(t => t.includes('药力化开'))).toBe(true)
    expect(seen.some(t => t.includes('只延续到顶'))).toBe(true)
    expect(seen.some(t => t.includes('这一颗白费了'))).toBe(true)
  })

  it('增益丹批量连服退化为单服:贴顶不静默,一句"白费了"说得明白', () => {
    const t0 = 1_000_000
    vi.setSystemTime(t0)
    const inv = useInventoryStore()
    const ui = useUiStore()
    const lastToast = () => ui.toasts[ui.toasts.length - 1]?.text ?? ''

    // 聚灵已经顶到四个时辰,手里还有 5 枚,想"连服 ×5"——
    // 批量路径必须退化成单服,而不是报一个误导性的「连服 5 枚」
    const cultivation = useCultivationStore()
    inv.addPill('p_juling', 5)
    // 手动把 buff 顶满(四个时辰),再造 5 枚库存
    for (let i = 0; i < 16; i++) cultivation.addBuff('buff_juling', t0)
    const eaten = usePillBatch('p_juling', 5)

    expect(eaten).toBe(1) // 只会吃 1 枚,不白白连吃 5 枚
    expect(inv.pills['p_juling'] ?? 0).toBe(4)
    expect(lastToast()).toContain('这一颗白费了')
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
    const full = 20 * buffDef('buff_juling')!.durationSec * 1000 // 10 小时,远超四个时辰
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
    expect(cultivation.buffs[0]!.endsAt).toBe(now + 5000) // 未过期、未过期:不受钳制原样保留
  })
})

/**
 * 服丹判「顶没顶」与写 `endsAt` 用的是**同一把钟**,且那把钟是游戏时钟。
 *
 * `enginePause` 头注释写着纪律:「可冻结的到期判定读 gameNow(),不要直接读 Date.now()」。
 * 界面(`useNow` → `gameNow()`)一直守着这条,而 `usePill` 从前两次直接读 `Date.now()`:
 * 暂停(重置 / 导入确认窗)期间心跳停了,墙钟照走 —— 界面按冻结时刻读「药力已至上限」,
 * 服务按走远的墙钟判 overflow 并写 endsAt,两处当场分叉;恢复后引擎再按暂停时长顺延一次,
 * 药力凭空多出一段。
 *
 * 故障注入:把 `usePill` 里的 `gameNow()` 改回 `Date.now()`,第一条判据必红
 * (暂停中服下的那一颗会被写成墙钟时刻,而不是冻结时刻)。
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
    // 暂停期间墙钟走了 10 分钟,游戏时钟纹丝不动
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

    // 先吃到接近上限,再在暂停中补一颗:判与写同一时刻,结果不该越过上限
    inv.addPill('p_juling', 60)
    for (let i = 0; i < 40; i += 1) usePill('p_juling', true)
    const buff = cultivation.buffs.find(b => b.defId === 'buff_juling')!
    expect(buff.endsAt, '暂停中写出的到期时刻越过了上限').toBeLessThanOrEqual(frozen + capMs)
    expect(buff.added).toBeLessThanOrEqual(capMs)
    expect(def.durationSec).toBeGreaterThan(0)
  })
})
