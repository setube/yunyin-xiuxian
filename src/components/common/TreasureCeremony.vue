<template>
  <!--
    得宝仪典:顶档之物入手的那一瞬。

    它是记号不是弹窗 —— 没有控件、不进 Tab 序、不吃点击(整层 pointer-events: none),
    三秒后自己散。判据见 src/ui/treasureCeremony.spec.ts。
  -->
  <Teleport to="body">
    <Transition name="treasure-fade">
      <div
        v-if="mark"
        :key="seq"
        class="treasure-overlay"
        :style="toneVars"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div class="treasure-halo" aria-hidden="true" />
        <div class="treasure-rays" aria-hidden="true" />
        <div class="treasure-frame" aria-hidden="true" />
        <div class="treasure-body">
          <p class="treasure-grade font-kai" :style="{ color: mark.textTone }">{{ mark.grade }}</p>
          <span class="treasure-icon">
            <GameIcon :name="mark.icon" :size="30" :style="{ color: mark.tone }" />
          </span>
          <p class="treasure-name font-kai" :style="{ color: mark.textTone }">{{ mark.name }}</p>
          <p class="treasure-kind">{{ mark.kindName }}</p>
        </div>
        <span class="sr-only">{{ mark.announce }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, onUnmounted, ref, watch } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { playSfx } from '@/core/audio'
  import { tint } from '@/utils/colorToken'
  import GameIcon from './GameIcon.vue'

  /**
   * 停留时长。稀有 toast 是 4.2 秒,仪典比它长一点、比弹窗短得多 ——
   * 它是「看一眼就过去」,玩家不该为它做任何事。
   */
  const HOLD_MS = 3000

  const ui = useUiStore()
  const mark = computed(() => ui.treasure)

  /**
   * 色一律由品阶原色现算成带透明度的 rgb,组件里不写死。
   * 不用 color-mix:仓库的兼容下限是 Chrome 51,它要 111。
   */
  const toneVars = computed(() => {
    const tone = mark.value?.tone ?? 'transparent'
    return {
      '--treasure-halo': tint(tone, 0.34),
      '--treasure-ray': tint(tone, 0.9),
      '--treasure-line': tint(tone, 0.8),
      '--treasure-glow': tint(tone, 0.55)
    }
  })
  /** 同一件连着再来一次时也要重播动画:v-if 认的是它,不是内容 */
  const seq = ref(0)
  let timer: ReturnType<typeof setTimeout> | undefined

  function clear(): void {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  watch(mark, nv => {
    clear()
    if (!nv) return
    seq.value += 1
    playSfx('treasure')
    timer = setTimeout(() => {
      timer = undefined
      ui.clearTreasure()
    }, HOLD_MS)
  })

  onUnmounted(clear)
</script>

<style scoped>
  /*
   * 全屏但无控件:与 WarpPortal 同一取舍 —— 整层不吃事件,盖住的按钮照常能点。
   * 层级高于 toast(70):仪典是这一刻唯一要说的事,提示条让位三秒。
   */
  .treasure-overlay {
    position: fixed;
    inset: 0;
    z-index: 72;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    /*
     * 底:纸色洗淡 + 把背景糊掉。
     *
     * 实测三轮才定:四周全透 → 底下的页面大字直接穿进仪典的字里,两套字叠成一片;
     * 压到 84% → 仍透;压到 97% → 那一行大字还认得出。
     * 让它「只剩这一件事」有两条路:底做成实心,或把背景糊掉。
     * 取后者 —— 实心底配穿透点击,会让人在一面看不见的界面上点到东西;
     * 糊掉之后底下只剩一层纸色的光斑:仍看得出这是叠在刚才那一页上,又不会两套字互相穿。
     *
     * backdrop-filter 在 Chrome 51 上不生效(仓库兼容下限),那时退化成一整面纸色洗淡 ——
     * 仍然可读,只是少了那层景深;Safari 12 吃的是带前缀那一行。
     */
    background: radial-gradient(
      ellipse at 50% 45%,
      rgb(var(--color-paper-lifted-rgb) / 0.76) 0%,
      rgb(var(--color-paper-rgb) / 0.82) 54%,
      rgb(var(--color-paper-deep-rgb) / 0.88) 100%
    );
    -webkit-backdrop-filter: blur(30px) saturate(0.9);
    backdrop-filter: blur(30px) saturate(0.9);
  }

  /* 中心柔光:色由调用点注入的 --treasure-tone 承载,组件里不写死任何色值 */
  .treasure-halo {
    position: absolute;
    width: 320px;
    height: 320px;
    border-radius: 999px;
    background: radial-gradient(closest-side, var(--treasure-halo), transparent 72%);
    filter: blur(14px);
    opacity: 0.9;
    pointer-events: none;
    animation: treasure-halo 3s ease-out forwards;
  }

  /* 一圈细射线:与光环同色,只加「这一刻不同」的量,不加信息 */
  .treasure-rays {
    position: absolute;
    width: 300px;
    height: 300px;
    border-radius: 999px;
    background: repeating-conic-gradient(from 0deg, var(--treasure-ray) 0deg 1.2deg, transparent 1.2deg 24deg);
    opacity: 0.16;
    mask-image: radial-gradient(closest-side, transparent 28%, black 46%, transparent 74%);
    -webkit-mask-image: radial-gradient(closest-side, transparent 28%, black 46%, transparent 74%);
    pointer-events: none;
    animation: treasure-rays 9s linear infinite;
  }

  /* 方框:四段断续嵌边,与 .luster-frame 同一套语言但更收 */
  .treasure-frame {
    position: absolute;
    width: min(78vw, 268px);
    height: min(78vw, 268px);
    border-radius: 14px;
    background:
      linear-gradient(90deg, transparent 0 12%, var(--treasure-line) 12% 88%, transparent 88%) top / 100% 1px no-repeat,
      linear-gradient(90deg, transparent 0 12%, var(--treasure-line) 12% 88%, transparent 88%) bottom / 100% 1px no-repeat,
      linear-gradient(180deg, transparent 0 12%, var(--treasure-line) 12% 88%, transparent 88%) left / 1px 100% no-repeat,
      linear-gradient(180deg, transparent 0 12%, var(--treasure-line) 12% 88%, transparent 88%) right / 1px 100% no-repeat;
    opacity: 0.55;
    pointer-events: none;
  }

  .treasure-body {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    pointer-events: none;
  }

  .treasure-grade {
    font-size: 12px;
    letter-spacing: 0.5em;
    /* 字距在末字后也留一格,左移半格让整串在视觉上居中 */
    text-indent: 0.5em;
    opacity: 0.9;
  }

  .treasure-icon {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
  }

  .treasure-name {
    font-size: 22px;
    letter-spacing: 0.22em;
    text-indent: 0.22em;
    text-shadow: 0 0 18px var(--treasure-glow);
  }

  .treasure-kind {
    font-size: 10px;
    letter-spacing: 0.3em;
    text-indent: 0.3em;
    color: rgb(var(--color-ink-faint-rgb));
  }

  @keyframes treasure-halo {
    0% {
      transform: scale(0.72);
      opacity: 0;
    }
    22% {
      transform: scale(1);
      opacity: 0.95;
    }
    100% {
      transform: scale(1.18);
      opacity: 0;
    }
  }

  @keyframes treasure-rays {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* 进出:名字缓慢浮起,不弹跳 —— 仪典要「静」,动效只是让它出现得不突然 */
  .treasure-fade-enter-active .treasure-body {
    animation: treasure-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes treasure-rise {
    from {
      transform: translateY(8px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .treasure-fade-enter-active,
  .treasure-fade-leave-active {
    transition: opacity 0.45s ease;
  }

  .treasure-fade-enter-from,
  .treasure-fade-leave-to {
    opacity: 0;
  }

  /*
   * 减少动效:光环停成一层静态柔光,射线不转 —— 形制仍在,只是不动。
   * 与 style.css 里那两块的取舍一致(0.01ms 保留「跑过一次」的前提),这里用局部声明,
   * 因为 scoped 样式里的 keyframes 归属本组件。
   */
  @media (prefers-reduced-motion: reduce) {
    .treasure-halo {
      animation: none;
      opacity: 0.7;
    }
    .treasure-rays {
      animation: none;
    }
    .treasure-fade-enter-active .treasure-body {
      animation: none;
    }
  }

  .reduce-motion .treasure-halo {
    animation: none;
    opacity: 0.7;
  }

  .reduce-motion .treasure-rays {
    animation: none;
  }
</style>
