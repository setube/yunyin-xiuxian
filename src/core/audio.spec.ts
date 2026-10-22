import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  configureAudio,
  disposeAudio,
  playSfx,
  unlockAudio,
  startBgm,
  stopBgm,
  type SfxName,
  type AudioPrefs
} from './audio'

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

/**
 * 音频接线生命周期 —— 初始化异步完成、页面已切后台、宿主已卸载这三种时机
 * 都发生在 Tone 加载之后。旧实现把可见性监听写成匿名函数,App 卸载也只 stopBgm,
 * 于是监听永远留在 document 上,加载期间切后台还会在后台起乐。
 *
 * 这里用最小 Tone 桩把 init 完整跑一遍:采样器/总线都是 no-op,只观察
 * Transport.start 与 pause 的调用时机。故障注入:删掉 startBgm 的 hidden 守卫,
 * 或把命名监听改回匿名并去掉 disposeAudio 的 removeEventListener,对应用例转红。
 */
describe('音频引擎 · 可见性与销毁', () => {
  type Listener = () => void
  const listeners = new Map<string, Set<Listener>>()
  const transport = {
    started: 0,
    paused: 0,
    bpm: { value: 0 },
    loop: false,
    loopStart: 0,
    loopEnd: '',
    start: vi.fn(() => {
      transport.started += 1
    }),
    pause: vi.fn(() => {
      transport.paused += 1
    }),
    stop: vi.fn()
  }
  const audioDocument = {
    visibilityState: 'visible',
    addEventListener: vi.fn((type: string, listener: Listener) => {
      const set = listeners.get(type) ?? new Set<Listener>()
      set.add(listener)
      listeners.set(type, set)
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener)
    })
  }
  const audioWindow = { AudioContext: function AudioContext() {} }

  function installAudioEnvironment(): void {
    listeners.clear()
    transport.started = 0
    transport.paused = 0
    transport.start.mockClear()
    transport.pause.mockClear()
    transport.stop.mockClear()
    vi.stubGlobal('window', audioWindow)
    vi.stubGlobal('document', audioDocument)
  }

  async function loadAudioWithToneStub(loaded: () => Promise<void> = () => Promise.resolve()): Promise<typeof import('./audio')> {
    vi.resetModules()
    vi.doMock('tone', () => ({
      Gain: class {
        gain = { rampTo: () => undefined }
        toDestination(): this {
          return this
        }
        connect(): this {
          return this
        }
      },
      Reverb: class {
        ready = Promise.resolve()
        connect(): this {
          return this
        }
      },
      Sampler: class {
        connect(): this {
          return this
        }
        triggerAttackRelease(): void {}
      },
      Synth: class {
        connect(): this {
          return this
        }
        triggerAttackRelease(): void {}
      },
      EQ3: class {
        connect(): this {
          return this
        }
      },
      Part: class {
        humanize = 0
        start(): void {}
      },
      Frequency: () => ({ toFrequency: () => 440 }),
      loaded,
      getTransport: () => transport,
      now: () => 0,
      start: () => Promise.resolve()
    }))
    return import('./audio')
  }

  function fireVisibility(state: string): void {
    audioDocument.visibilityState = state
    for (const listener of [...(listeners.get('visibilitychange') ?? [])]) listener()
  }

  afterEach(() => {
    disposeAudio()
    vi.unstubAllGlobals()
  })

  it('加载期间切后台:初始化完成不在后台起乐;回前台才起', async () => {
    installAudioEnvironment()
    const mod = await loadAudioWithToneStub()

    audioDocument.visibilityState = 'hidden'
    mod.unlockAudio()
    await vi.waitFor(() => expect(audioDocument.addEventListener).toHaveBeenCalled())
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(transport.started, '加载期间已在后台,初始化完成不该起乐').toBe(0)
    fireVisibility('visible')
    expect(transport.started, '回前台应补起背景乐').toBe(1)
  })

  it('disposeAudio 撤掉可见性监听,卸载后事件不再碰 Transport', async () => {
    installAudioEnvironment()
    const mod = await loadAudioWithToneStub()
    audioDocument.visibilityState = 'visible'
    mod.unlockAudio()
    await vi.waitFor(() => expect(listeners.get('visibilitychange')?.size).toBe(1))

    mod.disposeAudio()
    expect(listeners.get('visibilitychange')?.size ?? 0, '销毁后不该留下可见性监听').toBe(0)
    const before = transport.started
    fireVisibility('hidden')
    fireVisibility('visible')
    expect(transport.started, '监听已撤,可见性事件不该再起乐').toBe(before)
  })

  it('加载途中卸载:旧初始化完成后不装监听、不起乐,重新挂载仍能正常初始化', async () => {
    installAudioEnvironment()
    let releaseLoaded!: () => void
    let markLoadedStarted!: () => void
    const loadedStarted = new Promise<void>(resolve => {
      markLoadedStarted = resolve
    })
    const loadedGate = new Promise<void>(resolve => {
      releaseLoaded = resolve
    })
    const mod = await loadAudioWithToneStub(() => {
      markLoadedStarted()
      return loadedGate
    })

    mod.unlockAudio()
    await loadedStarted
    mod.disposeAudio()
    releaseLoaded()
    // 让旧 init 的 await、then 与 finally 全部走完
    for (let i = 0; i < 6; i += 1) await Promise.resolve()

    expect(listeners.get('visibilitychange')?.size ?? 0, '已销毁的初始化不许再装监听').toBe(0)
    expect(transport.started, '已销毁的初始化不许起乐').toBe(0)

    mod.unlockAudio()
    await vi.waitFor(() => expect(listeners.get('visibilitychange')?.size).toBe(1))
    expect(transport.started, '重新挂载后应由新初始化正常起乐').toBe(1)
  })
})
