/**
 * scripts/mutation-scan.mjs 的等价名单守卫(该脚本的扫描本身不在 CI 里跑)。
 *
 * 等价名单是「改了但改不出可见差别」的白名单。它有两个会**悄悄腐化**的方向:
 *  1. 死条目:被豁免的那段代码已经改掉/删掉,条目还留着 —— 白名单越积越多,
 *     扫描的严格性被无声削弱,而且没人看得到。
 *  2. 缺理由:只写「等价」不写为什么,下一个人无从判断该不该推翻它。
 * 两条都不是理论问题:名单里 periods 提到过「同一个模块两处同形守卫」的误判。
 *
 * 这里只查这两件。性价比判断(该不该判等价)仍然要人读代码。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const SCAN = readFileSync(resolve(ROOT, 'scripts/mutation-scan.mjs'), 'utf8')

/** 从扫描脚本里抠出 EQUIVALENT 数组的正文(到下一个顶层 `]` 为止) */
function equivalentBody(): string {
  const start = SCAN.indexOf('const EQUIVALENT = [')
  expect(start, '找不到 EQUIVALENT 名单 —— 改名了就要同步改这里').toBeGreaterThan(-1)
  return SCAN.slice(start, SCAN.indexOf('\n]', start))
}

/** 名单条目:{ file, text, why } */
function entries(): { file: string; text: string; why: string }[] {
  const body = equivalentBody()
  const out: { file: string; text: string; why: string }[] = []
  // 每条以 `{\n    file: '…',` 起头,到下一个 `  },` 收尾
  for (const m of body.matchAll(/\{\s*file:\s*'([^']+)',\s*text:\s*'([^']+)',\s*why:\s*'((?:[^'\\]|\\.)*)'/g)) {
    out.push({ file: m[1]!, text: m[2]!, why: m[3]! })
  }
  return out
}

describe('变异扫描的等价名单', () => {
  it('名单读得出来(空名单会让下面几条恒真)', () => {
    expect(entries().length, '一条都没解析出来 —— 格式变了?').toBeGreaterThan(10)
  })

  it('没有死条目:被豁免的原文必须仍在那个文件里', () => {
    const dead = entries().filter(({ file, text }) => {
      const abs = resolve(ROOT, file)
      if (!existsSync(abs)) return true
      return !readFileSync(abs, 'utf8').includes(text)
    })
    expect(
      dead.map(d => `${d.file}: 「${d.text}」`),
      '这些条目豁免的代码已经不存在了 —— 删掉条目,否则白名单在无声放水'
    ).toEqual([])
  })

  it('每条都写了理由,且理由不是套话', () => {
    const thin = entries().filter(({ why }) => why.trim().length < 12)
    expect(
      thin.map(t => `${t.file}: 「${t.why}」`),
      '「等价」两个字不是理由 —— 要写清为什么改不出可见差别'
    ).toEqual([])
  })

  it('理由里不许出现「应该是」「大概」这类没读代码的措辞', () => {
    const guessy = entries().filter(({ why }) => /应该是|大概|估计可能|没细看/.test(why))
    expect(
      guessy.map(t => `${t.file}: 「${t.why}」`),
      '名单的门槛是读过代码确认过,不是猜的'
    ).toEqual([])
  })
})
