import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import { BUILD_STYLES, buildSources, detectBuild } from './buildDetect'
import { useCultivationStore } from '@/stores/cultivation'
import { useDongfuStore } from '@/stores/dongfu'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'

describe('流派识别(Build 面板数据层)', () => {
  it('无相关词条时不识别', () => {
    expect(detectBuild({})).toBeNull()
    expect(detectBuild({ attackPct: 0.5, critRate: 0.1 })).toBeNull()
  })

  it('罡盾构筑被正确识别并给出契合度', () => {
    const d = detectBuild({ shieldOnStart: 0.2, shieldPower: 0.25, attackPct: 0.3 })
    expect(d).not.toBeNull()
    expect(d!.style.id).toBe('gangdun')
    expect(d!.affinity).toBeGreaterThan(0.6)
    expect(d!.stageName).toBe('成形')
    expect(d!.coreValues.length).toBe(2)
  })

  it('多路数并存时取契合度最高者', () => {
    const d = detectBuild({ lowHpDamage: 0.5, lowHpReduction: 0.3, comboRate: 0.1 })
    expect(d!.style.id).toBe('beishui')
    expect(d!.stageName).toBe('大成')
  })

  it('雏形阈值:低于 25% 契合不显示', () => {
    expect(detectBuild({ comboRate: 0.05 })).toBeNull()
    const d = detectBuild({ comboRate: 0.3 })
    expect(d!.style.id).toBe('lianji')
    expect(d!.stageName).toBe('雏形')
  })

  it('混合流派:主副体系并存,展示复合名号', () => {
    const d = detectBuild({
      shieldOnStart: 0.25,
      shieldPower: 0.3,
      counterRate: 0.15,
      counterDamage: 0.25
    })!
    expect(d.style.id).toBe('gangdun')
    expect(d.secondary?.style.id).toBe('fanzhen')
    expect(d.displayName).toBe('罡盾·反震')
  })

  it('纯派不显示副体系', () => {
    const d = detectBuild({ shieldOnStart: 0.25, shieldPower: 0.3 })!
    expect(d.secondary).toBeUndefined()
    expect(d.displayName).toBe('罡盾流')
  })

  it('六大流派定义完整且核心词条均有参考值', () => {
    expect(BUILD_STYLES.length).toBe(6)
    for (const s of BUILD_STYLES) {
      expect(Object.keys(s.core).length).toBeGreaterThan(1)
      expect(s.seal.length).toBe(1)
    }
  })
})

describe('成路于与真正吃进属性的来路同源', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('在身法器的核心词条要报出来,无关的件不报', () => {
    const inventory = useInventoryStore()
    inventory.items = [
      { uid: 'talisman', templateId: 'tl_hushen', quality: 'mortal', tier: 6, level: 0, affixes: [] },
      { uid: 'blade', templateId: 'w_yanwen', quality: 'mortal', tier: 7, level: 0, affixes: [] }
    ]
    inventory.equipped = { talisman: 'talisman', weapon: 'blade' }
    const gangdun = BUILD_STYLES.find(s => s.id === 'gangdun')!
    const names = buildSources(gangdun)
    expect(names).toContain('战阵符')
    expect(names).not.toContain('炎纹刀')
  })

  it('悟道分支、丹效、灵兽、师承、称号按实有词条入列', () => {
    const cultivation = useCultivationStore()
    const player = usePlayerStore()
    cultivation.gongfaBranch = { m_xuanbing: 'b_xuanbing_liuli' }
    cultivation.buffs = [{ defId: 'buff_jingang', endsAt: Date.now() + 60_000 }]
    player.petId = 'pet_taotie'
    player.mentor = 'arraymaster'
    player.titleId = 'ti_wanfa'

    const gangdun = BUILD_STYLES.find(s => s.id === 'gangdun')!
    const shield = buildSources(gangdun)
    expect(shield).toContain('《玄冰道典》·琉璃')
    expect(shield).toContain('丹效·金刚护体')
    expect(shield).toContain('师承·阵修')
    expect(shield).not.toContain('灵兽·混沌饕餮')
    expect(shield).not.toContain('称号·一剑破万法')

    const muze = BUILD_STYLES.find(s => s.id === 'muze')!
    expect(buildSources(muze)).toContain('灵兽·混沌饕餮')
    const fengmang = BUILD_STYLES.find(s => s.id === 'fengmang')!
    expect(buildSources(fengmang)).toContain('称号·一剑破万法')
  })

  it('流派页把核心门槛与软顶摊在数字旁边', () => {
    const view = readFileSync(new URL('../views/BuildView.vue', import.meta.url), 'utf8')
    expect(view).toContain('statCaveat')
    expect(view).toContain('isSoftCapped')
    expect(view).toContain('coreCaveats')
  })
})

describe('辅修槽位预算 · 成路于(和 gongfaMods 同一把尺)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('超洞府槽位预算的辅修不计成路(第二个辅修白占选位却不出词条)', () => {
    const cultivation = useCultivationStore()
    const dongfu = useDongfuStore()
    // 藏书楼 0 级 → 1 个辅修槽
    dongfu.setLevel('library', 0)
    expect(dongfu.subGongfaSlots).toBe(1)
    cultivation.learned = { s_budong: 1, s_xianguang: 1 }
    // 两个都带罡盾核心词条的辅修;第二个超出预算 —— gongfaMods 只 slice 到第一个
    cultivation.subGongfa = ['s_budong', 's_xianguang']
    const gangdun = BUILD_STYLES.find(s => s.id === 'gangdun')!
    const names = buildSources(gangdun)
    expect(names).toContain('《不动如山章》') // 预算内的真算成路
    expect(names).not.toContain('《仙光护体诀》') // 超预算的不算,别把没在账上词条当来路
  })
})
