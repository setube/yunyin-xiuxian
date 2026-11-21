/**
 * QA 实测脚本的收尾纪律(这些脚本不在 CI 里跑,只能从源码钉形状)。
 *
 * 第 13 轮修了 edge-states 与 modal-patrol 的同一类缺陷:汇总打印在
 * `browser.close()` **之后**,于是任何一处 evaluate 超时都会让异常冒到顶层,
 * `failures` 里已经攒下的读数一条也出不来 —— 跑了十几分钟的巡查,
 * 最后屏幕上只有一行堆栈,分不清「只有这一处出问题」还是「前面全坏了」。
 *
 * 本轮把剩下的四个同构脚本一并收口。这条判据管的是「别再退回去」:
 * 每一份都必须是 try/catch/finally 收尾,且异常要进 failures。
 *
 * 故障注入:把任一脚本的 try/catch 去掉(只留 finally),对应那条红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCRIPTS = ['orb-check', 'world-check', 'treasure-check', 'edge-states', 'modal-patrol', 'detail-geometry'] as const
const src = (name: string): string => readFileSync(resolve(__dirname, '../../scripts', `${name}.mjs`), 'utf-8')

/** 剥掉整行注释 —— 注释里写着「原先没有 try」这类说明,不剥会让判据假绿 */
const code = (name: string): string =>
  src(name)
    .split('\n')
    .filter(line => !/^\s*(\*|\/\/)/.test(line))
    .join('\n')

describe('QA 脚本 · 崩溃时也要把已收集的失败报出来', () => {
  for (const name of SCRIPTS) {
    it(`${name}:主体包在 try 里,异常进 failures,浏览器在 finally 关`, () => {
      const s = code(name)
      expect(s, `${name} 没有 try —— 中途抛错会让已收集的失败全部丢失`).toContain('try {')
      expect(s, `${name} 的 catch 没把异常记成失败`).toMatch(/catch \(err\)[\s\S]{0,300}failures\.push\(/)
      expect(
        s,
        `${name} 的 browser.close() 不在 finally 里 —— 崩了就不关浏览器`
      ).toMatch(/finally \{[\s\S]{0,120}browser\.close\(\)/)
      // 关闭之后再冒泡的写法是这次修的那一类:close 不许出现在 try 块之外的裸语句位置
      expect(s, `${name} 还留着裸的 \`await browser.close()\` —— 那条路径只有正常收尾才走到`).not.toMatch(
        /^\s*await browser\.close\(\)\s*$/
      )
    })
  }
})
