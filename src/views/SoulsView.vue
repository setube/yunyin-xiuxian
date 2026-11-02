<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <div v-if="!unlocked" class="card-ink px-6 py-16 text-center">
      <p class="font-kai text-[22px] tracking-[0.4em] text-ink">器 魂</p>
      <p class="mt-4 text-[12px] leading-relaxed text-ink-faint">需<span class="text-cinnabar">真仙境</span></p>
    </div>

    <template v-else>
      <div class="card-ink flex items-center justify-between gap-2 px-4 py-3">
        <!-- 冷启动时也回天界,不退出游戏(同洞府) -->
        <button class="-my-1.5 py-1.5 text-left text-[12px] text-ink-faint" @click="goBack(router, { name: 'celestial' })">← 天界</button>
        <p class="font-kai text-[15px] tracking-[0.3em] text-ink">器 魂</p>
        <div class="text-right">
          <span class="block text-[10px] leading-tight text-ink-faint">道源</span>
          <span class="block tabular font-kai text-[15px] leading-tight text-cinnabar">{{ formatNum(endgame.daoSource) }}</span>
        </div>
      </div>

      <section>
        <SectionTitle title="何谓器魂" />
        <div class="card-ink mt-2 px-4 py-3">
          <p class="text-[11px] leading-relaxed text-ink-faint"><span class="text-gold-ink">器魂</span>:叠加于基础属性之上</p>
        </div>
      </section>

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
              <!-- 纯文字只有 15px 高;内联块给拇指 30px 靶面 -->
              <button
                class="mt-1 inline-block px-2 py-2 text-[10px] text-ink-faint underline"
                @click="removeSoul(endgame.activeSouls[i - 1]!.uid)"
              >
                卸下
              </button>
            </template>
            <span v-else class="text-[10px] text-ink-faint">空</span>
          </div>
        </div>
        <p v-if="activeModText" class="mt-2 px-1 text-[10px] leading-relaxed text-gold-ink">合计:{{ activeModText }}</p>
      </section>

      <section class="space-y-2">
        <button
          class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-98"
          @click="idleOpen = true"
        >
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-violet-ink font-kai text-[19px] seal-face">意</span>
          <span class="min-w-0 flex-1">
            <span class="block font-kai text-[14px] tracking-widest text-ink">散置形意</span>
            <span class="block truncate text-[10px] leading-relaxed text-ink-faint">
              {{ idleSouls.length > 0 ? `${idleSouls.length} 缕闲置` : '暂无闲置器魂' }}
            </span>
          </span>
          <span class="shrink-0 text-[12px] text-ink-faint">›</span>
        </button>

        <button
          class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-98"
          @click="forgeOpen = true"
        >
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cinnabar font-kai text-[19px] seal-face">炼</span>
          <span class="min-w-0 flex-1">
            <span class="block font-kai text-[14px] tracking-widest text-ink">凝炼台</span>
            <span class="block truncate text-[10px] leading-relaxed text-ink-faint">
              {{ refinable.length > 0 ? `${refinable.length} 件可凝 · 道源 ${SOUL_REFINE_COST}/枚` : '暂无可凝法器' }}
            </span>
          </span>
          <span class="shrink-0 text-[12px] text-ink-faint">›</span>
        </button>
      </section>
    </template>

    <BaseModal :open="idleOpen" title="散置形意" @close="idleOpen = false">
      <!-- 散去的后果须在动手之前看见 -->
      <p class="mb-2 text-[10px] leading-relaxed text-ink-faint">{{ dissolveNote() }}</p>
      <div v-if="idleSouls.length > 0" class="card-ink max-h-64 divide-y divide-ink/6 overflow-y-auto px-4">
        <div v-for="soul in idleSouls" :key="soul.uid" class="flex items-center justify-between gap-2 py-2.5">
          <div class="min-w-0">
            <p class="truncate text-[12px]" :style="{ color: soulColor(soul) }">{{ soulLabel(soul) }}</p>
            <p class="text-[10px] text-ink-faint">凝自「{{ soul.fromName }}」 · {{ soulModText(soul) }}</p>
          </div>
          <!-- 巡页夹具无灵魂,28px 尺子碰不到这些钮;!py-2 盒高 35px,与同行确认态按钮同高 -->
          <div class="flex shrink-0 gap-1">
            <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="wearSoul(soul.uid)">装配</button>
            <template v-if="pendingDissolveUid !== soul.uid">
              <button class="btn-ghost !px-2 !py-2 !text-[11px] !text-ink-faint" @click="pendingDissolveUid = soul.uid">散去</button>
            </template>
            <template v-else>
              <button class="btn-seal !px-2 !py-2 !text-[11px]" @click="doDissolve(soul.uid)">确认散去</button>
              <button class="btn-ghost !px-2 !py-2 !text-[11px]" @click="pendingDissolveUid = null">再想想</button>
            </template>
          </div>
        </div>
      </div>
      <p v-else class="px-4 py-6 text-center text-[11px] leading-relaxed text-ink-faint">暂无闲置器魂</p>
      <template #footer>
        <button class="btn-seal w-full" @click="idleOpen = false">收 起</button>
      </template>
    </BaseModal>

    <BaseModal :open="forgeOpen" title="凝炼台" @close="forgeOpen = false">
      <!-- 弹窗盖住标题栏的道源,代价与余额须同屏 -->
      <p class="mb-2 text-[11px] leading-relaxed text-ink-faint">{{ refineCostLine(SOUL_REFINE_COST, formatNum(endgame.daoSource)) }}</p>
      <div v-if="refinable.length > 0" class="card-ink max-h-64 divide-y divide-ink/6 overflow-y-auto px-4">
        <div v-for="row in refinable" :key="row.inst.uid" class="flex items-center justify-between gap-2 py-2.5">
          <div class="min-w-0">
            <p class="truncate text-[12px] text-ink-soft">{{ row.name }}</p>
            <p class="truncate text-[10px] text-ink-faint">
              将凝出
              <span :style="{ color: soulGradeDef(row.gradeRank).color }">{{ soulGradeDef(row.gradeRank).name }}·{{ row.typeName }}</span>
            </p>
          </div>
          <!-- 二步确认:毁的是原器 -->
          <button
            v-if="pendingRefineUid !== row.inst.uid"
            class="btn-ghost !px-3 !py-2 !text-[11px]"
            :disabled="refineShort.short.m > 0"
            :title="refineShort.reason ?? undefined"
            @click="pendingRefineUid = row.inst.uid"
          >
            {{ refineShort.reason ? `入 炉(${refineShort.reason})` : '入 炉' }}
          </button>
          <div v-else class="flex shrink-0 items-center gap-1.5">
            <button
              class="btn-seal !px-2.5 !py-2 !text-[11px]"
              :disabled="refineShort.short.m > 0"
              :title="refineShort.reason ?? undefined"
              @click="doRefine(row.inst.uid)"
            >
              确认凝炼
            </button>
            <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="pendingRefineUid = null">再想想</button>
          </div>
        </div>
      </div>
      <p v-else class="px-4 py-6 text-center text-[11px] leading-relaxed text-ink-faint">暂无可凝法器</p>
      <template #footer>
        <button class="btn-seal w-full" @click="forgeOpen = false">收 炉</button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { goBack } from '@/router/goBack'
  import { formatNum } from '@/utils/format'
  import { modsText } from '@/data/statNames'
  import { dissolveNote, refineCostLine } from '@/ui/soulText'
  import { equipmentTemplate } from '@/data/equipment'
  import { SOUL_SLOTS, soulGradeDef, soulMods, soulName, soulTypeDef, type SoulInstance } from '@/data/souls'
  import { canRefine, dissolveSoul, previewSoul, refineEquipment, removeSoul, SOUL_REFINE_COST, wearSoul } from '@/core/soulService'
  import { daoSourceShortfall } from '@/core/daoSource'
  import { endgameUnlocked } from '@/core/endgameService'
  import { useEndgameStore } from '@/stores/endgame'
  import { useInventoryStore } from '@/stores/inventory'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import BaseModal from '@/components/common/BaseModal.vue'

  const router = useRouter()
  const endgame = useEndgameStore()
  const inventory = useInventoryStore()
  const refineShort = computed(() => daoSourceShortfall(SOUL_REFINE_COST, endgame.daoSource))

  const unlocked = computed(() => endgameUnlocked())
  const idleOpen = ref(false)
  const forgeOpen = ref(false)
  /** 已展开确认态的行 uid */
  const pendingRefineUid = ref<string | null>(null)
  /** 散去同样二步确认(不可逆) */
  const pendingDissolveUid = ref<string | null>(null)

  function doRefine(uid: string): void {
    refineEquipment(uid)
    pendingRefineUid.value = null
  }

  function doDissolve(uid: string): void {
    dissolveSoul(uid)
    pendingDissolveUid.value = null
  }

  const idleSouls = computed(() => endgame.soulList.filter(s => !endgame.activeSouls.some(a => a.uid === s.uid)))

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
  const activeModText = computed(() => modsText(endgame.soulMods))
</script>
