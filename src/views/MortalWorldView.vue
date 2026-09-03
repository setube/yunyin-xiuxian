<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <template v-if="view">
      <!-- 世界身份占据第一视觉位:标题是这一世的名字,不是通用标签 -->
      <div>
        <h1 class="font-kai text-[19px] tracking-[0.12em] text-ink">{{ view.title }}</h1>
        <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">本世之界 · {{ view.summary }}</p>
        <p class="mt-0.5 text-[11px] text-cinnabar">此世笼罩:{{ view.ruleText }}</p>
      </div>

      <!-- 路线全貌:高低即层级,横距即路程,点大即事多 -->
      <div class="card-ink px-3 py-2">
        <svg :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`" class="h-16 w-full" role="img" aria-label="本世路线">
          <polyline :points="polyline" fill="none" stroke="currentColor" stroke-width="1" class="text-ink/25" />
          <circle
            v-for="p in view.places"
            :key="p.nodeId"
            :cx="p.x"
            :cy="p.y"
            :r="p.r"
            :class="cleared(p.nodeId) ? 'text-jade' : unlocked(p.nodeId) ? 'text-azure' : 'text-ink-ghost'"
            fill="currentColor"
            :fill-opacity="unlocked(p.nodeId) ? 0.85 : 0.35"
          />
        </svg>
        <p class="mt-0.5 text-center text-[10px] text-ink-ghost">高处境深 · 远处路长 · 点大处事多</p>
      </div>

      <SectionTitle title="本世地界" hint="这一世的路,按段而行" />
      <div class="space-y-2">
        <div
          v-for="p in view.places"
          :key="p.nodeId"
          class="card-ink flex items-center gap-3 px-3 py-2.5"
          :class="{ 'opacity-60': !unlocked(p.nodeId) }"
        >
          <span
            class="grid h-9 w-9 shrink-0 place-items-center rounded-md"
            :class="unlocked(p.nodeId) ? 'bg-azure/10 text-azure' : 'bg-ink/6 text-ink-ghost'"
          >
            <GameIcon :name="unlocked(p.nodeId) ? (regionDef(p.regionId)?.icon ?? 'mountain') : 'lock'" :size="16" />
          </span>
          <div class="min-w-0 grow">
            <p class="flex items-baseline gap-1.5">
              <span class="truncate font-kai text-[14px] text-ink">{{ p.name }}</span>
              <span class="shrink-0 text-[11px] text-azure">{{ p.terrain }}</span>
              <span v-if="cleared(p.nodeId)" class="shrink-0 text-[10px] text-jade">已通</span>
            </p>
            <p class="mt-0.5 flex items-center gap-2 text-[10px] text-ink-faint">
              <span class="truncate">镇守 {{ p.bossName }}</span>
              <span class="flex shrink-0 gap-0.5">
                <span v-for="n in p.eventLevel" :key="n" class="h-1 w-1 rounded-full bg-gold-ink/60" />
              </span>
            </p>
          </div>
          <!-- 已通的段落照样能再去 —— 「已通」是记号,不是封路 -->
          <button v-if="unlocked(p.nodeId)" class="btn-seal shrink-0 !px-3 !py-1.5 !text-[12px]" @click="depart(p.regionId)">出 发</button>
        </div>
      </div>

      <!--
        换界规则必须写明:目前唯一的换界时机是兵解转世,玩家没有主动手段。
        规则存在却不告诉玩家,和没有规则一样糟
      -->
      <div class="card-ink px-4 py-3">
        <p class="font-kai text-[13px] tracking-widest text-ink-soft">此界从何而来</p>
        <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
          你睁眼时,天地已成此形。所历地界、途中缓急、镇守之物皆随此世而定,
          <span class="text-ink-soft">这一世之内不会再变</span>
          。
        </p>
        <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">
          唯有
          <span class="text-violet-ink">兵解转世</span>
          ,方另开一片天地—— 与此世不同的地界、不同的路、不同的规矩。
        </p>
        <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">
          此外诸界仍在,可回
          <span class="text-azure">历练</span>
          处另择他地,不必只走此路。
        </p>
      </div>
    </template>
    <p v-else class="text-[12px] text-ink-faint">此世气象尚未凝成。</p>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import { useAdventureStore } from '@/stores/adventure'
  import { enemyDef } from '@/data/enemies'
  import { regionDef } from '@/data/regions'
  import { VIEW_H, VIEW_W, canEnterNode, ensureMortalWorld, isNodeCleared, worldView } from '@/core/mortalWorldService'

  const adventure = useAdventureStore()
  const router = useRouter()

  /** 本世之界;首次进入本页时凝成 */
  const view = computed(() => {
    const w = adventure.mortalWorld ?? ensureMortalWorld()
    if (!w) return null
    return worldView(w, id => enemyDef(id)?.name ?? id)
  })

  /** 路线折线 —— 纵向绑定层级,故回落看得见 */
  const polyline = computed(() => (view.value ? view.value.places.map(p => `${p.x},${p.y}`).join(' ') : ''))

  function unlocked(nodeId: string): boolean {
    return canEnterNode(nodeId)
  }

  function cleared(nodeId: string): boolean {
    return isNodeCleared(nodeId)
  }

  /**
   * 出发 —— 带着地界回历练页选出行方式。
   *
   * 模式弹窗连着适配预览与流派推荐,只应有一处实现;
   * 在这里重做一遍等于把同一段逻辑养成两份
   */
  function depart(regionId: string): void {
    router.push({ path: '/adventure', query: { go: regionId } })
  }
</script>
