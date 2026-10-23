<template>
  <!-- 法宝 -->
  <!-- 随身法宝槽:装着谁、空着哪一格,一眼即知 —— 不再只是一个 "x/2" 数字 -->
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
    祭炼到底给什么:数值都从上界常数来,不在界面里再写一份。
    但「被动与神通通常各强」不是每件都成立 —— 神鞭/无相念珠的主体零重就封顶,
    神魔镜的回补零重就满十成(见 ui/codex 的按件提示)。总纲只承诺「多数」,
    并指到每张卡上的「下一重」,免得全局句替那几件撒谎。
  -->
  <p class="mt-1 px-1 text-[10px] text-ink-faint">
    祭炼一重,被动与神通通常各强 {{ formatPercent(ARTIFACT_LEVEL_BONUS) }},至多 {{ cnNumber(ARTIFACT_MAX_LEVEL) }} 重 ——
    已到顶的那一侧不再涨,每张卡的「下一重」会照实写清
  </p>
  <div v-if="artifactRows.length" class="mt-2 space-y-2.5">
    <!--
      品阶晕染:边框随三档加深,天/仙/神另盖角章。
      底色固定 6%,不随档位加到 10%/13% —— 法宝行是多行文字的密卡,
      深底色会压低正文对比度;档位线索交给边框与角章承担。
    -->
    <div
      v-for="row in artifactRows"
      :key="row.def.id"
      class="card-ink relative px-4 py-3"
      :style="{
        borderColor: tint(qualityDef(row.def.quality).color, qualityTierStyle(row.def.quality).border),
        background: tint(qualityDef(row.def.quality).color, 0.06)
      }"
    >
      <span v-if="row.rare" class="absolute right-2 top-2 leading-none">
        <QualitySeal :quality="row.def.quality" :size="16" />
      </span>
      <!-- 角章占住右上 16px + 右边距,重数往左让 12px,避免两枚字叠在一起 -->
      <div class="flex items-center gap-2" :class="{ 'pr-3': row.rare }">
        <GameIcon :name="row.def.icon" :size="18" :style="{ color: qualityDef(row.def.quality).color }" />
        <span class="font-kai text-[14px]" :style="{ color: qualityDef(row.def.quality).color }">{{ row.def.name }}</span>
        <QualityTag :quality="row.def.quality" />
        <!-- 「重」而不是「阶」:阶是地界与装备层级的词,法宝这一头说的是祭炼了几重 -->
        <span class="ml-auto tabular text-[11px] text-gold-ink">{{ artifactLevelLabel(row.owned.level) }}</span>
      </div>
      <!-- 祭炼进度:九段横条,练几重亮几格;满九整条转金 —— 进度不再只是一枚数字标签 -->
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
      <!--
        神通说明按品阶与祭炼等级现算:效果随「品阶 × (1+0.08×重数)」走,
        文案不能停在基线那一句
        (见 data/artifacts.artifactActiveText —— 战斗与这句话读的是同一个函数)
      -->
      <p class="mt-1 flex items-baseline gap-1.5 text-[11px]">
        <span class="shrink-0 rounded bg-violet-ink/10 px-1.5 py-0.5 text-[10px] leading-relaxed text-violet-ink">神通</span>
        <span class="text-violet-ink">「{{ row.def.active.name }}」:{{ artifactActiveText(row.def, row.owned.level) }}</span>
      </p>
      <!--
        下一重给多少:按钮只报代价,玩家得自己按 ×1.08 心算 —— 而「值不值」
        正是按下之前要想清楚的事(数值由 artifactNextLevelGain 算,含封顶提示)。
      -->
      <p v-if="nextGainText(row.def.id, row.owned.level)" class="mt-1 text-[10px] leading-relaxed text-ink-faint tabular">
        下一重:{{ nextGainText(row.def.id, row.owned.level) }}
      </p>
      <div class="mt-2.5 flex gap-2">
        <button
          class="btn-seal flex-1 !py-1.5 !text-[12px]"
          :class="{ '!bg-ink-faint': row.equipped }"
          @click="toggleArtifact(row.def.id)"
        >
          <!--
            槽满时把「会让位的那几件」直接写在按钮上 —— 替下谁是有规则的(最早祭炼的,
            排在前头),不是随机;看不见这一条,换件就成了掷骰子。列表本来就超编时
            让位的是不止一件,按钮也照实全念出来(见 artifactEvictedBy)。
          -->
          {{ row.equipped ? '收回法宝' : row.evicts.length ? `替下${row.evicts}` : '祭炼随身' }}
        </button>
        <button
          v-if="row.upCost"
          class="btn-ghost flex-1 !py-1.5 !text-[12px] tabular"
          :disabled="row.short?.short != null"
          @click="upgradeArtifact(row.def.id)"
        >
          <!--
            两种代价都要写出来:炼化既扣悟道点、也扣灵石(见 forge.artifactUpCost),
            而按钮此前只报悟道 —— 玩家按标签算账,回头发现灵石也少了一大截。
          -->
          炼化(悟道 {{ row.upCost.wudao }} · 灵石 {{ formatGN(row.upCost.stone) }})
        </button>
      </div>
      <!-- 缺料就地报缺口,不靠 hover 才看得见:悟道点与灵石的来路不同 -->
      <p v-if="row.upCost && row.short?.short" class="mt-1 text-right text-[10px] leading-relaxed text-cinnabar tabular">
        {{ artifactShortText(row.short) }}
      </p>
      <!--
        祭炼连炼:一重一重点太累,与强化连升同一套二步确认 ——
        行只在一口气能连炼 ≥2 重时出现(只够一重时,单炼按钮就是那一重)。
        flex-wrap + 文本保底宽:窄屏放不下说明与双钮同排时,说明独占整行、钮换行 ——
        与强化连升/洞府连升同一处外伤(320 下说明被 shrink-0 钮压成 0 宽竖排)。
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
            一步连炼 {{ row.artPlan.levels }} 重,花上面那笔总账 —— 仍要?
          </p>
          <button class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="batchArtConfirm = null">再想想</button>
          <button class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]" @click="runArtifactBatch(row.def.id)">连 炼</button>
        </template>
      </div>
    </div>
  </div>
  <p v-else class="mt-16 text-center text-[12px] text-ink-faint">
    尚无法宝随身
    <br />
    <span class="text-[11px]">法宝多出自际遇与强敌之手</span>
  </p>
  <p v-if="player.petId" class="mt-4 text-center text-[11px] text-ink-faint">灵兽相伴,可前往「人物」页查看</p>
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
import { artifactSlotReplacedToast } from '@/ui/inventoryText'
import { artifactShortToast } from '@/ui/forgeText'
import { cnNumber, formatGN, formatPercent } from '@/utils/format'
import { tint } from '@/utils/colorToken'
import { isRareQuality, qualityTierStyle } from '@/ui/qualityTier'
import GameIcon from '@/components/common/GameIcon.vue'
import QualityTag from '@/components/common/QualityTag.vue'
import QualitySeal from '@/components/common/QualitySeal.vue'

/**
 * 法宝面板 —— 随身槽、祭炼读数与炼化动作。
 *
 * 自 InventoryView 拆出:这一册只读法宝自身的定义与库存,与丹药/材料/装备三册
 * 不共享状态;确认态 batchArtConfirm 随本体走,宿主不再代管。
 */
const inventory = useInventoryStore()
const player = usePlayerStore()
const ui = useUiStore()

const artifactSlots = computed(() => artifactSlotsFor(player.major))
/**
 * 逐槽视图:**按佩带顺序**,不是按品质排序。
 *
 * 顺序本身就是信息 —— 第一格是最早祭炼的那件,槽满时正是它先让位。
 * 从前这里拿「品质降序的法宝行」再过滤出已佩带者:高品阶的件永远画在第一格,
 * 而实际先被替下的可能是另一件 —— 玩家照着槽位做决定,做的却是另一件事。
 * 替下判据(store 的 slice(1))与这份画法现在读同一个顺序。
 */
const artifactSlotRows = computed(() =>
  artifactSlotViews(inventory.equippedArtifacts, inventory.artifacts, artifactSlots.value)
)
/** 开第二法宝位的那一境的名字 —— 门槛挪动时文案跟着走,不手写「元婴」 */
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
        /**
         * 这一件按下去会替下哪几件(槽未满、或本来就带着它时为空)。
         * 替下判据与槽位画法同源 —— 玩家在按钮上读到的那些,就是真的让位的那些。
         */
        evicts: (() => {
          const ids = artifactEvictedBy(inventory.equippedArtifacts, artifactSlots.value)
          return ids.map(id => artifactDef(id)?.name ?? id)
        })()
      }
    })
    // 与行囊同一套排法:品质降序 → 祭炼高的在前(此前按入手先后排,越捡越乱)
    .sort(
      (a, b) =>
        qualityDef(b.def.quality).rank - qualityDef(a.def.quality).rank ||
        b.owned.level - a.owned.level ||
        a.def.name.localeCompare(b.def.name)
    )
)

function toggleArtifact(defId: string): void {
  /**
   * 让位名单必须在**动手之前**取。
   *
   * `artifactRows` 里的 `evicts` 是从 `inventory.equippedArtifacts` 现算的,而
   * toggle 一按下去这个列表就被改写了 —— 事后再去 `artifactRows.value` 里找这一行,
   * 读到的是「新佩上来的这一件,按当前列表会让谁让位」,于是 toast 念的是**刚戴上**
   * 的那一件的名字(实测 1 位之下换件:「替下玄天镜」,而真正让位的墨玉葫芦只字未提)。
   * 玩家照 toast 去行囊核对,永远对不上账。
   */
  const evicted = artifactEvictedBy(inventory.equippedArtifacts, artifactSlots.value).map(
    id => artifactDef(id)?.name ?? id
  )
  const result = inventory.toggleArtifact(defId, artifactSlots.value)
  if (result === 'replaced') {
    // 让位的哪几件照实全念出来:按钮上点名了哪些,归来卸下的就得是哪些
    // (列表本来就超编时让位的不止一件,只报一件就对不上账。见 artifactEvictedBy)
    ui.toast(artifactSlotReplacedToast(evicted), 'info')
  }
}

/** 祭炼连炼的二步确认态;换件/换重自动重算,行与确认自会随之进退 */
const batchArtConfirm = ref<string | null>(null)
function runArtifactBatch(defId: string): void {
  batchArtConfirm.value = null
  upgradeArtifactBatch(defId) // 总账那一声与 toast 由服务自己报
}

/** 缺口文案:两样都缺就都报出来,并给同一条 toast 的来路提示 */
function artifactShortText(short: NonNullable<(typeof artifactRows.value)[number]['short']>): string {
  const parts: string[] = []
  if (short.wudao > 0) parts.push(`悟道尚差 ${short.wudao}`)
  if (short.stone.m > 0) parts.push(`灵石尚差 ${formatGN(short.stone)}`)
  return `${parts.join(' · ')} —— ${artifactShortToast(short.short!, {
    wudao: short.wudao,
    stone: formatGN(short.stone)
  })}`
}

function passiveLines(defId: string, level: number): string[] {
  const def = artifactDef(defId)
  if (!def) return []
  // 与属性汇总(store/inventory)同源:卡片上写多少,身上加的就是多少
  return Object.entries(artifactValue(def, level).passive).map(([k, v]) => statModPhrase(k, v as number))
}

/** 神通主体那个数说的是什么(用药名之外的话:威力 / 护盾 / 破解…) */
const ACTIVE_NOUNS: Record<string, string> = {
  damage: '威力',
  drain: '威力',
  heal: '回复',
  shield: '护盾',
  weaken: '削弱',
  sunder: '破甲',
  purge: '挣脱'
}

/**
 * 祭炼下一重的账:被动逐项 + 神通主体 + 吸命回补,到顶的标「已至上限」。
 * 已达满重(artifactNextLevelGain 返回 null)时不显示这一行。
 */
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
    /**
     * 零重就顶到封顶的那几件(神鞭的破甲、神魔镜的回补…)再炼也不会更高,
     * 写「50% → 50%(已至上限)」等于让人自己看出来 —— 直接说清只涨被动。
     */
    const alreadyCapped = gain.active.capped && Math.abs(gain.active.to - gain.active.from) < 1e-9
    parts.push(
      alreadyCapped
        ? `神通${noun}已至上限(${formatPercent(gain.active.to)}),祭炼只涨被动`
        : `神通${noun} ${formatPercent(gain.active.from)} → ${formatPercent(gain.active.to)}${gain.active.capped ? '(已至上限)' : ''}`
    )
  } else {
    parts.push('神通不随祭炼变')
  }
  if (gain.heal) {
    parts.push(`回补 ${formatPercent(gain.heal.from)} → ${formatPercent(gain.heal.to)}${gain.heal.capped ? '(已至上限)' : ''}`)
  }
  return parts.join(' · ')
}
</script>
