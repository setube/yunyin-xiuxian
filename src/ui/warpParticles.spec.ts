import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { buildWarpParticleStyles } from './warpParticles'

describe('穿梭传送门粒子快照', () => {
  it('星辰与速度线按数量各生成一份,角度均匀铺满一圈', () => {
    const { stars, lines } = buildWarpParticleStyles(60, 28, () => 0.5)
    expect(stars).toHaveLength(60)
    expect(lines).toHaveLength(28)
    expect(stars[0]?.['--angle']).toBe('6deg')
    expect(stars[59]?.['--angle']).toBe('360deg')
    const lastLineAngle = Number.parseFloat(lines[27]?.['--angle'] ?? '')
    expect(lastLineAngle).toBeCloseTo(360, 10)
  })

  it('随机数只在构建快照时消费:60 星 28 线恰好 296 次', () => {
    const random = vi.fn(() => 0.25)
    buildWarpParticleStyles(60, 28, random)
    expect(random).toHaveBeenCalledTimes(60 * 4 + 28 * 2)
  })

  it('组件只在 show() 构建一次,模板不再按渲染重掷', () => {
    const src = readFileSync(resolve(__dirname, '../components/common/WarpPortal.vue'), 'utf8')
    expect(src, '模板应读预生成快照').toMatch(/:style="style"/)
    expect(src, '展示时生成一次').toContain('buildWarpParticleStyles(STAR_COUNT, LINE_COUNT)')
    expect(src.match(/buildWarpParticleStyles\(/g), '构建点只该有一个').toHaveLength(1)
    expect(src, '模板绑定里不许再调随机样式函数').not.toMatch(/:style="(?:starStyle|lineStyle)\(/)
    expect(src, '组件自身不许在渲染路径取随机数').not.toContain('Math.random()')
    expect(src, '约 2.6 秒后自己收起,路由失败也不困在黑场').toContain('hideTimer = setTimeout(hide, 2600)')
  })
})
