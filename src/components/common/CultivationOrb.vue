<template>
  <!-- 修炼法球:三层反向旋转环 + 外圈能量粒子 + 八卦符文 + SVG 进度环 + 内圈轨道粒子 配色改为水墨朱砂金 -->
  <div class="orb-root" :class="{ cultivating: active, breakthrough: full }">
    <!-- 背景能量粒子(外圈,12 颗,随相位散布) -->
    <div class="particle-ring">
      <div v-for="i in 12" :key="i" class="orb-particle" :style="particleStyle(i)" />
    </div>

    <!-- 三层反向旋转光环 -->
    <div class="ring-layer">
      <div class="rot-ring ring-a" :class="{ bright: active }" />
      <div class="rot-ring ring-b" :class="{ bright: active }" />
      <div class="rot-ring ring-c" :class="{ bright: full }" />
    </div>

    <!-- 球体本体 -->
    <div class="orb-body" :class="{ pulsing: active }">
      <!-- 内部六颗轨道粒子 -->
      <div class="inner-orbit-ring">
        <span v-for="i in 6" :key="i" class="orbit-dot" :style="{ '--i': i }" />
      </div>
      <!-- 中心图标 -->
      <span class="orb-icon"><slot>◎</slot></span>
    </div>

    <!-- SVG 修为进度环 -->
    <svg class="progress-svg" viewBox="0 0 120 120">
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

    <!-- 八卦符文 -->
    <div class="bagua-wrap spinning">
      <span v-for="(sym, i) in BAGUA" :key="i" class="bagua-sym" :style="{ '--ang': i * 45 + 'deg' }">{{ sym }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  const props = defineProps<{
    /** 修炼激活(加速粒子/点亮光环) */
    active: boolean
    /** 修为圆满(突破就绪) */
    full: boolean
    /** 进度 0~1(控制 SVG 环) */
    progress: number
  }>()

  const BAGUA = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷']
  const CIRCUMFERENCE = 2 * Math.PI * 54 // r=54

  const dashOffset = computed(() => CIRCUMFERENCE * (1 - Math.min(1, props.progress)))

  function particleStyle(index: number): Record<string, string> {
    const angle = (index / 12) * 360
    const delay = index * 0.3
    const duration = 3 + ((index * 0.37) % 2)
    const distance = 60 + ((index * 7) % 30)
    return {
      '--ang': `${angle}deg`,
      '--delay': `${delay}s`,
      '--dur': `${duration}s`,
      '--dist': `${distance}px`
    }
  }
</script>

<style scoped>
  .orb-root {
    position: relative;
    width: 140px;
    height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
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
      transform: translate(-50%, -50%) rotate(var(--ang)) translateY(calc(var(--dist) + 14px)) scale(0.4);
    }
    50% {
      opacity: 0.8;
      transform: translate(-50%, -50%) rotate(var(--ang)) translateY(calc(var(--dist) - 6px)) scale(1);
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
    opacity: 0.25;
    transition:
      opacity 0.4s ease,
      border-color 0.4s ease;
  }

  .ring-a {
    inset: 10px;
    border-color: rgb(var(--color-gold-ink-rgb) / 0.40);
    animation: rot-cw 20s linear infinite;
  }

  .ring-b {
    inset: 2px;
    border-color: rgb(var(--color-jade-rgb) / 0.30);
    animation: rot-ccw 25s linear infinite;
  }

  .ring-c {
    inset: -8px;
    border-color: rgb(var(--color-violet-ink-rgb) / 0.20);
    animation: rot-cw 30s linear infinite;
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
    width: 68px;
    height: 68px;
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
      transform: translate(-50%, -50%) rotate(0deg) translateX(20px) scale(0.5);
      opacity: 0.3;
    }
    50% {
      transform: translate(-50%, -50%) rotate(180deg) translateX(24px) scale(1);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -50%) rotate(360deg) translateX(20px) scale(0.5);
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
    font-size: 10px;
    color: rgb(var(--color-gold-ink-rgb) / 0.28);
    transform: translate(-50%, -50%) rotate(var(--ang)) translateY(-72px) rotate(calc(-1 * var(--ang)));
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
