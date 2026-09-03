<template>
  <Teleport to="body">
    <Transition name="warp">
      <div v-if="visible" class="warp-overlay">
        <!-- 星辰:朱砂金粒子自中心散射 -->
        <div class="warp-star-field">
          <span v-for="i in STAR_COUNT" :key="i" class="warp-star" :style="starStyle(i)" />
        </div>
        <!-- 速度线:放射状金色光线 -->
        <div class="warp-speed-lines">
          <span v-for="i in LINE_COUNT" :key="i" class="warp-speed-line" :style="lineStyle(i)" />
        </div>
        <!-- 中心光圈:三层同心圆 + 光核 -->
        <div class="warp-center">
          <div class="warp-ring warp-ring-1" />
          <div class="warp-ring warp-ring-2" />
          <div class="warp-ring warp-ring-3" />
          <div class="warp-core" />
        </div>
        <!-- 文字 -->
        <div class="warp-text">
          <p class="warp-title">{{ title }}</p>
          <p class="warp-subtitle">{{ subtitle }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { ref } from 'vue'

  const visible = ref(false)

  const STAR_COUNT = 60
  const LINE_COUNT = 28

  const title = ref('云深不知处')
  const subtitle = ref('一念修行 · 仙路自此始')

  /** 显示传送门(约 2.6s 后自动隐藏,供路由跳转衔接) */
  function show(opts?: { title?: string; subtitle?: string }): void {
    title.value = opts?.title ?? '云深不知处'
    subtitle.value = opts?.subtitle ?? '一念修行 · 仙路自此始'
    visible.value = true
  }

  function hide(): void {
    visible.value = false
  }

  defineExpose({ show, hide })

  /** 星辰样式:均匀角度 + 随机距离 / 大小 / 延迟 / 时长 */
  function starStyle(index: number): Record<string, string> {
    const angle = (index / STAR_COUNT) * 360
    const distance = 20 + Math.random() * 80
    const size = 1 + Math.random() * 2
    const delay = Math.random() * 0.5
    const duration = 0.8 + Math.random() * 0.4
    return {
      '--angle': `${angle}deg`,
      '--distance': `${distance}%`,
      '--size': `${size}px`,
      '--delay': `${delay}s`,
      '--duration': `${duration}s`
    }
  }

  /** 速度线样式:均匀角度 + 随机长度 / 延迟 */
  function lineStyle(index: number): Record<string, string> {
    const angle = (index / LINE_COUNT) * 360
    const length = 100 + Math.random() * 200
    const delay = Math.random() * 0.3
    return {
      '--angle': `${angle}deg`,
      '--length': `${length}px`,
      '--delay': `${delay}s`
    }
  }
</script>

<style>
  /* 全屏穿梭效果
     注意:Teleport 到 body 层级,scoped 会失效,故全局作用域 */
  .warp-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: radial-gradient(ellipse at center, #1a1812 0%, #000 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  /* 星空背景 */
  .warp-overlay .warp-star-field {
    position: absolute;
    inset: 0;
    perspective: 500px;
  }

  .warp-overlay .warp-star {
    position: absolute;
    width: var(--size);
    height: var(--size);
    background: #fff;
    border-radius: 50%;
    left: 50%;
    top: 50%;
    transform-origin: center;
    animation: warp-star-move var(--duration) ease-in infinite;
    animation-delay: var(--delay);
    box-shadow: 0 0 6px 2px rgba(201, 169, 89, 0.6);
  }

  @keyframes warp-star-move {
    0% {
      transform: rotate(var(--angle)) translateY(0) scale(0);
      opacity: 0;
    }
    10% {
      opacity: 1;
      transform: rotate(var(--angle)) translateY(10px) scale(1);
    }
    100% {
      transform: rotate(var(--angle)) translateY(calc(var(--distance) * 5)) scale(2);
      opacity: 0;
    }
  }

  /* 速度线条 */
  .warp-overlay .warp-speed-lines {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .warp-overlay .warp-speed-line {
    position: absolute;
    width: 2px;
    height: var(--length);
    background: linear-gradient(
      to bottom,
      transparent,
      rgba(201, 169, 89, 0.8),
      rgba(255, 255, 255, 0.9),
      rgba(201, 169, 89, 0.8),
      transparent
    );
    left: 50%;
    top: 50%;
    transform-origin: top center;
    transform: rotate(var(--angle)) translateY(60px);
    animation:
      warp-line-appear 0.5s ease-out forwards,
      warp-line-extend 2s ease-in forwards;
    animation-delay: var(--delay), calc(var(--delay) + 0.3s);
    opacity: 0;
  }

  @keyframes warp-line-appear {
    0% {
      opacity: 0;
      height: 0;
    }
    100% {
      opacity: 1;
      height: var(--length);
    }
  }

  @keyframes warp-line-extend {
    0% {
      transform: rotate(var(--angle)) translateY(60px) scaleY(1);
    }
    100% {
      transform: rotate(var(--angle)) translateY(200px) scaleY(3);
    }
  }

  /* 中心光圈 */
  .warp-overlay .warp-center {
    position: absolute;
    width: 200px;
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .warp-overlay .warp-ring {
    position: absolute;
    border: 2px solid rgba(201, 169, 89, 0.6);
    border-radius: 50%;
    animation: warp-ring-pulse 1.5s ease-in-out infinite;
  }

  .warp-ring-1 {
    width: 100%;
    height: 100%;
    animation-delay: 0s;
  }

  .warp-ring-2 {
    width: 70%;
    height: 70%;
    animation-delay: 0.3s;
  }

  .warp-ring-3 {
    width: 40%;
    height: 40%;
    animation-delay: 0.6s;
  }

  @keyframes warp-ring-pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.6;
      border-color: rgba(201, 169, 89, 0.6);
    }
    50% {
      transform: scale(1.1);
      opacity: 1;
      border-color: rgba(201, 169, 89, 1);
    }
  }

  .warp-overlay .warp-core {
    width: 30px;
    height: 30px;
    background: radial-gradient(circle, #fff 0%, rgba(201, 169, 89, 0.8) 50%, transparent 100%);
    border-radius: 50%;
    animation: warp-core-glow 0.5s ease-in-out infinite alternate;
    box-shadow: 0 0 40px 20px rgba(201, 169, 89, 0.5);
  }

  @keyframes warp-core-glow {
    0% {
      transform: scale(1);
      box-shadow: 0 0 40px 20px rgba(201, 169, 89, 0.5);
    }
    100% {
      transform: scale(1.2);
      box-shadow: 0 0 60px 30px rgba(201, 169, 89, 0.8);
    }
  }

  /* 文字提示 */
  .warp-overlay .warp-text {
    position: absolute;
    bottom: 25%;
    text-align: center;
    z-index: 10;
    animation: warp-text-in 0.8s ease-out 0.5s forwards;
    opacity: 0;
  }

  @keyframes warp-text-in {
    0% {
      opacity: 0;
      transform: translateY(20px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .warp-title {
    font-family: var(--font-kai);
    font-size: 1.8rem;
    font-weight: 700;
    color: #c9a959;
    margin: 0 0 12px;
    letter-spacing: 8px;
    text-shadow: 0 0 30px rgba(201, 169, 89, 0.8);
  }

  .warp-subtitle {
    font-size: 0.9rem;
    color: #a0a0a0;
    margin: 0;
    letter-spacing: 4px;
    animation: warp-subtitle-pulse 1s ease-in-out infinite;
  }

  @keyframes warp-subtitle-pulse {
    0%,
    100% {
      opacity: 0.7;
    }
    50% {
      opacity: 1;
    }
  }

  /* 过渡动画
     遮罩层只淡入,绝不加 transform:它是 position:fixed + inset:0 的全屏底板,
     一旦 scale 就会先缩成视口的一小块、四周露出底下的页面,再撑满——
     看起来是「黑底放大」而不是「直接显示」。缩放挪到内部的中心光圈上 */
  .warp-enter-active {
    animation: warp-in 0.4s ease-out;
  }

  .warp-enter-active .warp-center {
    animation: warp-center-in 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .warp-leave-active {
    animation: warp-out 0.3s ease-in;
  }

  @keyframes warp-in {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  @keyframes warp-center-in {
    0% {
      transform: scale(0.8);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes warp-out {
    0% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
</style>
