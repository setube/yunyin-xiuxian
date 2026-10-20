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
        <button class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]" :disabled="slotsFull || !canAffordRecruit" :title="!canAffordRecruit ? '灵石不足' : undefined" @click="doRecruit">
          收道童<span v-if="!slotsFull" class="ml-1 text-[10px]">
            {{ canAffordRecruit ? `(${recruitCostLine})` : `(灵石不足:需 ${formatGN(recruitCost)},余 ${formatGN(resources.spiritStone)})` }}
          </span>
        </button>
      </div>
    </div>

    <!-- 道童列表 -->
    <section>
      <SectionTitle title="座下道童" :hint="`${appr.apprentices.length}/${slots}`" />
      <div class="mt-1 flex items-center justify-between gap-2 px-1">
        <span class="text-[10px] text-ink-faint">一键按需派活 · 只动闲置道童</span>
        <button class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]" :disabled="!hasIdle" @click="doDispatchAll">
          <GameIcon name="users" :size="12" />各尽其长
        </button>
      </div>
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
                <span class="rounded bg-jade/10 px-1.5 text-[10px] text-jade">{{ a.bondTitle }}</span>
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
              :aria-expanded="taskTap === `${a.uid}:${t.spec}`"
              @click="tapTask(a.uid, t.spec)"
            >
              <GameIcon :name="t.icon" :size="12" />{{ t.name }}<span class="ml-0.5 text-[9px] text-ink-faint">{{ Math.round(t.seconds / 60) }}分</span>
            </button>
            <span v-if="!a.busy" class="text-[10px] text-ink-faint"> · {{ a.talentNote }}</span>
          </div>
          <!--
            派活说明点按直出:此前只挂在 :title 上,手机没有 hover —— 那是谁也看不见的死提示。
            说明放在按钮行下方整行,不挤按钮;同一枚按钮第一下展开、再点才真派出(与适配理由、
            天赋芯片同一族「点一下展开一行」),顺手给「锁走道童 30~90 分钟」这个半承诺加一道闸。
          -->
          <p
            v-if="!a.busy && tappedTask && tappedTask.uid === a.uid"
            class="mt-1 text-[10px] leading-relaxed text-ink-faint"
          >
            {{ tappedTask.desc }} · 再点一次即派出
          </p>
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
  import { maxTierForMajor } from '@/data/regions'
  import { pillDef } from '@/data/pills'
  import { usePlayerStore } from '@/stores/player'
  import { useResourcesStore } from '@/stores/resources'
  import { useApprenticeStore } from '@/stores/apprentice'
  import { useUiStore } from '@/stores/ui'
  import {
    APPRENTICE_TASKS,
    RECRUIT_COST_TIER_AMOUNT,
    apprenticeDef,
    apprenticeSlots,
    bondTitle,
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
  const hasIdle = computed(() => appr.apprentices.some(a => a.task === null))
  const recruitCost = computed(() => stoneByTier(maxTierForMajor(player.major), RECRUIT_COST_TIER_AMOUNT))
  const canAffordRecruit = computed(() => resources.hasStone(recruitCost.value))
  const recruitCostLine = computed(() => `${formatGN(recruitCost.value)} 灵石`)

  const apprenticesList = computed(() =>
    appr.apprentices.map(a => {
      const def = apprenticeDef(a.archId)!
      const busy = a.task !== null
      const task = busy ? APPRENTICE_TASKS.find(t => t.spec === a.task!.spec)! : null
      return {
        uid: a.uid,
        level: a.level,
        bondTitle: bondTitle(a.bond),
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

  /** 展开中的派活说明:键是 `弟子 uid:任务 spec`,跨弟子只开一份 */
  const taskTap = ref<string | null>(null)
  const tappedTask = computed(() => {
    const key = taskTap.value
    if (!key) return null
    const i = key.indexOf(':')
    const uid = key.slice(0, i)
    const spec = key.slice(i + 1) as ApprenticeSpec
    return { uid, spec, desc: APPRENTICE_TASKS.find(t => t.spec === spec)?.desc ?? '' }
  })

  function tapTask(uid: string, spec: ApprenticeSpec): void {
    const key = `${uid}:${spec}`
    if (taskTap.value === key) {
      taskTap.value = null
      dispatcher(uid, spec)
      return
    }
    taskTap.value = key
  }

  function doDispatchAll(): void {
    // 按钮在无闲置道童时禁用,dispatchAll 恒派 ≥1 名 —— 无兜底死分支
    const n = appr.dispatchAll(now.value)
    if (n > 0) ui.toast(`已按需遣 ${n} 名道童出门`, 'info')
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
    if (s.pillId) parts.push(`${pillDef(s.pillId)?.name ?? '丹药'}×${s.pillCount ?? 1}`)
    return parts.join(' · ')
  }

  /** 收割所有已完工道童;回来的就报一声带回什么 */
  function reap(): void {
    const reaped = appr.collectFinished(now.value, player.major)
    if (reaped.length === 0) return
    // ui.toast 会按「同文 + 同级」去重刷新同一条:两名道童带回一模一样的「悟道×2」时,
    // 逐条 toast 会被第二条顶掉 —— 明明回了两位却只报一位。批量就合成一条汇总
    if (reaped.length === 1) {
      ui.toast(`道童归来,带回 ${spoilsText(reaped[0]!)}`, 'success')
      return
    }
    ui.toast(`道童归来 ${reaped.length} 名:${reaped.map(s => spoilsText(s)).join(';')}`, 'success')
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
