/**
 * 资源生命周期形制。
 *
 * 道源与道果的说明弹窗都有同一句「生命周期」—— 转世时哪一个会清零,是玩家最容易记错的一条。
 * 数据里早有 roleTone 表达这件事,但原先两扇弹窗各写一个硬编码的左边框色,一处都没读 roleTone。
 *
 * 判据:
 *   一 两种 roleTone 各有且仅有自己的一档形制,符号与色都不同。
 *   二 认不出的 roleTone 按「本世」处理 —— 少承诺强过多承诺。
 *   三 色只走既有语义 token,不新增。
 *   四 两扇弹窗都接上了同一份,不再各写一个色。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { allResourceTones, resourceTone } from './resourceTone'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const CELESTIAL = readFileSync(resolve(ROOT, 'src/views/CelestialView.vue'), 'utf-8')
const FURNACE = readFileSync(resolve(ROOT, 'src/components/celestial/FurnaceDialog.vue'), 'utf-8')

describe('生命周期形制 · 一、两档分得开', () => {
  it('本世与跨世各有自己的签与说法', () => {
    const action = resourceTone('action')
    const permanent = resourceTone('permanent')
    expect(action.seal).not.toBe(permanent.seal)
    expect(action.label).not.toBe(permanent.label)
    expect(action.note).not.toBe(permanent.note)
  })

  it('两种形制的色不同 —— 靠色也靠字,不只靠色', () => {
    expect(resourceTone('action').tone).not.toBe(resourceTone('permanent').tone)
    // 但字已经够了:色弱玩家读「此 / 累」二字即可
    expect(resourceTone('action').seal.length).toBe(1)
    expect(resourceTone('permanent').seal.length).toBe(1)
  })

  it('两种形制合起来恰好两档,不多给一档假选择', () => {
    expect(allResourceTones()).toHaveLength(2)
  })

  it('说法直接报事实,不劝也不解释设计', () => {
    for (const t of allResourceTones()) {
      expect(t.note, `${t.label} 的说法不该是一句话`).not.toContain('。')
      expect(t.note.length).toBeLessThanOrEqual(6)
    }
  })
})

describe('生命周期形制 · 二、坏档按「本世」处理', () => {
  it('认不出的 roleTone 按删档会散处理 —— 少承诺强过多承诺', () => {
    expect(resourceTone('whatever').tone).toBe(resourceTone('action').tone)
    expect(resourceTone('').tone).toBe(resourceTone('action').tone)
  })
})

describe('生命周期形制 · 三、色只走既有 token', () => {
  it('形制块里不写裸 hex', () => {
    const from = CSS.indexOf('.res-tone {')
    expect(from, 'style.css 里找不到 .res-tone').toBeGreaterThan(-1)
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    expect(seg, '别写裸 hex').not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('引用的色名都在既有 token 里', () => {
    const from = CSS.indexOf('.res-tone {')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['cinnabar', 'violet-ink', 'paper'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })
})

describe('生命周期形制 · 四、两扇弹窗同用一份', () => {
  it('道源弹窗按 roleTone 挂形制,不再硬写边框色', () => {
    expect(CELESTIAL, '道源该走 ui/resourceTone').toContain("from '@/ui/resourceTone'")
    expect(CELESTIAL, '道源该按 roleTone 取形制').toContain('toneOf(daoSourceDialog().roleTone)')
    expect(CELESTIAL, '道源不该再硬写边框色').not.toMatch(/class="border-l-2 border-cinnabar\/60 pl-2/)
  })

  it('道果弹窗同样接上,不再各写一个色', () => {
    expect(FURNACE, '道果该走 ui/resourceTone').toContain("from '@/ui/resourceTone'")
    expect(FURNACE, '道果该按 roleTone 取形制').toContain('toneOf(fruitDialog.roleTone)')
    expect(FURNACE, '道果不该再硬写边框色').not.toMatch(/class="border-l-2 border-violet-ink\/60 pl-2/)
  })
})
