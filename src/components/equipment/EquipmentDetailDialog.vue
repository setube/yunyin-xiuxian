<template>
  <BaseModal
    ref="modalRef"
    :open="inst !== undefined"
    :title="template?.name ?? ''"
    :panel-class="luster ? 'luster-frame' : undefined"
    :title-class="luster ? 'luster-title' : undefined"
    top
    @close="close"
  >
    <!-- 最上档头饰:面板是圆角 + overflow-hidden,印须整体落在面板内 -->
    <span v-if="luster" class="luster-crown" aria-hidden="true">神品</span>
    <!-- 词条转移在同一弹窗内切换正文与页脚,不另叠一层 -->
    <AffixTransferPanel v-if="transferOpen && inst" :flow="transfer" @view="viewTarget" />
    <div v-else-if="inst && template && resolved">
      <!--
        flex-wrap 不可去:这一行原有品质签、阶位、+N、满级签、锁钮五样,
        加了「全满」印后共六样 —— 320 宽下正文 px-5 只剩约 280,六样并排挤不下,
        锁钮会被挤出面板。窄时整枚折行,不压文字。
      -->
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <QualityTag :quality="inst.quality" />
        <!-- 阶位须带界域:同一阶在人间界与仙界不是一回事 -->
        <span class="min-w-0 text-[11px] text-ink-faint">
          {{ EQUIP_SLOT_NAMES[template.slot] }} · {{ worldNameOfTier(inst.tier) }} · {{ inst.tier }} 阶
        </span>
        <span v-if="inst.level > 0" class="text-[11px] text-gold-ink tabular">+{{ inst.level }}</span>
        <!-- 满级时补一句,别让玩家自己去猜还能不能升 -->
        <span v-if="mastery" class="rounded border border-gold-ink/40 bg-gold-ink/10 px-1.5 py-0.5 text-[10px] leading-none text-ink">{{ mastery.label }}</span>
        <!--
          全满:每一条词条都达满档。这是「运气极点」,与满级、品阶各是各的一档 ——
          见 ui/rollMark 的 allRollsApex,与智能收纳的保留线同一根。
        -->
        <span
          v-if="allApex"
          class="affix-full"
          role="img"
          aria-label="词条全满"
          title="词条全满"
        >满</span>
        <button
          class="-m-1.5 flex min-h-[28px] min-w-[28px] items-center justify-center p-1.5 text-ink-faint active:scale-90"
          :aria-label="inst.locked ? '解锁' : '锁定'"
          @click="toggleLock"
        >
          <GameIcon :name="inst.locked ? 'lock' : 'unlock'" :size="15" />
        </button>
      </div>
      <p class="mt-2 text-[12px] leading-relaxed text-ink-faint">{{ template.desc }}</p>
      <EquipNotePanel />
      <p v-if="setInfo" class="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-relaxed">
        <!-- 套纹:六套各一枚,与格子那枚同源(见 ui/setMark) -->
        <span
          v-if="setMark"
          class="set-crest shrink-0"
          :class="`set-crest--${setMark.crest} set-crest--${setMark.mechanism}`"
          aria-hidden="true"
        />
        <span class="font-kai" :class="setInfo.active ? 'text-jade' : 'text-violet-ink'">
          {{ setInfo.def.name }}
        </span>
        <!-- 件数刻度:凑齐要几件就几格,已戴几件 -->
        <span
          class="set-pips shrink-0"
          :class="{ 'set-pips--active': setInfo.active }"
          role="img"
          :aria-label="`已戴 ${setInfo.count} 件,凑齐需 ${setInfo.def.required} 件`"
        >
          <i v-for="(on, i) in setPips(setMark!, setInfo.count)" :key="i" :class="{ on }" />
        </span>
        <span class="tabular" :class="setInfo.active ? 'text-jade' : 'text-ink-faint'">
          {{ setInfo.count }}/{{ setInfo.def.required }}
        </span>
        <span class="text-ink-faint">{{ setInfo.def.effectDesc }}</span>
      </p>
      <div class="ink-divider my-3" />
      <p v-if="compareTarget" class="mb-1.5 text-[10px] text-ink-faint tabular">对比当前佩戴「{{ compareTarget.name }}」</p>
      <p v-if="powerCompare" class="mb-1.5 flex items-baseline justify-between text-[11px] tabular">
        <span class="text-ink-faint">{{ powerCompareLabel() }}</span>
        <span class="text-ink">
          <span class="text-ink-faint">{{ formatNum(powerCompare.theirs) }}</span>
          <span class="mx-1 text-ink-faint">→</span>
          <span :class="powerCompare.up ? 'text-jade' : 'text-cinnabar'">{{ formatNum(powerCompare.mine) }}</span>
          <span class="ml-1 text-[10px]" :class="powerCompare.up ? 'text-jade' : 'text-cinnabar'">
            ({{ powerCompare.up ? '+' : '' }}{{ Math.round(powerCompare.pct) }}%)
          </span>
        </span>
      </p>
      <div class="space-y-1.5">
        <p v-for="row in flatRows" :key="row.label" class="flex justify-between text-[13px]">
          <span class="text-ink-soft">{{ row.label }}</span>
          <span class="tabular text-ink">
            {{ row.value }}
            <span v-if="row.diff" class="ml-1 text-[11px]" :class="row.up ? 'text-jade' : 'text-cinnabar'">({{ row.diff }})</span>
          </span>
        </p>
        <p v-for="row in fixedModRows" :key="row.label" class="flex justify-between text-[13px]">
          <span class="text-ink-soft">{{ row.label }}</span>
          <span class="tabular text-azure">{{ row.value }}</span>
        </p>
      </div>
      <template v-if="resolved.affixLines.length">
        <div class="ink-divider my-3" />
        <p class="mb-1.5 flex items-baseline justify-between font-kai text-[12px] tracking-[0.3em] text-ink-faint">
          <span>词 条</span>
          <span class="flex items-center gap-1.5 text-[10px] tracking-normal tabular">
            <!--
              词条位刻度:上限是品阶给的(九档从 1 到 9),不是一律五格(见 ui/affixSlots)。
              还差几个位、哪几个位空着,数格便知。
            -->
            <span
              class="affix-slots"
              :class="{ 'affix-slots--full': slotMark.full }"
              role="img"
              :aria-label="`词条 ${slotMark.used}/${slotMark.cap} 条`"
            >
              <i v-for="(on, i) in affixSlotPips(slotMark)" :key="i" :class="{ on }" />
            </span>
            {{ slotMark.used }} / {{ slotMark.cap }} 条
          </span>
        </p>
        <ul class="overflow-hidden rounded-md bg-violet-ink/6">
          <li
            v-for="(line, i) in resolved.affixLines"
            :key="line.id"
            class="flex items-center gap-2 py-1.5 pl-2 pr-1.5"
            :class="i > 0 ? 'border-t border-violet-ink/10' : ''"
            :style="{ borderLeft: `2px solid ${line.meta.color}` }"
          >
            <span class="shrink-0 font-kai text-[12px]" :style="{ color: line.meta.color }">
              「{{ line.name }}」
            </span>
            <span class="shrink-0 text-[9px] opacity-80" :style="{ color: line.meta.color }">
              {{ line.meta.name }}
            </span>
            <span class="ml-auto min-w-0 text-right text-[11px] leading-snug text-ink-soft">
              {{ line.before }}<span class="tabular font-medium text-ink">{{ line.value }}</span>{{ line.after }}
              <!--
                掷值档:同一条词条,浮 95% 与浮 15% 是两种东西 ——
                而此前只有一个读数,两档长得一模一样(见 ui/rollMark)。
              -->
              <span
                class="affix-roll"
                :class="`affix-roll--${line.rollGrade.grade}`"
                :title="affixRollHint"
              >{{ line.rollGrade.label }}</span>
            </span>
            <EquipSealPanel :affix-id="line.id" :name="line.name" />
          </li>
        </ul>
      </template>
      <template v-if="buildPreview">
        <div class="ink-divider my-3" />
        <p class="flex items-center justify-between text-[12px]">
          <span class="text-ink-faint">装备后流派</span>
          <span class="tabular">
            <template v-if="buildPreview.before">
              <span class="text-ink-soft">{{ buildPreview.before.displayName }} {{ Math.round(buildPreview.before.affinity * 100) }}%</span>
            </template>
            <template v-else><span class="text-ink-faint">未成流派</span></template>
            <span class="mx-1 text-ink-faint">→</span>
            <template v-if="buildPreview.after">
              <span
                class="font-kai"
                :class="buildPreview.after.affinity >= (buildPreview.before?.affinity ?? 0) ? 'text-jade' : 'text-cinnabar'"
              >
                {{ buildPreview.after.displayName }} {{ Math.round(buildPreview.after.affinity * 100) }}%
              </span>
            </template>
            <template v-else><span class="text-cinnabar">未成流派</span></template>
          </span>
        </p>
      </template>
      <UpgradePanel />
      <p v-if="salvage" class="mt-1 flex items-center justify-between text-[11px] text-ink-faint">
        <span>分解返还{{ inst.level > 0 ? `(${salvageRefundPhrase()})` : '' }}</span>
        <span class="tabular">
          器灵尘×{{ salvage.dust }}
          <template v-if="!isZero(salvage.stone)"> · 灵石 {{ formatGN(salvage.stone) }}</template>
        </span>
      </p>
      <EquipWhatIfPanel />

      <AutoReforgePanel v-if="autoOpen" :flow="reforgeFlow" />
    </div>
    <template #footer>
      <AffixTransferFooter v-if="transferOpen && inst" :flow="transfer" @back="transferOpen = false" />
      <div v-else class="flex flex-col gap-2">
        <EquipReforgeFooter
          :auto-open="autoOpen"
          :can-transfer-out="canTransferOut"
          @update:auto-open="autoOpen = $event"
          @transfer="openTransfer"
        />
        <div class="flex gap-2">
          <button class="btn-seal flex-1" @click="toggleEquip">{{ isEquipped ? '卸 下' : '装 备' }}</button>
          <!--
            满级不再让按钮凭空消失:消失的按钮不解释任何事,玩家只看到「强 化」不见了。
            保留同一位置、换成禁用态并直接写出原因(AGENTS.md「禁用即给原因」)。
          -->
          <button
            class="btn-ghost flex-1"
            :disabled="upCost ? upShort !== null : true"
            :title="upCost ? (upShort === 'stone' ? `灵石尚差 ${formatGap(upGap?.stone ?? { m: 0, e: 0 })}` : upShort === 'dust' ? `器灵尘尚差 ${upGap?.dust ?? 0}` : undefined) : upgradeCapToast()"
            @click="doUpgrade"
          >{{ !upCost ? '已至上限' : upShort === 'stone' ? `强 化(石差${formatGap(upGap?.stone ?? { m: 0, e: 0 })})` : upShort === 'dust' ? `强 化(尘差${upGap?.dust ?? 0})` : '强 化' }}</button>
          <!-- 分解须二步确认,防误触 -->
          <template v-if="decomposeArm !== inst?.uid">
            <button
              class="btn-ghost"
              :disabled="isEquipped || inst?.locked"
              :aria-label="decomposeReason"
              :title="decomposeReason"
              @click="decomposeArm = inst?.uid ?? null"
            >
              <GameIcon name="trash" :size="15" />
            </button>
          </template>
          <template v-else>
            <button class="btn-seal !px-2.5 !py-2 !text-[11px]" @click="doDecompose">确认分解</button>
            <button class="btn-ghost !px-2.5 !py-2 !text-[11px] text-ink-faint" @click="decomposeArm = null">再想想</button>
          </template>
        </div>
      </div>
    </template>
  </BaseModal>

</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { nextTick, ref, watch } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { useInventoryStore } from '@/stores/inventory'
  import { equipmentTemplate, EQUIP_SLOT_NAMES } from '@/data/equipment'
  import { equipSetDef, setCounts } from '@/core/equipSet'
  import { setMark as setMarkOf, setPips } from '@/ui/setMark'
  import { worldNameOfTier } from '@/core/formulas'
  import { resolveEquipStats } from '@/core/equipGen'
  import { equippablePower } from '@/core/equipBest'
  import { decomposeEquipment, equipLevelCap, equipUpgradeCost, upgradeEquipment, upgradeShort, upgradeShortfall } from '@/core/forge'
  import { upgradeCapToast } from '@/ui/forgeText'
  import { equipMastery } from '@/ui/masteryMark'
  import { salvageOf, salvageRefundPhrase } from '@/core/salvage'
  import { detectBuild } from '@/core/buildDetect'
  import { qualityDef } from '@/data/qualities'
  import { affixSlotMark, affixSlotPips } from '@/ui/affixSlots'
  import { usePlayerStore } from '@/stores/player'
  import { formatGN, formatGap, formatNum } from '@/utils/format'
  import { isZero, sub } from '@/utils/gnum'
  import type { AnyStatKey, GNum } from '@/types'
  import { AFFIX_RARITY_META, STAT_NAMES, statValueText } from '@/data/statNames'
  import { allRollsApex, rollMark } from '@/ui/rollMark'
  import { affixRollHint, powerCompareLabel } from '@/ui/equipText'
  import { useAffixTransfer } from '@/composables/useAffixTransfer'
  import { useAutoReforge } from '@/composables/useAutoReforge'
  import BaseModal from '@/components/common/BaseModal.vue'
  import QualityTag from '@/components/common/QualityTag.vue'
  import { lusterOf } from '@/ui/luster'
  import AutoReforgePanel from './AutoReforgePanel.vue'
  import UpgradePanel from './UpgradePanel.vue'
  import EquipNotePanel from './EquipNotePanel.vue'
  import EquipWhatIfPanel from './EquipWhatIfPanel.vue'
  import EquipSealPanel from './EquipSealPanel.vue'
  import EquipReforgeFooter from './EquipReforgeFooter.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import AffixTransferPanel from './AffixTransferPanel.vue'
  import AffixTransferFooter from './AffixTransferFooter.vue'

  const ui = useUiStore()
  const inventory = useInventoryStore()
  const player = usePlayerStore()
  // 自动重铸整本账在 useAutoReforge,页脚只留开关
  const reforgeFlow = useAutoReforge()
  const { closeAuto } = reforgeFlow
  const autoOpen = ref(false)

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))

  const template = computed(() => (inst.value ? equipmentTemplate(inst.value.templateId) : undefined))
  /**
   * 词条行:稀有度的名与色各算一次。
   *
   * 原先一行里 `AFFIX_RARITY_META[line.rarity]` 被调 4 次(左边框、字色 ×2、档次名),
   * 而后一次就是前一次的同一次查表 —— 与前面几轮清掉的重复调用同一种毛病。
   */
  const resolved = computed(() => {
    if (!inst.value) return null
    const r = resolveEquipStats(inst.value)
    return {
      ...r,
      affixLines: r.affixLines.map(line => ({ ...line, meta: AFFIX_RARITY_META[line.rarity], rollGrade: rollMark(line.roll) }))
    }
  })
  const isEquipped = computed(() => (inst.value && template.value ? inventory.equipped[template.value.slot] === inst.value.uid : false))
  /** 约定「禁用即给原因」 */
  const decomposeReason = computed(() => {
    if (isEquipped.value && inst.value) return '分解(已装备)'
    if (inst.value?.locked) return '分解(已上锁)'
    return '分解'
  })
  const mastery = computed(() => (inst.value ? equipMastery(inst.value.level, equipLevelCap()) : null))
  /**
   * 整件「全满」:每一条词条都达满档。
   *
   * 这是智能收纳里「词条近满件永不自动处置」的那根线 —— 玩家在收纳设置里被保留的件,
   * 在详情里也该说得出为什么。一件装备所有词条同时掷到 85% 以上是运气极点,
   * 而此前界面上逐条看只能看出「每条都不错」,看不出「整件全满」这件事。
   */
  const allApex = computed(() => (resolved.value ? allRollsApex(resolved.value.affixLines.map(l => l.roll)) : false))
  /** 质感层:详情弹窗的整幅框、头饰与标题字面(见 ui/luster) */
  const luster = computed(() => (inst.value ? lusterOf(inst.value.quality) : null))
  const upCost = computed(() => (inst.value ? equipUpgradeCost(inst.value.uid) : null))
  const upShort = computed(() => (upCost.value ? upgradeShort(upCost.value) : null))
  const upGap = computed(() => (upCost.value ? upgradeShortfall(upCost.value) : null))
  const salvage = computed(() => (inst.value ? salvageOf(inst.value) : null))

  /** 共鸣件数只数已佩戴的(看挂载,不看行囊) */
  /** 共鸣形制:六套各一枚线纹(见 ui/setMark);与格子那枚同源 */
  const setMark = computed(() => setMarkOf(template.value?.set ?? ''))
  const setInfo = computed(() => {
    const setId = template.value?.set
    if (!setId) return null
    const def = equipSetDef(setId)
    if (!def) return null
    const count = setCounts(inventory.equippedItems).get(setId) ?? 0
    return { def, count, active: count >= def.required }
  })

  /** 词条条数上限:取品质表,不在界面另写 */
  /** 词条位形制:上限与词条生成同源(见 ui/affixSlots) */
  /**
   * 词条上限:与词条生成同源(品阶表)。模板直读这一处,
   * spec 钉着「上限不在模板里写死数字」,故不在 ui 层再藏一份。
   */
  const affixCap = computed(() => (inst.value ? qualityDef(inst.value.quality).affixes[1] : 0))
  /** 词条位形制:上限由上而给,不在这里再查表(见 ui/affixSlots) */
  const slotMark = computed(() => affixSlotMark(affixCap.value, inst.value?.affixes.length ?? 0))

  // ---- 词条转移(议题 #22):本件作源件 ----
  const transferOpen = ref(false)
  const transfer = useAffixTransfer(() => (transferOpen.value ? (inst.value?.uid ?? null) : null))
  const canTransferOut = computed(() => (inst.value?.affixes.length ?? 0) > 0)

  function openTransfer(): void {
    closeAuto()
    transferOpen.value = true
  }

  function viewTarget(uid: string): void {
    transferOpen.value = false
    ui.equipDetailUid = uid
  }

  // 换件(或关闭)即复位:转移模式、自动重铸勾选、二步确认不得串到下一件
  watch(
    () => inst.value?.uid,
    () => {
      transferOpen.value = false
      closeAuto()
      decomposeArm.value = null
    }
  )

  // 详情/转移互切或换件时滚动盒不重挂,须回顶。
  // 须用多源数组,不用返回新数组的 getter:后者在重铸(uid 不变)时也会重放,把滚动位置顶回顶部
  const modalRef = ref<InstanceType<typeof BaseModal> | null>(null)
  watch(
    [() => transferOpen.value, () => inst.value?.uid],
    () => void nextTick(() => modalRef.value?.scrollToTop())
  )
  // 被后开的窗(如离线卷轴)盖着时换件:叠回最上层
  watch(
    () => inst.value?.uid,
    (uid, prev) => {
      if (uid && prev) modalRef.value?.raise()
    }
  )

  /** 换装流派预览:契合度 当前 → 装备后 */
  const buildPreview = computed(() => {
    if (!inst.value || !template.value || isEquipped.value) return null
    const slot = template.value.slot
    const mods = { ...player.finalStats.mods }
    const applyDelta = (source: Record<string, number | undefined>, sign: 1 | -1): void => {
      for (const k in source) {
        const key = k as keyof typeof mods
        mods[key] = (mods[key] ?? 0) + sign * (source[k] ?? 0)
      }
    }
    const currentUid = inventory.equipped[slot]
    if (currentUid) {
      const currentItem = inventory.findItem(currentUid)
      if (currentItem) applyDelta(resolveEquipStats(currentItem).mods, -1)
    }
    applyDelta(resolveEquipStats(inst.value).mods, 1)
    const before = detectBuild(player.finalStats.mods)
    const after = detectBuild(mods)
    if (!before && !after) return null
    return { before, after }
  })

  const flatRows = computed(() => {
    const r = resolved.value
    if (!r) return []
    const cur = compareTarget.value
    const curFlats = cur ? resolveEquipStats(cur.item).flats : null
    const rows: { label: string; value: string; diff: string; up: boolean }[] = []
    const push = (label: string, mine: GNum, theirs: GNum | null): void => {
      if (isZero(mine) && (theirs === null || isZero(theirs))) return
      let diff = ''
      let up = true
      if (theirs !== null) {
        const d = sub(mine, theirs)
        up = d.m >= 0
        if (!isZero(d)) diff = `${up ? '+' : '-'}${formatGN({ m: Math.abs(d.m), e: d.e })}`
      }
      rows.push({ label, value: `+${formatGN(mine)}`, diff, up })
    }
    push('攻击', r.flats.attack, curFlats?.attack ?? null)
    push('防御', r.flats.defense, curFlats?.defense ?? null)
    push('生命', r.flats.maxHp, curFlats?.maxHp ?? null)
    return rows
  })

  /** 对比对象:同部位当前佩戴件(自身已佩则无) */
  const compareTarget = computed(() => {
    if (!inst.value || !template.value || isEquipped.value) return null
    const curUid = inventory.equipped[template.value.slot]
    if (!curUid || curUid === inst.value.uid) return null
    const item = inventory.findItem(curUid)
    if (!item) return null
    return { item, name: equipmentTemplate(item.templateId)?.name ?? '当前佩戴' }
  })

  /** 战斗价值对比:与「一键换装」同一把尺(equippablePower:基础平铺 + 词条战力);是取舍值,不是面板战力 */
  const powerCompare = computed(() => {
    const cur = compareTarget.value
    if (!cur || !inst.value) return null
    const mine = equippablePower(inst.value)
    const theirs = equippablePower(cur.item)
    const pct = theirs > 0 ? ((mine - theirs) / theirs) * 100 : 0
    return { mine, theirs, up: mine >= theirs, pct }
  })

  const fixedModRows = computed(() => {
    const t = template.value
    if (!t?.fixedMods) return []
    return Object.entries(t.fixedMods).map(([k, v]) => ({
      label: STAT_NAMES[k as AnyStatKey] ?? k,
      value: statValueText(k, v as number)
    }))
  })

  function close(): void {
    ui.equipDetailUid = null
  }

  function toggleEquip(): void {
    if (!inst.value || !template.value) return
    if (isEquipped.value) {
      inventory.unequip(template.value.slot)
    } else {
      inventory.equip(inst.value.uid, template.value.slot)
    }
  }

  function doUpgrade(): void {
    if (inst.value) upgradeEquipment(inst.value.uid)
  }

  const decomposeArm = ref<string | null>(null)
  function doDecompose(): void {
    if (!inst.value) return
    if (decomposeEquipment(inst.value.uid)) {
      decomposeArm.value = null
      close()
    }
  }

  function toggleLock(): void {
    if (!inst.value) return
    inventory.replaceItem({ ...inst.value, locked: !inst.value.locked })
  }
</script>
