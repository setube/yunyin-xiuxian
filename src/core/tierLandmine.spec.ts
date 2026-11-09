/**
 * 层级地雷:stoneByTier 的 tier 实参不许直接拿境界大阶 major 顶。
 *
 * AGENTS.md 把这条列成「反复踩过」:灵石相关的报价/奖励/花费曲线一律骑
 * `maxTierForMajor(major)` 的真实区域阶梯(至 32 阶),而 major 只有 0~20。
 * 坊市装备价、悬赏贡器门槛、playerTier 都曾固死在旧尺 `min(20, major*2+2)` 上,
 * 在混沌道祖处偏约 2.2e5 倍才被发现。
 *
 * 现有三个入口名不同但都委托到 maxTierForMajor:
 *   core/secretRealm.ts 的 tierOfMajor
 *   core/marketService.ts 的 marketTier
 *   data/market.ts 直接调 maxTierForMajor
 * 名字不同正是容易认错的地方,故本条按「实参里出现裸 major」来判,不看调用的是哪个入口。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { maxTierForMajor } from '@/data/regions'
import { MAX_MAJOR } from '@/data/realms'
import { STONE_DROP_BASE, STONE_TIER_GROWTH } from '@/data/constants'
import { stoneByTier } from './formulas'
import { toNum } from '@/utils/gnum'

function coreFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.spec.ts')) out.push(full)
    }
  }
  walk('src/core')
  walk('src/data')
  return out
}

describe('层级地雷 · stoneByTier 的 tier 来源', () => {
  it('没有任何一处把裸 major 直接喂给 stoneByTier', () => {
    const bad: string[] = []
    for (const file of coreFiles()) {
      const text = readFileSync(file, 'utf-8')
      for (const m of text.matchAll(/stoneByTier\(\s*([^,)]+)/g)) {
        const arg = m[1]!.trim()
        // 先过 maxTierForMajor / marketTier / tierOfMajor 再传的,都是对的
        if (/maxTierForMajor|marketTier|tierOfMajor/.test(arg)) continue
        // 实参里出现 major 就报警(含 player.major、major、def.minRealm 之外的写法)
        if (/\bmajor\b/i.test(arg)) {
          const line = text.slice(0, m.index).split('\n').length
          bad.push(`${file}:${line} stoneByTier(${arg})`)
        }
      }
    }
    expect(bad, `这些地方拿境界大阶当层级用:\n${bad.join('\n')}`).toEqual([])
  })

  it('maxTierForMajor 确实铺到 32 阶(而不是跟 major 一样的 21 档)', () => {
    const atMax = maxTierForMajor(MAX_MAJOR)
    expect(atMax, '满级只到 21 阶,说明还在用旧尺').toBeGreaterThan(MAX_MAJOR)
    expect(atMax, '真实阶梯按文档应为 32 阶').toBeGreaterThanOrEqual(32)
  })

  it('maxTierForMajor 随境界单调不减,且不从 0 开始', () => {
    let prev = -1
    for (let m = 0; m <= MAX_MAJOR; m += 1) {
      const t = maxTierForMajor(m)
      expect(t, `major=${m} 时层级倒退`).toBeGreaterThanOrEqual(prev)
      expect(t, `major=${m} 时层级为 ${t},不合理`).toBeGreaterThanOrEqual(1)
      prev = t
    }
  })

  it('marketTier 与 tierOfMajor 都仍委托到 maxTierForMajor(不是各写一套)', () => {
    const market = readFileSync('src/core/marketService.ts', 'utf-8')
    const secret = readFileSync('src/core/secretRealm.ts', 'utf-8')
    expect(market, 'marketTier 不再委托 maxTierForMajor').toMatch(
      /export function marketTier\(major: number\): number \{\s*return maxTierForMajor\(major\)/
    )
    expect(secret, 'tierOfMajor 不再委托 maxTierForMajor').toMatch(
      /export function tierOfMajor\(major: number\): number \{\s*return maxTierForMajor\(major\)/
    )
  })
})


/**
 * 阶梯的**增长速率**也是地雷:1.3 / 1.9 / 2.5 在 32 阶上差出 9 个数量级
 * (3.4e3 / 4.4e8 / 2.2e12)。而 STONE_DROP_BASE 与 STONE_TIER_GROWTH 此前没有任何判据钉着 ——
 * 既有两处 spec 用它们算期望值(跟随常量变),改成 1.3 也照样全绿。
 *
 * 1.9 是**收入增长率的镜像**(见 endgameService 的「灵石收入按 1.9^层级 涨」):
 * 报价曲线与收入曲线同一条,玩家跨一层时购买力才不会塌或暴涨。
 */
describe('层级地雷 · stoneByTier 的增长速率', () => {
  it('给定层级阶梯,当算相邻两层的价,则每层恒乘 STONE_TIER_GROWTH', () => {
    for (const tier of [2, 10, 20, 32]) {
      const cur = toNum(stoneByTier(tier, 10))
      const prev = toNum(stoneByTier(tier - 1, 10))
      expect(cur / prev, `第 ${tier} 层相对第 ${tier - 1} 层该乘 ${STONE_TIER_GROWTH}`).toBeCloseTo(
        STONE_TIER_GROWTH,
        6
      )
    }
  })

  it('给定增长系数,当读常量,则仍是与收入同步的 1.9', () => {
    // 改这个数要先核收入侧:economySim / 掉落 / 悬赏都读同一条曲线
    expect(STONE_TIER_GROWTH, '灵石收入与报价共用这条增长率,改它等于重定整条经济').toBe(1.9)
    expect(STONE_DROP_BASE, '掉落基准同理,改动会整体平移所有价签').toBe(12)
  })

  it('给定 1→32 阶,当算总倍数,则落在「亿级」而不是「千级」或「万亿级」', () => {
    const total = toNum(stoneByTier(32, 10)) / toNum(stoneByTier(1, 10))
    // 1.9^31 ≈ 4.4e8。宽区间只验数量级 —— 钉死具体值会让「改增长率」变成必须解方程
    expect(total, '1→32 阶的总倍数该是亿级').toBeGreaterThan(1e7)
    expect(total, '也不该到万亿级').toBeLessThan(1e10)
  })
})
