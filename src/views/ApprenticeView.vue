<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <div class="card-ink flex items-center justify-between px-4 py-3">
      <p class="font-kai text-[14px] tracking-widest text-ink">道童</p>
      <div class="flex items-center gap-3">
        <p class="flex items-center gap-1 tabular text-[13px] text-gold-ink">
          <GameIcon name="gem" :size="14" />{{ formatGN(resources.spiritStone) }}
        </p>
        <!--
          两种拒因各写各的:门中已满 / 灵石尚差 N。原先只写后者,而 slotsFull 为真时
          正文里的代价 span 被整段抽掉 —— 只剩「收道童」三个字,按下才知道满员。
        -->
        <button
          class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]"
          :disabled="slotsFull || !canAffordRecruit"
          :title="slotsFull ? '门中已满' : !canAffordRecruit ? `灵石尚差 ${formatGap(recruitShort)}` : undefined"
          @click="doRecruit"
        >
          收道童<span v-if="slotsFull" class="ml-1 text-[10px]">(门中已满)</span>
          <span v-else class="ml-1 text-[10px]">
            {{ canAffordRecruit ? `(${recruitCostLine})` : `(灵石尚差 ${formatGap(recruitShort)})` }}
          </span>
        </button>
      </div>
    </div>

    <section>
      <SectionTitle title="座下道童" :hint="`${appr.apprentices.length}/${slots}`" />
      <div class="mt-1 flex items-center justify-between gap-2 px-1">
        <span class="text-[10px] text-ink-faint">按需派活 · 仅闲置</span>
        <button class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]" :disabled="!hasIdle" @click="doDispatchAll">
          <GameIcon name="users" :size="12" />{{ hasIdle ? '各尽其长' : '各尽其长(无闲置)' }}
        </button>
      </div>
      <div class="mt-2 space-y-2">
        <div v-for="a in apprenticesList" :key="a.uid" class="card-ink relative p-3">
          <!-- 最上档道童:四角御纹 + 流光(见 ui/luster) -->
          <span v-if="a.luster" class="luster-cornice" aria-hidden="true" />
          <span v-if="a.luster" class="luster-sheen" aria-hidden="true" />
          <div class="flex items-center gap-2">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-jade/40 bg-jade/15 font-kai text-[15px] text-ink">
              {{ a.def.name[0] }}
            </span>
            <div class="min-w-0 grow">
              <!--
                品阶形制:六个道童原型分属凡/良/精/灵四档,而卡上此前一字未提 ——
                与装备、丹药、功法同一套语言(名字走品阶文字色,天品以上另有角章)。
                层数与羁绊已各有刻度,品阶是这张卡上唯一还没有形制的量。
              -->
              <p class="flex items-center gap-2 truncate font-kai text-[14px]">
                <span :style="{ color: qualityTextColor(a.def.quality) }">{{ a.def.name }}</span>
                <span class="rounded border border-gold-ink/40 bg-gold-ink/10 px-1.5 text-[10px] text-ink">第 {{ a.level }} 层</span>
                <span class="rounded border border-jade/40 bg-jade/10 px-1.5 text-[10px] text-ink">{{ a.bondTitle }}</span>
                <span class="shrink-0 rounded bg-ink/6 px-1.5 py-0.5 text-[10px] leading-none" :style="{ color: qualityTextColor(a.def.quality) }">{{ qualityDef(a.def.quality).name }}</span>
                <span v-if="a.luster" class="text-[10px] text-ink-faint">{{ a.luster.label }}</span>
              </p>
              <p class="truncate text-[10px] text-ink-faint">{{ a.def.desc }}</p>
            </div>
          </div>
          <!--
            层数刻度与羁绊阶点:第 7 层离满还有多远、道徒与记名弟子哪个近,
            本来是拿文字去比数(见 ui/apprenticeMark)。门槛全取自 data/apprentices。
          -->
          <div class="mt-1.5 flex items-center gap-2">
            <span
              class="appr-pips shrink-0"
              :class="{ 'appr-pips--max': a.mark.maxed }"
              role="img"
              :aria-label="`第 ${a.mark.level.have} 层,共 ${a.mark.level.total} 层`"
            >
              <i v-for="(on, i) in levelPips(a.mark.level.have)" :key="i" :class="{ on }" />
            </span>
            <span class="shrink-0 text-[9px] tabular text-ink-faint">{{ a.mark.level.have }}/{{ a.mark.level.total }}</span>
            <span class="ml-auto flex shrink-0 items-center gap-1">
              <span class="bond-pips" :style="{ '--bond-tone': a.mark.bondRank >= 3 ? 'var(--color-gold-ink)' : undefined }" aria-hidden="true">
                <i v-for="p in a.mark.bondPips" :key="p" />
              </span>
              <!--
                这一行左边是「层数 1/20」,右边原写「还差 10 趟」——
                两个数挨在一行,读者会把它读成「还差 19 趟升满 20 层」。
                可右边数的是**羁绊位阶**(10/30/60/100 趟),与层数各算各的。
                补上主语,免得两把尺混成一把。
              -->
              <span class="text-[9px] text-ink-faint tabular">
                {{ a.mark.toNextBond === null ? '羁绊已至真传' : `羁绊还差 ${a.mark.toNextBond} 趟` }}
              </span>
            </span>
          </div>

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
          <!-- 派活说明点按展开,不挂 :title(手机没有 hover);同一枚按钮第一下展开、再点才派出 -->
          <p
            v-if="!a.busy && tappedTask && tappedTask.uid === a.uid"
            class="mt-1 text-[10px] leading-relaxed text-ink-faint"
          >
            {{ tappedTask.desc }} · 再点派出
          </p>
        </div>
        <p v-if="apprenticesList.length === 0" class="px-2 py-4 text-center text-[11px] text-ink-faint">暂无道童</p>
      </div>
      <p class="mt-2 text-[10px] text-ink-faint">离线照常走工 · 天赋门类产出更丰</p>
      <!-- 升级只由完工趟数驱动,机制里没有半格进度 -->
      <p class="mt-1 text-[10px] text-ink-faint">每完工一趟升一层 · 上限 {{ APPRENTICE_MAX_LEVEL }} 层</p>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import { formatCountdown, formatGN, formatGap } from '@/utils/format'
  import { usePlayerStore } from '@/stores/player'
  import { useResourcesStore } from '@/stores/resources'
  import { useApprenticeStore } from '@/stores/apprentice'
  import { useUiStore } from '@/stores/ui'
  import {
    APPRENTICE_TASKS,
    APPRENTICE_MAX_LEVEL,
    taskDef,
    apprenticeDef,
    apprenticeSlots,
    bondTitle,
    type ApprenticeSpec
  } from '@/data/apprentices'
  import { apprenticeRecruitCost, apprenticeRecruitShortfall } from '@/core/apprenticeService'
  import { apprenticeHerbName, apprenticeReturnText } from '@/ui/apprenticeText'
  import { apprenticeMark, levelPips } from '@/ui/apprenticeMark'
  import { lusterOf } from '@/ui/luster'
  import { qualityDef, qualityTextColor } from '@/data/qualities'
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
  const recruitCost = computed(() => apprenticeRecruitCost(player.major))
  const canAffordRecruit = computed(() => resources.hasStone(recruitCost.value))
  const recruitShort = computed(() => apprenticeRecruitShortfall(player.major, resources.spiritStone))
  const recruitCostLine = computed(() => `${formatGN(recruitCost.value)} 灵石`)

  const apprenticesList = computed(() =>
    appr.apprentices.map(a => {
      const def = apprenticeDef(a.archId)!
      const busy = a.task !== null
      const task = busy ? APPRENTICE_TASKS.find(t => t.spec === a.task!.spec) : null
      return {
        uid: a.uid,
        level: a.level,
        bondTitle: bondTitle(a.bond),
        /** 层数刻度与羁绊阶点(见 ui/apprenticeMark) */
        mark: apprenticeMark(a.level, a.bond),
        def,
        luster: lusterOf(def.quality),
        busy,
        taskName: task?.name ?? '',
        taskIcon: task?.icon ?? '',
        remainingSec: busy ? Math.max(0, (a.task!.finishAt - now.value) / 1000) : 0,
        talentNote: `天赋:${taskDef(def.talent).name}${def.talent === 'herb' ? `(${apprenticeHerbName(player.major)})` : ''}`
      }
    })
  )

  function dispatcher(uid: string, spec: ApprenticeSpec): void {
    if (appr.dispatch(uid, spec, Date.now())) {
      ui.toast('已派出', 'info')
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
    // 按钮在无闲置道童时禁用,dispatchAll 恒派 ≥1 名
    const n = appr.dispatchAll(now.value)
    if (n > 0) ui.toast(`已派出 ${n} 名`, 'info')
  }

  function doRecruit(): void {
    const result = appr.recruit(player.major)
    if (result === 'ok') ui.toast('已收道童', 'success')
    else if (result === 'poor') ui.toast(`灵石尚差 ${formatGap(recruitShort.value)}`, 'warn')
    else ui.toast('门中已满', 'info')
  }

  /** 收割所有已完工道童并报带回什么 */
  function reap(): void {
    const reaped = appr.collectFinished(now.value, player.major)
    if (reaped.length === 0) return
    // 合成一条汇总:ui.toast 按「同文 + 同级」去重,逐条报会漏报
    ui.toast(apprenticeReturnText(reaped, player.major), 'success')
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
