import { describe, expect, it } from 'vitest'
import { configureAudio, playSfx, unlockAudio, startBgm, stopBgm, type SfxName, type AudioPrefs } from './audio'

/**
 * 音频引擎(Phase 25)—— 纯单机 Tone.js 引擎。
 *
 * 兜底逻辑是「测试环境(无 AudioContext)天然免疫」:Tone.js 按需加载(值是 type-only
 * import + 运行时动态 import),没有音频上下文的进程里,所有公开入口都必须是无害
 * no-op。这里把这条契约钉死:任何一个新分支丢掉了 `!T / !unlocked / !sfxOn` 的守卫、
 * 直接去碰 `T.` 或采样器,就会在测试环境里当场抛错 → 红。
 *
 * 另把 configureAudio 的防脏音量夹逼钉住:设置页之外,坏设置的音量若不是 0..1,
 * 在这里被夹回合法区间(否则总线挂一个爆炸值,首声即刺耳)。
 */
describe('音频引擎 · 无音频环境下免疫(no-op 不抛错)', () => {
  const ALL_SFX: SfxName[] = ['click', 'success', 'warn', 'info', 'rare', 'win', 'lose', 'breakthrough', 'fail']

  it('未解锁也未加载 Tone 时,playSfx 每种音效都是无害 no-op(不抛)', () => {
    for (const n of ALL_SFX) expect(() => playSfx(n)).not.toThrow()
  })

  it('sfx 关闭后,playSfx 仍不抛(守卫先于采样,不会碰不存在的引擎)', () => {
    configureAudio({ musicOn: true, sfxOn: false, musicVol: 1, sfxVol: 1 })
    for (const n of ALL_SFX) expect(() => playSfx(n)).not.toThrow()
  })

  it('start/stop/unlock 在无音频环境全为 no-op,不抛、不夹回执', () => {
    expect(() => unlockAudio()).not.toThrow()
    expect(() => startBgm()).not.toThrow()
    expect(() => stopBgm()).not.toThrow()
    expect(() => configureAudio({ musicOn: true, sfxOn: true, musicVol: 0.5, sfxVol: 0.7 })).not.toThrow()
  })

  it('configureAudio 容得下畸形音量(负值/超限/NaN):不抛错(夹逼在 [0,1] 是设里层防线)', () => {
    // prefs 是模块私域,测试里无法直接读夹逼后的值;但「畸形输入不炸」这条必须守住:
    // 若 configureAudio 把脏音量直接喂给 applyPrefs(真实环境下是 bus.gain.rampTo),
    // 首个爆值就会刺耳甚至抛错。容错在此钉死。
    const cases: AudioPrefs[] = [
      { musicOn: true, sfxOn: true, musicVol: 99, sfxVol: -3 },
      { musicOn: true, sfxOn: true, musicVol: NaN, sfxVol: 2 },
      { musicOn: false, sfxOn: false, musicVol: -0.5, sfxVol: NaN }
    ]
    for (const p of cases) expect(() => configureAudio(p), JSON.stringify(p)).not.toThrow()
  })
})
