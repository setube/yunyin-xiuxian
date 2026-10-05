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
        <!-- 同洞府:标签写着「天界」,冷启动时也得真的去天界,而不是退出游戏 -->
        <button class="-my-1.5 py-1.5 text-left text-[12px] text-ink-faint" @click="goBack(router, { name: 'celestial' })">← 天界</button>
        <p class="font-kai text-[15px] tracking-[0.3em] text-ink">器 魂</p>
        <div class="text-right">
          <span class="block text-[10px] leading-tight text-ink-faint">道源</span>
          <span class="block tabular font-kai text-[15px] leading-tight text-cinnabar">{{ formatNum(endgame.daoSource) }}</span>
        </div>
      </div>

      <!-- 何谓器魂 -->
      <section>
        <SectionTitle title="何谓器魂" hint="形销而意存,多一条路数" />
        <div class="card-ink mt-2 px-4 py-3">
          <p class="text-[11px] leading-relaxed text-ink-faint">
            凡人的法器到了天界,锋芒会被天道磨去几分,却并非抹平 —— 它记得这件法器是何路数,那份记忆便是
            <span class="text-gold-ink">器魂</span>
            。器魂**叠加**在你身上:攻防血这些基础属性照常作数,器魂是在其上多给一条路数。
          </p>
          <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            以凡器入炉,形销而意存,得器魂一缕。神魂只容 {{ SOUL_SLOTS }} 缕——取舍便是构筑。
            <span class="text-ink-faint">至于堆叠本身,天道自有应对:构筑越厚,守关者的道之理解越深;境界未及此界者,还会被境界压制。</span>
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
              <!-- 纯文字按钮只有字体那 15px 高;补成内联块给拇指一个 30px 的靶面 -->
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
      <!-- 散去一无所得:原器早毁,道源也不返 —— 这句得在动手之前看见,不能等散了才发现 -->
      <p class="mb-2 text-[10px] leading-relaxed text-ink-faint">{{ dissolveNote() }}</p>
      <div v-if="idleSouls.length > 0" class="card-ink max-h-64 divide-y divide-ink/7 overflow-y-auto px-4">
        <div v-for="soul in idleSouls" :key="soul.uid" class="flex items-center justify-between gap-2 py-2.5">
          <div class="min-w-0">
            <p class="truncate text-[12px]" :style="{ color: soulColor(soul) }">{{ soulLabel(soul) }}</p>
            <p class="text-[10px] text-ink-faint">凝自「{{ soul.fromName }}」 · {{ soulModText(soul) }}</p>
          </div>
          <!-- 灵魂列表靠持有才渲染,巡页夹具无灵魂时这些钮根本不存在 —— 以前的 28px 尺子碰不到它。
               !py-1 盒高约 21px;统一 !py-2 抬到 35px,与同行其它确认态按钮同高 -->
          <div class="flex shrink-0 gap-1">
            <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="wearSoul(soul.uid)">装配</button>
            <template v-if="pendingDissolveUid !== soul.uid">
              <button class="btn-ghost !px-2 !py-2 !text-[11px] !text-ink-faint" @click="pendingDissolveUid = soul.uid">散去</button>
            </template>
            <template v-else>
              <button class="btn-seal !px-2 !py-2 !text-[11px]" @click="doDissolve(soul.uid)">确 散</button>
              <button class="btn-ghost !px-2 !py-2 !text-[11px]" @click="pendingDissolveUid = null">取 消</button>
            </template>
          </div>
        </div>
      </div>
      <p v-else class="px-4 py-6 text-center text-[11px] leading-relaxed text-ink-faint">
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
      <!-- 代价与余额同屏给出 —— 弹窗盖住页面标题栏(道源在那上),不点开不知道还够不够 -->
      <p class="mb-2 text-[11px] leading-relaxed text-ink-faint">{{ refineCostLine(SOUL_REFINE_COST, formatNum(endgame.daoSource)) }}</p>
      <div v-if="refinable.length > 0" class="card-ink max-h-64 divide-y divide-ink/7 overflow-y-auto px-4">
        <div v-for="row in refinable" :key="row.inst.uid" class="flex items-center justify-between gap-2 py-2.5">
          <div class="min-w-0">
            <p class="truncate text-[12px] text-ink-soft">{{ row.name }}</p>
            <p class="truncate text-[10px] text-ink-faint">
              将凝出
              <span :style="{ color: soulGradeDef(row.gradeRank).color }">{{ soulGradeDef(row.gradeRank).name }}·{{ row.typeName }}</span>
            </p>
          </div>
          <!-- 入炉二步确认:毁的是原器,不按一个「入 炉」就直接交代了 -->
          <button
            v-if="pendingRefineUid !== row.inst.uid"
            class="btn-ghost !px-3 !py-2 !text-[11px]"
            @click="pendingRefineUid = row.inst.uid"
          >
            入 炉
          </button>
          <div v-else class="flex shrink-0 items-center gap-1.5">
            <button class="btn-seal !px-2.5 !py-2 !text-[11px]" @click="doRefine(row.inst.uid)">凝 炼</button>
            <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="pendingRefineUid = null">取 消</button>
          </div>
        </div>
      </div>
      <p v-else class="px-4 py-6 text-center text-[11px] leading-relaxed text-ink-faint">
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
  import { goBack } from '@/router/goBack'
  import { formatNum } from '@/utils/format'
  import { modsText } from '@/ui/statNames'
  import { dissolveNote, refineCostLine } from '@/ui/soulText'
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
  /** 等待二次确认的行(uid);非 null 表示该行已展开确认态 */
  const pendingRefineUid = ref<string | null>(null)
  /** 散去形意同样二步确认:器魂是花道源与一件法器凝出来的,一脚碎掉连个反悔都没有 */
  const pendingDissolveUid = ref<string | null>(null)

  /** 二步确认后真正入炉;成功后收拢确认态 */
  function doRefine(uid: string): void {
    if (refineEquipment(uid)) pendingRefineUid.value = null
    else pendingRefineUid.value = null // 失败(如道源不足)也收起确认态,让玩家重挑
  }

  /** 二步确认后真正散去形意;散去不可逆,成功后收拢确认态 */
  function doDissolve(uid: string): void {
    dissolveSoul(uid)
    pendingDissolveUid.value = null
  }

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
