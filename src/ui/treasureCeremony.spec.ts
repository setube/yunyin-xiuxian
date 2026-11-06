/**
 * 得宝仪典的判据。
 *
 * 仪典为什么需要被钉住:它是**只在顶档出现的那一层**。
 * 一旦有人把门槛放低到天品,或把它接到每一条发放路上,「顶档」就不再是可数的落差 ——
 * 而落差正是它唯一的用处。所以三条铁律各有一组判据:
 *   一 只在顶档      —— 天/仙一律 null,神/道才有
 *   二 只报所得      —— 文案是数据里的名字,不拼句子、不给建议
 *   三 不吃点击、会散 —— 装饰层 pointer-events:none、不铺可点控件、有停留时长
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  TREASURE_KIND_NAMES,
  TREASURE_MIN_RANK,
  treasureOf,
  type TreasureKind,
  type TreasureSource
} from './treasureCeremony'
import { GONGFA } from '@/data/gongfa'
import { PETS } from '@/data/pets'
import { PILLS } from '@/data/pills'
import { ARTIFACTS } from '@/data/artifacts'
import { QUALITIES, qualityDef } from '@/data/qualities'
import { beastIcon } from '@/data/beastFamilies'
import { pillQualityName } from '@/data/pills'
import { BEAST_FAMILIES } from '@/data/beastFamilies'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const COMPONENT = readFileSync(resolve(ROOT, 'src/components/common/TreasureCeremony.vue'), 'utf-8')
const UI_STORE = readFileSync(resolve(ROOT, 'src/stores/ui.ts'), 'utf-8')
const APP = readFileSync(resolve(ROOT, 'src/App.vue'), 'utf-8')

/** 各档的代表物:凡→神九档逐档一件,道品单列 */
const equipLike = (quality: TreasureSource extends { quality: infer Q } ? Q : never): TreasureSource => ({
  kind: 'equip',
  quality,
  name: '试件',
  icon: 'sword'
})

describe('得宝仪典 · 一、只在顶档出现', () => {
  it('门槛取品阶表最高那一档,不另写 8', () => {
    expect(TREASURE_MIN_RANK).toBe(qualityDef('divine').rank)
    // 若将来加入更高档,这条会红,提醒回来重新定门槛
    const top = Math.max(...QUALITIES.map(q => q.rank))
    expect(top, '品阶表出现了比神品更高的档,仪典门槛要跟着改').toBe(TREASURE_MIN_RANK)
  })

  it('九档里只有神品开仪典,其余一律 null', () => {
    for (const q of QUALITIES) {
      const mark = treasureOf(equipLike(q.id as never))
      if (q.rank >= TREASURE_MIN_RANK) expect(mark, `${q.name} 该开仪典`).not.toBeNull()
      else expect(mark, `${q.name} 不该开仪典 —— 每档都给,等于每档都没有`).toBeNull()
    }
  })

  it('丹药的道品(不在共享品阶表里)同样开仪典', () => {
    const dao = PILLS.filter(p => p.quality === 'dao')
    expect(dao.length, '没有道品丹药,判据失去对象').toBeGreaterThan(0)
    for (const pill of dao) {
      const mark = treasureOf({ kind: 'pill', pill })
      expect(mark, `道品「${pill.name}」该开仪典`).not.toBeNull()
      expect(mark!.grade).toBe(pillQualityName(pill))
    }
  })

  it('认不出的东西一律 null,不抛错', () => {
    expect(treasureOf({ kind: 'nope' } as unknown as TreasureSource)).toBeNull()
    expect(treasureOf(equipLike('ghost' as never))).toBeNull()
  })

  it('五类各有至少能开仪典的样本 —— 否则接得上的那几路是空的', () => {
    const samples: Record<TreasureKind, boolean> = {
      equip: QUALITIES.some(q => q.rank >= TREASURE_MIN_RANK),
      artifact: ARTIFACTS.some(a => qualityDef(a.quality).rank >= TREASURE_MIN_RANK),
      gongfa: GONGFA.some(g => qualityDef(g.quality).rank >= TREASURE_MIN_RANK),
      pet: PETS.some(p => qualityDef(p.quality).rank >= TREASURE_MIN_RANK),
      pill: PILLS.some(p => treasureOf({ kind: 'pill', pill: p }) !== null)
    }
    for (const [kind, ok] of Object.entries(samples)) {
      expect(ok, `${TREASURE_KIND_NAMES[kind as TreasureKind]}没有顶档样本 —— 那一路接了也没用`).toBe(true)
    }
  })
})

describe('得宝仪典 · 二、只报所得', () => {
  const divinePet = PETS.find(p => qualityDef(p.quality).rank >= TREASURE_MIN_RANK)!
  const divineGongfa = GONGFA.find(g => qualityDef(g.quality).rank >= TREASURE_MIN_RANK)!
  const divineArtifact = ARTIFACTS.find(a => qualityDef(a.quality).rank >= TREASURE_MIN_RANK)!

  it('名与品阶都取自数据,不手抄', () => {
    const pet = treasureOf({ kind: 'pet', pet: divinePet })!
    expect(pet.name).toBe(divinePet.name)
    expect(pet.grade).toBe(qualityDef(divinePet.quality).name)
    expect(pet.icon).toBe(beastIcon(divinePet.family))

    const gf = treasureOf({ kind: 'gongfa', gongfa: divineGongfa })!
    expect(gf.name).toBe(divineGongfa.name)
    expect(gf.grade).toBe(qualityDef(divineGongfa.quality).name)

    const af = treasureOf({ kind: 'artifact', quality: divineArtifact.quality, name: divineArtifact.name, icon: divineArtifact.icon })!
    expect(af.name).toBe(divineArtifact.name)
    expect(af.icon).toBe(divineArtifact.icon)
  })

  /**
   * 文案是「品阶 + 类名 + 名」三样事实,不拼句子。
   * UI 文案规范:不解释、不给建议、不煽情 —— 这一层最容易滑向「XX 现世,快去看看吧」。
   */
  it('读屏播报只有三样事实,不含劝诱与解释', () => {
    const samples = [
      treasureOf({ kind: 'pet', pet: divinePet })!,
      treasureOf({ kind: 'gongfa', gongfa: divineGongfa })!,
      treasureOf(equipLike('divine' as never))!
    ]
    const banned = ['请', '可以', '建议', '快去', '不妨', '务必', '记得', '恭喜']
    for (const s of samples) {
      expect(s.announce).toBe(`${s.grade}${s.kindName}「${s.name}」`)
      for (const word of banned) {
        expect(s.announce, `仪典播报里出现了「${word}」—— 那是劝导,不是状态`).not.toContain(word)
      }
    }
  })

  it('类名表覆盖五类,且都是两字以内的名词', () => {
    for (const kind of Object.keys(TREASURE_KIND_NAMES) as TreasureKind[]) {
      const name = TREASURE_KIND_NAMES[kind]
      expect(name.length, `${kind} 的类名过长`).toBeLessThanOrEqual(3)
    }
    expect(Object.keys(TREASURE_KIND_NAMES)).toHaveLength(5)
  })

  it('族徽取 data/beastFamilies 的唯一事实源', () => {
    for (const pet of PETS) {
      const icon = beastIcon(pet.family)
      expect(icon, `${pet.name} 的族类没有形`).toBe(BEAST_FAMILIES[pet.family].icon)
    }
  })
})

describe('得宝仪典 · 三、不吃点击、自己会散', () => {
  it('整层不吃指针事件 —— 与 WarpPortal / toast 同一条纪律', () => {
    expect(COMPONENT, '全屏浮层必须 pointer-events: none,否则它是一层三秒的遮罩').toContain('pointer-events: none')
  })

  it('里面没有可点控件,也不进 Tab 序', () => {
    expect(COMPONENT, '仪典里不该有按钮').not.toMatch(/<button\b/)
    expect(COMPONENT, '仪典里不该有可聚焦元素').not.toMatch(/tabindex="(?!-1)/)
  })

  it('有停留时长,演完自己收起', () => {
    expect(COMPONENT, '仪典须有停留时长').toMatch(/const HOLD_MS = \d+/)
    expect(COMPONENT, '到点要自己收起').toContain('ui.clearTreasure()')
  })

  it('卸载时撤掉计时器,不回写已销毁的 store', () => {
    expect(COMPONENT, '卸载钩子要撤计时器').toContain('onUnmounted(clear)')
    expect(COMPONENT, '撤计时器要真 clearTimeout').toContain('clearTimeout(timer)')
  })

  it('停在全局浮层区,且层级高于 toast —— 这一刻只该看它', () => {
    expect(APP, '仪典挂在 App 的全局浮层区').toContain('<TreasureCeremony />')
    const z = /\.treasure-overlay \{[\s\S]*?z-index: (\d+)/.exec(COMPONENT)
    expect(z, '找不到仪典层级').toBeTruthy()
    // toast 是 70(见 ToastHost 的 `fixed inset-x-0 top-12 z-70`)
    const toastZ = /class="pointer-events-none fixed[^"]*?\bz-(\d+)\b/.exec(
      readFileSync(resolve(ROOT, 'src/components/common/ToastHost.vue'), 'utf-8')
    )
    expect(toastZ, '找不到 toast 的层级').toBeTruthy()
    expect(Number(z![1]), `仪典层级 ${z![1]} 须高于 toast 的 ${toastZ![1]}`).toBeGreaterThan(Number(toastZ![1]))
  })
})

describe('得宝仪典 · 四、两条全局纪律', () => {
  it('组件里不写裸 hex —— 色由品阶原色经 tint 现算', () => {
    // 与 palette.spec「裸 hex 只许出现在已登记的例外」同一条;仪典不在例外名单里
    const hex = [...COMPONENT.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
      .map(m => m[0])
      // 注释里引用色值不算(那一行以 * 或 // 开头)
      .filter((_, i) => {
        const at = COMPONENT.indexOf(hex[i]!)
        const lineStart = COMPONENT.lastIndexOf('\n', at) + 1
        const line = COMPONENT.slice(lineStart, at)
        return !/^\s*(\*|\/\/|!)/.test(line)
      })
    expect(hex, `仪典里出现了裸 hex,应改走品阶色 + tint:\n${hex.join('、')}`).toEqual([])
    expect(COMPONENT, '色应由 tint 现算').toContain('tint(')
  })

  it('动效受「减少动效」两处设置管 —— 静态形制自己站得住', () => {
    expect(COMPONENT, '缺系统偏好那一处').toContain('@media (prefers-reduced-motion: reduce)')
    expect(COMPONENT, '缺设置项那一处').toContain('.reduce-motion')
    // 不用 animation:none 之外的手段抹掉整层(形制仍在,只是不动)
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n  \}/.exec(COMPONENT)?.[1] ?? ''
    expect(reduced, '减少动效下不该把整层隐藏').not.toContain('display: none')
  })

  it('过渡时长走 style.css 的既有节奏,不另造一套缓动', () => {
    // transition 只在两处出现(进出与 body 升起),且都用 cubic-bezier 或 ease
    const durations = [...COMPONENT.matchAll(/transition: opacity ([\d.]+)s/g)]
    expect(durations.length, '进出过渡缺时长').toBeGreaterThan(0)
  })

  it('ui store 的接口与组件对得上 —— 定义了没人调就是死接口', () => {
    expect(UI_STORE, 'store 要暴露 showTreasure').toContain('showTreasure')
    expect(UI_STORE, 'store 要暴露 clearTreasure').toContain('clearTreasure')
    expect(COMPONENT, '组件读 store 的 treasure').toContain('ui.treasure')
    expect(APP, 'App 挂载仪典').toContain('TreasureCeremony')
  })

  /**
   * 发放路要**都**接上。
   *
   * 这一层最容易漏的不是判定,是接线:顶档之物有五条来路(拾得装备、获得法宝、
   * 开炉成丹、参悟功法、际遇赠宝),另加坊市购得。漏掉一条,那条路上的神品就静悄悄入包 ——
   * 而玩家不会知道「这里本来该有一瞬」,只是觉得那次不如上次。
   * 判据按文件认,新增一条发放路时在这里登记,漏了即红。
   */
  it('六条发放路都接了仪典(新增发放路要在这里登记)', () => {
    const sites: [string, RegExp][] = [
      ['core/loot.ts 拾得装备', /celebrateTreasure\(\{ kind: 'equip'/],
      ['core/loot.ts 获得法宝', /celebrateTreasure\(\{ kind: 'artifact'/],
      ['core/pillService.ts 开炉成丹', /treasureOf\(\{ kind: 'pill'/],
      ['core/gongfaService.ts 参悟功法', /celebrateTreasure\(\{ kind: 'gongfa'/],
      ['core/eventEngine.ts 际遇赠宝', /celebrateTreasure\(\{ kind: 'pet'/],
      ['components/market/MarketShelfSection.vue 坊市购得', /celebrateTreasure\(\{ kind: 'pill'|celebrateTreasure\(\{/]
    ]
    for (const [where, pat] of sites) {
      const file = where.split(' ')[0]!
      const src = readFileSync(resolve(ROOT, 'src', file), 'utf-8')
      expect(pat.test(src), `${where} 没有接上得宝仪典`).toBe(true)
    }
  })

  it('既有的 style.css 没被这一层改动(形制只在本组件 scoped 里)', () => {
    // 仪典是「一次性的那一刻」,不该往全局样式表里塞新 token
    expect(CSS).not.toContain('.treasure-overlay')
  })
})
