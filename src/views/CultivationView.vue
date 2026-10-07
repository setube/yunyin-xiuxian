<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 境界与突破(修为圆满时整卡蓄势充能) -->
    <div class="card-ink px-4 py-4" :class="player.expFull ? 'card-charged' : ''">
      <!-- 法球主视觉:修为环随修行转动,闭关时点亮、圆满时蓄势 —— 第一眼就是"这一页在干什么" -->
      <div class="flex flex-col items-center gap-3">
        <CultivationOrb :active="retreating" :full="player.expFull" :progress="player.expProgress">
          <span class="font-kai text-[18px]">道</span>
        </CultivationOrb>
        <div class="text-center">
          <p class="font-kai text-[11px] tracking-[0.5em] text-ink-faint">{{ player.worldName }}</p>
          <p class="font-kai text-[30px] tracking-[0.3em] text-ink">{{ player.realm.name }}</p>
          <p class="mt-0.5 font-kai text-[14px] tracking-[0.4em] text-cinnabar">{{ player.subName }}</p>
          <p class="mt-1 text-[11px] text-ink-faint">{{ player.realm.desc }}</p>
          <!-- 可解释性:这一境取自何处、因何承接(典籍 / 网文常用 / 道家本源) -->
          <p class="mt-1 text-[10px] leading-relaxed text-ink-faint">
            「{{ player.realm.basis }}」{{ player.realm.lore }}
          </p>
        </div>
      </div>
      <div class="mt-4">
        <div class="mb-1 flex justify-between text-[11px] text-ink-faint tabular">
          <button class="-my-1 py-1.5 text-left active:opacity-60" @click="showCultBreakdown = !showCultBreakdown">
            修为 +{{ formatRate(player.cultPerSec) }}
            <!--
              灵气充盈正在进行时:这档加成此前只在点开来路才偶然看见。
              现在修为行自己亮一枚小章 —— 与「灵气充盈约 X」那行互斥,
              一个报「还没到」,一个标「已经到了」(判据同 player.qiRich)
            -->
            <span v-if="player.qiRich" class="ml-1 rounded bg-jade/10 px-1 py-0.5 align-middle text-[9px] leading-none text-jade">
              灵气充盈
            </span>
            <span class="ml-0.5 text-[9px] text-ink-faint">{{ showCultBreakdown ? '▾' : '▸' }}来路</span>
          </button>
          <span>
            {{ formatGN(player.expFull ? player.expReq : player.exp) }} / {{ formatGN(player.expReq) }}
            <span v-if="player.expFull && player.expOverflow.m > 0" class="text-jade">
              · 积 +{{ formatGN(player.expOverflow) }}
            </span>
          </span>
        </div>
        <!--
          积余给谁看?突破扣的只是这一境所需(advanceRealm 只减 expReq),
          多出来的修为带着走 —— 不然玩家会以为圆满后多修的全白攒了。
        -->
        <p v-if="player.expFull && player.expOverflow.m > 0" class="mt-0.5 text-right text-[9px] text-ink-faint">
          突破只扣这一境所需,余下修为带着走
        </p>
        <div :class="player.expFull ? 'bar-charged' : ''">
        <ProgressBar :value="player.expProgress" color="var(--color-cinnabar)" :height="8" />
      </div>
      <!--
        进度条只能看出「多少」,看不出「多久」—— 挂机游戏的第二问从来是「还得熬几时」。
        估算是同源除法(缺口 ÷ 现速,见 core/progress.expEtaSec):只报约数,词的落点是现速。
      -->
      <p v-if="!player.expFull && expEtaText" class="mt-1 text-right text-[10px] text-ink-faint tabular">
        按现速,修为圆满约 {{ expEtaText }}
      </p>
      <!-- 修炼速度是玩家最常盯的数,故在它自己那一行就地摊开:基础 × (1 + 各来源) -->
      <div v-if="showCultBreakdown" class="mt-2 rounded-md bg-paper-deep/60 px-2.5 py-2 text-[10px]">
        <p class="text-ink-soft">
          基础 {{ formatRate(cultBase) }}({{ player.realm.name }}{{ player.subName }}{{ player.linggen ? `·${player.linggen.gradeName}` : '' }})
          × (1 + <span class="tabular text-azure">{{ formatPercent(cultMultiplier) }}</span>)
          = <span class="tabular text-cinnabar">{{ formatRate(player.cultPerSec) }}</span>
        </p>
        <p v-for="row in cultSources" :key="row.name" class="mt-0.5 flex justify-between">
          <span class="text-ink-faint">{{ row.name }}</span>
          <span class="tabular" :class="row.value > 0 ? 'text-azure' : 'text-cinnabar'">
            {{ signedPercent(row.value) }}
          </span>
        </p>
        <p class="mt-1 text-[10px] leading-relaxed text-ink-faint">
          这些都是修炼速度的百分比加成,相加后乘在基础上 —— 人物页明细与之一致。
        </p>
      </div>
      </div>
      <div class="mt-3">
        <div class="mb-1 flex justify-between text-[11px] text-ink-faint tabular">
          <button class="-my-1 py-1.5 text-left active:opacity-60" @click="showQiBreakdown = !showQiBreakdown">
            灵气 +{{ formatRate(player.qiRegenPerSec) }}
            <span class="ml-0.5 text-[9px] text-ink-faint">{{ showQiBreakdown ? '▾' : '▸' }}来路</span>
          </button>
          <span title="灵气">
            {{ formatNum(Math.floor(Math.min(resources.qi, player.qiCapValue))) }} / {{ formatNum(player.qiCapValue) }}
            <span v-if="resources.qi > player.qiCapValue" class="text-azure">
              · 积余 {{ formatNum(Math.floor(resources.qi)) }} / {{ formatNum(player.qiBankCapValue) }}
            </span>
          </span>
        </div>
        <ProgressBar
          :value="Math.min(1, resources.qi / Math.max(1, player.qiCapValue))"
          color="var(--color-azure)"
          :height="8"
        />
        <!--
          灵气上限与恢复速度同修为行一样讲「从哪来」:上限 = 本境基础 × 聚灵阵 × (1+其余词条),
          回复 = 本境基础 × (1+词条)。与面板读同一份数(qiCap / qiCapMult / finalStats.mods),
          聚灵阵 0 级或词条为空时对应因子不出现,乘法仍重组得上。
        -->
        <div v-if="showQiBreakdown" class="mt-2 rounded-md bg-paper-deep/60 px-2.5 py-2 text-[10px]">
          <p class="text-ink-soft">
            上限:本境基础 {{ formatNum(qiBase) }}({{ player.realm.name }}{{ player.subName }})
            <span v-if="qiArrayPct"> × 聚灵阵 +{{ qiArrayPct }}%</span>
            <span v-if="qiCapPct"> × 其余加成 +{{ formatPercent(qiCapPct) }}</span>
            = <span class="tabular text-azure">{{ formatNum(player.qiCapValue) }}</span>
          </p>
          <p class="mt-1 text-ink-soft">
            回复:基础 {{ formatRate(qiRegenBase) }} × (1 + <span class="tabular text-azure">{{ formatPercent(qiRegenMult) }}</span>) = <span class="tabular text-cinnabar">{{ formatRate(player.qiRegenPerSec) }}</span>
          </p>
          <p class="mt-1 text-[9px] leading-relaxed text-ink-faint">聚灵阵与其余加成乘在上限上,灵气条所示即此数。</p>
        </div>
        <!--
          与修为那句同一份估算,分两档:未过灵气充盈线时报「充盈」—— 那是修为要跳一档的时刻,
          那句「修为 +X%」随手可得(qiRich / QI_RICH_BONUS 同源);过了半才报回满。两行互斥,不打架。
        -->
        <p v-if="qiRichEtaText" class="mt-1 text-right text-[10px] text-ink-faint tabular">
          按现速,灵气充盈约 {{ qiRichEtaText }}<span class="text-ink-soft">(修为 +{{ qiRichBonusPct }})</span>
        </p>
        <p v-else-if="resources.qi < player.qiCapValue && qiEtaText" class="mt-1 text-right text-[10px] text-ink-faint tabular">
          按现速,灵气回满约 {{ qiEtaText }}
        </p>
        <!-- 积余段(灵气越过标称容量):「回满」的说法已不适用,答的是蓄满积余还要多久 -->
        <p v-else-if="qiBankEtaText" class="mt-1 text-right text-[10px] text-ink-faint tabular">
          按现速,积余蓄满约 {{ qiBankEtaText }}
        </p>
        <!-- 以灵气疗伤(修复):灵气积余的用途,代价随境界指数增长 -->
        <button
          v-if="repair.injured"
          type="button"
          class="btn-seal mt-2 w-full !py-2 !text-[12px]"
          :disabled="!repair.affordable"
          @click="repairWithQi()"
        >
          {{ repairActLabel(repair.affordable, formatNum(repair.cost)) }}
        </button>
      </div>

      <div class="ink-divider my-4" />
      <div class="flex items-center justify-between text-[12px] text-ink-soft">
        <span>下一步:{{ btInfo.targetLabel }}</span>
      </div>
      <!--
        天劫步不显示「突破成功率」:那条路根本不掷这个骰子(见 breakthrough.attemptBreakthrough,
        渡劫走 runTribulation 的逐波推演),摆出来只会让人以为还有一个可以堆的概率。
      -->
      <div class="mt-2 grid gap-2" :class="btInfo.needTribulation ? 'grid-cols-1' : 'grid-cols-2'">
        <div v-if="!btInfo.needTribulation" class="rounded-md bg-paper-deep/60 px-2.5 py-1.5">
          <!-- 两段 10px 字的按钮,裸着只有 16px 高 —— layout-check 一嗓子喊出来(拇指点不着)。
               -my-1 py-2:靶面抬到 31px,负外边距把视觉位移抵回去,行高不动 -->
          <button class="-my-1 flex w-full items-baseline justify-between gap-1 py-2 text-left" @click="rateOpen = !rateOpen">
            <span class="text-[10px] text-ink-faint">进阶成功率(小进阶)</span>
            <span class="text-[9px] text-ink-faint">{{ rateOpen ? '▾' : '▸' }}来路</span>
          </button>
          <p class="tabular text-[16px] font-kai leading-tight" :class="btInfo.rate >= 0.7 ? 'text-jade' : 'text-cinnabar'">
            {{ btInfo.rateText }}
          </p>
          <!-- 率不是天外飞数:4 项操作数与结算同一批,展开即见 —— 0 贡献的档位渲染时就省略了 -->
          <template v-if="rateOpen">
            <p v-for="part in btInfo.rateParts" :key="part.label" class="mt-0.5 flex justify-between text-[10px]">
              <span class="text-ink-faint">{{ part.label }}</span>
              <span class="tabular" :class="part.value > 0 ? 'text-azure' : 'text-cinnabar'">{{ signedPercent(part.value) }}</span>
            </p>
            <p class="mt-1 text-[10px] leading-relaxed text-ink-faint">各项相加,再按上下限敛口,方成此数。</p>
          </template>
        </div>
        <div class="rounded-md bg-paper-deep/60 px-2.5 py-1.5">
          <p class="text-[10px] text-ink-faint">{{ btInfo.needTribulation ? '此劫' : '渡劫' }}</p>
          <template v-if="tribPlan">
            <p class="tabular text-[16px] font-kai leading-tight" :class="PLAN_COLOR[tribPlan.verdict]">
              {{ tribPlan.title }}
            </p>
            <p class="text-[10px] text-ink-faint">
              劫势:{{ verdictLabel(tribPlan.verdict) }}
              <template v-if="tribPlan.risks.length"> · {{ tribPlan.risks[0] }}</template>
            </p>
          </template>
          <p v-else class="text-[16px] font-kai leading-tight text-ink-faint">非大关</p>
        </div>
      </div>

      <!-- Phase 32.0 劫势详情(决意前评估:风险维度 + 建议,信息给足,决定留给玩家) -->
      <div v-if="tribPlan" class="mt-2 rounded-md border border-violet-ink/25 bg-violet-ink/5 px-3 py-2">
        <!-- 总评:劫名一眼可读,形态(逐道加重/起手最重)挪到行尾 —— 不再以十行小字开场 -->
        <div class="flex items-baseline gap-2">
          <p class="grow text-[12px] font-kai leading-snug text-violet-ink">{{ tribPlan.desc }}</p>
          <span class="shrink-0 text-[10px] text-ink-faint">{{ tribPlan.def.waveShape === 'frontLoaded' ? '起手两道最重' : '逐道加重' }}</span>
        </div>

        <!-- 准备四维:一行四格星级槽,缺口一眼可见(0 星置灰,不熟也不糊弄) -->
        <div class="mt-2 grid grid-cols-4 gap-1.5">
          <div v-for="(name, key) in PREP_NAMES" :key="key" class="rounded bg-paper-deep/60 px-0.5 py-1 text-center">
            <p class="text-[9px] text-ink-faint">{{ name }}</p>
            <p class="tabular text-[12px] font-kai" :class="tribPlan.prep[key] === 0 ? 'text-ink-faint' : 'text-ink-soft'">{{ PREP_STARS[tribPlan.prep[key]] }}</p>
          </div>
        </div>

        <div class="ink-divider my-2" />
        <!-- 此劫账单:四项百分比指标两两并排,别有十逗号长句了 -->
        <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <p class="flex flex-col gap-0.5 text-[10px] tabular">
            <span class="text-ink-faint">天劫抗性</span>
            <span class="text-ink-soft leading-tight">
              {{ formatPercent(tribLedger.resist, 0) }}
              <span class="text-ink-faint">(防御折 {{ formatPercent(tribLedger.statResist, 0) }})</span>
            </span>
          </p>
          <p class="flex items-baseline justify-between gap-2 text-[10px] tabular">
            <span class="text-ink-faint">每波恢复</span>
            <span class="text-ink-soft">{{ formatPercent(tribLedger.sustain, 1) }}</span>
          </p>
          <p class="flex items-baseline justify-between gap-2 text-[10px] tabular">
            <span class="text-ink-faint">减伤</span>
            <span class="text-ink-soft">{{ formatPercent(tribLedger.reduction, 0) }}</span>
          </p>
          <p class="flex flex-col gap-0.5 text-[10px] tabular">
            <span class="text-ink-faint">开劫护持</span>
            <span class="text-ink-soft leading-tight">
              {{ formatPercent(tribLedger.guard, 0) }}
              <span class="text-ink-faint">(气血折 {{ formatPercent(tribLedger.statGuard, 0) }})</span>
            </span>
          </p>
        </div>
        <p class="mt-2 text-[10px] leading-relaxed text-ink-faint">
          攻伐之力不助渡劫;防御与气血按当下境界另算,再厚也只能硬抗一隅,余者靠抗性、减伤与恢复;晋升与准备只能帮小进阶,渡劫大关不认。
        </p>

        <!-- 界膜之劫:跨界规则加难(见 TRIB_WORLD_STEP_STAT_FOLD),决意之前必须说清 -->
        <div v-if="worldStep" class="mt-2 rounded-md border border-cinnabar/30 bg-cinnabar/5 px-2.5 py-2">
          <p class="text-[10px] leading-relaxed text-cinnabar/90">界膜之劫:跨界这一关血肉之厚一概不算 —— 防御与气血折算出的抗性、开劫护持在此作废,只认词条与准备。</p>
        </div>
        <!-- 天威长相:道数随境界涨、单波逐道加重,摊出来才知道护持该留到哪一段 -->
        <p v-if="tribWeatherLine" class="mt-1.5 text-[10px] leading-relaxed text-cinnabar/80">{{ tribWeatherLine }}</p>
        <p v-if="tribWave" class="mt-1 text-[10px] text-ink-faint tabular">
          共 {{ tribWave.waves }} 道,单波 {{ formatPercent(tribWave.min, 0) }}–{{ formatPercent(tribWave.max, 0) }} 最大生命(合计约 {{ formatPercent(tribWave.total, 0) }})
        </p>

        <div class="ink-divider my-1.5" />
        <p class="text-[10px] leading-relaxed text-ink-faint"><span class="text-ink-soft">主要风险:</span>{{ tribPlan.risks.join('; ') }}</p>
        <p class="mt-1 text-[10px] leading-relaxed text-ink-faint">{{ tribPlan.advice }}</p>
        <!-- Phase 32.2:灵根解开的那条路——说明这道劫为何对你不太一样(留一线,不是免死) -->
        <p v-if="reliefRoots.length" class="mt-1.5 text-[10px] leading-relaxed text-jade">
          灵根相应:{{ reliefRoots.map(e => ELEMENTS[e].name).join('、') }} —— 此劫为你留了一线,能走到哪一步仍看自身准备。
        </p>
      </div>
      <p class="mt-1 flex items-center gap-1.5 text-[11px] text-ink-faint tabular">
        耗灵气 {{ formatNum(btInfo.qiCost) }}
        <!-- 大关/大槛落在小印章上,与全页「静/备/主/秘」一套印章语言呼应,不再是一行朱砂裸字 -->
        <span v-if="btInfo.needTribulation" class="rounded bg-violet-ink/10 px-1.5 py-0.5 text-[10px] leading-none text-violet-ink">
          大关 · 渡劫
        </span>
        <span v-else-if="btInfo.isMajor" class="rounded bg-ink/6 px-1.5 py-0.5 text-[10px] leading-none text-ink-faint">
          大境界之槛
        </span>
      </p>

      <!-- Phase 28 突破准备:静坐调息 / 服聚气丹(无劫突破时,一次性加成) -->
      <div v-if="!btInfo.needTribulation" class="mt-2 flex items-start gap-2.5 rounded-md border border-ink/10 bg-paper-deep/50 px-2.5 py-2">
        <!-- 备:与全页印章同语言,一眼认出这是突破前的准备板 -->
        <span class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-jade/15 font-kai text-[12px] text-jade">备</span>
        <div class="min-w-0 grow">
          <div class="flex items-center justify-between text-[10px] text-ink-faint">
          <span>突破准备(一次有效)</span>
          <!--
            倒计时一律走 formatCountdown(定宽),不用 formatDuration:
            后者每秒都可能改宽度,这枚胶囊一涨一缩,同一行的其余内容会跟着跳。
          -->
          <span v-if="btInfo.prep.sitting" class="text-amber-ink tabular">
            调息中 · <span class="countdown-slot">{{ formatCountdown(btInfo.prep.remainingSec) }}</span>
          </span>
          <span v-else-if="btInfo.prep.ready" class="text-jade">加成 +{{ Math.round(btInfo.prep.bonus * 100) }}% 就绪</span>
        </div>
        <!--
          两个准备选项并排,但 chip-ink 是 nowrap 的胶囊,320px 窄屏放不下两枚
          (实测第二枚右缘到 331px,越界 11px)。故允许换行:宽屏并排、窄屏上下。
        -->
        <div v-if="!btInfo.prep.sitting && !btInfo.prep.ready" class="mt-1.5 flex flex-wrap gap-1.5">
          <button type="button" class="chip-ink !py-1.5 text-[10px]" @click="startPrep('meditate')">
            {{ prepMeditate.label }} · {{ Math.round(prepMeditate.duration / 60) }}分钟
            +{{ Math.round(prepMeditate.bonusRate * 100) }}%
          </button>
          <button type="button" class="chip-ink !py-1.5 text-[10px]" :disabled="!prepCanPill" @click="startPrep('pill')">
            {{ prepPill.label }} · {{ prepPillCost }}灵石 +{{ Math.round(prepPill.bonusRate * 100) }}%
            <span v-if="!prepCanPill" class="text-ink-faint">({{ prepPillDisabledLabel() }})</span>
          </button>
        </div>
        </div>
      </div>
      <button
        class="btn-seal mt-3 w-full !py-3"
        :class="{ 'animate-glow-pulse pulse-ready': btInfo.ready }"
        :disabled="!btInfo.ready"
        @click="attemptBreakthrough()"
      >
        {{ btInfo.ready ? (btInfo.needTribulation ? '引 劫 突 破' : '尝 试 突 破') : btInfo.reason }}
      </button>
    </div>

    <!-- 仙路旅途:从凡到仙的 21 境全景 —— 局部有「下一步」,这张是纵向视野:已至几境、距尽头还有多远 -->
    <section>
      <SectionTitle title="仙路" :hint="`已至 ${player.major + 1}/${REALMS.length} 境`" />
      <div class="card-ink mt-2 px-4 py-3">
        <RealmLadder :major="player.major" />
      </div>
    </section>

    <!-- Phase 28 闭关:5 分钟 +150% 修炼,期间禁止历练(数值唯一来源 = buffs.ts retreat + earlyGameService) -->
    <div class="card-ink flex items-start gap-3 px-4 py-3" :class="retreating ? 'bg-amber-ink/6' : ''">
      <!-- 静修印:与全页印章同一块语言;闭关中转为琥珀并在原地呼吸,静而有觉 -->
      <span
        class="grid h-9 w-9 shrink-0 place-items-center rounded-md font-kai text-[15px]"
        :class="retreating ? 'animate-breathe bg-amber-ink/15 text-amber-ink' : 'bg-jade/15 text-jade'"
      >静</span>
      <div class="min-w-0 grow">
        <div class="flex items-center justify-between">
          <span class="text-[11px] text-ink-soft">闭关参悟</span>
          <span v-if="retreating" class="text-[10px] text-amber-ink tabular">
            闭关中 · <span class="countdown-slot">{{ formatCountdown(retreatRemaining) }}</span>
          </span>
        </div>
        <p class="mt-0.5 text-[10px] text-ink-faint">
          静坐一炷香({{ retreatMinutes }} 分钟),修炼速度 +{{ retreatPct }}%;闭关期间无法外出历练。
        </p>
        <!-- 闭关中:倒计时旁边补一枚「已多得」的活数 —— 与预览行同一份每多得速率,一眼看见时间没有白熬 -->
        <p v-if="retreating && retreatSoFarGain" class="mt-1 text-[10px] text-jade">{{ retreatSoFarGain }}</p>
        <p v-if="!retreating" class="mt-1 text-[10px] text-jade">{{ retreatGain }}</p>
        <button v-if="!retreating" type="button" class="chip-ink mt-2 w-full !py-1.5 text-[11px]" @click="beginRetreat">
          闭关 · {{ retreatMinutes }}分钟 修炼 +{{ retreatPct }}%
        </button>
      </div>
    </div>

    <!-- 状态:无增益时给出空态,不再整段消失(会让玩家以为这功能不存在) -->
    <section>
      <SectionTitle title="状态" />
      <div v-if="activeBuffs.length" class="mt-2 flex flex-wrap gap-2">
        <!--
          状态胶囊每秒刷新一次,倒数文本必须定宽:formatCountdown 逐位补零,
          再给它一个固定宽度的槽位(文字右对齐)—— 否则「10分0秒 → 10分1秒」
          这一位的增减会把整排胶囊推来推去,看起来就是「状态一直在抖」。
        -->
        <button
          v-for="b in activeBuffs"
          :key="b.def!.id"
          type="button"
          class="chip-ink !py-1.5 tabular transition-transform active:scale-90"
          :class="b.def!.kind === 'injury' ? 'border-cinnabar/60 text-cinnabar' : 'border-jade/60 text-jade'"
          @click="ui.buffDetailId = b.def!.id"
        >
          <GameIcon :name="b.def!.icon" :size="11" />
          {{ b.def!.name }}
          <span class="countdown-slot">{{ formatCountdown(b.remain) }}</span>
        </button>
      </div>
      <!-- 空态:什么状态都没有时,告诉玩家这个区域存在、以及怎么点亮它 -->
      <div v-else class="mt-2 flex items-center gap-2 rounded-md border border-dashed border-ink/15 bg-ink/4 px-3 py-2">
        <GameIcon name="sparkles" :size="12" class="shrink-0 text-ink-faint" />
        <span class="text-[10px] leading-relaxed text-ink-faint">暂无增益加身 —— 服丹药 · 修功法 · 遇奇缘,都会为这段道途续上状态。</span>
      </div>
    </section>

    <!-- 丹药速服 -->
    <section v-if="quickPills.length">
      <SectionTitle title="以药辅道" />
      <div class="mt-2 grid grid-cols-2 gap-2">
        <button
          v-for="p in quickPills"
          :key="p.def!.id"
          class="card-ink flex items-center gap-2 px-3 py-2 text-left active:scale-98"
          :style="{ borderLeft: `2px solid ${qualityDef(p.def!.quality).color}` }"
          @click="usePill(p.def!.id)"
        >
          <GameIcon :name="p.def!.icon" :size="16" :style="{ color: qualityDef(p.def!.quality).color }" />
          <span class="min-w-0 grow">
            <span class="block truncate font-kai text-[12px] text-ink">{{ p.def!.name }}</span>
            <span class="block text-[10px] text-ink-faint">存 {{ p.count }}</span>
          </span>
          <span class="text-[11px] text-jade">服用</span>
        </button>
      </div>
    </section>

    <!-- 功法 -->
    <section>
      <!-- 玩家反馈:看功法列表时只报残页,悟道点要开弹窗才看得见 —— 这里一并报 -->
      <SectionTitle title="功法" :hint="`残页 ${resources.page} · 悟道点 ${formatGN(resources.wudao)}`" />
      <div class="mt-2 space-y-2">
        <!-- 主修 -->
        <button
          v-if="mainDef"
          class="card-ink flex w-full items-center gap-3 px-4 py-3 text-left active:scale-98"
          @click="ui.gongfaDetailId = mainDef.id"
        >
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cinnabar/10 font-kai text-cinnabar">主</span>
          <span class="min-w-0 grow">
            <span class="block truncate font-kai text-[14px] text-ink">{{ mainDef.name }}</span>
            <span class="block text-[11px] text-ink-faint">
              第 {{ cultivation.learned[mainDef.id] }} 层 · {{ qualityDef(mainDef.quality).name }}
            </span>
          </span>
          <GameIcon name="flame" :size="15" class="text-cinnabar/70" />
        </button>

        <!--
          门类分段切换:主修/辅修/秘术 三选一,只渲染选中门类 ——
          辅修一按即见,不再埋在长笺里;选中门类单类展示、栏头不再粘顶互相叠压。
        -->
        <div
          class="card-ink flex gap-1 p-1"
          role="tablist"
          aria-label="功法门类"
          @keydown="onGongfaCatKeydown"
        >
          <button
            v-for="g in gongfaCategories"
            :key="g.type"
            role="tab"
            :aria-selected="gongfaCat === g.type"
            :tabindex="gongfaCat === g.type ? 0 : -1"
            class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 font-kai text-[13px] tracking-[0.1em] transition-colors duration-200"
            :class="gongfaCat === g.type ? 'bg-ink text-paper shadow-inner' : 'text-ink-faint active:text-ink-soft'"
            @click="gongfaCat = g.type"
          >
            <!-- 门类小印章:与列表行同一块语言,激活时压成纸上字,暗色下仍可辨 -->
            <span
              class="grid h-5 w-5 place-items-center rounded font-kai text-[11px]"
              :class="gongfaCat === g.type ? 'bg-paper/15 text-paper' : gongfaCatSeal(g.type)"
            >{{ g.type === 'secret' ? '秘' : g.type === 'main' ? '主' : '辅' }}</span>
            <span>{{ GONGFA_TYPE_NAMES[g.type] }}</span>
            <span class="text-[10px]" :class="gongfaCat === g.type ? 'text-paper/60' : 'text-ink-faint'">{{ g.items.length }} 部</span>
          </button>
        </div>

        <!-- 选中门类的已习得列表:单类一屏,栏内按品质降序 -->
        <div
          class="card-ink max-h-80 divide-y divide-ink/6 overflow-y-auto px-1"
          role="tabpanel"
          :aria-label="GONGFA_TYPE_NAMES[gongfaCat]"
        >
          <button
            v-for="def in activeGongfaItems"
            :key="def!.id"
            class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left active:bg-ink/4"
            @click="ui.gongfaDetailId = def!.id"
          >
            <!-- 门类印章:与主修卡「主」字同一块语言,辅/秘一眼可辨 -->
            <span
              class="grid h-8 w-8 shrink-0 place-items-center rounded-md font-kai text-[13px]"
              :class="def!.type === 'secret' ? 'bg-violet-ink/15 text-violet-ink' : def!.type === 'main' ? 'bg-cinnabar/10 text-cinnabar' : 'bg-jade/15 text-jade'"
            >{{ def!.type === 'secret' ? '秘' : def!.type === 'main' ? '主' : '辅' }}</span>
            <!-- 品质染名的功法名 -->
            <span class="min-w-0 grow truncate font-kai text-[13px]" :style="{ color: qualityDef(def!.quality).color }">{{ def!.name }}</span>
            <span class="shrink-0 text-[10px] text-ink-faint">{{ cultivation.learned[def!.id] }} 层</span>
            <!-- Phase 31 A3:已选分支显示道名;确有歧路可择时才招手,否则只报「圆满」 -->
            <span v-if="branchName(def!.id)" class="max-w-24 shrink-0 truncate rounded bg-gold-ink/10 px-1.5 py-0.5 text-[10px] text-gold-ink">
              {{ branchName(def!.id) }}
            </span>
            <span v-else-if="canEnlighten(def!.id)" class="shrink-0 rounded bg-azure/10 px-1.5 py-0.5 text-[10px] text-azure">待悟道 →</span>
            <span v-else-if="isFull(def!.id)" class="shrink-0 rounded bg-ink/6 px-1.5 py-0.5 text-[10px] text-ink-faint">圆满</span>
            <span class="shrink-0 text-[10px]" :class="equipStateOf(def!.id) ? 'text-jade' : 'text-ink-faint'">
              {{ equipStateOf(def!.id) || '未装配' }}
            </span>
          </button>
          <p v-if="activeGongfaItems.length === 0" class="px-2.5 py-5 text-center text-[10px] text-ink-faint">
            此门尚无习得功法 —— 参悟或将它转为此门,功法便在此现身。
          </p>
        </div>

        <!--
          参悟池还剩几部也报出来:藏经阁是「花残页赌一部没见过的」,
          玩家看不到池子还有多大,就无从判断这一注值不值。
        -->
        <button class="btn-ghost w-full" @click="comprehendGongfa()">
          于藏经阁参悟功法(残页×{{ COMPREHEND_PAGE_COST }})
          <span v-if="comprehendLeft > 0" class="ml-1 text-[10px] text-ink-faint">· 池中尚有 {{ comprehendLeft }} 部未参</span>
          <span v-else class="ml-1 text-[10px] text-ink-faint">· {{ gongfaAllLearnedToast() }}</span>
        </button>
      </div>
    </section>

    <GongfaDialog />
    <BuffDialog />
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useResourcesStore } from '@/stores/resources'
  import { useDongfuStore } from '@/stores/dongfu'
  import CultivationOrb from '@/components/common/CultivationOrb.vue'
  import { useCultivationStore } from '@/stores/cultivation'
  import { useInventoryStore } from '@/stores/inventory'
  import { useUiStore } from '@/stores/ui'
  import { attemptBreakthrough, breakthroughInfo } from '@/core/breakthrough'
  import { prepareBreakthrough, startRetreat, isRetreating, getRetreatRemainingSec } from '@/core/earlyGameService'
  import { toNum } from '@/utils/gnum'
  import { baseCultPerSec, baseQiRegen, qiCap } from '@/core/formulas'
  import { modOf } from '@/core/statsCalc'
  import {
    currentStatGuard,
    currentTribulationPlan,
    currentTribulationRelief,
    currentTribResist,
    guardScore,
    statFoldAt,
    sustainScore,
    tribReduction,
    tribulationWaveSpan,
    verdictLabel,
    type TribulationPlan
  } from '@/core/tribulationDecision'
  import { reliefElements, rootElements } from '@/core/linggenAffinity'
  import { comprehendGongfa } from '@/core/gongfaService'
  import { expEtaSec, qiBankEtaSec, qiEtaSec, qiRichEtaSec, retreatGainText, retreatGainedText } from '@/core/progress'
  import { usePill } from '@/core/pillService'
  import { qiRepairView, repairWithQi } from '@/core/qiRepair'
  import { useNow } from '@/composables/useNow'
  import { BREAKTHROUGH_PREP_OPTIONS } from '@/data/earlyGame'
  import { GONGFA, gongfaDef, GONGFA_TYPE_NAMES } from '@/data/gongfa'
  import type { GongfaDef, GongfaType } from '@/types'
  import { ELEMENTS } from '@/data/linggen'
  import { canEnlighten as canEnlightenGongfa, gongfaBranchDef } from '@/data/gongfaBranches'
  import { buffDef } from '@/data/buffs'
  import { pillDef } from '@/data/pills'
  import { COMPREHEND_PAGE_COST, QI_RICH_BONUS } from '@/data/constants'
  import { todayWeather } from '@/core/weather'
  import { weatherTribulationLine } from '@/ui/weatherText'
  import { formatCountdown, formatDuration, formatGN, formatNum, formatPercent, formatRate } from '@/utils/format'
  import { signedPercent } from '@/ui/statNames'
  import { gongfaAllLearnedToast } from '@/ui/gongfaText'
  import { prepPillDisabledLabel, prepPillShortToast, repairActLabel } from '@/ui/cultivationText'
  import { qualityDef } from '@/data/qualities'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import ProgressBar from '@/components/common/ProgressBar.vue'
  import RealmLadder from '@/components/cultivation/RealmLadder.vue'
  import { REALMS } from '@/data/realms'
  import GameIcon from '@/components/common/GameIcon.vue'
  import GongfaDialog from '@/components/cultivation/GongfaDialog.vue'
  import BuffDialog from '@/components/cultivation/BuffDialog.vue'

  const player = usePlayerStore()
  const resources = useResourcesStore()
  const dongfu = useDongfuStore()

  /**
   * 修炼速度的来路 —— 玩家最常盯的就是这一行,故就地摊开:
   *   基础(境界/层) × (1 + 各来源之和)
   * 来源取自 finalStats.breakdown,与人物页属性明细同源,不在界面里另算一遍。
   */
  const showCultBreakdown = ref(false)
  const cultBase = computed(() => baseCultPerSec(player.major, player.sub))
  const cultSources = computed(() =>
    player.finalStats.breakdown
      .map(r => ({ name: r.name, value: r.mods.cultivationSpeed ?? 0 }))
      .filter(r => r.value !== 0)
  )
  const cultMultiplier = computed(() => modOf(player.finalStats.mods, 'cultivationSpeed'))
  /** 小进阶成功率那格的「来路」展开态(与修为来路同一收缩 idiom) */
  const rateOpen = ref(false)
  /** 修为圆满的估算时长文案(空白即不显示,见 core/progress.expEtaSec) */
  const expEtaText = computed(() => {
    const sec = expEtaSec()
    return sec > 0 ? formatDuration(sec) : ''
  })
  /** 灵气回满的估算时长文案(空白即不显示,见 core/progress.qiEtaSec) */
  const qiEtaText = computed(() => {
    const sec = qiEtaSec()
    return sec > 0 ? formatDuration(sec) : ''
  })
  /** 是否仍差一点才到「灵气充盈」—— 到了就不报,因为修为已在享那档加成 */
  const qiRichEtaText = computed(() => {
    const sec = qiRichEtaSec()
    return sec > 0 ? formatDuration(sec) : ''
  })
  /** 灵气积余段的「蓄满」估算(空白即不显示,见 core/progress.qiBankEtaSec) */
  const qiBankEtaText = computed(() => {
    const sec = qiBankEtaSec()
    return sec > 0 ? formatDuration(sec) : ''
  })
  /** 灵气充盈的修为加成(取自常数,不在界面手抄) */
  const qiRichBonusPct = computed(() => formatPercent(QI_RICH_BONUS))

  /**
   * 灵气上限/恢复速度的来路 —— 与灵气条读同一份数,不在界面另算:
   *   上限 = qiCap(境界,层) × dongfu.qiCapMult × (1 + finalStats 词条),floor 后入面板;
   *   回复 = baseQiRegen(境界) × (1 + 词条)。
   * 聚灵阵未建(<1)或词条为空时,对应因子为 0、行内不渲染,乘积不变。
   */
  const showQiBreakdown = ref(false)
  const qiBase = computed(() => qiCap(player.major, player.sub))
  const qiArrayPct = computed(() => {
    const pct = (dongfu.qiCapMult - 1) * 100
    return pct > 0 ? Math.round(pct) : 0
  })
  const qiCapPct = computed(() => modOf(player.finalStats.mods, 'qiCapPct'))
  const qiRegenBase = computed(() => baseQiRegen(player.major))
  const qiRegenMult = computed(() => modOf(player.finalStats.mods, 'qiRegen'))
  const cultivation = useCultivationStore()
  const inventory = useInventoryStore()
  const ui = useUiStore()
  const now = useNow()

  const btInfo = computed(() => breakthroughInfo())

  // Phase 28 突破准备:按钮文案/耗时/药价全部来自 BREAKTHROUGH_PREP_OPTIONS,不再在视图里写第二份
  const prepMeditate = BREAKTHROUGH_PREP_OPTIONS.find(o => o.id === 'meditate')!
  const prepPill = BREAKTHROUGH_PREP_OPTIONS.find(o => o.id === 'pill')!
  const prepPillCost = prepPill.cost?.stone ?? 0
  // toNum 在指数 >308 时返回 Infinity(见 utils/gnum)—— 先排掉非有限值,
  // 否则 Infinity >= cost 恒真会让「药价不足」的按钮误亮(与 progress.ts 同判据)
  const prepCanPill = computed(() => {
    const stone = toNum(resources.spiritStone)
    return Number.isFinite(stone) && stone >= prepPillCost
  })

  function startPrep(option: 'meditate' | 'pill'): void {
    if (prepareBreakthrough(option)) {
      ui.toast(option === 'meditate' ? '你盘膝入定,静待调息完成' : '丹药入腹,气机已然蓄足', 'info')
    } else {
      ui.toast(prepPillShortToast(), 'warn')
    }
  }

  // Phase 28 闭关:状态与倒计时接 earlyGameService(buff 为真相源,重载后依旧可信)
  const retreating = computed(() => isRetreating())
  const retreatRemaining = computed(() => getRetreatRemainingSec(now.value)) // now 每秒刷新,倒计时走动
  /**
   * 闭关的时长与加成取自 buffs.ts 的 retreat 本体(不在这里手抄 5 分钟 / +150%)。
   * 之前注释写着"数值唯一来源 = buffs.ts",但文案里的数字是手打的 —— 改常数就会撒谎。
   */
  const retreatDef = buffDef('retreat')
  const retreatMinutes = Math.round((retreatDef?.durationSec ?? 0) / 60)
  const retreatPct = Math.round((retreatDef?.mods.cultivationSpeed ?? 0) * 100)
  /** 闭关「约多得」修为预览 —— 由 progress.retreatGainText 与 buff 本体同源算出;境界涨了跟着重算 */
  const retreatGain = computed(() => retreatGainText())
  /** 闭关中的「已多得」活数 —— 已走时长由 retreatRemaining 反推,速率与预览同一份 */
  const retreatSoFarGain = computed(() => {
    if (!retreating.value) return ''
    const dur = retreatDef?.durationSec ?? 0
    if (!(dur > 0)) return ''
    return retreatGainedText(Math.max(0, dur - retreatRemaining.value))
  })
  function beginRetreat(): void {
    if (startRetreat()) {
      ui.toast('你封洞闭关,心不外骛', 'info')
    }
  }

  // Phase 32.0 天劫决策:劫型 + 准备度(仅大关天劫时)
  const PLAN_COLOR: Record<TribulationPlan['verdict'], string> = {
    danger: 'text-cinnabar',
    hard: 'text-amber-ink',
    ok: 'text-azure',
    easy: 'text-jade'
  }
  const PREP_NAMES = { guard: '护持', sustain: '恢复', resist: '抗性', burst: '爆发' } as const
  const PREP_STARS = ['·', '✧', '✧✧', '✧✧✧'] as const
  const tribPlan = computed(() => (btInfo.value.needTribulation ? currentTribulationPlan() : null))

  /**
   * 这一劫是不是「界膜」那一关(人间→仙界 / 仙界→神界 / 神界→混沌海)。
   *
   * 判据取自 tribulationDecision.statFoldAt(三维折算的折扣):
   * 界面与结算读的必须是同一个数,否则又会出现"显示有护持、结算没有"。
   */
  const tribTargetMajor = computed(() => (player.isMajorStep ? player.major + 1 : player.major))
  const worldStep = computed(() => statFoldAt(tribTargetMajor.value) < 1)

  /**
   * 渡劫账上的四项实际读数。
   * 恢复与开劫护持走 sustainScore / guardScore:铁躯、逆流会把护盾与回血打折,
   * 不能把词条原值当成开劫水位。
   */
  const tribLedger = computed(() => {
    const mods = player.finalStats.mods
    const stat = currentStatGuard()
    const def = tribPlan.value?.def
    const relief = def ? currentTribulationRelief(def.id) : undefined
    // Same cap and same fold as waveDamage: reduction 0.6, resist 0.8, linggen reductionToResist.
    const reduction = tribReduction(mods)
    return {
      resist: currentTribResist(mods, relief, stat),
      statResist: stat.resist,
      reduction,
      sustain: def ? sustainScore(mods, def, relief) : 0,
      guard: (def ? guardScore(mods, def, relief) : 0) + stat.guard,
      statGuard: stat.guard
    }
  })

  /**
   * 天威本身的长相(道数 + 单波区间):与结算同一批函数。
   * 必须乘入今日 tribulationMult —— 劫势 verdict 已经吃了天时,
   * 百分比若不乘,雷鸣日会看起来比真劫轻一截。
   */
  const tribWeather = computed(() => todayWeather())
  const tribWeatherLine = computed(() => weatherTribulationLine(tribWeather.value))
  const tribWave = computed(() =>
    tribPlan.value
      ? tribulationWaveSpan(tribPlan.value.def, tribTargetMajor.value, tribWeather.value.tribulationMult)
      : null
  )

  /** 灵气疗伤(修复)状态:负伤时才出现入口,代价随灵气容量指数增长 */
  const repair = computed(() => qiRepairView())

  /** Phase 32.2 与此劫气机相应的灵根:判据取自 tribulationRelief,界面说的与结算做的同源 */
  const reliefRoots = computed(() =>
    tribPlan.value ? reliefElements(rootElements(player.linggen?.roots), tribPlan.value.kind) : []
  )

  const activeBuffs = computed(() =>
    cultivation.buffs
      .map(b => ({ def: buffDef(b.defId), remain: Math.max(0, (b.endsAt - now.value) / 1000) }))
      .filter(x => x.def !== undefined)
  )

  /** 已习得功法按门类(主/辅/秘)分组、栏内按品质降序 —— 恒出三门供切换,选中门类单类展示 */
  const gongfaCategories = computed(() => {
    const byType: Partial<Record<GongfaType, GongfaDef[]>> = {}
    for (const id of Object.keys(cultivation.learned)) {
      const def = gongfaDef(id)
      if (!def) continue
      const bucket = (byType[def.type] ??= [])
      bucket.push(def)
    }
    const order: GongfaType[] = ['main', 'sub', 'secret']
    return order.map(type => ({
      type,
      items: (byType[type] ?? []).sort((a, b) => qualityDef(b.quality).rank - qualityDef(a.quality).rank)
    }))
  })

  /** 门类切换(主修/辅修/秘术):只展示选中门类,不再三栏粘顶叠压 */
  const gongfaCat = ref<GongfaType>('main')
  const activeGongfaItems = computed(
    () => gongfaCategories.value.find(g => g.type === gongfaCat.value)?.items ?? []
  )

  /** 门类小印章的配色(非激活态;与主修卡「主」字同一块语言) */
  function gongfaCatSeal(type: GongfaType): string {
    return type === 'secret'
      ? 'bg-violet-ink/15 text-violet-ink'
      : type === 'main'
        ? 'bg-cinnabar/10 text-cinnabar'
        : 'bg-jade/15 text-jade'
  }

  /** WAI-ARIA tabs 键盘导航:左右键在门类间回绕,Home/End 直达首尾(与 InkTabs 同约定) */
  function onGongfaCatKeydown(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).getAttribute?.('role') !== 'tab') return
    const order: GongfaType[] = ['main', 'sub', 'secret']
    let idx = order.indexOf(gongfaCat.value)
    switch (e.key) {
      case 'ArrowLeft': idx -= 1; break
      case 'ArrowRight': idx += 1; break
      case 'Home': idx = 0; break
      case 'End': idx = order.length - 1; break
      default: return // 其它键不干预
    }
    idx = (idx + order.length) % order.length // 左右键到两端回绕
    e.preventDefault() // 别让方向键顺带滚动页面
    const target = order[idx]
    if (target === undefined) return
    gongfaCat.value = target
    ;(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')[idx]?.focus()
  }

  const mainDef = computed(() => (cultivation.mainGongfa ? gongfaDef(cultivation.mainGongfa) : undefined))

  /** 参悟池里还剩几部 —— 与 comprehendGongfa 的池条件同源(minRealm ≤ 当前 + 1 且未习得) */
  const comprehendLeft = computed(
    () => GONGFA.filter(g => g.minRealm <= player.major + 1 && !cultivation.learned[g.id]).length
  )

  /** 修行相关丹药快捷栏:按品质降序,越珍稀的越靠前(原为插入序,先拿到什么显什么) */
  const quickPills = computed(() =>
    Object.entries(inventory.pills)
      .map(([id, count]) => ({ def: pillDef(id), count }))
      .filter(x => x.def !== undefined && x.count > 0)
      .filter(x => x.def!.kind === 'buff' || x.def!.instant?.expSecs || x.def!.instant?.expFixed || x.def!.instant?.qiPct)
      .sort((a, b) => qualityDef(b.def!.quality).rank - qualityDef(a.def!.quality).rank)
      .slice(0, 4)
  )

  function equipStateOf(id: string): string {
    if (cultivation.mainGongfa === id) return '主修'
    if (cultivation.subGongfa.includes(id)) return '辅修'
    return ''
  }

  /** 功行是否已至顶层 */
  function isFull(id: string): boolean {
    return (cultivation.learned[id] ?? 0) >= (gongfaDef(id)?.maxLevel ?? 9)
  }

  /** 是否真能悟道(判据取自 gongfaBranches,界面提示与实际可选项同源) */
  function canEnlighten(id: string): boolean {
    return canEnlightenGongfa(id, cultivation.learned[id] ?? 0)
  }

  /** 已择分支的道名;未择、或旧存档留着一个已下线的分支 id,都算没有 */
  function branchName(id: string): string | undefined {
    const branchId = cultivation.gongfaBranch[id]
    return branchId ? gongfaBranchDef(branchId)?.name : undefined
  }
</script>
