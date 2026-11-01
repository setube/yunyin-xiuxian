/**
 * 满级标记:装备强化到顶、法宝祭炼满重。
 *
 * 这两件都是玩家投入后才有的一次「到底了」,而原先的表现只有一个颜色差
 * (`+N` 与祭炼格变金色)—— 金色是「好」,但不是「到头了」:
 * 一个 +9 与一个 +10 在 40px 的格子上没有形状差别。
 *
 * 与 `qualityAura` 必须是两套语言:品阶是掉落时定下的、满级是玩家挣来的。
 * 混用会让玩家以为「发光的都是强化过的」,所以本条同时钉住两者形状不重叠。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { artifactMastery, equipMastery } from './masteryMark'
import { ARTIFACT_MAX_LEVEL } from '@/data/artifacts'
import { upgradeCapToast } from './forgeText'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const EQUIPMENT_CARD = readFileSync(resolve(ROOT, 'src/components/equipment/EquipmentCard.vue'), 'utf-8')
const ARTIFACT_PANEL = readFileSync(resolve(ROOT, 'src/components/inventory/ArtifactPanel.vue'), 'utf-8')

describe('满级标记 · 玩家挣来的状态要有形状', () => {
  it('法宝:满重才标,差一重不标', () => {
    expect(artifactMastery(0)).toBeNull()
    expect(artifactMastery(ARTIFACT_MAX_LEVEL - 1)).toBeNull()
    expect(artifactMastery(ARTIFACT_MAX_LEVEL)?.label).toBe('祭炼已至上限')
    // 超上限(坏档)同样算满,不给「已满 +12」这种读法
    expect(artifactMastery(ARTIFACT_MAX_LEVEL + 5)?.label).toBe('祭炼已至上限')
  })

  it('装备:达到传入的上限才标 —— 上限随炼器台等级走,由调用方给', () => {
    // 零级炼器台(上限 10)
    expect(equipMastery(0, 10)).toBeNull()
    expect(equipMastery(9, 10)).toBeNull()
    // 复用 AGENTS.md 明文规定的状态词,不自创「强化至顶」
    expect(equipMastery(10, 10)?.label).toBe('强化已至上限')
    // 炼器台升满(上限 15):+10 就不再是顶
    expect(equipMastery(10, 15)).toBeNull()
    expect(equipMastery(15, 15)?.label).toBe('强化已至上限')
  })

  /**
   * 说法必须取既有状态词,不自创。
   *
   * AGENTS.md「固定写法」与反例表里明写着:「此器已至锤炼之极,再锻无益」→「强化已至上限」。
   * 我第一版写了「强化至顶」——读着通顺,但那是第八个说法。
   * 这条钉住它复用 `upgradeCapToast()`,改词只需改一处。
   */
  it('装备满级的说法复用 upgradeCapToast,不自创第二个词', () => {
    expect(equipMastery(10, 10)?.label).toBe(upgradeCapToast())
  })

  it('认不出等级或上限时不标 —— 标记是加成,判不出来宁可不加', () => {
    expect(equipMastery(Number.NaN, 10)).toBeNull()
    expect(equipMastery(10, Number.NaN)).toBeNull()
    expect(equipMastery(10, 0)).toBeNull()
    expect(artifactMastery(Number.NaN)).toBeNull()
  })

  it('与品阶光环是两套形状:满级用顶边横杠,不用角饰也不用发光', () => {
    const bar = /\.mastery-bar \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    expect(bar, '缺 .mastery-bar').not.toBe('')
    // 横杠是一条实心边,不是边框盒
    expect(bar, '满级标记应是实心横杠').toContain('height: 2px')
    expect(bar, '满级标记不该复用光环的角饰语言').not.toContain('border-radius: inherit')
    // 品阶光环用 --q-tone(品阶色),满级用固定金色 —— 颜色也不能撞
    expect(bar, '满级标记不该吃品阶色').not.toContain('--q-tone')
    expect(bar, '满级标记用金色').toContain('--color-gold-ink-rgb')
  })

  it('两套主题都保得住:日主题的 gold 偏褐,细条要加深', () => {
    const light = /html\[data-theme='light'\] \.mastery-bar \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    const dark = /html\[data-theme='dark'\] \.mastery-bar \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    expect(light, '缺日主题的满级标记覆盖').not.toBe('')
    expect(dark, '缺夜主题的满级标记覆盖').not.toBe('')
    expect(light, '日主题应加深一档(amber-ink)').toContain('--color-amber-ink-rgb')
  })

  /**
   * 装备格顶边已是「寸土寸金」:左上「佩」字、右上角章(top-3,14px)、右上锁图标。
   * 横杠靠**垂直错开**避让,不靠水平缩短 —— 它在顶边外侧 2px 处,
   * 而角章从 12px 处才开始,两者不在同一条横线上。
   */
  it('横杠贴顶边外侧,与角章/「佩」字上下错开', () => {
    const bar = /\.mastery-bar \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    expect(bar, '横杠应居中').toContain('left: 50%')
    expect(bar, '横杠应被 translateX 拉回中心').toContain('translateX(-50%)')
    expect(bar, '横杠贴顶边外侧,不进内容区').toContain('top: -1px')
    expect(bar, '横杠只有 2px 高').toContain('height: 2px')
    // 不让横杠铺满:两角的角标各有内容,留白比铺满稳
    expect(bar, '横杠不该铺满整条边').toContain('width: 62%')
    // 角章确实在 12px 处(top-3),这条是上下错开成立的前提
    expect(EQUIPMENT_CARD, '角章仍应在 top-3 —— 横杠的让位靠这条').toContain('right-0.5 top-3')
  })

  it('两处卡都接上了,且带可访问说法', () => {
    expect(EQUIPMENT_CARD, '装备格应渲染满级横杠').toContain('class="mastery-bar"')
    expect(EQUIPMENT_CARD, '装备格的读屏说法应带上标记').toContain('mastery.label')
    expect(ARTIFACT_PANEL, '法宝卡应渲染满级横杠').toContain('class="mastery-bar"')
    expect(ARTIFACT_PANEL, '法宝卡的满重判定走 masteryMark').toContain('artifactMastery(a.level)')
  })

  /**
   * 满级不许让控件消失 —— 236 轮连续踩了三次同一个坑。
   *
   * `equipUpgradeCost` / `artifactUpCost` 在满级/满重时返回 null,而按钮原先写
   * `v-if="cost"`。代价算不出来就把整颗钮拿掉,玩家看到的只是「强化」「炼化」凭空不见,
   * 既不知道是不是满了,也看不出是不是坏了;并排的两颗钮还会因此重排。
   *
   * 判据不是「不能出现 v-if」,而是「代价为 null 时仍有一句话」。
   * 故障注入:把任一处改回 `v-if="upCost"` / `v-if="row.upCost"`,本条红。
   */
  it('代价算不出来时,控件不消失而是禁用并写原因', () => {
    const DETAIL = readFileSync(resolve(ROOT, 'src/components/equipment/EquipmentDetailDialog.vue'), 'utf-8')
    const PANEL = readFileSync(resolve(ROOT, 'src/components/equipment/UpgradePanel.vue'), 'utf-8')

    // 装备详情:按钮常驻,代价为 null 时禁用
    expect(DETAIL, '装备强化钮不该写 v-if="upCost"').not.toMatch(/<button[^>]*\bv-if="upCost"/)
    expect(DETAIL, '装备满级时按钮禁用').toContain(':disabled="upCost ? upShort !== null : true"')
    expect(DETAIL, '装备满级时按钮写短状态').toContain("!upCost ? '已至上限'")

    // 强化面板:整块不整块消失,留一条状态行
    expect(PANEL, '强化面板满级时应有状态行').toContain('v-else-if="inst && !upCost"')
    expect(PANEL, '状态行要写出原因').toContain('{{ upgradeCapToast() }}')

    // 法宝:炼化钮同理
    expect(ARTIFACT_PANEL, '法宝炼化钮不该写 v-if="row.upCost"').not.toMatch(/<button[^>]*\bv-if="row\.upCost"/)
    expect(ARTIFACT_PANEL, '法宝满重时按钮禁用').toContain(':disabled="!row.upCost || row.short?.short != null"')
    expect(ARTIFACT_PANEL, '法宝满重时按钮写短状态').toContain('<template v-else>已至上限</template>')
  })
})
