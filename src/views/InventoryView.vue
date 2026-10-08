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
          class="relative aspect-square rounded-md border transition-transform active:scale-98"
          :style="{ borderColor: tint(qualityDef(row.def!.quality).color, 0.33), background: tint(qualityDef(row.def!.quality).color, 0.06) }"
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

    <!-- 法宝 -->
    <template v-else>
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
      <!-- 祭炼到底给什么:数值都从上界常数来,不在界面里再写一份 -->
      <p class="mt-1 px-1 text-[10px] text-ink-faint">
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

    <!-- 丹药详情 -->
    <BaseModal :open="currentPill !== null" :title="currentPill?.def?.name ?? ''" @close="pillDetail = null">
      <template v-if="currentPill?.def">
        <div class="flex items-center gap-3">
          <span
            class="grid h-12 w-12 shrink-0 place-items-center rounded-md"
            :style="{ color: qualityDef(currentPill.def.quality).color, background: tint(qualityDef(currentPill.def.quality).color, 0.08) }"
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
          <!-- 批量吃丹:存量够几枚就连服几枚。文案把「×5」改成真数 —— 只剩 2 枚还挂着 ×5,
               结算却吃到没有就停,界面说的与做的对不上;只够 1 枚时连服没有意义,直接不摆 -->
          <button v-if="(currentPill?.count ?? 0) >= 2" class="btn-ghost" @click="onUsePillBatch()">
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

    <!-- 开炉炼丹 -->
    <BaseModal :open="craftOpen" title="开炉炼丹" wide @close="craftOpen = false">
      <p class="mb-2 text-[11px] text-ink-faint tabular">灵草 {{ resources.herb }} · 灵石 {{ formatGN(resources.spiritStone) }}</p>
      <!--
        被动翻检全程无进度条:玩家只知道某天突然翻出一张方子,不知道它快到了。
        这一行把「下一件事」报成时间 —— 读数与 studyTick 同序,见 core/loreService.studyEta
      -->
      <p v-if="studyLine" class="mb-2 text-[10px] leading-relaxed text-ink-faint tabular">{{ studyLine }}</p>
      <!--
        方子列表不再自带滚动框:弹窗正文本身就是滚动容器,两层滚动叠在一起时,
        内层底边会把下一张卡片切得只剩一条圆角,玩家看不出还能滚(议题 #21)。
      -->
      <div v-if="recipes.length" class="space-y-2">
        <div v-for="r in recipes" :key="r.def.id" class="card-ink px-3.5 py-2.5">
          <!--
            信息在上、操作在下。从前「把握」与两枚按钮并排挂在右侧、宽度写死,
            加了「连炼 ×5」之后右列更宽,窄屏上左列只剩两个字宽,丹名被压成竖排(议题 #21)。
          -->
          <div class="flex items-start gap-2.5">
            <GameIcon :name="r.def.icon" :size="18" class="mt-px shrink-0" :style="{ color: qualityDef(r.def.quality).color }" />
            <div class="min-w-0 grow">
              <p class="flex flex-wrap items-baseline gap-x-2">
                <span class="whitespace-nowrap font-kai text-[13px] text-ink">{{ r.def.name }}</span>
                <span class="whitespace-nowrap text-[10px] text-ink-faint">{{ r.able.rank }} 阶</span>
                <span v-if="r.able.overReach > 0" class="whitespace-nowrap text-[10px] text-cinnabar">越阶 {{ r.able.overReach }}</span>
                <span v-if="r.plan.rounds > 0" class="whitespace-nowrap text-[10px] text-jade">现可炼 {{ r.plan.rounds }} 炉</span>
              </p>
              <p class="text-[11px] text-ink-faint tabular">{{ HERB_GRADE_SHORT[r.cost.grade] }}灵草×{{ r.cost.herb }} · 灵石 {{ formatGN(r.cost.stone) }}</p>
              <!-- 炼出来是什么:方子清单此前只报代价与把握,不报成品 -->
              <p class="text-[10px] leading-relaxed text-azure">{{ pillFuncText(r.def) }}</p>
              <p v-for="w in r.able.weakness" :key="w" class="mt-0.5 text-[10px] text-ink-faint">· {{ w }}</p>
            </div>
          </div>
          <div class="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <p class="whitespace-nowrap text-[10px] text-ink-faint">
              把握
              <span class="tabular text-[13px]" :class="rateClass(r.able.successRate)">{{ formatPercent(r.able.successRate) }}</span>
            </p>
            <div class="ml-auto flex shrink-0 gap-1.5">
              <!-- 玩家反馈「批量炼丹」:材料够几炉就连开几炉,结果与连点一致。
                   !py-1.5 盒高 27px 低于 28px 阈值(layout-check 弹窗巡逻实测),
                   抬到 !py-2 到 35px,批量炼制是高频操作。
                   料足(plan>5)时多一枚「炼满」:按当前料保底算清能开几炉,
                   一次开完,预览与执行共用 craftBatchPlan -->
              <template v-if="r.plan.rounds > 0">
                <template v-if="pillFullId !== r.def.id">
                  <button class="btn-ghost !px-3 !py-2 !text-[11px]" @click="craftPillBatch(r.def.id, 5)">连炼 ×5</button>
                  <button
                    v-if="r.plan.rounds > 5"
                    class="btn-ghost !px-2.5 !py-2 !text-[11px]"
                    @click="pillFullId = r.def.id"
                  >
                    炼 满 ×{{ r.plan.rounds }}
                  </button>
                  <button class="btn-seal !px-3 !py-2 !text-[12px]" @click="craftPill(r.def.id)">炼制</button>
                </template>
                <template v-else>
                  <!-- 开的是累计总账,按一下不该就此了结:二步确认与分解/散去同款 -->
                  <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="pillFullId = null">再想想</button>
                  <button class="btn-seal !px-2.5 !py-2 !text-[11px]" @click="runCraftFull(r.def.id, r.plan.rounds)">
                    开 炉 ×{{ r.plan.rounds }}
                  </button>
                </template>
              </template>
              <!-- 缺料/掌握不足:不摆注定点不动的按钮,把真实阻拦摊在眼前 -->
              <span v-else class="whitespace-nowrap text-[10px] text-cinnabar">{{ r.plan.blocked }}</span>
            </div>
          </div>
          <p
            v-if="pillFullId === r.def.id"
            class="mt-1.5 text-[9px] leading-relaxed text-cinnabar"
          >
            开 {{ r.plan.rounds }} 炉,约耗 {{ HERB_GRADE_SHORT[r.cost.grade] }}灵草×{{ r.plan.herb }} · 灵石 {{ formatGN(r.plan.stone) }};
            炸炉按技艺省下残料,或可再多开几炉 —— 仍要?
          </p>
        </div>
      </div>
      <p v-else class="px-1 py-6 text-center text-[11px] leading-relaxed text-ink-faint">
        你还不知道任何丹方。
        <br />
        <span class="text-[10px]">多采多看多打听,方子自会找上门来</span>
      </p>
      <!--
        百工技艺:做得多就精。技艺一直在影响成丹,却从不显示 —— 玩家看不到自己在长。
        排在方子之后:九项技艺在窄屏上要占半屏,放在前面会把方子压到折叠线以下。
        说明一栏至少留 9 个字宽,不够就整段换到下一行,不再被三列定宽挤成竖排。
      -->
      <div v-if="skillRows.length" class="mt-3 rounded-md bg-paper-deep/60 px-3 py-2">
        <p class="text-[10px] text-ink-faint">技艺(按道分,做得多就精)</p>
        <div class="mt-1 space-y-1">
          <p v-for="s in skillRows" :key="s.id" class="flex flex-wrap items-baseline gap-x-2 text-[11px]">
            <span class="w-14 shrink-0 text-ink-faint">{{ s.daoName }}</span>
            <span class="w-12 shrink-0 font-kai text-ink-soft">{{ s.name }}</span>
            <span class="w-12 shrink-0" :class="s.stage === '生疏' ? 'text-ink-faint' : 'text-jade'">{{ s.stage }}</span>
            <span class="min-w-[9em] flex-1 text-[10px] leading-relaxed text-ink-faint">{{ s.desc }}</span>
          </p>
        </div>
      </div>
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
          <button class="min-w-0 grow text-left active:opacity-60" @click="openDetail(row.item.uid)">
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
          <button v-if="row.equipped" class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="unequipSlot()">卸下</button>
          <button v-else class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]" @click="equipItem(row.item.uid)">换上</button>
        </div>
      </div>
      <p v-else class="py-6 text-center">
        <span class="empty-seal" aria-hidden="true">空</span>
        <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">此部位尚无藏品</span>
        <span class="mt-1 block text-[10px] leading-relaxed text-ink-faint">去历练中寻些机缘吧</span>
      </p>
      <p class="mt-2 text-center text-[10px] text-ink-faint">点名称可查看详情与对比</p>
    </BaseModal>

    <!-- 一键分解:勾选品质(记忆勾选)。纯手动批量动作 —— 与「智能收纳」的自动取舍互不干扰 -->
    <BaseModal :open="decomposeOpen" title="一键分解(手动)" @close="decomposeOpen = false">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        勾选要化掉的品质,只管
        <span class="text-ink-soft">行囊里现存</span>
        之物;已佩戴与上锁的装备不受影响。这份勾选会留作下次,却只在
        <span class="text-ink-soft">下文「分 解」时作数</span>
        —— 历练中掉落的装备不在此列,去留另由「智能收纳」的尺度把持。
      </p>
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
      <p v-if="decomposeTotal > 0" class="mt-2 text-right text-[11px] text-cinnabar tabular">
        共 {{ decomposeTotal }} 件,入炉可化 {{ batchYieldText(decomposePlanned) }}
      </p>
      <template #footer>
        <button class="btn-seal w-full" :disabled="decomposeTotal === 0" @click="confirmDecompose">
          分 解{{ decomposeTotal > 0 ? `(${decomposeTotal} 件)` : '' }}
        </button>
      </template>
    </BaseModal>

    <!-- 智能收纳:独立的自动取舍策略 —— 与「一键分解」的手动动作井水不犯河水 -->
    <BaseModal :open="smartOpen" title="智能收纳(自动)" @close="smartOpen = false">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        开启后,新落之物在入行囊前先过一关:值得留的留下,无缘的一缕化尘;行囊已满且有无缘旧物时,新至的宝物会顶走包里最弱的一件,无可顶者便也化尘。
      </p>
      <!-- 状态一眼:策略一段话说清,不必把六个开关拼起来读 -->
      <div
        class="mt-2.5 rounded-md px-3 py-2 text-[10px] leading-relaxed"
        :class="settings.smartKeep.enabled ? 'bg-jade/8 text-jade' : 'bg-ink/4 text-ink-faint'"
      >
        {{ smartStatusLine }}
      </div>

      <!-- 规则 · 门槛:总开关 + 两条自留线(品质线 与 阶级线,任一达标即留) -->
      <p class="mb-1 mt-3 font-kai text-[11px] tracking-wider text-ink-soft">规则 · 门槛</p>
      <div class="rounded-md border border-ink/8 bg-paper-deep/40 px-2.5 py-1">
        <label class="flex items-center justify-between py-1.5">
          <span class="text-[13px] text-ink-soft">启用智能收纳</span>
          <input v-model="settings.smartKeep.enabled" type="checkbox" class="h-4 w-4 accent-cinnabar" />
        </label>
        <!-- 品质线:九档全列,从哪一档起珍 —— 不只灵品/玄品/地品三档可选 -->
        <div class="border-t border-ink/6 py-1.5">
          <p class="mb-1.5 text-[12px] text-ink-soft">品质线 · 自「{{ KEEP_QUALITY_CHOICES.find(q => q.rank === settings.smartKeep.minQuality)?.name ?? '灵品' }}」起珍藏</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="q in KEEP_QUALITY_CHOICES"
              :key="q.rank"
              class="chip-ink !py-1.5 text-[10px]"
              :class="settings.smartKeep.minQuality === q.rank ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
              @click="settings.smartKeep.minQuality = q.rank"
            >
              {{ q.name }}
            </button>
          </div>
        </div>
        <!-- 阶级线:阶数到线的,背得动高阶料子,无论品质皆留;与品质线「或」关系 -->
        <div class="border-t border-ink/6 py-1.5">
          <p class="mb-1.5 text-[12px] text-ink-soft">
            阶级线 ·
            {{ settings.smartKeep.keepMinTier > 0 ? `自 ${settings.smartKeep.keepMinTier} 阶起,不分品质皆留` : '不设(只看品质与识宝)' }}
          </p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="t in KEEP_TIER_CHOICES"
              :key="t"
              class="chip-ink !py-1.5 text-[10px]"
              :class="settings.smartKeep.keepMinTier === t ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
              @click="settings.smartKeep.keepMinTier = t"
            >
              {{ t === 0 ? '不设' : `${t} 阶` }}
            </button>
          </div>
        </div>
      </div>

      <!-- 识宝 · 单看品质不够:这四项认「值得」,不认「贵贱」 -->
      <p class="mb-1 mt-3 font-kai text-[11px] tracking-wider text-ink-soft">识宝 · 品质之外的值得</p>
      <div class="rounded-md border border-ink/8 bg-paper-deep/40 px-2.5 py-1">
        <label class="flex items-center justify-between py-1.5">
          <span class="text-[12px] text-ink-soft">主流派核心词条件</span>
          <input v-model="settings.smartKeep.keepCoreAffix" type="checkbox" class="h-4 w-4 accent-cinnabar" />
        </label>
        <label class="flex items-center justify-between py-1.5">
          <span class="text-[12px] text-ink-soft">组合技部件(副体系词条)</span>
          <input v-model="settings.smartKeep.keepComboPiece" type="checkbox" class="h-4 w-4 accent-cinnabar" />
        </label>
        <label class="flex items-center justify-between py-1.5">
          <span class="text-[12px] text-ink-soft">成套共鸣件(机制优先)</span>
          <input v-model="settings.smartKeep.keepSetPiece" type="checkbox" class="h-4 w-4 accent-cinnabar" />
        </label>
        <label class="flex items-center justify-between py-1.5">
          <span class="text-[12px] text-ink-soft">词条近满件</span>
          <input v-model="settings.smartKeep.keepPerfectRolls" type="checkbox" class="h-4 w-4 accent-cinnabar" />
        </label>
      </div>
      <p class="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
        强化、重铸、转入过或带封存的件不动。
      </p>

      <!-- 划界 · 与「一键分解」互不读钩 -->
      <p class="mb-1 mt-3 font-kai text-[11px] tracking-wider text-ink-soft">与「一键分解」各归各帐</p>
      <p class="text-[10px] leading-relaxed text-ink-faint">
        「一键分解」只处置行囊里现存之物,须你亲手动;这里只判掉落之后的去留 ——
        两件事各归各管,调了这一头,那一头不受牵连。
      </p>
      <template #footer>
        <!--
          一键清理二步确认:整包报废,按一下不该就此了结。
          确认页直接列清单(预览与下手同一份名单)+ 入炉收益 —— 化的是什么,一目了然
        -->
        <template v-if="!cleanConfirm">
          <button
            class="btn-ghost w-full !text-[12px]"
            :class="cleanCount ? '' : 'opacity-45'"
            :disabled="cleanCount === 0"
            @click="cleanConfirm = true"
          >
            依此规则清理行囊{{ cleanCount ? `(无缘之物化尘 · ${cleanCount} 件)` : '(已无可清之缘)' }}
          </button>
        </template>
        <template v-else>
          <p class="mb-1 text-center text-[11px] text-cinnabar tabular">
            将化尘 {{ cleanCount }} 件,入炉可得 {{ batchYieldText(cleanYield) }}——此举不可逆
          </p>
          <div class="mb-2 max-h-36 overflow-y-auto rounded-md border border-ink/8 bg-paper-deep/40 px-2.5 py-1.5">
            <p
              v-for="t in cleanPreview.slice(0, SWEEP_PREVIEW_LIMIT)"
              :key="t.item.uid"
              class="flex items-baseline justify-between gap-2 py-1 text-[10px]"
            >
              <span class="min-w-0 truncate font-kai" :style="{ color: qualityDef(t.item.quality).color }">
                {{ equipmentTemplate(t.item.templateId)?.name ?? '旧物' }}
              </span>
              <span class="shrink-0 text-ink-faint tabular">{{ t.item.tier }} 阶 · {{ t.reason }}</span>
            </p>
            <p v-if="cleanPreview.length > SWEEP_PREVIEW_LIMIT" class="mt-0.5 border-t border-ink/6 pt-0.5 text-[9px] text-ink-faint">
              … 其余 {{ cleanPreview.length - SWEEP_PREVIEW_LIMIT }} 件从略
            </p>
            <p v-if="!cleanPreview.length" class="py-0.5 text-[10px] text-jade">此尺度下,行囊已无一缘可清</p>
          </div>
          <!-- 行囊若已满:榜首那件就是下一件新物的顶位对象,先把临头的事说破 -->
          <p v-if="bagFull && cleanPreview.length" class="mb-2 text-[9px] leading-relaxed text-ink-faint">
            行囊已满 —— 若无意外,下一件新宝会先顶走榜首「{{ firstSweepName }}」。
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
  import { useRoute } from 'vue-router'
  import { useInventoryStore } from '@/stores/inventory'
  import { useResourcesStore } from '@/stores/resources'
  import { usePlayerStore } from '@/stores/player'
  import { useUiStore } from '@/stores/ui'
  import { useSettingsStore } from '@/stores/settings'
  import { qualityDef, QUALITIES } from '@/data/qualities'
  import { pillDef } from '@/data/pills'
  import { HERB_GRADE_SHORT, type HerbGrade } from '@/data/herbGrades'
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
  import { EQUIP_SLOT_NAMES, MAX_EQUIP_TIER, equipmentTemplate } from '@/data/equipment'
  import { BAG_CAPACITY } from '@/data/constants'
  import { usePill, usePillBatch, availableRecipes, craftBatchPlan, craftPill, craftPillBatch, pillCraftCost } from '@/core/pillService'
  import { craftability, type Craftability } from '@/core/craftability'
  import {
    batchYieldText,
    type DecomposeBatch,
    decomposeBatch,
    decomposeByRanks,
    decomposePreview,
    artifactUpCost,
    artifactBatchPlan,
    upgradeArtifact,
    upgradeArtifactBatch
  } from '@/core/forge'
  import { sweepTargets } from '@/core/smartKeep'
  import { salvageOf } from '@/core/salvage'
  import { add, gnZero } from '@/utils/gnum'
  import { equipSetDef, setCounts, type EquipSetDef } from '@/core/equipSet'
  import { bestEquipFor, equipAllBest, equipSetCombo, equipSetPreview, EQUIP_SLOTS, unequipAllEquipped } from '@/core/equipBest'
  import { useLoreStore } from '@/stores/lore'
  import { studyEta } from '@/core/loreService'
  import { DAO_NAMES, SKILLS, skillStageName } from '@/data/crafting'
  import { cnNumber, formatDuration, formatGN, formatNum, formatPercent } from '@/utils/format'
  import { tint } from '@/utils/colorToken'
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
  const SLOTS: EquipSlot[] = ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman']
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
      .map(id => ({
        def: pillDef(id),
        cost: pillCraftCost(id),
        able: craftability(id),
        plan: craftBatchPlan(id)
      }))
      .filter(
        (x): x is { def: PillDef; cost: { herb: number; stone: GNum; grade: HerbGrade }; able: Craftability; plan: ReturnType<typeof craftBatchPlan> } =>
          x.def !== undefined && x.cost !== null && x.able !== null
      )
      // 现在能开炉的置顶,其余再按阶位 —— 进弹窗一眼看见此刻哪味立刻可炼
      .sort((a, b) => {
        const ca = a.plan.rounds > 0 ? 1 : 0
        const cb = b.plan.rounds > 0 ? 1 : 0
        return cb - ca || a.able.rank - b.able.rank
      })
  )
  /** 「炼满」二步确认态:谁不按常量的炉数,一眼先交代总账 */
  const pillFullId = ref<string | null>(null)
  function runCraftFull(id: string, rounds: number): void {
    pillFullId.value = null
    craftPillBatch(id, rounds)
  }

  /** 技艺一览:名(DAO_NAMES 的道名 + 技艺名)、境地(skillStageName)、这项技艺管什么 */
  const skillRows = computed(() =>
    SKILLS.map(s => {
      const lv = lore.skillLevel(s.id)
      return { id: s.id, daoName: DAO_NAMES[s.dao], name: s.name, stage: skillStageName(lv), desc: s.desc }
    })
  )

  /**
   * 把握度配色:七成以上放心开炉,三成以下是在赌。
   * 色名只能用主题里有的 token —— 此前写的 jade-ink / crimson-ink 不存在,
   * 产物里不生成这两条类,高低两档一直没上色(palette.spec 现有判据守着)。
   */
  function rateClass(rate: number): string {
    if (rate >= 0.7) return 'text-jade'
    if (rate >= 0.3) return 'text-gold-ink'
    return 'text-cinnabar'
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
  /** 已祭炼随身的法宝行(槽位按此顺序填充) */
  const equippedRows = computed(() => artifactRows.value.filter(r => r.equipped))
  /** 逐槽映射:第 k 格对应的随身法宝;不足 slots 的补 undefined,画空位 */
  const artifactSlotRows = computed(() =>
    Array.from({ length: artifactSlots.value }, (_, k) => equippedRows.value[k])
  )
  /** 开第二法宝位的那一境的名字 —— 门槛挪动时文案跟着走,不手写「元婴」 */
  const artifactUnlockRealm = computed(() => REALMS[ARTIFACT_SLOT_UNLOCK_MAJOR]?.name ?? '')

  const artifactRows = computed(() =>
    inventory.artifacts
      .map(a => ({
        owned: a,
        def: artifactDef(a.defId)!,
        upCost: artifactUpCost(a.defId),
        artPlan: artifactBatchPlan(a.defId),
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

  /** 祭炼连炼的二步确认态;换件/换重自动重算,行与确认自会随之进退 */
  const batchArtConfirm = ref<string | null>(null)
  function runArtifactBatch(defId: string): void {
    batchArtConfirm.value = null
    upgradeArtifactBatch(defId) // 总账那一声与 toast 由服务自己报
  }

  function batchDecompose(): void {
    // 总账那一条由服务自己报(逐件弹提示只会互相顶掉)
    if (decomposeByRanks(settings.decomposeRanks) === 0) ui.toast(decomposeEmptyToast(), 'info')
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
    // 此勾选与「智能收纳」互不相干:掉落去哪儿由智能收纳的保留线与智能规则独立裁决。
  }

  function confirmDecompose(): void {
    batchDecompose()
    decomposeOpen.value = false
  }

  // ---- 智能收纳 ----
  const smartOpen = ref(false)
  /** 品质自留线:九档全列,自由从任意一档起珍(从前只有灵/玄/地三档可选) */
  const KEEP_QUALITY_CHOICES = QUALITIES.map(q => ({ rank: q.rank, name: q.name }))
  /**
   * 阶级自留线常用档位:0 = 不设;阶是「高阶产出」的近义,越高的窗口只在高阶材料里
   * (见 qualities 的品质窗口),故给一组拉开距离的常用档,而不是 1~N 每档一个;
   * 顶格与 MAX_EQUIP_TIER 同源,游戏阶上限涨了这里自动跟上
   */
  const KEEP_TIER_CHOICES = [0, 8, 12, 16, 20, 24, 28, MAX_EQUIP_TIER]

  /** 清理预告:清单条数上限,超出收拢一行「其余 N 件从略」,别让名单淹没弹窗 */
  const SWEEP_PREVIEW_LIMIT = 6

  /** 依当前所设尺度将化的件(预览与下手用同一份名单,所见即所得) */
  const cleanPreview = computed(() => sweepTargets(inventory.bagItems))
  /** 待清理件数(确认提示用),由名单现算,不再另写一套筛选 */
  const cleanCount = computed(() => cleanPreview.value.length)
  /** 清理入炉收益:只见不化(与「一键分解」的 preview 同口径,纯算) */
  const cleanYield = computed<DecomposeBatch>(() => {
    const total: DecomposeBatch = { count: 0, dust: 0, stone: gnZero() }
    for (const t of cleanPreview.value) {
      const gain = salvageOf(t.item)
      total.count += 1
      total.dust += gain.dust
      total.stone = add(total.stone, gain.stone)
    }
    return total
  })
  /** 行囊是否已满:满时新宝会先顶走榜首那件无缘旧物 */
  const bagFull = computed(() => inventory.bagItems.length >= BAG_CAPACITY)
  /** 榜首件的名字(行囊满时,下一件新物的顶位对象) */
  const firstSweepName = computed(() => {
    const first = cleanPreview.value[0]
    return first ? (equipmentTemplate(first.item.templateId)?.name ?? '旧物') : ''
  })

  /**
   * 当前策略一句话:门槛 + 识宝命中 + 余者化尘。把六个开关拼成一句人话,
   * 玩家不必心读这页才知道「自动」到底会怎么做。
   */
  const smartStatusLine = computed(() => {
    const sk = settings.smartKeep
    if (!sk.enabled) return '未启用 —— 掉落照常入包,此间的尺度暂且不用'
    const keepName = KEEP_QUALITY_CHOICES.find(q => q.rank === sk.minQuality)?.name ?? '灵品'
    const tierLine = sk.keepMinTier > 0 ? `;自 ${sk.keepMinTier} 阶起,不分品质皆留` : ''
    const tags = [
      sk.keepCoreAffix && '核心',
      sk.keepComboPiece && '组合',
      sk.keepSetPiece && '成套',
      sk.keepPerfectRolls && '近满'
    ].filter(Boolean)
    const grace = tags.length ? `;带${tags.join('或')}之器,一并留藏` : ''
    return `${keepName}以上尽数珍藏${tierLine}${grace};余者无缘,落地便化作器灵尘`
  })

  /** 清理确认态:按一次按钮先落在「再想想/清理化尘」上 */
  const cleanConfirm = ref(false)

  /**
   * 清理下手:与确认页同一份名单(cleanPreview,reactive 随行囊刷新),点下时现算。
   * 预览与实际同源 —— decomposeBatch 只在「件在包且未锁」时成功,而 sweepTargets
   * 恰是按这两条筛的;单线程、弹窗挡着交互,渲染帧与点击之间没有夹缝,行囊即使被
   * 异步事件改动,cleanPreview 先变、这里的 .value 也已是新值。toast 照实报 got
   * (decomposeBatch 的真实返回值),不报预览数。
   */
  function smartClean(): void {
    cleanConfirm.value = false
    const snapshot = sweepTargets(inventory.bagItems) // 与确认页同源,兜底再取一次
    const got = decomposeBatch(snapshot.map(t => t.item))
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

  /**
   * 藏经阁翻检的当刻概况(开炉页顶部一行)。
   * 读数在 core/loreService.studyEta —— 与 studyTick 同一优先序,界面不另算。
   */
  const studyLine = computed(() => {
    const eta = studyEta()
    if (!eta) return ''
    // 读通了又在手的两态;「够得着的都到手」与「正读某张」是两回事,措辞分开
    if (!eta.readingId && !eta.nextIsNew) return '藏经阁翻检中:够得着的方子都已到手'
    if (eta.readingId) {
      const name = pillDef(eta.readingId)?.name ?? '某方'
      return `藏经阁正研读「${name}」,约 ${formatDuration(eta.nextInSec)} 后读通`
    }
    return `藏经阁翻检中,约 ${formatDuration(eta.nextInSec)} 后翻出一张新方`
  })
</script>
