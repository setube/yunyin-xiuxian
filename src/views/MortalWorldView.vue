<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <template v-if="view">
      <div class="card-ink paper-grain relative overflow-hidden px-4 pb-3.5 pt-3">
        <p class="font-kai text-[10px] tracking-[0.35em] text-ink-faint">本 世 之 界</p>
        <div class="mt-1 flex items-end gap-3">
          <div class="min-w-0 grow">
            <h1 class="font-kai text-[19px] tracking-[0.12em] text-ink">{{ view.title }}</h1>
            <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">{{ view.summary }}</p>
          </div>
          <span
            class="world-seal mb-1 grid h-11 w-11 shrink-0 -rotate-2 place-items-center rounded-sm font-kai text-[19px]"
          >世</span>
        </div>
        <p class="mt-1.5 text-[11px] leading-relaxed text-cinnabar">此世规则:{{ view.ruleText }}</p>
      </div>

      <div class="card-ink paper-grain px-3 py-2">
        <svg :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`" class="h-16 w-full" role="img" aria-label="本世路线">
          <defs>
            <linearGradient id="world-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="var(--color-azure)" stop-opacity="0.12" />
              <stop offset="0.62" stop-color="var(--color-azure)" stop-opacity="0" />
              <stop offset="1" stop-color="var(--color-ink)" stop-opacity="0.08" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" :width="VIEW_W" :height="VIEW_H" rx="7" fill="url(#world-sky)" />
          <polyline
            v-for="(seg, i) in segments"
            :key="i"
            :points="seg.points"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            :class="seg.cls"
            :style="seg.dash ? { strokeDasharray: seg.dash } : undefined"
          />
          <circle
            v-for="p in places"
            :key="p.nodeId"
            :cx="p.x"
            :cy="p.y"
            :r="p.r"
            :class="p.dotClass"
            fill="currentColor"
            :fill-opacity="p.dotOpacity"
          />
          <circle
            v-if="focusNode"
            :cx="focusNode.x"
            :cy="focusNode.y"
            :r="focusNode.r + 2.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1"
            class="node-focus text-cinnabar"
          />
        </svg>
        <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-ink-faint">
          <span class="inline-flex items-center gap-1">
            <span class="h-1.5 w-1.5 rounded-full bg-ink-faint/75" /> 未至
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="h-1.5 w-1.5 rounded-full bg-azure/80" /> 可往
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="h-1.5 w-1.5 rounded-full bg-jade" /> 已通
          </span>
          <span class="ml-auto">高处境深 · 远处路长 · 点大处事多</span>
        </p>
      </div>

      <SectionTitle title="本世地界" :hint="travelHint" />
      <div class="space-y-2">
        <div
          v-for="p in places"
          :key="p.nodeId"
          class="card-ink flex items-center gap-3 px-3 py-2.5"
          :class="{
            'opacity-60': !p.unlocked,
            // .card-ink 的边框是手写(非 layer)声明,工具类在 @layer 里永远压不过它 ——
            // 加 ! 破层,这正是 CharacterView/AdventureView 盖卡片边框的同一套做法
            '!border-cinnabar/35': focusNode?.nodeId === p.nodeId
          }"
        >
          <span
            class="grid h-9 w-9 shrink-0 place-items-center rounded-md"
            :class="p.unlocked ? 'bg-azure/10 text-azure' : 'bg-ink/6 text-ink-faint'"
          >
            <GameIcon :name="p.icon" :size="16" />
          </span>
          <div class="min-w-0 grow">
            <p class="flex items-baseline gap-1.5">
              <span class="truncate font-kai text-[14px] text-ink">{{ p.name }}</span>
              <span class="shrink-0 text-[11px] text-azure">{{ p.terrain }}</span>
              <span v-if="p.cleared" class="shrink-0 rounded-sm border border-jade/50 px-1 py-px font-kai text-[9px] leading-none text-jade">已通</span>
              <span v-else-if="focusNode?.nodeId === p.nodeId" class="shrink-0 text-[10px] text-cinnabar">此地</span>
            </p>
            <p class="mt-0.5 flex items-center gap-2 text-[10px] text-ink-faint">
              <span class="truncate">镇守 {{ p.bossName }}</span>
              <span class="flex shrink-0 gap-0.5">
                <span v-for="n in p.eventLevel" :key="n" class="h-1 w-1 rounded-full bg-gold-ink/80" />
              </span>
            </p>
            <p v-if="!p.unlocked" class="mt-0.5 text-[10px] leading-relaxed text-cinnabar">
              {{ p.blockReason ?? '未解锁' }}
            </p>
          </div>
          <!-- 「已通」是记号,不是封路 -->
          <button v-if="p.unlocked" class="btn-seal shrink-0 !px-3 !py-1.5 !text-[12px]" @click="depart(p.regionId)">出 发</button>
        </div>
      </div>

      <!-- 换界规则须写明:唯一的换界时机是兵解转世 -->
      <div class="card-ink paper-grain px-4 py-3">
        <p class="font-kai text-[13px] tracking-widest text-ink-soft">换界</p>
        <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
          本世之内:<span class="text-ink-soft">地界、路线、镇守不变</span>
        </p>
        <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">
          <span class="text-violet-ink">兵解转世</span>:另开一界
        </p>
      </div>
    </template>
    <p v-else-if="generating" class="empty-note text-center text-[11px] text-ink-faint">凝界中</p>
    <p v-else class="empty-note text-center text-[11px] text-ink-faint">此世未成</p>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import { useAdventureStore } from '@/stores/adventure'
  import { enemyDef } from '@/data/enemies'
  import { regionDef } from '@/data/regions'
  import { VIEW_H, VIEW_W, canEnterRegion, ensureMortalWorld, entryBlockReason, isNodeCleared, worldView } from '@/core/mortalWorldService'

  const adventure = useAdventureStore()
  const router = useRouter()

  /**
   * 本世之界。生成**不在这里做**。
   *
   * 凝一界要试 3~9 个种子,每个候选跑 6 构筑 × 8 次 × 5 段的战斗审计,
   * 实测 112~468ms —— 而这只是首页与历练页之外的一个页面的首次进入。
   * 原先放在这个 computed 里同步跑,进页时主线程直接卡这么久(实测 task 129ms)。
   *
   * 现改为:挂载后单独一拍去凝,期间页面先渲染「凝界中」;
   * 凝好之后写进 store,`computed` 依赖它自然重算。
   */
  const generating = ref(false)
  const view = computed(() => {
    const w = adventure.mortalWorld
    if (!w) return null
    return worldView(w, id => enemyDef(id)?.name ?? id)
  })

  /**
   * 挂载后再凝界:让它离开首帧的同步路径。
   *
   * `nextTick` 之后跑,此时本页的骨架已经画出来了 —— 玩家看到的是「凝界中」而不是白屏。
   * 凝界本身仍是同步的一段计算(它是纯函数链,没有可 await 的 IO),
   * 但至少不再压在建页那一帧上。
   */
  onMounted(async () => {
    if (adventure.mortalWorld) return
    generating.value = true
    // 先让「凝界中」真的画出来:等一帧再开始那段同步计算
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    try {
      // 必须 await:ensureMortalWorld 是分块异步的,不等它返回就复位会让「凝界中」提前消失
      await ensureMortalWorld()
    } finally {
      generating.value = false
    }
  })

  /**
   * 一处的全部事实算一次。
   *
   * `unlocked()` 内部要查地界准入(`canEnterRegion` → 缘分表 + 解锁链两次查表),
   * `cleared()` 与 `blockReason()` 各是一次查表;原先路径图与地界卡共在一个渲染周期里
   * 分别调 `unlocked(p)` 七次、`cleared(...)` 四次、`blockReason(...)` 一次 ——
   * 同一处的同一件事算到八遍,而模板里也读不出「这几处说的是同一处」。
   *
   * 现由这一个 computed 一次算齐,模板只读字段。数据一变全变,结果与逐次调用完全一致。
   */
  const places = computed(() => {
    const ps = view.value?.places ?? []
    return ps.map(p => {
      const unlocked = canEnterRegion(p.regionId)
      const cleared = isNodeCleared(p.nodeId)
      return {
        ...p,
        unlocked,
        cleared,
        blockReason: unlocked ? null : entryBlockReason(p.regionId),
        icon: unlocked ? (regionDef(p.regionId)?.icon ?? 'mountain') : 'lock',
        /** 路径圆点:已通实心玉色,可往八成靛色,未至淡墨 */
        dotClass: cleared ? 'text-jade' : unlocked ? 'text-azure' : 'text-ink-faint',
        dotOpacity: cleared ? 1 : unlocked ? 0.85 : 0.75
      }
    })
  })

  const focusNode = computed(() => places.value.find(p => p.unlocked && !p.cleared) ?? null)

  /** 与下方路段卡同读 places,不另报口径 */
  const travelHint = computed(() => {
    const ps = places.value
    if (ps.length === 0) return ''
    const done = ps.filter(p => p.cleared).length
    return `已通 ${done}/${ps.length} 段`
  })

  const segments = computed(() => {
    const ps = places.value
    const segs: { points: string; cls: string; dash: string }[] = []
    for (let i = 0; i + 1 < ps.length; i++) {
      const a = ps[i]!
      const b = ps[i + 1]!
      const reachable = b.cleared || b.unlocked
      segs.push({
        points: `${a.x},${a.y} ${b.x},${b.y}`,
        cls: b.cleared ? 'stroke-jade/60' : b.unlocked ? 'stroke-azure/55' : 'stroke-ink/15',
        dash: reachable ? '' : '4 3'
      })
    }
    return segs
  })

  /** 带地界回历练页选出行方式;模式弹窗只应有一处实现 */
  function depart(regionId: string): void {
    void router.push({ path: '/adventure', query: { go: regionId } })
  }
</script>
