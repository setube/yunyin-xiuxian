/**
 * 高级物质感层(luster):只在最上档出现,且不许抢内容。
 *
 * 这一层为什么单开:品阶视觉前两级回答「这件有多稀有」,玩家读到的是信息;
 * 而攒到一件顶级物时想要的是**心里一喜**,那是形制。信息可以每档都给,
 * 形制必须稀缺 —— 每一档都加一层,等于每档都没有。
 *
 * 三条铁律各有一组判据:
 *   一 只在最上档     —— 天/仙/玄/凡一律 null
 *   二 不抢内容       —— 特效层 pointer-events:none,且与品阶角饰位置错开
 *   三 尊重减少动效   —— 静态形制自己站得住,动效只是加成
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { lusterOf, lusterByRank, DIVINE_TOP_RANK } from './luster'
import { qualityDef, QUALITIES } from '@/data/qualities'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const EQUIPMENT_CARD = readFileSync(resolve(ROOT, 'src/components/equipment/EquipmentCard.vue'), 'utf-8')
const ARTIFACT_PANEL = readFileSync(resolve(ROOT, 'src/components/inventory/ArtifactPanel.vue'), 'utf-8')
const DETAIL_DIALOG = readFileSync(resolve(ROOT, 'src/components/equipment/EquipmentDetailDialog.vue'), 'utf-8')
const PILL_VIEW = readFileSync(resolve(ROOT, 'src/views/InventoryView.vue'), 'utf-8')
const MARKET = readFileSync(resolve(ROOT, 'src/components/market/MarketShelfSection.vue'), 'utf-8')
const TITLES = readFileSync(resolve(ROOT, 'src/views/TitlesView.vue'), 'utf-8')
const GONGFA_DIALOG = readFileSync(resolve(ROOT, 'src/components/cultivation/GongfaDialog.vue'), 'utf-8')
const COLLECTION = readFileSync(resolve(ROOT, 'src/views/CollectionView.vue'), 'utf-8')
const CODEX_TS = readFileSync(resolve(ROOT, 'src/ui/codex.ts'), 'utf-8')

/** 取 CSS 里某个选择器的声明块 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)
  return m?.[1] ?? ''
}

describe('高级物质感 · 一、只在最上档出现', () => {
  it('只有最上档返回形制,其余一律 null', () => {
    expect(lusterOf('divine')).not.toBeNull()
    for (const q of QUALITIES.filter(x => x.rank < DIVINE_TOP_RANK)) {
      expect(lusterOf(q.id), `${q.name} 不该有质感层 —— 每档都给,等于每档都没有`).toBeNull()
    }
  })

  it('按 rank 判与按 id 判一致(丹药的道品走 rank 入口)', () => {
    expect(lusterByRank(DIVINE_TOP_RANK)).not.toBeNull()
    expect(lusterByRank(DIVINE_TOP_RANK - 1)).toBeNull()
    // 道品 rank 9 在神品之上,同样享有
    expect(lusterByRank(DIVINE_TOP_RANK + 1)).not.toBeNull()
    expect(lusterByRank(Number.NaN)).toBeNull()
  })

  it('档位阈值与品阶表同源,不另立一套', () => {
    expect(DIVINE_TOP_RANK).toBe(qualityDef('divine').rank)
    // 断言「最高档确实是最高的」:若将来加入更高档,这条会红,提醒回来改
    const top = Math.max(...QUALITIES.map(q => q.rank))
    expect(top, '品阶表出现了比神品更高的档,质感层的判定要跟着改').toBe(DIVINE_TOP_RANK)
  })

  it('说法复用既有状态词,不自创', () => {
    expect(lusterOf('divine')!.label).toBe(qualityDef('divine').name)
  })
})

describe('高级物质感 · 二、不抢内容', () => {
  it('特效层一律不吃指针事件', () => {
    for (const sel of ['.luster-cornice', '.luster-sheen']) {
      const body = block(sel)
      expect(body, `缺 ${sel}`).not.toBe('')
      expect(body, `${sel} 须 pointer-events: none —— 否则会挡住卡片的点击`).toContain('pointer-events: none')
    }
  })

  it('四角御纹与品阶角饰错开 —— 同角不同长,读作两层框而非画了两遍', () => {
    // 御纹的尺寸写在 ::before/::after 的公共块里,位置在各自伪元素块
    const common = block('.luster-cornice::before,\n.luster-cornice::after')
    const pos = block('.luster-cornice::before')
    const auraCorner = block('.q-aura-corner--tl')
    expect(common, '缺御纹尺寸块').not.toBe('')
    expect(pos, '缺御纹位置块').not.toBe('')
    expect(auraCorner, '缺品阶角饰').not.toBe('')
    expect(common, '御纹须比品阶角饰(9~11px)更长').toContain('18px')
    expect(auraCorner, '品阶角饰应仍是 9px —— 御纹的差别靠这条').toContain('width: 9px')
    // 两者都要贴角:御纹退到 2~3px,靠长度差而非位移差区分
    expect(pos, '御纹应贴角').toContain('left: 2px')
  })

  it('方形小格只画左上那一枚 —— 右下是内容读数(数量 / 强化)的地方', () => {
    /*
     * 实测:材料格的「10」离格边只剩 5px×3px,而御纹的右下直角是 18px ——
     * 渲染出来是数量压在一枚朱砂直角上。形制与内容争同一处时,让位的是形制。
     */
    expect(block('.luster-cornice--tile::after'), '格子档要收掉右下那枚').toContain('content: none')

    // 窄卡都得挂格子档:它们右下都放着读数或按钮
    expect(EQUIPMENT_CARD, '装备格右下有强化 +N').toContain("props.item.level > 0")
    expect(EQUIPMENT_CARD, '装备格应走格子档').toContain('luster-cornice--tile')
    expect(PILL_VIEW, '丹药格应走格子档').toContain('luster-cornice luster-cornice--tile')
    expect(PILL_VIEW, '材料格应走格子档').toMatch(/m\.luster.*luster-cornice--tile|class="luster-cornice luster-cornice--tile"/)
    // 坊市两列窄卡(168×99):实测御纹 (148,79)–(166,97) 与右下「买下」按钮 (110,54)–(156,89) 相交
    expect(MARKET, '坊市货格右下是「买下」按钮').toContain('买下')
    expect(MARKET, '坊市货格应走格子档').toContain('luster-cornice luster-cornice--tile')

    // 宽卡右下不摆读数也不摆按钮,保持两枚形制
    for (const [src, name] of [
      [ARTIFACT_PANEL, '法宝卡'],
      [TITLES, '灵兽卡']
    ] as const) {
      expect(src, `${name}是宽卡,不必收角`).toContain('class="luster-cornice"')
    }
  })

  it('骑缝印落在面板留白里,不压正文', () => {
    const crown = block('.luster-frame .luster-crown')
    expect(crown, '缺骑缝印').not.toBe('')
    // 正文 px-5 = 20px;印 left:0 宽 20px 正好占这段留白
    expect(crown, '印应贴面板内沿').toContain('left: 0')
    expect(crown, '印宽应与正文左留白相当(20px)').toContain('width: 20px')
  })

  it('卡面类:装备/法宝/丹药/坊市/名号都接上了御纹与流光', () => {
    expect(EQUIPMENT_CARD, '装备卡应渲染御纹').toContain('luster-cornice')
    expect(EQUIPMENT_CARD, '装备卡应渲染流光').toContain('luster-sheen')
    expect(EQUIPMENT_CARD, '装备卡的挂载条件走 lusterOf').toContain('lusterOf(')
    expect(ARTIFACT_PANEL, '法宝卡应渲染御纹').toContain('luster-cornice')
    expect(ARTIFACT_PANEL, '法宝卡应渲染流光').toContain('luster-sheen')
    expect(PILL_VIEW, '丹药格应渲染御纹').toContain('luster-cornice')
    expect(PILL_VIEW, '丹药走 rank 入口(道品 rank 9 也要享有)').toContain('lusterByRank(')
    expect(MARKET, '坊市货格应渲染御纹').toContain('luster-cornice')
    expect(TITLES, '名号卡应渲染御纹').toContain('luster-cornice')
  })

  it('详情类:装备/丹药/功法/图鉴的弹窗都挂整幅框与骑缝印', () => {
    for (const [src, name] of [
      [DETAIL_DIALOG, '装备详情'],
      [PILL_VIEW, '丹药详情'],
      [GONGFA_DIALOG, '功法详情'],
      [COLLECTION, '图鉴详情']
    ] as const) {
      expect(src, `${name}应挂整幅框`).toContain('luster-frame')
      expect(src, `${name}应渲染骑缝印`).toContain('luster-crown')
    }
  })

  it('标题字面真的接上了 —— 定义了却从不使用的类是死的', () => {
    // .luster-title 若无人挂,标题就永远只是普通标题,而 CSS 里那段字距/描边成了装饰性死代码
    for (const [src, name] of [
      [DETAIL_DIALOG, '装备详情'],
      [PILL_VIEW, '丹药详情'],
      [GONGFA_DIALOG, '功法详情'],
      [COLLECTION, '图鉴详情']
    ] as const) {
      expect(src, `${name}应给标题挂 luster-title`).toContain("'luster-title'")
    }
    // 挂载入口在 BaseModal,且只接受形制类
    const base = readFileSync(resolve(ROOT, 'src/components/common/BaseModal.vue'), 'utf-8')
    expect(base, 'BaseModal 应把 titleClass 转到 h3 上').toContain('props.titleClass')
  })

  it('凡是挂了品阶光环的卡面,都要一并考虑质感层(防新增卡面漏接)', () => {
    /*
     * 品阶光环是「稀有度」那一层,质感层是「形制」那一层。新增一个带品阶的卡面时,
     * 只接前者是常态 —— 所以这里按目录扫,把「有 QualityAura 却完全没有 luster」的卡面揪出来,
     * 逼作者显式决定「这块要不要质感层」。
     */
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (e.name.endsWith('.vue')) files.push(full)
      }
    }
    walk(resolve(ROOT, 'src'))
    /*
     * 防空转:files 为空时,下面那条 toEqual([]) 恒真 —— 它只证明「一个 .vue 都没扫到」。
     * 实测 src 下有百余个 .vue,取 50 为下限。
     */
    expect(files.length, '没扫到任何 .vue —— 判据没跑到东西').toBeGreaterThan(50)
    const auraOnly = files
      .filter(f => readFileSync(f, 'utf-8').includes('QualityAura'))
      .filter(f => !readFileSync(f, 'utf-8').includes('luster'))
      .map(f => f.slice(ROOT.length + 1))
    expect(
      auraOnly,
      `这些卡面挂了品阶光环却没有接入质感层,新增卡面时请显式决定:\n${auraOnly.join('\n')}`
    ).toEqual([])
  })

  it('图鉴是标签流:用小字而非御纹,不与卡片抢同一套形制', () => {
    expect(CODEX_TS, '图鉴条目要有 luster 字段').toContain('luster?')
    expect(COLLECTION, '标签流里用一枚小字').toContain('entry.luster.label.charAt(0)')
    // 标签本身很小,塞御纹会挤成一团
    expect(COLLECTION, '标签流里不该出现御纹').not.toContain('entry.luster" class="luster-cornice')
  })
})

describe('高级物质感 · 三、尊重减少动效', () => {
  it('流光的静态形态在两处减少动效设置里都有兜底', () => {
    // 系统偏好:兜底写在那块 @media 内部
    const prefers = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    expect(prefers, 'prefers-reduced-motion 块里缺流光兜底').toContain('.luster-sheen::after')
    expect(prefers, '兜底应给静态高光').toContain('linear-gradient')
    // 设置项:同样有
    expect(CSS, '设置里的「减少动效」同样要兜底').toContain('.reduce-motion .luster-sheen::after')
  })

  it('兜底不许用 animation: none —— 那会让 animationend 永不触发', () => {
    // 与 reducedMotion.spec 同一条理由:全局块刻意用 0.01ms 保留「跑过一次」的前提
    expect(CSS, '不要靠 animation 简写关掉,只覆盖外观').not.toMatch(/animation:\s*none/)
  })

  it('静态兜底仍保留形制 —— 不是把整层隐藏', () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    expect(reduced, '减少动效下不该用 display:none 抹掉形制').not.toContain('display: none')
    expect(reduced, '应给一段静态高光').toContain('linear-gradient')
  })
})
