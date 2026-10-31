/**
 * 同源审计:同一件事只许有一处算法(读源码文本)。
 * 界面重算时数值照样对,行为测试看不见。
 */
import { describe, expect, it } from 'vitest'

const SOURCES = import.meta.glob(
  [
    '../views/AdventureView.vue',
    '../components/adventure/CombatPanel.vue',
    '../components/adventure/BattleIntelPanel.vue',
    '../components/adventure/RegionCard.vue',
    '../components/adventure/ExploreModeDialog.vue',
    '../composables/useRegionRows.ts',
    '../core/exploration.ts',
    '../core/offline.ts'
  ],
  { query: '?raw', import: 'default', eager: true }
) as Record<string, string>

/** 按文件名取源码:glob 键混有 '../views/…' 与 './exploration.ts' 两种形状,按路径匹配会漏同目录文件而假绿 */
function readSrc(fileName: string): string {
  const hit = Object.entries(SOURCES).find(([path]) => path.split('/').pop() === fileName)
  if (!hit) throw new Error(`审计读不到 ${fileName} —— glob 没匹配上,断言会假绿`)
  return hit[1]
}

describe('同源审计 · 镇压速率', () => {
  it('地界卡的镇压速率走 suppressRateLine,自己不许再算一遍 stoneByTier', () => {
    const src = readSrc('RegionCard.vue')
    expect(src, '界面必须用唯一那份速率实现').toContain('suppressRateLine')
    // 判「有没有再算一遍」,不判「有没有提到这个词」
    expect(src, '界面自己算一遍就等于第二份真相源(调常数时界面开始撒谎)').not.toMatch(/stoneByTier\s*\(/)
    expect(src, '产出行文案连拼接都不许自己写').not.toMatch(/灵石\/时/)
  })

  /**
   * 镇守道韵与老区装备气运:界面读 core/suppress 导出的纯函数,不现算「区数 × 8%」或「守了几天 × 0.1」。
   * 故障注入:把卡片里的 suppressionEquipmentLuck 换成内联 `Math.min(0.8, days*0.1)` → 本条红。
   */
  it('地界卡的镇守道韵与装备气运走 core/suppress 的纯函数,自己不重算', () => {
    const src = readSrc('RegionCard.vue')
    expect(src, '道韵文案该走 suppressDaoText').toContain('suppressDaoText')
    expect(src, '装备气运该走 suppressionEquipmentLuck').toContain('suppressionEquipmentLuck')
    expect(src, '界面又内联了 0.8 气运封顶 —— 调上限时两处会分叉').not.toMatch(/Math\.min\(\s*0\.8\b/)
    expect(src, '界面又内联了每日 0.1 气运 —— 改日增速时两处会分叉').not.toMatch(/0\.1\s*\*/)
  })

  it('历练页的镇压总纲只说「每区多少」,上限与增速取自 core/suppress 的具名常量', () => {
    const src = readSrc('AdventureView.vue')
    expect(src, '总纲该报每区加成,取自常量').toContain('SUPPRESS_EXP_PER_REGION')
    expect(src, '总纲该报封顶,取自常量').toContain('SUPPRESS_EXP_MAX')
    expect(src, '总纲又手打了 8% / 40% —— 调常数时文案开始撒谎').not.toMatch(/\+8%|40%/)
  })

  it('镇压达成回执报的是同一份产出数字,不是一句「自动产出资源」', () => {
    const src = readSrc('exploration.ts')
    expect(src, '回执该调唯一那份产出行').toContain('suppressRateLine(')
    expect(src, '回执缺数字就等于成就时刻不报账').not.toMatch(/此地将自动产出资源/)
  })
})

describe('同源审计 · 区域之主的门槛', () => {
  it('在线与离线都不许再写死 10 胜,门槛只认具名常数或 winsUntilRegionBoss', () => {
    for (const fileName of ['exploration.ts', 'offline.ts']) {
      const src = readSrc(fileName)
      expect(src, `${fileName} 该引用具名常数`).toMatch(/EXPLORE_BOSS_AFTER_WINS|winsUntilRegionBoss/)
      expect(src, `${fileName} 里又出现了 wins >= 10 这种字面量`).not.toMatch(/wins\s*>=\s*10\b/)
    }
  })

  it('离线问首领资格也走 winsUntilRegionBoss,不自己再造一份「本段胜场够不够」', () => {
    const src = readSrc('offline.ts')
    // 在线认整趟会话的 s.wins;离线拿本段 wins 比则同一趟历练有两套判据
    expect(src, '离线首领资格应与在线同一个判定函数').toContain('winsUntilRegionBoss(')
    expect(src, '离线门槛须并入会话累计胜场').toMatch(/winsUntilRegionBoss\(\s*session\.wins\s*\+\s*wins/)
    expect(src, '不许再拿本段胜场直接比门槛').not.toMatch(/wins\s*>=\s*EXPLORE_BOSS_AFTER_WINS/)
  })

  it('战斗页的头目提示走 winsUntilRegionBoss,不自己比门槛', () => {
    const src = readSrc('CombatPanel.vue')
    expect(src).toContain('winsUntilRegionBoss')
    expect(src, '提示自己比一遍门槛,改常数时提示就开始撒谎').not.toContain('EXPLORE_BOSS_AFTER_WINS')
  })

  it('战斗情报四块只在 BattleIntelPanel,宿主不再自持一份', () => {
    const host = readSrc('CombatPanel.vue')
    const intel = readSrc('BattleIntelPanel.vue')
    // 判「谁在算」不判「谁提到」;宿主只剩挂载
    // `enemyLoreView` 不在此列:宿主仍用它判「眼熟门」与特性星级(纯读函数的第二处调用)
    for (const token of ['battleSummary', 'battleLoot', 'analysisSections', 'showAnalysis', 'showLore']) {
      expect(host, `宿主不该再自己算 ${token}`).not.toContain(token)
    }
    for (const token of ['battleSummary', 'battleLoot', 'analysisSections', 'showAnalysis', 'showLore']) {
      expect(intel, `情报面板该由自己算 ${token}`).toContain(token)
    }
    expect(intel, '此物所知仍在情报面板里读').toContain('enemyLoreView(')
    expect(host, '宿主该挂载情报面板').toContain('<BattleIntelPanel')
    // 战报行须是四段实账:不只「几回合 · 胜负」,还有抢先与战后气血
    expect(intel, '战报行要点名回合数').toContain('此战 ${r.rounds} 回合')
    expect(intel, '战报行要报战后气血').toContain('战后气血')
    expect(intel, '战报行要报先手').toContain('抢先')
  })
})

describe('同源审计 · 历练收益账', () => {
  it('会话收益取 afterWin 真实入账,不自己按层级另算,也不数文案行', () => {
    const src = readSrc('exploration.ts')
    expect(src, '会话该记 afterWin 报的 drops.stone / drops.exp / drops.items').toMatch(/drops\.(stone|exp|items)/)
    expect(src, '自己按层级算一份灵石 = 与行囊对不上的第二套账').not.toMatch(/stoneByTier\s*\(/)
    expect(src, 'items 属实物件数,不许拿文案行数充数').not.toMatch(/drops\.lines\.length/)
  })

  it('离线把挂机所得折进会话(回来接着打时面板不漏离线段)', () => {
    const src = readSrc('offline.ts')
    expect(src).toMatch(/stoneGain:\s*add\(session\.stoneGain/)
    expect(src).toMatch(/expGain:\s*add\(session\.expGain/)
  })
})

/** 全部运行时源码(.ts / .vue,不含用例) */
const ALL_SOURCES = import.meta.glob(['../**/*.ts', '../**/*.vue', '!../**/*.spec.ts'], {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

/** 去掉注释:注释不算「又写了一份」 */
function stripComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('同源审计 · 词条能长在哪(议题 #22)', () => {
  /**
   * 掉落、重铸、自动重铸候选、词条转移四处都问「这条词条能不能长在这件上」。
   * 运行时代码读 slots / minRank 字段(`.slots`、`?.minRank`、解构 `{ slots, minRank }`)只许在 data/affixes.ts;
   * 只为显示读的登记在 READ_ONLY,写清为什么不算判据。
   * 故障注入:把详情弹窗 affixOptions 改回内联的 minRank 过滤 → 只有这一条红。
   */
  it('部位与品质门槛只在 data/affixes.ts 判一次(affixFitBlock),别处不许再读这两个字段', () => {
    expect(Object.keys(ALL_SOURCES).length, 'glob 没扫到源码,断言会假绿').toBeGreaterThan(100)
    const READS = /(?:\?\.|\.)(?:slots|minRank)\b|\{[^}]*\b(?:slots|minRank)\b[^}]*\}\s*=/
    /** 只读来显示、不做判断:文件 → 允许的整行(整行比对,改了须重新过目) */
    const READ_ONLY: Record<string, string[]> = {
      /** 词条图只显示「能长在哪、几品起」,不喂判断(判断只走 affixFitBlock);改作判断即销账 */
      '/ui/affixInfoText.ts': [
        "if (!def.slots || def.slots.length === 0) return '全部位'",
        "return def.slots.map(s => EQUIP_SLOT_NAMES[s] ?? s).join('·')",
        'if (def.minRank === undefined) return null',
        'return `需${QUALITIES.find(q => q.rank === def.minRank)?.name ?? `${def.minRank} 品`}起`'
      ],
      '/ui/affixTransferText.ts': ['const minRank = affixDef(affixId)?.minRank ?? 0']
    }
    const paths = Object.keys(ALL_SOURCES)
    expect(
      Object.keys(READ_ONLY).filter(suffix => !paths.some(p => p.endsWith(suffix))),
      'READ_ONLY 里登记的文件已不存在,销账'
    ).toEqual([])
    const offenders = Object.entries(ALL_SOURCES)
      .filter(([path]) => !path.endsWith('/data/affixes.ts'))
      .flatMap(([path, src]) => {
        const allowed = Object.entries(READ_ONLY).find(([suffix]) => path.endsWith(suffix))?.[1] ?? []
        return stripComments(src)
          .split('\n')
          .map(line => line.trim())
          .filter(line => READS.test(line) && !allowed.includes(line))
          .map(line => `${path} → ${line}`)
      })
    expect(offenders, '这些地方又读了词条的部位/品质门槛,判断改走 affixFitBlock').toEqual([])
  })

  /** 故障注入:页脚里加一处 stoneByTier( → 只有这一条红。 */
  it('词条转移的界面只认 planTransfer 的价,不自己算', () => {
    const ui = ['useAffixTransfer.ts', 'AffixTransferPanel.vue', 'AffixTransferFooter.vue'].map(name => {
      const hit = Object.entries(ALL_SOURCES).find(([path]) => path.split('/').pop() === name)
      if (!hit) throw new Error(`审计读不到 ${name}`)
      return [name, stripComments(hit[1])] as const
    })
    for (const [name, src] of ui) {
      expect(src, `${name} 自己算价 = 价签与实扣两套账`).not.toMatch(
        /stoneByTier\s*\(|sealCost\s*\(|expectedRollsToHit\s*\(|REFORGE_(STONE|DUST)_BASE|TRANSFER_PRICE_RATE/
      )
    }
    const flow = ui.find(([name]) => name === 'useAffixTransfer.ts')![1]
    expect(flow, '价与可否必须来自 planTransfer').toMatch(/planTransfer\s*\(/)
    expect(flow, '付不付得起必须来自 transferShort').toMatch(/transferShort\s*\(/)
  })
})

describe('同源审计 · 装备掉落概率的封顶', () => {
  /**
   * 装备掉落概率封顶:在线 afterWin 与离线 settleOffline 只读 constants 的 EQUIP_DROP_CHANCE_CAP;
   * 离线不夹取则两边装备期望分叉。
   * 只针对装备掉落这条式子,不判一切 0.9:loreService 另有 `Math.min(0.9, base + familiarity)`(认知上限,语义无关)。
   * 故障注入:把 offline.ts 的封顶改回内联 `Math.min(0.9, …)` → 本条红。
   */
  it('在线与离线都只读 EQUIP_DROP_CHANCE_CAP,谁也不再内联 0.9 封顶', () => {
    const read = (name: string): [string, string] => {
      const hit = Object.entries(ALL_SOURCES).find(([path]) => path.split('/').pop() === name)
      if (!hit) throw new Error(`审计读不到 ${name} —— glob 没匹配上,断言会假绿`)
      return [name, stripComments(hit[1])]
    }
    for (const name of ['loot.ts', 'offline.ts']) {
      const [file, src] = read(name)
      expect(src, `${file} 该引用具名封顶常量`).toContain('EQUIP_DROP_CHANCE_CAP')
      expect(src, `${file} 又内联了 0.9 装备封顶 —— 改常数时两边会分叉`).not.toMatch(/Math\.min\(\s*0\.9\b/)
    }
  })
})

describe('同源审计 · 凡界路线的层级上限', () => {
  /**
   * 凡界路线层级上限只读 `data/regions` 的 MORTAL_TIER_MAX:候选池(BOSSES / MOBS)与骨架扰动
   * `jitterTiers` 须同源。
   * 只按这一条式子的字面判,不扫一切 20:mortalWorldGen 里另有段数、权重等数字。
   * 故障注入:把 Math.min(MORTAL_TIER_MAX, …) 改回 Math.min(20, …) → 本条红。
   */
  it('骨架扰动的层级封顶读 MORTAL_TIER_MAX,不再内联裸 20', () => {
    const hit = Object.entries(ALL_SOURCES).find(([path]) => path.split('/').pop() === 'mortalWorldGen.ts')
    if (!hit) throw new Error('审计读不到 mortalWorldGen.ts —— glob 没匹配上,断言会假绿')
    const src = stripComments(hit[1])
    expect(src, '扰动该引用具名层级上限常量').toContain('Math.min(MORTAL_TIER_MAX,')
    expect(src, '又内联了裸 20 层级封顶 —— 改常量时两处会分叉').not.toMatch(/Math\.min\(\s*20\s*,/)
  })
})
