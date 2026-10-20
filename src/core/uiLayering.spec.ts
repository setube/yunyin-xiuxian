/* eslint-disable no-console -- 分层审计的产出是给人看的清单 */
/**
 * 界面分层审计 —— 浮层只该有一个出处,弹窗只该有一套契约
 *
 * 由来:两个事件弹窗(悟道顿悟 / 洞府巡游)是自己铺的 `fixed inset-0`。
 * 单看截图看不出问题,代价却有三样:**没有 role=dialog / aria-modal**(读屏不知道
 * 有弹窗开了)、**没有焦点管理**(打开后焦点还在背后的按钮上,Tab 会一路跑出去)、
 * 样式自成一套(font-bold / text-sm / rounded,与本作的水墨设计系统两回事)。
 *
 * 而排版自检那两条尺子(控件要有可访问名、不小于 28px)与弹窗焦点契约都挂在
 * BaseModal 上 —— 自己铺浮层就等于同时退出这三套保障,还不会有人发现。
 *
 * 故这里把「浮层只有一个出处」钉成红线,判据是源码级的:
 *   一 全屏浮层只该出现在 BaseModal 里(自己铺 `fixed inset-0` 又带按钮 = 退出契约);
 *   二 每个弹窗都要有可辨识的名字(title 或 aria-label),读屏才念得出是哪一扇;
 *   三 每个弹窗都要关得掉(@close 有人接,或明写 :closable="false" 说明为何不给关)。
 *
 * 故障注入:把 EnlightenmentModal 改回自己铺浮层 → 第一条红;
 * 把某个 title 删掉 → 第二条红;把 @close 删掉 → 第三条红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SRC = resolve(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.vue$/.test(entry)) out.push(full)
  }
  return out
}

const FILES = walk(SRC)
  .filter(f => f.includes(`${join('src', 'components')}`) || f.includes(`${join('src', 'views')}`))
  .map(f => ({
    path: relative(SRC, f).replace(/\\/g, '/'),
    // 注释里会提到这些写法(比如「曾经是自己铺的一层 fixed inset-0」),判据只看真代码
    src: readFileSync(f, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
  }))

const BASE_MODAL = 'components/common/BaseModal.vue'

describe('界面分层 · 浮层只有一个出处', () => {
  it('自己铺满屏又带可点控件的浮层,必须走 BaseModal', () => {
    const offenders = FILES.filter(f => f.path !== BASE_MODAL)
      .filter(f => /fixed inset-0/.test(f.src) && /<button/.test(f.src))
      .map(f => f.path)
    console.log(`\n全屏浮层出处:${BASE_MODAL}${offenders.length ? ` + 越界的 ${offenders.length} 个` : ''}`)
    expect(
      offenders,
      '这些文件自己铺了全屏浮层 —— 会一并退出 dialog 语义、焦点陷阱与控件尺子;改用 BaseModal,或说明为何它必须自己铺'
    ).toEqual([])
  })

  it('每个弹窗都有可辨识的名字 —— 读屏要念得出是哪一扇', () => {
    const nameless: string[] = []
    for (const f of FILES) {
      // 逐个取 <BaseModal ...> 开标签
      for (const m of f.src.matchAll(/<BaseModal\b[^>]*>/g)) {
        const tag = m[0]
        const title = /(?<![:\w-])title="([^"]*)"/.exec(tag)?.[1]
        const boundTitle = /:title="([^"]*)"/.exec(tag)?.[1]
        const aria = /aria-label="([^"]*)"/.exec(tag)?.[1]
        if (title !== undefined && title.trim() !== '') continue
        if (boundTitle !== undefined && boundTitle.trim() !== '' && !/^\s*(['"])\1?\s*$/.test(boundTitle)) continue
        if (aria !== undefined && aria.trim() !== '') continue
        nameless.push(`${f.path} → ${tag.slice(0, 60)}`)
      }
    }
    expect(nameless, '这些弹窗没有名字 —— role=dialog 读出来是光秃秃一句「对话框」').toEqual([])
  })

  it('每个弹窗都关得掉 —— 关闭键挂上去必须有人接', () => {
    const stuck: string[] = []
    for (const f of FILES) {
      for (const m of f.src.matchAll(/<BaseModal\b[^>]*>/g)) {
        const tag = m[0]
        if (/@close=/.test(tag)) continue
        if (/:closable="false"/.test(tag)) continue
        stuck.push(`${f.path} → ${tag.slice(0, 60)}`)
      }
    }
    expect(stuck, '这些弹窗既没有 @close 也没写明 :closable="false" —— 关闭键与 Esc 都会静默失效').toEqual([])
  })

  it('视图里不许裸 back() —— 冷启动时它会把人送出游戏', () => {
    // 判据:站内没有上一页时(书签 / deep link / PWA 冷启动恢复路由),
    // history.state.back 为 null,裸 back() 会退到 about:blank,界面整个消失。
    // 统一走 router/goBack.ts 的 goBack(router, 父页)。
    const offenders = FILES.filter(f => /\.back\(\)/.test(f.src))
      .map(f => f.path)
    expect(offenders, '这些视图直接调了 back() —— 改用 @/router/goBack 的 goBack(router, 父页)').toEqual([])
  })

  it('派活说明不许只挂 hover —— 手机上没有 hover,那是谁也看不见的死提示', () => {
    // 道童派活会把弟子锁走 30~90 分钟,而任务说明此前只写在 :title 上。
    // 现在与适配理由 / 天赋芯片同族:点一下展开一行,再点同枚才真派出(aria-expanded 报给读屏)。
    // 故障注入:把 tapTask 改回 dispatcher、或把说明改回 :title → 红。
    const f = FILES.find(x => x.path === 'views/ApprenticeView.vue')
    expect(f, 'ApprenticeView 不见了').toBeDefined()
    const src = f!.src
    expect(src, '派活说明不许再挂 :title').not.toContain(':title="t.desc"')
    expect(src, '说明要能点开').toContain('@click="tapTask(a.uid, t.spec)"')
    expect(src, '读屏要报展开态').toContain(':aria-expanded="taskTap === `${a.uid}:${t.spec}`"')
    expect(src, '再点同枚才派出').toContain('dispatcher(uid, spec)')
  })
})
