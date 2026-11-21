/**
 * scripts/aria-check.mjs 的结构判据(该脚本不在 CI 里跑,故用源码钉住)。
 *
 * CI 只跑 `bun run check` 与 `test:report`,十来个真实浏览器脚本全靠 spec 从源码钉住形状 ——
 * 脚本本身写歪了(或某段被顺手删掉),CI 不会红,「每一页都量过」就变成空话。
 *
 * 本文件钉的是**档位覆盖**:同一个脚本里跑了几档存档,每档查什么。
 * 这几档各有各的盲区,少一档就有整类界面永远不被量:
 *
 *  一 **后期档**(lateSlices):主巡页,17 页的标题/可访问名/触控。
 *  二 **中期档**(midSlices):洞府已启、终局未开 —— 天界与器魂停在「需真仙境」。
 *  三 **资源归零档**:禁用钮的拒因只能在这一档触发。
 *  四 **欢迎页/建号页**:只在不带存档时进得去。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RAW = readFileSync(resolve(__dirname, '../../scripts/aria-check.mjs'), 'utf-8')

/**
 * 剥掉注释再判。
 *
 * 直接扫原文会漏:import 行被删掉时,那段文字仍留在**注释**里
 * (`中期档用 midSlices` 之类),`toContain('midSlices')` 照样为真;
 * 拒因词表删掉「圆满」时,解释为什么要加它的注释还在。
 *
 * 只剥块注释与整行注释 —— **不能**用 `line.replace(/\/\/.*$/, '')`:
 * 代码里有 `http://` 与正则,那样会把整行截断(实测 13659 字符被削到 5093,
 * 连 `midCtx` 都找不到了)。
 */

/**
 * 「非注释行」的集合 —— 够用了,且不会误伤。
 *
 * 试过逐字符剥注释:代码里有 `'**\/x'` 这类字符串与正则字面量,
 * 块注释扫描会提前收尾,把后面整段代码连同 `midCtx.close()` 一起删掉
 * (实测 13659 → 7430 字符,`midCtx.close()` 凭空消失)。
 *
 * 这里换个更稳的口径:**只按行判**。一行去掉缩进后若以 `*` 或 `//` 开头,
 * 它就是注释行,不算证据;其余行原样保留。够抓「import 被删」「词表被删」
 * 这两类 —— 它们都表现为**代码行消失**,而注释里的同一句话不算数。
 */
const CODE_LINES = RAW.split('\n').filter(line => !/^\s*(\*|\/\/)/.test(line))
const CODE = CODE_LINES.join('\n')

describe('aria-check · 四档存档各司其职', () => {
  it('import 语句把三种夹具都取进来了', () => {
    // 不能用 toContain('midSlices') —— 下面还有 `seedSave(midCtx, midSlices())`,
    // import 被删掉时那处调用仍含这三个字,判据照样绿(实测漏过一次)。
    const line = CODE.split('\n').find(l => l.includes("from './lib/saveFixture.mjs'"))
    expect(line, '找不到夹具的 import 行').toBeTruthy()
    expect(line, 'import 行没取 lateSlices').toContain('lateSlices')
    expect(line, 'import 行没取 midSlices —— 中期档那一段会直接抛 ReferenceError').toContain('midSlices')
    expect(line, 'import 行没取 seedSave').toContain('seedSave')
  })

  it('中期档:单开上下文、查四页、不注入 lateSlices', () => {
    const at = CODE.indexOf('midCtx = await browser.newContext')
    const end = CODE.indexOf('midCtx.close()')
    expect(at, '找不到中期档那一段 —— 判据要跟着改名').toBeGreaterThan(-1)
    expect(end, '找不到中期档那一段的收尾').toBeGreaterThan(at)
    const block = CODE.slice(at, end)
    expect(block, '该种 midSlices').toContain('seedSave(midCtx, midSlices())')
    for (const route of ['/celestial', '/souls', '/dongfu', '/legacy']) {
      expect(block, `中期档没查 ${route}`).toContain(`'${route}'`)
    }
    // 判不了要报出来,不许静默跳过
    expect(block, '落不到位时要报错,不静默跳过').toMatch(/没落到位/)
  })

  it('资源归零档:九页禁用钮都查,且词表含「圆满」这类状态词', () => {
    const at = CODE.indexOf('DENY_ROUTES')
    const end = CODE.indexOf('denyBad.push')
    expect(at, '找不到 DENY_ROUTES').toBeGreaterThan(-1)
    expect(end, '找不到拒因词表').toBeGreaterThan(at)
    const block = CODE.slice(at, end + 400)
    const routes = block.match(/'\/[a-z]*'/g) ?? []
    expect(routes.length, `只查了 ${routes.length} 页的禁用钮`).toBeGreaterThanOrEqual(9)
    // 「圆满」是后加的词:早先只认「已满」,把洞府的「已圆满」判成没给拒因(假阳性)
    expect(block, '拒因词表少了「圆满」—— 洞府的「已圆满」会被判成没给拒因').toContain('圆满')
    // title / aria-label 也算给了拒因(纯图标钮的拒因在那两处)
    expect(block, '该把 title 当成拒因').toContain('b.title')
    expect(block, '该把 aria-label 当成拒因').toContain('aria-label')
  })

  it('每一档失败都进 failures,不是只打印', () => {
    for (const marker of ['中期档读屏属性不全', '禁用钮没给拒因']) {
      let re: RegExp
      try {
        re = new RegExp(`failures\\.push\\(\\\`${marker}`)
      } catch {
        re = new RegExp(`failures\\.push\\([^\\n]*${marker}`)
      }
      expect(CODE, `「${marker}」没进 failures —— 打印了但不算失败`).toMatch(re)
    }
  })
})

/*
 * 导航落地判据的两处形状(第 3 轮修「导航未落地」误报时加的)。
 *
 * 这两点都属于「工具误报」那一类 —— 仓库文档里记过:判据自己写歪时,
 * 会把人引去查一个并不存在的缺陷。实测两次并发跑 `aria-check` 与
 * `focus-check`,首条路由 `/` 各报过一次「导航未落地」,而单独跑全绿。
 */
describe('aria-check · 导航落地判据', () => {
  it('首跳给足预算:首屏过场与后续跳转不是同一档等待', () => {
    const at = CODE.indexOf('async function gotoRoute')
    expect(at, '找不到 gotoRoute —— 判据要跟着改名').toBeGreaterThan(-1)
    const block = CODE.slice(at, at + 1600)
    // 首屏刚挂上时 page-fade 与 stagger-in 一起走,3 秒预算会被它吃掉(实测 2465ms)
    const m = /budget\s*=\s*first\s*\?\s*(\d+)\s*:\s*(\d+)/.exec(block)
    expect(m, '首跳没有「first ? 首跳预算 : 后续预算」这样的显式分档').not.toBeNull()
    /*
     * 光看「有没有分档」不够 —— 评审指出:把两个数都改成极小值,分档照样存在、
     * 源码照样含 `first ?`,而并发时又会误报。故**把两个数真的取出来比**。
     *   首跳 8000:实测首屏过场 2465ms,留三倍余量
     *   后续 3000:页面都已挂载,只剩懒加载 chunk + 180ms 过渡
     */
    const firstBudget = Number(m![1])
    const laterBudget = Number(m![2])
    expect(firstBudget, `首跳预算 ${firstBudget}ms 太小 —— 实测首屏过场就要 2465ms`).toBeGreaterThanOrEqual(5000)
    expect(laterBudget, `后续跳转预算 ${laterBudget}ms 太小 —— 懒加载 chunk 还没到位就判失败`).toBeGreaterThanOrEqual(2000)
    expect(firstBudget, '首跳预算该明显大于后续,否则分档没有意义').toBeGreaterThan(laterBudget)
  })

  it('失败分两段记名:hash 未对上 ≠ 过渡未消失', () => {
    const at = CODE.indexOf('async function gotoRoute')
    const block = CODE.slice(at, at + 2400)
    expect(block, '两段等待没分开记名,失败时看不出卡在哪一段').toContain('hash 未对上')
    expect(block, '两段等待没分开记名,失败时看不出卡在哪一段').toContain('page-fade 过渡未消失')
  })

  it('失败信息走 navDetail,带上等了多久与此刻的状态', () => {
    expect(CODE, '导航失败仍写死「hash 或过渡超时」—— 看不出是哪一段').not.toContain('(hash 或过渡超时)')
    expect(CODE, '导航失败没带分段读数').toContain('navDetail()')
  })
})

/*
 * 失败路径自己的顺序问题(第 12 轮踩到)。
 *
 * `lastNavFailure` 原写在文件末尾的辅助函数区,而本脚本是 top-level await 写法,
 * `gotoRoute` 在顶层循环里就被调用。正常跑不碰它,一旦导航真失败就进
 * `Cannot access before initialization` —— 报错路径自己先炸,真正的失败原因
 * 永远打印不出来。实测并发那一轮复现过一次。
 *
 * 这类缺陷只在「本来就要报错」时才现形,平时的绿跑永远看不见,故从源码钉顺序。
 */
describe('aria-check · 失败路径的变量先于使用声明', () => {
  it('lastNavFailure 声明在第一次赋值之前', () => {
    const decl = CODE.indexOf('let lastNavFailure')
    const use = CODE.indexOf('lastNavFailure = {')
    expect(decl, '找不到 lastNavFailure 的声明').toBeGreaterThan(-1)
    expect(use, '找不到 lastNavFailure 的赋值点').toBeGreaterThan(-1)
    expect(decl, '声明在使用之后 —— TDZ 会让失败路径自己先炸').toBeLessThan(use)
  })
})
