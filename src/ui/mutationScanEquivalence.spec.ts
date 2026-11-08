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

  /**
   * 名单里的 text 必须是**变异扫描能产出的那个形状**。
   *
   * 上面那条只验「这段文字在源码里存在」—— 不够。变异扫描匹配的是正则捕获到的片段,
   * 与源码原文未必等长:
   *  · 守卫恒假的正则只捕到 `if (!x) return`,不含后面的返回值 ——
   *    写 `if (!x) return null` 就永远命中不了,名单形同虚设
   *  · 空判取反只把 `.length === 0)` 截下来,不含前面的池名
   *
   * 这类「文本对不上」不会报错,只会让该条静默失效 —— 正是审查点出来的第三条。
   */
  it('名单的 text 与变异扫描的匹配形状一致,不是源码原文的随手摘抄', () => {
    const NORM = (t: string): string => t.replace(/\s+/g, ' ').trim()
    /*
     * 与 mutation-scan.mjs 的 PATTERNS 同步。脚本里那份是内部常量、测试 import 不到,
     * 只能复刻;若将来改了正则,这里也要跟着改。
     */
    const PATTERNS: RegExp[] = [
      /if \((![A-Za-z_$][\w$.]*(?:\([^)]*\))?)\) return/g,
      /Math\.max\(0(?:\.\d+)?,\s*([^;()]+(?:\([^)]*\))?[^;()]*)\)/g,
      /\.length === 0\)/g
    ]
    const produced = (src: string): Set<string> => {
      const out = new Set<string>()
      for (const re of PATTERNS) {
        re.lastIndex = 0
        for (const m of src.matchAll(re)) out.add(NORM(m[0]!))
      }
      return out
    }
    for (const e of equivalentEntries()) {
      const src = readFileSync(resolve(ROOT, e.file), 'utf-8')
      const shapes = produced(src)
      expect(
        shapes.has(NORM(e.text)),
        `${e.file} 的条目「${e.text}」与变异扫描产出的形状对不上(扫描只会产出正则捕获的那一截),` +
          `这条永远不会命中 —— 同一文件里可用的形状有:${[...shapes].slice(0, 4).join(' | ')}`
      ).toBe(true)
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

/**
 * 分片轮转:CI 默认 limit=40,而全库有四百多个候选点。
 *
 * 定长取样时每天扫的都是同一批 —— CI 天天跑也只覆盖 8.8%,其余永远轮不到。
 * 现在按日期选分片,同一天内稳定、跨天推进,ceil(总数/LIMIT) 天覆盖全部。
 */
describe('变异扫描 · 分片轮转', () => {
  it('给定扫描脚本,当读它的分片逻辑,则确实按日期选片且显式 limit 不受日期影响', () => {
    const src = readFileSync(resolve(ROOT, 'scripts/mutation-scan.mjs'), 'utf-8')
    expect(src, '分片数该由「总数 / LIMIT」算出').toMatch(/shardCount\s*=\s*Math\.max\(1,\s*Math\.ceil\(all\.length\s*\/\s*LIMIT\)\)/)
    expect(src, '分片下标该由 advance 取模算出').toMatch(/advance\s*%\s*shardCount/)
    expect(src, 'CI 里有单调递增的 run number 时该优先用它').toMatch(/process\.env\.GITHUB_RUN_NUMBER/)
    expect(src, '显式 --limit 时不该被推进依据干扰').toMatch(/explicit\s*\?\s*0\s*:\s*advance/)
  })

  it('给定 455 个候选点与上限 40,当用源码里的切片表达式逐片取样,则 12 片无重无漏且相邻天不重叠', () => {
    /*
     * 不能在这里自己重写一遍分片算法 —— 那验的是复制品,源码里的 all.slice(...) 改了也照样绿。
     * 改为从源码抠出那一行表达式,用 new Function 求值,验的才是真在跑的逻辑。
     */
    const src = readFileSync(resolve(ROOT, 'scripts/mutation-scan.mjs'), 'utf-8')
    const sliceLine = /found\.push\(\.\.\.(all\.slice\([^)]*\))\)/.exec(src)?.[1]
    expect(sliceLine, '源码里找不到分片取样的那一行').toBeTruthy()
    const pick = (all: number[], LIMIT: number, shard: number): number[] =>
      new Function('all', 'LIMIT', 'shard', `return ${sliceLine}`)(all, LIMIT, shard) as number[]

    const total = 455
    const LIMIT = 40
    const all = Array.from({ length: total }, (_, i) => i)
    const shardCount = Math.max(1, Math.ceil(all.length / LIMIT))
    expect(shardCount, '455 个点按 40 一片该是 12 天一轮').toBe(12)

    const flat: number[] = []
    for (let d = 0; d < shardCount; d += 1) flat.push(...pick(all, LIMIT, d))
    expect(flat.length, '全部分片拼起来与总数不符').toBe(total)
    expect(new Set(flat).size, '分片之间有重复').toBe(total)

    // 相邻两片不重叠,且每片恰好 LIMIT 个(末片可以是余数)
    for (let d = 0; d + 1 < shardCount; d += 1) {
      const a = new Set(pick(all, LIMIT, d))
      expect(pick(all, LIMIT, d + 1).some(x => a.has(x)), `第 ${d} 与 ${d + 1} 片重叠了`).toBe(false)
      expect(a.size).toBe(LIMIT)
    }
  })
})
