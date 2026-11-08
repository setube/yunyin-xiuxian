import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 懒加载失败时要有可读的状态,且要能退回去。
 *
 * 视图全走 `() => import(...)`。断网且该页 chunk 不在 SW 缓存里时 import 会 reject:
 * 修复前 hash 已经变了、页面还是旧的那一页,只有控制台报
 * `Failed to fetch dynamically imported module` —— 玩家看到的是「点底栏没反应」。
 *
 * 回退不能用 `router.replace`:它本身也要解析那条路由的组件,断网时同样失败,
 * 于是原地不动(实测 hash 停在失败的 /titles)。直接改 location.hash 才有效 ——
 * 上一页组件早在内存里,不需要再下载任何 chunk。
 */
const ROUTER = resolve(__dirname, './index.ts')

describe('路由 · 懒加载失败的兜底', () => {
  const src = readFileSync(ROUTER, 'utf-8')

  it('挂了 onError,且只接懒加载/网络这类失败', () => {
    expect(src, '没挂 router.onError').toMatch(/router\.onError\(/)
    expect(src, '匹配式里没有 dynamically imported module').toMatch(/dynamically imported module/)
    expect(src, '匹配式里没有 Failed to fetch').toMatch(/Failed to fetch/)
  })

  it('失败时给出一句可读状态', () => {
    expect(src, '没有 toast 提示').toMatch(/页面加载失败/)
  })

  it('回退走 location.hash,不走 router.replace', () => {
    // router.replace 在断网时同样要解析组件,会静默失败
    const handler = src.slice(src.indexOf('router.onError'))
    expect(handler, '回退用了 router.replace —— 断网时它自己也会失败').not.toMatch(/router\.replace\(/)
    expect(handler, '回退没改 location.hash').toMatch(/location\.hash/)
  })

  it('记录最近一次成功路径:afterEach 里写,失败时读', () => {
    expect(src, '没有 afterEach 记录成功路径').toMatch(/router\.afterEach\(/)
    expect(src, '没有 lastGoodPath').toMatch(/lastGoodPath/)
  })

  /**
   * 切页时清弹窗栈。
   *
   * 原先只在 App.vue 的 onUnmounted 里清 —— 那是「整个应用卸载」,SPA 内切页不触发。
   * 于是浏览器/安卓返回键从背包跳回首页时,背包页那扇装备详情还挂在屏幕上,
   * 底下已经是另一页的内容(实测:hash 变 #/ 、.modal-panel 仍是 1)。
   */
  it('切页清弹窗栈,连各页的详情指针一起复位', () => {
    const hook = src.slice(src.indexOf('router.afterEach'), src.indexOf('router.onError'))
    expect(hook, 'afterEach 里没有 resetModalStack').toMatch(/resetModalStack\(\)/)
    expect(hook, 'afterEach 里没有 clearDetail').toMatch(/clearDetail\(\)/)
  })
})
