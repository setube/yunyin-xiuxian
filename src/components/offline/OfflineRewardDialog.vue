<template>
  <BaseModal :open="summary !== null" :closable="false" aria-label="离线归来结算">
    <div v-if="summary" class="text-center">
      <p class="font-kai text-2xl tracking-[0.5em] text-ink mt-1 animate-ink-pop">归 来</p>
      <p class="mt-2 text-[12px] text-ink-faint">
        {{ awayLine }}
      </p>
      <div class="ink-divider my-3" />
      <!-- 离线三类事分而叙之:修行在长、家业在产、路上在走 —— 修为是主,置顶金标 -->
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

      <!-- 拾得装备:每件都是可从清单里点开的活件 —— 点名字看词条,不打一锤子买卖 -->
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
            :style="{ color: qualityDef(eq.quality).color }"
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
  import { qualityDef } from '@/data/qualities'
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

  // 归来一声钟磬,与收益清点同起
  watch(summary, (nv, ov) => {
    if (nv && !ov) playSfx('success')
  })

  /**
   * 离线三类事分而叙之,别让修为和末节资源挤在同一档里头:
   *  修行所得(修炼在长) / 家业收成(洞府在产) / 途中际遇(路在走)。
   * 修为是这一程的主,置顶并金标。
   */
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
    if (s.herb > 0) home.push({ icon: 'leaf', label: '灵草', value: `+${s.herb}` })
    if (s.ore > 0) home.push({ icon: 'mountain', label: '玄铁', value: `+${s.ore}` })
    if (s.wudao > 0) home.push({ icon: 'book', label: '悟道点', value: `+${s.wudao}` })
    if (home.length) out.push({ label: '家业收成', list: home })

    const road: GRow[] = []
    if (s.battles > 0) road.push({ icon: 'swords', label: '历练战斗', value: `${s.wins} 胜 / ${s.battles} 战` })
    if (s.events > 0) road.push({ icon: 'star', label: '途中际遇', value: `${s.events} 次` })
    // 自动回收的产出不入行囊、只化器灵尘,单独在「路上」成行,免得玩家以为掉了没捡到
    if (s.recycledDust > 0) {
      // 件数含腾位化掉的旧件:尘是它们一起化出来的,件数少算就对不上
      const recycled = s.equipment.filter(e => e.recycled).length + s.evicted
      road.push({ icon: 'sparkles', label: '回收化尘', value: `${recycled} 件 · 器灵尘+${s.recycledDust}` })
    }
    if (road.length) out.push({ label: '途中际遇', list: road })

    return out
  })

  /**
   * 真正可点开的入包件(回收件已并入"回收化尘"行,不在此重复列出)。
   * 智能收纳 + 行囊满时,新件会把本结算先入包的件挤出包 —— 那件已化尘,
   * 不能渲染成「点得开」的活件;按 uid 回查背包,在包里的才列、才计数。
   */
  const savedEquipment = computed(() =>
    (summary.value?.equipment ?? []).filter(e => !e.recycled && (e.uid ? inventory.findItem(e.uid) !== undefined : false))
  )

  /** 点一件离线拾得 → 打开它的装备详情(全局弹窗按 ui.equipDetailUid 找实例) */
  function openEquip(uid: string): void {
    // 双保险:渲染时已按存在性过滤,点击仍守卫一遍,免得设了个找不到实例的 uid 让弹窗静默不开
    if (inventory.findItem(uid)) ui.equipDetailUid = uid
  }

  function close(): void {
    ui.offlineSummary = null
  }
</script>
