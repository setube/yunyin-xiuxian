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
   * 此前本仓这四处各写各的:确 散 / 凝 炼 / 分解? / 确信删除,取消词散成
   * 取 消 / 算了 / 取消 —— 玩家在同一个游戏里要认四套反悔的说法。
   * 故障注入:把任一取消词改回「取消」→ 红。
   */
  const FAMILY: Array<[string, string[]]> = [
    ['views/BuildView.vue', ['确认删除']],
    ['components/equipment/EquipmentDetailDialog.vue', ['确认分解']],
    ['views/SoulsView.vue', ['确认散去', '确认凝炼']],
    // 远征册拆出后判据随本体走:中道而返的确认态在 ExpeditionPanel
    ['components/celestial/ExpeditionPanel.vue', ['确认返还']],
    // 道痕册拆出后判据随本体走:重写确认态在 MarksPanel
    ['components/celestial/MarksPanel.vue', ['确认重写']],
    // 熔炉弹窗拆出后判据随本体走:确认态与「确认熔尽」都在 FurnaceDialog
    ['components/celestial/FurnaceDialog.vue', ['确认熔尽']]
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

  /**
   * 「炼满」开的是按当前料算出的整本总账 —— 一次点掉几十炉,与「分解/散去」同族,
   * 得先摆清总耗再让玩家按第二下。故障注入:把第一步直接接回 runCraftFull → 红。
   */
  it('开炉的「炼满」先摆总账,第二步才真开炉', () => {
    // 开炉弹窗拆出后判据随本体走(components/inventory/BrewingDialog.vue)
    const src = read('components/inventory/BrewingDialog.vue')
    expect(src, '第一步只立起确认态').toContain('@click="pillFullId = r.def.id"')
    expect(src, '第二步才走 runCraftFull').toContain('runCraftFull(r.def.id, r.plan.rounds)')
    expect(src, '取消词与同族一致').toContain('再想想')
  })

  /**
   * 弹窗在行囊页常驻,只切 open;确认态若跨关闭残留,下次开炉会直接停在上次的
   * 「开炉 ×N」上。故障注入:删掉 watch 里的复位 → 红。
   */
  it('开炉弹窗关闭即撤销「炼满」确认态', () => {
    const src = read('components/inventory/BrewingDialog.vue')
    expect(src, '须监听弹窗开关').toContain('() => props.open')
    expect(src, '关闭时撤销确认态').toContain('if (!open) pillFullId.value = null')
  })

  /**
   * 依规则清理行囊是整包报废,第一下只该摆出名单与收益。
   * 故障注入:把第一步的 cleanConfirm = true 改回直接 smartClean() → 红。
   */
  it('收纳的整包清理先列名单,第二步才化尘', () => {
    const src = read('components/inventory/DismantleDialog.vue')
    expect(src, '第一步只立起确认态').toContain('@click="cleanConfirm = true"')
    expect(src, '第二步才真清理').toContain('@click="smartClean()"')
    expect(src, '确认页须摆出名单与收益').toContain('batchYieldText(cleanYield)')
    expect(src, '取消词与同族一致').toContain('再想想')
  })

  /**
   * 连升一级级扣到底,第一下只该摆出总账。故障注入:把第一步改回直接 runBatchUpgrade
   * → 红。判据随面板走(components/equipment/UpgradePanel.vue)。
   */
  it('装备连升先摆总账,第二步才动手', () => {
    const src = read('components/equipment/UpgradePanel.vue')
    expect(src, '第一步只立起确认态').toContain('@click="batchConfirm = inst.uid"')
    expect(src, '第二步才真连升').toContain('@click="runBatchUpgrade"')
    expect(src, '取消词与同族一致').toContain('再想想')
  })

  /**
   * 重铸一次重掷全部未封存词条、成本不低,同样两步。判据随页脚块走
   * (components/equipment/EquipReforgeFooter.vue)。
   * 故障注入:把第一步改回直接 doReforge → 红。
   */
  it('重铸先摆价签,第二步才重掷', () => {
    const src = read('components/equipment/EquipReforgeFooter.vue')
    expect(src, '第一步只立起确认态').toContain('@click="reforgeArm = inst?.uid ?? null"')
    expect(src, '第二步才真重铸').toContain('@click="doReforge"')
    expect(src, '取消词与同族一致').toContain('再想想')
  })

  /**
   * 确认态必须钉在「那一条」上,不能钉在它的行号上。
   *
   * 道痕表新痕插头部,而重写一次就会补一条新痕:按行号记的话,重写第一行后
   * 第二行的确认态会挪到刚写进来的那一行 —— 玩家再点确认,花掉的是另一条的道源。
   * 故障注入:把 rewriteConfirm === mark 改回 === i → 红。
   */
  it('忆战重写的确认态按道痕身份记,不按行号', () => {
    // 道痕册拆出后判据随本体走(components/celestial/MarksPanel.vue)
    const src = read('components/celestial/MarksPanel.vue')
    expect(src, '确认态须按那条痕本身比对').toContain('rewriteConfirm === mark')
    expect(src, '武装须写入那条痕本身').toContain('rewriteConfirm = mark')
    expect(src, '列表键也不该拿行号当身份').not.toContain('v-for="(mark, i) in endgame.marks"')
    expect(src, '重写确认态须记道痕本身,不再记行号').toContain(
      'const rewriteConfirm = ref<(typeof endgame.marks)[number] | null>(null)'
    )
  })

  /**
   * 构筑对照的选中态同理:不能拿落痕时刻当身份。
   *
   * 同一毫秒可以落两条痕(远征/试炼批量结算、读档夹具):按 `at` 认痕时两枚
   * chip 一起高亮,而 `find(m => m.at === at)` 只取第一条 —— 玩家看见高亮的是
   * 这条,读到的却是那条的构筑。故障注入:把 pickCompare 改回按 at 找 → 红。
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
})
