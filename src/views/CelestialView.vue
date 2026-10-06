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
            <span class="block text-[10px] leading-tight text-ink-faint">叩问天道·试一试</span>
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
              当前剑意 {{ swordInfo.layers }}/{{ SWORD_PURITY_MAX_LAYERS }} 层({{
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
            class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-98"
            @click="furnaceOpen = true"
          >
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cinnabar/85 font-kai text-[19px] text-paper">炉</span>
            <span class="min-w-0 flex-1">
              <span class="block font-kai text-[14px] tracking-widest text-ink">天道熔炉</span>
              <span class="block truncate text-[10px] leading-relaxed text-ink-faint">前尘俗物,皆可熔作道源</span>
            </span>
            <span class="shrink-0 text-[12px] text-ink-faint">›</span>
          </button>

          <button class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-98" @click="goSouls()">
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
                  :class="i < run.layer ? 'text-ink-soft' : i === run.layer ? 'font-kai text-cinnabar' : 'text-ink-faint'"
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
                <span class="tabular text-ink-faint">{{ row.rounds }}回合 · 余血{{ Math.round(row.hpLeftPct * 100) }}%</span>
              </p>
            </div>
            <div class="ink-divider my-2.5" />
            <!-- 择路 -->
            <template v-if="run.layer < EXPEDITION_ROUTE_LAYERS && currentNodes">
              <p class="mb-1.5 text-[11px] text-ink-faint">第 {{ run.layer + 1 }} 重 · 两径择一(层间可回凡界换构筑)</p>
              <div class="stagger-in grid grid-cols-2 gap-2">
                <button
                  v-for="(node, i) in currentNodes"
                  :key="node.id"
                  class="rounded-md border border-ink/15 bg-paper-deep/60 px-2.5 py-2 text-left active:scale-98"
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
            <template v-else-if="run.layer === EXPEDITION_GUARDIAN_LAYER">
              <p class="mb-1.5 text-[11px] text-ink-faint">{{ cnNumber(EXPEDITION_ROUTE_LAYERS) }}重已过,界主临阵。可先回凡界整备,再来决战。</p>
              <p v-if="guardianPreview" class="mb-1.5 text-[10px] text-violet-ink">
                天机:{{ guardianPreview.winText }} · {{ guardianPreview.skillLines.join(' / ') }}
              </p>
              <button class="btn-seal w-full !py-2 !text-[13px] pulse-ready animate-glow-pulse" @click="fightBoss">
                决战 · {{ runWorld.guardian.name }}
              </button>
            </template>
            <button class="btn-ghost mt-2 w-full !py-2 !text-[11px] !text-ink-faint" @click="abandonRun">中道而返(道源不退)</button>
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
                <span class="ml-auto tabular text-[11px] text-ink-faint">入界+{{ cnNumber(EXPEDITION_ROUTE_LAYERS) }}重+界主</span>
              </p>
              <!--
                这一界「该有的境界」:敌人按本界锚点层级定标(见 gauntlet.celestialAnchor),
                未至此境者会被**境界压制**(守关者额外增伤)。名字从境界表取,不手写 ——
                哪天梯子挪了,这句自己跟上。
              -->
              <p class="mt-0.5 text-[10px]" :class="player.major < anchorMajorOf(world.anchorTier) ? 'text-cinnabar/80' : 'text-ink-faint'">
                此界宜 {{ REALMS[anchorMajorOf(world.anchorTier)]?.name ?? '' }} 及以上
                <template v-if="player.major < anchorMajorOf(world.anchorTier)"> · 你尚在此境之下,受境界压制</template>
              </p>
              <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{{ world.desc }}</p>
              <p class="mt-1 flex flex-wrap gap-x-3 text-[10px] text-violet-ink">
                <span v-for="(r, i) in world.ruleText" :key="i">{{ r }}</span>
              </p>
              <button class="btn-seal mt-2.5 w-full !py-2 !text-[13px]" :disabled="run !== null" @click="openPrep(world.id)">
                {{ run ? '远征在途' : `启 程(道源 ${world.entryCost} · 余 ${formatNum(endgame.daoSource)} · 破界底赏 ${world.rewardDaoSource})` }}
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
                <p class="mt-1 text-[10px] text-ink-faint">
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
              <span class="tabular text-[11px] text-ink-soft">{{ daily.verdict.difficulty }} · 可行 {{ daily.verdict.viable }}/{{ BUILD_PROFILES.length }}</span>
              <span class="ml-auto tabular text-[11px] text-gold-ink">赏 {{ daily.verdict.reward }}</span>
            </p>
            <p class="mt-1 flex flex-wrap gap-x-3 text-[10px] text-violet-ink">
              <span v-for="m in dailyMutators" :key="m!.id">◇ {{ m!.name }}:{{ m!.text }}</span>
              <span v-if="dailyPact" class="text-cinnabar">契·{{ dailyPact.name }}</span>
            </p>
            <button class="btn-seal mt-2 w-full !py-2 !text-[12px]" :disabled="endgame.dailyDoneDay === daily.day" @click="goDaily">
              {{ endgame.dailyDoneDay === daily.day ? '今日已成,明日再会' : `应 战(道源 ${CHALLENGE_ENTRY_COST} · 余 ${formatNum(endgame.daoSource)})` }}
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
                  应 战(道源 {{ MUTATION_ENTRY_COST }} · 余 {{ formatNum(endgame.daoSource) }} · 破解得 {{ MUTATION_BASE_REWARD }})
                </button>
                <button class="btn-ghost !px-3 !text-[12px]" @click="mutationDraw = rollMutators()">再探</button>
              </div>
            </template>
            <template v-else>
              <p class="text-[11px] leading-relaxed text-ink-faint">天道无常,规则无定。窥探本次变数,再决定是否应战——{{ cnNumber(MUTATION_FIGHTS) }}连战,规则叠加。</p>
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
          <!-- 天界秘境:真仙起,道源代价,与远征/试炼并列的一阶一次性内容 -->
          <SecretRealmCard gate="celestial" />

          <SectionTitle title="天道挑战书" hint="你定规则,天道定赏" />
          <div class="card-ink mt-2 px-4 py-3">
            <p class="text-[11px] text-ink-faint">选界 · 叠变数(至多 {{ CHALLENGE_MAX_MUTATORS }} 条)· 立契 · 命名。天道观你出题之难,赏格随之而定,绝无虚价。</p>
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
                :aria-pressed="draft.mutatorIds.includes(m.id)"
                @click="toggleDraftMutator(m.id)"
              >
                {{ m.name }}
              </button>
            </div>
            <!-- 变数已选的,把效果正文亮出来 —— 手机没有 hover,赌约规则得看得见 -->
            <p v-if="selectedMutators.length" class="mt-1 text-[10px] leading-relaxed text-violet-ink">
              {{ selectedMutators.map(m => `${m.name}：${m.text}`).join('；') }}
            </p>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <button
                class="chip-ink"
                :class="draft.pactId === null ? 'border-jade text-jade' : 'border-ink/25 text-ink-faint'"
                :aria-pressed="draft.pactId === null"
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
                :aria-pressed="draft.pactId === p.id"
                @click="setDraftPact(p.id)"
              >
                {{ p.name }}
              </button>
            </div>
            <p v-if="challengePact" class="mt-1 text-[10px] leading-relaxed text-ink-soft">
              立约「{{ challengePact.name }}」：{{ challengePact.ruleText }}
            </p>
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
                <span class="text-ink-soft">天道受此约:{{ challengeVerdict.difficulty }} · 可行流派 {{ challengeVerdict.viable }}/{{ BUILD_PROFILES.length }}</span>
                <span class="tabular text-gold-ink">赏 道源 {{ challengeVerdict.reward }}</span>
              </p>
              <p v-else class="text-[11px] text-cinnabar">{{ challengeVerdict.reason }}</p>
            </div>
            <div class="mt-2 flex gap-2">
              <button class="btn-ghost flex-1 !py-2 !text-[12px]" @click="doVerify">验 约</button>
              <button class="btn-seal flex-1 !py-2 !text-[12px]" :disabled="!challengeVerdict?.ok || run !== null" @click="doUndertake">
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
          <div class="mt-2 flex items-center justify-between px-1">
            <p class="text-[10px] tabular text-ink-faint">
              天道历 {{ RULESET_VERSION }} 世 · 天地规矩易过 {{ RULESET_CHANGELOG.length }} 回
            </p>
            <button class="-my-1 py-2 font-kai text-[10px] text-azure active:scale-90" @click="openEra(null)">纪元变迁史 →</button>
          </div>
          <!-- 今昔之比:与过去的自己对话 -->
          <div v-if="legacy.length" class="card-ink mt-2 px-4 py-3">
            <p class="mb-1.5 font-kai text-[12px] tracking-[0.3em] text-ink-faint">今昔之比</p>
            <div v-for="lc in legacy" :key="lc.targetName" class="mb-2 last:mb-0">
              <p class="text-[12px] text-ink-soft tabular">
                {{ lc.targetName }}:第{{ lc.earlyLife }}世({{ lc.earlyBuild }}){{ lc.earlyText }}
                <span class="mx-1 text-ink-faint">→</span>
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
              <span class="min-w-0 truncate font-kai text-[12px]" :class="mark.cleared ? 'text-ink' : 'text-ink-faint'">
                {{ mark.targetName }}{{ mark.cleared ? '·破' : '·殁' }}
              </span>
              <span class="ml-auto shrink-0 tabular text-[10px] text-ink-faint">{{ mark.rounds }}回合 · {{ mark.buildName }}</span>
              <button
                v-if="isStaleRuleset(mark.ruleset)"
                class="shrink-0 rounded border border-cinnabar/50 bg-cinnabar/10 px-1 py-0.5 font-kai text-[9px] text-cinnabar active:scale-90"
                :title="`录于旧纪 ${mark.ruleset},天道已变`"
                @click="openEra(mark)"
              >
                变
              </button>
              <button
                v-if="mark.replay"
                class="shrink-0 rounded border border-gold-ink/40 px-1.5 py-0.5 font-kai text-[10px] text-gold-ink active:scale-90"
                title="以当年的构筑重打此战"
                @click="goReplay(mark)"
              >
                忆
              </button>
              <!-- 重写要花道源,代价内联在按钮上(不再是 hover 专属),触控面放大,并加一步确认 -->
              <template v-if="mark.cleared && mark.replay && rewriteConfirm === i">
                <button
                  class="shrink-0 rounded border border-cinnabar/50 bg-cinnabar/10 px-2 py-1 font-kai text-[10px] text-cinnabar active:scale-90"
                  @click="rewriteConfirm = null"
                >
                  算了
                </button>
                <button
                  class="shrink-0 rounded bg-cinnabar px-2 py-1 font-kai text-[10px] text-paper active:scale-90"
                  @click="doRewrite(mark)"
                >
                  确认重写
                </button>
              </template>
              <button
                v-else-if="mark.cleared && mark.replay"
                class="shrink-0 rounded border border-cinnabar/40 px-2 py-1 font-kai text-[10px] text-cinnabar active:scale-90"
                :title="`以今日之你重打此战,快过 ${mark.rounds} 回合即【胜于旧我】`"
                @click="rewriteConfirm = i"
              >
                写(道源{{ REWRITE_ENTRY_COST }})
              </button>
            </div>
          </div>
          <p v-else class="card-ink mt-2 px-4 py-5 text-center">
            <span class="empty-seal" aria-hidden="true">白</span>
            <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">此页尚白</span>
            <span class="mt-1 block text-[10px] leading-relaxed text-ink-faint">你在天界的每一战,都会留下痕迹</span>
          </p>
        </section>
      </template>
    </template>

    <!-- 远征准备:择契 -->
    <BaseModal :open="prepWorld !== null" :title="prepWorld ? `远征 · ${prepWorld.name}` : ''" @close="prepWorldId = null">
      <template v-if="prepWorld">
        <p class="text-[11px] leading-relaxed text-ink-faint">
          入界一战 → {{ cnNumber(EXPEDITION_ROUTE_LAYERS) }}重择路(沿途道源)→ 界主。层间可回凡界换构筑。启程前,可与天道立契——风险换道源。
        </p>
        <div class="mt-2 space-y-1.5">
          <button
            class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left"
            :class="prepPact === null ? 'bg-jade/10 border border-jade/40' : 'bg-paper-deep/60 border border-transparent'"
            @click="prepPact = null"
          >
            <span class="text-[12px] text-ink-soft">不立契约</span>
            <span class="ml-auto text-[10px] text-ink-faint">道源 ×1.0</span>
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
        <!-- 奇门遁甲:择门入界(免费,换的是打法,不碰道源倍数) -->
        <p class="mt-3 text-[11px] leading-relaxed text-ink-faint">
          奇门 · 择门入界 —— 立契是与天道做交易,择门是选这一趟从哪一门进:免费,改的是打法。
        </p>
        <div class="mt-1.5 grid grid-cols-4 gap-1.5">
          <button
            class="rounded-md px-1 py-1.5 text-center text-[11px]"
            :class="prepGate === null ? 'bg-jade/10 border border-jade/40 text-ink-soft' : 'bg-paper-deep/60 border border-transparent text-ink-faint'"
            @click="prepGate = null"
          >
            常道
          </button>
          <button
            v-for="g in GATES"
            :key="g.id"
            class="rounded-md px-1 py-1.5 text-center text-[11px]"
            :class="prepGate === g.id ? 'bg-violet-ink/10 border border-violet-ink/40 text-ink' : 'bg-paper-deep/60 border border-transparent text-ink-faint'"
            :title="`${g.fullName}(${g.kind}) · ${g.gua}${g.direction}${g.palace}宫 —— ${g.desc}`"
            @click="prepGate = g.id"
          >
            <span class="font-kai text-[13px]">{{ g.name }}</span>
            <span class="ml-0.5 text-[9px]" :class="g.kind === '凶' ? 'text-cinnabar/80' : g.kind === '吉' ? 'text-jade' : 'text-ink-faint'">{{ g.kind }}</span>
          </button>
        </div>
        <p v-if="selectedGate" class="mt-1.5 rounded-md bg-paper-deep/70 px-3 py-2 text-[10px] leading-relaxed text-ink-soft">
          <span class="font-kai text-ink">{{ selectedGate.fullName }}</span>
          <span class="text-ink-faint"> · {{ selectedGate.gua }}{{ selectedGate.direction }}{{ selectedGate.palace }}宫 · {{ selectedGate.kind }}</span>
          <br />
          {{ selectedGate.desc }}
          <br />
          <span class="text-ink-faint">{{ selectedGate.gist }}</span>
        </p>
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
            <span>预计可行流派 {{ prepForecast.viableStyles }}/{{ BUILD_PROFILES.length }}</span>
          </p>
          <!--
            敌人一侧的判定(道之理解 / 境界压制):这是"为什么这一界对我更难"的答案。
            判定的文案与数值同源(core/gauntlet.celestialJudgementLines),界面不再另编一套说法。
          -->
          <p v-for="(line, i) in prepForecast.judgementLines" :key="i" class="mt-0.5 text-[10px] leading-relaxed text-cinnabar/80">
            {{ line }}
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
        <!--
          输也要输得明白:敌人一侧的判定(道之理解 / 境界压制)与战前预估同源,
          连同"怎么办"一并写在这里 —— 战报不是判决书,是下一次出发的依据。
        -->
        <div v-if="expedition.judgementLines?.length" class="mt-2 rounded-md bg-cinnabar/5 px-3 py-2">
          <p class="font-kai text-[11px] tracking-widest text-cinnabar/80">此战之判</p>
          <p v-for="(line, i) in expedition.judgementLines" :key="i" class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">
            {{ line }}
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
      <div class="card-ink divide-y divide-ink/6 px-4">
        <div v-for="row in furnaceRows" :key="row.rate.resource" class="py-2.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[12px] text-ink-soft">{{ row.rate.name }}(存 {{ formatNum(row.have) }})</span>
            <!-- 全熔防误触:文案亮出『整包』与可得道源(不再是『按 25:1 换』的可兑换暗示),再按一下才熔 -->
            <button
              class="btn-ghost !px-3 !py-2 !text-[11px] tabular"
              :disabled="furnacePreview(row.rate) <= 0"
              @click="furnaceConfirm = row.rate.resource"
            >
              熔尽本包 → {{ furnacePreview(row.rate) }} 道源
            </button>
          </div>
          <div v-if="furnaceConfirm === row.rate.resource" class="mt-1.5 rounded-md bg-cinnabar/5 px-3 py-2">
            <p class="text-[10px] leading-relaxed text-cinnabar/90">
              将 <span class="tabular">{{ row.rate.name }} ×{{ formatNum(row.have) }}</span> 尽数熔作道源,共
              <span class="tabular">+{{ furnacePreview(row.rate) }}</span> 缕 —— 此举不可逆,这些资源再无炼丹/锻造/参悟之途。
            </p>
            <div class="mt-1.5 flex justify-end gap-2">
              <button class="btn-ghost !px-3 !py-2 !text-[11px]" @click="furnaceConfirm = null">再想想</button>
              <button class="btn-seal !px-3 !py-2 !text-[11px] tabular" @click="doFurnace(row.rate)">确认熔尽</button>
            </div>
          </div>
        </div>
        <div class="flex items-center justify-between py-2.5">
          <span class="text-[12px] text-ink-soft">灵石(存 {{ formatGN(resources.spiritStone) }})</span>
          <button class="btn-ghost !px-3 !py-2 !text-[11px] tabular" @click="furnaceConvertStone()">
            {{ formatGN(furnaceStoneCost()) }} → {{ FURNACE_STONE_DAO_SOURCE }} 道源
          </button>
        </div>
        <div class="py-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[12px] text-ink-soft">道源凝道果(跨世保留)</span>
            <button class="btn-ghost !px-3 !py-2 !text-[11px] tabular" @click="doCondense()">
              {{ DAO_SOURCE_PER_FRUIT }} 道源 → 道果 +1
            </button>
          </div>
          <!-- S3 链路:本次凝聚后,下世收益变化 -->
          <p class="mt-1 text-[10px] leading-relaxed text-ink-faint tabular">
            当前 {{ fruitInfo.total }} 枚 · 有效 {{ fruitCountLabel(fruitInfo.effective) }}
            <span class="text-gold-ink">→ 凝后 {{ fruitCountLabel(fruitInfo.nextEffective) }}(+{{ fruitInfo.deltaPct }}%)</span>
            · 边际收益渐减
          </p>
        </div>
      </div>
      <template #footer>
        <button class="btn-seal w-full" @click="furnaceOpen = false">收 炉</button>
      </template>
    </BaseModal>

    <!-- 道途选择确认:一世只此一次,点了就锁到转世 -->
    <BaseModal :open="pendingDao !== undefined" title="定下道途" @close="pendingDaoId = null">
      <template v-if="pendingDao">
        <p class="font-kai text-[14px] tracking-wider text-ink">{{ pendingDao.name }}</p>
        <p class="mt-1.5 text-[12px] leading-relaxed text-ink-soft">{{ pendingDao.desc }}</p>
        <p v-for="(r, i) in pendingDao.ruleText" :key="i" class="mt-0.5 text-[11px] text-azure">· {{ r }}</p>
        <p v-for="(r, i) in pendingDao.deepText" :key="`confirm-${i}`" class="mt-0.5 text-[11px] text-gold-ink">◈ {{ r }}</p>
        <p class="mt-3 border-l-2 border-cinnabar/60 pl-2 text-[11px] text-cinnabar">道途既定,此世不再更改;误选须待兵解转世方能重择</p>
      </template>
      <template #footer>
        <div class="flex gap-2">
          <button class="btn-ghost flex-1" @click="pendingDaoId = null">再想想</button>
          <button class="btn-seal flex-1 !bg-cinnabar-deep" @click="confirmDao">道心已定</button>
        </div>
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

    <!-- 天道已变:旧纪道痕为何不能按老眼光看 -->
    <!-- 首次凝道果:把「跨世保留的到底是什么」讲一次 -->
    <BaseModal :open="fruitDialogOpen" title="道果" @close="fruitDialogOpen = false">
      <div class="space-y-2.5 text-[12px] leading-relaxed">
        <p class="text-ink-soft">{{ fruitDialog.intro }}</p>
        <div>
          <p class="font-kai text-[12px] tracking-wider text-ink">用途</p>
          <p class="text-ink-faint">{{ fruitDialog.usages.join(' · ') }}</p>
        </div>
        <div>
          <p class="font-kai text-[12px] tracking-wider text-ink">来处</p>
          <p class="text-ink-faint">{{ fruitDialog.gains.join(' · ') }}</p>
        </div>
        <p class="border-l-2 border-violet-ink/60 pl-2 text-[11px] text-violet-ink">{{ fruitDialog.lifecycle }}</p>
      </div>
      <template #footer>
        <button class="btn-seal w-full" @click="fruitDialogOpen = false">知道了</button>
      </template>
    </BaseModal>

    <BaseModal :open="eraOpen" title="天道已变" @close="eraOpen = false">
      <p v-if="eraMark" class="text-[11px] leading-relaxed text-ink-soft">
        此战录于规则纪元 <span class="tabular text-cinnabar">{{ eraMark.ruleset }}</span>,今为
        <span class="tabular">{{ RULESET_VERSION }}</span>。同界同契,当年的你依当年的规矩取胜 ——
        如今再忆,规矩已换。
      </p>
      <p v-else class="text-[11px] leading-relaxed text-ink-soft">
        纪元变迁,只记改了规矩的大事变;寻常增减,不记在此册。
      </p>
      <div class="mt-2.5 space-y-2">
        <div v-for="c in eraChanges" :key="c.version" class="card-ink px-3 py-2">
          <p class="font-kai text-[12px] tabular text-cinnabar">纪元 {{ c.version }}</p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{{ c.note }}</p>
        </div>
        <p v-if="!eraChanges.length" class="card-ink px-3 py-3 text-center text-[11px] text-ink-faint">
          {{ eraMark ? '此后天道未再改过规矩 —— 当年的打法,今日依旧算数。' : '尚无变更记录。' }}
        </p>
      </div>
    </BaseModal>

    <!-- Phase 30.9 S4:首次登真仙·终局导览 -->
    <BaseModal :open="tutorialOpen" title="登临真仙" :closable="false">
      <div class="space-y-2.5 text-[13px] leading-relaxed">
        <p class="font-kai text-ink">凡间所得,终有尽时。</p>
        <p class="text-ink-soft">
          玄铁、残页、灵石……到了此境,皆可献入
          <a class="-my-2 inline-block py-2 text-azure" @click="tutorialOpen = false">天道熔炉</a>
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
          <!-- 标点跟着前一句走:单独成行会在窄屏上被折成孤零零一个句号 -->
          <span class="text-cinnabar">道源是此世拿来折腾的,</span>
          <span class="text-violet-ink">道果是几世以后仍受益的财富。</span>
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
  import { REALMS } from '@/data/realms'
  import { tierMajor } from '@/core/formulas'
  import {
    CELESTIAL_WORLDS,
    DAO_PATHS,
    DAO_SOURCE_PER_FRUIT,
    EXPEDITION_GUARDIAN_LAYER,
    EXPEDITION_ROUTE_LAYERS,
    FURNACE_RATES,
    FURNACE_STONE_DAO_SOURCE,
    TRIALS,
    daoPathDef,
    type FurnaceRate
  } from '@/data/endgame'
  import { PACTS, pactDef } from '@/data/pacts'
  import { GATES, gateDef } from '@/data/qimen'
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
  import { RULESET_CHANGELOG, RULESET_VERSION, isStaleRuleset, rulesetChangesSince } from '@/data/ruleset'
  import {
    abandonExpedition,
    challengeGuardian,
    challengeMutation,
    chooseRouteNode,
    forecastExpedition,
    MUTATION_BASE_REWARD,
    MUTATION_ENTRY_COST,
    MUTATION_FIGHTS,
    previewFight,
    rerollVoidWorld,
    resolveWorld,
    rollMutators,
    startWorldExpedition,
    VOID_REROLL_COST,
    type StepOutcome
  } from '@/core/expedition'
  import { detectBuild } from '@/core/buildDetect'
  import { foeOriginLines } from '@/core/battleAnalysis'
  import type { CombatantSnap } from '@/types'
  import { BUILD_PROFILES } from '@/core/buildSim'
  import { swordPurity, SWORD_PURITY_MAX_LAYERS } from '@/core/daoDepth'
  import {
    CHALLENGE_ENTRY_COST,
    CHALLENGE_MAX_MUTATORS,
    undertakeChallenge,
    verifyChallenge,
    type ChallengeDraft,
    type ChallengeVerdict
  } from '@/core/challenge'
  import { cnNumber, formatGN, formatNum } from '@/utils/format'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import GauntletPanel from '@/components/celestial/GauntletPanel.vue'
  import SecretRealmCard from '@/components/adventure/SecretRealmCard.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import {
    daoSourceDialog,
    daoFruitDialog,
    fruitCountLabel,
    fruitMarginalInfo,
    markFruitTutorialSeen,
    shouldShowFruitTutorial,
    shouldShowEndgameTutorial,
    markEndgameTutorialSeen,
    markResourceDialogSeen
  } from '@/core/resourceGuidance'

  const resources = useResourcesStore()
  const player = usePlayerStore()

  /** 某界的锚点层级落在哪一个境界 —— 界面上「此界宜 X 及以上」用它,不在模板里手写境界名 */
  function anchorMajorOf(anchorTier: number): number {
    return tierMajor(anchorTier)
  }
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
  /** 熔炉全熔确认态(按资源键)。熔炉弹窗关闭即复位,不残留旧行 */
  const furnaceConfirm = ref<FurnaceRate['resource'] | null>(null)
  watch(furnaceOpen, open => {
    if (!open) furnaceConfirm.value = null
  })
  /** 全熔一包可得道源(预览,与 furnaceConvert 同口径 floor(have/per)) */
  function furnacePreview(rate: FurnaceRate): number {
    return Math.floor(resources[rate.resource] / rate.per)
  }
  function doFurnace(rate: FurnaceRate): void {
    furnaceConfirm.value = null
    furnaceConvert(rate)
  }
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

  // 规则纪元:旧纪道痕为何与今日不可同日而语(纪元变迁史同出一源,视图不手抄)
  const eraOpen = ref(false)
  const eraMark = ref<(typeof endgame.marks)[number] | null>(null)
  const eraChanges = computed(() => (eraMark.value ? rulesetChangesSince(eraMark.value.ruleset) : RULESET_CHANGELOG))
  function openEra(mark: (typeof endgame.marks)[number] | null): void {
    eraMark.value = mark
    eraOpen.value = true
  }

  const currentDao = computed(() => (endgame.daoPath ? daoPathDef(endgame.daoPath) : undefined))

  /**
   * 凝道果 —— 首次成功时把「道果是什么」讲一次。
   *
   * shouldShowFruitTutorial / daoFruitDialog 写好了却无人调用:
   * 玩家第一次凝出道果(整套轮回经济的核心货币)时,没有任何解释。
   */
  const fruitDialogOpen = ref(false)
  const fruitDialog = computed(() => daoFruitDialog())
  function doCondense(): void {
    const before = player.reincarnation.daoFruit
    condenseDaoFruit()
    if (player.reincarnation.daoFruit === before) return
    if (shouldShowFruitTutorial()) {
      fruitDialogOpen.value = true
      markFruitTutorialSeen()
    }
  }

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

  /** 远征行程点列:重层择路 + 界主(层号与 EXPEDITION_* 同源,不另外数) */
  const RUN_STAGES = [
    ...Array.from({ length: EXPEDITION_ROUTE_LAYERS }, (_, i) => `${cnNumber(i + 1)}重`),
    '界主'
  ]

  /** 剑道:当前剑意层数与纯度构成 */
  const swordInfo = computed(() => {
    if (endgame.daoPath !== 'sword') return null
    return swordPurity(player.finalStats.mods, inventory.currentArtifacts.length, detectBuild(player.finalStats.mods))
  })

  /** 道途选择二段式:先弹确认,再落一子。道途一世只定一次,误触即被锁死到转世 */
  const pendingDaoId = ref<(typeof DAO_PATHS)[number]['id'] | null>(null)
  const pendingDao = computed(() => (pendingDaoId.value ? daoPathDef(pendingDaoId.value) : undefined))

  function pickDao(id: (typeof DAO_PATHS)[number]['id']): void {
    pendingDaoId.value = id
  }

  function confirmDao(): void {
    if (pendingDaoId.value) chooseDaoPath(pendingDaoId.value)
    pendingDaoId.value = null
  }

  // ---- 远征准备 ----
  const prepWorldId = ref<string | null>(null)
  const prepPact = ref<string | null>(null)
  /** 奇门遁甲:所择之门(常道 = null) */
  const prepGate = ref<string | null>(null)
  const selectedGate = computed(() => (prepGate.value ? gateDef(prepGate.value) : undefined))
  const prepWorld = computed(() => (prepWorldId.value ? resolveWorld(prepWorldId.value) : null))
  const selectedPact = computed(() => (prepPact.value ? pactDef(prepPact.value) : undefined))
  const prepPreview = computed(() =>
    prepWorld.value
      ? previewFight(prepWorld.value.foes[0]!, undefined, undefined, {
          worldId: prepWorldId.value!,
          pactId: prepPact.value,
          gateId: prepGate.value
        })
      : null
  )
  /** 天道赌约:整程预估(随契约选择实时重算) */
  const prepForecast = computed(() =>
    prepWorldId.value ? forecastExpedition(prepWorldId.value, prepPact.value, prepGate.value) : null
  )

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
    /** 逐场摘要;`foe` 带着那一场敌人的加成来源(旧记录可能没有) */
    rows: { foeName: string; win: boolean; rounds: number; hpLeftPct: number; foe?: CombatantSnap }[]
    reward: number
    judgementLines?: string[]
  }
  const expedition = ref<ReportView | null>(null)

  /**
   * 开战报 —— 判定归因只此一处。
   *
   * 远征的文案带玩家自己的构筑厚度(见 core/gauntlet.celestialJudgementLines),
   * 试炼/变数/忆战/重写/挑战没有那一份,就照敌人快照上的来源说明讲
   * (worldFoeSnap 一路带下来)。两条路给的都是同一件事:这一战为什么变难。
   */
  function openReport(o: {
    title: string
    cleared: boolean
    markText: string
    rows: ReportView['rows']
    reward: number
    judgementLines?: string[]
  }): void {
    expedition.value = { ...o, judgementLines: o.judgementLines ?? foeOriginLines(o.rows[0]?.foe?.origin) }
  }

  function handleOutcome(outcome: StepOutcome | null, title: string): void {
    if (!outcome || outcome.type === 'advance') return
    const rows = outcome.finalRows ?? [outcome.row]
    openReport({
      title,
      cleared: outcome.type === 'cleared',
      markText:
        outcome.type === 'cleared'
          ? `全程 ${rows.length} 战功成`
          : outcome.type === 'pactBroken'
            ? `契约崩碎于第 ${rows.length} 战`
            : `止步第 ${rows.length} 战`,
      rows,
      reward: outcome.rewardDaoSource,
      judgementLines: outcome.judgementLines
    })
  }

  function depart(): void {
    if (!prepWorld.value) return
    const title = prepWorld.value.name
    const outcome = startWorldExpedition(prepWorld.value.id, prepPact.value, prepGate.value)
    if (outcome) prepWorldId.value = null
    handleOutcome(outcome, title)
  }

  /**
   * 战报标题要在动手**之前**取。
   *
   * 从前写成 `handleOutcome(chooseRouteNode(i), runWorld.value?.name ?? '远征')` ——
   * 实参从左往右求值:先打完这一场,而「连败被逐」「功成出界」都会把 worldRun 清成 null,
   * 于是轮到读 runWorld 时它已经是空的,标题就退成了光秃秃的「远征」。
   * 实测(后期档真点一次择路):弹窗标题「远征」,而不是「赤炎天」。
   */
  function titleOfRun(): string {
    return runWorld.value?.name ?? '远征'
  }

  function pickNode(i: 0 | 1): void {
    const title = titleOfRun()
    handleOutcome(chooseRouteNode(i), title)
  }

  function fightBoss(): void {
    const title = titleOfRun()
    handleOutcome(challengeGuardian(), title)
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
    openReport({
      title: '天道变数',
      cleared: result.report.cleared,
      markText: result.report.cleared ? `${cnNumber(MUTATION_FIGHTS)}战全捷,共 ${result.report.totalRounds} 回合` : `止步第 ${result.report.fightsWon + 1} 战`,
      rows: result.report.rows,
      reward: result.rewardDaoSource
    })
  }

  // ---- 试炼 ----
  function goTrial(id: string): void {
    const result = challengeTrial(id)
    if (result) {
      openReport({
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: result.rewardDaoSource
      })
    }
  }

  // ---- 忆战:与过去的自己重临此界 ----
  function goReplay(mark: (typeof endgame.marks)[number]): void {
    const result = replayMark(mark)
    if (result) {
      openReport({
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: 0
      })
    }
  }

  // ---- 重写此痕:以今日之你,快过当年 ----
  /** 重写确认态(按道痕索引):写入要花道源,需要看明白再点 */
  const rewriteConfirm = ref<number | null>(null)
  function goRewrite(mark: (typeof endgame.marks)[number]): void {
    const result = rewriteMark(mark)
    if (result) {
      openReport({
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: 0
      })
    }
  }
  function doRewrite(mark: (typeof endgame.marks)[number]): void {
    rewriteConfirm.value = null
    goRewrite(mark)
  }

  /** 道途行为叙事(本世道痕 ≥2 则方语) */
  const daoStory = computed(() => currentDaoNarrative())

  // ---- 天道挑战书 ----
  const draft = ref<ChallengeDraft>({ worldId: CELESTIAL_WORLDS[0]!.id, mutatorIds: [], pactId: null, name: '' })
  const challengeVerdict = ref<ChallengeVerdict | null>(null)
  /** 已选变数(把效果正文亮到行内,移动端不靠 hover) */
  const selectedMutators = computed(() => MUTATORS.filter(m => draft.value.mutatorIds.includes(m.id)))
  const challengePact = computed(() => (draft.value.pactId ? pactDef(draft.value.pactId) ?? null : null))

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
      openReport({
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: result.rewardDaoSource
      })
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
      openReport({
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: result.rewardDaoSource
      })
    }
  }

  const furnaceRows = computed(() => FURNACE_RATES.map(rate => ({ rate, have: resources[rate.resource] })))
</script>
