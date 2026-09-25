<template>
  <div class="stagger-in px-4 pb-6 pt-4">
    <!-- 页签 -->
    <InkTabs v-model="tab" :tabs="TABS" />

    <!-- 装备:部位槽,点击唤起部位列表 -->
    <template v-if="tab === 'equip'">
      <!-- 装备共鸣:机制是活的,玩家却看不见 —— 同组两件即共鸣,（2/2）亮起 -->
      <div v-if="setRows.length" class="card-ink mt-3 px-4 py-2.5">
        <p class="text-[10px] text-ink-faint">装备共鸣(同组两件即共鸣,机制不叠数值)</p>
        <p v-for="s in setRows" :key="s.def.id" class="mt-1 flex items-center gap-2 text-[11px]">
          <span class="font-kai shrink-0" :class="s.active ? 'text-jade' : 'text-ink-soft'">{{ s.def.name }}</span>
          <span class="tabular shrink-0" :class="s.active ? 'text-jade' : 'text-ink-faint'">{{ s.count }}/{{ s.def.required }}</span>
          <span class="min-w-0 grow text-[10px] leading-relaxed text-ink-faint">{{ s.def.effectDesc }}</span>
          <!-- 玩家反馈「穿套装」:一键穿齐该套已持有的件,已穿更强的则不换 -->
          <button class="shrink-0 text-[10px] text-azure/90 active:opacity-60" @click="onEquipSet(s.def.id)">穿齐 →</button>
        </p>
      </div>
      <div class="mt-3 flex items-center justify-between px-1">
        <span class="text-[11px] text-ink-faint tabular">藏品 {{ inventory.bagItems.length }} · 器灵尘 {{ resources.dust }}</span>
        <span class="flex gap-3">
          <button class="-my-1.5 py-1.5 text-[11px] text-azure/90 active:opacity-60" @click="smartOpen = true">
            收纳{{ settings.smartKeep.enabled ? '·启' : '' }}
          </button>
          <button class="-my-1.5 py-1.5 text-[11px] text-cinnabar/80 active:opacity-60" @click="decomposeOpen = true">分解</button>
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
              <template v-if="row.item.note">·{{ row.item.note }}</template>
            </span>
          </template>
          <template v-else>
            <span class="grid h-4 w-4 place-items-center text-ink-ghost">·</span>
            <span class="text-[10px] text-ink-ghost">空悬</span>
          </template>
        </button>
      </div>
      <p class="mt-2 text-center text-[10px] text-ink-faint">点击部位查看候选,行囊满时新掉落自动折作器灵尘</p>
      <!-- 玩家反馈「一键装备最高阶级品质装备快捷键」:每槽换上当前最强,已是则不动 -->
      <button class="btn-ghost mt-2 w-full !py-1.5 !text-[11px]" @click="onEquipAllBest">一键 · 各部位换上当前最强</button>

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
        class="card-ink mt-3 flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-99"
        @click="craftOpen = true"
      >
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cinnabar/85 font-kai text-[19px] text-paper">炉</span>
        <span class="min-w-0 flex-1">
          <span class="block font-kai text-[14px] tracking-widest text-ink">开炉炼丹</span>
          <span class="block truncate text-[10px] leading-relaxed text-ink-faint">
            {{ recipes.length > 0 ? `已知丹方 ${recipes.length} 种 · 灵草 ${resources.herb}` : '尚不知任何丹方' }}
          </span>
        </span>
        <span class="shrink-0 text-[12px] text-ink-faint">›</span>
      </button>

      <!-- 丹匣:格子只给图标与名号,详情看弹窗 -->
      <div v-if="pillRows.length" class="mt-3 grid grid-cols-4 gap-1.5">
        <button
          v-for="row in pillRows"
          :key="row.def!.id"
          class="relative aspect-square rounded-md border transition-transform active:scale-95"
          :style="{ borderColor: qualityDef(row.def!.quality).color + '55', background: qualityDef(row.def!.quality).color + '0f' }"
          @click="pillDetail = row.def!.id"
        >
          <span class="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1">
            <GameIcon :name="row.def!.icon" :size="20" :style="{ color: qualityDef(row.def!.quality).color }" />
            <span class="w-full truncate text-center text-[9px] leading-tight" :style="{ color: qualityDef(row.def!.quality).color }">
              {{ row.def!.name }}
            </span>
          </span>
          <span class="absolute bottom-0.5 right-1 text-[9px] leading-none text-ink-soft tabular">×{{ row.count }}</span>
        </button>
      </div>
      <p v-else class="mt-10 text-center text-[12px] text-ink-ghost">丹匣空空</p>
    </template>

    <!-- 材料 -->
    <template v-else-if="tab === 'material'">
      <div class="mt-3 grid grid-cols-4 gap-1.5">
        <button
          v-for="m in materialGrid"
          :key="m.key"
          class="relative aspect-square rounded-md border border-ink/15 bg-ink/[0.03] transition-transform active:scale-95"
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

    <!-- 法宝 -->
    <template v-else>
      <p class="mt-3 px-1 text-[11px] text-ink-faint tabular">
        法宝位 {{ inventory.equippedArtifacts.length }}/{{ artifactSlots }}
        <template v-if="artifactSlots < ARTIFACT_MAX_SLOTS">· {{ artifactUnlockRealm }}境开启第{{ cnNumber(ARTIFACT_MAX_SLOTS) }}法宝位</template>
      </p>
      <!-- 祭炼到底给什么:数值都从上界常数来,不在界面里再写一份 -->
      <p class="mt-1 px-1 text-[10px] text-ink-ghost">
        祭炼一重,被动与神通各强 {{ formatPercent(ARTIFACT_LEVEL_BONUS) }},至多 {{ cnNumber(ARTIFACT_MAX_LEVEL) }} 重 ——
        顶到封顶的不再涨,卡片上标着
      </p>
      <div v-if="artifactRows.length" class="mt-2 space-y-2.5">
        <div v-for="row in artifactRows" :key="row.def.id" class="card-ink px-4 py-3">
          <div class="flex items-center gap-2">
            <GameIcon :name="row.def.icon" :size="18" :style="{ color: qualityDef(row.def.quality).color }" />
            <span class="font-kai text-[14px]" :style="{ color: qualityDef(row.def.quality).color }">{{ row.def.name }}</span>
            <QualityTag :quality="row.def.quality" />
            <!-- 「重」而不是「阶」:阶是地界与装备层级的词,法宝这一头说的是祭炼了几重 -->
            <span class="ml-auto tabular text-[11px] text-gold-ink">{{ artifactLevelLabel(row.owned.level) }}</span>
          </div>
          <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{{ row.def.desc }}</p>
          <p class="mt-1 text-[11px] text-azure">{{ passiveLines(row.def.id, row.owned.level).join(' · ') }}</p>
          <!--
            神通说明按品阶与祭炼等级现算:效果随「品阶 × (1+0.08×重数)」走,
            文案不能停在基线那一句
            (见 data/artifacts.artifactActiveText —— 战斗与这句话读的是同一个函数)
          -->
          <p class="mt-1 text-[11px] text-violet-ink">
            神通「{{ row.def.active.name }}」:{{ artifactActiveText(row.def, row.owned.level) }}
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
              {{ row.equipped ? '收回法宝' : '祭炼随身' }}
            </button>
            <button v-if="row.upCost" class="btn-ghost flex-1 !py-1.5 !text-[12px] tabular" @click="upgradeArtifact(row.def.id)">
              <!--
                两种代价都要写出来:炼化既扣悟道点、也扣灵石(见 forge.artifactUpCost),
                而按钮此前只报悟道 —— 玩家按标签算账,回头发现灵石也少了一大截。
              -->
              炼化(悟道 {{ row.upCost.wudao }} · 灵石 {{ formatGN(row.upCost.stone) }})
            </button>
          </div>
        </div>
      </div>
      <p v-else class="mt-16 text-center text-[12px] text-ink-ghost">
        尚无法宝随身
        <br />
        <span class="text-[11px]">法宝多出自际遇与强敌之手</span>
      </p>
      <p v-if="player.petId" class="mt-4 text-center text-[11px] text-ink-faint">灵兽相伴,可前往「人物」页查看</p>
    </template>

    <!-- 丹药详情 -->
    <BaseModal :open="currentPill !== null" :title="currentPill?.def?.name ?? ''" @close="pillDetail = null">
      <template v-if="currentPill?.def">
        <div class="flex items-center gap-3">
          <span
            class="grid h-12 w-12 shrink-0 place-items-center rounded-md"
            :style="{ color: qualityDef(currentPill.def.quality).color, background: qualityDef(currentPill.def.quality).color + '14' }"
          >
            <GameIcon :name="currentPill.def.icon" :size="24" />
          </span>
          <div class="min-w-0">
            <p class="text-[11px]" :style="{ color: qualityDef(currentPill.def.quality).color }">
              {{ qualityDef(currentPill.def.quality).name }}
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
      </template>
      <template #footer>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn-seal" @click="onUsePill()">服 用</button>
          <!-- 玩家反馈「批量吃丹」:存量够几枚就连服几枚,结果与连点一致 -->
          <button class="btn-ghost" @click="onUsePillBatch()">连服 ×5</button>
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
            <p class="text-[10px] text-ink-ghost">现有</p>
          </div>
        </div>
        <p class="mt-3 text-[12px] leading-relaxed text-ink-soft">{{ currentMaterial.desc }}</p>
      </template>
      <template #footer>
        <button class="btn-seal w-full" @click="materialDetail = null">收 起</button>
      </template>
    </BaseModal>

    <!-- 开炉炼丹 -->
    <BaseModal :open="craftOpen" title="开炉炼丹" wide @close="craftOpen = false">
      <p class="mb-2 text-[11px] text-ink-faint tabular">灵草 {{ resources.herb }} · 灵石 {{ formatGN(resources.spiritStone) }}</p>
      <!-- 百工技艺:做得多就精。技艺一直在影响成丹,却从不显示 —— 玩家看不到自己在长 -->
      <div v-if="skillRows.length" class="mb-2 rounded-md bg-paper-deep/60 px-3 py-2">
        <p class="text-[10px] text-ink-faint">技艺(按道分,做得多就精)</p>
        <div class="mt-1 space-y-0.5">
          <p v-for="s in skillRows" :key="s.id" class="flex items-baseline gap-2 text-[11px]">
            <span class="w-14 shrink-0 text-ink-faint">{{ s.daoName }}</span>
            <span class="w-12 shrink-0 font-kai text-ink-soft">{{ s.name }}</span>
            <span class="w-12 shrink-0" :class="s.stage === '生疏' ? 'text-ink-ghost' : 'text-jade'">{{ s.stage }}</span>
            <span class="min-w-0 text-[10px] leading-relaxed text-ink-faint">{{ s.desc }}</span>
          </p>
        </div>
      </div>
      <div v-if="recipes.length" class="max-h-64 space-y-2 overflow-y-auto">
        <div v-for="r in recipes" :key="r.def.id" class="card-ink px-3.5 py-2.5">
          <div class="flex items-center gap-3">
            <GameIcon :name="r.def.icon" :size="18" :style="{ color: qualityDef(r.def.quality).color }" />
            <div class="min-w-0 grow">
              <p class="flex items-center gap-2">
                <span class="font-kai text-[13px] text-ink">{{ r.def.name }}</span>
                <span class="text-[10px] text-ink-ghost">{{ r.able.rank }} 阶</span>
                <span v-if="r.able.overReach > 0" class="text-[10px] text-cinnabar">越阶 {{ r.able.overReach }}</span>
              </p>
              <p class="text-[11px] text-ink-faint tabular">灵草×{{ r.cost.herb }} · 灵石 {{ formatGN(r.cost.stone) }}</p>
              <!-- 炼出来是什么:方子清单此前只报代价与把握,不报成品 -->
              <p class="text-[10px] leading-relaxed text-azure/80">{{ pillFuncText(r.def) }}</p>
            </div>
            <div class="shrink-0 text-right">
              <p class="tabular text-[13px]" :class="rateClass(r.able.successRate)">{{ formatPercent(r.able.successRate) }}</p>
              <p class="text-[10px] text-ink-ghost">把握</p>
            </div>
            <div class="flex shrink-0 flex-col gap-1">
              <!-- 玩家反馈「批量炼丹」:材料够几炉就连开几炉,结果与连点一致 -->
              <button class="btn-seal shrink-0 !px-3 !py-1.5 !text-[12px]" @click="craftPill(r.def.id)">炼制</button>
              <button class="btn-ghost shrink-0 !px-3 !py-1 !text-[11px]" @click="craftPillBatch(r.def.id, 5)">连炼 ×5</button>
            </div>
          </div>
          <p v-for="w in r.able.weakness" :key="w" class="mt-1 pl-7 text-[10px] text-ink-ghost">· {{ w }}</p>
        </div>
      </div>
      <p v-else class="px-1 py-6 text-center text-[11px] leading-relaxed text-ink-faint">
        你还不知道任何丹方。
        <br />
        <span class="text-[10px]">多采多看多打听,方子自会找上门来</span>
      </p>
      <template #footer>
        <button class="btn-seal w-full" @click="craftOpen = false">收 炉</button>
      </template>
    </BaseModal>

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
              <!-- 条数带分母:这一件还剩多少条可涨,一眼看得出(上限来自品质表) -->
              {{ qualityDef(row.item.quality).name }} · {{ row.item.tier }} 阶 · 词条
              {{ row.item.affixes.length }}/{{ qualityDef(row.item.quality).affixes[1] }}
            </span>
          </button>
          <button v-if="row.equipped" class="btn-ghost shrink-0 !px-2.5 !py-1 !text-[11px]" @click="unequipSlot()">卸下</button>
          <button v-else class="btn-seal shrink-0 !px-2.5 !py-1 !text-[11px]" @click="equipItem(row.item.uid)">换上</button>
        </div>
      </div>
      <p v-else class="py-8 text-center text-[12px] text-ink-faint">此部位尚无藏品,去历练中寻些机缘吧</p>
      <p class="mt-2 text-center text-[10px] text-ink-ghost">点名称可查看详情与对比</p>
    </BaseModal>

    <!-- 一键分解:勾选品质(记忆勾选) -->
    <BaseModal :open="decomposeOpen" title="一键分解" @close="decomposeOpen = false">
      <p class="text-[11px] text-ink-faint">勾选要分解的品质,已佩戴与上锁的装备不受影响。勾选会被记住;开启智能收纳后,拾取到所选品质的装备将自动回收为器灵尘,不再占行囊;未开启智能收纳时,拾取照常入包,此勾选仅在下方「分 解」时作为筛选。行囊中已存的同类须点下方「分 解」方才化尘。</p>
      <div class="mt-2 space-y-1">
        <label
          v-for="row in decomposeRows"
          :key="row.rank"
          class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5"
          :class="settings.decomposeRanks.includes(row.rank) ? 'bg-paper-deep/80' : ''"
        >
          <input
            type="checkbox"
            class="h-4 w-4 accent-cinnabar"
            :checked="settings.decomposeRanks.includes(row.rank)"
            @change="toggleRank(row.rank)"
          />
          <span class="font-kai text-[13px]" :style="{ color: row.color }">{{ row.name }}</span>
          <span class="ml-auto tabular text-[11px] text-ink-faint">
            现存 {{ row.count }} 件
            <template v-if="row.count > 0">· {{ row.text }}</template>
          </span>
        </label>
      </div>
      <p v-if="decomposeTotal > 0" class="mt-2 text-right text-[11px] text-cinnabar/90 tabular">
        共 {{ decomposeTotal }} 件,入炉可化 {{ batchYieldText(decomposePlanned) }}
      </p>
      <template #footer>
        <button class="btn-seal w-full" :disabled="decomposeTotal === 0" @click="confirmDecompose">
          分 解{{ decomposeTotal > 0 ? `(${decomposeTotal} 件)` : '' }}
        </button>
      </template>
    </BaseModal>

    <!-- 智能收纳弹窗入口共用分解弹窗下方 -->
    <BaseModal :open="smartOpen" title="智能收纳" @close="smartOpen = false">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        开启后,新掉落先过智能裁决:无缘之物直接化尘不入包;行囊满时,值得收藏的新件会挤掉包内最弱的无缘旧物(品质低的先走,同档看层级与词条)。识别不只看品质:流派核心词条、组合技部件、成套共鸣件、条条近满的词条都算值得留。
      </p>
      <p class="mt-1 text-[11px] leading-relaxed text-ink-ghost">
        你强化过、重铸过、封存过词条的件,自动收纳一律不动 —— 要扔得你自己动手(单件分解,或勾选该品质的一键分解)。
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
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[12px] text-ink-soft">保留成套共鸣件(机制优先)</span>
        <input v-model="settings.smartKeep.keepSetPiece" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[12px] text-ink-soft">保留词条近满件</span>
        <input v-model="settings.smartKeep.keepPerfectRolls" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <template #footer>
        <!-- 一键清理二步确认:整包报废,按一下不该就此了结 -->
        <template v-if="!cleanConfirm">
          <button class="btn-ghost w-full !text-[12px]" @click="cleanConfirm = true">
            依此规则清理行囊(未锁定的无缘之物化尘)
          </button>
        </template>
        <template v-else>
          <p class="mb-2 text-center text-[11px] text-cinnabar">
            将把行囊中未锁定的无缘之物尽数化尘,共 {{ cleanCount }} 件——此举不可逆,仍要清理?
          </p>
          <div class="flex gap-2">
            <button class="btn-ghost flex-1 !text-[12px]" @click="cleanConfirm = false">再想想</button>
            <button class="btn-seal flex-1 !text-[12px]" @click="smartClean()">清理化尘</button>
          </div>
        </template>
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
  import { pillFuncText } from '@/ui/itemText'
  import {
    artifactActiveText,
    artifactDef,
    artifactLevelLabel,
    artifactNextLevelGain,
    artifactValue,
    ARTIFACT_LEVEL_BONUS,
    ARTIFACT_MAX_LEVEL,
    ARTIFACT_MAX_SLOTS,
    ARTIFACT_SLOT_UNLOCK_MAJOR,
    artifactSlotsFor
  } from '@/data/artifacts'
  import { REALMS } from '@/data/realms'
  import { EQUIP_SLOT_NAMES, equipmentTemplate } from '@/data/equipment'
  import { BAG_CAPACITY } from '@/data/constants'
  import { usePill, usePillBatch, availableRecipes, craftPill, craftPillBatch, pillCraftCost } from '@/core/pillService'
  import { craftability, type Craftability } from '@/core/craftability'
  import {
    batchYieldText,
    decomposeBatch,
    decomposeByRanks,
    decomposePreview,
    artifactUpCost,
    upgradeArtifact
  } from '@/core/forge'
  import { keepVerdict } from '@/core/smartKeep'
  import { equipSetDef, setCounts, type EquipSetDef } from '@/core/equipSet'
  import { equipAllBest, equipSetCombo } from '@/core/equipBest'
  import { useLoreStore } from '@/stores/lore'
  import { DAO_NAMES, SKILLS, skillStageName } from '@/data/crafting'
  import { cnNumber, formatGN, formatNum, formatPercent } from '@/utils/format'
  import { STAT_NAMES, statCaveat, statModPhrase } from '@/ui/statNames'
  import {
    artifactSlotReplacedToast,
    decomposeEmptyToast,
    smartCleanToast
  } from '@/ui/inventoryText'
  import type { EquipSlot, GNum, PillDef } from '@/types'
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
  const lore = useLoreStore()

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

  /** 装备共鸣:已装备件里的同组计数(未满也列出来,让玩家知道差几件) */
  const setRows = computed(() => {
    const counts = setCounts(inventory.equippedItems)
    return [...counts.entries()]
      .map(([id, count]) => {
        const def = equipSetDef(id)
        return def ? { def, count, active: count >= def.required } : null
      })
      .filter((row): row is { def: EquipSetDef; count: number; active: boolean } => row !== null)
      .sort((a, b) => Number(b.active) - Number(a.active) || b.count - a.count)
  })

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
      .filter(
        (x): x is { def: PillDef; cost: { herb: number; stone: GNum }; able: Craftability } =>
          x.def !== undefined && x.cost !== null && x.able !== null
      )
      .sort((a, b) => a.able.rank - b.able.rank)
  )

  /** 技艺一览:名(DAO_NAMES 的道名 + 技艺名)、境地(skillStageName)、这项技艺管什么 */
  const skillRows = computed(() =>
    SKILLS.map(s => {
      const lv = lore.skillLevel(s.id)
      return { id: s.id, daoName: DAO_NAMES[s.dao], name: s.name, stage: skillStageName(lv), desc: s.desc }
    })
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

  /** 材料格子:含灵石一并展示,数量走 formatNum 免得格子被长数字撑破 */
  const materialGrid = computed(() => [
    ...materialRows.value.map(m => ({
      key: m.name,
      icon: m.icon,
      name: m.name,
      desc: m.desc,
      color: 'text-ink-soft',
      display: formatNum(m.value),
      full: String(m.value)
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

  const craftOpen = ref(false)

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

  const artifactSlots = computed(() => artifactSlotsFor(player.major))
  /** 开第二法宝位的那一境的名字 —— 门槛挪动时文案跟着走,不手写「元婴」 */
  const artifactUnlockRealm = computed(() => REALMS[ARTIFACT_SLOT_UNLOCK_MAJOR]?.name ?? '')

  const artifactRows = computed(() =>
    inventory.artifacts
      .map(a => ({
        owned: a,
        def: artifactDef(a.defId)!,
        upCost: artifactUpCost(a.defId),
        equipped: inventory.equippedArtifacts.includes(a.defId)
      }))
      // 与行囊同一套排法:品质降序 → 祭炼高的在前(此前按入手先后排,越捡越乱)
      .sort(
        (a, b) =>
          qualityDef(b.def.quality).rank - qualityDef(a.def.quality).rank ||
          b.owned.level - a.owned.level ||
          a.def.name.localeCompare(b.def.name)
      )
  )

  function toggleArtifact(defId: string): void {
    const result = inventory.toggleArtifact(defId, artifactSlots.value)
    if (result === 'replaced') ui.toast(artifactSlotReplacedToast(), 'info')
  }

  function batchDecompose(): void {
    // 总账那一条由服务自己报(逐件弹提示只会互相顶掉)
    if (decomposeByRanks(settings.decomposeRanks) === 0) ui.toast(decomposeEmptyToast(), 'info')
  }

  /** 一键换装:每槽换上当前最强,报一句换了多少 */
  function onEquipAllBest(): void {
    const changed = equipAllBest()
    ui.toast(changed > 0 ? `已自动换上 ${changed} 件当前最强(品质→阶级→强化)` : '已是当前最强', changed > 0 ? 'success' : 'info')
  }

  /** 一键穿齐套装:换上该套已持有的件,已穿更强的则不换 */
  function onEquipSet(setId: string): void {
    const changed = equipSetCombo(setId)
    ui.toast(changed > 0 ? `穿齐该套:换上 ${changed} 件(更强的没动)` : '该套已穿齐,或没有更合适的件', changed > 0 ? 'success' : 'info')
  }

  // ---- 一键分解弹窗 ----
  const decomposeOpen = ref(false)

  /** 各品质档的现存件数与分解返还(与服务同一套算法:弹窗上写多少就是真给多少) */
  const decomposeRows = computed(() =>
    QUALITIES.map(q => {
      const got = decomposePreview([q.rank])
      return { rank: q.rank, name: q.name, color: q.color, count: got.count, text: batchYieldText(got) }
    })
  )

  const decomposeTotal = computed(() =>
    decomposeRows.value.filter(r => settings.decomposeRanks.includes(r.rank)).reduce((sum, r) => sum + r.count, 0)
  )

  /** 已勾选那几档的总账 */
  const decomposePlanned = computed(() => decomposePreview(settings.decomposeRanks))

  function toggleRank(rank: number): void {
    const adding = !settings.decomposeRanks.includes(rank)
    settings.decomposeRanks = adding
      ? [...settings.decomposeRanks, rank].sort((a, b) => a - b)
      : settings.decomposeRanks.filter(r => r !== rank)
    // 勾选只是「标记该档为废料」——行囊内现存同类不在此刻销毁,待玩家点「分 解」确认。
    // (智能收纳开启后,拾取到该档才会自动回收——那是不占行囊的入包裁决,与行囊内已存之物无关;未开启则照常入包。)
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

  /** 待清理件数(确认提示用) */
  const cleanCount = computed(() => inventory.bagItems.filter(it => !it.locked && !keepVerdict(it).keep).length)

  /** 清理确认态:按一次按钮先落在「再想想/清理化尘」上 */
  const cleanConfirm = ref(false)

  function smartClean(): void {
    cleanConfirm.value = false
    const targets = inventory.bagItems.filter(it => !it.locked && !keepVerdict(it).keep)
    const got = decomposeBatch(targets)
    ui.toast(smartCleanToast(got.count, batchYieldText(got)), 'info')
    smartOpen.value = false
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
    return `此方已得,熟练 ${Math.round(m * 100)}% —— 多炼几炉便到通晓`
  }
</script>
