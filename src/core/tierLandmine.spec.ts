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
