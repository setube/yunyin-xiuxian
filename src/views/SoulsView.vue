<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 未至真仙 -->
    <div v-if="!unlocked" class="card-ink px-6 py-16 text-center">
      <p class="font-kai text-[22px] tracking-[0.4em] text-ink">器 魂</p>
      <p class="mt-4 text-[12px] leading-relaxed text-ink-faint">
        凡器未历天道,何来形意。
        <br />
        修至
        <span class="text-cinnabar">真仙境</span>
        ,方知此理。
      </p>
    </div>

    <template v-else>
      <!-- 抬头 -->
      <div class="card-ink flex items-center justify-between gap-2 px-4 py-3">
        <button class="text-left text-[12px] text-ink-faint" @click="router.back()">← 天界</button>
        <p class="font-kai text-[15px] tracking-[0.3em] text-ink">器 魂</p>
        <div class="text-right">
          <span class="block text-[10px] leading-tight text-ink-ghost">道源</span>
          <span class="block tabular font-kai text-[15px] leading-tight text-cinnabar">{{ formatNum(endgame.daoSource) }}</span>
        </div>
      </div>

      <!-- 何谓器魂 -->
      <section>
        <SectionTitle title="何谓器魂" hint="凡器承不住天道,只余形意" />
        <div class="card-ink mt-2 px-4 py-3">
          <p class="text-[11px] leading-relaxed text-ink-faint">
            凡人的法器到了天界本就承不住:天道压顶,数值被尽数抹平,只余形意。 那点形意便是
            <span class="text-gold-ink">器魂</span>
            ——它记得这件法器是何路数,却记不得它有多锋利。 故而在天界,九件神品与三件精品若路数相同,并无分别;
            <span class="text-cinnabar">欲更强,只能改路数,不能堆数值。</span>
          </p>
          <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            以凡器入炉,形销而意存,得器魂一缕。神魂只容 {{ SOUL_SLOTS }} 缕——取舍便是构筑。
            <span class="text-ink-ghost">不凝器魂者,身上法器的词条由天道径直压平,压得更狠;凝了是主动掌控形意,略胜一筹。</span>
          </p>
        </div>
      </section>

      <!-- 已凝形意 -->
      <section>
        <SectionTitle title="已凝形意" :hint="`${endgame.activeSouls.length} / ${SOUL_SLOTS} 缕`" />
        <div class="mt-2 grid grid-cols-3 gap-2">
          <div
            v-for="i in SOUL_SLOTS"
            :key="i"
            class="card-ink flex min-h-[86px] flex-col items-center justify-center px-2 py-2 text-center"
            :class="endgame.activeSouls[i - 1] ? '' : 'opacity-50'"
          >
            <template v-if="endgame.activeSouls[i - 1]">
              <span class="font-kai text-[22px] leading-none" :style="{ color: soulColor(endgame.activeSouls[i - 1]!) }">
                {{ soulSeal(endgame.activeSouls[i - 1]!) }}
              </span>
              <span class="mt-1 text-[10px] leading-tight text-ink-soft">{{ soulLabel(endgame.activeSouls[i - 1]!) }}</span>
              <button class="mt-1 text-[10px] text-ink-faint underline" @click="removeSoul(endgame.activeSouls[i - 1]!.uid)">卸下</button>
            </template>
            <span v-else class="text-[10px] text-ink-ghost">空</span>
          </div>
        </div>
        <p v-if="activeModText" class="mt-2 px-1 text-[10px] leading-relaxed text-gold-ink">合计:{{ activeModText }}</p>
      </section>

      <!-- 两处入口 -->
      <section class="space-y-2">
        <button
          class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-99"
          @click="idleOpen = true"
        >
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-violet-ink/85 font-kai text-[19px] text-paper">意</span>
          <span class="min-w-0 flex-1">
            <span class="block font-kai text-[14px] tracking-widest text-ink">散置形意</span>
            <span class="block truncate text-[10px] leading-relaxed text-ink-faint">
              {{ idleSouls.length > 0 ? `${idleSouls.length} 缕待用 · 装配或散去` : '暂无闲置器魂' }}
            </span>
          </span>
          <span class="shrink-0 text-[12px] text-ink-faint">›</span>
        </button>

        <button
          class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-99"
          @click="forgeOpen = true"
        >
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cinnabar/85 font-kai text-[19px] text-paper">炼</span>
          <span class="min-w-0 flex-1">
            <span class="block font-kai text-[14px] tracking-widest text-ink">凝炼台</span>
            <span class="block truncate text-[10px] leading-relaxed text-ink-faint">
              {{ refinable.length > 0 ? `${refinable.length} 件可凝 · 道源 ${SOUL_REFINE_COST}/枚` : '行囊中无可凝之器' }}
            </span>
          </span>
          <span class="shrink-0 text-[12px] text-ink-faint">›</span>
        </button>
      </section>
    </template>

    <!-- 散置形意 -->
    <BaseModal :open="idleOpen" title="散置形意" @close="idleOpen = false">
      <div v-if="idleSouls.length > 0" class="card-ink max-h-64 divide-y divide-ink/7 overflow-y-auto px-4">
        <div v-for="soul in idleSouls" :key="soul.uid" class="flex items-center justify-between gap-2 py-2.5">
          <div class="min-w-0">
            <p class="truncate text-[12px]" :style="{ color: soulColor(soul) }">{{ soulLabel(soul) }}</p>
            <p class="text-[10px] text-ink-faint">凝自「{{ soul.fromName }}」 · {{ soulModText(soul) }}</p>
          </div>
          <div class="flex shrink-0 gap-1">
            <button class="btn-ghost !px-2.5 !py-1 !text-[11px]" @click="wearSoul(soul.uid)">装配</button>
            <button class="btn-ghost !px-2 !py-1 !text-[11px] !text-ink-faint" @click="dissolveSoul(soul.uid)">散去</button>
          </div>
        </div>
      </div>
      <p v-else class="px-4 py-6 text-center text-[11px] leading-relaxed text-ink-ghost">
        并无闲置形意。
        <br />
        <span class="text-[10px]">凝出的器魂若已尽数装配,此处便空着</span>
      </p>
      <template #footer>
        <button class="btn-seal w-full" @click="idleOpen = false">收 起</button>
      </template>
    </BaseModal>

    <!-- 凝炼台 -->
    <BaseModal :open="forgeOpen" title="凝炼台" @close="forgeOpen = false">
      <p class="mb-2 text-[11px] leading-relaxed text-ink-faint">入炉即毁原器,耗道源 {{ SOUL_REFINE_COST }}。</p>
      <div v-if="refinable.length > 0" class="card-ink max-h-64 divide-y divide-ink/7 overflow-y-auto px-4">
        <div v-for="row in refinable" :key="row.inst.uid" class="flex items-center justify-between gap-2 py-2.5">
          <div class="min-w-0">
            <p class="truncate text-[12px] text-ink-soft">{{ row.name }}</p>
            <p class="truncate text-[10px] text-ink-faint">
              将凝出
              <span :style="{ color: soulGradeDef(row.gradeRank).color }">{{ soulGradeDef(row.gradeRank).name }}·{{ row.typeName }}</span>
            </p>
          </div>
          <button class="btn-ghost !px-3 !py-1 !text-[11px]" @click="refineEquipment(row.inst.uid)">入 炉</button>
        </div>
      </div>
      <p v-else class="px-4 py-6 text-center text-[11px] leading-relaxed text-ink-ghost">
        行囊中无可凝之器。
        <br />
        <span class="text-[10px]">已穿戴、已上锁、或无任何词条的法器都入不得炉</span>
      </p>
      <template #footer>
        <button class="btn-seal w-full" @click="forgeOpen = false">收 炉</button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { formatNum } from '@/utils/format'
  import { STAT_NAMES } from '@/ui/statNames'
  import type { AnyStatKey } from '@/types'
  import { equipmentTemplate } from '@/data/equipment'
  import { SOUL_SLOTS, soulGradeDef, soulMods, soulName, soulTypeDef, type SoulInstance } from '@/data/souls'
  import { canRefine, dissolveSoul, previewSoul, refineEquipment, removeSoul, SOUL_REFINE_COST, wearSoul } from '@/core/soulService'
  import { endgameUnlocked } from '@/core/endgameService'
  import { useEndgameStore } from '@/stores/endgame'
  import { useInventoryStore } from '@/stores/inventory'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import BaseModal from '@/components/common/BaseModal.vue'

  const router = useRouter()
  const endgame = useEndgameStore()
  const inventory = useInventoryStore()

  const unlocked = computed(() => endgameUnlocked())
  const idleOpen = ref(false)
  const forgeOpen = ref(false)

  /** 未装配的器魂 */
  const idleSouls = computed(() => endgame.soulList.filter(s => !endgame.activeSouls.some(a => a.uid === s.uid)))

  /** 可入炉的法器:未锁定、未穿戴、且确有形意可存 */
  const refinable = computed(() => {
    const wearing = new Set(Object.values(inventory.equipped).filter((v): v is string => typeof v === 'string'))
    return inventory.items
      .filter(it => !it.locked && !wearing.has(it.uid) && canRefine(it))
      .map(inst => {
        const preview = previewSoul(inst)
        return {
          inst,
          name: equipmentTemplate(inst.templateId)?.name ?? '无名法器',
          typeName: preview.type?.name ?? '器魂',
          gradeRank: preview.gradeRank
        }
      })
  })

  function modsText(mods: Record<string, unknown>): string {
    return Object.entries(mods)
      .filter(([, v]) => typeof v === 'number' && v !== 0)
      .map(([k, v]) => `${STAT_NAMES[k as AnyStatKey] ?? k} +${Math.round((v as number) * 100)}%`)
      .join(' · ')
  }

  function soulLabel(soul: SoulInstance): string {
    return soulName(soul)
  }
  function soulSeal(soul: SoulInstance): string {
    return soulTypeDef(soul.type)?.seal ?? '魂'
  }
  function soulColor(soul: SoulInstance): string {
    return soulGradeDef(soul.grade).color
  }
  function soulModText(soul: SoulInstance): string {
    return modsText(soulMods(soul))
  }
  /** 已装配器魂的合计词条 */
  const activeModText = computed(() => modsText(endgame.soulMods))
</script>
