/**
 * 穿梭传送门的粒子快照。
 *
 * 随机距离、大小与延迟只在 show() 时取一次。若把它们留在模板的 style 绑定里,
 * 父组件任何一次重渲染都会重掷,正在播放的粒子会突然跳位。
 */
export interface WarpParticleStyles {
  stars: Record<string, string>[]
  lines: Record<string, string>[]
}

export function buildWarpParticleStyles(
  starCount: number,
  lineCount: number,
  random: () => number = Math.random
): WarpParticleStyles {
  const stars = Array.from({ length: starCount }, (_, i) => {
    const angle = ((i + 1) / starCount) * 360
    const distance = 20 + random() * 80
    const size = 1 + random() * 2
    const delay = random() * 0.5
    const duration = 0.8 + random() * 0.4
    return {
      '--angle': `${angle}deg`,
      '--distance': `${distance}%`,
      '--size': `${size}px`,
      '--delay': `${delay}s`,
      '--duration': `${duration}s`
    }
  })

  const lines = Array.from({ length: lineCount }, (_, i) => {
    const angle = ((i + 1) / lineCount) * 360
    const length = 100 + random() * 200
    const delay = random() * 0.3
    return {
      '--angle': `${angle}deg`,
      '--length': `${length}px`,
      '--delay': `${delay}s`
    }
  })

  return { stars, lines }
}
