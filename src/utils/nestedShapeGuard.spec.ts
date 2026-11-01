/**
 * store 里的嵌套存档对象,不许只判「是不是对象」就把内部字段原样收下。
 *
 * 这条线在 152~154 轮审出三个真实缺陷,形状完全一样:
 *   · resources.spiritStone —— gn() 不限指数,坏档印出「1.00e1000000000」
 *   · 虚界远征 world.rules —— playerStartHpPct 写 Infinity,玩家一进战斗即判负
 *   · 凡人界 world.rules —— 同上,是指向同一个 resolveCombat 的另一个入口
 * 共同点:字段确实「存在」也确实是对象,所以 storeResilience 那种「sanitize 有没有」
 * 的守卫一路放行,问题只在内部字段从不校验时才暴露。
 *
 * 判据:对每个 `typeof X === 'object'`,看它之后 600 字符内有没有字段级守卫
 * (asFiniteNumber / asBoundedGNum / Number.isFinite / asStringArray / 枚举 includes 等)。
 *
 * 窗口取 600 而不是更小,是因为有些修形在 for 循环里、字段校验在几行之后
 * (如 resources 的 herbByGrade);200 字符会误报 6 处,全都不是真缺口。
 * 判据宁宽勿严:漏报一处只是少一条提示,误报会逼着后来人给正常代码打补丁。
 *
 * 已知局限:它抓的是「整块字段被原样拷贝」这种形态 —— 也就是 152~154 轮那三个
 * 缺陷的样子(`rules: w.rules ? w.rules : {}`)。若有人写了字段级修形的一部分、
 * 却漏掉某个具体字段,本条看不出来(那要靠各 store 自己的用例)。
 * 第三条专盯战斗规则那两个入口,就是为了给「整块拷」这种最危险的形态留一道硬闸。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const FIELD_GUARDS =
  /asFiniteNumber|asBoundedGNum|asNonNegInt|Number\.isFinite|asStringArray|asNumberRecord|asRecord|asArray|asCombatRules|asPerRounds|isSpec|clamp\w+|\.includes\(| in [A-Z]/

function storeFiles(): string[] {
  return readdirSync('src/stores')
    .filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map(f => join('src/stores', f))
}

describe('嵌套存档对象 · 内部字段要有守卫', () => {
  it('扫到了 store 文件与若干 typeof object 判断(防空转)', () => {
    expect(storeFiles().length).toBeGreaterThan(10)
    let n = 0
    for (const f of storeFiles()) n += (readFileSync(f, 'utf-8').match(/typeof\s+[\w.]+\s*===\s*'object'/g) ?? []).length
    expect(n, '一个 typeof object 判断都没扫到,判据失效').toBeGreaterThan(10)
  })

  it('每个 typeof object 判断之后都有字段级守卫', () => {
    const bad: string[] = []
    for (const file of storeFiles()) {
      const text = readFileSync(file, 'utf-8')
      for (const m of text.matchAll(/typeof\s+[\w.]+\s*===\s*'object'/g)) {
        const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 600)
        if (FIELD_GUARDS.test(after)) continue
        const line = text.slice(0, m.index).split('\n').length
        bad.push(`${file}:${line}`)
      }
    }
    expect(bad, `这些地方只判了「是不是对象」,内部字段没修形:\n${bad.join('\n')}`).toEqual([])
  })

  it('战斗规则的两处入口都用共享的 asCombatRules', () => {
    const adv = readFileSync('src/stores/adventure.ts', 'utf-8')
    const end = readFileSync('src/stores/endgame.ts', 'utf-8')
    expect(adv, '凡人界规则须经 asCombatRules').toContain('asCombatRules(w.rules)')
    expect(end, '虚界规则须经 asCombatRules').toContain('asCombatRules(w.rules)')
    // 旧的「只判类型」写法不许回来
    expect(adv, 'adventure 的旧写法不许回来').not.toContain("w.rules && typeof w.rules === 'object'")
    expect(end, 'endgame 的旧写法不许回来').not.toContain("w.rules && typeof w.rules === 'object'")
  })
})
