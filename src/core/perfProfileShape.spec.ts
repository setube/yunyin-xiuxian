/**
 * scripts/perf-profile.mjs 的量法守卫(该脚本不在 CI 里跑)。
 *
 * 这里钉的三条都是**已经踩过的坑**,不是想象出来的:
 *  1. 取页面必须走 openPage():三个分支各写一遍 throttle(),上一轮就漏了 --startup 那处,
 *     4x 限速下启动分段读出来和未限速一样,而同一轮挂载期是 340ms —— 两个数对不上才发现。
 *  2. 限速必须在导航前装:导航之后再装,首屏那一段量的仍是未限速的。
 *  3. 内存档必须走 CDP 的 Runtime.getHeapUsage:performance.memory.usedJSHeapSize
 *     在本机 chromium 里是固定值,持有 40×20 万元素的数组读数纹丝不动,拿它判等于空转。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RAW = readFileSync(resolve(__dirname, '../../scripts/perf-profile.mjs'), 'utf8')

/** 剥掉行注释与块注释:判据看的是代码,不是注释里提到过的词 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

const SCRIPT = stripComments(RAW)

describe('性能剖面的量法', () => {
  it('取页面统一走 openPage(),不留裸 context.newPage()', () => {
    const bare = SCRIPT.match(/context\.newPage\(\)/g) ?? []
    // 只允许 openPage 内部那一处
    expect(bare.length, `裸 newPage 还有 ${bare.length} 处 —— 新的分支会漏装限速`).toBe(1)
    expect(SCRIPT).toContain('async function openPage(context)')
    const callers = SCRIPT.match(/await openPage\(context\)/g) ?? []
    expect(callers.length, '三个模式各自要开页面').toBeGreaterThanOrEqual(3)
  })

  it('限速在导航前装进 openPage,不在页面打开后再补', () => {
    const body = SCRIPT.slice(SCRIPT.indexOf('async function openPage'), SCRIPT.indexOf('async function openPage') + 700)
    expect(body, '限速要落在 openPage 里').toContain('setCPUThrottlingRate')
    // 三个模式的 goto 都紧跟 openPage,中间不该再插 throttle
    expect(SCRIPT, 'openPage 之后不该再单独调 throttle').not.toMatch(/await throttle\(context/)
  })

  it('内存档走 CDP 的 getHeapUsage,不用 performance.memory', () => {
    expect(SCRIPT).toContain('Runtime.getHeapUsage')
    expect(SCRIPT, 'performance.memory 在本机是固定值,不能当判据').not.toContain('usedJSHeapSize')
  })

  it('内存档默认走真实负载:空闲心跳不分配,量出来必然平', () => {
    expect(SCRIPT).toContain('withActiveRun')
    expect(SCRIPT).toContain('const activeLoad = args.includes("--active")')
  })

  it('预算随限速倍数放宽,不拿绝对值卡限速档', () => {
    const scales = SCRIPT.match(/Math\.max\(1, Math\.min\(cpuRate, 4\)\)/g) ?? []
    expect(scales.length, '挂载期与启动合计两条预算都要按倍数放宽').toBeGreaterThanOrEqual(2)
  })
})
