<template>
  <!-- 悬赏板:商号收购订单,交货得灵石 -->
  <section class="space-y-4">
    <p class="card-ink flex items-center justify-between px-3 py-2 text-[10px] text-ink-faint">
      <span>商号悬赏收购,交货即结。价比摆摊售出更丰。</span>
      <span class="tabular" :class="bountyRemaining <= 0 ? 'text-cinnabar' : ''">
        {{ bountyRemaining <= 0 ? '正在换新单…' : `换新单还差 ${formatCountdown(bountyRemaining)}` }}
      </span>
    </p>
    <div class="space-y-2">
      <div v-for="b in bountyRows" :key="b.idx" class="card-ink p-3" :class="b.claimed ? 'opacity-50' : ''">
        <div class="flex items-center gap-2.5">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md font-kai text-[14px]" :class="b.tagCls">{{ b.tag }}</span>
          <div class="min-w-0 grow">
            <p class="truncate font-kai text-[13px] text-ink">{{ b.title }}</p>
            <p class="text-[10px] text-ink-faint">{{ b.desc }}</p>
          </div>
        </div>
        <div class="mt-2 flex items-center justify-between">
          <span class="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span class="flex items-center gap-0.5 tabular text-gold-ink"><GameIcon name="gem" :size="12" />{{ b.rewardText }}</span>
            <span v-if="b.extraText" class="text-azure">· {{ b.extraText }}</span>
          </span>
          <button v-if="b.kind === 'equip'" class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" :disabled="b.claimed || !b.ready" @click="openEquipOrder = openEquipOrder === b.idx ? null : b.idx">
            {{ b.claimed ? '已交' : openEquipOrder === b.idx ? '收起' : b.ready ? '选一件交货' : b.shortText }}
          </button>
          <button v-else class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" :disabled="b.claimed || !b.ready" @click="claimOne(b.idx)">
            {{ b.claimed ? '已交' : b.ready ? '交货' : b.shortText }}
          </button>
        </div>
        <div
          v-if="b.kind === 'equip' && openEquipOrder === b.idx"
          class="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-md bg-paper-deep/60 p-1.5"
        >
          <p class="px-2 pb-1 text-[10px] text-ink-faint">点选一件即交货,不可撤回;价随所交之品的品质。</p>
          <p v-if="equipCandidates(b.idx).length === 0" class="px-2 py-3 text-center text-[11px] text-ink-faint">
            行囊里没有够格的兵刃。
          </p>
          <button
            v-for="c in equipCandidates(b.idx)"
            :key="c.uid"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left active:bg-ink/6"
            @click="claimEquipOne(b, c)"
          >
            <span class="min-w-0 grow truncate font-kai text-[12px]" :style="{ color: c.color }">{{ c.name }}</span>
            <span class="shrink-0 text-[10px] text-ink-faint">{{ c.qualityName }} · {{ c.tier }} 阶</span>
            <span class="shrink-0 text-[10px] tabular text-gold-ink">{{ formatGN(c.stone) }}</span>
            <span v-if="c.dust > 0" class="shrink-0 text-[10px] text-ink-faint">尘×{{ c.dust }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import type { GNum } from '@/types'
  import { useBountyStore } from '@/stores/bounty'
  import { equipBountyReward } from '@/core/bountyService'
  import { formatCountdown, formatGN } from '@/utils/format'
  import { useInventoryStore } from '@/stores/inventory'
  import { useUiStore } from '@/stores/ui'
  import { useBountyRows, type BountyRow } from '@/composables/useBountyRows'
  import { equipmentTemplate } from '@/data/equipment'
  import { qualityDef } from '@/data/qualities'
  import GameIcon from '@/components/common/GameIcon.vue'

  const bounty = useBountyStore()
  const inventory = useInventoryStore()
  const ui = useUiStore()
  const { bountyRemaining, bountyRows } = useBountyRows()

  /** 展开中的「贡兵刃」悬赏单(idx);null=全部收起 */
  const openEquipOrder = ref<number | null>(null)

  function claimOne(idx: number): void {
    const view = bountyRows.value.find(b => b.idx === idx)
    const result = bounty.claim(idx)
    const label = view ? `「${view.title}」` : ''
    if (result === 'ok') ui.toast(`悬赏 ${label} 已交货,灵石入账`, 'success')
    else if (result === 'insufficient') ui.toast(`${label}${view?.shortText ?? '存货不足'},凑齐再来`, 'warn')
    else if (result === 'nobag') ui.toast('行囊里没有够格的兵刃', 'warn')
    else if (result === 'expired') ui.toast('悬赏已换新单,请按新单再交', 'warn')
  }

  /** 某一纸贡兵刃悬赏可交付的行囊兵刃(≥门槛阶),含各自实交收益;点选再交,不再自动取第一件 */
  function equipCandidates(idx: number): Array<{ uid: string; name: string; color: string; qualityName: string; tier: number; stone: GNum; dust: number }> {
    const slot = bounty.orders.find(s => s.idx === idx)
    if (!slot || slot.kind !== 'equip') return []
    return inventory.bagItems
      .filter(e => e.tier >= slot.tier)
      .sort((a, b) => qualityDef(b.quality).rank - qualityDef(a.quality).rank)
      .map(eq => {
        const q = qualityDef(eq.quality)
        const r = equipBountyReward(eq.tier, q.rank)
        return {
          uid: eq.uid,
          name: equipmentTemplate(eq.templateId)?.name ?? eq.templateId,
          color: q.color,
          qualityName: q.name,
          tier: eq.tier,
          stone: r.stone,
          dust: r.dust
        }
      })
  }

  /** 点选一件贡出;成交即收拢清单 */
  function claimEquipOne(b: BountyRow, c: { uid: string }): void {
    const result = bounty.claimEquip(b.idx, c.uid)
    if (result === 'ok') {
      openEquipOrder.value = null
      ui.toast(`悬赏 「${b.title}」 已交货,灵石入账`, 'success')
    } else if (result === 'insufficient') ui.toast('这件兵刃不够门槛', 'warn')
    else if (result === 'missing') ui.toast('行囊里找不到这件兵刃', 'warn')
    else if (result === 'expired') {
      openEquipOrder.value = null
      ui.toast('悬赏已换新单,请按新单再交', 'warn')
    }
  }

  /**
   * 换单后收起贡器清单 —— 展开态盯的是旧单,留着会挂在新单下面选货交。
   * 换单检测随本体:宿主不再需要为悬赏的内部展开态留一个 ref。
   */
  watch(
    () => bounty.orders,
    (next, prev) => {
      if (next !== prev) openEquipOrder.value = null
    }
  )
</script>
