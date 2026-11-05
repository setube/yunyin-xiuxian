/**
 * 法宝神通形制:八种神通此前只写成一句文案。
 *
 * 「这一击是打人、是护身、还是削敌」在界面上看不出来 ——
 * 玩家在包袱里比两件法宝,要先读完整句话才知道一件是攻击型、另一件是护盾型,
 * 而这两类的用途完全不同(一件该配输出装,一件该在硬仗里戴)。
 *
 * 四条判据:
 *   一 八种 type 全部登记 —— 漏一种,那几件法宝就退回「长得跟别人一样」
 *   二 八枚线纹两两不同,四类性质各一色
 *   三 称谓从同一张表现算(原先散落在面板的私有表里,且**缺 stun**)
 *   四 界面真的接上了,且私有表已撤
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ARTIFACTS } from '@/data/artifacts'
import {
  DISPOSITION_NAMES,
  allArtifactEffectTypes,
  artifactActiveNoun,
  artifactShapeMark
} from './artifactShape'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const PANEL = readFileSync(resolve(ROOT, 'src/components/inventory/ArtifactPanel.vue'), 'utf-8')

/** 取 CSS 里某个选择器的声明块 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('神通形制 · 一、八种 type 全登记', () => {
  it('数据里出现的每一种 type 都取得到形制', () => {
    const used = new Set(ARTIFACTS.map(a => a.active.effect.type))
    expect(used.size, '判据失去对象').toBe(8)
    for (const a of ARTIFACTS) {
      const mark = artifactShapeMark(a)
      expect(mark, `${a.name} 的神通 ${a.active.effect.type} 没有形制 —— 漏登记了`).toBeDefined()
      expect(mark!.type).toBe(a.active.effect.type)
      expect(DISPOSITION_NAMES[mark!.disposition], `${a.name} 的性质没有中文说法`).toBeTruthy()
      expect(mark!.noun, `${a.name} 的主体称谓为空`).toBeTruthy()
    }
  })

  it('登记表覆盖全部八种,不多不少', () => {
    const registered = allArtifactEffectTypes()
    expect(registered.length, '八种 type 应各登记一次').toBe(8)
    expect(new Set(registered).size).toBe(8)
  })

  it('原先漏掉 stun 的称谓补上了', () => {
    // 改造前面板的私有表只有七项,stun 落到兜底「效果」—— 震慑型的法宝报不出自己的称谓
    const stun = ARTIFACTS.find(a => a.active.effect.type === 'stun')!
    expect(artifactActiveNoun(stun), 'stun 不该再回落到兜底的「效果」').toBe('震慑')
  })
})

describe('神通形制 · 二、纹与色分得开', () => {
  it('八枚线纹两两不同 —— 重了就等于两种神通长得一样', () => {
    const crests = ARTIFACTS.map(a => artifactShapeMark(a)!.crest)
    expect(new Set(crests).size, `纹样有重复:${[...new Set(crests)].join(' / ')}`).toBe(8)
  })

  it('四类性质各一色,且互不相同', () => {
    const tones = (['attack', 'guard', 'debuff', 'cleanse'] as const).map(d => {
      const b = block(`.artifact-shape--${d}`)
      expect(b, `缺 ${d} 的性质色`).not.toBe('')
      return [...b.matchAll(/--color-([a-z-]+)-rgb/g)].map(m => m[1]).join('')
    })
    expect(new Set(tones).size, `性质色有重复:${tones.join(' / ')}`).toBe(4)
  })

  it('每种纹样在样式里都有自己的画法', () => {
    const crests = [...new Set(ARTIFACTS.map(a => artifactShapeMark(a)!.crest))]
    for (const crest of crests) {
      expect(block(`.artifact-shape__crest--${crest}::before`), `缺 ${crest} 的纹样`).not.toBe('')
    }
  })
})

describe('神通形制 · 三、称谓从同一张表现算', () => {
  it('damage 与 drain 同为「威力」—— 同是打人,不因细类分家', () => {
    for (const a of ARTIFACTS.filter(x => x.active.effect.type === 'damage' || x.active.effect.type === 'drain')) {
      expect(artifactActiveNoun(a)).toBe('威力')
    }
  })

  it('认不出时回落到「效果」—— 与改造前那张表的兜底一致', () => {
    expect(artifactActiveNoun(undefined)).toBe('效果')
    expect(artifactShapeMark(undefined)).toBeUndefined()
    expect(artifactShapeMark({ active: {} } as never)).toBeUndefined()
  })
})

describe('神通形制 · 四、界面接上了', () => {
  it('神通行报出性质与纹', () => {
    expect(PANEL, '神通行应报性质').toContain('row.shape')
    expect(PANEL, '应读形制').toContain('artifactShapeMark(def)')
    expect(PANEL, '应画纹样').toContain('artifact-shape__crest')
    expect(PANEL, '应有读屏说法').toContain('row.shape.label')
  })

  it('面板里的私有称谓表已撤,改读形制模块', () => {
    expect(PANEL, '不该再自己维护一张称谓表').not.toContain('ACTIVE_NOUNS')
    expect(PANEL, '称谓应读形制模块').toContain('artifactActiveNoun(')
  })

  it('纹样不吃指针事件,色只取既有 token', () => {
    expect(block('.artifact-shape'), '性质印不该吃指针事件').toContain('pointer-events: none')
    for (const d of ['attack', 'guard', 'debuff', 'cleanse']) {
      const tones = [...block(`.artifact-shape--${d}`).matchAll(/--color-([a-z-]+)-rgb/g)].map(m => m[1])
      for (const t of tones) expect(['cinnabar', 'jade', 'violet-ink', 'azure', 'ink'], `新造了色 ${t}`).toContain(t)
    }
  })
})
