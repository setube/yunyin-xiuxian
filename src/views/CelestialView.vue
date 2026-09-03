<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 未至真仙 -->
    <div v-if="!unlocked" class="card-ink px-6 py-16 text-center">
      <p class="font-kai text-[22px] tracking-[0.4em] text-ink">天 界</p>
      <p class="mt-4 text-[12px] leading-relaxed text-ink-faint">
        天门紧闭,仙光垂落而不可及。
        <br />
        修至
        <span class="text-cinnabar">真仙境</span>
        ,方见此界真容。
      </p>
    </div>

    <template v-else>
      <!-- 道源(Phase 30.9:生命周期标签 + 用途说明入口) -->
      <div class="card-ink flex items-center justify-between gap-2 px-4 py-3">
        <p class="font-kai text-[15px] tracking-[0.3em] text-ink">天 界</p>
        <div class="flex items-center gap-2">
          <span class="chip-ink border-cinnabar/50 text-[9px] text-cinnabar">此世消耗</span>
          <button class="text-left" @click="openDaoSourceDialog()">
            <span class="block text-[10px] leading-tight text-ink-ghost">叩问天道·试一试</span>
            <span class="block tabular font-kai text-[17px] leading-tight text-cinnabar">{{ formatNum(endgame.daoSource) }}</span>
          </button>
        </div>
      </div>

      <!-- 页签:长卷分册 -->
      <InkTabs v-model="celTab" :tabs="celTabRows" />

      <template v-if="celTab === 'dao'">
        <!-- 道途 -->
        <section>
          <SectionTitle title="道途" hint="此生一诺,来世另择" />
          <div v-if="currentDao" class="card-ink mt-2 px-4 py-3">
            <p class="flex items-center gap-3">
              <span class="grid h-10 w-10 place-items-center rounded-md bg-cinnabar/90 font-kai text-[20px] text-paper">
                {{ currentDao.seal }}
              </span>
              <span class="font-kai text-[16px] tracking-widest text-ink">{{ currentDao.name }}</span>
            </p>
            <p class="mt-2 text-[11px] leading-relaxed text-ink-faint">{{ currentDao.desc }}</p>
            <p v-for="(r, i) in currentDao.ruleText" :key="i" class="mt-0.5 text-[11px] text-azure">· {{ r }}</p>
            <p v-for="(r, i) in currentDao.deepText" :key="`d${i}`" class="mt-0.5 text-[11px] text-gold-ink">◈ {{ r }}</p>
            <p v-if="swordInfo" class="mt-1.5 text-[11px] text-violet-ink tabular">
              当前剑意 {{ swordInfo.layers }}/4 层({{
                swordInfo.checks
                  .filter(c => c.ok)
                  .map(c => c.name)
                  .join('、') || '尚无一纯'
              }})
            </p>
            <p v-if="daoStory" class="mt-1.5 font-kai text-[11px] leading-relaxed text-ink-soft">「{{ daoStory }}」</p>
          </div>
          <div v-else class="mt-2 grid grid-cols-2 gap-2.5">
            <button v-for="dao in DAO_PATHS" :key="dao.id" class="card-ink px-3 py-3 text-left active:scale-98" @click="pickDao(dao.id)">
              <p class="flex items-center gap-2">
                <span class="grid h-8 w-8 place-items-center rounded-md bg-cinnabar/85 font-kai text-[16px] text-paper">
                  {{ dao.seal }}
                </span>
                <span class="font-kai text-[14px] tracking-widest text-ink">{{ dao.name }}</span>
              </p>
              <p class="mt-1.5 text-[10px] leading-relaxed text-ink-faint">{{ dao.desc }}</p>
              <p v-for="(r, i) in dao.ruleText" :key="i" class="mt-0.5 text-[10px] text-azure">· {{ r }}</p>
              <p v-for="(r, i) in dao.deepText" :key="`d${i}`" class="mt-0.5 text-[10px] text-gold-ink">◈ {{ r }}</p>
            </button>
          </div>
        </section>

        <!-- 天道熔炉 / 器魂:两处入口 -->
        <section class="space-y-2">
          <button
            class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-99"
            @click="furnaceOpen = true"
          >
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cinnabar/85 font-kai text-[19px] text-paper">炉</span>
            <span class="min-w-0 flex-1">
              <span class="block font-kai text-[14px] tracking-widest text-ink">天道熔炉</span>
              <span class="block truncate text-[10px] leading-relaxed text-ink-faint">前尘俗物,皆可熔作道源</span>
            </span>
            <span class="shrink-0 text-[12px] text-ink-faint">›</span>
          </button>

          <button class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-99" @click="goSouls()">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-gold-ink/85 font-kai text-[19px] text-paper">魂</span>
            <span class="min-w-0 flex-1">
              <span class="block font-kai text-[14px] tracking-widest text-ink">器 魂</span>
              <span class="block truncate text-[10px] leading-relaxed text-ink-faint">
                凡器承不住天道,只余形意 · 已凝 {{ endgame.activeSouls.length }}/{{ SOUL_SLOTS }}
              </span>
            </span>
            <span class="shrink-0 text-[12px] text-ink-faint">›</span>
          </button>
        </section>
      </template>

      <template v-else-if="celTab === 'exped'">
        <!-- 进行中的远征 -->
        <section v-if="run && runWorld">
          <SectionTitle :title="`远征 · ${runWorld.name}`" :hint="runPact ? `契约「${runPact.name}」` : '未立契约'" />
          <div class="card-ink mt-2 px-4 py-3">
            <!-- 行程点列:走到哪一重,一目了然 -->
            <div class="mb-2 flex items-center gap-1.5">
              <template v-for="(s, i) in RUN_STAGES" :key="s">
                <span v-if="i > 0" class="h-px min-w-3 grow transition-colors" :class="i <= run.layer ? 'bg-cinnabar/45' : 'bg-ink/15'" />
                <span
                  class="flex items-center gap-1 text-[10px]"
                  :class="i < run.layer ? 'text-ink-soft' : i === run.layer ? 'font-kai text-cinnabar' : 'text-ink-ghost'"
                >
                  <span
                    class="inline-block h-1.5 w-1.5 rounded-full"
                    :class="i < run.layer ? 'bg-ink-soft/70' : i === run.layer ? 'bg-cinnabar animate-breathe' : 'border border-ink/30'"
                  />
                  {{ s }}
                </span>
              </template>
            </div>
            <p class="text-[11px] text-ink-faint tabular">
              已历 {{ run.rows.length }} 战 · 沿途道源 +{{ run.bonus }} · 携血 {{ Math.round(run.carriedHpPct * 100) }}%
              <template v-if="run.winStacks && (endgame.daoPath === 'sword' || endgame.daoPath === 'slaughter')">
                · {{ endgame.daoPath === 'sword' ? '剑意' : '杀意' }} {{ run.winStacks }} 层
              </template>
            </p>
            <div class="mt-1.5 space-y-1">
              <p v-for="(row, i) in run.rows" :key="i" class="flex justify-between text-[11px]">
                <span :class="row.win ? 'text-ink-soft' : 'text-cinnabar'">
                  第{{ i + 1 }}战 {{ row.foeName }} · {{ row.win ? '胜' : '负' }}
                </span>
                <span class="tabular text-ink-ghost">{{ row.rounds }}回合 · 余血{{ Math.round(row.hpLeftPct * 100) }}%</span>
              </p>
            </div>
            <div class="ink-divider my-2.5" />
            <!-- 择路 -->
            <template v-if="run.layer <= 2 && currentNodes">
              <p class="mb-1.5 text-[11px] text-ink-faint">第 {{ run.layer + 1 }} 重 · 两径择一(层间可回凡界换构筑)</p>
              <div class="stagger-in grid grid-cols-2 gap-2">
                <button
                  v-for="(node, i) in currentNodes"
                  :key="node.id"
                  class="rounded-md border border-ink/15 bg-paper-deep/60 px-2.5 py-2 text-left active:scale-97"
                  @click="pickNode(i as 0 | 1)"
                >
                  <p class="font-kai text-[13px] text-ink">{{ node.name }}</p>
                  <p class="mt-0.5 text-[10px] text-ink-faint">{{ node.desc }}</p>
                  <p class="mt-1 text-[10px] text-cinnabar">险:{{ node.riskText }}</p>
                  <p class="text-[10px] text-gold-ink tabular">道源 +{{ node.bonus }}</p>
                  <p v-if="nodePreviews[i]" class="mt-0.5 text-[10px] text-violet-ink">天机:{{ nodePreviews[i]!.winText }}</p>
                </button>
              </div>
            </template>
            <!-- 界主 -->
            <template v-else-if="run.layer === 3">
              <p class="mb-1.5 text-[11px] text-ink-faint">三重已过,界主临阵。可先回凡界整备,再来决战。</p>
              <p v-if="guardianPreview" class="mb-1.5 text-[10px] text-violet-ink">
                天机:{{ guardianPreview.winText }} · {{ guardianPreview.skillLines.join(' / ') }}
              </p>
              <button class="btn-seal w-full !py-2 !text-[13px] pulse-ready animate-glow-pulse" @click="fightBoss">
                决战 · {{ runWorld.guardian.name }}
              </button>
            </template>
            <button class="btn-ghost mt-2 w-full !py-1.5 !text-[11px] !text-ink-faint" @click="abandonRun">中道而返(道源不退)</button>
          </div>
        </section>

        <!-- 特殊世界 -->
        <section>
          <SectionTitle title="特殊规则世界" hint="择契而入,逐层择路" />
          <div class="mt-2 space-y-2.5">
            <div v-for="world in CELESTIAL_WORLDS" :key="world.id" class="card-ink px-4 py-3">
              <p class="flex items-center gap-2">
                <span class="grid h-8 w-8 place-items-center rounded-md bg-indigo-ink/85 font-kai text-[15px] text-paper">
                  {{ world.seal }}
                </span>
                <span class="font-kai text-[15px] tracking-widest text-ink">{{ world.name }}</span>
                <span v-if="endgame.worldClears[world.id]" class="chip-ink border-jade/60 text-[9px] text-jade">
                  已破 ×{{ endgame.worldClears[world.id] }}
                </span>
                <span class="ml-auto tabular text-[11px] text-ink-faint">入界+三重+界主</span>
              </p>
              <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{{ world.desc }}</p>
              <p class="mt-1 flex flex-wrap gap-x-3 text-[10px] text-violet-ink">
                <span v-for="(r, i) in world.ruleText" :key="i">{{ r }}</span>
              </p>
              <button class="btn-seal mt-2.5 w-full !py-2 !text-[13px]" :disabled="run !== null" @click="openPrep(world.id)">
                {{ run ? '远征在途' : `启 程(道源 ${world.entryCost} · 破界底赏 ${world.rewardDaoSource})` }}
              </button>
            </div>

            <!-- 虚界之门:程序化生成 + 裁判过审 -->
            <div class="card-ink border border-violet-ink/25 px-4 py-3">
              <p class="flex items-center gap-2">
                <span class="grid h-8 w-8 place-items-center rounded-md bg-violet-ink/85 font-kai text-[15px] text-paper">
                  {{ endgame.voidWorld?.seal ?? '虚' }}
                </span>
                <span class="font-kai text-[15px] tracking-widest text-ink">
                  虚界之门
                  <template v-if="endgame.voidWorld">· {{ endgame.voidWorld.name }}</template>
                </span>
                <span v-if="endgame.worldClears['void']" class="chip-ink border-jade/60 text-[9px] text-jade">
                  已破 ×{{ endgame.worldClears['void'] }}
                </span>
              </p>
              <template v-if="endgame.voidWorld">
                <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{{ endgame.voidWorld.desc }}</p>
                <p class="mt-1 flex flex-wrap gap-x-3 text-[10px] text-violet-ink">
                  <span v-for="(r, i) in endgame.voidWorld.ruleText" :key="i">{{ r }}</span>
                </p>
                <p class="mt-1 text-[10px] text-ink-ghost">
                  盘踞:{{ endgame.voidWorld.foes.map(f => f.name).join('、') }} · 界主「{{ endgame.voidWorld.guardian.name }}」
                </p>
                <div class="mt-2.5 flex gap-2">
                  <button class="btn-seal flex-1 !py-2 !text-[13px]" :disabled="run !== null" @click="openPrep('void')">
                    {{ run ? '远征在途' : `启 程(破界底赏 ${endgame.voidWorld.rewardDaoSource})` }}
                  </button>
                  <button class="btn-ghost !px-3 !text-[12px]" @click="rerollVoidWorld()">再窥({{ VOID_REROLL_COST }})</button>
                </div>
              </template>
              <template v-else>
                <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                  天道以变数织界:随机规则、随机敌阵、随机路线,经天机推演过审方能成形——每一座虚界都独一无二。
                </p>
                <button class="btn-ghost mt-2.5 w-full !py-2 !text-[12px]" @click="rerollVoidWorld()">
                  窥探虚界(道源 {{ VOID_REROLL_COST }})
                </button>
              </template>
            </div>
          </div>
        </section>
      </template>

      <template v-else-if="celTab === 'trial'">
        <!-- 今日天道:程序生成的每日挑战 -->
        <section v-if="daily">
          <SectionTitle title="今日天道" hint="日出而题,日落而息" />
          <div class="card-ink mt-2 px-4 py-3">
            <p class="flex items-center gap-2">
              <span class="font-kai text-[14px] tracking-widest text-ink">{{ dailyWorld?.name }}</span>
              <span class="tabular text-[11px] text-ink-soft">{{ daily.verdict.difficulty }} · 可行 {{ daily.verdict.viable }}/6</span>
              <span class="ml-auto tabular text-[11px] text-gold-ink">赏 {{ daily.verdict.reward }}</span>
            </p>
            <p class="mt-1 flex flex-wrap gap-x-3 text-[10px] text-violet-ink">
              <span v-for="m in dailyMutators" :key="m!.id">◇ {{ m!.name }}:{{ m!.text }}</span>
              <span v-if="dailyPact" class="text-cinnabar">契·{{ dailyPact.name }}</span>
            </p>
            <button class="btn-seal mt-2 w-full !py-1.5 !text-[12px]" :disabled="endgame.dailyDoneDay === daily.day" @click="goDaily">
              {{ endgame.dailyDoneDay === daily.day ? '今日已成,明日再会' : `应 战(道源 ${CHALLENGE_ENTRY_COST})` }}
            </button>
          </div>
        </section>

        <!-- 天道变数 -->
        <section>
          <SectionTitle title="天道变数" hint="规则随机,每探一次天机便换一副面孔" />
          <div class="card-ink mt-2 px-4 py-3">
            <template v-if="mutationDraw.length">
              <p v-for="m in mutationRows" :key="m!.id" class="text-[11px] text-violet-ink">◇ {{ m!.name }}:{{ m!.text }}</p>
              <div class="mt-2 flex gap-2">
                <button class="btn-seal flex-1 !py-2 !text-[12px]" @click="goMutation">
                  应 战(道源 {{ MUTATION_ENTRY_COST }} · 破解得 {{ MUTATION_BASE_REWARD }})
                </button>
                <button class="btn-ghost !px-3 !text-[12px]" @click="mutationDraw = rollMutators()">再探</button>
              </div>
            </template>
            <template v-else>
              <p class="text-[11px] leading-relaxed text-ink-faint">天道无常,规则无定。窥探本次变数,再决定是否应战——六连战,规则叠加。</p>
              <button class="btn-ghost mt-2 w-full !py-2 !text-[12px]" @click="mutationDraw = rollMutators()">窥探变数</button>
            </template>
          </div>
        </section>

        <!-- 天道试炼 -->
        <section>
          <SectionTitle title="天道试炼" hint="极限构筑的证道之地" />
          <div class="mt-2 space-y-2.5">
            <div v-for="trial in TRIALS" :key="trial.id" class="card-ink px-4 py-3">
              <p class="flex items-center gap-2">
                <span class="grid h-8 w-8 place-items-center rounded-md bg-gold-ink/85 font-kai text-[15px] text-paper">
                  {{ trial.seal }}
                </span>
                <span class="font-kai text-[15px] tracking-widest text-ink">{{ trial.name }}</span>
                <span v-if="endgame.trialRecords[trial.id]" class="ml-auto tabular text-[10px] text-gold-ink">
                  最佳 {{ endgame.trialRecords[trial.id]!.bestRounds }} 回合
                </span>
              </p>
              <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{{ trial.desc }}</p>
              <p class="mt-1 flex flex-wrap gap-x-3 text-[10px] text-violet-ink">
                <span v-for="(r, i) in trial.ruleText" :key="i">{{ r }}</span>
              </p>
              <button class="btn-ghost mt-2.5 w-full !py-2 !text-[13px]" @click="goTrial(trial.id)">
                应 试(道源 {{ trial.entryCost }} · 功成得 {{ trial.rewardDaoSource }})
              </button>
            </div>
          </div>
        </section>

        <!-- 天道挑战书:玩家定规则,天道定难度与赏格 -->
        <section>
          <SectionTitle title="天道挑战书" hint="你定规则,天道定赏" />
          <div class="card-ink mt-2 px-4 py-3">
            <p class="text-[11px] text-ink-faint">选界 · 叠变数(至多三条)· 立契 · 命名。赏格由天道实测难度定价,无从作弊。</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="w in CELESTIAL_WORLDS"
                :key="w.id"
                class="chip-ink"
                :class="draft.worldId === w.id ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
                @click="setDraftWorld(w.id)"
              >
                {{ w.name }}
              </button>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <button
                v-for="m in MUTATORS"
                :key="m.id"
                class="chip-ink"
                :class="draft.mutatorIds.includes(m.id) ? 'border-violet-ink text-violet-ink' : 'border-ink/25 text-ink-faint'"
                :title="m.text"
                @click="toggleDraftMutator(m.id)"
              >
                {{ m.name }}
              </button>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <button
                class="chip-ink"
                :class="draft.pactId === null ? 'border-jade text-jade' : 'border-ink/25 text-ink-faint'"
                @click="setDraftPact(null)"
              >
                不立契
              </button>
              <button
                v-for="p in PACTS"
                :key="p.id"
                class="chip-ink"
                :class="draft.pactId === p.id ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
                :title="p.ruleText"
                @click="setDraftPact(p.id)"
              >
                {{ p.name }}
              </button>
            </div>
            <input
              v-model="draft.name"
              maxlength="8"
              class="mt-2 w-full rounded-md border border-ink/20 bg-paper-deep/60 px-3 py-1.5 font-kai text-[13px] tracking-widest text-ink outline-none focus:border-cinnabar/50"
              placeholder="为此挑战书命名(如《无盾求生》)"
            />
            <div
              v-if="challengeVerdict"
              class="mt-2 rounded-md px-3 py-2"
              :class="challengeVerdict.ok ? 'bg-paper-deep/70' : 'bg-cinnabar/10'"
            >
              <p v-if="challengeVerdict.ok" class="flex items-center justify-between text-[11px]">
                <span class="text-ink-soft">天道受此约:{{ challengeVerdict.difficulty }} · 可行流派 {{ challengeVerdict.viable }}/6</span>
                <span class="tabular text-gold-ink">赏 道源 {{ challengeVerdict.reward }}</span>
              </p>
              <p v-else class="text-[11px] text-cinnabar">{{ challengeVerdict.reason }}</p>
            </div>
            <div class="mt-2 flex gap-2">
              <button class="btn-ghost flex-1 !py-1.5 !text-[12px]" @click="doVerify">验 约</button>
              <button class="btn-seal flex-1 !py-1.5 !text-[12px]" :disabled="!challengeVerdict?.ok || run !== null" @click="doUndertake">
                立 约(道源 {{ CHALLENGE_ENTRY_COST }})
              </button>
            </div>
          </div>
        </section>
      </template>

      <template v-else>
        <!-- 道痕 -->
        <section>
          <SectionTitle title="道痕" :hint="`历代修行履历 · ${endgame.marks.length} 则`" />
          <!-- 今昔之比:与过去的自己对话 -->
          <div v-if="legacy.length" class="card-ink mt-2 px-4 py-3">
            <p class="mb-1.5 font-kai text-[12px] tracking-[0.3em] text-ink-faint">今昔之比</p>
            <div v-for="lc in legacy" :key="lc.targetName" class="mb-2 last:mb-0">
              <p class="text-[12px] text-ink-soft tabular">
                {{ lc.targetName }}:第{{ lc.earlyLife }}世({{ lc.earlyBuild }}){{ lc.earlyText }}
                <span class="mx-1 text-ink-ghost">→</span>
                第{{ lc.lateLife }}世({{ lc.lateBuild }})
                <span class="text-jade">{{ lc.lateText }}</span>
              </p>
              <p v-if="lc.diffLines.length" class="text-[10px] text-azure tabular">{{ lc.diffLines.join(' · ') }}</p>
            </div>
          </div>
          <div v-if="endgame.marks.length" class="card-ink mt-2 max-h-64 divide-y divide-ink/6 overflow-y-auto px-4">
            <div v-for="(mark, i) in endgame.marks" :key="i" class="flex items-center gap-2 py-2">
              <span class="shrink-0 font-kai text-[11px] text-ink-faint">第{{ mark.life }}世</span>
              <span class="shrink-0 text-[11px] text-violet-ink">{{ mark.daoPathId ? daoPathDef(mark.daoPathId)?.name : '无道' }}</span>
              <span class="min-w-0 truncate font-kai text-[12px]" :class="mark.cleared ? 'text-ink' : 'text-ink-ghost'">
                {{ mark.targetName }}{{ mark.cleared ? '·破' : '·殁' }}
              </span>
              <span class="ml-auto shrink-0 tabular text-[10px] text-ink-faint">{{ mark.rounds }}回合 · {{ mark.buildName }}</span>
              <button
                v-if="mark.replay"
                class="shrink-0 rounded border border-gold-ink/40 px-1.5 py-0.5 font-kai text-[10px] text-gold-ink active:scale-90"
                title="以当年的构筑重打此战"
                @click="goReplay(mark)"
              >
                忆
              </button>
              <button
                v-if="mark.cleared && mark.replay"
                class="shrink-0 rounded border border-cinnabar/40 px-1.5 py-0.5 font-kai text-[10px] text-cinnabar active:scale-90"
                :title="`以今日之你重打此战,快过 ${mark.rounds} 回合即【胜于旧我】(道源 ${REWRITE_ENTRY_COST})`"
                @click="goRewrite(mark)"
              >
                写
              </button>
            </div>
          </div>
          <p v-else class="card-ink mt-2 px-4 py-4 text-center text-[11px] text-ink-ghost">此页尚白。你在天界的每一战,都会留下痕迹。</p>
        </section>
      </template>
    </template>

    <!-- 远征准备:择契 -->
    <BaseModal :open="prepWorld !== null" :title="prepWorld ? `远征 · ${prepWorld.name}` : ''" @close="prepWorldId = null">
      <template v-if="prepWorld">
        <p class="text-[11px] leading-relaxed text-ink-faint">
          入界一战 → 三重择路(沿途道源)→ 界主。层间可回凡界换构筑。启程前,可与天道立契——风险换道源。
        </p>
        <div class="mt-2 space-y-1.5">
          <button
            class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left"
            :class="prepPact === null ? 'bg-jade/10 border border-jade/40' : 'bg-paper-deep/60 border border-transparent'"
            @click="prepPact = null"
          >
            <span class="text-[12px] text-ink-soft">不立契约</span>
            <span class="ml-auto text-[10px] text-ink-ghost">道源 ×1.0</span>
          </button>
          <button
            v-for="pact in PACTS"
            :key="pact.id"
            class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left"
            :class="prepPact === pact.id ? 'bg-cinnabar/10 border border-cinnabar/40' : 'bg-paper-deep/60 border border-transparent'"
            @click="prepPact = pact.id"
          >
            <span class="grid h-6 w-6 shrink-0 place-items-center rounded bg-ink/80 font-kai text-[11px] text-paper">{{ pact.seal }}</span>
            <span class="min-w-0">
              <span class="block font-kai text-[12px] text-ink">{{ pact.name }}</span>
              <span class="block text-[10px] text-ink-faint">{{ pact.ruleText }}</span>
            </span>
          </button>
        </div>
        <!-- 天道赌约:整程预估(信息归玩家,答案也归玩家) -->
        <div v-if="prepForecast" class="mt-2.5 rounded-md bg-paper-deep/70 px-3 py-2">
          <p class="flex items-center justify-between text-[11px]">
            <span class="font-kai text-ink-soft">天道推演</span>
            <span class="tabular text-ink-soft">此行 {{ prepForecast.difficulty }}</span>
          </p>
          <p class="mt-0.5 flex items-center justify-between text-[10px] text-ink-faint">
            <span>
              当前构筑相性
              <span class="text-gold-ink">{{ prepForecast.stars }}</span>
            </span>
            <span>预计可行流派 {{ prepForecast.viableStyles }}/6</span>
          </p>
        </div>
        <p v-if="prepPreview" class="mt-2 text-[10px] leading-relaxed text-violet-ink">
          天机透视 · 入界之敌:{{ prepPreview.skillLines.join(' / ') }} —— {{ prepPreview.winText }}
        </p>
        <p v-if="prepPreview?.riskLines.length" class="mt-1 text-[10px] leading-relaxed text-cinnabar/80">
          危局:{{ prepPreview.riskLines.join(';') }}
        </p>
      </template>
      <template #footer>
        <button class="btn-seal w-full" @click="depart">启 程{{ selectedPact ? `(携「${selectedPact.name}」)` : '' }}</button>
      </template>
    </BaseModal>

    <!-- 战报(远征终局 / 试炼 / 变数) -->
    <BaseModal :open="expedition !== null" :title="expedition?.title ?? ''" @close="expedition = null">
      <template v-if="expedition">
        <p class="font-kai text-[13px] tracking-wider" :class="expedition.cleared ? 'text-jade' : 'text-cinnabar'">
          {{ expedition.markText }}
        </p>

        <!-- 战斗过程:与历练同样逐回合播放 -->
        <div class="mt-2">
          <GauntletPanel :rows="expedition.rows" :player-name="player.name" />
        </div>

        <!-- 逐场摘要:场次多时限高滚动,不把弹窗撑到 82vh 上限 -->
        <div class="mt-2 max-h-40 space-y-1 overflow-y-auto">
          <p
            v-for="(row, i) in expedition.rows"
            :key="i"
            class="flex items-center justify-between rounded bg-paper-deep/70 px-3 py-1.5 text-[12px]"
          >
            <span :class="row.win ? 'text-ink-soft' : 'text-cinnabar'">
              第{{ i + 1 }}战 · {{ row.foeName }} · {{ row.win ? '胜' : '负' }}
            </span>
            <span class="tabular text-[11px] text-ink-faint">{{ row.rounds }}回合 · 余血{{ Math.round(row.hpLeftPct * 100) }}%</span>
          </p>
        </div>
        <p v-if="expedition.reward > 0" class="mt-2 text-[12px] text-gold-ink tabular">
          <GameIcon name="sparkles" :size="12" class="inline" />
          道源 +{{ expedition.reward }}
        </p>
      </template>
      <template #footer>
        <button class="btn-seal w-full" @click="expedition = null">收 卷</button>
      </template>
    </BaseModal>

    <!-- 天道熔炉 -->
    <BaseModal :open="furnaceOpen" title="天道熔炉" @close="furnaceOpen = false">
      <p class="mb-2 text-[11px] leading-relaxed text-ink-faint">前尘俗物,皆可熔作道源。</p>
      <div class="card-ink divide-y divide-ink/7 px-4">
        <div v-for="row in furnaceRows" :key="row.rate.resource" class="flex items-center justify-between py-2.5">
          <span class="text-[12px] text-ink-soft">{{ row.rate.name }}(存 {{ formatNum(row.have) }})</span>
          <button class="btn-ghost !px-3 !py-1 !text-[11px] tabular" @click="furnaceConvert(row.rate)">
            {{ row.rate.per }} → 1 道源
          </button>
        </div>
        <div class="flex items-center justify-between py-2.5">
          <span class="text-[12px] text-ink-soft">灵石(存 {{ formatGN(resources.spiritStone) }})</span>
          <button class="btn-ghost !px-3 !py-1 !text-[11px] tabular" @click="furnaceConvertStone()">
            {{ formatGN(furnaceStoneCost()) }} → 5 道源
          </button>
        </div>
        <div class="py-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[12px] text-ink-soft">道源凝道果(跨世保留)</span>
            <button class="btn-ghost !px-3 !py-1 !text-[11px] tabular" @click="condenseDaoFruit()">
              {{ DAO_SOURCE_PER_FRUIT }} 道源 → 道果 +1
            </button>
          </div>
          <!-- S3 链路:本次凝聚后,下世收益变化 -->
          <p class="mt-1 text-[10px] leading-relaxed text-ink-faint tabular">
            当前 {{ fruitInfo.total }} 枚 · 有效 {{ fruitInfo.effective.toFixed(0) }} 枚
            <span class="text-gold-ink">→ 凝后 {{ fruitInfo.nextEffective.toFixed(0) }} 枚(+{{ fruitInfo.deltaPct }}%)</span>
            · 边际收益渐减
          </p>
        </div>
      </div>
      <template #footer>
        <button class="btn-seal w-full" @click="furnaceOpen = false">收 炉</button>
      </template>
    </BaseModal>

    <!-- Phase 30.9 S2:道源说明弹窗 -->
    <BaseModal :open="daoSourceDialogOpen" title="道源" @close="daoSourceDialogOpen = false">
      <div class="space-y-3 text-[12px] leading-relaxed">
        <p class="text-ink-soft">{{ daoSourceDialog().intro }}</p>
        <div>
          <p class="font-kai text-[12px] tracking-wider text-ink">用途</p>
          <p class="text-ink-faint">{{ daoSourceDialog().usages.join(' · ') }}</p>
        </div>
        <div>
          <p class="font-kai text-[12px] tracking-wider text-ink">获取</p>
          <p class="text-ink-faint">{{ daoSourceDialog().gains.join(' · ') }}</p>
        </div>
        <p class="border-l-2 border-cinnabar/60 pl-2 text-[11px] text-cinnabar">
          {{ daoSourceDialog().lifecycle }}
        </p>
      </div>
      <template #footer>
        <button class="btn-seal w-full" @click="daoSourceDialogOpen = false">知道了</button>
      </template>
    </BaseModal>

    <!-- Phase 30.9 S4:首次登真仙·终局导览 -->
    <BaseModal :open="tutorialOpen" title="登临真仙" :closable="false">
      <div class="space-y-2.5 text-[13px] leading-relaxed">
        <p class="font-kai text-ink">凡间所得,终有尽时。</p>
        <p class="text-ink-soft">
          玄铁、残页、灵石……到了此境,皆可献入
          <a class="text-azure" @click="tutorialOpen = false">天道熔炉</a>
          ,熔作道源。
        </p>
        <p class="text-ink-soft">
          道源,助你
          <b class="text-cinnabar">此世</b>
          问道——叩天界、立契约、踏试炼。
        </p>
        <p class="text-ink-soft">
          道源又可凝作道果,道果随神魂不灭,助你
          <b class="text-violet-ink">来世</b>
          更进一步。
        </p>
        <p class="mt-2 text-[11px] text-ink-faint">
          一句话:
          <span class="text-cinnabar">道源是此世拿来折腾的</span>
          ,
          <span class="text-violet-ink">道果是几世以后仍受益的财富</span>
          。
        </p>
      </div>
      <template #footer>
        <button class="btn-seal w-full" @click="tutorialOpen = false">知道了</button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { useResourcesStore } from '@/stores/resources'
  import { usePlayerStore } from '@/stores/player'
  import { useInventoryStore } from '@/stores/inventory'
  import { useEndgameStore } from '@/stores/endgame'
  import { SOUL_SLOTS } from '@/data/souls'
  import { DAO_PATHS, CELESTIAL_WORLDS, TRIALS, FURNACE_RATES, DAO_SOURCE_PER_FRUIT, daoPathDef } from '@/data/endgame'
  import { PACTS, pactDef } from '@/data/pacts'
  import { MUTATORS, mutatorDef } from '@/data/mutators'
  import { legacyComparisons } from '@/core/compare'
  import { todayChallenge, undertakeDaily } from '@/core/dailyChallenge'
  import {
    challengeTrial,
    chooseDaoPath,
    condenseDaoFruit,
    endgameUnlocked,
    furnaceConvert,
    furnaceConvertStone,
    furnaceStoneCost,
    replayMark,
    rewriteMark,
    REWRITE_ENTRY_COST
  } from '@/core/endgameService'
  import { currentDaoNarrative } from '@/core/identity'
  import {
    abandonExpedition,
    challengeGuardian,
    challengeMutation,
    chooseRouteNode,
    forecastExpedition,
    MUTATION_BASE_REWARD,
    MUTATION_ENTRY_COST,
    previewFight,
    rerollVoidWorld,
    resolveWorld,
    rollMutators,
    startWorldExpedition,
    VOID_REROLL_COST,
    type StepOutcome
  } from '@/core/expedition'
  import { detectBuild } from '@/core/buildDetect'
  import { swordPurity } from '@/core/daoDepth'
  import {
    CHALLENGE_ENTRY_COST,
    CHALLENGE_MAX_MUTATORS,
    undertakeChallenge,
    verifyChallenge,
    type ChallengeDraft,
    type ChallengeVerdict
  } from '@/core/challenge'
  import { formatGN, formatNum } from '@/utils/format'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import GauntletPanel from '@/components/celestial/GauntletPanel.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import {
    daoSourceDialog,
    fruitMarginalInfo,
    shouldShowEndgameTutorial,
    markEndgameTutorialSeen,
    markResourceDialogSeen
  } from '@/core/resourceGuidance'

  const resources = useResourcesStore()
  const player = usePlayerStore()
  const inventory = useInventoryStore()
  const endgame = useEndgameStore()

  const unlocked = computed(() => endgameUnlocked())

  const router = useRouter()
  function goSouls(): void {
    router.push({ name: 'souls' })
  }

  // Phase 30.9:道源说明弹窗 / 道果链路 / 首次终局教学
  const daoSourceDialogOpen = ref(false)
  const furnaceOpen = ref(false)
  const tutorialOpen = ref(false)
  const fruitInfo = computed(() => fruitMarginalInfo())
  // 首次进入天界(已解锁且未见过教学):自动弹终局导览
  watch(
    () => unlocked.value,
    v => {
      if (v && shouldShowEndgameTutorial()) {
        tutorialOpen.value = true
        markEndgameTutorialSeen()
      }
    },
    { immediate: true }
  )
  function openDaoSourceDialog(): void {
    daoSourceDialogOpen.value = true
    markResourceDialogSeen()
  }
  const currentDao = computed(() => (endgame.daoPath ? daoPathDef(endgame.daoPath) : undefined))

  // ---- 页签:长卷分册(远征在途时落在远征册) ----
  type CelTab = 'dao' | 'exped' | 'trial' | 'marks'
  const celTab = ref<CelTab>(endgame.worldRun ? 'exped' : 'dao')
  const CEL_TABS: { id: CelTab; label: string }[] = [
    { id: 'dao', label: '道途' },
    { id: 'exped', label: '远征' },
    { id: 'trial', label: '试炼' },
    { id: 'marks', label: '道痕' }
  ]

  /** 页签行:远征在途时挂朱点提醒 */
  const celTabRows = computed(() => CEL_TABS.map(t => ({ ...t, dot: t.id === 'exped' && !!endgame.worldRun })))

  /** 远征行程四站(layer 0~2 为三重择路,3 为界主) */
  const RUN_STAGES = ['一重', '二重', '三重', '界主']

  /** 剑道:当前剑意层数与纯度构成 */
  const swordInfo = computed(() => {
    if (endgame.daoPath !== 'sword') return null
    return swordPurity(player.finalStats.mods, inventory.currentArtifacts.length, detectBuild(player.finalStats.mods))
  })

  function pickDao(id: (typeof DAO_PATHS)[number]['id']): void {
    chooseDaoPath(id)
  }

  // ---- 远征准备 ----
  const prepWorldId = ref<string | null>(null)
  const prepPact = ref<string | null>(null)
  const prepWorld = computed(() => (prepWorldId.value ? resolveWorld(prepWorldId.value) : null))
  const selectedPact = computed(() => (prepPact.value ? pactDef(prepPact.value) : undefined))
  const prepPreview = computed(() => (prepWorld.value ? previewFight(prepWorld.value.foes[0]!) : null))
  /** 天道赌约:整程预估(随契约选择实时重算) */
  const prepForecast = computed(() => (prepWorldId.value ? forecastExpedition(prepWorldId.value, prepPact.value) : null))

  function openPrep(id: string): void {
    prepWorldId.value = id
    prepPact.value = null
  }

  // ---- 进行中远征 ----
  const run = computed(() => endgame.worldRun)
  const runWorld = computed(() => (run.value ? (resolveWorld(run.value.worldId) ?? null) : null))
  const runPact = computed(() => (run.value?.pactId ? pactDef(run.value.pactId) : undefined))
  const currentNodes = computed(() => {
    if (!run.value || !runWorld.value || run.value.layer > 2) return null
    return runWorld.value.routes[run.value.layer] ?? null
  })
  const nodePreviews = computed(() => (currentNodes.value ? currentNodes.value.map(n => previewFight(n.foe, n)) : []))
  const guardianPreview = computed(() => (run.value?.layer === 3 && runWorld.value ? previewFight(runWorld.value.guardian) : null))

  // ---- 战报弹窗(统一形状) ----
  interface ReportView {
    title: string
    cleared: boolean
    markText: string
    rows: { foeName: string; win: boolean; rounds: number; hpLeftPct: number }[]
    reward: number
  }
  const expedition = ref<ReportView | null>(null)

  function handleOutcome(outcome: StepOutcome | null, title: string): void {
    if (!outcome || outcome.type === 'advance') return
    const rows = outcome.finalRows ?? [outcome.row]
    expedition.value = {
      title,
      cleared: outcome.type === 'cleared',
      markText:
        outcome.type === 'cleared'
          ? `全程 ${rows.length} 战功成`
          : outcome.type === 'pactBroken'
            ? `契约崩碎于第 ${rows.length} 战`
            : `止步第 ${rows.length} 战`,
      rows,
      reward: outcome.rewardDaoSource
    }
  }

  function depart(): void {
    if (!prepWorld.value) return
    const title = prepWorld.value.name
    const outcome = startWorldExpedition(prepWorld.value.id, prepPact.value)
    if (outcome) prepWorldId.value = null
    handleOutcome(outcome, title)
  }

  function pickNode(i: 0 | 1): void {
    handleOutcome(chooseRouteNode(i), runWorld.value?.name ?? '远征')
  }

  function fightBoss(): void {
    handleOutcome(challengeGuardian(), runWorld.value?.name ?? '远征')
  }

  function abandonRun(): void {
    abandonExpedition()
  }

  // ---- 天道变数 ----
  const mutationDraw = ref<string[]>([])
  const mutationRows = computed(() => mutationDraw.value.map(id => mutatorDef(id)).filter(m => m !== undefined))

  function goMutation(): void {
    const result = challengeMutation(mutationDraw.value)
    if (!result) return
    mutationDraw.value = []
    expedition.value = {
      title: '天道变数',
      cleared: result.report.cleared,
      markText: result.report.cleared ? `六战全捷,共 ${result.report.totalRounds} 回合` : `止步第 ${result.report.fightsWon + 1} 战`,
      rows: result.report.rows,
      reward: result.rewardDaoSource
    }
  }

  // ---- 试炼 ----
  function goTrial(id: string): void {
    const result = challengeTrial(id)
    if (result) {
      expedition.value = {
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: result.rewardDaoSource
      }
    }
  }

  // ---- 忆战:与过去的自己重临此界 ----
  function goReplay(mark: (typeof endgame.marks)[number]): void {
    const result = replayMark(mark)
    if (result) {
      expedition.value = {
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: 0
      }
    }
  }

  // ---- 重写此痕:以今日之你,快过当年 ----
  function goRewrite(mark: (typeof endgame.marks)[number]): void {
    const result = rewriteMark(mark)
    if (result) {
      expedition.value = {
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: 0
      }
    }
  }

  /** 道途行为叙事(本世道痕 ≥2 则方语) */
  const daoStory = computed(() => currentDaoNarrative())

  // ---- 天道挑战书 ----
  const draft = ref<ChallengeDraft>({ worldId: CELESTIAL_WORLDS[0]!.id, mutatorIds: [], pactId: null, name: '' })
  const challengeVerdict = ref<ChallengeVerdict | null>(null)

  function setDraftWorld(id: string): void {
    draft.value = { ...draft.value, worldId: id }
    challengeVerdict.value = null
  }

  function setDraftPact(id: string | null): void {
    draft.value = { ...draft.value, pactId: id }
    challengeVerdict.value = null
  }

  function toggleDraftMutator(id: string): void {
    const has = draft.value.mutatorIds.includes(id)
    if (!has && draft.value.mutatorIds.length >= CHALLENGE_MAX_MUTATORS) return
    draft.value = {
      ...draft.value,
      mutatorIds: has ? draft.value.mutatorIds.filter(m => m !== id) : [...draft.value.mutatorIds, id]
    }
    challengeVerdict.value = null
  }

  function doVerify(): void {
    challengeVerdict.value = verifyChallenge(draft.value)
  }

  function doUndertake(): void {
    if (!challengeVerdict.value?.ok) return
    const result = undertakeChallenge(draft.value, challengeVerdict.value)
    challengeVerdict.value = null
    if (result) {
      expedition.value = {
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: result.rewardDaoSource
      }
    }
  }

  // ---- 今日天道 & 今昔之比 ----
  const daily = computed(() => (unlocked.value && endgame.daoPath ? todayChallenge() : null))
  const dailyWorld = computed(() => (daily.value ? celestialWorldDefLocal(daily.value.draft.worldId) : null))
  const dailyMutators = computed(() =>
    daily.value ? daily.value.draft.mutatorIds.map(id => mutatorDef(id)).filter(m => m !== undefined) : []
  )
  const dailyPact = computed(() => (daily.value?.draft.pactId ? pactDef(daily.value.draft.pactId) : undefined))
  const legacy = computed(() => (unlocked.value ? legacyComparisons(endgame.marks) : []))

  function celestialWorldDefLocal(id: string) {
    return CELESTIAL_WORLDS.find(w => w.id === id)
  }

  function goDaily(): void {
    if (!daily.value) return
    const result = undertakeDaily(daily.value)
    if (result) {
      expedition.value = {
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: result.rewardDaoSource
      }
    }
  }

  const furnaceRows = computed(() => FURNACE_RATES.map(rate => ({ rate, have: resources[rate.resource] })))
</script>
