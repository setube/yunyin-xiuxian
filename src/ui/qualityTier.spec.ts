import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QUALITIES } from '@/data/qualities'
import { isRareQuality, isRareRank, qualityTierByRank, qualityTierStyle } from './qualityTier'

const ARTIFACT_PANEL = readFileSync(resolve(__dirname, '../components/inventory/ArtifactPanel.vue'), 'utf8')
const EQUIPMENT_CARD = readFileSync(resolve(__dirname, '../components/equipment/EquipmentCard.vue'), 'utf8')
const INVENTORY_VIEW = readFileSync(resolve(__dirname, '../views/InventoryView.vue'), 'utf8')
const MARKET_SHELF = readFileSync(resolve(__dirname, '../components/market/MarketShelfSection.vue'), 'utf8')
const QUALITY_SEAL = readFileSync(resolve(__dirname, '../components/common/QualitySeal.vue'), 'utf8')

/**
 * 品阶视觉的三档强度 —— 只靠九种颜色记档,玩家记不住,色弱玩家更读不出。
 *
 * 阈值取 rank:0-2 常见、3-5 进阶、6+ 稀有(天/仙/神)。
 * 判据盯三件事:
 *   一 三档确实随 rank 拉开,且边界与 QUALITIES 的真档位一致;
 *   二 稀有档才盖章,章是形状线索,不是另一套颜色表;
 *   三 法宝/装备/丹药三处格子读同一份强度,不在界面里再写一套阈值。
 */
describe('品阶视觉 · 三档强度与稀有角章', () => {
  it('三档强度随品质 rank 单调不减,且档内一致', () => {
    const ranked = [...QUALITIES].sort((a, b) => a.rank - b.rank)
    for (let i = 1; i < ranked.length; i += 1) {
      const prev = qualityTierStyle(ranked[i - 1]!.id)
      const cur = qualityTierStyle(ranked[i]!.id)
      expect(cur.border, `${ranked[i]!.name} 的边框不该比 ${ranked[i - 1]!.name} 更淡`).toBeGreaterThanOrEqual(prev.border)
      expect(cur.bg, `${ranked[i]!.name} 的底色不该比 ${ranked[i - 1]!.name} 更淡`).toBeGreaterThanOrEqual(prev.bg)
    }
    // 三个边界各取相邻两档,证明阈值不是随手写的
    expect(qualityTierStyle('excellent')).toEqual(qualityTierStyle('mortal'))
    expect(qualityTierStyle('spirit')).not.toEqual(qualityTierStyle('excellent'))
    expect(qualityTierStyle('heaven')).not.toEqual(qualityTierStyle('earth'))
  })

  it('天/仙/神才盖稀有章;灵品到地品不盖', () => {
    for (const q of QUALITIES) {
      expect(isRareQuality(q.id), `${q.name} 的稀有判定`).toBe(q.rank >= 6)
    }
    expect(QUALITIES.filter(q => isRareQuality(q.id)).map(q => q.id)).toEqual(['heaven', 'immortal', 'divine'])
  })

  it('道品按 rank 9 落进稀有档 —— 丹药专属档位不因不在 QualityId 联合里掉回凡品', () => {
    expect(isRareRank(9)).toBe(true)
    expect(qualityTierByRank(9)).toEqual(qualityTierStyle('divine'))
    expect(isRareRank(Number.NaN)).toBe(false)
    expect(qualityTierByRank(Number.NaN)).toEqual(qualityTierStyle('mortal'))
  })

  it('法宝卡读同一套三档强度,天/仙/神盖角章;密卡底色固定弱晕染', () => {
    expect(ARTIFACT_PANEL, '边框强度应走 qualityTierStyle').toContain('qualityTierStyle(row.def.quality)')
    expect(ARTIFACT_PANEL, '稀有判定应在行投影里只算一次').toContain('rare: isRareQuality(def.quality)')
    expect(ARTIFACT_PANEL, '稀有档应盖 QualitySeal').toContain('v-if="row.rare"')
    // 角章的绝对定位落在右上;标题行不留内边距时,重数会被 16px 的章压住
    expect(ARTIFACT_PANEL, '稀有角章要与标题行的重数错开').toContain(':class="{ \'pr-3\': row.rare }"')
    expect(ARTIFACT_PANEL, '密卡底色固定 6%,不随档加深').toContain('tint(qualityDef(row.def.quality).color, 0.06)')
    expect(ARTIFACT_PANEL, '法宝卡不应再把边框写死 0.33').not.toContain('tint(qualityDef(row.def.quality).color, 0.33)')
  })

  it('装备格与丹药格共享同一份强度;丹药的道品也盖章', () => {
    expect(EQUIPMENT_CARD, '装备格应读 qualityTierStyle').toContain('qualityTierStyle(props.item.quality)')
    expect(EQUIPMENT_CARD, '稀有装备应盖 QualitySeal').toContain('isRareQuality(props.item.quality)')
    expect(INVENTORY_VIEW, '丹药格应按 pillRank 走同一份三档强度').toContain('qualityTierByRank(pillRank(row.def!))')
    expect(INVENTORY_VIEW, '丹药稀有档应盖章').toContain('isRareRank(pillRank(row.def!))')
  })

  it('坊市货格也按同一套三档强度;稀有货盖角章,密卡底色不加深', () => {
    expect(MARKET_SHELF, '货格边框应读 qualityTierStyle').toContain('qualityTierStyle(inst.quality)')
    expect(MARKET_SHELF, '稀有货应盖 QualitySeal').toContain('isRareQuality(inst.quality)')
    expect(MARKET_SHELF, '货格底色固定弱晕染').toContain('tint(quality.color, 0.06)')
    expect(MARKET_SHELF, '货格不应自己另写 0.33 的边框阈值').not.toContain('tint(quality.color, 0.33)')
  })

  it('角章是形状线索,读屏也能报出品阶', () => {
    expect(QUALITY_SEAL, '角章要有品阶名的可访问标签').toContain(':aria-label="`${qualityName}档`"')
    expect(QUALITY_SEAL, '角章色相取品质表,不另抄色值').toContain('qualityDef(props.quality).color')
  })

  it('角章字形随主题用墨色,品阶色只留在边框与淡底', () => {
    expect(QUALITY_SEAL, '角章字形应随主题用墨色').toContain('leading-none text-ink')
    expect(QUALITY_SEAL, '品阶色不得直接写进 9-11px 字形').not.toContain('color: tone')
  })

  it('丹匣专属角章也随主题用墨色', () => {
    expect(INVENTORY_VIEW, '丹药角章字形也应随主题用墨色').toContain('font-kai text-[9px] leading-none text-ink')
    expect(INVENTORY_VIEW, '丹药角章不得把品阶色直接写进字形').not.toContain(
      'background: tint(pillQualityColor(row.def!), 0.12), color: pillQualityColor(row.def!)'
    )
  })
})
