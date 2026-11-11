/** dead → 冒烟判失败(exitCode 1) */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifySmoke, namePattern, SMOKE_ALLOWLIST } from '../../scripts/smoke-classify'

describe('冒烟死按钮分类器(纯决策)', () => {
  it('幂等选中项(白名单)归读数 —— 点当前已选中值,不判失败', () => {
    // 战报速度 ×1(已选中)
    const d = classifySmoke('/settings', 'page', '×1', null)
    expect(d.bucket).toBe('silent')
    expect(d.line, '应点明白是幂等选中项').toContain('幂等选中项')
    // 主题跟随系统(已选中)
    const t = classifySmoke('/settings', 'page', '跟随系统', null)
    expect(t.bucket).toBe('silent')
  })

  it('干净重试有变化(功能正常)归读数,抑制全流程误报', () => {
    const d = classifySmoke('/adventure', 'page', '出发', true)
    expect(d.bucket).toBe('silent')
    expect(d.line, '报成功能正常以别于死按钮').toContain('功能正常')
  })

  it('干净重试仍无变化 = 真死控件,判失败', () => {
    const d = classifySmoke('/adventure', 'page', '出发', false)
    expect(d.bucket).toBe('dead')
  })

  it('干净态无法单独复现(如弹窗按钮在干净态未开)归读数,不误伤', () => {
    const d = classifySmoke('/alchemy', 'modal', '结清', null)
    expect(d.bucket).toBe('silent')
    expect(d.line, '报成无法复现').toContain('无法单独复现')
  })

  it('空行格式:page 与 modal 的动词区分,dead 行即原样条目', () => {
    expect(classifySmoke('/a', 'page', 'X', false).line).toBe('/a 点「X」')
    expect(classifySmoke('/a', 'modal', 'X', false).line).toBe('/a 弹窗内点「X」')
  })

  it('白名单保持三条幂等选中项 —— 未来去重不得静默把工作控件翻成死按钮', () => {
    expect(SMOKE_ALLOWLIST).toContain('/settings 点「×1」')
    expect(SMOKE_ALLOWLIST).toContain('/settings 点「跟随系统」')
    expect(SMOKE_ALLOWLIST).toContain('/inventory 弹窗内点「不设」')
  })

  it('namePattern 定位同一按钮:在捕获到的空白处容忍空白多寡,别处不松口', () => {
    expect(namePattern('战 力▸拆解').test('战 力▸拆解')).toBe(true)
    expect(namePattern('战 力▸拆解').test('战  力▸拆解')).toBe(true)
    expect(namePattern('出发').test('出发')).toBe(true)
    expect(namePattern('出发').test('别处')).toBe(false)
    expect(namePattern('战 力▸拆解').test('战 力 ▸ 拆解')).toBe(false)
  })

  /*
   * 带动态数值的按钮名。
   *
   * 「深入探寻小险 … 一胜约 219 石」里的数值是当次生成的,下一轮再点必然换数。
   * 按字面精确匹配的话 cleanRetry 永远找不到它,一律判成「干净态无法单独复现」
   * —— 那条读数是假的,该按钮其实从未被单独验证过。
   */
  it('namePattern 容忍按钮名里的动态数字,但文字骨架仍须逐字相同', () => {
    const a = '深入探寻小险 行程 1小时0分 · 收益 ×1.4 · 一胜约 219 石 · 36 修为'
    const b = '深入探寻小险 行程 1小时0分 · 收益 ×1.4 · 一胜约 7.065万 石 · 36 修为'
    expect(namePattern(a).test(b), '数值换了也该认得出是同一枚按钮').toBe(true)
    expect(namePattern(a).test(a)).toBe(true)
    // 文字变了不认
    expect(namePattern(a).test(b.replace('深入', '浅出'))).toBe(false)
    expect(namePattern(a).test(b.replace('小险', '大险'))).toBe(false)
    // 不带数字的名字不受影响
    expect(namePattern('出发').test('出发')).toBe(true)
    expect(namePattern('出发').test('出发了')).toBe(false)
  })
})

/**
 * 冒烟取按钮的口径 —— 两处都曾经让整页空跑。
 *
 *  一 **只取 getByRole('button') 会漏掉标签组**。`InkTabs` 渲染的是 `role="tab"`,
 *    那是 WAI-ARIA 的正确写法(整组只留一个 tabindex=0,靠左右键走)——
 *    /codex 与 /collection 两页的按钮全是 tab,于是它们在此脚本里一次都没被点过。
 *  二 **先切再筛会把名额让给提示条的「×」**。`slice(0, DEPTH)` 之后在循环里 continue,
 *    那几个关闭钮占掉了 12 个名额,真正的入口卡被挤到切片之外。
 *
 * 两处都不报错:全局点击数仍然够,只是那几页空跑。
 */
describe('冒烟取按钮 · 两处口径', () => {
  const RAW = readFileSync(resolve(__dirname, '../../scripts/ui-smoke.mjs'), 'utf-8')
  /**
   * 剥掉整行注释再判。
   *
   * 解释「先前写成 buttons.slice(0, DEPTH)」的那段注释本身含有那个片段,
   * 直接扫原文会把注释当成回退的证据(实测就是这么红了一次)。
   * 只剥整行注释,不动行内 —— 脚本里有 `file://` 与正则,行内截断会误伤。
   */
  const SRC = RAW.replace(/^\s*(\*|\/\/).*$/gm, '')

  it('button 与 role=tab 都取', () => {
    expect(SRC, '没取 role=tab —— /codex 与 /collection 会整页空跑').toContain("getByRole('tab')")
    expect(SRC, '没取 button').toContain("getByRole('button')")
  })

  it('先筛再切片,不是先切再筛', () => {
    // 筛选循环必须在 slice 之前完成;写成 buttons.slice(0, DEPTH) 再筛就是回退
    expect(SRC, '又回到「先切再筛」—— 提示条的关闭钮会占掉名额').not.toMatch(/buttons\.slice\(0,\s*DEPTH\)/)
    expect(SRC, '该在筛完后再按 DEPTH 截断').toContain('buttons.length >= DEPTH')
  })

  it('提示条的关闭钮不算页面交互', () => {
    expect(SRC, '该排除「×」这类关闭钮').toMatch(/label === '×'/)
  })

  it('逐页读数只打印、不设下限', () => {
    // 页面状态会被前序点击改变(实测 /souls 跑到时已锁成「需真仙境」),
    // 设下限必误报 —— 故只保留读数
    expect(SRC, '逐页读数该保留').toContain('clickedPerRoute')
    expect(SRC, '逐页下限会误报,不该有').not.toContain('idlePages')
  })
})

/**
 * 视口外的钮不点,点不中不计数。
 *
 * 两处都是「点击」这一步本身的问题,不修就会以「死按钮」的形态误报:
 *
 *  一 **`isVisible()` 只问 CSS 可见性,不管在不在视口里**。
 *     /adventure 的「出发」在 y=833(视口高 812)——筛得到、点不着;
 *     Playwright 会先滚动过去,滚动又把别的元素移位,800ms 内点不中即超时。
 *  二 **点击超时也照样 `clicked += 1`**。于是 ① 读数虚高;
 *     ② 指纹没变就被判成「死按钮」,而它其实一下都没点到。
 *
 * 实测这两条合起来让 /adventure 的「出发」在合入后被报成死按钮,
 * 而那按钮点下去是正常弹窗的。
 */
describe('冒烟点击 · 视口与计数', () => {
  const RAW = readFileSync(resolve(__dirname, '../../scripts/ui-smoke.mjs'), 'utf-8')
  const SRC = RAW.replace(/^\s*(\*|\/\/).*$/gm, '')

  it('筛选时排除视口外的钮', () => {
    expect(SRC, '该判断元素在不在视口内').toContain('getBoundingClientRect()')
    expect(SRC, '该与 innerHeight 比').toContain('innerHeight')
  })

  it('点不中不计数,也不进「没反应」分支', () => {
    expect(SRC, '该接住点击失败').toMatch(/clickedOk/)
    expect(SRC, '点失败该 continue').toMatch(/if \(!clickedOk\) continue/)
    // 反例:无条件加一
    expect(SRC, '又变成无条件 clicked += 1 了').not.toMatch(/await b\.click\(\{ timeout: 800 \}\)\.catch\(\(\) => \{\}\)\n\s*clicked \+= 1/)
  })
})
