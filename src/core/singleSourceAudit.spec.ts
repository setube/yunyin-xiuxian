/**
 * 同源审计 —— 同一件事只许有一处算法(读源码文本)
 *
 * 本仓库反复踩的坑(见 HYP-015):同一件事写两遍,改一处必漏一处 ——
 * 界面手抄一份结算常数、在线离线各写一个门槛、会话另算一份收益。
 *
 * 这类缺陷**行为测试看不见**:界面自己又算一遍时,数值照样"对",直到有人调了那半边。
 * 故这里直接读源码文本,把「谁都不许再抄一遍」写成断言。
 */
import { describe, expect, it } from 'vitest'

const SOURCES = import.meta.glob(
  [
    '../views/AdventureView.vue',
    '../components/adventure/CombatPanel.vue',
    '../core/exploration.ts',
    '../core/offline.ts'
  ],
  { query: '?raw', import: 'default', eager: true }
) as Record<string, string>

/**
 * 取某文件源码。按**文件名**取,不按路径 ——
 * glob 的键是相对本文件的路径('../views/…' 与 './exploration.ts' 两种形状混在一起),
 * 按路径匹配会漏掉同目录的那两个,漏了就会在空字符串上假绿。
 */
function readSrc(fileName: string): string {
  const hit = Object.entries(SOURCES).find(([path]) => path.split('/').pop() === fileName)
  if (!hit) throw new Error(`审计读不到 ${fileName} —— glob 没匹配上,断言会假绿`)
  return hit[1]
}

describe('同源审计 · 镇压速率', () => {
  it('历练页的镇压速率走 suppressRateFor,自己不许再算一遍 stoneByTier', () => {
    const src = readSrc('AdventureView.vue')
    expect(src, '界面必须用唯一那份速率实现').toContain('suppressRateFor')
    // 判「有没有再算一遍」而不是「有没有提到这个词」:注释里解释这件事本身是好事
    expect(src, '界面自己算一遍就等于第二份真相源(调常数时界面开始撒谎)').not.toMatch(/stoneByTier\s*\(/)
  })
})

describe('同源审计 · 区域之主的门槛', () => {
  it('在线与离线都不许再写死 10 胜,只认 EXPLORE_BOSS_AFTER_WINS', () => {
    for (const fileName of ['exploration.ts', 'offline.ts']) {
      const src = readSrc(fileName)
      expect(src, `${fileName} 该引用具名常数`).toContain('EXPLORE_BOSS_AFTER_WINS')
      expect(src, `${fileName} 里又出现了 wins >= 10 这种字面量`).not.toMatch(/wins\s*>=\s*10\b/)
    }
  })

  it('战斗页的头目提示走 winsUntilRegionBoss,不自己比门槛', () => {
    const src = readSrc('CombatPanel.vue')
    expect(src).toContain('winsUntilRegionBoss')
    expect(src, '提示自己比一遍门槛,改常数时提示就开始撒谎').not.toContain('EXPLORE_BOSS_AFTER_WINS')
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

/** 全部运行时源码(.ts / .vue,不含用例):「谁都不许再写一份」要扫全仓 */
const ALL_SOURCES = import.meta.glob(['../**/*.ts', '../**/*.vue', '!../**/*.spec.ts'], {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

/** 去掉注释:注释里讲清这件事本身是好事,不算「又写了一份」 */
function stripComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('同源审计 · 词条能长在哪(议题 #22)', () => {
  /**
   * 掉落、重铸、自动重铸候选、词条转移四处都要问「这条词条能不能长在这件上」。
   * 从前前三处各抄一份「slots + minRank」,转移若再抄第四份,界面亮着、服务不认的事故就回来了。
   *
   * 判据是词级通则,不认某一种写法:运行时代码里**读** slots / minRank 字段
   * (`.slots`、`?.minRank`、解构 `{ slots, minRank }`)只许在 data/affixes.ts —— 换成
   * `(a.minRank ?? 0) <= rank`、`a.slots?.includes(...)`、先解构再比,一样会红。
   * 只为显示读一下(「需仙品」)的那一处登记在 READ_ONLY,写清为什么不算判据。
   * 故障注入:把详情弹窗 affixOptions 改回内联的 minRank 过滤 → 只有这一条红。
   */
  it('部位与品质门槛只在 data/affixes.ts 判一次(affixFitBlock),别处不许再读这两个字段', () => {
    expect(Object.keys(ALL_SOURCES).length, 'glob 没扫到源码,断言会假绿').toBeGreaterThan(100)
    const READS = /(?:\?\.|\.)(?:slots|minRank)\b|\{[^}]*\b(?:slots|minRank)\b[^}]*\}\s*=/
    /** 只读来显示、不做判断的地方:文件 → 允许出现的那一行(整行比对,改了就得重新过目) */
    const READ_ONLY: Record<string, string[]> = {
      /**
       * 词条图是查用的词典:把「能长在哪、几品起」当参考信息显给玩家看,
       * 不喂任何「能不能长在这件上」的判断 —— 判断仍只走 affixFitBlock。
       * 若哪天有人拿这些字段去决定掉落/重铸/转移,整页登记销账,红回来。
       */
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

  /**
   * 转移的价签与实扣必须是同一个数:界面只认 planTransfer 给的 cost,不自己按阶算灵石、
   * 不自己调封存价。故障注入:页脚里加一处 stoneByTier( → 只有这一条红。
   */
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
