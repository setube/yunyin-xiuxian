/**
 * 师承契合的形制。
 *
 * 弹窗原先写「当下契合 +1.00 / 1.0」,四个师承里三个都是 +1.00 ——
 * 那个数是「加权计数 ÷ 常数」再钳位的结果,原始分 8.69 / 2.55 / 7.27 的差别被抹平;
 * 更要紧的是计数器只增、权重全正,式子只能得非负值,`affinity < −0.2` 的
 * 「未纯」永远打不出来 —— `data/mentors.ts` 里四段 unaligned 叙事是死内容。
 *
 * 四条判据:
 *   一 四门分账:份额之和为 1,故四门可横向比,且不可能同时满分。
 *   二 三档都可达:契合 / 中正 / 未纯,一档也不许是死分支。
 *   三 判据只看相对位置:前期杀十只与后期杀十万只,只要都只做这一门,评价同档。
 *   四 界面真的接上了,十格印是可数的形制,不靠颜色连续量。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MENTORS, type MentorId } from '@/data/mentors'
import { mentorVerdict } from '@/core/mentorService'
import { useQuestsStore } from '@/stores/quests'
import { shareMark, sharePips, SHARE_PIPS } from './mentorShare'
import { mentorTierOf } from '@/core/mentorService'
import { UNALIGNED_RATIO } from '@/core/mentorService'

const ROOT = resolve(__dirname, '../..')
const DIALOG = readFileSync(resolve(ROOT, 'src/components/character/MentorDialog.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

const IDS = MENTORS.map(m => m.id)

/**
 * 摆出某一门的作为,其余留空。
 * 计数器的权重各门不同(阵修一次经营只值 0.4),故按权重折算,好让「同样多」真的同样多。
 */
function only(mentorId: MentorId, strength = 100): void {
  const q = useQuestsStore()
  const { key, weight } = {
    swordsman: { key: 'kills', weight: 1 },
    alchemist: { key: 'pillsCrafted', weight: 1 },
    arraymaster: { key: 'buildingUpgrades', weight: 0.4 },
    hunter: { key: 'explores', weight: 1 }
  }[mentorId]
  q.inc(key as never, Math.round(strength / weight))
}

describe('师承契合 · 一、四门分账', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('四门份额之和为 1 —— 这是它们能横向比的原因', () => {
    const q = useQuestsStore()
    q.inc('kills', 900)
    q.inc('pillsCrafted', 120)
    q.inc('buildingUpgrades', 25)
    q.inc('explores', 300)
    const sum = IDS.reduce((s, id) => s + (mentorVerdict(id)?.share ?? 0), 0)
    expect(sum).toBeCloseTo(1, 6)
  })

  it('中后期不再三门同时满格 —— 旧实现的 8.69 / 2.55 / 7.27 被钳成一样的 1.00', () => {
    const q = useQuestsStore()
    q.inc('kills', 900)
    q.inc('bossKills', 40)
    q.inc('breakthroughs', 30)
    q.inc('pillsCrafted', 120)
    q.inc('pillsUsed', 60)
    q.inc('buildingUpgrades', 25)
    q.inc('offlineClaims', 15)
    q.inc('explores', 300)
    q.inc('equipsGained', 200)
    q.inc('events', 90)
    const shares = IDS.map(id => mentorVerdict(id)!.share)
    expect(new Set(shares.map(s => s.toFixed(2))).size, `四门份额应有区分,实得 ${shares.join(' / ')}`).toBeGreaterThan(1)
    for (const s of shares) expect(s).toBeLessThanOrEqual(1)
  })
})

describe('师承契合 · 二、三档都可达', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('只做一门时,这一门契合,其余三档未纯 —— 未纯不是死分支', () => {
    for (const id of IDS) {
      setActivePinia(createPinia())
      only(id)
      expect(mentorVerdict(id)!.tier, `${id} 应契合`).toBe('aligned')
      for (const other of IDS) {
        if (other === id) continue
        expect(mentorVerdict(other)!.tier, `${id} 主导时 ${other} 应未纯`).toBe('unaligned')
      }
    }
  })

  it('四门均衡时判中正 —— 中间那一档也活着', () => {
    for (const id of IDS) only(id)
    for (const id of IDS) expect(mentorVerdict(id)!.tier, `${id} 应中正`).toBe('neutral')
  })

  it('还没有任何作为时不判档 —— 份额无从谈起,给中性文案', () => {
    for (const id of IDS) {
      const v = mentorVerdict(id)!
      expect(v.share).toBe(0)
      expect(v.tier).toBe('neutral')
      expect(v.line).toContain('不语')
    }
  })

  /**
   * `mentorTierOf` 头一句是 `if (!(topShare > 0) || !Number.isFinite(share) || share <= 0)` ——
   * 三道守卫共用一个返回:有 topShare 时给 `unaligned`,没有时给 `neutral`。
   *
   * 上面三条只验过「还没有任何作为」那一种(topShare=0 → neutral);
   * 坏值那两条(`NaN` / 负份额)从未被断言过。它们在生产里应该走不到
   * (share 由 domainStrength 算,不会是负数),但守卫立在那儿就该有判据锁住意图 ——
   * 哪天有人在算式里加了个减法又没夹零,这里必须仍然不判档。
   *
   * 故障注入:把 `!Number.isFinite(share) || share <= 0` 一段删掉,本条红。
   */
  it('坏份额(NaN / 负数)不判档:有 topShare 时归未纯,没有时归中性', () => {
    expect(mentorTierOf(Number.NaN, 0.5, 4), 'NaN 份额不该被当成可比数').toBe('unaligned')
    expect(mentorTierOf(-1, 0.5, 4), '负份额不该被当成可比数').toBe('unaligned')
    expect(mentorTierOf(Number.NaN, 0, 4), '无从谈起时仍归中性,不因坏值翻成未纯').toBe('neutral')
    expect(mentorTierOf(0, 0.5, 4), '零份额等同「没有」').toBe('unaligned')
  })

  it('数据表里四段未纯叙事如今都真的会被念出来', () => {
    for (const id of IDS) {
      setActivePinia(createPinia())
      // 让别的门远强于它
      only(id === 'swordsman' ? 'alchemist' : 'swordsman', 1000)
      const v = mentorVerdict(id)!
      expect(v.tier).toBe('unaligned')
      expect(v.line).toBe(MENTORS.find(m => m.id === id)!.narrative.unaligned)
    }
  })
})

describe('师承契合 · 三、判据只看相对位置', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('杀十只与杀十万只,只要都只做这一门,评价同档', () => {
    const q = useQuestsStore()
    q.inc('kills', 10)
    const early = mentorVerdict('swordsman')!
    const earlyShare = early.share
    const earlyTier = early.tier
    // 十万倍之后
    q.inc('kills', 100_000)
    const late = mentorVerdict('swordsman')!
    expect(late.tier).toBe(earlyTier)
    expect(late.share).toBeCloseTo(earlyShare, 6)
  })

  it('未纯的门槛就是「最多的是自己的两倍」,不是写死的份额', () => {
    // 1 : 3 → 最多的是自己的三倍,未纯
    expect(shareMark(0.2, 0.6, IDS.length).tier).toBe('unaligned')
    // 1 : 1.3 → 差不到一倍,中正
    expect(shareMark(0.24, 0.31, IDS.length).tier).toBe('neutral')
    // 恰好一倍:门槛写的是 >= 两倍,一倍整即为未纯
    expect(shareMark(0.2, 0.4, IDS.length).tier).toBe('unaligned')
    expect(UNALIGNED_RATIO).toBe(2)
  })
})

describe('师承契合 · 四、十格印', () => {
  it('份额落成整格,四舍五入,封顶十格', () => {
    expect(sharePips(shareMark(0, 0, IDS.length).pips).filter(Boolean)).toHaveLength(0)
    expect(sharePips(shareMark(0.5, 0.5, IDS.length).pips).filter(Boolean)).toHaveLength(5)
    expect(sharePips(shareMark(1, 1, IDS.length).pips).filter(Boolean)).toHaveLength(SHARE_PIPS)
    // 越界不产生负数格或超长数组
    expect(sharePips(-3)).toHaveLength(SHARE_PIPS)
    expect(sharePips(99)).toHaveLength(SHARE_PIPS)
    expect(sharePips(Number.NaN).filter(Boolean)).toHaveLength(0)
  })

  it('格数按份额单调增 —— 否则十格印读不出高低', () => {
    let last = -1
    for (let i = 0; i <= 10; i++) {
      const pips = shareMark(i / 10, 1, IDS.length).pips
      expect(pips).toBeGreaterThanOrEqual(last)
      last = pips
    }
  })

  it('百分比与格数同源:都是同一份 share', () => {
    const m = shareMark(0.573, 0.573, IDS.length)
    expect(m.pct).toBe(57)
    expect(m.pips).toBe(6)
  })
})

describe('师承契合 · 五、界面接上了', () => {
  it('弹窗读的是十格印与档名,不再写「/ 1.0」', () => {
    expect(DIALOG, '弹窗没有接 shareMark').toContain('shareMark(')
    expect(DIALOG, '弹窗没有渲染十格印').toContain('sharePips(')
    expect(DIALOG, '弹窗仍在写旧的 / 1.0 标尺').not.toContain('/ 1.0')
  })

  it('档位色只取既有语义 token,且十格印不吃指针事件', () => {
    const seg = CSS.slice(CSS.indexOf('.mentor-pips'), CSS.indexOf('/* =================', CSS.indexOf('.mentor-pips')))
    // 十格印用 currentColor 继承档位色,自身不引入任何颜色名
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['ink', 'ink-faint', 'jade', 'cinnabar'], `新造了色 ${m[1]}`).toContain(m[1])
    }
    expect(block('.mentor-pips')).toContain('pointer-events: none')
  })
})
