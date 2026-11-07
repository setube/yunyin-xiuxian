/**
 * 二步确认的几何:同一颗钮,点前点后不许变形。
 *
 * 「重铸词条」那颗钮此前把价签内联在正文里,而两态用的又是不同的分栏:
 *   未确认态  重铸词条 + 价签 | 封存一词 / 封存差
 *   确认态    确认重铸 + 价签 | 再想想
 * 于是一来一回点,钮宽高在 150.5×51 与 143.5×65.5 之间跳,页脚整体高 220.8 ~ 235.3 来回,
 * 正文滚动盒跟着缩一截。320 宽更糟:价签把「重铸词条」压成竖排,一颗钮 123×84。
 * 玩家读到的是「这界面在抖」,而抖动本身不指向任何状态变化 —— 状态变化只该改文字与色。
 *
 * 三族二步确认已按「两态同栏、同高」重排(重铸页脚 / 自动重铸预算行 / 分解页脚)。
 * 这是静态可查的那一半;真几何由 scripts/detail-geometry.mjs 在浏览器里量。
 *
 * 故障注入:把价签挪回钮内、去掉 min-h-11、或让确认态比未确认态多一个钮,本用例红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf-8')

const REFORGE_FOOTER = 'components/equipment/EquipReforgeFooter.vue'
const DETAIL = 'components/equipment/EquipmentDetailDialog.vue'
const AUTO_PANEL = 'components/equipment/AutoReforgePanel.vue'

describe('二步确认 · 两态同栏同高', () => {
  it('重铸页脚:价签不在按钮正文里', () => {
    const src = read(REFORGE_FOOTER)
    // 价签整行独立成段
    expect(src, '价签该在自己那一段').toContain('一炉 灵石 {{ formatGN(reforgeCostVal.stone) }}')
    // 按钮正文只剩动作词
    expect(src, '重铸钮正文只留动作词').toMatch(/>\s*重铸词条\s*<\/button>/)
    expect(src, '确认钮正文只留动作词').toMatch(/>\s*确认重铸\s*<\/button>/)
    // 反向:钮内不许再出现 formatGN(会把钮撑高)
    for (const name of ['重铸词条', '确认重铸']) {
      const block = new RegExp(`${name}\\s*</button>`).test(src)
      expect(block, `${name} 钮里不该再挂数值`).toBe(true)
    }
    const inner = src.slice(src.indexOf('重铸词条') - 400, src.indexOf('重铸词条'))
    expect(inner, '重铸钮的开标签里不该有 formatGN').not.toContain('formatGN')
  })

  it('重铸页脚:两态按钮都写 min-h-11,行高不随确认态变', () => {
    const src = read(REFORGE_FOOTER)
    const tags = [...src.matchAll(/<button[\s\S]*?>/g)].map(m => m[0])
    // 说明用按钮的四种(重铸 / 自动重铸 / 再想想 / 确认重铸)都带
    const rowButtons = tags.filter(t => /min-h-11/.test(t))
    expect(rowButtons.length, '这一行四颗钮都该有 min-h-11').toBeGreaterThanOrEqual(4)
  })

  it('重铸页脚:确认态的取消钮在左、确认钮在右,与全站同一顺序', () => {
    const src = read(REFORGE_FOOTER)
    const arm = src.slice(src.indexOf('<template v-else>'))
    expect(arm.indexOf('再想想'), '取消在左').toBeLessThan(arm.indexOf('确认重铸'))
  })

  it('分解确认:整行换掉,不与「卸下/强化」挤同一条', () => {
    const src = read(DETAIL)
    // 未确认态与确认态是两个互斥的行;确认态用 grid 两栏(等宽见下一条用例)
    expect(src, '分解确认态须另起一行').toMatch(/<div v-else class="grid grid-cols-2 gap-2">/)
    expect(src, '确认分解须自带一行').toMatch(/确认分解<\/button>/)
    /*
     * 反向:确认分解不许与「装 备 / 强 化」同处一条 flex。
     * 判据取「确认钮所属那一层 div 的内容」:从它最近的一个 `<div` 起算到钮正文。
     * 两处容易写错、第一次都写错了:
     *   一 不能按前缀匹配 `<div class="flex gap-2">` —— 确认态那行是给 `v-else` 用的,前缀对不上;
     *   二 不能拿 `indexOf('确认分解')` 定位 —— 上面那段注释里就写着这四个字,取到的是注释。
     * 故锚点是带闭合标签的 `确认分解</button>`。
     */
    const btn = src.indexOf('确认分解</button>')
    expect(btn, '找不到确认分解钮').toBeGreaterThan(0)
    const armRow = src.slice(src.lastIndexOf('<div', btn), btn)
    expect(armRow, '确认分解所在行不该再有「装 备」').not.toContain('装 备')
    expect(armRow, '确认分解所在行不该再有「强 化」').not.toContain('强 化')
    expect(armRow, '确认分解所在行不该再有垃圾桶钮').not.toContain('GameIcon name="trash"')
  })

  it('分解确认:两态都写 min-h-11', () => {
    const src = read(DETAIL)
    const footer = src.slice(src.indexOf('decomposeArm !== inst?.uid'), src.indexOf('</template>', src.indexOf('确认分解')))
    expect(footer, '未确认态三颗钮都带 min-h-11').toMatch(/btn-seal min-h-11 flex-1" @click="toggleEquip"/)
    expect(footer, '确认态两颗钮都带 min-h-11').toMatch(/btn-seal min-h-11 w-full" @click="doDecompose"/)
  })

  /**
   * 全站:btn-ghost 与 btn-seal 并排时,两枚必须严格等宽。
   *
   * 两套按钮的左右内边距不同(.btn-seal 18px/.btn-ghost 16px),
   * 而 `flex-1` 分配的是内容盒之上的空间、内容最小宽以 padding 为下界 ——
   * 于是 flex + 双 flex-1 必然差 2px。实测:
   *   重铸页脚 114/116、清空存档 141.5/143.5。
   * 那 2px 就是玩家说的「点一下钮就左右各挪一点」。
   * grid 的两栏与内容无关,故规定:这一对并排时外层用 grid-cols-2,
   * 钮本体写 w-full 撑满格(不写 flex-1 —— grid 下它不起作用,只会误导后人)。
   *
   * 故障注入:把任一处的 grid 改回 flex + flex-1,本条红。
   */
  it('btn-ghost 与 btn-seal 并排时用 grid 两栏,不用 flex + flex-1', () => {
    const files = [
      'components/common/ExitConfirmDialog.vue',
      'components/settings/SettingsSaveSection.vue',
      'components/inventory/DismantleDialog.vue',
      'components/equipment/EquipmentDetailDialog.vue',
      'views/CelestialView.vue',
      'views/WelcomeView.vue',
      'components/equipment/EquipReforgeFooter.vue',
      'components/adventure/SecretRealmCard.vue',
      'components/celestial/TrialPanel.vue',
      'components/cultivation/GongfaDialog.vue',
      'components/inventory/ArtifactPanel.vue'
    ]
    const bad: string[] = []
    for (const rel of files) {
      const src = read(rel)
      // 逐个容器块看:同一块里既有 btn-ghost 又有 btn-seal,且两个都带 flex-1
      for (const m of src.matchAll(/<div[^>]*class="([^"]*)"[^>]*>([\s\S]{0,900}?)<\/div>/g)) {
        const cls = m[1] ?? ''
        const body = m[2] ?? ''
        if (!body.includes('btn-ghost') || !body.includes('btn-seal')) continue
        const n = (body.match(/\bflex-1\b/g) ?? []).length
        if (n >= 2 && /\bflex\b/.test(cls) && !cls.includes('grid')) {
          bad.push(`${rel} → «${cls.slice(0, 30)}»`)
        }
      }
    }
    expect(bad, 'ghost 与 seal 并排时 flex-1 会差 2px;改用 grid-cols-2 + w-full').toEqual([])
  })

  it('自动重铸预算行:读数不参与收缩,按钮段整段折行', () => {
    const src = read(AUTO_PANEL)
    expect(src, '「至多洗」不许被压窄').toMatch(/shrink-0 whitespace-nowrap text-\[10px\] text-ink-faint">至多洗/)
    expect(src, '次数输入框不许被压窄').toMatch(/w-16 shrink-0 rounded border/)
    expect(src, '按钮段整段换行,不与读数抢宽度').toMatch(/ml-auto flex w-full items-center justify-end/)
  })

  /**
   * 器魂散置列表:钮组固定独占一行,不参与被压缩。
   *
   * 原先一行 justify-between、钮组跟着内容走:确认态比未确认态多一枚钮(88 → 165px),
   * 320 宽下左列被压到 22px ——「朦胧·锋魂」竖排成一行一个字,那一行从 177px 涨到 745px。
   * 改成可折行后仍不稳:375 宽下未确认态挤得进一行(102.5px)、确认态挤不进就折(126.8px),
   * 点一下「散去」整行长高 24px。
   * 故障注入:把钮组那行的 mt-1.5/justify-end 去掉、或让左列再吃 shrink,本条红。
   */
  it('器魂散置行:正文与钮组分两行,两态行高一致', () => {
    const src = read('views/SoulsView.vue')
    expect(src, '钮组须自成一行并右对齐').toMatch(/class="mt-1\.5 flex justify-end gap-1"/)
    expect(src, '左列不许被挤到比名字还窄').toContain('<div class="min-w-0">')
    // 反向:钮组不该再挂 shrink-0 挤在同一行
    expect(src, '钮组不该与正文同一行').not.toMatch(/flex shrink-0 gap-1">\s*<button class="btn-ghost !px-2\.5/)
  })

  /**
   * 构筑快照行:识别行与钮组分两段,钮组右对齐独占一行。
   *
   * 原先一行里挤着印章、名字、换装、改名、删除;删除确认态再多出两枚 ——
   * 320 宽下这一行从 99px 涨到 115.5px,「再想想」被压成 20px 宽 ×65px 高(两字竖排),
   * 名字也被截成「青…」。
   * 故障注入:把钮组塞回识别行(去掉 mt-1/justify-end),本条红。
   */
  it('构筑快照行:识别行与钮组分两段,两态同高', () => {
    const src = read('views/BuildView.vue')
    expect(src, '钮组须自成一行并右对齐').toMatch(/class="mt-1 flex justify-end gap-1\.5"/)
    expect(src, '识别行须单独一段').toMatch(/<p class="flex items-center gap-2">\s*<span class="grid h-6 w-6 shrink-0/)
    // 反向:钮组不该再挂在识别行里一起被挤压
    expect(src, '钮组不该再与名字同行').not.toMatch(/<span class="min-w-0 grow truncate font-kai text-\[12px\] text-ink">\{\{ lo\.name \}\}<\/span>\s*<button class="btn-ghost[^"]*">换装/)
  })

  /**
   * 洞府连升 / 灵脉连投 / 装备强化连升:两态正文同一段,钮组独占一行。
   *
   * 这三处的共同病灶是「确认态换了一段更短的正文」或「跟着正文挤同一行」:
   * 洞府 375 宽实测 88.6 → 52.5px,强化 320 宽实测 52.5 → 66.8px。
   * 故障注入:把正文按 batchArm 分岔,或把钮组的 w-full 去掉,本条红。
   */
  it('连升/连投/强化连升:两态正文同一段,钮组自带 w-full', () => {
    for (const rel of [
      'components/dongfu/BuildingCard.vue',
      'components/dongfu/VeinInvestCard.vue',
      'components/equipment/UpgradePanel.vue'
    ] as const) {
      const src = read(rel)
      expect(src, `${rel} 的钮组须自带 w-full`).toMatch(/flex w-full shrink-0 justify-end gap-1\.5"/)
      // 反向:正文里不该再按确认态分岔写第二段(那是段高变化的来源)
      expect(src, `${rel} 不该再给确认态写第二段正文`).not.toMatch(/v-(?:if|else)="!?batch(?:Arm|Confirm|ArtConfirm)[^"]*">\s*<p class="(?:min-w-\[5rem\] )?flex-1 text-\[10px\]/)
    }
  })

  /**
   * chip-ink 当按钮用时,要自己补触控下限。
   *
   * `.chip-ink` 的上下内边距只有 2px:只写 `!text-[10px]` 时盒高 21px,
   * 远低于全站 28px 的触控下限。修行页的「兑换」「连兑 10」就是这样 ——
   * 而它们是每日限 10 次、要连点的钮。
   * chip-ink 本身不能改内边距:它同时是标签(chip),标签不该撑高。
   * 故判据落在「当按钮用的 chip-ink 必须自带 min-h 或够大的 py」。
   * 故障注入:删掉任一处的 min-h-[28px],本条红。
   */
  it('chip-ink 当按钮用时自带触控下限', () => {
    const files = [
      'components/cultivation/GongfaSection.vue',
      'components/cultivation/BreakthroughCard.vue',
      'components/cultivation/RetreatCard.vue',
      'components/inventory/DismantleDialog.vue'
    ]
    for (const rel of files) {
      const src = read(rel)
      for (const m of src.matchAll(/<button[\s\S]{0,400}?>/g)) {
        const tag = m[0]
        if (!tag.includes('chip-ink')) continue
        const ok = /min-h-\[28px\]/.test(tag) || /!?py-(?:1\.5|2|2\.5|3)\b/.test(tag)
        expect(ok, `${rel} 有 chip-ink 按钮没写触控下限:\n${tag.replace(/\s+/g, ' ').slice(0, 120)}`).toBe(true)
      }
    }
  })

  /**
   * 重铸页脚两态各有两枚钮,必须严格等宽。
   *
   * 1px 级的左右挪动不好用「两态同高」那套判据抓(detail-geometry 量的是宽高:
   * 114 与 116 都「差不多」),而玩家看得见 —— 点一下钮,两枚各挪一点。
   * flex-1 + basis-0 + min-w-0 全写了仍然差 2px:.btn-seal 左右内边距 18px
   * 比 .btn-ghost 的 16px 宽,内容最小宽以 padding 为下界,「确认重铸」那一格先被撑到 116。
   * 统一 padding 只是把差值挪到另一枚(实测 120/110 更糟)。
   * grid 的两栏与钮内文字长短无关,实测严格 115/115。
   * 故障注入:把外层 grid 改回 flex,本条红。
   */
  it('重铸页脚用 grid 两栏:两态按钮严格等宽', () => {
    const src = read('components/equipment/EquipReforgeFooter.vue')
    expect(src, '页脚那行须是 grid 两栏').toMatch(/class="grid grid-cols-2 gap-2/)
    // 反向:不许退回 flex + flex-1 的分栏
    expect(src, '不许退回 flex + flex-1:那会让两枚差 2px').not.toMatch(/class="flex gap-2 text-\[11px\]"/)
  })

  it('自动重铸确认钮不把总账写进正文:320 宽会溢出面板', () => {
    const src = read(AUTO_PANEL)
    expect(src, '确认钮正文只留动作词').toMatch(/>\s*确认开洗\s*<\/button>/)
    expect(src, '整批总账另起一行').toContain('至多 灵石 {{ autoMaxCost ? formatGN(autoMaxCost.stone) : \'0\' }}')
    // 反向:钮里再挂总账会撑爆
    expect(src, '确认钮不该再把 formatGN 写进正文').not.toMatch(/确认开洗 · 至多 灵石/)
  })
})
