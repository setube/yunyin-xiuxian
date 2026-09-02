<template>
  <Teleport to="body">
    <Transition name="reveal">
      <div v-if="visible" class="root-overlay">
        <!-- 背景光晕 -->
        <div class="root-bg-orb root-bg-1" />
        <div class="root-bg-orb root-bg-2" />

        <!-- 上升粒子(灵根探查的气息) -->
        <div v-if="animating" class="root-particles">
          <div v-for="i in 20" :key="i" class="root-particle" />
        </div>

        <!-- 检测中心:三层反向旋转光环 + 核心 -->
        <div class="root-orb" :class="{ animating: animating }">
          <div class="root-core">
            <!-- 轮换期间显灵根名,定格后显真实灵根 -->
            <span class="root-name" :style="{ color: currentColor }">{{ currentName }}</span>
          </div>
          <div class="root-ring ring-r1" />
          <div class="root-ring ring-r2" />
          <div class="root-ring ring-r3" />
        </div>

        <!-- 检测文字 -->
        <div v-if="animating" class="root-text">
          <p class="root-title">正在测定灵根……</p>
          <p class="root-temp" :style="{ color: currentColor }">{{ currentName }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'

  const visible = ref(false)
  const animating = ref(false)

  /**
   * 灵根品阶全集(与 linggenGen.ts 的 gradeName 取值一致):
   * 轮换期间从所有品阶随机闪现,结束时定格真实灵根
   */
  const GRADES: { name: string; color: string }[] = [
    { name: '杂灵根', color: '#857f70' },
    { name: '伪灵根', color: '#857f70' },
    { name: '真灵根', color: '#6e8b74' },
    { name: '上灵根', color: '#4f7699' },
    { name: '异灵根', color: '#7b5ea7' },
    { name: '变异灵根', color: '#7b5ea7' },
    { name: '天灵根', color: '#c9a227' },
    { name: '混沌灵根', color: '#a83f39' }
  ]

  /** 当前轮换位置(轮换中随机,结束时定格为真实灵根;必须用 ref 才能触发 computed 重算) */
  const cycleIdx = ref(0)
  let timer: ReturnType<typeof setInterval> | null = null

  const currentName = computed(() => (animating.value ? (GRADES[cycleIdx.value]?.name ?? '?') : realName))
  const currentColor = computed(() => (animating.value ? (GRADES[cycleIdx.value]?.color ?? '#c9a959') : realColor))

  /** 真实灵根(结束时定格显示) */
  let realName = '?'
  let realColor = '#c9a959'

  /** 展示灵根鉴定动画:随机闪现所有灵根品阶,结束时定格真实 gradeName */
  function show(gradeName: string, onDone?: () => void): void {
    realName = gradeName
    // 灵根品阶越高颜色越亮(从 GRADES 里找真实灵根对应的颜色)
    realColor = GRADES.find(g => g.name === gradeName)?.color ?? '#c9a959'
    visible.value = true
    animating.value = true
    // 随机闪现所有灵根品阶(100ms 一次,约 20 次后显出真容)
    timer = setInterval(() => {
      cycleIdx.value = Math.floor(Math.random() * GRADES.length)
    }, 100)
    setTimeout(() => {
      if (timer) clearInterval(timer)
      // 定格:显示真实灵根(animating=false 后 currentName 取 realName)
      animating.value = false
      setTimeout(() => {
        visible.value = false
        onDone?.()
      }, 400)
    }, 2200)
  }

  defineExpose({ show })
</script>

<style>
  /* 灵根鉴定全屏特效 */
  .root-overlay {
    position: fixed;
    inset: 0;
    z-index: 9998;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: radial-gradient(ellipse at center, rgba(41, 39, 34, 0.96) 0%, rgba(15, 13, 11, 0.99) 100%);
    pointer-events: none;
  }

  .root-bg-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    opacity: 0.18;
    pointer-events: none;
  }

  .root-bg-1 {
    width: 340px;
    height: 340px;
    background: rgba(168, 63, 57, 0.6);
    top: -80px;
    right: -40px;
    animation: root-float 10s ease-in-out infinite;
  }

  .root-bg-2 {
    width: 280px;
    height: 280px;
    background: rgba(79, 118, 153, 0.5);
    bottom: -60px;
    left: -50px;
    animation: root-float 12s ease-in-out infinite reverse;
  }

  @keyframes root-float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-30px);
    }
  }

  /* 上升粒子(灵根探查气息,自底部缓缓升腾) */
  .root-particles {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .root-particle {
    position: absolute;
    bottom: 0;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--color-gold-ink, #c9a959) 0%, transparent 100%);
    opacity: 0;
    animation: root-particle-rise 2s ease-out infinite;
  }

  /* 20 颗粒子:均匀散布 + 相位错开(用 nth-child 定位,同源文件) */
  .root-particle:nth-child(1) {
    left: 10%;
    animation-delay: 0s;
  }
  .root-particle:nth-child(2) {
    left: 20%;
    animation-delay: 0.2s;
  }
  .root-particle:nth-child(3) {
    left: 30%;
    animation-delay: 0.4s;
  }
  .root-particle:nth-child(4) {
    left: 40%;
    animation-delay: 0.1s;
  }
  .root-particle:nth-child(5) {
    left: 50%;
    animation-delay: 0.3s;
  }
  .root-particle:nth-child(6) {
    left: 60%;
    animation-delay: 0.5s;
  }
  .root-particle:nth-child(7) {
    left: 70%;
    animation-delay: 0.15s;
  }
  .root-particle:nth-child(8) {
    left: 80%;
    animation-delay: 0.35s;
  }
  .root-particle:nth-child(9) {
    left: 90%;
    animation-delay: 0.25s;
  }
  .root-particle:nth-child(10) {
    left: 15%;
    animation-delay: 0.45s;
  }
  .root-particle:nth-child(11) {
    left: 25%;
    animation-delay: 0.55s;
  }
  .root-particle:nth-child(12) {
    left: 35%;
    animation-delay: 0.05s;
  }
  .root-particle:nth-child(13) {
    left: 45%;
    animation-delay: 0.65s;
  }
  .root-particle:nth-child(14) {
    left: 55%;
    animation-delay: 0.75s;
  }
  .root-particle:nth-child(15) {
    left: 65%;
    animation-delay: 0.85s;
  }
  .root-particle:nth-child(16) {
    left: 75%;
    animation-delay: 0.95s;
  }
  .root-particle:nth-child(17) {
    left: 85%;
    animation-delay: 0.12s;
  }
  .root-particle:nth-child(18) {
    left: 95%;
    animation-delay: 0.22s;
  }
  .root-particle:nth-child(19) {
    left: 5%;
    animation-delay: 0.32s;
  }
  .root-particle:nth-child(20) {
    left: 50%;
    animation-delay: 0.42s;
  }

  @keyframes root-particle-rise {
    0% {
      bottom: 0;
      opacity: 0;
    }
    20% {
      opacity: 1;
    }
    100% {
      bottom: 100%;
      opacity: 0;
    }
  }

  /* 检测光球 */
  .root-orb {
    position: relative;
    width: 190px;
    height: 190px;
    margin-bottom: 30px;
  }

  .root-core {
    position: absolute;
    inset: 40px;
    background: rgba(37, 33, 23, 0.9);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--color-gold-ink, #c9a959);
    z-index: 2;
  }

  .root-name {
    font-family: var(--font-kai);
    font-size: 1.3rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    white-space: nowrap;
    transition: color 0.1s;
  }

  .root-ring {
    position: absolute;
    border: 1px solid var(--color-gold-ink, #c9a959);
    border-radius: 50%;
    opacity: 0.5;
  }

  .ring-r1 {
    inset: 0;
    animation: root-ring-rotate 3s linear infinite;
  }

  .ring-r2 {
    inset: 15px;
    animation: root-ring-rotate 4s linear infinite reverse;
  }

  .ring-r3 {
    inset: 30px;
    animation: root-ring-rotate 5s linear infinite;
  }

  .root-orb.animating .root-core {
    animation: root-pulse 0.5s ease-in-out infinite;
  }

  .root-orb.animating .root-ring {
    animation-duration: 0.5s;
  }

  @keyframes root-ring-rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes root-pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.06);
    }
  }

  /* 文字 */
  .root-text {
    text-align: center;
  }

  .root-title {
    font-family: var(--font-kai);
    font-size: 1rem;
    letter-spacing: 0.4em;
    color: #b9b2a0;
    margin: 0;
  }

  .root-temp {
    font-size: 1.6rem;
    font-weight: 700;
    margin-top: 10px;
    transition: color 0.1s;
  }

  /* 过渡 */
  .reveal-enter-active {
    animation: reveal-in 0.5s ease-out;
  }

  .reveal-leave-active {
    animation: reveal-out 0.4s ease-in;
  }

  @keyframes reveal-in {
    0% {
      opacity: 0;
      transform: scale(0.85);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes reveal-out {
    0% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
</style>
