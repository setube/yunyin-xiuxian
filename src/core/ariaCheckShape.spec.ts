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
