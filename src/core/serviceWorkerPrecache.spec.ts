/**
 * Service Worker 须在 install 阶段就把「能不能离线起来」需要的那几件存下来。
 *
 * 起因(实测复现):SW 原先**只靠 fetch 事件被动填缓存**,而首次加载的那批请求发生在
 * SW 接管**之前** —— 一个都收不到。于是缓存要等下一次受控请求才有东西:
 *   首次打开游戏 → 缓存 0 条 → 立刻断网 → 重载 → 落到 SW 的
 *   「离线且无缓存副本」503 兜底页。
 *
 * 这不是「离线缺几件资源」那种可降级问题:玩家装完 PWA、关掉网、再打开,直接白屏。
 *
 * 判据只读源码形状 —— 真要验行为得跑浏览器(scripts/offline-check.mjs 干这个,
 * 但它不在 CI 里跑,而且需要构建)。这里钉的是「那段预缓存还在」,
 * 让它在被谁顺手删掉时立刻红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const SW = readFileSync(resolve(ROOT, 'public/sw.js'), 'utf-8')

describe('Service Worker · install 阶段预缓存', () => {
  /**
   * 取**非本地外壳**的那个 install 监听器。
   *
   * `IN_LOCAL_SHELL` 分支里另有一个 `install`(负责自我注销),它也带自己的 waitUntil。
   * 按 `indexOf` 取第一个会取到本地外壳那一个 —— 实测:把真正的预缓存整段删掉,
   * 判据仍然全绿(它读的是另一个监听器)。这里按「该监听器之后是否出现
   * `cache.put`」挑出真正做预缓存的那个,并要求它存在。
   */
  function precacheInstallBody(): string {
    const starts = [...SW.matchAll(/self\.addEventListener\('install',/g)].map(m => m.index!)
    expect(starts.length, '一个 install 监听器都没有').toBeGreaterThan(0)
    for (let i = starts.length - 1; i >= 0; i -= 1) {
      // 取到下一个顶层 addEventListener 之前
      const from = starts[i]!
      const nextAt = SW.indexOf('self.addEventListener(', from + 10)
      const body = SW.slice(from, nextAt === -1 ? undefined : nextAt)
      if (body.includes('cache.put')) return body
    }
    return ''
  }

  it('有一个 install 监听器在往缓存里写,且它等自己跑完', () => {
    const body = precacheInstallBody()
    expect(body, '没有任何 install 监听器做预缓存 —— 首次访问后缓存会是空的').not.toBe('')
    expect(body, 'install 没等预缓存跑完 —— 会先激活成半就绪状态').toContain('event.waitUntil')
  })

  it('预缓存的是导航页本身,不是只存资产', () => {
    /*
     * 只存 /assets/* 不够:断网时导航请求先失败,页面根本进不去,
     * 缓存里有多少 JS 都没用。
     */
    expect(SW, '预缓存里没有导航页(index.html)').toContain("new URL('index.html', base)")
  })

  it('从导航页里挑出脚本与样式一并存下 —— 否则断网时 HTML 有、JS 没有', () => {
    expect(SW, '没有按 script 标签提取').toMatch(/html\.match\(\/<script/)
    expect(SW, '提取出来的引用没有被逐个缓存').toMatch(/\.\.\.refs\]\.map/)
  })

  it('路由懒加载 chunk 也要预缓存 —— 否则离线时应用挂上了、视图渲染不出来', () => {
    /*
     * 首屏主 chunk 里挂着 `__vite__mapDeps` 依赖表(全部路由 view 的 js/css)。
     * 只缓存 HTML 引到的那几件不够:路由组件是动态 import,离线新开页面时
     * `WelcomeView-*.css` 会 503,`#app` 有子节点但 innerText 为空。
     *
     * 实测:补上这步之前缓存 11 件、离线新开白屏;补上之后 45 件、欢迎页正常渲染。
     */
    expect(SW, '没有解析 __vite__mapDeps').toContain('m\\.f=')
    expect(SW, '依赖表里的条目没有并进预缓存集合').toContain('refs.add(mainDir')
  })

  it('legacy 入口不进预缓存 —— 现代浏览器根本不请求它们', () => {
    /*
     * legacy 插件在 HTML 里留了 `<script nomodule src="./assets/polyfills-legacy-*.js">`
     * 与 `index-legacy`(data-src)。现代浏览器不会下载它们(实测
     * `__vite_is_modern_browser` 为 true、无 legacy 网络请求),存下来纯属白占。
     *
     * 实测这两件 411KB,占修复前预缓存总量 1987KB 的 21%。
     * 故障注入:删掉那个 `refs.delete` 兜底或按 src 一把抓的遗留行 → 本条红。
     */
    expect(SW, '没有排除 legacy 产物的兜底').toMatch(/refs\.delete\(r\)/)
    expect(SW, '没有按 nomodule 跳过 script 标签').toContain('nomodule')
    expect(SW, 'nomodule 判定后没有 continue 跳过').toMatch(/nomodule[^\n]*continue/)
    // 不许再有「按 src 一把抓」的写法(它会把刚排除的 legacy 重新加回来)
    expect(SW, '又出现了按 src 一把抓的写法').not.toMatch(/html\.matchAll\(\/src="/)
  })

  it('modulepreload 的 JS 也要预缓存 —— 里面有 biz 主业务包', () => {
    /*
     * `<link rel="modulepreload" href="./assets/biz-*.js">` 落在 `<script src>` 之外,
     * 只抓 css/webmanifest 会漏掉首屏主业务包(实测 754KB),离线时应用加载不到。
     */
    expect(SW, 'link 的提取没覆盖 .js').toMatch(/href="\(\[\^"\]\+\\\.\(\?:js\|css\|webmanifest\)\)/)
  })

  it('单件失败不许拖垮整批', () => {
    /*
     * `cache.addAll` 是原子的:一件 404 整批落空。故这里要求逐件 put 并各自 try。
     * 判据是「那个 map 段里有 try」—— 结构上保证粒度。
     */
    const mapAt = SW.indexOf('[...refs].map(async')
    expect(mapAt, '找不到逐件缓存的循环').toBeGreaterThan(-1)
    const chunk = SW.slice(mapAt, mapAt + 400)
    expect(chunk, '逐件缓存没有各自的 try —— 一件失败会让整批落空').toContain('try {')
  })

  it('导航回退不只按原 URL 找,还要退到预缓存的 index.html', () => {
    /*
     * hash 路由下玩家在任何页面刷新,请求的都是 `/`,而预缓存的 key 是 `index.html` ——
     * URL 精确比对不上。若只 `cache.match(request)`,缓存明明有导航页也会给 503。
     */
    const nfAt = SW.indexOf('async function networkFirst')
    expect(nfAt, '找不到 networkFirst').toBeGreaterThan(-1)
    const body = SW.slice(nfAt, nfAt + 1400)
    expect(body, '导航回退没退到预缓存的导航页').toMatch(/cache\.match\(new URL\('index\.html'/)
  })
})

/**
 * 缓存策略变了就必须换 `CACHE_VERSION`。
 *
 * `sw.js` 的注释写着这条规矩,但它只是提醒 —— 改策略时忘了递增,`activate` 就不清旧缓存,
 * 已装机的玩家**永远拿不到新装法**,而日志里看不出任何异常。v2→v3 与 v2→v4 两次
 * 都踩在这条线上(前者改了选件规则、后者跳掉 legacy 产物),说明它不是假想的风险。
 *
 * 判据不猜「策略变没变」(那要 diff 历史),而是钉住**规矩本身还在**:
 *   · `CACHE_VERSION` 存在且是 `yunyin-vN` 的形状
 *   · 注释里必须有「bump CACHE_VERSION」这句提醒
 *
 * 故障注入:删掉注释里那句提醒 → 第二条红。
 */
describe('Service Worker · 缓存版本号', () => {
  it('CACHE_VERSION 在,且形状是 yunyin-vN', () => {
    const m = /const CACHE_VERSION = '(yunyin-v(\d+))'/.exec(SW)
    expect(m, 'sw.js 里找不到 CACHE_VERSION').not.toBeNull()
    expect(Number(m![2]), '版本号应 >= 1').toBeGreaterThanOrEqual(1)
  })

  it('注释里保留着「改策略须 bump 版本号」的提醒', () => {
    expect(SW, '那句提醒被删了 —— 后来改策略的人就不知道该递增版本号').toMatch(/bump CACHE_VERSION/)
  })
})

/**
 * 清旧缓存只能清本应用的。
 *
 * `caches.keys()` 列的是**整个 origin 的全部 cache storage** —— cache 只按 origin
 * 隔离,不按路径隔离。本应用部署在子路径下(GitHub Pages 的 `<user>.github.io/<repo>/`),
 * 同 origin 上完全可能有别的 PWA。
 *
 * 原先 `filter((k) => k !== CACHE_VERSION)` 会把邻居的缓存一并删掉:本应用一升级,
 * 隔壁应用的离线包就没了 —— 而对方无从知道是谁干的。
 *
 * 故障注入:把 filter 改回 `(k) => k !== CACHE_VERSION` → 第一条红。
 */
describe('Service Worker · 清旧缓存不越界', () => {
  /**
   * activate 里那次删除的整段代码。
   *
   * 不抽 `keys.filter(...)` 那一句:filter 里含 `startsWith(CACHE_PREFIX)`,
   * 括号嵌套,用正则切容易切歪(第一版就切歪了,判据对着空串报红)。
   * 取整段再查「这段里有没有前缀判断」更稳。
   */
  const activateBlock = (): string => {
    /*
     * 取**最后一个** activate:文件里有两个 —— 本地外壳分支那个(自我注销、清空全部缓存,
     * 那里全删是对的:shell 独占 origin)与主逻辑那个。取第一个会对着外壳分支判,
     * 判据就永远红(第一版正是如此)。
     */
    const i = SW.lastIndexOf("addEventListener('activate'")
    expect(i, '找不到 activate 监听器').toBeGreaterThan(-1)
    return SW.slice(i, i + 900)
  }

  it('activate 的 keys 过滤必须带上本应用的名称前缀', () => {
    const block = activateBlock()
    // 链式调用跨行写(`keys\n  .filter(...)`),所以中间允许换行与空白
    expect(block, 'activate 里没有 keys.filter').toMatch(/keys\s*\.\s*filter/)
    expect(
      block,
      `activate 的过滤没带前缀 —— 会删掉同 origin 下别的应用的缓存:\n${block}`
    ).toMatch(/startsWith\(\s*CACHE_PREFIX\s*\)/)
  })

  it('健在性:前缀常量存在,且 CACHE_VERSION 以它开头', () => {
    // 前缀若与版本号对不上,filter 会把自家缓存也漏掉、永远清不掉旧的
    const prefix = /const CACHE_PREFIX = '([^']+)'/.exec(SW)
    const version = /const CACHE_VERSION = '([^']+)'/.exec(SW)
    expect(prefix, '找不到 CACHE_PREFIX').not.toBeNull()
    expect(version, '找不到 CACHE_VERSION').not.toBeNull()
    const p = prefix![1] ?? ''
    const v = version![1] ?? ''
    expect(v.startsWith(p), `CACHE_VERSION「${v}」不以 CACHE_PREFIX「${p}」开头`).toBe(true)
  })
})
