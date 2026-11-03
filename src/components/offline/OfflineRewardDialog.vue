<template>
  <BaseModal :open="summary !== null" :closable="false" aria-label="离线归来结算">
    <div v-if="summary" class="text-center">
      <p class="font-kai text-2xl tracking-[0.5em] text-ink mt-1 animate-ink-pop">归 来</p>
      <p class="mt-2 text-[12px] text-ink-faint">
        {{ awayLine }}
      </p>
      <div class="ink-divider my-3" />
      <div v-for="group in groups" :key="group.label" class="stagger-in">
        <p class="mt-1 text-center text-[9px] tracking-[0.35em] text-ink-faint">{{ group.label }}</p>
        <ul class="mt-1 space-y-2 text-left">
          <li
            v-for="row in group.list"
            :key="row.label"
            class="flex items-center justify-between rounded-md bg-paper-deep/70 px-3 py-2"
          >
            <span class="flex items-center gap-2 text-[13px] text-ink-soft">
              <GameIcon :name="row.icon" :size="15" :class="row.main ? 'text-gold-ink' : 'text-ink-faint'" />
              {{ row.label }}
            </span>
            <span class="tabular" :class="row.main ? 'font-kai text-[15px] text-gold-ink' : 'text-[13px] text-ink'">{{ row.value }}</span>
          </li>
        </ul>
      </div>

      <div v-if="savedEquipment.length" class="mt-2 rounded-md bg-paper-deep/70 px-3 py-2">
        <p class="flex items-center gap-2 text-[13px] text-ink-soft">
          <GameIcon name="backpack" :size="15" class="text-ink-faint" />
          拾得装备 ×{{ savedEquipment.length }}
        </p>
        <p class="mt-1.5 flex flex-wrap gap-x-2 gap-y-1.5">
          <button
            v-for="(eq, i) in savedEquipment"
            :key="eq.uid ?? i"
            type="button"
            class="chip-ink !py-1.5 text-[11px]"
            :style="{ color: qualityTextColor(eq.quality) }"
            @click="eq.uid && openEquip(eq.uid)"
          >
            {{ qualityDef(eq.quality).name }}·{{ eq.name }}
          </button>
        </p>
      </div>
      <p v-for="(note, i) in summary.notes" :key="i" class="mt-2 text-[11px] text-ink-faint">{{ note }}</p>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="close">收 下</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, watch } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { useInventoryStore } from '@/stores/inventory'
  import { formatDuration, formatGN, formatNum } from '@/utils/format'
  import { offlineAwayPhrase } from '@/ui/offlineText'
  import { HERB_GRADE_SHORT } from '@/data/herbGrades'
  import { qualityDef, qualityTextColor } from '@/data/qualities'
  import { playSfx } from '@/core/audio'
  import BaseModal from '@/components/common/BaseModal.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  const ui = useUiStore()
  const inventory = useInventoryStore()

  const summary = computed(() => ui.offlineSummary)
  const awayLine = computed(() => {
    const s = summary.value
    if (!s) return ''
    return offlineAwayPhrase(
      formatDuration(s.seconds),
      s.capped ? formatDuration(s.cappedSeconds) : undefined
    )
  })

  watch(summary, (nv, ov) => {
    if (nv && !ov) playSfx('success')
  })

  const groups = computed(() => {
    const s = summary.value
    if (!s) return []
    type GRow = { icon: string; label: string; value: string; main?: boolean }
    const out: { label: string; list: GRow[] }[] = []

    const cult: GRow[] = []
    if (s.exp.m > 0) cult.push({ icon: 'flame', label: '修为', value: `+${formatGN(s.exp)}`, main: true })
    if (cult.length) out.push({ label: '修行所得', list: cult })

    const home: GRow[] = []
    if (s.stone.m > 0) home.push({ icon: 'gem', label: '灵石', value: `+${formatGN(s.stone)}` })
    if (s.qi > 0) home.push({ icon: 'wind', label: '灵气', value: `+${formatNum(s.qi)}` })
    if (s.herb > 0) home.push({ icon: 'leaf', label: '灵草', value: s.herbByGrade.length ? s.herbByGrade.map(h => `${HERB_GRADE_SHORT[h.grade]}+${h.amount}`).join(' · ') : `+${s.herb}` })
    if (s.ore > 0) home.push({ icon: 'mountain', label: '玄铁', value: `+${s.ore}` })
    if (s.wudao > 0) home.push({ icon: 'book', label: '悟道点', value: `+${s.wudao}` })
    if (home.length) out.push({ label: '家业收成', list: home })

    const road: GRow[] = []
    if (s.battles > 0) road.push({ icon: 'swords', label: '历练战斗', value: `${s.wins} 胜 / ${s.battles} 战` })
    if (s.events > 0) road.push({ icon: 'star', label: '途中际遇', value: `${s.events} 次` })
    // 自动回收件不入行囊、只化器灵尘,单独成行
    if (s.recycledDust > 0) {
      // 件数须含腾位化掉的旧件,否则与尘数对不上
      const recycled = s.equipment.filter(e => e.recycled).length + s.evicted
      road.push({ icon: 'sparkles', label: '回收化尘', value: `${recycled} 件 · 器灵尘+${s.recycledDust}` })
    }
    if (road.length) out.push({ label: '途中际遇', list: road })

    return out
  })

  /** 仍在包里的拾得件:先入包的件可能已被挤出化尘,按 uid 回查背包才列 */
  const savedEquipment = computed(() =>
    (summary.value?.equipment ?? []).filter(e => !e.recycled && (e.uid ? inventory.findItem(e.uid) !== undefined : false))
  )

  function openEquip(uid: string): void {
    // 点击时再查一遍:找不到实例的 uid 会让弹窗静默不开
    if (inventory.findItem(uid)) ui.equipDetailUid = uid
  }

  function close(): void {
    ui.offlineSummary = null
  }
</script>
