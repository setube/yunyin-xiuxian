/**
 * 音频引擎:Tone.js + FluidR3 乐器采样(本地文件)
 * Tone.js 与采样均按需加载:主包不含引擎,测试环境(无 AudioContext)天然免疫
 * 浏览器自动播放策略:必须在首次用户交互后 unlockAudio() 才会出声
 */
import type * as ToneNS from 'tone'

export type SfxName = 'click' | 'success' | 'warn' | 'info' | 'rare' | 'treasure' | 'win' | 'lose' | 'breakthrough' | 'fail'

export interface AudioPrefs {
  musicOn: boolean
  sfxOn: boolean
  /** 0~1 */
  musicVol: number
  /** 0~1 */
  sfxVol: number
}

const prefs: AudioPrefs = { musicOn: true, sfxOn: true, musicVol: 0.5, sfxVol: 0.7 }

const BPM = 52
/** 前奏 4 + 主歌 8 + 副歌 8 + 尾声 4 = 24 小节曲体,再留 2 小节混响余韵 */
const LOOP_END = '26:0:0'

type NoteEvent = [time: string, note: string, dur: string]

/** 演奏法标记(用于 MELODY):lyr=高音长音拉长 · stc=低音顿挫 · rise=上行渐强 · fall=下行渐弱 */
type PhraseMark = 'lyr' | 'stc' | 'rise' | 'fall'
type MelodyEvent = [time: string, note: string, dur: string, mark?: PhraseMark]

/** 古筝主旋律(D 宫调式) */
const MELODY: MelodyEvent[] = [
  // 主歌 A(引子由散板层 INTRO 负责)
  ['4:0:0', 'D4', '2n', 'stc'],
  ['4:2:0', 'A4', '2n', 'rise'],
  ['5:0:0', 'F#4', '2n', 'stc'],
  ['5:2:0', 'D4', '2n', 'fall'],
  ['6:0:0', 'E4', '2n', 'stc'],
  ['6:2:0', 'A4', '2n', 'rise'],
  ['7:0:0', 'F#4', '4n', 'stc'],
  ['7:1:0', 'E4', '4n', 'fall'],
  ['7:2:0', 'D4', '4n', 'stc'],
  ['7:3:2', 'B3', '16n'], // 倚音
  ['8:0:0', 'D4', '2n', 'stc'],
  ['8:2:0', 'A4', '2n', 'rise'],
  ['9:0:0', 'B4', '2n', 'rise'],
  ['9:2:0', 'D5', '2n', 'lyr'],
  ['10:0:0', 'F#4', '2n', 'fall'],
  ['10:2:0', 'E4', '2n', 'stc'],
  ['11:0:0', 'D4', '1n', 'fall'],
  // 副歌 B
  ['12:0:0', 'A4', '2n', 'rise'],
  ['12:2:0', 'D5', '2n', 'lyr'],
  ['13:0:0', 'E5', '2n', 'lyr'],
  ['13:2:0', 'D5', '2n', 'fall'],
  ['14:0:0', 'B4', '2n', 'rise'],
  ['14:2:0', 'D5', '2n', 'lyr'],
  ['15:0:0', 'A4', '1n', 'fall'],
  ['16:0:0', 'D5', '2n', 'lyr'],
  ['16:2:0', 'E5', '2n', 'lyr'],
  ['17:0:0', 'D5', '2n', 'rise'],
  ['17:2:0', 'B4', '2n', 'fall'],
  ['18:0:0', 'F#4', '2n', 'stc'],
  ['18:2:0', 'A4', '2n', 'rise'],
  ['19:0:0', 'D5', '1n', 'lyr'],
  // 尾声
  ['20:0:0', 'B4', '2n', 'rise'],
  ['21:0:0', 'A4', '2n', 'fall'],
  ['21:2:0', 'F#4', '2n', 'stc'],
  ['22:0:0', 'A3', '4n', 'stc'],
  ['22:2:0', 'D4', '2n', 'fall'],
  ['22:3:2', 'E4', '16n'], // 倚音
  ['23:0:0', 'D4', '1n', 'fall']
]

/** 琵琶:副歌前扫弦、长音处对答、副歌收束轮指、尾声挑尾 */
const PIPA: NoteEvent[] = [
  ['11:3:0', 'A4', '8n'],
  ['11:3:2', 'B4', '8n'],
  ['11:3:3', 'D5', '8n'],
  ['15:1:0', 'E5', '8n'],
  ['15:1:2', 'D5', '8n'],
  ['15:2:0', 'B4', '4n'],
  ['15:3:0', 'A4', '4n'],
  ['19:0:0', 'D5', '16n'],
  ['19:0:1', 'D5', '16n'],
  ['19:0:2', 'D5', '16n'],
  ['19:0:3', 'D5', '16n'],
  ['19:1:0', 'D5', '16n'],
  ['19:1:1', 'D5', '16n'],
  ['19:1:2', 'D5', '16n'],
  ['19:1:3', 'D5', '16n'],
  ['19:2:0', 'D5', '2n'],
  ['23:2:0', 'A4', '4n'],
  ['23:3:0', 'D5', '2n']
]

/** 低音持续音点缀:单声部同音反复,不用多音和弦 */
const DRONE_POINTS: [time: string, note: string, vel: number][] = [
  ['5:0:0', 'D2', 0.22],
  ['8:0:0', 'D2', 0.24],
  ['10:0:0', 'A2', 0.22],
  ['12:0:0', 'D3', 0.3],
  ['12:2:0', 'D3', 0.24],
  ['15:2:0', 'A2', 0.26],
  ['16:0:0', 'D3', 0.32],
  ['16:2:0', 'D3', 0.26],
  ['19:2:0', 'D3', 0.3],
  ['22:0:0', 'A2', 0.24]
]

/** 副歌太鼓:隔小节一点,力度由弱渐强再归于静 */
const DRUM_HITS: [time: string, note: string, vel: number][] = [
  ['12:0:0', 'C2', 0.3],
  ['13:0:0', 'C2', 0.38],
  ['14:0:0', 'G2', 0.44],
  ['16:0:0', 'C2', 0.5],
  ['18:0:0', 'G2', 0.36],
  ['19:0:0', 'C2', 0.22]
]

/** 风铃(钟琴)点景:概率触发 */
const CHIME_POINT_TIMES = ['1:1:0', '5:2:0', '9:1:0', '13:2:0', '17:1:0', '21:0:0']

// ---- 运行时状态(全部在动态加载后建立) ----
let T: typeof ToneNS | null = null
let initPromise: Promise<void> | null = null
/** 初始化代次:dispose 后,在途 init 与 safeStart 的旧回调都不许再碰运行时 */
let audioGeneration = 0
let unlocked = false
let bgmPlaying = false
let lastClickAt = 0
/**
 * 设备起不来的降级旗:起一次失败就整段静音续行。
 * BaseAudioContext.resume() 在无可用音频设备时以 InvalidStateError("Failed to start the audio device") 拒绝;
 * 全局 onPointerDown 每次都调 unlockAudio,`T.start()` 不带 catch 会每点一下漏一条 unhandledrejection。
 */
let audioDead = false

/** 古筝余音的延迟计时器;音频销毁时一并撤销,免得回调摸到已清空的节点 */
const tailTimers = new Set<ReturnType<typeof setTimeout>>()

let musicBus: ToneNS.Gain | null = null
let sfxBus: ToneNS.Gain | null = null
let zheng: ToneNS.Sampler | null = null
/** 古筝余音自动化:音尾微降再回,模拟弦振衰减 */
let zhengTail: ToneNS.Gain | null = null
/** 古筝泛音叠加层:极轻正弦,频率 = 基频 × 2(八度),随旋律触发 */
let zhengHarmonics: ToneNS.Synth | null = null
let zhengSfx: ToneNS.Sampler | null = null
let pipa: ToneNS.Sampler | null = null
let wood: ToneNS.Sampler | null = null
let taiko: ToneNS.Sampler | null = null
let taikoBgm: ToneNS.Sampler | null = null
let bellSampler: ToneNS.Sampler | null = null
let chimeSampler: ToneNS.Sampler | null = null
let bassSynth: ToneNS.Synth | null = null

function applyPrefs(): void {
  if (!T || !musicBus || !sfxBus) return
  musicBus.gain.rampTo(prefs.musicVol * 0.9, 0.1)
  sfxBus.gain.rampTo(prefs.sfxVol * 0.8, 0.1)
  if (prefs.musicOn && unlocked) startBgm()
  if (!prefs.musicOn) stopBgm()
}

/** 构建乐器、效果与整首曲子(仅一次);返回 false 表示初始化已被销毁撤销 */
async function init(generation: number): Promise<boolean> {
  const tone = await import('tone')
  if (generation !== audioGeneration) return false
  const audioBase = `${import.meta.env.BASE_URL}audio/`
  const sampler = (dir: string, urls: Record<string, string>, volume: number, release = 1.5): ToneNS.Sampler =>
    new tone.Sampler({ urls, baseUrl: `${audioBase}${dir}/`, volume, release })

  musicBus = new tone.Gain(prefs.musicVol * 0.9).toDestination()
  sfxBus = new tone.Gain(prefs.sfxVol * 0.8).toDestination()
  const hallVerb = new tone.Reverb({ decay: 2.2, preDelay: 0.015, wet: 0.2 }).connect(musicBus)
  const roomVerb = new tone.Reverb({ decay: 1.1, preDelay: 0.005, wet: 0.12 }).connect(sfxBus)

  // FluidR3 采样,见 public/audio/README.md
  const ZHENG_URLS = {
    C3: 'C3.mp3',
    F3: 'F3.mp3',
    A3: 'A3.mp3',
    C4: 'C4.mp3',
    F4: 'F4.mp3',
    A4: 'A4.mp3',
    C5: 'C5.mp3',
    F5: 'F5.mp3',
    A5: 'A5.mp3',
    C6: 'C6.mp3'
  }
  const zhengEQ = new tone.EQ3({ low: -2, mid: 3, high: 2 }).connect(hallVerb)
  zhengTail = new tone.Gain(1).connect(zhengEQ)
  zheng = sampler('zheng', ZHENG_URLS, -2, 2.5).connect(zhengTail)
  zhengSfx = sampler('zheng', ZHENG_URLS, -6, 2).connect(roomVerb)

  zhengHarmonics = new tone.Synth({
    volume: -26,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.4, sustain: 0.18, release: 2.0 }
  }).connect(zhengTail)
  pipa = sampler(
    'pipa',
    { C4: 'C4.mp3', F4: 'F4.mp3', A4: 'A4.mp3', C5: 'C5.mp3', F5: 'F5.mp3', A5: 'A5.mp3', C6: 'C6.mp3' },
    -8,
    1.2
  ).connect(hallVerb)
  wood = sampler('wood', { C5: 'C5.mp3', F5: 'F5.mp3' }, -10, 0.4).connect(sfxBus)
  taiko = sampler('drum', { C2: 'C2.mp3', G2: 'G2.mp3', C3: 'C3.mp3' }, -6, 1).connect(roomVerb)
  taikoBgm = sampler('drum', { C2: 'C2.mp3', G2: 'G2.mp3', C3: 'C3.mp3' }, -16, 1).connect(hallVerb)
  bellSampler = sampler('bell', { C4: 'C4.mp3', G4: 'G4.mp3', C5: 'C5.mp3' }, -8, 2.5).connect(roomVerb)
  chimeSampler = sampler('chime', { C5: 'C5.mp3', G5: 'G5.mp3', C6: 'C6.mp3' }, -12, 1.5).connect(hallVerb)

  bassSynth = new tone.Synth({
    volume: -20,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.5, decay: 0.4, sustain: 0.7, release: 2.5 }
  }).connect(hallVerb)

  await Promise.all([hallVerb.ready, roomVerb.ready, tone.loaded()])
  // 采样加载期间宿主可能已卸载:旧初始化不能再装监听、改 Transport 或占住 T
  if (generation !== audioGeneration) return false

  const transport = tone.getTransport()
  transport.bpm.value = BPM
  transport.loop = true
  transport.loopStart = 0
  transport.loopEnd = LOOP_END

  const toEvents = (list: NoteEvent[]): { time: string; note: string; dur: string }[] =>
    list.map(([time, note, dur]) => ({ time, note, dur }))

  const melodyPart = new tone.Part(
    (time, ev) => {
      let dur = ev.dur
      let vel = 0.6 + Math.random() * 0.15
      const mark = ev.mark as PhraseMark | undefined
      if (mark === 'lyr') {
        dur = ev.dur === '2n' ? '2n.' : ev.dur === '1n' ? '1n.' : ev.dur
        vel = 0.78 + Math.random() * 0.15
      } else if (mark === 'stc') {
        dur = ev.dur === '2n' ? '4n' : ev.dur === '4n' ? '8n' : ev.dur
        vel = 0.42 + Math.random() * 0.12
      } else if (mark === 'rise') {
        vel = 0.72 + Math.random() * 0.1
      } else if (mark === 'fall') {
        vel = 0.5 + Math.random() * 0.1
      }
      zheng?.triggerAttackRelease(ev.note, dur, time, vel)
      if (zhengHarmonics && T) {
        const freq = T.Frequency(ev.note).toFrequency() * 2
        const harmVel = mark === 'lyr' ? 0.9 : mark === 'stc' ? 0.5 : 0.7
        zhengHarmonics.triggerAttackRelease(freq, dur, time, harmVel)
      }
      if (mark === 'lyr' && zhengTail && T) {
        // 用 setTimeout 而非 transport.schedule:schedule 是绝对时间一次性的,loop 回绕后会丢失
        // 四分音符 = 60/BPM 秒;'2n' = 2 拍,'1n' = 4 拍,'4n' = 1 拍
        const beatSec = 60 / BPM
        const beats = dur.endsWith('.') ? Number(dur[0]) * 1.5 : Number(dur[0])
        const durSec = beats * beatSec
        const ms = (time - T.now()) * 1000 + durSec * 1000 + 150
        if (ms > 0 && ms < 12000) {
          const timer = setTimeout(() => {
            tailTimers.delete(timer)
            if (zhengTail) {
              zhengTail.gain.rampTo(0.93, 0.25)
              zhengTail.gain.rampTo(1, 0.6)
            }
          }, ms)
          tailTimers.add(timer)
        }
      }
    },
    MELODY.map(([time, note, dur, mark]) => ({ time, note, dur, mark }))
  )
  melodyPart.humanize = 0.06 + Math.random() * 0.02
  melodyPart.start(0)

  const pipaPart = new tone.Part((time, ev) => {
    pipa?.triggerAttackRelease(ev.note, ev.dur, time, 0.55 + Math.random() * 0.2)
  }, toEvents(PIPA))
  pipaPart.humanize = 0.05 + Math.random() * 0.02
  pipaPart.start(0)

  // 散板引子:Part 承载(loop 每轮可靠重放),回调内做自由时值伸缩
  const INTRO: NoteEvent[] = [
    ['0:0:0', 'A3', '2n'],
    ['0:2:0', 'D4', '2n'],
    ['1:0:0', 'E4', '4n'],
    ['1:1:0', 'A3', '4n'],
    ['1:2:0', 'D5', '2n'],
    ['2:0:0', 'A4', '2n'],
    ['2:2:0', 'D4', '1n']
  ]
  const introPart = new tone.Part((time, ev) => {
    // 起音只做正偏移(0~0.3s),避免与 loop 起点碰撞
    const t = time + Math.random() * 0.3
    zheng?.triggerAttackRelease(ev.note, ev.dur, t, 0.5 + Math.random() * 0.2)
  }, toEvents(INTRO))
  introPart.start(0)

  const dronePart = new tone.Part(
    (time, ev) => {
      bassSynth?.triggerAttackRelease(ev.note, '4n.', time, ev.vel)
    },
    DRONE_POINTS.map(([time, note, vel]) => ({ time, note, vel }))
  )
  dronePart.humanize = 0.04
  dronePart.start(0)

  const drumPart = new tone.Part(
    (time, ev) => {
      taikoBgm?.triggerAttackRelease(ev.note, '2n', time, ev.vel)
    },
    DRUM_HITS.map(([time, note, vel]) => ({ time, note, vel }))
  )
  drumPart.start(0)

  const chimePart = new tone.Part(
    time => {
      if (Math.random() < 0.45) {
        const note = ['C6', 'G5', 'D6', 'A5'][Math.floor(Math.random() * 4)]!
        chimeSampler?.triggerAttackRelease(note, '4n', time, 0.12 + Math.random() * 0.08)
      }
    },
    CHIME_POINT_TIMES.map(time => ({ time }))
  )
  chimePart.humanize = 0.08
  chimePart.start(0)

  document.addEventListener('visibilitychange', onVisibilityChange)

  T = tone
  return true
}

function onVisibilityChange(): void {
  if (!T) return
  if (document.visibilityState === 'hidden') {
    if (bgmPlaying) T.getTransport().pause()
    return
  }
  if (!prefs.musicOn || !unlocked) return
  // 加载期间在后台时,初始化完成后的 startBgm 被可见性守卫挡下;回前台在此补上
  if (bgmPlaying) T.getTransport().start()
  else startBgm()
}

/**
 * 音量钳到 [0,1],且**必须挡住 NaN**。
 *
 * `Math.max(0, Math.min(1, NaN))` 得 NaN —— 两道钳制都留不住它。
 * NaN 一路传到 applyPrefs 的 `gain.rampTo(NaN)`,把 gain 参数污染成 NaN,
 * 表现是整块音频静音或 Tone 抛错。
 *
 * 入参当前由 settings.sanitize 用 asFiniteNumber 兜着,但音频模块不该
 * 依赖调用方替它保证入参 —— 一个直接调 configureAudio 的地方就能踩到。
 */
export function clampVolume(v: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback
  return Math.max(0, Math.min(1, v))
}

/** 同步偏好(设置页开关/音量变化时调用) */
export function configureAudio(p: AudioPrefs): void {
  prefs.musicOn = p.musicOn
  prefs.sfxOn = p.sfxOn
  prefs.musicVol = clampVolume(p.musicVol, 0.5)
  prefs.sfxVol = clampVolume(p.sfxVol, 0.7)
  applyPrefs()
}

/** 在途的启动:未定局期间再来的交互直接让位 */
let startPromise: Promise<void> | null = null

/** 恢复音频上下文:失败吞掉,单次告警、单次置死,不重试 */
function safeStart(): void {
  if (!T || audioDead || startPromise) return
  const generation = audioGeneration
  const task = T.start()
    .then(() => {
      if (generation !== audioGeneration) return
      if (prefs.musicOn) startBgm()
    })
    .catch(() => {
      if (generation !== audioGeneration) return
      audioDead = true
      bgmPlaying = false
      // 只 warn,不进 diag 留档
      console.warn('[音频] 音频设备未就绪,静音续行(配乐与音效停用)')
    })
    .finally(() => {
      // dispose 后可能已有新一代启动:只清自己那一份在途标记
      if (startPromise === task) startPromise = null
    })
  startPromise = task
}

/** 首次用户交互时调用,加载引擎并解锁声音;每次交互重入无副作用 */
export function unlockAudio(): void {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return
  /*
   * 两路都关着就不必加载引擎。
   *
   * init() 会 `await import('tone')`(动态 chunk)并下载整套 FluidR3 采样 mp3 ——
   * 而 unlockAudio 挂在全局 onPointerDown 上,玩家就算在设置里把配乐与音效全关了,
   * 第一次点击照样会把这些拉下来、建好整张音频图,只是之后什么都放不出来。
   *
   * 不置 unlocked:玩家若在本次会话里把开关打开,下一次交互会正常走完整流程。
   */
  if (!prefs.sfxOn && !prefs.musicOn) return
  unlocked = true
  if (T) {
    // 已就绪:在手势调用栈内直接恢复上下文
    safeStart()
    return
  }
  if (initPromise) return
  const generation = audioGeneration
  const task = init(generation)
    .then(started => {
      if (!started || generation !== audioGeneration) return
      safeStart()
      applyPrefs()
    })
    .catch(err => {
      if (generation !== audioGeneration) return
      // 失败不把模块钉在「正在加载」:下一次交互可重新尝试
      console.error('[音频] 引擎加载失败', err)
    })
    .finally(() => {
      // dispose 后可能已有新一代加载:旧任务收尾不许清掉新任务
      if (initPromise === task) initPromise = null
    })
  initPromise = task
}

export function startBgm(): void {
  if (!T || bgmPlaying || !prefs.musicOn || audioDead) return
  // 加载期间切后台,初始化完成仍会走到这里:后台不起乐
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  bgmPlaying = true
  T.getTransport().start('+0.1')
}

export function stopBgm(): void {
  if (!T || !bgmPlaying) return
  bgmPlaying = false
  T.getTransport().stop()
}

/** 释放 App 级音频接线;下一次挂载可重新初始化 */
export function disposeAudio(): void {
  audioGeneration += 1
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
  for (const timer of tailTimers) clearTimeout(timer)
  tailTimers.clear()
  stopBgm()
  T = null
  initPromise = null
  startPromise = null
  unlocked = false
  audioDead = false
  musicBus = null
  sfxBus = null
  zheng = null
  zhengTail = null
  zhengHarmonics = null
  zhengSfx = null
  pipa = null
  wood = null
  taiko = null
  taikoBgm = null
  bellSampler = null
  chimeSampler = null
  bassSynth = null
}

/** 古筝刮奏 */
function gliss(notes: string[], step: number, vel = 0.55): void {
  if (!T || !zhengSfx) return
  const now = T.now()
  notes.forEach((n, i) => zhengSfx?.triggerAttackRelease(n, '2n', now + i * step, vel))
}

export function playSfx(name: SfxName): void {
  if (!prefs.sfxOn || !unlocked || !T || audioDead) return
  const now = T.now()
  switch (name) {
    case 'click': {
      // 全局按钮音:木鱼轻叩,限频防连点噪音
      const t = Date.now()
      if (t - lastClickAt < 90) return
      lastClickAt = t
      wood?.triggerAttackRelease('C5', '8n', now, 0.4)
      break
    }
    case 'info':
      chimeSampler?.triggerAttackRelease('D6', '2n', now, 0.35)
      break
    case 'success':
      chimeSampler?.triggerAttackRelease('D6', '2n', now, 0.4)
      chimeSampler?.triggerAttackRelease('E6', '1n', now + 0.14, 0.4)
      break
    case 'warn':
      taiko?.triggerAttackRelease('C2', '2n', now, 0.7)
      break
    case 'rare':
      bellSampler?.triggerAttackRelease('D5', '1n', now, 0.6)
      chimeSampler?.triggerAttackRelease('D7', '1n', now + 0.15, 0.2)
      break
    case 'treasure':
      /* 得宝仪典:磬一记 + 筝自低向高五声。比 rare 长、比 breakthrough 收 —— 这是「到了」不是「过了」 */
      bellSampler?.triggerAttackRelease('A4', '2n', now, 0.7)
      gliss(['A4', 'B4', 'D5', 'E5', 'A5'], 0.12, 0.5)
      chimeSampler?.triggerAttackRelease('A6', '1n', now + 0.6, 0.18)
      break
    case 'win':
      gliss(['D5', 'E5', 'F#5', 'A5', 'B5'], 0.09)
      break
    case 'lose':
      gliss(['F#4', 'E4', 'B3'], 0.2, 0.5)
      taiko?.triggerAttackRelease('G2', '2n', now + 0.6, 0.45)
      break
    case 'breakthrough':
      gliss(['F#3', 'A3', 'B3', 'D4', 'E4', 'F#4', 'A4', 'B4', 'D5'], 0.075, 0.6)
      bellSampler?.triggerAttackRelease('D5', '1n', now + 0.8, 0.7)
      break
    case 'fail':
      gliss(['A3', 'E3', 'D3'], 0.24, 0.5)
      taiko?.triggerAttackRelease('C2', '2n', now + 0.8, 0.55)
      break
  }
}
