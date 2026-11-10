<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <div class="flex items-center gap-2">
      <RouterLink to="/character" class="-my-1.5 py-1.5 text-[12px] text-ink-faint active:text-ink-soft">← 人物</RouterLink>
      <span class="text-[11px] text-ink-faint">·</span>
      <span class="text-[12px] text-ink-soft">界域志</span>
    </div>

    <SectionTitle title="界域志" />
    <InkTabs v-model="codexTab" :tabs="CODEX_TABS" />

    <template v-if="codexTab === 'realm'">
    <section v-for="row in worldRows" :key="row.world.id" class="card-ink px-4 py-3">
      <div class="flex items-baseline gap-2">
        <!-- 界域印:四界各一枚,框形分家(见 ui/worldMark) -->
        <WorldSeal :world="row.world.id" class="!mr-0.5 self-center" />
        <span class="font-kai text-[15px] tracking-[0.25em] text-ink">{{ row.world.name }}</span>
        <span class="text-[10px] text-ink-faint">第 {{ row.world.start + 1 }}–{{ row.world.end + 1 }} 境</span>
        <!--
          界域刻度:本界域含几境就几格,已过几格(见 ui/worldProgress)。
          四个界域各含 9/5/4/3 境,不按同一个尺画。
        -->
        <span class="ml-auto flex shrink-0 items-center gap-1.5">
          <span
            class="world-pips"
            :class="{ 'world-pips--here': row.prog.here }"
            role="img"
            :aria-label="`${row.prog.name} 已过 ${row.prog.passed}/${row.prog.total} 境`"
          >
            <i v-for="(on, i) in worldPips(row.prog)" :key="i" :class="{ on }" />
          </span>
          <span class="text-[9px] tabular text-ink-faint">{{ row.prog.passed }}/{{ row.prog.total }}</span>
        </span>
      </div>
      <p class="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{{ row.world.desc }}</p>
      <div class="mt-2 space-y-2">
        <div
          v-for="cell in row.realms"
          :key="cell.def.id"
          class="rounded-md px-2.5 py-2"
          :class="cell.index === player.major ? 'bg-cinnabar/8' : 'bg-paper-deep/50'"
        >
          <p class="flex items-center gap-2">
            <span
              class="font-kai text-[14px] tracking-wider"
              :class="cell.index === player.major ? 'text-cinnabar' : cell.index < player.major ? 'text-ink-soft' : 'text-ink-faint'"
            >
              {{ cell.def.name }}
            </span>
            <span class="chip-ink !text-[9px]">{{ cell.def.basis }}</span>
            <!--
              当前用朱字,已过与未到原先只靠字色深浅(text-ink-soft / text-ink-faint)——
              两色差得很小,21 境铺下来读不出哪几境已过。已过的另给一道方印。
            -->
            <span
              v-if="cell.index < player.major"
              class="realm-passed grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm border border-jade/50 font-kai text-[8px] leading-none text-jade"
              role="img"
              aria-label="已过"
            >过</span>
            <span v-if="cell.index === player.major" class="text-[9px] text-cinnabar">当前</span>
          </p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{{ cell.def.desc }}</p>
          <!--
            当前境界那张卡有一层 bg-cinnabar/8。夜主题下卡底是 paper-lifted(51,49,46),
            叠上这层朱之后 ink-faint 只剩 4.41:1(实测,全站暗色扫描的唯一真实命中);
            其余卡是 bg-paper-deep/50,ink-faint 有 6.11,没问题。
            故只在当前卡改用 ink-soft(该底上 6.19),其它卡不动。
          -->
          <p
            class="mt-1 text-[11px] leading-relaxed"
            :class="cell.index === player.major ? 'text-ink-soft' : 'text-ink-faint'"
          >{{ cell.def.lore }}</p>
          <p
            v-if="classicsOf(cell.def.id).length"
            class="mt-1 text-[10px]"
            :class="cell.index === player.major ? 'text-ink-soft' : 'text-ink-faint'"
          >
            所据:{{ classicsOf(cell.def.id).map(c => `《${c.title}》`).join(' ') }}
          </p>
        </div>
      </div>
    </section>
    </template>

    <template v-if="codexTab === 'classics'">
    <SectionTitle title="典籍" :hint="`${cnNumber(classicRows.length)}脉`" />
    <!--
      典籍册原先把 11 部书平铺成 11 张同形的卡:哪几部同出一脉、这一脉占几部、
      管着几个境界,全要靠读「丹道 / 道家 / 道教 / 网文」那枚小签自己数。
      现按来路分谱:一脉一处,脉下逐部列书名与相涉境界(见 ui/classicBoard)。
    -->
    <section class="space-y-2">
      <article v-for="row in classicRows" :key="row.school" class="card-ink px-4 py-3">
        <p class="flex flex-wrap items-baseline gap-2">
          <span class="classic-school-tag shrink-0 font-kai text-[13px]" :class="`classic-school-tag--${schoolKey(row.school)}`">
            {{ row.school }}
          </span>
          <span class="text-[10px] text-ink-faint">{{ schoolNote(row.school) }}</span>
          <span class="ml-auto shrink-0 tabular text-[10px] text-ink-faint">
            {{ row.count }} 部 · 涉 {{ schoolSpan(row.school).total }} 境<template v-if="schoolSpan(row.school).past > 0"> · 已过 {{ schoolSpan(row.school).past }}</template>
          </span>
        </p>
        <div class="mt-1.5 divide-y divide-ink/6">
          <div v-for="c in row.books" :key="c.id" class="py-1.5">
            <p class="flex flex-wrap items-baseline gap-x-2">
              <span class="font-kai text-[13px] text-ink">《{{ c.title }}》</span>
              <span class="text-[10px] text-ink-faint">{{ c.source }}</span>
            </p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{{ c.gist }}</p>
            <!--
              「相涉」原是一串纯文字,看不出哪几个是自己走过的。
              同一页的境界页签早已把「已过 / 当前 / 未至」讲清楚了,
              两处读同一份境界表,没理由一处讲、一处不讲(见 ui/classicRealm)。
            -->
            <p v-if="c.realms.length" class="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-[10px] text-ink-faint">
              <span>相涉:</span>
              <span
                v-for="m in classicRealmMarks(c, player.major)"
                :key="m.id"
                class="classic-realm tabular"
                :class="`classic-realm--${m.phase}`"
              >{{ m.name }}</span>
            </p>
          </div>
        </div>
      </article>
    </section>
    </template>

    <template v-if="codexTab === 'yi'">
    <SectionTitle title="周易" :hint="`${cnNumber(TRIGRAMS.length)}卦 · ${cnNumber(HEXAGRAMS.length)}卦`" />
    <section class="card-ink px-4 py-3">
      <p class="text-[11px] leading-relaxed text-ink-faint">下卦为身,上卦为境;卦力为两卦之和,限时。</p>

      <div v-if="currentReading" class="mt-3 rounded-md bg-paper-deep/50 px-3 py-2.5">
        <p class="flex flex-wrap items-center gap-2">
          <span class="font-kai text-[16px] tracking-widest text-cinnabar">{{ currentReading.hexagram.name }}卦</span>
          <span class="text-[10px] text-ink-faint tabular">
            上{{ currentReading.upper.name }}{{ currentReading.upper.symbol }} · 下{{ currentReading.lower.name
            }}{{ currentReading.lower.symbol }}
          </span>
          <span class="ml-auto text-[10px] tabular text-ink-faint">
            尚余 <span class="countdown-slot">{{ remainCountdown }}</span>
          </span>
        </p>
        <!--
          卦画原先照着 lines 数组正序铺,而 lines 自下而上 —— 整幅是倒的:
          「下卦为身、上卦为境」在图上正好读反。之卦更只剩一个名字,卦象没画。
          今按 ui/hexagramFigure 排:上爻在上,爻题另标,动爻记 ○ ×,之卦并排画出。
        -->
        <div v-if="figure" class="mt-2 flex items-start gap-3" role="img" :aria-label="figureAria">
          <div class="hex-figure">
            <span class="hex-figure__cap font-kai">本卦</span>
            <div
              v-for="line in figure.lines"
              :key="line.position"
              class="hex-line"
              :class="{ 'hex-line--moving': line.changing }"
            >
              <span class="hex-line__bar" :class="line.yang ? 'hex-line__bar--yang' : 'hex-line__bar--yin'">
                <template v-if="line.yang"><i /></template>
                <template v-else><i /><i /></template>
              </span>
              <span class="hex-line__label font-kai">{{ line.label }}</span>
              <span v-if="line.mark" class="hex-line__mark font-kai">{{ line.mark }}</span>
            </div>
          </div>
          <div v-if="figure.changed" class="hex-figure">
            <span class="hex-figure__cap font-kai">之{{ figure.changedName }}</span>
            <div v-for="line in figure.changed" :key="line.position" class="hex-line hex-line--changed">
              <span class="hex-line__bar" :class="line.yang ? 'hex-line__bar--yang' : 'hex-line__bar--yin'">
                <template v-if="line.yang"><i /></template>
                <template v-else><i /><i /></template>
              </span>
              <span class="hex-line__label font-kai">{{ line.label }}</span>
            </div>
          </div>
        </div>
        <p class="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{{ currentReading.hexagram.gist }}</p>
        <p v-for="(line, i) in counsel" :key="`c${i}`" class="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{{ line }}</p>
        <p class="mt-1.5 text-[11px] text-azure">在身之力:{{ powerText }}</p>
      </div>

      <div class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          class="btn-ghost shrink-0 whitespace-nowrap !py-1.5 !text-[12px]"
          :disabled="askDisabled"
          @click="ask"
        >
          {{ askLabel }}
        </button>
        <span class="text-[10px] leading-relaxed text-ink-faint">动爻越多,卦力越盛</span>
      </div>
    </section>

    <section class="card-ink divide-y divide-ink/6 px-4">
      <div v-for="t in TRIGRAMS" :key="t.id" class="flex items-start gap-2 py-2.5">
        <span class="w-[52px] shrink-0 font-kai text-[15px] text-ink">{{ t.symbol }} {{ t.name }}</span>
        <span class="w-[56px] shrink-0 text-[10px] text-ink-faint">象{{ t.image }} · {{ t.nature }}</span>
        <span class="min-w-0 grow text-[11px] leading-relaxed text-ink-soft">{{ t.gist }}</span>
        <span class="shrink-0 text-[10px] text-jade">宜{{ t.good }}</span>
        <span class="shrink-0 text-[10px] text-cinnabar">忌{{ t.bad }}</span>
      </div>
    </section>

    <section class="card-ink px-4 py-3">
      <button class="flex w-full items-center justify-between text-left" :aria-expanded="showAllHex" @click="showAllHex = !showAllHex">
        <span class="font-kai text-[13px] tracking-wider text-ink">{{ cnNumber(HEXAGRAMS.length) }}卦</span>
        <span class="text-[10px] text-azure">{{ showAllHex ? '收起' : '展开' }}</span>
      </button>
      <div v-if="showAllHex" class="mt-2 max-h-72 divide-y divide-ink/6 overflow-y-auto">
        <div v-for="row in hexRows" :key="row.order" class="flex items-baseline gap-2 py-2">
          <span class="w-6 shrink-0 tabular text-[10px] text-ink-faint">{{ row.order }}</span>
          <span class="w-14 shrink-0 font-kai text-[13px] text-ink">{{ row.name }}</span>
          <!--
            原先是两个单卦符号并排(☰☱):要认出一卦,得先在脑中把两组三爻叠起来。
            重卦本来就是「上三爻 + 下三爻」,这里直接画成六爻。
          -->
          <span class="hex-figure hex-figure--inline shrink-0" role="img" :aria-label="row.aria">
            <span
              v-for="line in row.lines"
              :key="line.position"
              class="hex-line"
            >
              <span class="hex-line__bar" :class="line.yang ? 'hex-line__bar--yang' : 'hex-line__bar--yin'">
                <template v-if="line.yang"><i /></template>
                <template v-else><i /><i /></template>
              </span>
            </span>
          </span>
          <span class="min-w-0 text-[11px] leading-relaxed text-ink-soft">{{ row.gist }}</span>
        </div>
      </div>
    </section>

    </template>

    <template v-if="codexTab === 'ziwei'">
    <SectionTitle title="紫微" :hint="`${cnNumber(PALACES.length)}宫`" />
    <section class="card-ink px-4 py-3">
      <p class="text-[11px] leading-relaxed text-ink-faint">按灵根与轮回安星 · 常驻 · 转世重算</p>
      <p class="mt-2 font-kai text-[13px] leading-relaxed text-ink">{{ fateLordLineText }}</p>
      <p class="mt-1 text-[11px] text-azure">命格之力:{{ fateModsText }}</p>
      <!--
        十二宫原先铺成十二行文字:哪一宫是命宫、哪一宫有星,得逐行读。
        它本来是四正三合的一张盘 —— 改排四列三行,命宫朱框,有星的宫点亮。
        宫名与星名仍取 data/ziwei,盘只是换了个摆法。
      -->
      <div class="fate-board mt-2.5 grid grid-cols-3 gap-1.5">
        <div
          v-for="row in fateRows"
          :key="row.palace.id"
          class="fate-cell"
          :class="{ 'fate-cell--ming': row.isMing, 'fate-cell--starred': row.hasStar }"
        >
          <p class="flex items-baseline gap-1">
            <span class="truncate font-kai text-[11px] leading-none" :class="row.isMing ? 'text-cinnabar' : 'text-ink-soft'">
              {{ row.palace.name }}
            </span>
            <span v-if="row.isMing" class="shrink-0 text-[8px] leading-none text-cinnabar">命</span>
          </p>
          <p class="mt-1 flex flex-wrap gap-x-1 gap-y-0.5">
            <span
              v-for="st in row.starList"
              :key="st.id"
              class="fate-star font-kai text-[10px] leading-none"
              :title="`${st.name} · ${st.nature}`"
            >{{ st.name }}</span>
          </p>
        </div>
      </div>
      <p class="mt-1.5 text-[9px] leading-relaxed text-ink-faint">
        命宫朱框 · 有星诸宫点亮 · 宫位说明见下
      </p>
      <div class="mt-2.5 divide-y divide-ink/6">
        <!--
          flex-wrap 不可去:320 宽下宫名 + 属性签 + 星名 + 说明挤不下,
          说明会被压成每行两三个字的竖条。宽屏仍是一行,窄屏说明落到下一行。
        -->
        <div v-for="row in fateRows" :key="row.palace.id" class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
          <span class="w-14 shrink-0 font-kai text-[12px] text-ink-soft">{{ row.palace.name }}</span>
          <!--
            此宫给哪一路属性。data 里 channel 就为此而存(修行/同道/因缘/灵兽…),
            却一直没进界面 —— 十二宫只写「所主 · 管什么」,说不到它落在哪一路。
          -->
          <span class="fate-channel shrink-0 font-kai text-[10px]" :class="{ 'fate-channel--ming': row.isMing }">{{ row.palace.channel }}</span>
          <span class="w-24 shrink-0 text-[11px] text-cinnabar">{{ row.starNames }}</span>
          <span class="min-w-[9rem] flex-1 text-[11px] leading-relaxed text-ink-faint">{{ row.palace.domain }} · {{ row.palace.use }}</span>
        </div>
      </div>
      <div class="mt-2 border-t border-ink/10 pt-2">
        <p class="text-[10px] text-ink-faint">{{ cnNumber(STARS.length) }}主星</p>
        <div v-for="s in STARS" :key="s.id" class="mt-1 flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft">
          <span class="min-w-0 flex-1">
            <span class="font-kai text-ink">{{ s.name }}</span>
            <span class="text-ink-faint"> · {{ s.nature }} · {{ s.gist }}</span>
            <!--
              点化要花灵石,而它给哪一路此前一字未提:十四主星各带 mods,
              data/ziwei 的字段注释写的就是「此星所与之力」,界面却只印星性一句。
              与上方「命格之力」合计同源(见 data/statNames 的 modsText)。
            -->
            <span class="mt-0.5 block text-[10px] tabular text-azure">{{ modsText(s.mods) }}</span>
          </span>
          <button
            class="shrink-0 cursor-pointer text-[10px]"
            :class="
              player.fateFocus === s.id
                ? 'font-kai text-gold-ink'
                : focusShort > 0
                  ? 'cursor-not-allowed text-ink-faint'
                  : 'text-azure'
            "
            :disabled="player.fateFocus !== s.id && focusShort > 0"
            @click="focusStar(s.id)"
          >
            {{
              player.fateFocus === s.id
                ? '已显化'
                : focusShort > 0
                  ? `点化 · 灵石尚差 ${formatGap(focusShortGN)}`
                  : `点化 · 灵石 ${focusCostText}`
            }}
          </button>
        </div>
        <p class="mt-2 text-[10px] leading-relaxed text-ink-faint">点化:限一星 · 其力二倍 · 余星不变</p>
      </div>
    </section>
    </template>

    <template v-if="codexTab === 'xiang'">
    <SectionTitle title="星象" :hint="`${cnNumber(MANSIONS.length)}宿值日`" />
    <section class="card-ink px-4 py-3">
      <p class="font-kai text-[13px] leading-relaxed text-ink">{{ mansionLine }}</p>
      <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">
        {{ cnNumber(IMAGES.length) }}象配{{ cnNumber(WORLDS.length) }}界:{{ imageWorldMap }}。值日之宿所属之象,所配界域历练际遇 +{{ mansionLuckPercent() }}%。
      </p>
      <p class="mt-1.5 text-[11px] text-azure">
        今日利 <span class="text-gold-ink">{{ favoredWorldName }}</span>
      </p>
      <!--
        二十八宿按象成组(东苍龙七宿、南朱雀七宿…),原先只有文字一句。
        四象各一排,今值之宿另标 —— 哪一象的宿今值、排在第七位(见 ui/mansionBoard)。
      -->
      <div class="mansion-board mt-2.5 space-y-1.5">
        <div v-for="g in mansionGroupsList" :key="g.id" class="mansion-row" :class="{ 'mansion-row--here': g.here }">
          <p class="flex items-baseline gap-1.5">
            <span class="shrink-0 font-kai text-[10px]" :class="g.here ? 'text-cinnabar' : 'text-ink-soft'">
              {{ g.direction }}{{ g.name }}
            </span>
            <span class="shrink-0 text-[9px] text-ink-faint">{{ worldName(g.world) }}</span>
            <span v-if="g.here" class="ml-auto shrink-0 text-[9px] tabular text-cinnabar">
              今值 {{ mansionOrdinal(g, todayMansionName) }}/{{ g.mansions.length }}
            </span>
          </p>
          <p class="mt-0.5 flex flex-wrap gap-x-1 gap-y-0.5">
            <span
              v-for="m in g.mansions"
              :key="m.name"
              class="mansion-star font-kai text-[11px] leading-none"
              :class="{ 'mansion-star--today': m.name === todayMansionName }"
              :title="`${m.fullName} · ${m.domain} · ${m.good}`"
            >{{ m.name }}</span>
          </p>
        </div>
      </div>
      <button class="-my-1 mt-2 w-full py-2 text-left text-[10px] text-azure" @click="showAllMansions = true">
        {{ cnNumber(MANSIONS.length) }}宿 →
      </button>
    </section>
    <BaseModal :open="showAllMansions" :title="`${cnNumber(MANSIONS.length)}宿`" @close="showAllMansions = false">
      <div class="divide-y divide-ink/6">
        <template v-for="img in IMAGES" :key="img.id">
          <p class="pt-2 text-[10px] text-ink-faint">{{ img.direction }}方 {{ img.name }} · 所配{{ worldName(img.world) }}</p>
          <!-- 定宽按最长内容收(宿名 1 字、全名 3 字、分野 2 字):320 宽下所宜 6 字仍单行 -->
          <div v-for="m in mansionsOf(img.id)" :key="m.name" class="flex items-baseline gap-2 py-1.5">
            <span class="w-5 shrink-0 font-kai text-[13px] text-ink">{{ m.name }}</span>
            <span class="w-10 shrink-0 text-[10px] text-ink-faint">{{ m.fullName }}</span>
            <span class="w-7 shrink-0 text-[10px] text-ink-faint">{{ m.domain }}</span>
            <span class="min-w-0 text-[11px] leading-relaxed text-ink-soft">{{ m.good }}</span>
          </div>
        </template>
      </div>
    </BaseModal>
    </template>

    <template v-if="codexTab === 'qimen'">
    <SectionTitle title="奇门" :hint="`九宫${cnNumber(GATES.length)}门`" />
    <section class="card-ink px-4 py-3">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        洛书九宫:{{ luoshuGatesText }}。择门:远征启程前,仅限本趟。
      </p>
      <!-- 九宫盘:八门各居一宫,中五无门;吉/平/凶靠边框形态区分(见 ui/gateBoard) -->
      <div class="gate-board mx-auto mt-2.5 max-w-64">
        <div
          v-for="cell in codexBoard"
          :key="cell.palace"
          class="gate-palace"
          :class="[cell.gate ? `gate-kind-${gateKindMark(cell.gate.kind).shape}` : 'gate-palace--void']"
        >
          <span class="gate-palace__no">{{ cell.palace }}</span>
          <template v-if="cell.gate">
            <span
              class="font-kai text-[15px] leading-none"
              :class="cell.gate.kind === '凶' ? 'text-cinnabar' : cell.gate.kind === '吉' ? 'text-jade' : 'text-ink-soft'"
            >
              {{ cell.gate.name }}
            </span>
            <span class="text-[9px] leading-none text-ink-faint">{{ cell.gate.gua }}{{ cell.gate.direction }}</span>
          </template>
          <span v-else class="text-[9px] leading-none text-ink-faint">无门</span>
        </div>
      </div>
      <div class="mt-2.5 divide-y divide-ink/6">
        <div v-for="g in GATES" :key="g.id" class="flex items-start gap-2 py-2">
          <span class="w-12 shrink-0 font-kai text-[13px]" :class="g.kind === '凶' ? 'text-cinnabar' : g.kind === '吉' ? 'text-jade' : 'text-ink-soft'">
            {{ g.fullName }}
          </span>
          <span class="w-20 shrink-0 text-[10px] text-ink-faint tabular">{{ g.gua }}{{ g.direction }} · {{ g.palace }}宫 · {{ g.kind }}</span>
          <span class="min-w-0 text-[11px] leading-relaxed text-ink-soft">
            {{ g.gist }}
            <!-- 与结算同源:这一行是进 resolveCombat 的数 -->
            <span class="mt-0.5 block tabular text-[10px] text-ink-faint">{{ gateRuleSummary(g.rules) }}</span>
          </span>
        </div>
      </div>
    </section>
    </template>

    <template v-if="codexTab === 'todo' && PLANNED_SCHOOLS.length">
      <SectionTitle title="待续" />
      <section class="card-ink divide-y divide-ink/6 px-4">
      <div v-for="p in PLANNED_SCHOOLS" :key="p.name" class="flex items-start gap-2 py-2.5">
        <span class="w-[104px] shrink-0 font-kai text-[12px] text-ink-soft">{{ p.name }}</span>
        <span class="text-[11px] leading-relaxed text-ink-faint">{{ p.note }}</span>
      </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useUiStore } from '@/stores/ui'
  import { useResourcesStore } from '@/stores/resources'
  import { REALMS, WORLDS } from '@/data/realms'
  import { worldPips, worldProgress } from '@/ui/worldProgress'
  import WorldSeal from '@/components/common/WorldSeal.vue'
  import { mansionGroups, mansionOrdinal } from '@/ui/mansionBoard'
  import { CLASSICS, PLANNED_SCHOOLS, classicsForRealm, type ClassicSchool } from '@/data/classics'
  import { classicRealmMarks, schoolRealmSpan } from '@/ui/classicRealm'
  import { classicsBySchool, schoolNote } from '@/ui/classicBoard'
  import { HEXAGRAMS, TRIGRAMS, trigramDef } from '@/data/yijing'
  import {
    DIVINATION_COST,
    divinationActiveAt,
    readingCounsel,
    readingFromState,
    readingMods
  } from '@/core/divination'
  import { askDivination } from '@/core/divinationService'
  import { PALACES, STARS } from '@/data/ziwei'
  import { fateLordLine } from '@/core/fate'
  import { IMAGES, MANSIONS, type ImageId } from '@/data/xiangxiu'
  import { GATES } from '@/data/qimen'
  import { gateKindMark, palaceBoard } from '@/ui/gateBoard'
  import { hexFigure, hexagramLines, movingCount } from '@/ui/hexagramFigure'
  import { gateRuleSummary } from '@/core/gateRuleText'
  import { cnNumber, formatCountdown, formatGN, formatGap } from '@/utils/format'
  import { gn, gnZero, subClamp } from '@/utils/gnum'
  import { STAR_FOCUS_COST_BASE } from '@/data/constants'
  import { mansionLuckPercent, effectiveFavoredWorld, todayMansion, todayMansionLine } from '@/core/astronomy'
  import { worldDef } from '@/data/realms'
  import type { WorldId } from '@/types'
  import { modsText } from '@/data/statNames'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import { useNow } from '@/composables/useNow'

  const player = usePlayerStore()
  const ui = useUiStore()
  const resources = useResourcesStore()
  const now = useNow()

  type CodexTab = 'realm' | 'classics' | 'yi' | 'ziwei' | 'xiang' | 'qimen' | 'todo'
  const CODEX_TABS: { id: CodexTab; label: string }[] = [
    { id: 'realm', label: '界域' },
    { id: 'classics', label: '典籍' },
    { id: 'yi', label: '周易' },
    { id: 'ziwei', label: '紫微' },
    { id: 'xiang', label: '星象' },
    { id: 'qimen', label: '奇门' }
  ]
  const codexTab = ref<CodexTab>('realm')

  /** 典籍谱:按来路分组,一脉一处(见 ui/classicBoard) */
  const classicRows = computed(() => classicsBySchool(CLASSICS))

  /** 来路的中文名作类名:固定五脉各一枚,认不出的落 default 一档 */
  const SCHOOL_KEYS: Record<ClassicSchool, string> = { 丹道: 'dan', 道家: 'dao', 道教: 'jiao', 佛道: 'fo', 网文: 'web' }
  function schoolKey(school: string): string {
    return SCHOOL_KEYS[school as ClassicSchool] ?? 'other'
  }

  const showAllHex = ref(false)

  /**
   * 六十四卦谱:每卦画成六爻(上卦三爻在上、下卦三爻在下),与在身之卦同一套爻画。
   * 认不出的卦(坏数据)给空爻,不编一幅假的 —— 谱表宁可留白。
   */
  const hexRows = computed(() =>
    HEXAGRAMS.map(x => {
      const upper = trigramDef(x.upper)
      const lower = trigramDef(x.lower)
      const lines = upper && lower ? hexagramLines(upper.lines, lower.lines) : []
      return {
        order: x.order,
        name: x.name,
        gist: x.gist,
        lines,
        aria: `${x.name}卦:上${upper?.name ?? ''}下${lower?.name ?? ''}`
      }
    })
  )

  /** 在身之卦:读 1 秒游戏钟,与服务端同一判据 divinationActiveAt */
  const currentState = computed(() => divinationActiveAt(player.divination, now.value))
  const currentReading = computed(() => {
    const state = currentState.value
    return state ? readingFromState(state) : null
  })
  /** 卦画:六爻自上而下排好,之卦由动爻反向得出(见 ui/hexagramFigure) */
  const figure = computed(() => (currentReading.value ? hexFigure(currentReading.value) : null))
  const figureAria = computed(() => {
    const fig = figure.value
    const reading = currentReading.value
    if (!fig || !reading) return ''
    const moving = movingCount(fig.lines)
    return (
      `本卦${reading.hexagram.name},六爻自上而下:${fig.lines.map(l => l.label).join('、')};` +
      (moving > 0 ? `动爻${moving}爻,之${reading.changed?.name ?? ''}。` : '六爻不动。')
    )
  })
  const counsel = computed(() => (currentReading.value ? readingCounsel(currentReading.value) : []))
  const powerText = computed(() => (currentReading.value ? modsText(readingMods(currentReading.value)) : ''))
  const remainCountdown = computed(() => {
    const state = currentState.value
    return state ? formatCountdown(Math.max(0, Math.ceil((state.expiresAt - now.value) / 1000))) : ''
  })

  /** 判据与 askDivination 的 hasSmall 同一本账 */
  const askShort = computed(() => Math.max(0, DIVINATION_COST - resources.wudao))
  const askDisabled = computed(() => !!currentState.value || askShort.value > 0)
  const askLabel = computed(() => {
    if (currentState.value) return '卦在身'
    if (askShort.value > 0) return `问卦 · 悟道点尚差 ${askShort.value}`
    return `问 卦(悟道点 ${DIVINATION_COST})`
  })

  function ask(): void {
    const out = askDivination()
    if (!out.ok) {
      ui.toast(out.reason ?? '未成卦', 'warn')
      return
    }
    const r = out.reading!
    ui.toast(`得「${r.hexagram.name}」卦${r.changed ? `,之${r.changed.name}` : ''}`, 'info')
  }

  // 命格一世不变(转世重算),不必计时
  const fateLordLineText = computed(() => fateLordLine(player.fateChart))
  const fateModsText = computed(() => modsText(player.fateMods))

  /** 点化主星的灵石单价,文案与扣费同源 */
  const focusCost = gn(STAR_FOCUS_COST_BASE)
  const focusCostText = formatGN(focusCost)
  /** 点化尚差灵石,付得起为 0;指数感知减法,跨数量级不会报错差额 */
  const focusShortGN = computed(() => (resources.hasStone(focusCost) ? gnZero() : subClamp(focusCost, resources.spiritStone)))
  const focusShort = computed(() => focusShortGN.value.m)
  function focusStar(id: string): void {
    const name = STARS.find(s => s.id === id)?.name ?? id
    if (player.fateFocus === id) {
      ui.toast(`「${name}」已显化`, 'info')
      return
    }
    if (focusShort.value > 0) {
      ui.toast(`灵石尚差 ${formatGap(focusShortGN.value)}`, 'warn')
      return
    }
    const ok = player.focusFateStar(id)
    ui.toast(ok ? `已点化「${name}」` : '灵石不足', ok ? 'info' : 'warn')
  }
  const fateRows = computed(() =>
    player.fateChart.palaces.map(p => ({
      palace: p.palace,
      starNames: p.stars.map(s => `${s.name}(${s.nature})`).join('、'),
      // 盘中要逐星排开,不能只留一串拼接文本
      starList: p.stars,
      hasStar: p.stars.length > 0,
      isMing: p.palace.id === 'ming'
    }))
  )

  // 值日之宿与所利界域由游戏日派生,随心跳刷新
  const showAllMansions = ref(false)
  const mansionLine = computed(() => todayMansionLine())
  /** 今值之宿的宿名,供四象盘标位(与 todayMansion 同一处取) */
  const todayMansionName = computed(() => todayMansion().name)
  /** 四象二十八宿分组(见 ui/mansionBoard) */
  const mansionGroupsList = computed(() => mansionGroups(todayMansionName.value))
  const favoredWorldName = computed(() => worldDef(effectiveFavoredWorld()).name)
  function worldName(id: WorldId): string {
    return worldDef(id).name
  }
  function mansionsOf(image: ImageId) {
    return MANSIONS.filter(m => m.image === image)
  }

  /** 图鉴的九宫盘:与远征择门同读一份排布(palaceBoard) */
  const codexBoard = palaceBoard()

  /** 洛书九宫排布句:从 GATES 表推出,不手写;中五无门由循环补出 */
  const luoshuGatesText = computed(() =>
    Array.from({ length: 9 }, (_, i) => {
      const palace = i + 1
      const gate = GATES.find(g => g.palace === palace)
      return gate ? `${gate.gua}${cnNumber(palace)}${gate.direction}${gate.fullName}` : `中${cnNumber(palace)}无门`
    }).join('、')
  )

  const imageWorldMap = computed(() => IMAGES.map(i => `${i.direction}配${worldName(i.world)}`).join('、'))

  const worldRows = computed(() => {
    // 界域进度算一次:模板里按 row.prog 取(见 ui/worldProgress)
    const prog = worldProgress(player.major)
    return WORLDS.map((w, i) => ({
      world: w,
      prog: prog[i]!,
      realms: REALMS.map((def, index) => ({ def, index })).filter(c => c.index >= w.start && c.index <= w.end)
    }))
  })

  function classicsOf(realmId: string) {
    return classicsForRealm(realmId)
  }

  /** 一脉的境界并集与其中已过几境(见 ui/classicRealm) */
  function schoolSpan(school: ClassicSchool) {
    return schoolRealmSpan(CLASSICS.filter(c => c.school === school), player.major)
  }
</script>
