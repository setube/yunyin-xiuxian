<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 基本信息:名号、境界、年龄、世数皆在全局顶栏常驻,此处不再重复 -->
    <div class="card-ink px-4 py-4">
      <div class="flex items-center justify-between">
        <button class="-my-1 py-1.5 text-left active:opacity-60" @click="powerOpen = !powerOpen">
          <span class="text-[10px] tracking-[0.3em] text-ink-faint">战 力</span>
          <span class="ml-1 text-[9px] text-ink-faint">{{ powerOpen ? '▾' : '▸' }}拆解</span>
        </button>
        <span class="font-kai text-[18px] text-cinnabar tabular">{{ formatGN(stats.power) }}</span>
      </div>
      <!--
        战力是全书出现最频繁却从不解释的一个数 —— 一句算式说清它从哪来。
        权重取自 POWER_WEIGHTS,与 powerScore 同一份,界面不手抄
      -->
      <p class="mt-0.5 text-right text-[10px] text-ink-faint tabular">{{ powerExplain }}</p>
      <!--
        逐行把攻/防/血各折算多少摊开,合计又对上总战力 —— 「拆解」不是另起口径,
        读的与 powerScore 同一批属性同一份权重。
      -->
      <div v-if="powerOpen" class="mt-2 rounded-md bg-paper-deep/60 px-2.5 py-2 text-[10px]">
        <p v-for="row in powerRows" :key="row.name" class="flex items-center justify-between">
          <span class="text-ink-faint">{{ row.name }}</span>
          <span class="tabular">
            {{ formatGN(row.raw) }} ×{{ row.weight }} = <span class="text-azure">{{ formatGN(row.value) }}</span>
          </span>
        </p>
        <p class="mt-1 flex items-center justify-between border-t border-ink/8 pt-1">
          <span class="text-ink-faint">合计</span>
          <span class="tabular font-kai text-[12px] text-cinnabar">{{ formatGN(stats.power) }}</span>
        </p>
        <p class="mt-1 text-[10px] leading-relaxed text-ink-faint">战力由此数项合计而成,每项的权重都明码在列。</p>
      </div>
      <div class="ink-divider my-3" />
      <!-- 灵根 -->
      <!--
        灵根名必须 nowrap 且不参与收缩:窄屏上「杂灵根」曾被两侧
        (灵根圆环 + ×倍率)挤到只剩 24px 宽,一个字一行竖排下来。
        改成一整行可换行:挤不下时让 ×倍率 落到下一行,而不是把名字压扁。
      -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="shrink-0 font-kai text-[12px] tracking-widest text-ink-faint">灵根</span>
        <span class="shrink-0 whitespace-nowrap font-kai text-[13px] text-cinnabar">{{ player.linggen?.gradeName }}</span>
        <div class="flex shrink-0 gap-1.5">
          <span
            v-for="root in player.linggen?.roots ?? []"
            :key="root.element"
            class="flex flex-col items-center"
            :title="`资质 ${root.aptitude}`"
          >
            <span
              class="grid h-6 w-6 place-items-center rounded-full border text-[11px] font-kai"
              :style="{ borderColor: ELEMENTS[root.element].color, color: ELEMENTS[root.element].color }"
            >
              {{ ELEMENTS[root.element].char }}
            </span>
            <!-- 资质直接亮在圆环下,不再只藏 hover —— 手机上看得到才谈得上权衡 -->
            <span class="mt-0.5 text-[9px] leading-none tabular" :style="{ color: ELEMENTS[root.element].color }">
              {{ root.aptitude }}
            </span>
          </span>
        </div>
        <span class="ml-auto shrink-0 whitespace-nowrap text-[11px] text-ink-faint tabular">
          ×{{ player.linggen?.growthMult.toFixed(2) }}
        </span>
      </div>
      <!-- 天然牌面(Phase 32.2):转世发下的这张牌决定路好不好走,而非走得多快 -->
      <div v-if="tendencies.length" class="mt-2 space-y-1">
        <p v-for="t in tendencies" :key="t.element" class="flex gap-1.5 text-[11px] leading-relaxed text-ink-faint">
          <span class="shrink-0 font-kai" :style="{ color: ELEMENTS[t.element].color }">{{ ELEMENTS[t.element].char }}</span>
          <span>{{ t.text }}</span>
        </p>
      </div>
    </div>

    <!-- 属性 -->
    <section>
      <SectionTitle title="道躯" />
      <div class="card-ink mt-2 px-4 py-3">
        <div class="grid grid-cols-3 gap-2 text-center">
          <div>
            <p class="text-[10px] text-ink-faint">攻击</p>
            <p class="tabular font-kai text-[15px] text-ink">{{ formatGN(stats.attack) }}</p>
          </div>
          <div>
            <p class="text-[10px] text-ink-faint">防御</p>
            <p class="tabular font-kai text-[15px] text-ink">{{ formatGN(stats.defense) }}</p>
          </div>
          <div>
            <p class="text-[10px] text-ink-faint">气血</p>
            <p class="tabular font-kai text-[15px] text-ink">{{ formatGN(stats.maxHp) }}</p>
          </div>
        </div>
        <div v-if="modRows.length" class="ink-divider my-2.5" />
        <div class="grid grid-cols-2 gap-x-4 gap-y-1">
          <!-- 每行可点:玩家问的从来不只是「多少」,还有「从哪来」 -->
          <button
            v-for="row in modRows"
            :key="row.label"
            class="-my-1 flex justify-between py-1.5 text-left text-[11px] active:opacity-60"
            @click="toggleBreakdown(row.key)"
          >
            <span class="text-ink-faint">
              {{ row.label }}
              <span v-if="row.capped" class="ml-0.5 text-[9px] text-cinnabar">软</span>
            </span>
            <span class="tabular" :class="row.value > 0 ? 'text-azure' : 'text-cinnabar'">
              {{ signedPercent(row.value) }}
            </span>
          </button>
        </div>
        <p v-if="modRows.length" class="mt-1 text-[9px] text-ink-faint">点一行看它从哪来</p>
        <p
          v-for="note in panelCaveats"
          :key="note.key"
          class="mt-0.5 text-[9px] leading-relaxed text-ink-faint"
        >
          {{ note.label }}: {{ note.caveat }}
        </p>
        <div v-if="breakdownRows.length" class="mt-1.5 rounded-md bg-paper-deep/60 px-2.5 py-2">
          <p class="text-[10px] text-ink-soft">{{ STAT_NAMES[breakdownKey!] }} · 来源明细</p>
          <p v-for="c in breakdownRows" :key="c.name" class="mt-0.5 flex justify-between text-[10px]">
            <span class="text-ink-faint">
              {{ c.name }}
              <span v-if="c.onTop" class="ml-1 text-[9px] text-cinnabar">另乘</span>
            </span>
            <span class="tabular" :class="c.value > 0 ? 'text-azure' : 'text-cinnabar'">
              {{ signedPercent(c.value) }}
            </span>
          </p>
          <p class="mt-1 text-[10px] leading-relaxed text-ink-faint">
            总数即各项之和;标「另乘」的不并入百分比,而是单独乘在攻防血上。
          </p>
        </div>
        <p v-if="softCappedNotes.length" class="mt-1.5 text-[10px] leading-relaxed text-cinnabar">
          标「软」的,已堆到好处将尽之处:{{ softCappedNotes.join('、') }}。再叠上去,收效渐微,实乃大道有涯。
        </p>
      </div>
    </section>

    <!-- 各处入口 —— 按「道途 / 缘法 / 记录」分节,每张卡带一枚题头图标,免成一列同形的卡 -->
    <section>
      <SectionTitle title="道途" hint="流派" />
      <div class="mt-2 space-y-4">
        <RouterLink to="/build" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-98">
          <GameIcon name="swords" :size="16" class="shrink-0 text-cinnabar" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">流 派</span>
            <span class="block truncate text-[10px] text-ink-faint tabular">
              <template v-if="build">
                {{ build.displayName }} · 契合 {{ Math.round(build.affinity * 100) }}% · 快照 {{ loadouts.list.length }} 套
              </template>
              <template v-else>道途尚未成路,词条与功法凑成一派便见分晓</template>
            </span>
          </span>
          <span class="text-[11px] text-cinnabar">参详 →</span>
        </RouterLink>

        <!-- 修行画像(Phase 31.2:历史行为归纳,纯描述无数值) -->
        <button class="card-ink flex w-full items-center gap-3 px-4 py-3 text-left active:scale-98" @click="identityOpen = true">
          <GameIcon name="circle-user" :size="16" class="shrink-0 text-ink-soft" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">修行画像</span>
            <!-- 画像叙述是这一页最有「人味」的一行,一行截断会拦腰断句 —— 给两行 -->
            <span class="line-clamp-2 text-[10px] leading-relaxed text-ink-faint">「{{ identity?.epithet ?? '云隐散人' }}」 · {{ identity?.narrative ?? '足迹尚浅' }}</span>
          </span>
          <span class="shrink-0 text-[11px] text-ink-soft">展卷 →</span>
        </button>

        <RouterLink to="/titles" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-98">
          <!--
            相伴灵兽的「脸」:有伴亮本命灵兽的形,未伴用名号的冠 ——
            与其它入口一样是一枚题头图,文字起点与同组其它卡对齐。
          -->
          <GameIcon :name="currentPetIcon ?? 'crown'" :size="16" class="shrink-0 text-jade" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">名号与灵兽</span>
            <span class="block truncate text-[10px] text-ink-faint">
              {{ currentTitleName ?? '未佩称号' }} · {{ currentPetName ?? '未伴灵兽' }}
            </span>
          </span>
          <span class="text-[11px] text-jade">整理 →</span>
        </RouterLink>
      </div>
    </section>

    <!-- 缘法:这一世遇见的人 -->
    <section>
      <SectionTitle title="缘法" hint="师承道侣" />
      <div class="mt-2 space-y-4">
        <!-- 师承(Phase 31 S1):修行理念 + 师尊评价 -->
        <button class="card-ink flex w-full items-center gap-3 px-4 py-3 text-left active:scale-98" @click="mentorDialog = true">
          <GameIcon name="scroll" :size="16" class="shrink-0 text-azure" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">师 承</span>
            <span class="block truncate text-[10px] text-ink-faint">
              {{ mentorVer ? `${mentorVer.mentor?.name ?? ''}·${mentorVer.mentor?.title ?? ''} | ${mentorVer.line}` : '尚未拜师,可寻一位师尊' }}
            </span>
          </span>
          <span class="shrink-0 text-[11px] text-azure">{{ mentorVer ? '求教 →' : '拜师 →' }}</span>
        </button>

        <!-- 道侣(Phase 33.8):这一世遇见的人。只记关系与经历,不给任何属性 -->
        <button class="card-ink flex w-full items-center gap-3 px-4 py-3 text-left active:scale-98" @click="bondDialog = true">
          <GameIcon name="user" :size="16" class="shrink-0 text-azure" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">道 侣</span>
            <!--
              她开口 / 世界递事,还等你一句 —— 缘法入口就得报出来,不该开了弹窗才发现。
              与 herIntent/pendingEvent 同判定,intentPending/pendingEventId 只在没回时才置位。
            -->
            <span class="block truncate text-[10px] text-ink-faint">
              <span v-if="hasBondWord" class="chip-ink mr-1 align-middle border-cinnabar/50 text-[9px] text-cinnabar">有话说</span>
              {{
                bondDef && bond
                  ? `${bondDef.name}·${STAGE_NAMES[bond.stage]}${bond.fallen ? '(已殁)' : ''} | ${bondDef.brief}`
                  : pastBonds.length
                    ? `此生尚未遇见,历世曾有 ${pastBonds.length} 段同行`
                    : '此生尚未遇见谁'
              }}
            </span>
          </span>
          <span class="shrink-0 text-[11px] text-azure">{{ bondDef ? '相知 →' : '履历 →' }}</span>
        </button>
      </div>
    </section>

    <!-- 记录:走过什么、这条路从哪来 -->
    <section>
      <SectionTitle title="记录" hint="藏珍" />
      <div class="mt-2 space-y-4">
        <RouterLink to="/collection" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-98">
          <GameIcon name="gem" :size="16" class="shrink-0 text-gold-ink" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">藏珍与成就</span>
            <span class="block text-[10px] text-ink-faint tabular">
              成就 {{ quests.achieved.length }}/{{ ACHIEVEMENTS.length }} · 图鉴 {{ collectHave }}/{{ collectTotal }}
            </span>
          </span>
          <span class="text-[11px] text-gold-ink">翻阅 →</span>
        </RouterLink>

        <RouterLink to="/legacy" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-98">
          <GameIcon name="book" :size="16" class="shrink-0 text-ink-soft" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">修仙录</span>
            <span class="block truncate text-[10px] text-ink-faint tabular">画像 · 节点 · 我的纪录——这一部只写你自己</span>
          </span>
          <span class="text-[11px] text-ink-soft">展卷 →</span>
        </RouterLink>

        <!-- 界域志:与修仙录同级 —— 一部写你,一部写这条路从哪来 -->
        <RouterLink to="/codex" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-98">
          <GameIcon name="mountain" :size="16" class="shrink-0 text-ink-soft" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">界域志</span>
            <span class="block truncate text-[10px] text-ink-faint tabular">{{ cnNumber(WORLDS.length) }}界{{ cnNumber(REALMS.length) }}境 · 每一境的来路与典籍</span>
          </span>
          <span class="text-[11px] text-ink-soft">查阅 →</span>
        </RouterLink>

        <button class="card-ink flex w-full items-center gap-3 px-4 py-3 text-left active:scale-98" @click="rebirthOpen = true">
          <GameIcon name="refresh" :size="16" class="shrink-0 text-violet-ink" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">轮 回</span>
            <span class="block text-[10px] text-ink-faint tabular">
              <span class="chip-ink mr-1 border-violet-ink/50 text-[9px] text-violet-ink">永久积累</span>
              道果 {{ player.reincarnation.daoFruit }} · 天赋 {{ ownedTalents.length }} 项 · 传承 {{ ownedHeritage.length }} 道
            </span>
          </span>
          <span class="text-[11px] text-violet-ink">观想 →</span>
        </button>
      </div>
    </section>

    <IdentityDialog :open="identityOpen" @close="identityOpen = false" />

    <!-- 轮回弹窗 -->
    <BaseModal :open="rebirthOpen" title="轮回" @close="rebirthOpen = false">
      <p class="flex justify-between text-[12px]">
        <span class="text-ink-soft">
          道果
          <span class="ml-1 text-[10px] text-violet-ink">【永久积累】</span>
          <span class="block text-[10px] text-ink-faint">
            每枚至多:修行 +{{ formatPercent(DAO_FRUIT_CULT_BONUS) }},道躯 +{{
              formatPercent(DAO_FRUIT_COMBAT_BONUS)
            }};边际渐减(见下),转世保留
          </span>
        </span>
        <span class="tabular font-kai text-[15px] text-cinnabar">{{ player.reincarnation.daoFruit }}</span>
      </p>
      <!-- S3 道果收益:有效值与软上限白话 -->
      <p class="mt-1 text-[11px] text-ink-faint tabular">
        有效收益
        <span class="text-gold-ink">{{ fruitCountLabel(fruitInfo.effective) }}</span>
        (边际渐减)·
        {{
          fruitInfo.total > 0
            ? `当前修行 +${formatPercent(fruitInfo.effective * DAO_FRUIT_CULT_BONUS * stats.cultSpeedFactor)} · 道躯 +${formatPercent(fruitInfo.effective * DAO_FRUIT_COMBAT_BONUS)}`
            : ''
        }}
      </p>
      <!-- 逆旅契:道果的第一个消费出口。花道果换一世逆境,回报只有履历 -->
      <p class="mt-2 flex items-center justify-between text-[12px]">
        <span class="text-ink-soft">
          逆旅契
          <span class="ml-1 text-[10px] text-violet-ink">【本世 · 消耗道果】</span>
          <span class="block text-[10px] text-ink-faint">
            {{ signedTrial ? `此生已立「${signedTrial.name}」·${signedTrial.ruleText}` : '以道果换一世逆境,所得唯有履历一笔' }}
          </span>
        </span>
        <!-- 拇指够得着:纯文字按钮只有 18px 高,补成 30px(弹窗里的可点元素同样受 28px 那条约束) -->
        <button
          v-if="!signedTrial"
          class="shrink-0 self-center -my-1.5 px-2 py-1.5 text-[12px] text-gold-ink underline underline-offset-2 active:text-cinnabar"
          @click="trialOpen = true"
        >
          立契
        </button>
        <span v-else class="shrink-0 font-kai text-[15px] text-cinnabar">{{ signedTrial.seal }}</span>
      </p>

      <div class="mt-2">
        <div class="flex flex-wrap gap-1.5">
          <!-- 天赋效果不再只藏 hover:点一下芯片,下面展开一行说明(手机上看得见才算数) -->
          <button
            v-for="t in ownedTalents"
            :key="t!.id"
            class="chip-ink !py-1.5 border-current bg-transparent text-left"
            :style="{ color: TALENT_GRADE_COLORS[t!.grade] }"
            :title="t!.desc"
            :aria-expanded="talentTap === t!.id"
            @click="talentTap = talentTap === t!.id ? null : t!.id"
          >
            {{ t!.name }}
          </button>
          <span v-if="!ownedTalents.length" class="text-[11px] text-ink-faint">转世后可觉醒先天之姿</span>
        </div>
        <p v-if="talentTap && tappedTalent" class="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
          <span :style="{ color: TALENT_GRADE_COLORS[tappedTalent.grade] }">{{ tappedTalent.name }}</span>
          ：{{ tappedTalent.desc }}
          <span v-if="modsText(tappedTalent.mods)" class="mt-0.5 block text-azure tabular">{{ modsText(tappedTalent.mods) }}</span>
        </p>
      </div>
      <div class="mt-3">
        <p class="text-[11px] text-ink-soft">
          宿命传承
          <span class="ml-1 text-[10px] text-violet-ink">【永久积累 · 随神魂不灭】</span>
          <span class="block text-[10px] text-ink-faint">
            某道境界走到底,才留下独有一道传承(能力位)。金丹以下浅修,永远锻造不出。
          </span>
        </p>
        <ul v-if="ownedHeritage.length" class="mt-1.5 space-y-1.5">
          <li v-for="h in ownedHeritage" :key="h!.id" class="rounded-md border border-jade/40 bg-jade/5 px-2.5 py-1.5">
            <p class="flex items-baseline justify-between text-[11px] font-kai text-jade">
              <span>{{ h!.name }}</span>
              <span class="text-[9px] tracking-[0.2em] text-jade">{{ h!.axis === 'choice' ? '· 选择' : h!.axis === 'fault-tolerant' ? '· 容错' : '· 荣誉' }}</span>
            </p>
            <p class="text-[10px] leading-relaxed text-ink-soft">{{ h!.desc }}</p>
          </li>
        </ul>
        <p v-else class="mt-1.5 text-[11px] text-ink-faint">尚未铸得传承 —— 金丹及以上的深修,方有一道可留</p>
      </div>
      <!--
        去留一览:兵解是不可逆的大事,一句「随皮囊散去」盖不住整本账 ——
        每一样去了哪、留下什么,读的就是结算弹窗那份 HERITAGE(同表,不另写)。
        默认收起:不压弹窗高度,按下前点开即可核对
      -->
      <button
        class="mt-3 flex w-full items-center justify-between px-2 py-2 text-left text-[11px] text-ink-soft active:opacity-60"
        :aria-expanded="heritageOpen"
        @click="heritageOpen = !heritageOpen"
      >
        <span>转世去留一览({{ keepCount }} 留 · {{ resetCount }} 去)</span>
        <span class="text-[10px] text-azure">{{ heritageOpen ? '▾ 收 起' : '▸ 展 开' }}</span>
      </button>
      <div v-if="heritageOpen" class="mt-1.5 rounded-md bg-paper-deep/60 px-3 py-2">
        <p class="text-[10px] text-ink-soft">随魂弥留 · 与结算弹窗同表</p>
        <div class="mt-1 space-y-1">
          <p v-for="row in heritageKeepRows" :key="row.id" class="flex items-baseline justify-between gap-2 text-[10px]">
            <span class="text-ink-soft">{{ row.name }}</span>
            <span class="shrink-0" :class="row.cls">{{ row.modeLabel }}</span>
          </p>
          <div class="my-1 border-t border-ink/6" />
          <p v-for="row in heritageResetRows" :key="row.id" class="flex items-baseline justify-between gap-2 text-[10px]">
            <span class="text-ink-faint">{{ row.name }}</span>
            <span class="shrink-0" :class="row.cls">{{ row.modeLabel }}</span>
          </p>
        </div>
      </div>
      <p class="mt-3 text-[11px] leading-relaxed text-ink-faint">{{ rebirthHint }}</p>
      <template #footer>
        <button class="btn-ghost w-full !text-[12px]" @click="rebirth">兵解转世</button>
      </template>
    </BaseModal>

    <!-- 逆旅契弹窗:一世一份,签下不可解除;只加难度,不给任何属性或资源 -->
    <BaseModal :open="trialOpen" title="逆旅契" @close="trialOpen = false">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        道果本是历世所积,却一向只堆在身上。立一份契,把它押在这一世的逆境里——
        契不予你分毫气力,只把路走窄。走完了,它会留在你的履历上。
      </p>
      <div class="mt-3 space-y-2">
        <button
          v-for="t in LIFE_TRIALS"
          :key="t.id"
          :class="['card-ink w-full px-3 py-2 text-left', canSignLifeTrial(t.id) ? '' : 'opacity-40']"
          @click="requestTrial(t.id)"
        >
          <span class="flex items-baseline justify-between">
            <span class="font-kai text-[14px] text-ink">{{ t.seal }} · {{ t.name }}</span>
            <span class="tabular text-[12px]" :class="player.reincarnation.daoFruit >= t.cost ? 'text-cinnabar' : 'text-ink-faint'">
              {{ t.cost }} 道果
            </span>
          </span>
          <span class="mt-0.5 block text-[11px] leading-relaxed text-ink-soft">{{ t.desc }}</span>
          <span class="mt-0.5 block text-[10px] text-ink-faint">{{ t.ruleText }}</span>
        </button>
      </div>
      <p class="mt-3 text-[11px] leading-relaxed text-ink-faint">一世只可立一契,立下不可解。转世时契随皮囊散去,履历长存。</p>
    </BaseModal>

    <!-- 逆旅契 · 确认:不可逆、花费高,先给一次反悔的机会再立 -->
    <BaseModal :open="pendingTrial !== null" title="立契确认" @close="pendingTrial = null">
      <template v-if="pendingTrial">
        <p class="text-[11px] leading-relaxed text-ink-faint">
          立下「{{ pendingTrial.seal }} · {{ pendingTrial.name }}」,押上 {{ pendingTrial.cost }} 道果。此世再无回头路,回报只在履历。
        </p>
        <p class="mt-2 text-[12px] leading-relaxed text-ink-soft">{{ pendingTrial.desc }}</p>
        <p class="mt-1 text-[10px] text-ink-faint">{{ pendingTrial.ruleText }}</p>
        <div class="mt-3 flex gap-2">
          <button class="btn-seal grow" @click="confirmSignTrial">确认立契</button>
          <button class="btn-ink grow" @click="pendingTrial = null">再想想</button>
        </div>
      </template>
    </BaseModal>

    <BondDialog :open="bondDialog" @close="bondDialog = false" />

    <MentorDialog :open="mentorDialog" @close="mentorDialog = false" />
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { STAGE_NAMES } from '@/data/daolu'
  import { LIFE_TRIALS, type LifeTrialDef } from '@/data/lifeTrials'
  import { activeLifeTrial, canSignLifeTrial, signLifeTrial } from '@/core/lifeTrialService'
  import { useQuestsStore } from '@/stores/quests'
  import { useUiStore } from '@/stores/ui'
  import { ELEMENTS } from '@/data/linggen'
  import { titleDef } from '@/data/titles'
  import { petDef, PETS } from '@/data/pets'
  import { beastIcon } from '@/data/beastFamilies'
  import { talentDef, TALENT_GRADE_COLORS, TALENTS } from '@/data/talents'
  import { heritageDef } from '@/data/heritage'
  import { ACHIEVEMENTS } from '@/data/achievements'
  import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
  import { GONGFA } from '@/data/gongfa'
  import { PILLS } from '@/data/pills'
  import { ARTIFACTS } from '@/data/artifacts'
  import { REALMS, WORLDS } from '@/data/realms'
  import { EVENTS } from '@/data/events'
  import { prepareReincarnation, MANUAL_REBIRTH_MIN_MAJOR } from '@/core/reincarnation'
  import { detectBuild } from '@/core/buildDetect'
  import { useLoadoutsStore } from '@/stores/loadouts'
  import { isSoftCapped, modOf } from '@/core/statsCalc'
  import { DAO_FRUIT_COMBAT_BONUS, DAO_FRUIT_CULT_BONUS, SOFT_CAPS, CULT_SPEED_SOFT_CAP_DIMINISH } from '@/data/constants'
  import { fruitCountLabel, fruitMarginalInfo } from '@/core/resourceGuidance'
  import { branchCodex, materialCodex, codexOwnedCount } from '@/ui/codex'
  import { mentorVerdict } from '@/core/mentorService'
  import { buildIdentity } from '@/core/identityService'
  import { rootElements, tendencyLines } from '@/core/linggenAffinity'
  import { cnNumber, formatGN, formatPercent } from '@/utils/format'
  import type { AnyStatKey } from '@/types'
  import { STAT_KEYS, STAT_NAMES, modsText, signedPercent, statCaveat } from '@/data/statNames'
  import { powerBreakdownRows, powerExplainText } from '@/ui/powerText'
  import { heritageViewRows, rebirthDecisionHint } from '@/ui/rebirthText'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import { useBondOverview } from '@/composables/useBondOverview'
  import IdentityDialog from '@/components/character/IdentityDialog.vue'
  import BondDialog from '@/components/character/BondDialog.vue'
  import MentorDialog from '@/components/character/MentorDialog.vue'

  const player = usePlayerStore()

  /** S3 道果链路:有效收益与软上限白话 */
  const fruitInfo = computed(() => fruitMarginalInfo())
  const quests = useQuestsStore()
  const ui = useUiStore()
  const loadouts = useLoadoutsStore()

  const stats = computed(() => player.finalStats)

  /** 战力拆解的展开态与构成行 —— 读同一批属性,逐行相加即战力行那个数 */
  const powerOpen = ref(false)
  const powerRows = computed(() => powerBreakdownRows(stats.value))
  /** 战力算式是纯常量文案(powerExplainText 无依赖),只在 setup 算一次,模板不再每帧重算 */
  const powerExplain = powerExplainText()

  const modRows = computed(() =>
    STAT_KEYS.map(k => ({
      key: k,
      label: STAT_NAMES[k],
      value: modOf(stats.value.mods, k),
      capped: isSoftCapped(stats.value.mods, k) || (k === 'cultivationSpeed' && stats.value.cultSpeedSoftCapped)
    })).filter(x => x.value !== 0)
  )

  /** 灵根的天然牌面(倾向文案,不含任何数值) */
  const tendencies = computed(() => tendencyLines(rootElements(player.linggen?.roots)))

  /** 面板上只提示当前真有的词条边界,没有这项的玩家不需要看见空话 */
  const panelCaveats = computed(() =>
    modRows.value.flatMap(row => {
      const caveat = statCaveat(row.key)
      return caveat ? [{ key: row.key, label: row.label, caveat }] : []
    })
  )

  /** 来源明细:点哪一行看哪一行 —— 数据来自 finalStats.breakdown,不在界面里另算 */
  const breakdownKey = ref<AnyStatKey | null>(null)
  const breakdownRows = computed(() => {
    const key = breakdownKey.value
    if (!key) return []
    return stats.value.breakdown
      .map(r => ({ name: r.name, value: r.mods[key] ?? 0, onTop: r.onTop === true }))
      .filter(c => c.value !== 0)
  })

  function toggleBreakdown(key: AnyStatKey): void {
    breakdownKey.value = breakdownKey.value === key ? null : key
  }

  /**
   * 软上限从来不是暗改:越过之后超出部分按折扣计入,
   * 折扣率取自 SOFT_CAPS 本体,不在这里手抄"折半"(各键并非同一个数)
   */
  const softCappedNotes = computed(() =>
    modRows.value
      .filter(r => r.capped)
      .map(r =>
        `${r.label}(超出按 ${Math.round((r.key === 'cultivationSpeed' ? CULT_SPEED_SOFT_CAP_DIMINISH : SOFT_CAPS[r.key]?.diminish ?? 1) * 100)}% 计入)`
      )
  )

  const build = computed(() => detectBuild(stats.value.mods))

  const currentTitleName = computed(() => (player.titleId ? titleDef(player.titleId)?.name : undefined))
  const currentPetName = computed(() => (player.petId ? petDef(player.petId)?.name : undefined))
  // 灵兽 id 认不出时宁可不出图,也不要在渲染期对 undefined 取 family
  const currentPetIcon = computed(() => {
    const def = player.petId ? petDef(player.petId) : undefined
    return def ? beastIcon(def.family) : undefined
  })
  const ownedTalents = computed(() => player.reincarnation.talents.map(id => talentDef(id)).filter(t => t !== undefined))
  const ownedHeritage = computed(() => player.reincarnation.heritage.map(id => heritageDef(id)).filter(d => d !== undefined))

  const collectHave = computed(
    () =>
      codexOwnedCount(quests.collections.equip, EQUIPMENT_TEMPLATES) +
      codexOwnedCount(quests.collections.gongfa, GONGFA) +
      codexOwnedCount(quests.collections.pill, PILLS) +
      codexOwnedCount(quests.collections.artifact, ARTIFACTS) +
      codexOwnedCount(quests.collections.pet, PETS) +
      codexOwnedCount(quests.collections.event, EVENTS) +
      codexOwnedCount(quests.collections.talent, TALENTS) +
      // 图鉴页还有灵材谱与悟道录两类(派生视图,见 ui/codex.ts),计数要带上,否则两页对不上
      branchCodex().entries.filter(e => e.stage > 0).length +
      materialCodex().entries.filter(e => e.stage > 0).length
  )
  const collectTotal =
    EQUIPMENT_TEMPLATES.length +
    GONGFA.length +
    PILLS.length +
    ARTIFACTS.length +
    PETS.length +
    EVENTS.length +
    TALENTS.length +
    branchCodex().entries.length +
    materialCodex().entries.length

  // ---- 轮回 ----
  const rebirthOpen = ref(false)
  /** 转世去留一览:展开态由玩家决定;行取自 HERITAGE 同表,见 ui/rebirthText */
  const heritageOpen = ref(false)
  const heritageRowsView = computed(() => heritageViewRows())
  const heritageKeepRows = computed(() => heritageRowsView.value.filter(r => r.mode !== 'reset'))
  const heritageResetRows = computed(() => heritageRowsView.value.filter(r => r.mode === 'reset'))
  const keepCount = computed(() => heritageKeepRows.value.length)
  const resetCount = computed(() => heritageResetRows.value.length)
  /** 兵解提示是纯常量文案(rebirthDecisionHint 无依赖),setup 只算一次 */
  const rebirthHint = rebirthDecisionHint()
  /** 天赋芯片点按展开(移动端无 hover,效果说明内联显示);关弹窗复位 */
  const talentTap = ref<string | null>(null)
  const tappedTalent = computed(() => (talentTap.value ? talentDef(talentTap.value) : undefined))
  watch(rebirthOpen, open => {
    if (!open) talentTap.value = null
  })
  const bondDialog = ref(false)
  // 关系状态与道侣弹窗共用同一份投影(composable 单源)
  const { bond, bondDef, pastBonds, hasBondWord } = useBondOverview()
  const trialOpen = ref(false)
  /** 本世已立的逆旅契;未立为 null */
  const signedTrial = computed(() => activeLifeTrial())
  // 待确认的契:点卡只进这层,确认弹窗通过后才会真的 signLifeTrial —— 不可逆,先给反悔
  const pendingTrial = ref<LifeTrialDef | null>(null)
  function requestTrial(id: string): void {
    const def = LIFE_TRIALS.find(t => t.id === id)
    if (!def) return
    if (player.reincarnation.trial) {
      ui.toast('此生已有契在身', 'warn')
      return
    }
    if (player.reincarnation.daoFruit < def.cost) {
      ui.toast('道果不足', 'warn')
      return
    }
    pendingTrial.value = def
  }
  function confirmSignTrial(): void {
    if (!pendingTrial.value) return
    const id = pendingTrial.value.id
    pendingTrial.value = null
    if (signLifeTrial(id)) trialOpen.value = false
  }
  const canRebirth = computed(() => player.major >= MANUAL_REBIRTH_MIN_MAJOR)

  // Phase 31 S1 师承
  const mentorDialog = ref(false)
  const mentorVer = computed(() => mentorVerdict(player.mentor))
  // Phase 31.2 修行画像
  const identityOpen = ref(false)
  const identity = computed(() => buildIdentity())

  function rebirth(): void {
    if (!canRebirth.value) {
      // 与弹窗内那句「金丹境方可兵解」同源:门槛挪动,tosat 跟着走,不手抄境名
      ui.toast(`至少${REALMS[MANUAL_REBIRTH_MIN_MAJOR]?.name ?? ''}境方可自行兵解`, 'warn')
      return
    }
    rebirthOpen.value = false
    prepareReincarnation()
  }
</script>
