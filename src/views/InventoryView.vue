<template>
  <div class="stagger-in px-4 pb-6 pt-4">
    <!-- 页签 -->
    <InkTabs v-model="tab" :tabs="TABS" />

    <!-- 装备:部位槽,点击唤起部位列表 -->
    <template v-if="tab === 'equip'">
      <div class="mt-3 flex items-center justify-between px-1">
        <span class="text-[11px] text-ink-faint tabular">藏品 {{ inventory.bagItems.length }} · 器灵尘 {{ resources.dust }}</span>
        <span class="flex gap-3">
          <button class="text-[11px] text-azure/90 active:opacity-60" @click="smartOpen = true">
            收纳{{ settings.smartKeep.enabled ? '·启' : '' }}
          </button>
          <button class="text-[11px] text-cinnabar/80 active:opacity-60" @click="decomposeOpen = true">分解</button>
        </span>
      </div>
      <div class="mt-2 grid grid-cols-3 gap-2">
        <button
          v-for="row in slotRows"
          :key="row.slot"
          class="card-ink flex flex-col items-center gap-1 px-2 py-2.5 active:scale-95"
          @click="pickerSlot = row.slot"
        >
          <span class="text-[9px] text-ink-ghost">
            {{ row.name }}
            <template v-if="row.stock">· {{ row.stock }}</template>
          </span>
          <template v-if="row.item && row.template">
            <GameIcon :name="row.template.icon" :size="16" :style="{ color: qualityDef(row.item.quality).color }" />
            <span class="w-full truncate text-center font-kai text-[10px]" :style="{ color: qualityDef(row.item.quality).color }">
              {{ row.template.name }}
              <template v-if="row.item.level > 0">+{{ row.item.level }}</template>
            </span>
          </template>
          <template v-else>
            <span class="grid h-4 w-4 place-items-center text-ink-ghost">·</span>
            <span class="text-[10px] text-ink-ghost">空悬</span>
          </template>
        </button>
      </div>
      <p class="mt-2 text-center text-[10px] text-ink-ghost">点击部位查看候选,行囊满时新掉落自动折作器灵尘</p>

      <!-- 全部藏品(含佩戴中):部位槽之下的完整清单 -->
      <div v-if="allItems.length" class="mt-4">
        <SectionTitle title="全部藏品" :hint="`${allItems.length} 件 · 行囊 ${inventory.bagItems.length}/${BAG_CAPACITY}`" />
        <div class="mt-2 grid grid-cols-3 gap-2">
          <EquipmentCard
            v-for="row in allItems"
            :key="row.item.uid"
            :item="row.item"
            :equipped="row.equipped"
            @open="openDetail"
          />
        </div>
      </div>
      <p v-else class="mt-8 text-center text-[12px] text-ink-ghost">行囊空空,去历练中寻些机缘吧</p>
    </template>

    <!-- 丹药 -->
    <template v-else-if="tab === 'pill'">
      <div v-if="pillRows.length" class="mt-3 space-y-2">
        <div v-for="row in pillRows" :key="row.def!.id" class="card-ink flex items-center gap-3 px-3.5 py-2.5">
          <GameIcon :name="row.def!.icon" :size="18" :style="{ color: qualityDef(row.def!.quality).color }" />
          <div class="min-w-0 grow">
            <p class="flex items-center gap-2">
              <span class="font-kai text-[13px] text-ink">{{ row.def!.name }}</span>
              <span class="text-[10px] text-ink-faint tabular">×{{ row.count }}</span>
            </p>
            <p class="truncate text-[11px] text-ink-faint">{{ row.def!.desc }}</p>
          </div>
          <button class="btn-ghost shrink-0 px-3! py-1.5! text-[12px]!" @click="usePill(row.def!.id)">服用</button>
        </div>
      </div>
      <p v-else class="mt-10 text-center text-[12px] text-ink-ghost">丹匣空空</p>

      <SectionTitle title="开炉炼丹" class="mt-5" :hint="`灵草 ${resources.herb}`" />
      <div v-if="recipes.length" class="mt-2 space-y-2">
        <div v-for="r in recipes" :key="r.def.id" class="card-ink px-3.5 py-2.5">
          <div class="flex items-center gap-3">
            <GameIcon :name="r.def.icon" :size="18" :style="{ color: qualityDef(r.def.quality).color }" />
            <div class="min-w-0 grow">
              <p class="flex items-center gap-2">
                <span class="font-kai text-[13px] text-ink">{{ r.def.name }}</span>
                <span class="text-[10px] text-ink-ghost">{{ r.able.rank }} 阶</span>
                <span v-if="r.able.overReach > 0" class="text-[10px] text-crimson-ink">越阶 {{ r.able.overReach }}</span>
              </p>
              <p class="text-[11px] text-ink-faint tabular">灵草×{{ r.cost.herb }} · 灵石 {{ formatGN(r.cost.stone) }}</p>
            </div>
            <div class="shrink-0 text-right">
              <p class="tabular text-[13px]" :class="rateClass(r.able.successRate)">{{ formatPercent(r.able.successRate) }}</p>
              <p class="text-[10px] text-ink-ghost">成丹把握</p>
            </div>
            <button class="btn-seal shrink-0 px-3! py-1.5! text-[12px]!" @click="craftPill(r.def.id)">炼制</button>
          </div>
          <p v-for="w in r.able.weakness" :key="w" class="mt-1 pl-7 text-[10px] text-ink-ghost">· {{ w }}</p>
        </div>
      </div>
      <p v-else class="mt-2 px-1 text-[11px] text-ink-faint">你还不知道任何丹方。多采多看多打听,方子自会找上门来。</p>
    </template>

    <!-- 材料 -->
    <template v-else-if="tab === 'material'">
      <div class="mt-3 space-y-2">
        <div v-for="m in materialRows" :key="m.name" class="card-ink flex items-center gap-3 px-3.5 py-3">
          <GameIcon :name="m.icon" :size="18" class="text-ink-soft" />
          <div class="grow">
            <p class="font-kai text-[13px] text-ink">{{ m.name }}</p>
            <p class="text-[11px] text-ink-faint">{{ m.desc }}</p>
          </div>
          <span class="tabular text-[15px] text-ink">{{ m.value }}</span>
        </div>
        <div class="card-ink flex items-center gap-3 px-3.5 py-3">
          <GameIcon name="gem" :size="18" class="text-gold-ink" />
          <div class="grow">
            <p class="font-kai text-[13px] text-ink">灵石</p>
            <p class="text-[11px] text-ink-faint">修行界的通行货币</p>
          </div>
          <span class="tabular text-[15px] text-ink">{{ formatGN(resources.spiritStone) }}</span>
        </div>
      </div>
    </template>

    <!-- 法宝 -->
    <template v-else>
      <p class="mt-3 px-1 text-[11px] text-ink-faint tabular">
        法宝位 {{ inventory.equippedArtifacts.length }}/{{ artifactSlots }}
        <template v-if="artifactSlots < 2">· 元婴境开启第二法宝位</template>
      </p>
      <div v-if="artifactRows.length" class="mt-2 space-y-2.5">
        <div v-for="row in artifactRows" :key="row.def.id" class="card-ink px-4 py-3">
          <div class="flex items-center gap-2">
            <GameIcon :name="row.def.icon" :size="18" :style="{ color: qualityDef(row.def.quality).color }" />
            <span class="font-kai text-[14px]" :style="{ color: qualityDef(row.def.quality).color }">{{ row.def.name }}</span>
            <QualityTag :quality="row.def.quality" />
            <span class="ml-auto tabular text-[11px] text-gold-ink">{{ row.owned.level }} 阶</span>
          </div>
          <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{{ row.def.desc }}</p>
          <p class="mt-1 text-[11px] text-azure">{{ passiveLines(row.def.id, row.owned.level).join(' · ') }}</p>
          <p class="mt-1 text-[11px] text-violet-ink">神通「{{ row.def.active.name }}」:{{ row.def.active.desc }}</p>
          <div class="mt-2.5 flex gap-2">
            <button
              class="btn-seal flex-1 py-1.5! text-[12px]!"
              :class="{ 'bg-ink-faint!': row.equipped }"
              @click="toggleArtifact(row.def.id)"
            >
              {{ row.equipped ? '收回法宝' : '祭炼随身' }}
            </button>
            <button v-if="row.upCost" class="btn-ghost flex-1 py-1.5! text-[12px]! tabular" @click="upgradeArtifact(row.def.id)">
              炼化(悟道{{ row.upCost.wudao }})
            </button>
          </div>
        </div>
      </div>
      <p v-else class="mt-16 text-center text-[12px] text-ink-ghost">
        尚无法宝随身
        <br />
        <span class="text-[11px]">法宝多出自奇遇与强敌之手</span>
      </p>
      <p v-if="player.petId" class="mt-4 text-center text-[11px] text-ink-faint">灵兽相伴,可前往「人物」页查看</p>
    </template>

    <!-- 部位候选列表 -->
    <BaseModal :open="pickerSlot !== null" :title="pickerSlot ? EQUIP_SLOT_NAMES[pickerSlot] : ''" @close="pickerSlot = null">
      <div v-if="pickerRows.length" class="space-y-1.5">
        <div
          v-for="row in pickerRows"
          :key="row.item.uid"
          class="flex items-center gap-2.5 rounded-md px-2.5 py-2"
          :class="row.equipped ? 'bg-jade/10' : 'bg-paper-deep/70'"
        >
          <GameIcon :name="row.template.icon" :size="16" :style="{ color: qualityDef(row.item.quality).color }" />
          <button class="min-w-0 grow text-left active:opacity-70" @click="openDetail(row.item.uid)">
            <span class="block truncate font-kai text-[13px]" :style="{ color: qualityDef(row.item.quality).color }">
              {{ row.template.name }}
              <template v-if="row.item.level > 0">+{{ row.item.level }}</template>
            </span>
            <span class="block text-[10px] text-ink-faint">
              {{ qualityDef(row.item.quality).name }} · {{ row.item.tier }} 阶 · {{ row.item.affixes.length }} 词条
            </span>
          </button>
          <button v-if="row.equipped" class="btn-ghost shrink-0 px-2.5! py-1! text-[11px]!" @click="unequipSlot()">卸下</button>
          <button v-else class="btn-seal shrink-0 px-2.5! py-1! text-[11px]!" @click="equipItem(row.item.uid)">换上</button>
        </div>
      </div>
      <p v-else class="py-8 text-center text-[12px] text-ink-ghost">此部位尚无藏品,去历练中寻些机缘吧</p>
      <p class="mt-2 text-center text-[10px] text-ink-ghost">点名称可查看详情与对比</p>
    </BaseModal>

    <!-- 一键分解:勾选品质(记忆勾选) -->
    <BaseModal :open="decomposeOpen" title="一键分解" @close="decomposeOpen = false">
      <p class="text-[11px] text-ink-faint">勾选要分解的品质,已佩戴与上锁的装备不受影响。勾选会被记住。</p>
      <div class="mt-2 space-y-1">
        <label
          v-for="q in QUALITIES"
          :key="q.id"
          class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5"
          :class="settings.decomposeRanks.includes(q.rank) ? 'bg-paper-deep/80' : ''"
        >
          <input
            type="checkbox"
            class="h-4 w-4 accent-cinnabar"
            :checked="settings.decomposeRanks.includes(q.rank)"
            @change="toggleRank(q.rank)"
          />
          <span class="font-kai text-[13px]" :style="{ color: q.color }">{{ q.name }}</span>
          <span class="ml-auto tabular text-[11px] text-ink-faint">现存 {{ decomposeCounts[q.rank] ?? 0 }} 件</span>
        </label>
      </div>
      <template #footer>
        <button class="btn-seal w-full" :disabled="decomposeTotal === 0" @click="confirmDecompose">
          分 解{{ decomposeTotal > 0 ? `(${decomposeTotal} 件)` : '' }}
        </button>
      </template>
    </BaseModal>

    <!-- 智能收纳弹窗入口共用分解弹窗下方 -->
    <BaseModal :open="smartOpen" title="智能收纳" @close="smartOpen = false">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        行囊满时,新掉落若「值得收藏」将自动挤掉包内与道无缘的旧物。识别不只看品质:流派核心件与组合技部件亦在收藏之列。
      </p>
      <label class="mt-2 flex items-center justify-between py-1.5">
        <span class="text-[13px] text-ink-soft">启用智能收纳</span>
        <input v-model="settings.smartKeep.enabled" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <div class="flex items-center justify-between py-1.5">
        <span class="text-[12px] text-ink-soft">此品质起一律保留</span>
        <div class="flex gap-1">
          <button
            v-for="q in KEEP_QUALITY_CHOICES"
            :key="q.rank"
            class="chip-ink"
            :class="settings.smartKeep.minQuality === q.rank ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
            @click="settings.smartKeep.minQuality = q.rank"
          >
            {{ q.name }}
          </button>
        </div>
      </div>
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[12px] text-ink-soft">保留主流派核心词条件</span>
        <input v-model="settings.smartKeep.keepCoreAffix" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[12px] text-ink-soft">保留组合技部件(副体系词条)</span>
        <input v-model="settings.smartKeep.keepComboPiece" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <template #footer>
        <button class="btn-ghost w-full text-[12px]!" @click="smartClean">依此规则清理行囊(未锁定的无缘之物化尘)</button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useInventoryStore } from '@/stores/inventory'
  import { useResourcesStore } from '@/stores/resources'
  import { usePlayerStore } from '@/stores/player'
  import { useUiStore } from '@/stores/ui'
  import { useSettingsStore } from '@/stores/settings'
  import { qualityDef, QUALITIES } from '@/data/qualities'
  import { pillDef } from '@/data/pills'
  import { artifactDef, ARTIFACT_LEVEL_BONUS } from '@/data/artifacts'
  import { EQUIP_SLOT_NAMES, equipmentTemplate } from '@/data/equipment'
  import { BAG_CAPACITY } from '@/data/constants'
  import { usePill, availableRecipes, craftPill, pillCraftCost } from '@/core/pillService'
  import { craftability, type Craftability } from '@/core/craftability'
  import { decomposeByRanks, decomposeEquipment, artifactUpCost, upgradeArtifact } from '@/core/forge'
  import { keepVerdict } from '@/core/smartKeep'
  import { formatGN, formatPercent } from '@/utils/format'
  import { STAT_NAMES } from '@/ui/statNames'
  import type { AnyStatKey, EquipSlot, GNum, PillDef } from '@/types'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import QualityTag from '@/components/common/QualityTag.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import EquipmentCard from '@/components/equipment/EquipmentCard.vue'

  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  const player = usePlayerStore()
  const ui = useUiStore()
  const settings = useSettingsStore()

  type Tab = 'equip' | 'pill' | 'material' | 'artifact'
  const tab = ref<Tab>('equip')

  const TABS: { id: Tab; label: string }[] = [
    { id: 'equip', label: '装备' },
    { id: 'pill', label: '丹药' },
    { id: 'material', label: '材料' },
    { id: 'artifact', label: '法宝' }
  ]

  // ---- 装备:部位槽 + 部位候选列表 ----
  const SLOTS: EquipSlot[] = ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman']
  const pickerSlot = ref<EquipSlot | null>(null)

  const slotRows = computed(() =>
    SLOTS.map(slot => {
      const uid = inventory.equipped[slot]
      const item = uid ? inventory.findItem(uid) : undefined
      return {
        slot,
        name: EQUIP_SLOT_NAMES[slot],
        item,
        template: item ? equipmentTemplate(item.templateId) : undefined,
        stock: inventory.bagItems.filter(it => equipmentTemplate(it.templateId)?.slot === slot).length
      }
    })
  )

  /** 全部藏品(含佩戴中),按品质/层级降序 */
  const allItems = computed(() =>
    inventory.items
      .map(item => ({ item, equipped: inventory.equippedUids.has(item.uid) }))
      .sort((a, b) => {
        const dq = qualityDef(b.item.quality).rank - qualityDef(a.item.quality).rank
        return dq !== 0 ? dq : b.item.tier - a.item.tier
      })
  )

  /** 当前部位的候选:佩戴中的置顶,其余按品质/层级降序 */
  const pickerRows = computed(() => {
    const slot = pickerSlot.value
    if (!slot) return []
    const equippedUid = inventory.equipped[slot]
    return inventory.items
      .map(item => ({ item, template: equipmentTemplate(item.templateId)! }))
      .filter(row => row.template?.slot === slot)
      .map(row => ({ ...row, equipped: row.item.uid === equippedUid }))
      .sort((a, b) => {
        if (a.equipped !== b.equipped) return Number(b.equipped) - Number(a.equipped)
        const dq = qualityDef(b.item.quality).rank - qualityDef(a.item.quality).rank
        return dq !== 0 ? dq : b.item.tier - a.item.tier
      })
  })

  function equipItem(uid: string): void {
    if (pickerSlot.value) inventory.equip(uid, pickerSlot.value)
  }

  function unequipSlot(): void {
    if (pickerSlot.value) inventory.unequip(pickerSlot.value)
  }

  function openDetail(uid: string): void {
    ui.equipDetailUid = uid
  }

  const pillRows = computed(() =>
    Object.entries(inventory.pills)
      .map(([id, count]) => ({ def: pillDef(id), count }))
      .filter(x => x.def !== undefined && x.count > 0)
      .sort((a, b) => qualityDef(b.def!.quality).rank - qualityDef(a.def!.quality).rank)
  )

  const recipes = computed(() =>
    availableRecipes()
      .map(id => ({ def: pillDef(id), cost: pillCraftCost(id), able: craftability(id) }))
      .filter((x): x is { def: PillDef; cost: { herb: number; stone: GNum }; able: Craftability } =>
        x.def !== undefined && x.cost !== null && x.able !== null)
      .sort((a, b) => a.able.rank - b.able.rank)
  )

  /** 把握度配色:七成以上放心开炉,三成以下是在赌 */
  function rateClass(rate: number): string {
    if (rate >= 0.7) return 'text-jade-ink'
    if (rate >= 0.3) return 'text-gold-ink'
    return 'text-crimson-ink'
  }

  const materialRows = computed(() => [
    { icon: 'leaf', name: '灵草', desc: '炼丹的根本', value: resources.herb },
    { icon: 'mountain', name: '玄铁', desc: '筑造与炼器之材', value: resources.ore },
    { icon: 'scroll', name: '功法残页', desc: '集残页可参悟功法', value: resources.page },
    { icon: 'sparkles', name: '器灵尘', desc: '强化装备的灵性之尘', value: resources.dust },
    { icon: 'book', name: '悟道点', desc: '功法进修与法宝炼化所需', value: resources.wudao }
  ])

  const artifactSlots = computed(() => (player.major >= 3 ? 2 : 1))

  const artifactRows = computed(() =>
    inventory.artifacts.map(a => ({
      owned: a,
      def: artifactDef(a.defId)!,
      upCost: artifactUpCost(a.defId),
      equipped: inventory.equippedArtifacts.includes(a.defId)
    }))
  )

  function toggleArtifact(defId: string): void {
    const result = inventory.toggleArtifact(defId, artifactSlots.value)
    if (result === 'replaced') ui.toast('法宝位已满,替换了最早祭炼的一件', 'info')
  }

  function batchDecompose(): void {
    const n = decomposeByRanks(settings.decomposeRanks)
    ui.toast(n > 0 ? `已分解 ${n} 件装备` : '无可分解之物', 'info')
  }

  // ---- 一键分解弹窗 ----
  const decomposeOpen = ref(false)

  /** 各品质档现存可分解件数(未锁定) */
  const decomposeCounts = computed(() => {
    const counts: Record<number, number> = {}
    for (const it of inventory.bagItems) {
      if (it.locked) continue
      const rank = qualityDef(it.quality).rank
      counts[rank] = (counts[rank] ?? 0) + 1
    }
    return counts
  })

  const decomposeTotal = computed(() => settings.decomposeRanks.reduce((sum, rank) => sum + (decomposeCounts.value[rank] ?? 0), 0))

  function toggleRank(rank: number): void {
    settings.decomposeRanks = settings.decomposeRanks.includes(rank)
      ? settings.decomposeRanks.filter(r => r !== rank)
      : [...settings.decomposeRanks, rank].sort((a, b) => a - b)
  }

  function confirmDecompose(): void {
    batchDecompose()
    decomposeOpen.value = false
  }

  // ---- 智能收纳 ----
  const smartOpen = ref(false)
  const KEEP_QUALITY_CHOICES = [
    { rank: 3, name: '灵品' },
    { rank: 4, name: '玄品' },
    { rank: 5, name: '地品' }
  ]

  function smartClean(): void {
    const targets = inventory.bagItems.filter(it => !it.locked && !keepVerdict(it).keep)
    let n = 0
    for (const it of targets) {
      if (decomposeEquipment(it.uid)) n += 1
    }
    ui.toast(n > 0 ? `收纳毕:${n} 件无缘之物化作器灵尘` : '行囊中皆是有缘之物', 'info')
    smartOpen.value = false
  }

  function passiveLines(defId: string, level: number): string[] {
    const def = artifactDef(defId)
    if (!def) return []
    const mult = 1 + level * ARTIFACT_LEVEL_BONUS
    return Object.entries(def.passive).map(([k, v]) => `${STAT_NAMES[k as AnyStatKey] ?? k} +${formatPercent((v as number) * mult)}`)
  }
</script>
