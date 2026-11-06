/**
 * 变异扫描的等价名单。
 *
 * 这份名单存在的理由:扫描一次报一堆「漏」,真盲区和等价变异混在一起,
 * 分不清该补哪条 —— 于是这份报告没人看,工具等于没用。
 *
 * 但它也会退化成一块遮羞布:往里塞一条「等价」,眼不见为净。
 * 下面三条就是防这个的:
 *   一 每条必须写理由,且理由得说得出话(不是「不影响」「无意义」这种糊弄话)
 *   二 名单里的条目必须真的能在源码里匹配到 —— 否则是过期条目,在假装干活
 *   三 等价变异不计入退出码,但漏掉的必须计入 —— 别为了让报告好看把该红的弄绿
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const SRC = readFileSync(resolve(ROOT, 'scripts/mutation-scan.mjs'), 'utf-8')

/** 从脚本源码里抠出 EQUIVALENT 数组的字面量条目(不动脚本导出,免得为测试加导出) */
function equivalentEntries(): { file: string; text: string; why: string }[] {
  const block = /const EQUIVALENT = \[([\s\S]*?)\n\]/.exec(SRC)?.[1]
  if (!block) throw new Error('脚本里找不到 EQUIVALENT 名单')
  return [...block.matchAll(/file:\s*'([^']+)',\s*text:\s*'((?:[^'\\]|\\.)*)',\s*why:\s*'((?:[^'\\]|\\.)*)'/g)].map(m => ({
    file: m[1]!,
    text: m[2]!.replace(/\\'/g, "'"),
    why: m[3]!.replace(/\\'/g, "'")
  }))
}

describe('变异扫描 · 等价名单', () => {
  it('名单非空,且每条都写了理由', () => {
    const entries = equivalentEntries()
    expect(entries.length, '一条都没有:名单机制形同虚设').toBeGreaterThan(0)
    for (const e of entries) {
      expect(e.why.trim().length, `${e.file} 的「${e.text}」没写理由`).toBeGreaterThan(10)
    }
  })

  it('理由不是糊弄话 —— 要指名道姓说出为什么改不出差别', () => {
    const WEAK = /^(不影响|无影响|无意义|等价|没问题|无关)$/
    for (const e of equivalentEntries()) {
      expect(WEAK.test(e.why.trim()), `${e.file} 的理由「${e.why}」等于没说`).toBe(false)
      // 实质理由须提到具体事实:常量名、数值、字段名、函数名里的任意一类
      expect(e.why, `${e.file} 的理由没说出具体依据`).toMatch(/[A-Za-z_][A-Za-z0-9_]{2,}|\d/)
    }
  })

  it('每条都能在源码里真的匹配到 —— 过期条目在假装干活', () => {
    for (const e of equivalentEntries()) {
      const target = resolve(ROOT, e.file)
      let src: string
      try {
        src = readFileSync(target, 'utf-8')
      } catch {
        throw new Error(`名单指向的文件不存在:${e.file}`)
      }
      // 与脚本同一口径:压掉空白差异
      const norm = (t: string) => t.replace(/\s+/g, ' ').trim()
      expect(norm(src), `${e.file} 里已经找不到「${e.text}」了,这条名单该删`).toContain(norm(e.text))
    }
  })

  it('等价跳过不计入退出码,漏掉的必须计入', () => {
    // 退出条件只看 missed 与 infra —— 等价的是缺陷吗?不是,但它也不该掩盖漏
    const tail = SRC.slice(SRC.indexOf('if (skipped.length > 0)'))
    expect(tail, '漏掉的必须计入退出码').toContain('missed.length > 0')
    expect(tail, '设施故障也必须计入退出码').toContain('infra.length > 0')
    expect(tail, '等价变异不该让退出码为 1').not.toMatch(/skipped\.length > 0 \|\|/)
  })

  it('名单按「文件 + 归一化原文」匹配,不按行号', () => {
    // 行号会随无关改动漂移,按行号匹配的名单过几天就全失效
    expect(SRC, '应该用等价判定函数').toContain('function equivalentOf')
    expect(SRC, '匹配时该归一化空白').toContain('replace(/\\s+/g, \' \')')
    expect(SRC, '不该按行号匹配').not.toMatch(/EQUIVALENT\.find\([^)]*\.line/)
  })
})
