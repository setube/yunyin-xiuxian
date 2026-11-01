<template>
  <div class="mt-3 flex items-center gap-2 px-1">
    <span class="shrink-0 text-[11px] text-ink-soft">随身</span>
    <template v-for="(row, k) in artifactSlotRows" :key="k">
      <div class="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-dashed border-ink/20 bg-paper-deep/50">
        <GameIcon v-if="row" :name="row.def.icon" :size="20" :style="{ color: qualityDef(row.def.quality).color }" />
        <span v-else class="font-kai text-[11px] text-ink-faint">空</span>
      </div>
    </template>
    <span v-if="artifactSlots < ARTIFACT_MAX_SLOTS" class="text-[10px] text-ink-faint">
      · {{ artifactUnlockRealm }}境开第{{ cnNumber(ARTIFACT_MAX_SLOTS) }}位
    </span>
  </div>
  <!--
    数值取常数,不在界面另写。
    「通常」不可删:神鞭/无相念珠的主体、神魔镜的回补零重即封顶,逐件由「下一重」照实报。
  -->
  <p class="mt-1 px-1 text-[10px] text-ink-faint">
    祭炼一重,被动与神通通常各强 {{ formatPercent(ARTIFACT_LEVEL_BONUS) }} · 至多 {{ cnNumber(ARTIFACT_MAX_LEVEL) }} 重
  </p>
  <div v-if="artifactRows.length" class="mt-2 space-y-2.5">
    <!-- 底色固定 6%,不随档加深:密卡深底会压低正文对比度;档位线索交给边框与角章 -->
    <div
      v-for="row in artifactRows"
      :key="row.def.id"
      class="card-ink relative px-4 py-3"
      :style="{
        borderColor: tint(qualityDef(row.def.quality).color, qualityTierStyle(row.def.quality).border),
        background: tint(qualityDef(row.def.quality).color, 0.06)
      }"
    >
      <QualityAura :quality="row.def.quality" />
      <!-- 满重:与品阶光环分开的一套形状(顶边横杠),见 ui/masteryMark -->
      <span v-if="row.mastery" class="mastery-bar" :title="row.mastery.label" />
      <span v-if="row.rare" class="absolute right-2 top-2 leading-none">
        <QualitySeal :quality="row.def.quality" :size="16" />
      </span>
      <!-- pr-3:给右上 16px 角章让位,否则与重数叠字 -->
      <div class="flex items-center gap-2" :class="{ 'pr-3': row.rare }">
        <GameIcon :name="row.def.icon" :size="18" :style="{ color: qualityDef(row.def.quality).color }" />
        <span
          class="font-kai text-[14px]"
          :class="{ 'q-plaque': row.plaque }"
          :style="{ color: qualityDef(row.def.quality).color }"
          >{{ row.def.name }}</span
        >
        <QualityTag :quality="row.def.quality" />
        <!-- 法宝等级称「重」不称「阶」:阶指地界与装备层级 -->
        <span class="ml-auto tabular text-[11px] text-gold-ink">{{ artifactLevelLabel(row.owned.level) }}</span>
      </div>
      <div class="mt-1.5 flex items-center gap-1.5">
        <span class="shrink-0 text-[10px] text-ink-faint">祭炼</span>
        <span
          v-for="n in ARTIFACT_MAX_LEVEL"
          :key="n"
          class="h-1.5 grow rounded-full transition-colors"
          :class="n <= row.owned.level ? (row.owned.level >= ARTIFACT_MAX_LEVEL ? 'bg-gold-ink' : 'bg-cinnabar/80') : 'bg-ink/6 border border-ink/15'"
        />
      </div>
      <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{{ row.def.desc }}</p>
      <p class="mt-1 flex items-baseline gap-1.5 text-[11px]">
        <span class="shrink-0 rounded bg-azure/10 px-1.5 py-0.5 text-[10px] leading-relaxed text-azure">被动</span>
        <span class="text-azure">{{ passiveLines(row.def.id, row.owned.level).join(' · ') }}</span>
      </p>
      <!-- 神通说明按祭炼现算,与战斗同读 artifactActiveText -->
      <p class="mt-1 flex items-baseline gap-1.5 text-[11px]">
        <span class="shrink-0 rounded bg-violet-ink/10 px-1.5 py-0.5 text-[10px] leading-relaxed text-violet-ink">神通</span>
        <span class="text-violet-ink">「{{ row.def.active.name }}」:{{ artifactActiveText(row.def, row.owned.level) }}</span>
      </p>
      <p v-if="nextGainText(row.def.id, row.owned.level)" class="mt-1 text-[10px] leading-relaxed text-ink-faint tabular">
        下一重:{{ nextGainText(row.def.id, row.owned.level) }}
      </p>
      <div class="mt-2.5 flex gap-2">
        <button
          class="btn-seal flex-1 !py-1.5 !text-[12px]"
          :class="{ '!bg-ink-faint': row.equipped }"
          @click="toggleArtifact(row.def.id)"
        >
          <!-- 槽满时按钮列出全部让位件(超编时不止一件,见 artifactEvictedBy) -->
          {{ row.equipped ? '收回法宝' : row.evicts.length ? `替下${row.evicts.join('、')}` : '祭炼随身' }}
        </button>
        <button
          v-if="row.upCost"
          class="btn-ghost flex-1 !py-1.5 !text-[12px] tabular"
          :disabled="row.short?.short != null"
          @click="upgradeArtifact(row.def.id)"
        >
          <!-- 两种代价都须写出:炼化扣悟道点与灵石(见 forge.artifactUpCost) -->
          炼化(悟道 {{ row.upCost.wudao }} · 灵石 {{ formatGN(row.upCost.stone) }})
        </button>
      </div>
      <!-- 缺料就地报缺口,不靠 hover -->
      <p v-if="row.upCost && row.short?.short" class="mt-1 text-right text-[10px] leading-relaxed text-cinnabar tabular">
        {{ artifactShortText(row.short) }}
      </p>
      <!--
        连炼:二步确认与强化连升同一套。
        flex-wrap + 文本保底宽不可去:否则 320 下说明被 shrink-0 钮压成 0 宽竖排。
      -->
      <div v-if="row.artPlan.levels >= 2" class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-ink/10 bg-paper-deep/50 px-2.5 py-2">
        <template v-if="batchArtConfirm !== row.def.id">
          <p class="min-w-[5rem] flex-1 text-[10px] leading-snug text-ink-soft">
            连炼至 <span class="font-kai text-[11px] text-cinnabar">第 {{ row.owned.level + row.artPlan.levels }} 重</span>
            <span class="mt-0.5 block text-[9px] text-ink-faint tabular">共耗 悟道×{{ row.artPlan.wudao }} · 灵石 {{ formatGN(row.artPlan.stone) }}</span>
          </p>
          <button class="btn-ghost shrink-0 !px-3 !py-2 !text-[11px]" @click="batchArtConfirm = row.def.id">连 炼</button>
        </template>
        <template v-else>
          <p class="min-w-[5rem] flex-1 text-[10px] leading-snug text-ink-soft">
            连炼 {{ row.artPlan.levels }} 重 · 悟道×{{ row.artPlan.wudao }} · 灵石 {{ formatGN(row.artPlan.stone) }}
          </p>
          <button class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="batchArtConfirm = null">再想想</button>
          <button class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]" @click="runArtifactBatch(row.def.id)">连 炼</button>
        </template>
      </div>
    </div>
  </div>
  <p v-else class="mt-16 text-center text-[12px] text-ink-faint">暂无法宝</p>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { useUiStore } from '@/stores/ui'
import { qualityDef } from '@/data/qualities'
import { REALMS } from '@/data/realms'
import {
  artifactActiveText,
  artifactDef,
  artifactEvictedBy,
  artifactLevelLabel,
  artifactNextLevelGain,
  artifactSlotViews,
  artifactValue,
  ARTIFACT_LEVEL_BONUS,
  ARTIFACT_MAX_LEVEL,
  ARTIFACT_MAX_SLOTS,
  ARTIFACT_SLOT_UNLOCK_MAJOR,
  artifactSlotsFor
} from '@/data/artifacts'
import { artifactBatchPlan, artifactShortfall, artifactUpCost, upgradeArtifact, upgradeArtifactBatch } from '@/core/forge'
import { STAT_NAMES, statCaveat, statModPhrase } from '@/data/statNames'
import { artifactSlotReplacedToast, artifactToggleToast } from '@/ui/inventoryText'
import { cnNumber, formatGN, formatGap, formatPercent } from '@/utils/format'
import { tint } from '@/utils/colorToken'
import { isRareQuality, qualityTierStyle } from '@/ui/qualityTier'
import { qualityAura } from '@/ui/qualityAura'
import { artifactMastery } from '@/ui/masteryMark'
import GameIcon from '@/components/common/GameIcon.vue'
import QualityTag from '@/components/common/QualityTag.vue'
import QualitySeal from '@/components/common/QualitySeal.vue'
import QualityAura from '@/components/common/QualityAura.vue'

const inventory = useInventoryStore()
const player = usePlayerStore()
const ui = useUiStore()

const artifactSlots = computed(() => artifactSlotsFor(player.major))
/** 逐槽视图按佩带顺序,不按品质:第一格最先让位,须与替下判据(store 的 slice(1))同序 */
const artifactSlotRows = computed(() =>
  artifactSlotViews(inventory.equippedArtifacts, inventory.artifacts, artifactSlots.value)
)
/** 开第二法宝位之境名,随门槛常数走 */
const artifactUnlockRealm = computed(() => REALMS[ARTIFACT_SLOT_UNLOCK_MAJOR]?.name ?? '')

const artifactRows = computed(() =>
  inventory.artifacts
    .map(a => {
      const upCost = artifactUpCost(a.defId)
      const short = upCost ? artifactShortfall(upCost) : null
      const def = artifactDef(a.defId)!
      return {
        owned: a,
        def,
        upCost,
        short,
        artPlan: artifactBatchPlan(a.defId),
        equipped: inventory.equippedArtifacts.includes(a.defId),
        rare: isRareQuality(def.quality),
        plaque: qualityAura(def.quality).plaque,
        /** 满重标记:与品阶分开的一套形制 */
        mastery: artifactMastery(a.level),
        /** 按下会替下哪几件;判据与槽位画法同源 */
        evicts: (() => {
          const ids = artifactEvictedBy(inventory.equippedArtifacts, artifactSlots.value)
          return ids.map(id => artifactDef(id)?.name ?? id)
        })()
      }
    })
    // 与行囊同一套排法:品质降序 → 祭炼高者在前
    .sort(
      (a, b) =>
        qualityDef(b.def.quality).rank - qualityDef(a.def.quality).rank ||
        b.owned.level - a.owned.level ||
        a.def.name.localeCompare(b.def.name)
    )
)

function toggleArtifact(defId: string): void {
  /** 让位名单须在换件之前取:换件会改写 equippedArtifacts,事后再取会念成刚戴上的那一件 */
  const evicted = artifactEvictedBy(inventory.equippedArtifacts, artifactSlots.value).map(
    id => artifactDef(id)?.name ?? id
  )
  const result = inventory.toggleArtifact(defId, artifactSlots.value)
  const name = artifactDef(defId)?.name ?? defId
  if (result === 'replaced') {
    // 让位件全念出来,须与按钮点名一致
    ui.toast(artifactSlotReplacedToast(evicted), 'info')
  } else if (result === 'equipped' || result === 'unequipped') {
    // 正常祭炼/收回也要有回执:按钮是同一个,不回执就看不出点成没成
    ui.toast(artifactToggleToast(name, result === 'equipped'), 'info')
  }
}

/** 连炼二步确认态 */
const batchArtConfirm = ref<string | null>(null)
function runArtifactBatch(defId: string): void {
  batchArtConfirm.value = null
  upgradeArtifactBatch(defId) // toast 由服务报
}

function artifactShortText(short: NonNullable<(typeof artifactRows.value)[number]['short']>): string {
  const parts: string[] = []
  if (short.wudao > 0) parts.push(`悟道点尚差 ${short.wudao}`)
  if (short.stone.m > 0) parts.push(`灵石尚差 ${formatGap(short.stone)}`)
  return parts.join(' · ')
}

function passiveLines(defId: string, level: number): string[] {
  const def = artifactDef(defId)
  if (!def) return []
  // 与属性汇总(store/inventory)同源
  return Object.entries(artifactValue(def, level).passive).map(([k, v]) => statModPhrase(k, v as number))
}

/** 神通主体数值的称谓 */
const ACTIVE_NOUNS: Record<string, string> = {
  damage: '威力',
  drain: '威力',
  heal: '回复',
  shield: '护盾',
  weaken: '削弱',
  sunder: '破甲',
  purge: '挣脱'
}

/** 下一重的账:被动逐项 + 神通主体 + 吸命回补;满重时为空 */
function nextGainText(defId: string, level: number): string {
  const def = artifactDef(defId)
  const gain = def ? artifactNextLevelGain(def, level) : null
  if (!gain) return ''
  const parts = gain.passive.map(p => {
    const caveat = statCaveat(p.key)
    const span = `${STAT_NAMES[p.key] ?? p.key} ${formatPercent(p.from)} → ${formatPercent(p.to)}`
    return caveat ? `${span}(${caveat})` : span
  })
  if (gain.active) {
    const noun = ACTIVE_NOUNS[def!.active.effect.type] ?? '效果'
    /** 零重即封顶的件直接报「已至上限」与封顶值 */
    const alreadyCapped = gain.active.capped && Math.abs(gain.active.to - gain.active.from) < 1e-9
    parts.push(
      alreadyCapped
        ? `神通${noun}已至上限(${formatPercent(gain.active.to)})`
        : `神通${noun} ${formatPercent(gain.active.from)} → ${formatPercent(gain.active.to)}${gain.active.capped ? '(已至上限)' : ''}`
    )
  } else {
    parts.push('神通不变')
  }
  if (gain.heal) {
    parts.push(`回补 ${formatPercent(gain.heal.from)} → ${formatPercent(gain.heal.to)}${gain.heal.capped ? '(已至上限)' : ''}`)
  }
  return parts.join(' · ')
}
</script>
