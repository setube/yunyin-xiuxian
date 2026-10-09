<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 门面:槽位 + 灵石 + 招道童入口 -->
    <div class="card-ink flex items-center justify-between px-4 py-3">
      <div>
        <p class="font-kai text-[14px] tracking-widest text-ink">道童</p>
        <p class="text-[10px] text-ink-faint">道童跑腿 · 后台自长</p>
      </div>
      <div class="flex items-center gap-3">
        <p class="flex items-center gap-1 tabular text-[13px] text-gold-ink">
          <GameIcon name="gem" :size="14" />{{ formatGN(resources.spiritStone) }}
        </p>
        <button class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]" :disabled="slotsFull" @click="doRecruit">
          收道童<span v-if="!slotsFull" class="ml-1 text-[10px]">({{ recruitCostLine }})</span>
        </button>
      </div>
    </div>

    <!-- 道童列表 -->
    <section>
      <SectionTitle title="座下道童" :hint="`${appr.apprentices.length}/${slots}`" />
      <div class="mt-2 space-y-2">
        <div v-for="a in apprenticesList" :key="a.uid" class="card-ink p-3">
          <!-- 顶部:名号 / 境界层 / 状态 -->
          <div class="flex items-center gap-2">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-jade/15 font-kai text-[15px] text-jade">
              {{ a.def.name[0] }}
            </span>
            <div class="min-w-0 grow">
              <p class="flex items-center gap-2 truncate font-kai text-[14px] text-ink">
                {{ a.def.name }}
                <span class="rounded bg-gold-ink/10 px-1.5 text-[10px] text-gold-ink">第 {{ a.level }} 层</span>
              </p>
              <p class="truncate text-[10px] text-ink-faint">{{ a.def.desc }}</p>
            </div>
          </div>

          <!-- 状态行:忙 / 闲 -->
          <div v-if="a.busy" class="mt-2 flex items-center justify-between rounded bg-ink/4 px-2.5 py-2">
            <span class="flex items-center gap-1.5 text-[12px] text-ink-soft">
              <GameIcon :name="a.taskIcon" :size="14" />{{ a.taskName }}
            </span>
            <span class="tabular text-[11px] text-azure">约剩 {{ formatCountdown(a.remainingSec) }}</span>
          </div>
          <div v-else class="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              v-for="t in TASKS"
              :key="t.spec"
              class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]"
              @click="dispatcher(a.uid, t.spec)"
            >
              <GameIcon :name="t.icon" :size="12" />{{ t.name }}
            </button>
            <span v-if="!a.busy" class="text-[10px] text-ink-faint"> · {{ a.talentNote }}</span>
          </div>
        </div>
        <p v-if="apprenticesList.length === 0" class="px-2 py-4 text-center text-[11px] text-ink-faint">
          尚无一童 —— 先收一名道童进门,门庭遂有生气。
        </p>
      </div>
      <p class="mt-2 text-[10px] leading-relaxed text-ink-faint">
        道童按时辰走工,离线亦照此工期;归来之时自会带回资材。天赋门类产出更丰。
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import { formatCountdown, formatGN } from '@/utils/format'
  import { stoneByTier } from '@/core/formulas'
  import { usePlayerStore } from '@/stores/player'
  import { useResourcesStore } from '@/stores/resources'
  import { useApprenticeStore } from '@/stores/apprentice'
  import { useUiStore } from '@/stores/ui'
  import {
    APPRENTICE_TASKS,
    apprenticeDef,
    apprenticeSlots,
    type ApprenticeSpec
  } from '@/data/apprentices'
  import type { TaskSpoils } from '@/core/apprenticeService'
  import { HERB_GRADE_NAMES, herbGradeOfMajor } from '@/data/herbGrades'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  const TASKS = APPRENTICE_TASKS

  const player = usePlayerStore()
  const resources = useResourcesStore()
  const appr = useApprenticeStore()
  const ui = useUiStore()

  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined

  const slots = computed(() => apprenticeSlots(player.major))
  const slotsFull = computed(() => appr.apprentices.length >= slots.value)
  const recruitCostLine = computed(() => `${formatGN(stoneByTier(player.major, 30))} 灵石`)

  const apprenticesList = computed(() =>
    appr.apprentices.map(a => {
      const def = apprenticeDef(a.archId)!
      const busy = a.task !== null
      const task = busy ? APPRENTICE_TASKS.find(t => t.spec === a.task!.spec)! : null
      return {
        uid: a.uid,
        level: a.level,
        def,
        busy,
        taskName: task?.name ?? '',
        taskIcon: task?.icon ?? '',
        remainingSec: busy ? Math.max(0, (a.task!.finishAt - now.value) / 1000) : 0,
        talentNote: `天赋:${APPRENTICE_TASKS.find(t => t.spec === def.talent)?.name ?? ''}`
      }
    })
  )

  function dispatcher(uid: string, spec: ApprenticeSpec): void {
    if (appr.dispatch(uid, spec, Date.now())) {
      ui.toast('已遣道童前往', 'info')
    }
  }

  function doRecruit(): void {
    const result = appr.recruit(player.major)
    if (result === 'ok') ui.toast('新收一名道童入门', 'success')
    else if (result === 'poor') ui.toast('灵石不足', 'warn')
    else ui.toast('门中已满', 'info')
  }

  function spoilsText(s: TaskSpoils): string {
    const parts: string[] = []
    if (s.herb) parts.push(`${HERB_GRADE_NAMES[herbGradeOfMajor(player.major)]}×${s.herb}`)
    if (s.ore) parts.push(`玄铁×${s.ore}`)
    if (s.dust) parts.push(`器尘×${s.dust}`)
    if (s.wudao) parts.push(`悟道×${s.wudao}`)
    if (s.stone) parts.push(`灵石 ${formatGN(s.stone)}`)
    if (s.pillId) parts.push(`丹药×${s.pillCount ?? 1}`)
    return parts.join(' · ')
  }

  /** 收割所有已完工道童;回来的就报一声带回什么 */
  function reap(): void {
    const reaped = appr.collectFinished(now.value, player.major)
    for (const s of reaped) {
      ui.toast(`道童归来,带回 ${spoilsText(s)}`, 'success')
    }
  }

  onMounted(() => {
    appr.sync()
    reap()
    timer = setInterval(() => {
      now.value = Date.now()
      reap()
    }, 1000)
  })
  onUnmounted(() => {
    if (timer !== undefined) clearInterval(timer)
  })
</script>
