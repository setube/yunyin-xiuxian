<template>
  <!--
    法球随界域变形(见 ui/orbForm):环数、粒子数、八卦环的有无一样样可数。
    从炼气一路看到混沌道祖,此前 21 境这颗球一模一样 —— 界域只有一行字说得出。
  -->
  <!--
    原先还有个 `orb-root--${form.rings}` 的类绑定:ring 数是 1~4,拼出来是 orb-root--1..4,
    但 CSS 与任何选择器里都没有这四个类 —— 环的个数由下面 orbRingIndexes 的 v-for 决定,
    样式挂在 .ring 上。那个绑定从头到尾没生效过,是个哑类。
  -->
  <div
    class="orb-root"
    :style="sizeStyle"
    :class="{ cultivating: active, breakthrough: full }"
  >
    <div class="particle-ring">
      <div v-for="i in particleCount" :key="i" class="orb-particle" :style="particleStyle(i)" />
    </div>

    <div class="ring-layer">
      <div
        v-for="i in ringCount"
        :key="`r${i}`"
        class="rot-ring"
        :class="[`rot-ring--${i}`, { bright: (i === 1 && active) || (i === ringCount && full) }]"
      />
    </div>

    <div class="orb-body" :class="{ pulsing: active }">
      <div class="inner-orbit-ring">
        <span v-for="i in 6" :key="i" class="orbit-dot" :style="{ '--i': i }" />
      </div>
      <span class="orb-icon">
        <slot>{{ form.glyph }}</slot>
      </span>
    </div>

    <!-- 纯视觉进度环:百分比与境界名旁边已有文字,读屏不必再念一次图形 -->
    <svg class="progress-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="orbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="var(--color-jade)" />
          <stop offset="50%" stop-color="var(--color-gold-ink)" />
          <stop offset="100%" stop-color="var(--color-jade)" />
        </linearGradient>
      </defs>
      <circle class="prog-bg" cx="60" cy="60" r="54" />
      <circle class="prog-bar" :class="{ full }" cx="60" cy="60" r="54" :style="{ strokeDashoffset: dashOffset }" />
    </svg>

    <!--
      八卦环与进度 SVG 同属纯视觉装饰,读屏不必念。
      原只给 SVG 挂了 aria-hidden,这一圈没挂 —— 读屏会把「☰☱☲☳☴☵☶☷」逐个念出来。
    -->
    <div v-if="form.bagua" class="bagua-wrap spinning" aria-hidden="true">
      <span v-for="(sym, i) in BAGUA" :key="i" class="bagua-sym" :style="{ '--ang': i * 45 + 'deg' }">{{ sym }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { orbForm, orbParticleIndexes, orbRingIndexes } from '@/ui/orbForm'

  const props = withDefaults(
    defineProps<{
      /** 修炼激活(加速粒子/点亮光环) */
      active: boolean
      /** 修为圆满(突破就绪) */
      full: boolean
      /** 进度 0~1(控制 SVG 环) */
      progress: number
      /** 法球直径,单位 px;窄屏并排布局用更小值 */
      size?: number
      /** 当前大境界:决定环数 / 粒子数 / 八卦环的有无(见 ui/orbForm) */
      major?: number
    }>(),
    { size: 140, major: 0 }
  )

  /** 直径与内部各绝对 px 距离同比缩放,不能只改外框 */
  const sizeStyle = computed(() => {
    const s = props.size
    const k = s / 140
    return {
      '--orb-size': `${s}px`,
      '--orb-k': String(k)
    }
  })

  /** 本界域的法球态:环数、粒子数、八卦环的有无 */
  const form = computed(() => orbForm(props.major))
  const ringCount = computed(() => orbRingIndexes(form.value).length)
  const particleCount = computed(() => orbParticleIndexes(form.value).length)

  const BAGUA = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷']
  const CIRCUMFERENCE = 2 * Math.PI * 54 // r=54

  const dashOffset = computed(() => CIRCUMFERENCE * (1 - Math.min(1, props.progress)))

  function particleStyle(index: number): Record<string, string> {
    // 角度按实际粒数均分:粒数随界域变,写死 /12 会让仙界之后挤成一侧
    const total = Math.max(1, particleCount.value)
    const angle = (index / total) * 360
    const delay = index * 0.3
    const duration = 3 + ((index * 0.37) % 2)
    const distance = 60 + ((index * 7) % 30)
    return {
      '--ang': `${angle}deg`,
      '--delay': `${delay}s`,
      '--dur': `${duration}s`,
      // 散布半径基线 60~90px,乘 --orb-k 随法球缩放
      '--dist': `calc((${distance}px) * var(--orb-k, 1))`
    }
  }
</script>

<style scoped>
  .orb-root {
    position: relative;
    width: var(--orb-size, 140px);
    height: var(--orb-size, 140px);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    /* 整颗球都是装饰:环、粒子、八卦环、进度环、中心符,没有一处可点。
       之前只给各层分别挂 pointer-events: none,漏了中心符那格 ——
       法球正压在首页最大的一块面积上,漏一层就可能吃掉底下的点击。 */
    pointer-events: none;
  }

  /* 外圈能量粒子 */
  .particle-ring {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .orb-particle {
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgb(var(--color-gold-ink-rgb) / 0.80) 0%,
      rgb(var(--color-cinnabar-rgb) / 0.50) 60%,
      transparent 100%
    );
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) rotate(var(--ang)) translateY(var(--dist));
    animation: orb-particle-float var(--dur) ease-in-out infinite;
    animation-delay: var(--delay);
    opacity: 0;
  }

  @keyframes orb-particle-float {
    0%,
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(var(--ang)) translateY(calc(var(--dist) + (14px * var(--orb-k, 1)))) scale(0.4);
    }
    50% {
      opacity: 0.8;
      transform: translate(-50%, -50%) rotate(var(--ang)) translateY(calc(var(--dist) - (6px * var(--orb-k, 1)))) scale(1);
    }
  }

  .cultivating .orb-particle {
    width: 5px;
    height: 5px;
    background: radial-gradient(circle, var(--color-gold-ink) 0%, var(--color-cinnabar) 60%, transparent 100%);
  }

  .cultivating .orb-particle,
  .breakthrough .orb-particle {
    animation-duration: 1.5s;
  }

  /* 三层反向旋转光环 */
  .ring-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .rot-ring {
    position: absolute;
    border-radius: 50%;
    border: 1px solid transparent;
    /*
     * 0.25 时最外两圈几乎看不见 —— 而「数得出圈数」正是这一层唯一要传达的东西。
     * 色本身已带 alpha,再乘一次基础透明度,最外一圈就落到 0.09,夜主题的深底上直接消失。
     * 由内到外仍递减(46% / 42% / 38% / 34%),但压在一个窄区间里:四圈都得看得见,
     * 「谁更重」只是第二件事。
     */
    opacity: 0.7;
    transition:
      opacity 0.4s ease,
      border-color 0.4s ease;
  }

  /*
   * 环数随界域变(见 ui/orbForm):人间界 1 圈、仙界 2 圈、神界 3 圈、混沌海 4 圈。
   *
   * 四圈全部落在法球方框**之内**:第一圈在内侧,每多一层就往外加一圈,第四圈贴到框边。
   * 先前把外圈写成负 inset(inset:-16px),圈会画到方框外 ——
   * 首页那张卡是 overflow-hidden 的,320px 下最外那圈会被切掉半截。
   *
   * 由内到外依次淡一档:多出来的圈是「又上一层」,不该与第一圈一样重。
   * 旋转方向交替 —— 四圈同向会看成一整片转动的圆盘。
   */
  .rot-ring--1 {
    inset: calc(20px * var(--orb-k, 1));
    border-color: rgb(var(--color-gold-ink-rgb) / 0.46);
    animation: rot-cw 20s linear infinite;
  }

  .rot-ring--2 {
    inset: calc(13px * var(--orb-k, 1));
    border-color: rgb(var(--color-jade-rgb) / 0.42);
    animation: rot-ccw 25s linear infinite;
  }

  .rot-ring--3 {
    inset: calc(6px * var(--orb-k, 1));
    border-color: rgb(var(--color-cinnabar-rgb) / 0.38);
    animation: rot-cw 30s linear infinite;
  }

  .rot-ring--4 {
    inset: 0;
    border-color: rgb(var(--color-violet-ink-rgb) / 0.34);
    animation: rot-ccw 36s linear infinite;
  }

  .rot-ring.bright {
    opacity: 0.65;
    border-width: 2px;
  }

  @keyframes rot-cw {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes rot-ccw {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(-360deg);
    }
  }

  /* 球体 */
  .orb-body {
    position: relative;
    z-index: 2;
    width: calc(68px * var(--orb-k, 1));
    height: calc(68px * var(--orb-k, 1));
    border-radius: 50%;
    border-radius: 50%;
    background: linear-gradient(
      135deg,
      rgb(var(--color-jade-rgb) / 0.30) 0%,
      rgb(var(--color-ink-rgb) / 0.40) 100%
    );
    border: 2px solid rgb(var(--color-gold-ink-rgb) / 0.40);
    box-shadow:
      inset 0 0 22px rgb(var(--color-ink-rgb) / 0.50),
      inset 0 0 10px rgb(var(--color-gold-ink-rgb) / 0.10),
      0 0 16px rgb(var(--color-jade-rgb) / 0.20);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    transition:
      border-color 0.3s ease,
      box-shadow 0.3s ease;
  }

  .orb-body.pulsing {
    border-color: rgb(var(--color-gold-ink-rgb) / 0.65);
    animation: orb-pulse 2s ease-in-out infinite;
  }

  @keyframes orb-pulse {
    0%,
    100% {
      box-shadow:
        inset 0 0 22px rgb(var(--color-ink-rgb) / 0.50),
        0 0 20px rgb(var(--color-gold-ink-rgb) / 0.30);
    }
    50% {
      box-shadow:
        inset 0 0 22px rgb(var(--color-ink-rgb) / 0.30),
        0 0 36px rgb(var(--color-gold-ink-rgb) / 0.55);
    }
  }

  /* 内圈轨道粒子 */
  .inner-orbit-ring {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .orbit-dot {
    position: absolute;
    width: 3px;
    height: 3px;
    background: rgb(var(--color-gold-ink-rgb) / 0.80);
    border-radius: 50%;
    left: 50%;
    top: 50%;
    animation: inner-orbit 4s linear infinite;
    animation-delay: calc(var(--i) * -0.65s);
  }

  @keyframes inner-orbit {
    0% {
      transform: translate(-50%, -50%) rotate(0deg) translateX(calc(20px * var(--orb-k, 1))) scale(0.5);
      opacity: 0.3;
    }
    50% {
      transform: translate(-50%, -50%) rotate(180deg) translateX(calc(24px * var(--orb-k, 1))) scale(1);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -50%) rotate(360deg) translateX(calc(20px * var(--orb-k, 1))) scale(0.5);
      opacity: 0.3;
    }
  }

  .cultivating .orbit-dot {
    animation-duration: 2s;
    width: 4px;
    height: 4px;
  }

  /* 中心图标 */
  .orb-icon {
    position: relative;
    z-index: 3;
    font-size: 1.5rem;
    color: var(--color-gold-ink);
    filter: drop-shadow(0 0 6px rgb(var(--color-gold-ink-rgb) / 0.55));
    animation: icon-float 3s ease-in-out infinite;
  }

  @keyframes icon-float {
    0%,
    100% {
      transform: translateY(0) scale(1);
    }
    50% {
      transform: translateY(-2px) scale(1.06);
    }
  }

  /* SVG 进度环 */
  .progress-svg {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
    pointer-events: none;
    border-radius: 50%;
  }

  .prog-bg {
    fill: none;
    stroke: rgb(var(--color-jade-rgb) / 0.20);
    stroke-width: 4;
  }

  .prog-bar {
    fill: none;
    stroke: url(#orbGrad);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-dasharray: 339.292;
    transition: stroke-dashoffset 0.5s ease;
    filter: drop-shadow(0 0 3px rgb(var(--color-jade-rgb) / 0.40));
  }

  .prog-bar.full {
    stroke: var(--color-gold-ink);
    animation: ring-glow 2s ease-in-out infinite;
    filter: drop-shadow(0 0 7px rgb(var(--color-gold-ink-rgb) / 0.65));
  }

  @keyframes ring-glow {
    0%,
    100% {
      filter: drop-shadow(0 0 4px rgb(var(--color-gold-ink-rgb) / 0.40));
    }
    50% {
      filter: drop-shadow(0 0 12px rgb(var(--color-gold-ink-rgb) / 0.80));
    }
  }

  /* 八卦符文 */
  .bagua-wrap {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .bagua-sym {
    position: absolute;
    left: 50%;
    top: 50%;
    font-size: calc(10px * var(--orb-k, 1));
    color: rgb(var(--color-gold-ink-rgb) / 0.28);
    transform: translate(-50%, -50%) rotate(var(--ang)) translateY(calc(-72px * var(--orb-k, 1))) rotate(calc(-1 * var(--ang)));
    transition: color 0.3s ease;
  }

  .bagua-wrap .bagua-sym {
    color: rgb(var(--color-gold-ink-rgb) / 0.65);
    text-shadow: 0 0 8px rgb(var(--color-gold-ink-rgb) / 0.50);
  }

  /* 突破就绪:额外缩放呼吸 */
  .breakthrough .orb-body {
    animation: orb-breakthrough 3s ease-in-out infinite;
  }

  @keyframes orb-breakthrough {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.04);
    }
  }
</style>
