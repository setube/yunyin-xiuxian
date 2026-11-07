<template>
  <div class="stagger-in px-4 pb-6 pt-4">
    <InkTabs v-model="tab" :tabs="tabs" />

    <template v-if="tab === 'equip'">
      <!-- 小标题不写件数(有三件套),件数只走逐行 N/所需 -->
      <div v-if="setRows.length" class="card-ink mt-3 px-4 py-2.5">
        <p class="text-[10px] text-ink-faint">装备共鸣</p>
        <!--
          flex-wrap 不可去:这一行有套纹、套名、N/M、说明、按钮五样,
          200% 缩放下(视口约 195)**实测**右缘冲到 213,越界 18px。
          窄时按钮折到下一行,不挤说明。
        -->
        <p v-for="s in setRows" :key="s.def.id" class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <!-- 套纹:与装备格那枚同源(见 ui/setMark);六套各一枚,机制另有其色 -->
          <span
            v-if="s.mark"
            class="set-crest shrink-0"
            :class="`set-crest--${s.mark.crest} set-crest--${s.mark.mechanism}`"
            aria-hidden="true"
          />
          <span class="font-kai shrink-0" :class="s.active ? 'text-jade' : 'text-ink-soft'">{{ s.def.name }}</span>
          <span class="tabular shrink-0" :class="s.active ? 'text-jade' : 'text-ink-faint'">{{ s.count }}/{{ s.def.required }}</span>
          <span class="min-w-0 grow text-[10px] leading-relaxed text-ink-faint">{{ s.def.effectDesc }}</span>
          <!--
            触控靶面:负外边距配正内边距,盒高 31px 过 layout-check(≥28),流中仍占 15px 行高;同页收纳/分解同法。
            无可换时置灰,不让人点一颗什么都不会发生的钮(AGENTS.md「禁用即给原因」);
            置灰态的字色自己写:btn-ghost 的禁用底色这里没有,继承下来会是可点态的 azure。
            禁用态只压字色不压透明度 —— 那行「无可换」正是拒因,压到 60% 就读不出。
          -->
          <button
            class="-my-2 shrink-0 px-1 py-2 text-[10px] text-azure active:opacity-60 disabled:text-ink-faint"
            :disabled="s.preview <= 0"
            @click="onEquipSet(s.def.id)"
          >
            穿齐 →({{ s.preview > 0 ? `换 ${s.preview}` : '无可换' }})
          </button>
        </p>
      </div>
      <div class="mt-3 flex items-center justify-between px-1">
        <span class="text-[11px] text-ink-faint tabular">行囊 {{ inventory.bagItems.length }} · 器灵尘 {{ resources.dust }}</span>
        <span class="flex gap-3">
          <button class="-my-1.5 py-1.5 text-[11px] text-azure active:opacity-60" @click="smartOpen = true">
            收纳{{ settings.smartKeep.enabled ? '·启' : '' }}
          </button>
          <button class="-mx-1 -my-1.5 px-1 py-1.5 text-[11px] text-cinnabar active:opacity-60" @click="decomposeOpen = true">分解</button>
        </span>
      </div>
      <div class="mt-2 grid grid-cols-3 gap-2">
        <button
          v-for="row in slotRows"
          :key="row.slot"
          class="card-ink relative flex flex-col items-center gap-1 px-2 py-2.5 active:scale-98"
          :aria-label="`${row.name}${row.upgradeable ? ',可换' : ''}`"
          @click="pickerSlot = row.slot"
        >
          <span
            v-if="row.upgradeable"
            role="img"
            aria-label="可换"
            class="absolute right-1 top-1 rounded-sm border border-gold-ink/50 bg-gold-ink/20 px-1 font-kai text-[8px] leading-[12px] text-ink"
          >可换</span>
          <span class="text-[9px] text-ink-faint">
            {{ row.name }}
            <template v-if="row.stock">· {{ row.stock }}</template>
          </span>
          <template v-if="row.item && row.template">
            <GameIcon :name="row.template.icon" :size="16" :style="{ color: qualityDef(row.item.quality).color }" />
            <span class="w-full truncate text-center font-kai text-[10px]" :style="{ color: qualityTextColor(row.item.quality) }">
              {{ row.template.name }}
              <template v-if="row.item.level > 0">+{{ row.item.level }}</template>
              <template v-if="row.item.note">·{{ row.item.note }}</template>
            </span>
          </template>
          <template v-else>
            <span class="grid h-4 w-4 place-items-center text-ink-faint">·</span>
            <span class="text-[10px] text-ink-faint">未装备</span>
          </template>
        </button>
      </div>
      <button class="btn-ghost mt-2 w-full !py-1.5 !text-[11px]" @click="onEquipAllBest">
        一键换装{{ bestSwapPreview }}
      </button>
      <button
        v-if="equippedCount > 0"
        class="btn-ghost mt-2 w-full !py-1.5 !text-[11px] !text-ink-faint"
        @click="onUnequipAll"
      >卸下全部 {{ equippedCount }}/{{ SLOTS.length }} 格</button>

      <!-- hint「满包掉落化尘」:不可逆后果(见 core/loot),事前只此一处 -->
      <div v-if="allItems.length" class="mt-4">
        <SectionTitle title="全部藏品" :hint="`${allItems.length} 件 · 行囊 ${inventory.bagItems.length}/${BAG_CAPACITY} · 满包掉落化尘`" />
        <div class="mt-2 grid grid-cols-5 gap-1.5">
          <EquipmentCard v-for="row in allItems" :key="row.item.uid" :item="row.item" :equipped="row.equipped" @open="openDetail" />
        </div>
      </div>
      <!-- 空态与名号/灵兽册同一套:哑印 + 楷体标签,不再只是一行灰字 -->
      <p v-else class="mt-12 text-center">
        <span class="empty-seal" aria-hidden="true">器</span>
        <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">暂无藏品</span>
      </p>
    </template>

    <template v-else-if="tab === 'pill'">
      <button
        class="card-ink mt-3 flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-98"
        @click="craftOpen = true"
      >
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cinnabar font-kai text-[19px] seal-face">炉</span>
        <span class="min-w-0 flex-1">
          <span class="block font-kai text-[14px] tracking-widest text-ink">开炉炼丹</span>
          <span class="block truncate text-[10px] leading-relaxed text-ink-faint">
            {{ recipes.length > 0 ? `已知丹方 ${recipes.length} 种 · ${HERB_GRADE_SHORT[herbGrade]}灵草×${formatNum(resources.herbOf(herbGrade))}` : '暂无丹方' }}
          </span>
        </span>
        <span class="shrink-0 text-[12px] text-ink-faint">›</span>
      </button>

      <div v-if="pillRows.length" class="mt-3 grid grid-cols-4 gap-1.5">
        <button
          v-for="row in pillRows"
          :key="row.def.id"
          class="relative aspect-square rounded-md border transition-transform active:scale-98"
          :style="row.style"
          @click="pillDetail = row.def.id"
        >
          <QualityAura :rank="row.rank" :tone="row.tone" compact />
          <!-- 最上档质感:四角御纹 + 流光(丹药走 rank 入口,道品 rank 9 同样享有) -->
          <span v-if="row.luster" class="luster-cornice luster-cornice--tile" aria-hidden="true" />
          <span v-if="row.luster" class="luster-sheen" aria-hidden="true" />
          <!-- role="img":角章只有一个字,读屏要念的是「天品档」;裸 span 属 generic,不接可访问名 -->
          <span
            v-if="row.rare"
            role="img"
            class="absolute right-0.5 top-0.5 rounded-[3px] border px-[3px] py-px font-kai text-[9px] leading-none text-ink"
            :style="{ borderColor: tint(row.tone, 0.45), background: tint(row.tone, 0.12) }"
            :aria-label="`${row.qualityName}档`"
          >{{ row.qualityName.charAt(0) }}</span>
          <span class="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1">
            <GameIcon :name="row.def.icon" :size="20" :style="{ color: row.tone }" />
            <span class="w-full truncate text-center text-[9px] leading-tight" :style="{ color: row.tone }">
              {{ row.def.name }}
            </span>
          </span>
          <!-- 生效中:左下一枚小点,与右下的数量分开,不抢名字与图标 -->
          <span
            v-if="row.active"
            class="pill-active-dot absolute bottom-1 left-1"
            role="img"
            aria-label="生效中"
            title="生效中"
          />
          <span class="absolute bottom-0.5 right-1 text-[9px] leading-none text-ink-soft tabular">×{{ row.count }}</span>
        </button>
      </div>
      <p v-else class="mt-12 text-center">
        <span class="empty-seal" aria-hidden="true">丹</span>
        <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">暂无丹药</span>
      </p>
    </template>

    <template v-else-if="tab === 'material'">
      <div class="mt-3 grid grid-cols-4 gap-1.5">
        <button
          v-for="m in materialGrid"
          :key="m.key"
          class="relative aspect-square rounded-md border transition-transform active:scale-98"
          :class="m.herbGrade ? '' : 'border-ink/15 bg-ink/[0.03]'"
          :style="m.herbGrade ? m.tierStyle : undefined"
          @click="materialDetail = m.key"
        >
          <!-- 灵草按品阶上形制,与装备/丹药同一套(见 ui/herbQuality) -->
          <QualityAura v-if="m.herbGrade" :rank="herbQualityRank(m.herbGrade)" :tone="herbQualityTone(m.herbGrade)" compact />
          <span v-if="m.luster" class="luster-cornice luster-cornice--tile" aria-hidden="true" />
          <span v-if="m.luster" class="luster-sheen" aria-hidden="true" />
          <span class="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1">
            <GameIcon :name="m.icon" :size="20" :class="m.color" />
            <span class="w-full truncate text-center text-[9px] leading-tight" :class="m.herbGrade ? '' : 'text-ink-soft'" :style="m.herbGrade ? { color: herbQualityTextColor(m.herbGrade) } : undefined">{{ m.name }}</span>
          </span>
          <span class="absolute bottom-0.5 right-1 text-[9px] leading-none text-ink-soft tabular">{{ m.display }}</span>
        </button>
      </div>
    </template>

    <template v-else>
      <ArtifactPanel />
    </template>

    <BaseModal
      :open="currentPill !== null"
      :title="currentPill?.def?.name ?? ''"
      :panel-class="pillLuster ? 'luster-frame' : undefined"
      :title-class="pillLuster ? 'luster-title' : undefined"
      @close="pillDetail = null"
    >
      <!-- 最上档头饰:骑缝印(与装备详情同一套,见 ui/luster) -->
      <span v-if="pillLuster" class="luster-crown" aria-hidden="true">{{ pillLuster.label }}</span>
      <template v-if="currentPill?.def">
        <div class="flex items-center gap-3">
          <span
            class="grid h-12 w-12 shrink-0 place-items-center rounded-md"
            :style="{ color: currentPill.tone, background: tint(currentPill.tone, 0.08) }"
          >
            <GameIcon :name="currentPill.def.icon" :size="24" />
          </span>
          <div class="min-w-0">
            <p class="text-[11px]" :style="{ color: currentPill.tone }">{{ currentPill.qualityName }}</p>
            <p class="text-[11px] text-ink-faint tabular">持有 ×{{ currentPill.count }}</p>
          </div>
        </div>
        <p class="mt-3 text-[12px] leading-relaxed text-ink-soft">{{ currentPill.def.desc }}</p>
        <p class="mt-2 whitespace-pre-line text-[12px] leading-relaxed text-azure">{{ pillFuncText(currentPill.def) }}</p>
        <p v-if="pillMasteryText(currentPill.def.id)" class="mt-1 text-[11px] text-ink-faint">
          {{ pillMasteryText(currentPill.def.id) }}
        </p>
        <p
          v-if="currentPillHint"
          class="mt-1 text-[11px]"
          :class="currentPillHint.tone === 'cinnabar' ? 'text-cinnabar' : 'text-amber-ink'"
        >
          {{ currentPillHint.text }}
        </p>
      </template>
      <template #footer>
        <!--
          「服 用」在增益丹的弹窗里是**唯一**一颗(连服只给非增益丹)——
          而它此前待在 grid-cols-2 里,只占左半栏,右边空着一大块。
          故只有一颗时让它跨满两栏。
        -->
        <div class="grid grid-cols-2 gap-2">
          <button
            class="btn-seal"
            :class="currentPill?.def?.kind === 'buff' ? 'col-span-2' : ''"
            :disabled="currentPillOverflow === 'full'"
            @click="onUsePill()"
          >
            服 用
          </button>
          <!-- 增益丹每次只服 1 枚(药力顶格),不摆连服 -->
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

    <BaseModal
      :open="currentMaterial !== null"
      :title="currentMaterial?.name ?? ''"
      :panel-class="currentMaterial?.luster ? 'luster-frame' : undefined"
      :title-class="currentMaterial?.luster ? 'luster-title' : undefined"
      @close="materialDetail = null"
    >
      <!-- 最上档头饰:骑缝印(与装备、丹药详情同一套,见 ui/luster) -->
      <span v-if="currentMaterial?.herbGrade && currentMaterial.luster" class="luster-crown" aria-hidden="true">
        {{ currentMaterial.name.charAt(0) }}
      </span>
      <template v-if="currentMaterial">
        <div class="flex items-center gap-3">
          <span
            class="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-ink/5"
            :style="currentMaterial.herbGrade ? { color: herbQualityTone(currentMaterial.herbGrade) } : undefined"
          >
            <GameIcon :name="currentMaterial.icon" :size="24" :class="currentMaterial.herbGrade ? '' : currentMaterial.color" />
          </span>
          <div class="min-w-0">
            <p
              class="font-kai text-[15px] tabular"
              :style="currentMaterial.herbGrade ? { color: herbQualityTextColor(currentMaterial.herbGrade) } : undefined"
              :class="currentMaterial.herbGrade ? '' : 'text-ink'"
            >
              {{ currentMaterial.herbGrade ? `${currentMaterial.display} 株` : currentMaterial.full }}
            </p>
            <p class="text-[10px] text-ink-faint">持有</p>
          </div>
        </div>
        <p class="mt-3 text-[12px] leading-relaxed text-ink-soft">{{ currentMaterial.desc }}</p>
        <!-- 五品不可互换:一格只讲一品,其余品在材料页各占一格 -->
        <p v-if="currentMaterial.herbGrade" class="mt-2 text-[11px] leading-relaxed text-ink-faint tabular">
          逐品:{{ herbStash }}
        </p>
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
  import { qualityDef, qualityTextColor } from '@/data/qualities'
  import { lusterByRank } from '@/ui/luster'
  import { pillDef, pillQualityColor, pillQualityName, pillRank } from '@/data/pills'
  import { HERB_GRADES, HERB_GRADE_SHORT, type HerbGrade } from '@/data/herbGrades'
  import { herbStashText } from '@/ui/herbText'
  import { herbQualityLuster, herbQualityRank, herbQualityTextColor, herbQualityTier, herbQualityTone } from '@/ui/herbQuality'
  import { pillFuncText } from '@/ui/itemText'
  import { EQUIP_SLOT_NAMES, EQUIP_SLOTS, equipmentTemplate } from '@/data/equipment'
  import { BAG_CAPACITY } from '@/data/constants'
  import { usePill, usePillBatch } from '@/core/pillService'
  import { buffOverflowOf, type BuffOverflow } from '@/core/buffCap'

  import { allEquipSets, setCounts } from '@/core/equipSet'
  import { setMark } from '@/ui/setMark'
  import { bestEquipFor, equipAllBest, equipSetCombo, equipSetPreview, unequipAllEquipped } from '@/core/equipBest'
  import { useLoreStore } from '@/stores/lore'
  import { useBrewing } from '@/composables/useBrewing'
  import { useNow } from '@/composables/useNow'

  import { formatGN, formatNum } from '@/utils/format'
  import { tint } from '@/utils/colorToken'
  import { isRareRank, qualityTierByRank } from '@/ui/qualityTier'
  import type { EquipSlot } from '@/types'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import QualityAura from '@/components/common/QualityAura.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import ArtifactPanel from '@/components/inventory/ArtifactPanel.vue'
  import BrewingDialog from '@/components/inventory/BrewingDialog.vue'
  import SlotCandidatesDialog from '@/components/inventory/SlotCandidatesDialog.vue'
  import DismantleDialog from '@/components/inventory/DismantleDialog.vue'
  import EquipmentCard from '@/components/equipment/EquipmentCard.vue'

  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  // 与开炉弹窗(BrewingDialog)同读一份丹方账
  const { herbGrade, recipes } = useBrewing()
  const ui = useUiStore()
  const settings = useSettingsStore()
  const lore = useLoreStore()
  const cultivation = useCultivationStore()
  // 「顶满」判据读游戏时钟(暂停时药效冻住、恢复时顺延 endsAt),不读墙钟
  const now = useNow()

  type Tab = 'equip' | 'pill' | 'material' | 'artifact'
  const tab = ref<Tab>('equip')

  // 深链 ?tab=pill(修行志「去办」);非法签忽略
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

  const SLOTS = EQUIP_SLOTS
  const pickerSlot = ref<EquipSlot | null>(null)

  /**
   * 装备共鸣:六套全表,已戴几件就报几件。
   *
   * 原只列**已戴**的那几套 —— 于是「还有哪些共鸣可凑」只在拿到第一件时才知道,
   * 而共鸣是这套装备唯一的机制卖点(数值之外的另一条线)。
   * 全表列出之后,0/2 那几行本身就是「还差什么」的地图。
   * 次序:已激活的在前,再按件数;同分按登记次序(core 的 SET_DEFS 保序)。
   */
  const setRows = computed(() => {
    const counts = setCounts(inventory.equippedItems)
    return allEquipSets()
      .map(def => {
        const count = counts.get(def.id) ?? 0
        return { def, count, active: count >= def.required, preview: equipSetPreview(def.id), mark: setMark(def.id) }
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || b.count - a.count)
  })

  const equippedCount = computed(() => SLOTS.filter(slot => inventory.equipped[slot]).length)

  const slotRows = computed(() =>
    SLOTS.map(slot => {
      const uid = inventory.equipped[slot]
      const item = uid ? inventory.findItem(uid) : undefined
      // 与一键换装同一把 bestEquipFor
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

  /**
   * 丹匣的行:品阶、字色、浓淡、质感各算一次。
   *
   * 原先一个格子里 `pillQualityColor` 被调 7 次(边框、底色、光环、角章 ×2、图标、名字),
   * `pillRank` 5 次、`tier` 与 `luster` 各 3 次 —— 全是同一次查表。
   * 与 TrialPanel / 功法详情那两处同一种毛病:每帧算好几遍,
   * 而且模板里读不出「这七处说的是同一枚丹药」。
   */
  const pillRows = computed(() =>
    Object.entries(inventory.pills)
      .map(([id, count]) => ({ def: pillDef(id), count }))
      .filter(x => x.def !== undefined && x.count > 0)
      .map(x => {
        const def = x.def!
        const rank = pillRank(def)
        const tone = pillQualityColor(def)
        const tier = qualityTierByRank(rank)
        return {
          def,
          count: x.count,
          rank,
          tone,
          tier,
          luster: lusterByRank(rank),
          rare: isRareRank(rank),
          qualityName: pillQualityName(def),
          /**
           * 生效中:这味增益丹的 buff 还在身上。
           *
           * 丹匣此前看不出哪味正在生效 —— 玩家要翻到「状态」里挨个比对名字,
           * 而服丹时最该知道的就是「这一味还要不要再补」。
           * 判定与详情弹窗的 buffOverflowOf 同一份 buffs 账,不另算。
           */
          active: def.kind === 'buff' && !!def.buffId && cultivation.buffs.some(b => b.defId === def.buffId && b.endsAt > now.value),
          style: { borderColor: tint(tone, tier.border), background: tint(tone, tier.bg) }
        }
      })
      .sort((a, b) => b.rank - a.rank)
  )

  // 丹药签圆点:有一味能开炉(与结算同源)
  const tabs = computed<readonly { id: Tab; label: string; dot?: boolean }[]>(() =>
    TABS.map(t => (t.id === 'pill' ? { ...t, dot: recipes.value.some(r => r.plan.rounds > 0) } : t))
  )
  /** 逐品灵草存量,不报总和 */
  const herbStash = computed(() => herbStashText(g => resources.herbOf(g), formatNum))

  /** 灵草的量取当前品,`full` 留给详情弹窗逐品陈列 */
  const materialRows = computed(() => [
    { icon: 'mountain', name: '玄铁', desc: '筑造与炼器之材', value: resources.ore, full: String(resources.ore) },
    { icon: 'scroll', name: '功法残页', desc: '集残页可参悟功法', value: resources.page, full: String(resources.page) },
    { icon: 'sparkles', name: '器灵尘', desc: '强化装备的灵性之尘', value: resources.dust, full: String(resources.dust) },
    { icon: 'book', name: '悟道点', desc: '功法进修与法宝炼化所需', value: resources.wudao, full: String(resources.wudao) }
  ])

  /**
   * 灵草逐品各占一格:五品不可互换,存量本来就分账,摊成五格才看得见「手里有哪几品」。
   * 当前品恒在(哪怕 0 株),其余品只在持有 >0 时出现 —— 不然每一品都挂一格空位,格子会一直空着四格。
   */
  const herbCells = computed(() => {
    const held = HERB_GRADES.filter(g => g !== herbGrade.value && resources.herbOf(g) > 0)
    return [herbGrade.value, ...held].map(g => ({
      grade: g,
      name: `${HERB_GRADE_SHORT[g]}灵草`,
      count: resources.herbOf(g)
    }))
  })

  /** 含灵石;数量走 formatNum,免得长数字撑破格子 */
  const materialGrid = computed(() => [
    ...herbCells.value.map(h => ({
      key: h.name,
      icon: 'leaf',
      name: h.name,
      desc: '炼丹的根本',
      color: 'text-ink-soft',
      display: formatNum(h.count),
      full: `逐品:${herbStash.value}`,
      herbGrade: h.grade,
      // 品阶浓淡与边框色走同一把尺(见 ui/herbQuality);凡品为 plain,观感与原来的材料格一致
      tierStyle: {
        borderColor: tint(herbQualityTone(h.grade), herbQualityTier(h.grade).border),
        background: tint(herbQualityTone(h.grade), herbQualityTier(h.grade).bg)
      },
      luster: herbQualityLuster(h.grade)
    })),
    ...materialRows.value.map(m => ({
      key: m.name,
      icon: m.icon,
      name: m.name,
      desc: m.desc,
      color: 'text-ink-soft',
      display: formatNum(m.value),
      full: m.full,
      herbGrade: null as HerbGrade | null,
      tierStyle: undefined,
      luster: null
    })),
    {
      key: '灵石',
      icon: 'gem',
      name: '灵石',
      desc: '修行界的通行货币',
      color: 'text-gold-ink',
      display: formatGN(resources.spiritStone),
      full: formatGN(resources.spiritStone),
      herbGrade: null as HerbGrade | null,
      tierStyle: undefined,
      luster: null
    }
  ])

  const materialDetail = ref<string | null>(null)
  const currentMaterial = computed(() => materialGrid.value.find(m => m.key === materialDetail.value) ?? null)

  const pillDetail = ref<string | null>(null)
  const currentPill = computed(() => (pillDetail.value ? (pillRows.value.find(r => r.def?.id === pillDetail.value) ?? null) : null))
  /** 当前查看的丹药的质感层(最上档才有);道品 rank 9 走同一入口 */
  /** 当前查看的丹药的质感层(最上档才有);行上已算好,这里直接取 */
  const pillLuster = computed(() => currentPill.value?.luster ?? null)

  /**
   * 增益丹服前判定,与 usePill 同口径 buffOverflowOf:full = 顶满再服白费(usePill 照扣库存),partial = 只续到顶。
   * full 态「服 用」置灰,拦因见 currentPillHint。
   */
  const currentPillOverflow = computed<BuffOverflow | null>(() => {
    const def = currentPill.value?.def
    if (!def || def.kind !== 'buff' || !def.buffId) return null
    return buffOverflowOf(cultivation.buffs, def.buffId, now.value)
  })

  const currentPillHint = computed<{ text: string; tone: 'cinnabar' | 'amber' } | null>(() => {
    const overflow = currentPillOverflow.value
    if (overflow === 'full') return { text: '药力已顶满', tone: 'cinnabar' }
    if (overflow === 'partial') return { text: '药力将顶满', tone: 'amber' }
    return null
  })

  const craftOpen = ref(false)
  const decomposeOpen = ref(false)
  const smartOpen = ref(false)

  function onUsePill(): void {
    const id = pillDetail.value
    if (!id) return
    usePill(id)
    if (!pillRows.value.some(r => r.def?.id === id)) pillDetail.value = null
  }

  function onUsePillBatch(): void {
    const id = pillDetail.value
    if (!id) return
    usePillBatch(id, 5)
    if (!pillRows.value.some(r => r.def?.id === id)) pillDetail.value = null
  }

  function onEquipAllBest(): void {
    const changed = equipAllBest()
    ui.toast(changed > 0 ? `已换上 ${changed} 件` : '已是最强', changed > 0 ? 'success' : 'info')
  }
  /** 一键换装的预告件数,与 onEquipAllBest 同一把 bestEquipFor */
  const bestSwapPreview = computed(() => {
    const n = EQUIP_SLOTS.filter(slot => {
      const best = bestEquipFor(slot)
      return !!best && inventory.equipped[slot] !== best.uid
    }).length
    return n > 0 ? `(换 ${n} 件)` : '(已是最强)'
  })

  function onUnequipAll(): void {
    const removed = unequipAllEquipped()
    ui.toast(removed > 0 ? `已卸下 ${removed} 件` : '未装备', removed > 0 ? 'success' : 'info')
  }

  function onEquipSet(setId: string): void {
    const changed = equipSetCombo(setId)
    ui.toast(changed > 0 ? `已换上 ${changed} 件` : '无可换', changed > 0 ? 'success' : 'info')
  }

  /** 丹方读到几分熟,与图鉴「已得方/通晓」同源(lore.recipeLore);只报读数,不列熟练来路 */
  function pillMasteryText(id: string): string {
    const def = pillDef(id)
    if (!def?.recipe) return ''
    const m = lore.recipeMastery(id)
    if (m <= 0) return '未得方'
    if (m >= 1) return '已通晓'
    return `熟练 ${Math.round(m * 100)}%`
  }

</script>
