<template>
  <Teleport to="body">
    <Transition name="reveal">
      <div v-if="visible" class="root-overlay">
        <!-- 背景光晕 -->
        <div class="root-bg-orb root-bg-1" />
        <div class="root-bg-orb root-bg-2" />

        <div v-if="animating" class="root-particles">
          <div v-for="i in 20" :key="i" class="root-particle" />
        </div>

        <div class="root-orb" :class="{ animating: animating }">
          <div class="root-core">
            <span class="root-name" :style="{ color: currentColor }">{{ currentName }}</span>
          </div>
          <div class="root-ring ring-r1" />
          <div class="root-ring ring-r2" />
          <div class="root-ring ring-r3" />
        </div>

        <div v-if="animating" class="root-text">
          <p class="root-title">正在测定灵根……</p>
          <p class="root-temp" :style="{ color: currentColor }">{{ currentName }}</p>
        </div>

        <!-- 读屏只播定格结果:单独 aria-live 区,不挂在轮换的可见 span 上 -->
        <span class="sr-only" role="status" aria-live="polite">{{ announcedName }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { ref, computed, onUnmounted, nextTick } from 'vue'
  import { useSettingsStore } from '@/stores/settings'
  import { gameClock } from '@/composables/useGameClock'

  const settings = useSettingsStore()

  const visible = ref(false)
  const animating = ref(false)
  /** 读屏播报文本:定格时才填入 */
  const announcedName = ref('')

  /** 设置「减少动效」或系统 prefers-reduced-motion 任一命中即跳过 2.2s 轮换 */
  function reducedMotionActive(): boolean {
    if (settings.reduceMotion) return true
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
  }

  /** 定格收尾:停轮换 → 显示真实灵根 → 淡出后回调 onDone(只回调一次) */
  function settle(onDone?: () => void): void {
    stopCycle?.()
    stopCycle = null
    animating.value = false
    // live 区先保持空内容,下一帧再填,确保触发播报
    void nextTick(() => {
      announcedName.value = realName
    })
    const leave = setTimeout(() => {
      visible.value = false
      if (!unmounted) onDone?.()
    }, 400)
    stopTimers = () => clearTimeout(leave)
  }

  /**
   * 灵根品阶全集,须与 linggenGen.ts 的 gradeName 取值一致。
   *
   * 配色六档走语义色 token,另两档用裸 hex —— 这两色不在色板里,是有意的:
   * 杂/伪用 #857f70(比 ink-faint 更灰的土色,以示「芜杂」),
   * 天灵根用 #c9a227(比 gold-ink 亮的金,与转场特效的金同源),
   * 都要与相邻档拉开距离才读得出品阶差。改这里请连带核 CIE76 可辨性。
   */
  const GRADES: { name: string; color: string }[] = [
    { name: '杂灵根', color: '#857f70' },
    { name: '伪灵根', color: '#857f70' },
    { name: '真灵根', color: 'var(--color-jade)' },
    { name: '上灵根', color: 'var(--color-azure)' },
    { name: '异灵根', color: 'var(--color-violet-ink)' },
    { name: '变异灵根', color: 'var(--color-violet-ink)' },
    { name: '天灵根', color: '#c9a227' },
    { name: '混沌灵根', color: 'var(--color-cinnabar)' }
  ]

  /** 当前轮换位置;须用 ref 才能触发 computed 重算 */
  const cycleIdx = ref(0)
  /** 轮换的收表函数 */
  let stopCycle: (() => void) | null = null
  let stopTimers: (() => void) | null = null
  /** 卸载后不再回填、不回调 onDone:防切路由后被 2200ms 定时器推回首页 */
  let unmounted = false

  const currentName = computed(() => (animating.value ? (GRADES[cycleIdx.value]?.name ?? '?') : realName))
  const currentColor = computed(() => (animating.value ? (GRADES[cycleIdx.value]?.color ?? '#c9a959') : realColor))

  /** 真实灵根 */
  let realName = '?'
  let realColor = '#c9a959'

  /** 灵根鉴定动画:随机闪现各品阶后定格 gradeName */
  function show(gradeName: string, onDone?: () => void): void {
    if (unmounted) return
    realName = gradeName
    realColor = GRADES.find(g => g.name === gradeName)?.color ?? '#c9a959'
    visible.value = true

    if (reducedMotionActive()) {
      settle(onDone)
      return
    }

    animating.value = true
    // 走 gameClock:心跳停着时轮换同停(与 useNow / 事件轮询同一出处)
    stopCycle = gameClock(() => {
      cycleIdx.value = Math.floor(Math.random() * GRADES.length)
    }, 100)
    const doneTimeout = setTimeout(() => {
      settle(onDone)
    }, 2200)
    stopTimers = () => {
      stopCycle?.()
      clearTimeout(doneTimeout)
    }
  }

  onUnmounted(() => {
    unmounted = true
    stopTimers?.()
  })

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

  /* 上升粒子 */
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

  /* 20 颗粒子:均匀散布 + 相位错开 */
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

  /* 过渡:遮罩层只淡入,不加 transform(全屏底板一缩放就露出底下页面);缩放放在检测光球上 */
  .reveal-enter-active {
    animation: reveal-in 0.4s ease-out;
  }

  .reveal-enter-active .root-orb {
    animation: reveal-orb-in 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .reveal-leave-active {
    animation: reveal-out 0.4s ease-in;
  }

  @keyframes reveal-in {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  @keyframes reveal-orb-in {
    0% {
      transform: scale(0.85);
    }
    100% {
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
