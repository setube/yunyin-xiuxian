/**
 * 品阶光环:稀有件的「形制」差异。
 *
 * 三档浓淡(qualityTier)只能让人看出谁更深,隔着屏幕分不出天品与神品;
 * 形制(角饰枚数、是否呼吸、是否流光)才是可数的线索。本条钉住那张表本身,
 * 以及「阈值与 qualityTier 同一把尺」这个前提 —— 多一套阈值,换一处视觉就要问按哪套。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QUALITIES } from '@/data/qualities'
import { qualityAura, qualityAuraByRank } from './qualityAura'
import { qualityTierByRank } from './qualityTier'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const AURA_VUE = readFileSync(resolve(ROOT, 'src/components/common/QualityAura.vue'), 'utf-8')
const ARTIFACT_PANEL = readFileSync(resolve(ROOT, 'src/components/inventory/ArtifactPanel.vue'), 'utf-8')
const EQUIPMENT_CARD = readFileSync(resolve(ROOT, 'src/components/equipment/EquipmentCard.vue'), 'utf-8')
const MARKET_SHELF = readFileSync(resolve(ROOT, 'src/components/market/MarketShelfSection.vue'), 'utf-8')

describe('品阶光环 · 形制随稀有度可数', () => {
  it('三档与 qualityTier 同一把尺:凡/良/精 → plain,灵/玄/地 → refined,天/仙/神 → radiant', () => {
    for (const q of QUALITIES) {
      const aura = qualityAura(q.id)
      const tier = qualityTierByRank(q.rank)
      // 浓淡没变的档即是同一档:直接比对档位边界
      const expected = q.rank < 3 ? 'plain' : q.rank < 6 ? 'refined' : 'radiant'
      expect(aura.tier, `${q.name} 的光环档`).toBe(expected)
      // refined 与 radiant 都是「比凡品更亮」的档,不能出现亮档却零发光
      if (aura.tier !== 'plain') expect(aura.glow, `${q.name} 有档位却不发光`).toBeGreaterThan(0)
      // 浓淡边界处两档必须不同,否则两套阈值已在暗处分叉(比数值,不比对象引用)
      const neighbor = qualityTierByRank(q.rank + 1)
      const toneChanged = tier.border !== neighbor.border || tier.bg !== neighbor.bg
      if (toneChanged) {
        expect(qualityAuraByRank(q.rank).tier, `${q.name} 处浓淡变了、光环档却没变`).not.toBe(
          qualityAuraByRank(q.rank + 1).tier
        )
      }
    }
  })

  it('发光与角饰随 rank 单调不减 —— 越高阶越显眼,不会出现神品比天品素', () => {
    let prevGlow = -1
    let prevCorners = -1
    const corners = { none: 0, double: 2, triple: 3 } as const
    for (let rank = 0; rank <= 8; rank += 1) {
      const aura = qualityAuraByRank(rank)
      expect(aura.glow, `rank ${rank} 的发光不该比上一档弱`).toBeGreaterThanOrEqual(prevGlow)
      const n = corners[aura.corner]
      expect(n, `rank ${rank} 的角饰枚数不该比上一档少`).toBeGreaterThanOrEqual(prevCorners)
      prevGlow = aura.glow
      prevCorners = n
    }
  })

  it('天/仙/神三档各有形状线索:仙与神多一枚右上角,神品独有流光', () => {
    expect(qualityAuraByRank(6).radiant).toBe('heaven')
    expect(qualityAuraByRank(7).radiant).toBe('immortal')
    expect(qualityAuraByRank(8).radiant).toBe('divine')
    // 仙/神比天品多出的那一枚,靠 radiant 档区分
    expect(qualityAuraByRank(6).corner).toBe('double')
    expect(qualityAuraByRank(7).corner).toBe('triple')
    expect(qualityAuraByRank(8).corner).toBe('triple')
    // 流光只在最顶档
    expect([6, 7, 8].map(r => qualityAuraByRank(r).sheen)).toEqual([false, false, true])
    // 名牌描边只给稀有档
    expect([0, 2, 3, 5].map(r => qualityAuraByRank(r).plaque)).toEqual([false, false, false, false])
    expect([6, 7, 8].map(r => qualityAuraByRank(r).plaque)).toEqual([true, true, true])
  })

  it('道品(rank 9,丹药专属)落进最顶档,不因不在 QualityId 里掉回凡品', () => {
    const aura = qualityAuraByRank(9)
    expect(aura.tier).toBe('radiant')
    expect(aura.sheen, '道品应比神品更靠上,不该掉出流光档').toBe(true)
  })

  it('认不出 rank 时退回最朴素的一档 —— 光环是加成,判不出就不加', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(qualityAuraByRank(bad).tier).toBe('plain')
      expect(qualityAuraByRank(bad).glow).toBe(0)
    }
  })
})

describe('品阶光环 · 样式与可访问性', () => {
  /**
   * 两套主题的发光机理不同,不能共用一组参数。
   *
   * 夜主题 paper 近黑,彩色光晕加在暗底上越亮越明显;
   * 日主题 paper 是暖白,同样的光晕叠上去对比很弱 —— 实测截图里
   * 神品的呼吸光在日主题几乎看不出来,九档又退回「只有边框深浅」。
   *
   * 日主题改为「品阶色描边 + 近距小光晕」:描边吃的是品阶色与纸面的明暗差。
   * 本条钉住这条分叉在,别再被合并回一套。
   */
  it('日主题单有一套光环参数 —— 亮纸上的发光留不住对比,改用描边', () => {
    const lightBlock = /html\[data-theme='light'\] \.q-aura-halo \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    expect(lightBlock, '缺日主题的 .q-aura-halo 覆盖块').not.toBe('')
    expect(lightBlock, '日主题应用品阶色描边(亮底上只有描边留得住对比)').toContain('0 0 0 1px var(--q-tone')
    // 日主题的描边同样是「外发光」的一种,不该退化成内阴影(会盖住卡面内容)
    expect(lightBlock, '光环是盒外装饰,不该用 inset').not.toContain('inset')
    // 两套主题都必须只动 opacity/transform 之外的静态属性,不引入新动画
    expect(lightBlock, '日主题不另起动画').not.toContain('animation')
  })

  it('色相由使用点经 --q-tone 注入,CSS 里不写死任何一个品阶的颜色', () => {
    expect(CSS, '光晕应吃 --q-tone').toContain('var(--q-tone, transparent)')
    // 品阶九色里的裸 hex 一个都不许出现在光环样式里
    for (const hex of ['#A85C3F', '#C9A227', '#3E8E8B']) {
      expect(CSS.includes(hex) && CSS.indexOf(hex) > CSS.indexOf('品阶光环'), `${hex} 不该出现在光环样式里`).toBe(false)
    }
  })

  it('动效只在 opacity/transform 上 —— box-shadow 逐帧动画会触发整块重绘', () => {
    const breathe = /@keyframes q-aura-breathe \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    expect(breathe, '缺 q-aura-breathe').not.toBe('')
    expect(breathe, '呼吸动画只该动 opacity').not.toContain('box-shadow')
    expect(breathe).toContain('opacity')
    const sheen = /@keyframes q-aura-sheen \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    expect(sheen, '缺 q-aura-sheen').not.toBe('')
    expect(sheen, '流光只该动 transform/opacity').not.toContain('box-shadow')
  })

  it('减少动效的两个块管住光环(通配符覆盖,不需要额外声明)', () => {
    // 光环没有自己的 reduce 分支:全局通配符已经盖住,这里只钉住那两个块仍在
    expect(CSS).toContain('@media (prefers-reduced-motion: reduce)')
    expect(CSS).toContain('.reduce-motion *')
    // 特别确认光环的动画没有被写成 !important 绕过通配符
    const haloBlock = /\.q-aura-halo--radiant \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    expect(haloBlock, '光环呼吸不该用 !important 绕过减少动效').not.toContain('!important')
  })

  it('紧凑格只画左上那一枚角:底边与右上都被角标占着,再画会压字', () => {
    // 紧凑模式整块不进模板(而非只加 display:none),别处改样式也不会把它带回来
    expect(AURA_VUE).toContain('v-if="!compact"')
    // 左上那枚不受 compact 影响:「有角饰 = 进阶以上」在任何尺寸下都成立
    const tl = AURA_VUE.slice(AURA_VUE.indexOf('q-aura-corner--tl') - 200, AURA_VUE.indexOf('q-aura-corner--tl'))
    expect(tl, '左上角饰不该被 compact 关掉').not.toContain('v-if')
    expect(EQUIPMENT_CARD, '装备格应走紧凑模式').toContain('<QualityAura :quality="props.item.quality" compact />')
  })

  it('光环整体 aria-hidden:品阶名已由角章报出,不重复念', () => {
    expect(AURA_VUE, '光环是纯装饰').toContain('aria-hidden="true"')
    expect(AURA_VUE, '光环不该自带可访问名').not.toContain('aria-label=')
  })

  it('三处卡片都接上了光环与名牌描边', () => {
    for (const [name, src, qualityExpr] of [
      ['法宝卡', ARTIFACT_PANEL, 'row.def.quality'],
      ['装备格', EQUIPMENT_CARD, 'props.item.quality'],
      ['坊市货格', MARKET_SHELF, 'c.quality']
    ] as const) {
      expect(src, `${name}应渲染 QualityAura`).toContain('<QualityAura')
      expect(src, `${name}的名牌应接 q-plaque`).toContain('q-plaque')
      expect(src.includes(qualityExpr) || name === '坊市货格', `${name}的品阶应取自数据表`).toBe(true)
    }
  })
})
