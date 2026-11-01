import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DAO_PATHS } from '@/data/endgame'
import { GONGFA_BRANCHES } from '@/data/gongfaBranches'
import { modsText } from '@/data/statNames'
import { TRANSFER_LABELS } from './affixTransferText'

const read = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8')

describe('不可逆确认要看见真正规则', () => {
  it('定下道途时把 deepText 一并摆上,长生印不留在卡片背面', () => {
    const src = readFileSync(resolve(__dirname, '../views/CelestialView.vue'), 'utf8')
    expect(src).toContain('pendingDao.deepText')
    const longevity = DAO_PATHS.find(d => d.id === 'longevity')!
    expect(longevity.deepText.join('')).toContain('4%')
    expect(longevity.ruleText.join('')).not.toContain('4%')
  })

  it('功法择道确认写出词条,不只报名字', () => {
    const src = readFileSync(resolve(__dirname, '../components/cultivation/GongfaDialog.vue'), 'utf8')
    expect(src).toContain('modsText(gongfaBranchDef(branchConfirm)!.mods)')
    const branch = GONGFA_BRANCHES[0]!
    expect(modsText(branch.mods).length).toBeGreaterThan(0)
  })
})

describe('不可逆确认的两次点击各写什么', () => {
  /**
   * 同一族两步确认,确认词须是「确认+动词」、取消词须是「再想想」。
   * 故障注入:把任一取消词改成「取消」,本用例红。
   */
  const FAMILY: Array<[string, string[]]> = [
    ['views/BuildView.vue', ['确认删除']],
    ['components/equipment/EquipmentDetailDialog.vue', ['确认分解']],
    ['views/SoulsView.vue', ['确认散去', '确认凝炼']],
    ['components/celestial/ExpeditionPanel.vue', ['确认返还']],
    ['components/celestial/MarksPanel.vue', ['确认重写']],
    ['components/celestial/FurnaceDialog.vue', ['确认熔尽']],
    // 确认词随第一步的动词(重铸词条 → 确认重铸 / 开 洗 → 确认开洗)
    ['components/equipment/EquipReforgeFooter.vue', ['确认重铸']],
    ['components/equipment/AutoReforgePanel.vue', ['确认开洗']]
  ]
  const CANCEL_BANNED = ['确 散', '凝 炼', '分解?', '确信删除', '>算了<', '>取 消<', '>取消<']

  it('确认词带「确认」,取消词不带别的说法', () => {
    for (const [rel, words] of FAMILY) {
      const src = read(rel)
      for (const word of words) expect(src, `${rel} 少了「${word}」`).toContain(word)
      for (const banned of CANCEL_BANNED) expect(src, `${rel} 仍有旧写法「${banned}」`).not.toContain(banned)
      expect(src, `${rel} 的取消词须是「再想想」`).toContain('再想想')
    }
  })

  it('词条转移的取消钮同一个说法', () => {
    expect(TRANSFER_LABELS.confirm).toBe('确认转移')
    expect(TRANSFER_LABELS.cancel).toBe('再想想')
  })

  /** 「炼满」一次点掉几十炉,与「分解/散去」同族。故障注入:把第一步改成直接 runCraftFull,本用例红。 */
  it('开炉的「炼满」先摆总账,第二步才真开炉', () => {
    const src = read('components/inventory/BrewingDialog.vue')
    expect(src, '第一步只立起确认态').toContain('@click="pillFullId = r.def.id"')
    expect(src, '第二步才走 runCraftFull').toContain('runCraftFull(r.def.id, r.plan.rounds)')
    expect(src, '取消词与同族一致').toContain('再想想')
  })

  /** 弹窗在行囊页常驻、只切 open,确认态须随关闭复位。故障注入:删掉 watch 里的复位,本用例红。 */
  it('开炉弹窗关闭即撤销「炼满」确认态', () => {
    const src = read('components/inventory/BrewingDialog.vue')
    expect(src, '须监听弹窗开关').toContain('() => props.open')
    expect(src, '关闭时撤销确认态').toContain('if (!open) pillFullId.value = null')
  })

  /** 故障注入:把第一步的 cleanConfirm = true 改成直接 smartClean(),本用例红。 */
  it('收纳的整包清理先列名单,第二步才化尘', () => {
    const src = read('components/inventory/DismantleDialog.vue')
    expect(src, '第一步只立起确认态').toContain('@click="cleanConfirm = true"')
    expect(src, '第二步才真清理').toContain('@click="smartClean()"')
    expect(src, '确认页须摆出名单与收益').toContain('batchYieldText(cleanYield)')
    expect(src, '取消词与同族一致').toContain('再想想')
  })

  /** 故障注入:把第一步改成直接 runBatchUpgrade,本用例红。 */
  it('装备连升先摆总账,第二步才动手', () => {
    const src = read('components/equipment/UpgradePanel.vue')
    expect(src, '第一步只立起确认态').toContain('@click="batchConfirm = inst.uid"')
    expect(src, '第二步才真连升').toContain('@click="runBatchUpgrade"')
    expect(src, '取消词与同族一致').toContain('再想想')
  })

  /** 故障注入:把第一步改成直接 doReforge,本用例红。 */
  it('重铸先摆价签,第二步才重掷', () => {
    const src = read('components/equipment/EquipReforgeFooter.vue')
    expect(src, '第一步只立起确认态').toContain('@click="reforgeArm = inst?.uid ?? null"')
    expect(src, '第二步才真重铸').toContain('@click="doReforge"')
    expect(src, '取消词与同族一致').toContain('再想想')
  })

  /**
   * 道痕表新痕插头部、重写一次就会补一条新痕:按行号记的确认态会挪到另一条。
   * 故障注入:把 rewriteConfirm === mark 改成 === i,本用例红。
   */
  it('忆战重写的确认态按道痕身份记,不按行号', () => {
    const src = read('components/celestial/MarksPanel.vue')
    expect(src, '确认态须按那条痕本身比对').toContain('rewriteConfirm === mark')
    expect(src, '武装须写入那条痕本身').toContain('rewriteConfirm = mark')
    expect(src, '列表键也不该拿行号当身份').not.toContain('v-for="(mark, i) in endgame.marks"')
    expect(src, '重写确认态须记道痕本身,不再记行号').toContain(
      'const rewriteConfirm = ref<(typeof endgame.marks)[number] | null>(null)'
    )
  })

  /**
   * 同一毫秒可以落两条痕(远征/试炼批量结算、读档夹具),落痕时刻 `at` 不能当身份。
   * 故障注入:把 pickCompare 改成按 at 找,本用例红。
   */
  it('构筑对照的选中态按道痕本身记,不按落痕时刻', () => {
    const src = read('views/BuildView.vue')
    expect(src, '选中态须记道痕本身').toContain(
      'const compareAt = ref<(typeof endgame.marks)[number] | null>(null)'
    )
    expect(src, '点哪条就传哪条').toContain('function pickCompare(mark: (typeof endgame.marks)[number]): void')
    expect(src, '不该再按落痕时刻回查道痕').not.toContain('endgame.marks.find(m => m.at === at)')
    expect(src, '高亮也不该按落痕时刻比').not.toContain('compareAt === c.at')
  })


  /**
   * 「复述动作」这一族不受「确认+动词」约束。
   *
   * AGENTS.md 明确把它们列为例外:连 升 / 连 投 / 连 炼 / 开 炉 ×N / 清理化尘 / 改 立 ——
   * 这些钮的正文本身就在复述这一步做什么,再加「确认」反而啰嗦。
   * 此前 spec 完全没有记录它们,于是「谁是例外」只活在文档里:
   * 有人把「连 升」改成「确认连升」不会有任何提示,反之把某处普通钮改成「连 升」也不会。
   *
   * 本条把六个落点逐一钉住:既确认它们仍用复述动作写法,
   * 也确认它们和「再想想」成对出现(两步确认的结构没变)。
   */
  const BATCH_FAMILY: Array<[string, string]> = [
    ['components/dongfu/BuildingCard.vue', '连 升'],
    ['components/equipment/UpgradePanel.vue', '连 升'],
    ['components/dongfu/VeinInvestCard.vue', '连 投'],
    ['components/inventory/ArtifactPanel.vue', '连 炼'],
    ['components/inventory/BrewingDialog.vue', '开 炉 ×'],
    ['components/inventory/DismantleDialog.vue', '清理化尘']
  ]

  it('复述动作族的六个落点都用复述写法,且与「再想想」成对', () => {
    for (const [rel, word] of BATCH_FAMILY) {
      const src = read(rel)
      expect(src, `${rel} 少了复述动作「${word}」`).toContain(word)
      expect(src, `${rel} 缺「再想想」,两步确认的结构破了`).toContain('再想想')
      expect(src, `${rel} 不该给复述动作加「确认」前缀`).not.toContain(`确认${word.replace(' ', '')}`)
    }
  })

  it('复述动作族的正文都很短(它们不是句子)', () => {
    // 「连 升」4 字符、「清理化尘」4 字,都远在「按钮主词 2~6 汉字」之内
    for (const [rel, word] of BATCH_FAMILY) {
      expect(word.replace(/\s/g, '').length, `${rel} 的「${word}」超过 6 字,该重新措辞`).toBeLessThanOrEqual(6)
    }
  })
})
