/**
 * 失败提示必须是 warn 级,不能是 info。
 *
 * 三种级别在界面上是三种颜色:`success` 绿、`warn` 纸红、`info` 灰。
 * 灰条在本仓的语义是「中性状态」(「悬赏已刷新」「货架已刷新」「已取消导出」),
 * 而失败若也走灰条,玩家扫一眼分不出「事情成了但没变化」与「事情根本没成」。
 *
 * 实测发现一处:`CreateView` 建号失败时用的是 info —— 建号失败意味着进不了游戏,
 * 却和「悬赏已刷新」长一个样。全仓其它 catch 块(复制失败、导出失败)都是 warn,
 * 这一处是孤例。
 *
 * 判据只查 `catch` 块内的 toast:那是「失败」语义最明确的锚点,
 * 不按文案里的关键字硬扫(「未」「不足」在成功路径里也常见,会误报)。
 *
 * 故障注入:把 CreateView 的 'warn' 改回 'info' → 本条红。
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name)
    if (e.isDirectory()) walk(f, out)
    else if (/\.(ts|vue)$/.test(e.name) && !e.name.endsWith('.spec.ts')) out.push(f)
  }
  return out
}

const SRC = resolve(__dirname, '..')

/** 取所有 `catch` 之后的块文本(粗略但够用:catch 后到下一个同级 `}`) */
function catchBlocks(src: string): string[] {
  const out: string[] = []
  const re = /catch\s*(?:\([^)]*\))?\s*\{/g
  for (const m of src.matchAll(re)) {
    const start = m.index! + m[0].length
    let depth = 1
    let i = start
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth += 1
      else if (src[i] === '}') depth -= 1
      i += 1
    }
    out.push(src.slice(start, i))
  }
  return out
}

describe('失败提示的级别', () => {
  it('catch 块里的 toast 一律是 warn,不用 info', () => {
    const offenders: string[] = []
    for (const f of walk(SRC)) {
      const src = readFileSync(f, 'utf-8')
      if (!src.includes('catch')) continue
      for (const block of catchBlocks(src)) {
        for (const m of block.matchAll(/toast\(\s*(['"`])([^'"`]{1,60})\1\s*,\s*'info'/g)) {
          offenders.push(`${f.replace(SRC + '/', '')}  「${m[2]}」`)
        }
      }
    }
    expect(offenders, `这些 catch 块里的失败提示用了 info(灰条),玩家分不出成没成:\n${offenders.join('\n')}`).toEqual([])
  })

  it('健在性:至少有一条 catch 里的 warn,证明扫描没扫空', () => {
    // 若上面的 walk 或 catchBlocks 坏了,第一条会因 offenders 为空而「假绿」
    let warnCount = 0
    for (const f of walk(SRC)) {
      const src = readFileSync(f, 'utf-8')
      if (!src.includes('catch')) continue
      for (const block of catchBlocks(src)) {
        warnCount += (block.match(/toast\([^)]*'warn'/g) ?? []).length
      }
    }
    expect(warnCount, '一条 catch 里的 warn 都没扫到 —— 扫描本身失效了').toBeGreaterThan(0)
  })
})
