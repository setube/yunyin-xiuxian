<template>
  <div class="stagger-in px-4 pb-6 pt-4">
    <!-- 页签 -->
    <InkTabs v-model="tab" :tabs="tabs" />

    <!-- 装备:部位槽,点击唤起部位列表 -->
    <template v-if="tab === 'equip'">
      <!-- 装备共鸣:机制是活的,玩家却看不见 —— 同组两件即共鸣,（2/2）亮起 -->
      <div v-if="setRows.length" class="card-ink mt-3 px-4 py-2.5">
        <p class="text-[10px] text-ink-faint">装备共鸣(同组两件即共鸣,机制不叠数值)</p>
        <p v-for="s in setRows" :key="s.def.id" class="mt-1 flex items-center gap-2 text-[11px]">
          <span class="font-kai shrink-0" :class="s.active ? 'text-jade' : 'text-ink-soft'">{{ s.def.name }}</span>
          <span class="tabular shrink-0" :class="s.active ? 'text-jade' : 'text-ink-faint'">{{ s.count }}/{{ s.def.required }}</span>
          <span class="min-w-0 grow text-[10px] leading-relaxed text-ink-faint">{{ s.def.effectDesc }}</span>
          <!--
            玩家反馈「穿套装」:一键穿齐该套已持有的件,已穿更强的则不换。
            触控靶面:纯 10px 文字行高 15px,拇指点不中(layout-check 报 27px < 28);
            负外边距配正内边距同升到 8px,盒高 31px 达标,流中占位仍只 15px 行高(同页收纳/分解同法)。
          -->
          <button class="-my-2 shrink-0 px-1 py-2 text-[10px] text-azure active:opacity-60" @click="onEquipSet(s.def.id)">
            穿齐 →({{ s.preview > 0 ? `换 ${s.preview}` : '已齐' }})
          </button>
        </p>
      </div>
      <div class="mt-3 flex items-center justify-between px-1">
        <span class="text-[11px] text-ink-faint tabular">藏品 {{ inventory.bagItems.length }} · 器灵尘 {{ resources.dust }}</span>
        <span class="flex gap-3">
          <button class="-my-1.5 py-1.5 text-[11px] text-azure active:opacity-60" @click="smartOpen = true">
            收纳{{ settings.smartKeep.enabled ? '·启' : '' }}
          </button>
          <button class="-my-1.5 py-1.5 text-[11px] text-cinnabar active:opacity-60" @click="decomposeOpen = true">分解</button>
        </span>
      </div>
      <div class="mt-2 grid grid-cols-3 gap-2">
        <button
          v-for="row in slotRows"
          :key="row.slot"
          class="card-ink relative flex flex-col items-center gap-1 px-2 py-2.5 active:scale-98"
          :aria-label="`${row.name}${row.upgradeable ? ',行囊里有更强的一件' : ''}`"
          @click="pickerSlot = row.slot"
        >
          <!-- 行囊里有更强的:槽卡上一枚小章 —— 与一键换装同一把 bestEquipFor,不比它看得少 -->
          <span
            v-if="row.upgradeable"
            role="img"
            :aria-label="`${row.name}栏,行囊里有更强的一件`"
            class="absolute right-1 top-1 rounded-sm bg-gold-ink/20 px-1 font-kai text-[8px] leading-[12px] text-gold-ink"
          >可换</span>
          <span class="text-[9px] text-ink-faint">
            {{ row.name }}
            <template v-if="row.stock">· {{ row.stock }}</template>
          </span>
          <template v-if="row.item && row.template">
            <GameIcon :name="row.template.icon" :size="16" :style="{ color: qualityDef(row.item.quality).color }" />
            <span class="w-full truncate text-center font-kai text-[10px]" :style="{ color: qualityDef(row.item.quality).color }">
              {{ row.template.name }}
              <template v-if="row.item.level > 0">+{{ row.item.level }}</template>
              <template v-if="row.item.note">·{{ row.item.note }}</template>
            </span>
          </template>
          <template v-else>
            <span class="grid h-4 w-4 place-items-center text-ink-faint">·</span>
            <span class="text-[10px] text-ink-faint">空悬</span>
          </template>
        </button>
      </div>
      <!-- 角上那枚「可换」得有人解释:新玩家看见金点子,该知道它是行囊里有更强的牌子 -->
      <p v-if="hasUpgradeableSlot" class="text-center text-[9px] text-ink-faint">
        角上点金 = 行囊里有更强的候补,点开该槽即可换上
      </p>
      <p class="mt-2 text-center text-[10px] text-ink-faint">点击部位查看候选,行囊满时新掉落自动折作器灵尘</p>
      <!-- 玩家反馈「一键装备最高阶级品质装备快捷键」:每槽换上当前最强,已是则不动 -->
      <!-- 点下去会动几件,先给个数:与结算同一把 bestEquipFor;一件不换时明说「已是最强」 -->
      <button class="btn-ghost mt-2 w-full !py-1.5 !text-[11px]" @click="onEquipAllBest">
        一键 · 各部位换上当前最强{{ bestSwapPreview }}
      </button>
      <!--
        空一身:与一键换装成对的反向出口 —— 已佩戴的件不参加分解/收纳,
        想清一口袋破烂,得先把身上这九格脱干净。只脱不毁,件全回行囊
      -->
      <button
        v-if="equippedCount > 0"
        class="btn-ghost mt-2 w-full !py-1.5 !text-[11px] !text-ink-faint"
        @click="onUnequipAll"
      >空一身 · 卸下全部({{ equippedCount }})</button>

      <!-- 全部藏品(含佩戴中):部位槽之下的完整清单 -->
      <div v-if="allItems.length" class="mt-4">
        <SectionTitle title="全部藏品" :hint="`${allItems.length} 件 · 行囊 ${inventory.bagItems.length}/${BAG_CAPACITY}`" />
        <!-- 方格背包:五列格子 + 空槽占位,一眼看出还剩多少地方 -->
        <div class="mt-2 grid grid-cols-5 gap-1.5">
          <EquipmentCard v-for="row in allItems" :key="row.item.uid" :item="row.item" :equipped="row.equipped" @open="openDetail" />
        </div>
      </div>
      <p v-else class="mt-8 text-center text-[12px] text-ink-faint">行囊空空,去历练中寻些机缘吧</p>
    </template>

    <!-- 丹药 -->
    <template v-else-if="tab === 'pill'">
      <!-- 开炉炼丹:入口置顶,点开弹窗 -->
      <button
        class="card-ink mt-3 flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-98"
        @click="craftOpen = true"
      >
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cinnabar/85 font-kai text-[19px] seal-face">炉</span>
        <span class="min-w-0 flex-1">
          <span class="block font-kai text-[14px] tracking-widest text-ink">开炉炼丹</span>
          <span class="block truncate text-[10px] leading-relaxed text-ink-faint">
            {{ recipes.length > 0 ? `已知丹方 ${recipes.length} 种 · ${HERB_GRADE_SHORT[herbGrade]}灵草×${formatNum(resources.herbOf(herbGrade))}` : '尚不知任何丹方' }}
          </span>
        </span>
        <span class="shrink-0 text-[12px] text-ink-faint">›</span>
      </button>

      <!-- 丹匣:格子只给图标与名号,详情看弹窗 -->
      <div v-if="pillRows.length" class="mt-3 grid grid-cols-4 gap-1.5">
        <button
          v-for="row in pillRows"
          :key="row.def!.id"
          class="relative aspect-square rounded-md border transition-transform active:scale-98"
          :style="{ borderColor: tint(pillQualityColor(row.def!), 0.33), background: tint(pillQualityColor(row.def!), 0.06) }"
          @click="pillDetail = row.def!.id"
        >
          <span class="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1">
            <GameIcon :name="row.def!.icon" :size="20" :style="{ color: pillQualityColor(row.def!) }" />
            <span class="w-full truncate text-center text-[9px] leading-tight" :style="{ color: pillQualityColor(row.def!) }">
              {{ row.def!.name }}
            </span>
          </span>
          <span class="absolute bottom-0.5 right-1 text-[9px] leading-none text-ink-soft tabular">×{{ row.count }}</span>
        </button>
      </div>
      <p v-else class="mt-10 text-center text-[12px] text-ink-faint">
        丹匣空空
        <br />
        <span class="text-[11px]">丹药多出于历练掉落、途中际遇与开炉炼丹</span>
      </p>
    </template>

    <!-- 材料 -->
    <template v-else-if="tab === 'material'">
      <div class="mt-3 grid grid-cols-4 gap-1.5">
        <button
          v-for="m in materialGrid"
          :key="m.key"
          class="relative aspect-square rounded-md border border-ink/15 bg-ink/[0.03] transition-transform active:scale-98"
          @click="materialDetail = m.key"
        >
          <span class="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1">
            <GameIcon :name="m.icon" :size="20" :class="m.color" />
            <span class="w-full truncate text-center text-[9px] leading-tight text-ink-soft">{{ m.name }}</span>
          </span>
          <span class="absolute bottom-0.5 right-1 text-[9px] leading-none text-ink-soft tabular">{{ m.display }}</span>
        </button>
      </div>
    </template>

    <!-- 法宝(面板本体在 components/inventory/ArtifactPanel.vue) -->
    <template v-else>
      <ArtifactPanel />
    </template>

    <!-- 丹药详情 -->
    <BaseModal :open="currentPill !== null" :title="currentPill?.def?.name ?? ''" @close="pillDetail = null">
      <template v-if="currentPill?.def">
        <div class="flex items-center gap-3">
          <span
            class="grid h-12 w-12 shrink-0 place-items-center rounded-md"
            :style="{ color: pillQualityColor(currentPill.def), background: tint(pillQualityColor(currentPill.def), 0.08) }"
          >
            <GameIcon :name="currentPill.def.icon" :size="24" />
          </span>
          <div class="min-w-0">
            <p class="text-[11px]" :style="{ color: pillQualityColor(currentPill.def) }">
              {{ pillQualityName(currentPill.def) }}
            </p>
            <p class="text-[11px] text-ink-faint tabular">持有 ×{{ currentPill.count }}</p>
          </div>
        </div>
        <p class="mt-3 text-[12px] leading-relaxed text-ink-soft">{{ currentPill.def.desc }}</p>
        <!-- 效果与来路:丹药卡片此前只有风味与数量,服下去会怎样一个字都没说 -->
        <p class="mt-2 whitespace-pre-line text-[12px] leading-relaxed text-azure">{{ pillFuncText(currentPill.def) }}</p>
        <p v-if="pillMasteryText(currentPill.def.id)" class="mt-1 text-[11px] text-ink-faint">
          {{ pillMasteryText(currentPill.def.id) }}
        </p>
        <!--
          服前把顶满/将顶摊明(与 usePill 的 buffOverflowOf 同一判据):
          顶满再服 = 白费,贴着上限只续到顶 —— 决策就地可见,不等服后 toast。
        -->
        <p
          v-if="currentPillHint"
          class="mt-1 text-[11px]"
          :class="currentPillHint.tone === 'cinnabar' ? 'text-cinnabar' : 'text-amber-ink'"
        >
          {{ currentPillHint.text }}
        </p>
      </template>
      <template #footer>
        <div class="grid grid-cols-2 gap-2">
          <!--
            药力顶满时再服会真·白吃一枚(usePill 照扣库存,只把「白费」放进服后 toast)。
            与修行快捷卡对同一个 buffOverflowOf 判据相反:那里顶满置灰,这里此前仍可点。
            不可行就置灰,拦因已由 currentPillHint 就地摊开。
          -->
          <button
            class="btn-seal"
            :disabled="currentPillOverflow === 'full'"
            @click="onUsePill()"
          >
            服 用
          </button>
          <!-- 批量吃丹:存量够几枚就连服几枚。文案把「×5」改成真数 —— 只剩 2 枚还挂着 ×5,
               结算却吃到没有就停,界面说的与做的对不上;只够 1 枚时连服没有意义,直接不摆。
               增益丹每次只服 1 枚(药力顶格,多服白费),不摆「连服」免得点了没反应 -->
          <button
            v-if="(currentPill?.count ?? 0) >= 2 && currentPill?.def?.kind !== 'buff'"
            class="btn-ghost"
            @click="onUsePillBatch()"
          >
            连服 ×{{ Math.min(5, currentPill?.count ?? 0) }}
          </button>
        </div>
      </template>
    </BaseModal>

    <!-- 材料详情 -->
    <BaseModal :open="currentMaterial !== null" :title="currentMaterial?.name ?? ''" @close="materialDetail = null">
      <template v-if="currentMaterial">
        <div class="flex items-center gap-3">
          <span class="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-ink/5">
            <GameIcon :name="currentMaterial.icon" :size="24" :class="currentMaterial.color" />
          </span>
          <div class="min-w-0">
            <p class="font-kai text-[15px] text-ink tabular">{{ currentMaterial.full }}</p>
            <p class="text-[10px] text-ink-faint">现有</p>
          </div>
        </div>
        <p class="mt-3 text-[12px] leading-relaxed text-ink-soft">{{ currentMaterial.desc }}</p>
      </template>
      <template #footer>
        <button class="btn-seal w-full" @click="materialDetail = null">收 起</button>
      </template>
    </BaseModal>

    <BrewingDialog :open="craftOpen" @close="craftOpen = false" />

    <SlotCandidatesDialog :slot-name="pickerSlot" @close="pickerSlot = null" />

    <DismantleDialog :decompose-open="decomposeOpen" :smart-open="smartOpen" @close-decompose="decomposeOpen = false" @close-smart="smartOpen = false" />
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { useInventoryStore } from '@/stores/inventory'
  import { useResourcesStore } from '@/stores/resources'
  import { useUiStore } from '@/stores/ui'
  import { useSettingsStore } from '@/stores/settings'
  import { useCultivationStore } from '@/stores/cultivation'
  import { qualityDef } from '@/data/qualities'
  import { pillDef, pillQualityColor, pillQualityName, pillRank } from '@/data/pills'
  import { HERB_GRADE_SHORT } from '@/data/herbGrades'
  import { herbStashText } from '@/ui/herbText'
  import { pillFuncText } from '@/ui/itemText'
  import { EQUIP_SLOT_NAMES, EQUIP_SLOTS, equipmentTemplate } from '@/data/equipment'
  import { BAG_CAPACITY } from '@/data/constants'
  import { usePill, usePillBatch } from '@/core/pillService'
  import { buffOverflowOf, type BuffOverflow } from '@/core/buffCap'

  import { equipSetDef, setCounts, type EquipSetDef } from '@/core/equipSet'
  import { bestEquipFor, equipAllBest, equipSetCombo, equipSetPreview, unequipAllEquipped } from '@/core/equipBest'
  import { useLoreStore } from '@/stores/lore'
  import { useBrewing } from '@/composables/useBrewing'
  import { useWallNow } from '@/composables/useWallClock'

  import { formatGN, formatNum } from '@/utils/format'
  import { tint } from '@/utils/colorToken'
  import type { EquipSlot } from '@/types'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import ArtifactPanel from '@/components/inventory/ArtifactPanel.vue'
  import BrewingDialog from '@/components/inventory/BrewingDialog.vue'
  import SlotCandidatesDialog from '@/components/inventory/SlotCandidatesDialog.vue'
  import DismantleDialog from '@/components/inventory/DismantleDialog.vue'
  import EquipmentCard from '@/components/equipment/EquipmentCard.vue'

  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  // 开炉弹窗(BrewingDialog)与入口卡同读一份丹方账,避免两处各算一遍
  const { herbGrade, recipes } = useBrewing()
  const ui = useUiStore()
  const settings = useSettingsStore()
  const lore = useLoreStore()
  const cultivation = useCultivationStore()
  // 丹药详情里的「顶满」判据随墙钟走:药效到期,置灰的「服 用」要自己亮回来。
  // 用墙钟而非 useNow:暂停引擎(重置 / 导入确认)时,药效本身仍按墙钟走。
  const now = useWallNow()

  type Tab = 'equip' | 'pill' | 'material' | 'artifact'
  const tab = ref<Tab>('equip')

  // 修行志的「去办」会用 ?tab=pill 这类深链进来;只在合法签里挑,乱掷的忽略
  const route = useRoute()
  const TAB_IDS: Tab[] = ['equip', 'pill', 'material', 'artifact']
  const deepTab = route.query.tab as Tab | undefined
  if (deepTab && (TAB_IDS as string[]).includes(deepTab)) tab.value = deepTab

  const TABS: { id: Tab; label: string }[] = [
    { id: 'equip', label: '装备' },
    { id: 'pill', label: '丹药' },
    { id: 'material', label: '材料' },
    { id: 'artifact', label: '法宝' }
  ]

  // ---- 装备:部位槽 + 部位候选列表 ----
  const SLOTS = EQUIP_SLOTS
  const pickerSlot = ref<EquipSlot | null>(null)

  /** 装备共鸣:已装备件里的同组计数(未满也列出来,让玩家知道差几件) */
  const setRows = computed(() => {
    const counts = setCounts(inventory.equippedItems)
    return [...counts.entries()]
      .map(([id, count]) => {
        const def = equipSetDef(id)
        if (!def) return null
        // 干跑:这套现在会换几件(与穿齐同一份取舍),按钮先报数
        return { def, count, active: count >= def.required, preview: equipSetPreview(id) }
      })
      .filter((row): row is { def: EquipSetDef; count: number; active: boolean; preview: number } => row !== null)
      .sort((a, b) => Number(b.active) - Number(a.active) || b.count - a.count)
  })

  /** 已佩戴的槽位数 —— 「空一身」按钮的计数(身上没件时不出现,免得摆个 0 的按钮) */
  const equippedCount = computed(() => SLOTS.filter(slot => inventory.equipped[slot]).length)
  /** 至少一个槽位有更强候补时,槽卡下方的图例才值得出现 */
  const hasUpgradeableSlot = computed(() => slotRows.value.some(r => r.upgradeable))

  const slotRows = computed(() =>
    SLOTS.map(slot => {
      const uid = inventory.equipped[slot]
      const item = uid ? inventory.findItem(uid) : undefined
      // 「行囊里还有更强的」—— 与一键换装同一把 bestEquipFor,槽卡不该比它看得少
      const best = bestEquipFor(slot)
      return {
        slot,
        name: EQUIP_SLOT_NAMES[slot],
        item,
        template: item ? equipmentTemplate(item.templateId) : undefined,
        stock: inventory.bagItems.filter(it => equipmentTemplate(it.templateId)?.slot === slot).length,
        upgradeable: !!best && best.uid !== uid
      }
    })
  )

  /** 全部藏品(含佩戴中),佩戴中的置顶,其余按品质/层级降序 */
  const allItems = computed(() =>
    inventory.items
      .map(item => ({ item, equipped: inventory.equippedUids.has(item.uid) }))
      .sort((a, b) => {
        if (a.equipped !== b.equipped) return Number(b.equipped) - Number(a.equipped)
        const dq = qualityDef(b.item.quality).rank - qualityDef(a.item.quality).rank
        return dq !== 0 ? dq : b.item.tier - a.item.tier
      })
  )

  function openDetail(uid: string): void {
    ui.equipDetailUid = uid
  }

  const pillRows = computed(() =>
    Object.entries(inventory.pills)
      .map(([id, count]) => ({ def: pillDef(id), count }))
      .filter(x => x.def !== undefined && x.count > 0)
      .sort((a, b) => pillRank(b.def!) - pillRank(a.def!))
  )

  // 闲置在「装备」页时,有一味现在能开炉就该在「丹药」签上亮圆点(与结算同源,不必进页)
  const tabs = computed<readonly { id: Tab; label: string; dot?: boolean }[]>(() =>
    TABS.map(t => (t.id === 'pill' ? { ...t, dot: recipes.value.some(r => r.plan.rounds > 0) } : t))
  )
  /** 逐品灵草存量(仅列持有>0,大数走 formatNum) —— 总量展示的真相在细节里,不在一个总和 */
  const herbStash = computed(() => herbStashText(g => resources.herbOf(g), formatNum))

  /** 材料行:灵草的量是「当前品」的可炼数,`full` 留给详情弹窗逐品陈列(其它料本就单标量) */
  const materialRows = computed(() => [
    { icon: 'leaf', name: `${HERB_GRADE_SHORT[herbGrade.value]}灵草`, desc: '炼丹的根本(格子数是当前品,逐品见详情)', value: resources.herbOf(herbGrade.value), full: `逐品:${herbStash.value}` },
    { icon: 'mountain', name: '玄铁', desc: '筑造与炼器之材', value: resources.ore, full: String(resources.ore) },
    { icon: 'scroll', name: '功法残页', desc: '集残页可参悟功法', value: resources.page, full: String(resources.page) },
    { icon: 'sparkles', name: '器灵尘', desc: '强化装备的灵性之尘', value: resources.dust, full: String(resources.dust) },
    { icon: 'book', name: '悟道点', desc: '功法进修与法宝炼化所需', value: resources.wudao, full: String(resources.wudao) }
  ])

  /** 材料格子:含灵石一并展示,数量走 formatNum 免得格子被长数字撑破 */
  const materialGrid = computed(() => [
    ...materialRows.value.map(m => ({
      key: m.name,
      icon: m.icon,
      name: m.name,
      desc: m.desc,
      color: 'text-ink-soft',
      display: formatNum(m.value),
      full: m.full
    })),
    {
      key: '灵石',
      icon: 'gem',
      name: '灵石',
      desc: '修行界的通行货币',
      color: 'text-gold-ink',
      display: formatGN(resources.spiritStone),
      full: formatGN(resources.spiritStone)
    }
  ])

  const materialDetail = ref<string | null>(null)
  const currentMaterial = computed(() => materialGrid.value.find(m => m.key === materialDetail.value) ?? null)

  const pillDetail = ref<string | null>(null)
  const currentPill = computed(() => (pillDetail.value ? (pillRows.value.find(r => r.def?.id === pillDetail.value) ?? null) : null))

  /**
   * 增益丹服前判定(与 usePill 同口径 buffOverflowOf):
   * full = 顶满再服即白费,partial = 贴着上限只续到顶。
   * 「服 用」在 full 态一并置灰;拦因由 currentPillHint 就地摊开。
   */
  const currentPillOverflow = computed<BuffOverflow | null>(() => {
    const def = currentPill.value?.def
    if (!def || def.kind !== 'buff' || !def.buffId) return null
    return buffOverflowOf(cultivation.buffs, def.buffId, now.value)
  })

  const currentPillHint = computed<{ text: string; tone: 'cinnabar' | 'amber' } | null>(() => {
    const overflow = currentPillOverflow.value
    if (overflow === 'full') return { text: '药力已顶满——这一颗将白费', tone: 'cinnabar' }
    if (overflow === 'partial') return { text: '药力将触上限——这一颗只续到顶', tone: 'amber' }
    return null
  })

  const craftOpen = ref(false)
  const decomposeOpen = ref(false)
  const smartOpen = ref(false)

  /** 服用后若已吃完最后一枚,顺手关掉详情——否则弹窗会停在一个不存在的丹药上 */
  function onUsePill(): void {
    const id = pillDetail.value
    if (!id) return
    usePill(id)
    if (!pillRows.value.some(r => r.def?.id === id)) pillDetail.value = null
  }

  /** 批量服丹(连服 ×5):存量够几枚连吃几枚,吃完顺手关详情 */
  function onUsePillBatch(): void {
    const id = pillDetail.value
    if (!id) return
    usePillBatch(id, 5)
    if (!pillRows.value.some(r => r.def?.id === id)) pillDetail.value = null
  }

  /** 一键换装:每槽换上当前最强,报一句换了多少 */
  function onEquipAllBest(): void {
    const changed = equipAllBest()
    ui.toast(changed > 0 ? `已自动换上 ${changed} 件当下最能打的(按真实战力挑)` : '已是更能打的一身', changed > 0 ? 'success' : 'info')
  }
  /** 点前的预告:还有几个部位会真的换(与 onEquipAllBest 同一把 bestEquipFor 判据) */
  const bestSwapPreview = computed(() => {
    const n = EQUIP_SLOTS.filter(slot => {
      const best = bestEquipFor(slot)
      return !!best && inventory.equipped[slot] !== best.uid
    }).length
    return n > 0 ? `(将换 ${n} 件)` : '(已是最强)'
  })

  /** 空一身:卸下全部已佩戴,件回到行囊 —— 以便清理/换血(只脱不毁) */
  function onUnequipAll(): void {
    const removed = unequipAllEquipped()
    ui.toast(removed > 0 ? `已卸下 ${removed} 件,尽数回到行囊` : '身上已无佩戴', removed > 0 ? 'success' : 'info')
  }

  /** 一键穿齐套装:换上该套已持有的件,已穿更强的则不换 */
  function onEquipSet(setId: string): void {
    const changed = equipSetCombo(setId)
    ui.toast(changed > 0 ? `穿齐该套:换上 ${changed} 件(更强的没动)` : '该套已穿齐,或没有更合适的件', changed > 0 ? 'success' : 'info')
  }

  /**
   * 丹方读到几分熟 —— 与图鉴的「已得方/通晓」同一份状态(lore.recipeLore)。
   * 无方之丹没有这一行:它本就炼不出来(见 ui/itemText.pillSourceText)。
   */
  function pillMasteryText(id: string): string {
    const def = pillDef(id)
    if (!def?.recipe) return ''
    const m = lore.recipeMastery(id)
    if (m <= 0) return '此方尚未到手 —— 去藏经阁翻书,或向师长讨教'
    if (m >= 1) return '此方已通晓:火候节点烂熟于心'
    return `此方已得,熟练 ${Math.round(m * 100)}% —— 多多开炉、研读数番可增熟稔`
  }

</script>
