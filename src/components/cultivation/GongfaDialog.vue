<template>
  <BaseModal
    :open="def !== undefined"
    :title="def?.name ?? ''"
    :panel-class="luster ? 'luster-frame' : undefined"
    :title-class="luster ? 'luster-title' : undefined"
    @close="close"
  >
    <!-- 最上档头饰:骑缝印(与装备/丹药详情同一套,见 ui/luster) -->
    <span v-if="luster" class="luster-crown" aria-hidden="true">{{ luster.label }}</span>
    <div v-if="def">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <QualityTag :quality="def.quality" />
        <span class="chip-ink border-ink/30 text-ink-soft">{{ GONGFA_TYPE_NAMES[def.type] }}</span>
        <span v-if="def.element" class="chip-ink" :style="{ color: ELEMENTS[def.element].color }">
          {{ ELEMENTS[def.element].name }}属性
        </span>
        <!-- 同源功法参悟时更易撞见(倾向,非独占) -->
        <span v-if="sameRoot" class="chip-ink border-gold-ink/40 text-gold-ink" title="灵根同源 · 参悟更易得">同源</span>
        <!-- 层数刻度:与主修卡/已习列表同一份(见 ui/gongfaMark);上限几层就几格 -->
        <span v-if="learned" class="ml-auto flex items-center gap-1.5">
          <span
            class="gongfa-pips"
            :class="{ 'gongfa-pips--max': mark.maxed }"
            role="img"
            :aria-label="`第 ${mark.level} 层,共 ${mark.max} 层`"
          >
            <i v-for="(on, i) in gongfaPips(mark)" :key="i" :class="{ on }" />
          </span>
          <span class="tabular text-[12px] text-gold-ink">第 {{ mark.level }}/{{ mark.max }} 层</span>
        </span>
      </div>
      <p class="mt-2 text-[12px] leading-relaxed text-ink-faint">{{ def.desc }}</p>
      <!-- 参悟门槛与藏经阁习得同源:minRealm ≤ major+1 即在池内(超前一层,spec 钉死),更高才提示 -->
      <p v-if="!learned && def.minRealm > player.major + 1" class="mt-1 text-[11px] text-cinnabar">
        需{{ REALMS[def.minRealm]?.name ?? '更高' }}境
      </p>
      <div class="ink-divider my-3" />
      <template v-if="learned">
        <div class="space-y-1.5">
          <p v-for="row in modRows" :key="row.label" class="flex justify-between text-[13px]">
            <span class="text-ink-soft">{{ row.label }}</span>
            <span class="tabular text-azure">{{ row.value }}</span>
          </p>
          <p v-if="def.skill" class="text-[13px] leading-relaxed text-cinnabar">
            {{ gongfaSkillLine(def.skill) }}
          </p>
        </div>
        <p class="mt-2 text-[11px] text-ink-faint">
          每层:<span class="tabular text-azure">{{ modsText(def.perLevelMods) }}</span>
        </p>
        <p v-if="upCost" class="mt-3 text-right text-[11px] text-ink-faint tabular">
          进修需 悟道点×{{ upCost.wudao }} · 残页×{{ upCost.page }}
        </p>
        <p v-if="upShort" class="mt-1 text-right text-[11px] leading-relaxed text-cinnabar tabular">
          {{ upShortText }}
        </p>
        <!-- 满级悟道,择一分支;规则(不可更改 · 转世不失)写在确认态里 -->
        <div v-if="fullLevel && branches.length" class="mt-3">
          <p class="mb-2 font-kai text-[12px] tracking-[0.2em] text-ink-faint">悟 道</p>
          <div v-if="branchPicked" class="rounded-md bg-paper-deep/70 px-3 py-2">
            <p class="flex items-center gap-1.5">
              <span
                v-if="branchMarkOf(branchPicked.id)"
                class="branch-glyph h-3.5 w-3.5 shrink-0"
                :class="`branch-glyph--${branchMarkOf(branchPicked.id)!.glyph}`"
                :style="{ color: branchMarkOf(branchPicked.id)!.tone }"
                aria-hidden="true"
              />
              <span class="font-kai text-[13px] text-gold-ink">{{ branchPicked.name }}</span>
              <span class="ml-2 text-[11px] text-ink-faint">{{ branchPicked.desc }}</span>
            </p>
            <p class="tabular mt-0.5 text-[11px] text-azure">{{ modsText(branchPicked.mods) }}</p>
          </div>
          <div v-else class="space-y-1.5">
            <button
              v-for="b in branches"
              :key="b.id"
              class="branch-card flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 pl-3.5 text-left active:scale-98"
              :style="branchStyle(b.id)"
              :aria-label="branchMarkOf(b.id)?.label ?? b.name"
              @click="branchConfirm = b.id"
            >
              <span class="flex min-w-0 items-start gap-2">
                <!-- 道纹:同一门功法的第几道分支,形状可数(见 ui/branchMark) -->
                <span
                  v-if="branchMarkOf(b.id)"
                  class="branch-glyph mt-0.5 h-5 w-5 shrink-0"
                  :class="`branch-glyph--${branchMarkOf(b.id)!.glyph}`"
                  :style="{ color: branchMarkOf(b.id)!.tone }"
                  aria-hidden="true"
                />
                <span class="min-w-0">
                  <span class="font-kai text-[13px] text-ink">{{ b.name }}</span>
                  <span class="ml-2 text-[11px] text-ink-faint">{{ b.desc }}</span>
                  <span class="tabular mt-0.5 block text-[11px] text-azure">{{ modsText(b.mods) }}</span>
                </span>
              </span>
              <span class="shrink-0 text-[10px] text-azure">择此道 →</span>
            </button>
            <!-- 永久抉择二步确认 -->
            <div v-if="branchConfirm" class="rounded-md bg-cinnabar/5 px-3 py-2">
              <p class="text-[10px] leading-relaxed text-cinnabar">
                择【{{ gongfaBranchDef(branchConfirm)?.name ?? '' }}】· <strong>不可更改</strong> · 转世不失
              </p>
              <p v-if="gongfaBranchDef(branchConfirm)" class="mt-1 text-[11px] tabular text-azure">
                {{ modsText(gongfaBranchDef(branchConfirm)!.mods) }}
              </p>
              <!-- !py-2(35px):!py-1 盒高不足 28px -->
              <div class="mt-1.5 flex justify-end gap-2">
                <button class="btn-ghost !px-3 !py-2 !text-[11px]" @click="branchConfirm = null">再想想</button>
                <button class="btn-seal !px-3 !py-2 !text-[11px]" @click="confirmBranch()">确认择道</button>
              </div>
            </div>
          </div>
        </div>
        <p v-else-if="fullLevel" class="mt-3 text-[11px] text-ink-faint">无悟道分支</p>
      </template>
      <!-- 未习得:给满级账 -->
      <template v-else>
        <p class="text-[12px] text-ink-faint">未习得</p>
        <p class="mt-2 text-[11px] text-ink-soft">圆满({{ def.maxLevel }} 层):</p>
        <div class="mt-1 space-y-1">
          <p v-for="row in previewRows" :key="row.label" class="flex justify-between text-[13px]">
            <span class="text-ink-faint">{{ row.label }}</span>
            <span class="tabular text-azure">{{ row.value }}</span>
          </p>
          <p v-if="def.skill" class="text-[13px] leading-relaxed text-cinnabar">
            {{ gongfaSkillLine(def.skill) }}
          </p>
        </div>
      </template>
    </div>
    <template v-if="learned" #footer>
      <div class="flex gap-2">
        <button v-if="def?.type === 'main'" class="btn-seal flex-1" :disabled="isMain" @click="setMain">
          {{ isMain ? '主修中' : '设为主修' }}
        </button>
        <button
          v-else
          class="btn-seal flex-1 text-[12px]"
          :disabled="subFull"
          @click="toggleSub"
        >
          {{ subFull ? `辅修已满 ${cultivation.subGongfa.length}/${dongfu.subGongfaSlots}` : subActionText }}
        </button>
        <!--
          满级不再让按钮消失:它与「设为主修 / 辅修」并排各占一半,一消失整行宽度就重置。
          代价算不出来(gongfaUpgradeCost 满级返 null)时改成禁用并写状态词,与装备强化、法宝炼化同规。
        -->
        <button
          class="btn-ghost flex-1"
          :disabled="!upCost || upShort !== null"
          :title="!upCost ? gongfaPeakLabel() : undefined"
          @click="def && upgradeGongfa(def.id)"
        >
          {{ !upCost ? gongfaPeakLabel() : upShort ? '进 修(缺料)' : '进 修' }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { useCultivationStore } from '@/stores/cultivation'
  import { REALMS } from '@/data/realms'
  import { useDongfuStore } from '@/stores/dongfu'
  import { usePlayerStore } from '@/stores/player'
  import { gongfaDef, gongfaMaxLevel, GONGFA_TYPE_NAMES } from '@/data/gongfa'
  import { ELEMENTS } from '@/data/linggen'
  import { branchesFor, gongfaBranchDef } from '@/data/gongfaBranches'
  import { branchMarkOf, branchTier } from '@/ui/branchMark'
  import { gongfaMark, gongfaPips } from '@/ui/gongfaMark'
  import { tint } from '@/utils/colorToken'
  import { gongfaUpgradeCost, gongfaUpgradeShort, gongfaUpgradeShortfall, upgradeGongfa } from '@/core/gongfaService'
  import { gongfaAffinity, rootElements } from '@/core/linggenAffinity'
  import { mergeMods } from '@/core/statsCalc'
  import { gongfaModsAt } from '@/stores/cultivation'
  import { STAT_NAMES, modsText, statValueText } from '@/data/statNames'
  import { gongfaSkillLine } from '@/ui/itemText'
  import { gongfaMainToast, gongfaPeakLabel, gongfaSubFullToast, gongfaSubToast, gongfaUpShortToast } from '@/ui/gongfaText'
  import type { AnyStatKey, StatMods } from '@/types'
  import BaseModal from '@/components/common/BaseModal.vue'
  import QualityTag from '@/components/common/QualityTag.vue'
  import { lusterOf } from '@/ui/luster'

  const ui = useUiStore()
  const cultivation = useCultivationStore()
  const dongfu = useDongfuStore()
  const player = usePlayerStore()

  const def = computed(() => (ui.gongfaDetailId ? gongfaDef(ui.gongfaDetailId) : undefined))
  /** 最上档功法的质感层;非最上档为 null,弹窗保持原样 */
  const luster = computed(() => (def.value ? lusterOf(def.value.quality) : null))
  const level = computed(() => (def.value ? (cultivation.learned[def.value.id] ?? 0) : 0))
  const learned = computed(() => level.value > 0)
  /** 层数形制:与主修卡/已习列表同一份(见 ui/gongfaMark) */
  const mark = computed(() => gongfaMark(def.value, level.value))
  const upCost = computed(() => (def.value ? gongfaUpgradeCost(def.value.id) : null))
  /** 缺料判定,与服务升级路径同一处 */
  const upShort = computed(() => (upCost.value ? gongfaUpgradeShort(upCost.value) : null))
  const upShortText = computed(() => {
    const c = upCost.value
    const s = upShort.value
    if (!c || !s) return ''
    return gongfaUpShortToast(s, gongfaUpgradeShortfall(c))
  })

  /** 与灵根同源:判据取自参悟权重函数 */
  const sameRoot = computed(() => gongfaAffinity(def.value?.element, rootElements(player.linggen?.roots)) > 1)

  const modRows = computed(() => {
    if (!def.value || !learned.value) return []
    const sources: StatMods[] = [gongfaModsAt(def.value.id, level.value)]
    // 已悟道分支并入同一账本,与人物总览一致
    if (branchPicked.value) sources.push(branchPicked.value.mods)
    const mods = mergeMods(sources)
    return Object.entries(mods).map(([k, v]) => ({
      label: STAT_NAMES[k as AnyStatKey] ?? k,
      value: statValueText(k, v as number)
    }))
  })

  /** 未习得时的满级预览,与习得后同一套算法 */
  const previewRows = computed(() => {
    const d = def.value
    if (!d) return []
    const mods = gongfaModsAt(d.id, d.maxLevel)
    return Object.entries(mods).map(([k, v]) => ({
      label: STAT_NAMES[k as AnyStatKey] ?? k,
      value: statValueText(k, v as number)
    }))
  })

  const isMain = computed(() => def.value && cultivation.mainGongfa === def.value.id)
  const isSub = computed(() => def.value && cultivation.subGongfa.includes(def.value.id))
  // 辅修/秘术共一个槽位预算;满了且这本不是现有辅修时置灰并报 N/M
  const subFull = computed(() => !isSub.value && cultivation.subGongfa.length >= dongfu.subGongfaSlots)
  // 秘术与辅修同槽不同门类,按钮按门类点名
  const subActionText = computed(() => {
    const label = def.value?.type === 'secret' ? '秘术' : '辅修'
    return isSub.value ? `卸下${label}` : `设为${label}`
  })

  // 满级悟道分支
  const fullLevel = computed(() => (def.value ? level.value >= gongfaMaxLevel(def.value) : false))
  const branches = computed(() => (def.value ? branchesFor(def.value.id) : []))

  /** 分支卡的品阶淡底与左内沿色:取所属功法的品阶,不与六条分支各造一色 */
  function branchStyle(branchId: string): Record<string, string> | undefined {
    const mark = branchMarkOf(branchId)
    const quality = def.value?.quality
    if (!mark || !quality) return undefined
    const tier = branchTier(quality)
    return {
      borderColor: tint(mark.tone, Math.min(0.6, tier.border)),
      background: tint(mark.tone, Math.max(0.04, tier.bg * 0.6)),
      '--branch-tone': mark.tone
    }
  }
  const branchPicked = computed(() => {
    if (!def.value) return undefined
    const id = cultivation.gongfaBranch[def.value.id]
    return id ? gongfaBranchDef(id) : undefined
  })

  /** 悟道分岔确认态(按分支 id);换功法/关弹窗即复位 */
  const branchConfirm = ref<string | null>(null)
  watch(def, () => {
    branchConfirm.value = null
  })

  function choose(branchId: string): void {
    if (!def.value) return
    if (cultivation.chooseBranch(def.value.id, branchId)) {
      ui.toast(`已悟道「${gongfaBranchDef(branchId)?.name ?? ''}」`, 'rare')
    }
  }

  function confirmBranch(): void {
    if (!branchConfirm.value) return
    const id = branchConfirm.value
    branchConfirm.value = null
    choose(id)
  }

  function close(): void {
    ui.gongfaDetailId = null
  }

  function setMain(): void {
    const d = def.value
    if (!d) return
    // 主修决定功法加成与神通,换与没换必须出声:面板上那片属性就靠这一句对上
    if (cultivation.equipMain(d.id)) ui.toast(gongfaMainToast(d.name), 'info')
  }

  function toggleSub(): void {
    const d = def.value
    if (!d) return
    const wasOn = cultivation.subGongfa.includes(d.id)
    const ok = cultivation.toggleSub(d.id, dongfu.subGongfaSlots)
    if (!ok) ui.toast(gongfaSubFullToast(dongfu.subGongfaSlots), 'warn')
    else ui.toast(gongfaSubToast(d.name, !wasOn), 'info')
  }
</script>
