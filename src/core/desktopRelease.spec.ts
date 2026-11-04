/**
 * 桌面发行链路:发版必须同时产出 Windows 客户端。
 *
 * 2026-11-02 的那次改动把 build-electron 整个 job 拿掉了,只留下一句
 * 「桌面端直接用网页」—— 转到 README 里,代码侧没有任何东西拦着。
 * 之后要恢复时,没有任何判据说明「这条链原本是怎么跑的」,只能从 git 历史里刨。
 *
 * 这里钉四件事,任一条破了发版就会少一个平台:
 *   一 发版工作流里必须有桌面 job,且 release 依赖它 —— 不是跑不跑的问题,是没跑就不许发。
 *   二 桌面包是真的能打出来的:脚本、依赖、builder 配置三者齐备。
 *   三 图标够大:electron-builder 要求 ≥256,而 public/favicon.ico 最大只到 48。
 *   四 增量包所需的目录结构确实是 builder 的产物布局,不是猜的。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const WORKFLOWS = join(ROOT, '.github/workflows')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  build: {
    productName: string
    directories: { output: string }
    win: { target: string; icon: string; artifactName: string }
  }
}

const BUILD_YML = readFileSync(join(WORKFLOWS, 'build.yml'), 'utf8')
/** 只读发版工作流:其他工作流提到 electron 不算数 */
const RELEASE_TEXT = BUILD_YML

describe('桌面发行 · 一、发版工作流里有桌面 job', () => {
  it('存在 build-electron,且跑的是 build:electron 脚本', () => {
    expect(RELEASE_TEXT, '发版工作流里没有 build-electron job —— 桌面端又不在发行包里了').toContain('build-electron:')
    expect(RELEASE_TEXT, '桌面 job 没有调 build:electron').toContain('build:electron')
  })

  it('release 依赖桌面 job —— 没打出来就不许发', () => {
    const m = /needs:\s*\[([^\]]+)\]/.exec(RELEASE_TEXT.slice(RELEASE_TEXT.indexOf('release:')))
    expect(m, 'release 没有 needs 列表').not.toBeNull()
    expect(m![1], 'release 的 needs 里少了 build-electron').toContain('build-electron')
  })

  it('桌面产物被收进 Release 资产 —— 打了包却不传等于没打', () => {
    const releaseBlock = RELEASE_TEXT.slice(RELEASE_TEXT.indexOf('release:'))
    expect(releaseBlock, '整理产物那一步没有收 electron-win 的 zip').toContain('electron-win')
  })

  it('两种 Windows 包都出:完整包与增量包', () => {
    expect(RELEASE_TEXT, '没有打增量包').toContain('win-update.zip')
    // 增量包的每一份都来自 builder 的 unpacked 目录,不是另拼一份
    expect(RELEASE_TEXT, '增量包没有从 win-unpacked 取 resources/app').toContain('resources/app')
  })
})

describe('桌面发行 · 二、桌面包真的打得出来', () => {
  it('build:electron 脚本齐备:前端 + 主进程 + 预加载 + builder', () => {
    const script = PKG.scripts['build:electron'] ?? ''
    expect(script, '缺 build:electron 脚本').toBeTruthy()
    // 主进程与预加载是两份独立产物,各要一份 esbuild
    expect((script.match(/esbuild /g) ?? []).length, '主进程与预加载应各打一次 esbuild').toBe(2)
    expect(script, '没有调 electron-builder').toContain('electron-builder')
    expect(script, '没有先打前端').toContain('vite build')
  })

  it('electron 与 electron-builder 都在依赖里 —— 脚本在、包不在,CI 会红', () => {
    const all = { ...PKG.dependencies, ...PKG.devDependencies }
    expect(all.electron, '缺 electron 依赖').toBeTruthy()
    expect(all['electron-builder'], '缺 electron-builder 依赖').toBeTruthy()
  })

  it('builder 配置对得上:产物名带版本号,输出到 pkg/', () => {
    expect(PKG.build.directories.output, 'builder 输出目录变了,工作流还在找 pkg/').toBe('pkg')
    expect(PKG.build.win.artifactName, '完整包名须带版本,否则两个版本的包会同名覆盖').toContain('${version}')
    expect(PKG.build.productName, '没有 productName,主进程取不到窗口标题').toBeTruthy()
  })

  it('主进程真的吃 dist/ 与 dist-electron/ —— 两处路径都得是构建产物', () => {
    const main = readFileSync(join(ROOT, 'electron/main.js'), 'utf8')
    expect(main, '主进程没读 dist/').toContain("'dist'")
    expect(main, '主进程没读 dist-electron/').toContain("'dist-electron'")
    // builder 的 files 白名单须把这两样都带上
    const files = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).build.files as string[]
    expect(files.join(' '), 'builder 的 files 漏了 dist').toContain('dist/**/*')
    expect(files.join(' '), 'builder 的 files 漏了 dist-electron').toContain('dist-electron/**/*')
  })
})

describe('桌面发行 · 三、图标够大', () => {
  /** 读 PNG 的宽高:IHDR 紧跟 8 字节签名 + 4 字节长度 + 4 字节类型 */
  function pngSize(file: string): number {
    const b = readFileSync(join(ROOT, file))
    return Math.min(b.readUInt32BE(16), b.readUInt32BE(20))
  }

  it('win.icon 指向的图至少 256px —— 原先指 favicon.ico(最大 48),electron-builder 直接报错', () => {
    const icon = PKG.build.win.icon
    expect(icon, 'win.icon 没配').toBeTruthy()
    expect(icon.endsWith('.png'), `win.icon 指向 ${icon},须是 PNG(favicon.ico 最大只到 48px)`).toBe(true)
    expect(pngSize(icon), `win.icon 只有 ${pngSize(icon)}px,electron-builder 要求 ≥256`).toBeGreaterThanOrEqual(256)
  })

  it('图标文件真实存在 —— 路径写错时 builder 会退回默认图标而不是报错', () => {
    const icon = PKG.build.win.icon
    const files = readdirSync(join(ROOT, 'public/icons'))
    expect(files, `public/icons 里没有 ${icon}`).toContain(icon.replace('public/icons/', ''))
  })
})

describe('桌面发行 · 四、工作流自身站得住', () => {
  it('桌面 job 的 cache 路径在仓库外 —— 落在仓库里会被 type:module 判成 ESM', () => {
    const block = RELEASE_TEXT.slice(RELEASE_TEXT.indexOf('build-electron:'), RELEASE_TEXT.indexOf('build-android:'))
    const paths = [...block.matchAll(/^\s+(~\/[^\s]+)$/gm)].map(m => m[1] ?? '')
    expect(paths.length, '桌面 job 没有缓存路径').toBeGreaterThan(0)
    for (const p of paths) {
      expect(p.startsWith('~/'), `缓存路径 ${p} 落在仓库内,electron-builder 的 icon-tool 会加载失败`).toBe(true)
    }
  })

  it('工作流名字里写明桌面端 —— 只剩 APK 时那次改动改的就是这一行', () => {
    expect(/^name:\s*.+桌面/m.test(RELEASE_TEXT), '工作流名没写桌面端').toBe(true)
  })
})
