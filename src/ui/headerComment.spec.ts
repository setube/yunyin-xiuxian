/**
 * 文件头注释不许出现「双首注」。
 *
 * 这类残留是**改动叠在旧注释上**留下的:新增一段块注释时忘了删掉原来那句,
 * 于是同一件事在同一个位置说了两遍 —— 一遍旧、一遍新,而且旧的那句往往已经过期。
 * 编辑器与 linter 都不报,读代码时才知道该信哪一句。
 *
 * 已知的三例(全部由本判据抓出后删掉旧的那句):
 *   src/core/audio.ts        `/** 同步偏好… *\/` + `/** 音量钳到 [0,1]… *\/`
 *   src/core/craftability.ts `/** 合成成功率… *\/` + `/** 夹到 [0,1]… *\/`
 *   src/utils/platform.ts    `/** 要不要劝安装:在 iOS 上且未安装 *\/` + 新的一条
 *
 * 判据只认**紧邻**的一对:两个块注释之间除了缩进与换行什么都没有。
 * 文件头「模块说明 —— 空行 —— 第一条声明注释」是正常写法,不会被误伤。
 *
 * 唯一的例外是 eslint / oxlint 的指令注释(`/* eslint-disable … *\/`),
 * 它们必须紧跟文件头才有作用,天然与下面的块注释相邻。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC = resolve(__dirname, '..')
const SCRIPTS = resolve(__dirname, '../../scripts')

function listFiles(dir: string, exts: readonly string[]): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf-8' })
    .map((name) => name.replace(/\\/g, '/'))
    .filter((name) => exts.some((ext) => name.endsWith(ext)))
    .map((name) => join(dir, name))
}

/** 紧邻的两个块注释(中间只有空白) */
const ADJACENT = /\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\n[ \t]*\/\*\*/g
/** 工具指令注释,不算文档注释 */
const DIRECTIVE = /^\/\*\s*(eslint|oxlint|global|@ts-)/

export interface Orphan {
  file: string
  line: number
  /** 上一段(被顶掉的旧注释)的首行 */
  stale: string
}

export function findOrphanedHeaders(text: string, file: string): Orphan[] {
  const out: Orphan[] = []
  for (const m of text.matchAll(ADJACENT)) {
    const at = m.index ?? 0
    const head = text.slice(at, at + 6)
    if (DIRECTIVE.test(head)) continue
    const body = m[1] ?? ''
    out.push({
      file,
      line: text.slice(0, at).split('\n').length,
      stale: body.replace(/\s+/g, ' ').trim().slice(0, 60)
    })
  }
  return out
}

function scan(dir: string, exts: readonly string[]): Orphan[] {
  const out: Orphan[] = []
  for (const file of listFiles(dir, exts)) {
    out.push(...findOrphanedHeaders(readFileSync(file, 'utf-8'), file.replace(SRC, 'src')))
  }
  return out
}

describe('文件头注释', () => {
  it('源码与脚本里没有紧邻的两段块注释(旧的那段该删)', () => {
    const orphans = [...scan(SRC, ['.ts', '.vue']), ...scan(SCRIPTS, ['.mjs'])]
    const report = orphans.map((o) => `${o.file}:${o.line} 「${o.stale}…」`).join('\n')
    expect(orphans.length, `发现 ${orphans.length} 处旧注释没删:\n${report}`).toBe(0)
  })

  it('判据本身抓得住:伪造一处双首注即报', () => {
    const fake = '/** 旧的说法 */\n/**\n * 新的说法\n */\nexport const x = 1\n'
    const hits = findOrphanedHeaders(fake, 'fake.ts')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.stale).toBe('旧的说法')
  })

  it('不误伤:文件头说明与第一段声明注释之间隔着空行,不算双首注', () => {
    const ok = '/**\n * 模块说明\n */\n\n/** 第一段声明 */\nexport const y = 2\n'
    expect(findOrphanedHeaders(ok, 'ok.ts')).toHaveLength(0)
  })

  it('不误伤:eslint / oxlint 指令注释紧跟文件头是合法写法', () => {
    const ok = '/* eslint-disable no-console */\n/** 文件说明 */\nimport x from "x"\n'
    expect(findOrphanedHeaders(ok, 'ok2.ts')).toHaveLength(0)
    const ok2 = '/* oxlint-disable no-console -- 报告 */\n/** 文件说明 */\nexport const z = 3\n'
    expect(findOrphanedHeaders(ok2, 'ok3.mjs')).toHaveLength(0)
  })
})
