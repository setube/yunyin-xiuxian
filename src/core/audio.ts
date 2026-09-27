/**
 * 音频引擎 —— Tone.js + 真实乐器采样(FluidR3 音源,本地文件,纯单机)
 * 背景乐:D 宫调式主题曲《云隐》,52 BPM——
 *   古筝(筝采样)主旋律级进为主、句尾长音;琵琶对答与轮指;
 *   四五度叠置和声垫轻铺;低音长持续弱存在;副歌隔小节一记太鼓藏于混响
 * 音效:真实木鱼 / 钟琴 / 管钟 / 太鼓 / 古筝刮奏
 * Tone.js 与采样均按需加载:主包不含引擎,测试环境(无 AudioContext)天然免疫;
 * 浏览器自动播放策略:必须在首次用户交互后 unlockAudio() 才会出声
 */
import type * as ToneNS from 'tone'

export type SfxName = 'click' | 'success' | 'warn' | 'info' | 'rare' | 'win' | 'lose' | 'breakthrough' | 'fail'

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

/**
 * 演奏法标记(作曲层,非节拍层):
 * lyr=拉长飘起(高音长音,余音袅袅) · stc=顿挫(低音短音,如墨点皴)
 * rise=上行渐强 · fall=下行渐弱(乐句走向的力度层次)
 * 应用于 MELODY 的时值弹性与力度塑形
 */
type PhraseMark = 'lyr' | 'stc' | 'rise' | 'fall'
type MelodyEvent = [time: string, note: string, dur: string, mark?: PhraseMark]

/**
 * 古筝主旋律(D 宫调式,散板呼吸):
 * 前奏疏朗铺陈 → 主歌以大跳留白、乐句间留呼吸 → 副歌登高收句 → 尾声下行送归,收于宫
 */
const MELODY: MelodyEvent[] = [
  // 主歌 A(大跳为主,句间留白;引子由散板层 INTRO 负责)
  ['4:0:0', 'D4', '2n', 'stc'], // 起笔沉稳,顿
  ['4:2:0', 'A4', '2n', 'rise'], // 上行扬举
  ['5:0:0', 'F#4', '2n', 'stc'],
  ['5:2:0', 'D4', '2n', 'fall'], // 下行渐弱
  ['6:0:0', 'E4', '2n', 'stc'],
  ['6:2:0', 'A4', '2n', 'rise'], // 四度上眺
  ['7:0:0', 'F#4', '4n', 'stc'], // 顿
  ['7:1:0', 'E4', '4n', 'fall'],
  ['7:2:0', 'D4', '4n', 'stc'],
  ['7:3:2', 'B3', '16n'], // 倚音引句
  ['8:0:0', 'D4', '2n', 'stc'],
  ['8:2:0', 'A4', '2n', 'rise'],
  ['9:0:0', 'B4', '2n', 'rise'],
  ['9:2:0', 'D5', '2n', 'lyr'], // 高音飘起,副歌前眺
  ['10:0:0', 'F#4', '2n', 'fall'],
  ['10:2:0', 'E4', '2n', 'stc'],
  ['11:0:0', 'D4', '1n', 'fall'], // 收句归落
  // 副歌 B(登高收句,大跳换气)
  ['12:0:0', 'A4', '2n', 'rise'],
  ['12:2:0', 'D5', '2n', 'lyr'], // 高音长音上扬
  ['13:0:0', 'E5', '2n', 'lyr'], // 飘
  ['13:2:0', 'D5', '2n', 'fall'],
  ['14:0:0', 'B4', '2n', 'rise'],
  ['14:2:0', 'D5', '2n', 'lyr'],
  ['15:0:0', 'A4', '1n', 'fall'], // 长音渐弱
  ['16:0:0', 'D5', '2n', 'lyr'],
  ['16:2:0', 'E5', '2n', 'lyr'],
  ['17:0:0', 'D5', '2n', 'rise'],
  ['17:2:0', 'B4', '2n', 'fall'],
  ['18:0:0', 'F#4', '2n', 'stc'],
  ['18:2:0', 'A4', '2n', 'rise'],
  ['19:0:0', 'D5', '1n', 'lyr'], // 峰顶长音
  // 尾声(大跳回落,送归)
  ['20:0:0', 'B4', '2n', 'rise'], // 最后一次扬
  ['21:0:0', 'A4', '2n', 'fall'], // 留白一拍
  ['21:2:0', 'F#4', '2n', 'stc'],
  ['22:0:0', 'A3', '4n', 'stc'], // 低音顿笔
  ['22:2:0', 'D4', '2n', 'fall'],
  ['22:3:2', 'E4', '16n'], // 倚音送尾
  ['23:0:0', 'D4', '1n', 'fall'] // 归于宫,渐弱收
]

/**
 * 琵琶声部:副歌进入前扫弦引入,长音处对答填空,副歌收束轮指,尾声一声挑尾
 */
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

/**
 * 低音持续音点缀(替代"西方和弦进行"):
 * 不再用多音和弦,改为古琴按音式的同音反复(轻点两下),单声部线性,
 * 主歌极疏(如远山沉在雾下),副歌高潮前与峰顶处微起,尾声沉归
 */
const DRONE_POINTS: [time: string, note: string, vel: number][] = [
  ['5:0:0', 'D2', 0.22], // 主歌,若隐若现
  ['8:0:0', 'D2', 0.24],
  ['10:0:0', 'A2', 0.22],
  ['12:0:0', 'D3', 0.3], // 副歌前,轻点
  ['12:2:0', 'D3', 0.24],
  ['15:2:0', 'A2', 0.26], // 副歌换气
  ['16:0:0', 'D3', 0.32], // 二次高潮
  ['16:2:0', 'D3', 0.26],
  ['19:2:0', 'D3', 0.3], // 峰顶余韵
  ['22:0:0', 'A2', 0.24] // 尾声沉
]

/** 副歌鼓点:隔小节一点的太鼓心跳,力度由弱渐强再归于静(意境点染) */
const DRUM_HITS: [time: string, note: string, vel: number][] = [
  ['12:0:0', 'C2', 0.3],
  ['13:0:0', 'C2', 0.38],
  ['14:0:0', 'G2', 0.44],
  ['16:0:0', 'C2', 0.5],
  ['18:0:0', 'G2', 0.36],
  ['19:0:0', 'C2', 0.22]
]

/** 风铃(钟琴)点景:概率触发,似檐下风动,偶然一响 */
const CHIME_POINT_TIMES = ['1:1:0', '5:2:0', '9:1:0', '13:2:0', '17:1:0', '21:0:0']

// ---- 运行时状态(全部在动态加载后建立) ----
let T: typeof ToneNS | null = null
let initPromise: Promise<void> | null = null
let unlocked = false
let bgmPlaying = false
let lastClickAt = 0
/**
 * 设备起不来的降级旗:起一次失败就整段静音续行,不再每次点击各抛一条。
 *
 * 浏览器里 BaseAudioContext.resume() 在无可用音频设备时以
 * InvalidStateError("Failed to start the audio device") 拒绝 —— 旧代码两处
 * `void T.start()` 裸调用不带 catch,拒绝一路漏成 unhandledrejection,
 * 玩家每点一下(全局 onPointerDown 都调 unlockAudio)就多一条,×4 就是这么来的
 */
let audioDead = false

let musicBus: ToneNS.Gain | null = null
let sfxBus: ToneNS.Gain | null = null
let zheng: ToneNS.Sampler | null = null
/** 古筝余音自动化(音尾微降再回,模拟弦振衰减) */
let zhengTail: ToneNS.Gain | null = null
/** 古筝泛音叠加层(极轻正弦,补充琴箱共鸣) */
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

/** 构建乐器、效果与整首曲子(仅一次) */
async function init(): Promise<void> {
  const tone = await import('tone')
  const audioBase = `${import.meta.env.BASE_URL}audio/`
  const sampler = (dir: string, urls: Record<string, string>, volume: number, release = 1.5): ToneNS.Sampler =>
    new tone.Sampler({ urls, baseUrl: `${audioBase}${dir}/`, volume, release })

  // 总线:音乐(清潭式短混响,清透而非山谷)/ 音效(极短混响,干净)
  musicBus = new tone.Gain(prefs.musicVol * 0.9).toDestination()
  sfxBus = new tone.Gain(prefs.sfxVol * 0.8).toDestination()
  const hallVerb = new tone.Reverb({ decay: 2.2, preDelay: 0.015, wet: 0.2 }).connect(musicBus)
  const roomVerb = new tone.Reverb({ decay: 1.1, preDelay: 0.005, wet: 0.12 }).connect(sfxBus)

  // 真实采样乐器(FluidR3 音源,见 public/audio/README.md)
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
  // 古筝 EQ 塑形 + 余音自动化:箱体中频提升,音尾微降再回模拟弦振衰减
  const zhengEQ = new tone.EQ3({ low: -2, mid: 3, high: 2 }).connect(hallVerb)
  zhengTail = new tone.Gain(1).connect(zhengEQ)
  zheng = sampler('zheng', ZHENG_URLS, -2, 2.5).connect(zhengTail)
  zhengSfx = sampler('zheng', ZHENG_URLS, -6, 2).connect(roomVerb)

  // 泛音叠加层:轻柔的正弦泛音(频率 = 基频 × 2,八度虚影),随旋律触发,
  // 给 GM 干涩采样盖一层"琴箱共鸣穹顶"——补充中高频的木质感
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

  // 低音与低音持续音仍用轻合成,藏在采样声部之下
  bassSynth = new tone.Synth({
    volume: -20,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.5, decay: 0.4, sustain: 0.7, release: 2.5 }
  }).connect(hallVerb)

  // 等混响与全部采样就绪
  await Promise.all([hallVerb.ready, roomVerb.ready, tone.loaded()])

  // 各声部装入 Transport,整曲循环
  const transport = tone.getTransport()
  transport.bpm.value = BPM
  transport.loop = true
  transport.loopStart = 0
  transport.loopEnd = LOOP_END

  const toEvents = (list: NoteEvent[]): { time: string; note: string; dur: string }[] =>
    list.map(([time, note, dur]) => ({ time, note, dur }))

  const melodyPart = new tone.Part(
    (time, ev) => {
      // 演奏法塑形:高音长音飘起(延音),低音顿挫(短音),旋律乐句走向渐强渐弱
      let dur = ev.dur
      let vel = 0.6 + Math.random() * 0.15
      const mark = ev.mark as PhraseMark | undefined
      if (mark === 'lyr') {
        // 高音长音:拉长 30%,力度略强,余音袅袅
        dur = ev.dur === '2n' ? '2n.' : ev.dur === '1n' ? '1n.' : ev.dur
        vel = 0.78 + Math.random() * 0.15
      } else if (mark === 'stc') {
        // 低音顿挫:缩短 50%,力度偏轻,如墨点皴(2n→4n,4n→8n,1n→2n)
        dur = ev.dur === '2n' ? '4n' : ev.dur === '4n' ? '8n' : ev.dur
        vel = 0.42 + Math.random() * 0.12
      } else if (mark === 'rise') {
        // 上行渐强
        vel = 0.72 + Math.random() * 0.1
      } else if (mark === 'fall') {
        // 下行渐弱
        vel = 0.5 + Math.random() * 0.1
      }
      zheng?.triggerAttackRelease(ev.note, dur, time, vel)
      // 泛音叠加:琴箱共鸣穹顶(八度虚影,极轻,高音愈亮)
      if (zhengHarmonics && T) {
        const freq = T.Frequency(ev.note).toFrequency() * 2 // 八度泛音
        const harmVel = mark === 'lyr' ? 0.9 : mark === 'stc' ? 0.5 : 0.7
        zhengHarmonics.triggerAttackRelease(freq, dur, time, harmVel)
      }
      // 长音余音自动化:高音飘起后,弦振微衰再回(模拟泛音尾韵)
      if (mark === 'lyr' && zhengTail && T) {
        // 用 setTimeout 而非 transport.schedule:loop 每轮回调都会执行,
        // 但 schedule 是绝对时间一次性的,回绕后会丢失;setTimeout 跟随真实时间
        // dur 秒数按 BPM 换算(四分音符 = 60/BPM 秒);'2n' = 2 拍,'1n' = 4 拍,'4n' = 1 拍
        const beatSec = 60 / BPM
        const beats = dur.endsWith('.') ? Number(dur[0]) * 1.5 : Number(dur[0])
        const durSec = beats * beatSec
        const ms = (time - T.now()) * 1000 + durSec * 1000 + 150
        if (ms > 0 && ms < 12000) {
          setTimeout(() => {
            if (zhengTail) {
              zhengTail.gain.rampTo(0.93, 0.25)
              zhengTail.gain.rampTo(1, 0.6)
            }
          }, ms)
        }
      }
    },
    MELODY.map(([time, note, dur, mark]) => ({ time, note, dur, mark }))
  )
  melodyPart.humanize = 0.06 + Math.random() * 0.02 // 演奏家式微自由,每轮略不同
  melodyPart.start(0)

  const pipaPart = new tone.Part((time, ev) => {
    pipa?.triggerAttackRelease(ev.note, ev.dur, time, 0.55 + Math.random() * 0.2)
  }, toEvents(PIPA))
  pipaPart.humanize = 0.05 + Math.random() * 0.02
  pipaPart.start(0)

  // 散板引子:Part 承载(loop 每轮可靠重放),回调内做自由时值伸缩——
  // 每轮循环的引子呼吸略不同,听感即"拍无定值,随心起止"
  const INTRO: NoteEvent[] = [
    ['0:0:0', 'A3', '2n'],
    ['0:2:0', 'D4', '2n'],
    ['1:0:0', 'E4', '4n'],
    ['1:1:0', 'A3', '4n'],
    ['1:2:0', 'D5', '2n'], // 八度登高
    ['2:0:0', 'A4', '2n'],
    ['2:2:0', 'D4', '1n'] // 归于宫
  ]
  const introPart = new tone.Part((time, ev) => {
    // 自由时值:起音时间仅正偏移(0~0.3s),散板"迟而不早",避免与 loop 起点碰撞
    const t = time + Math.random() * 0.3
    zheng?.triggerAttackRelease(ev.note, ev.dur, t, 0.5 + Math.random() * 0.2)
  }, toEvents(INTRO))
  introPart.start(0)

  // 低音持续音点缀:同音反复,古琴按音式(单声部线性,无和弦进行感)
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

  // 风铃点景:概率触发(约 45% 的点响一声),随机音高与力度,似檐下风动偶然一响
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

  // 切后台暂停乐曲,回前台续播
  document.addEventListener('visibilitychange', () => {
    if (!T) return
    if (document.visibilityState === 'hidden') {
      if (bgmPlaying) T.getTransport().pause()
    } else if (bgmPlaying && prefs.musicOn) {
      T.getTransport().start()
    }
  })

  T = tone
}

/** 同步偏好(设置页开关/音量变化时调用) */
export function configureAudio(p: AudioPrefs): void {
  prefs.musicOn = p.musicOn
  prefs.sfxOn = p.sfxOn
  prefs.musicVol = Math.max(0, Math.min(1, p.musicVol))
  prefs.sfxVol = Math.max(0, Math.min(1, p.sfxVol))
  applyPrefs()
}

/** 一次启动的 Promise:首取未定局期间,再来的交互直接让位,不各自挂回执 */
let startPromise: Promise<void> | null = null

/**
 * 恢复音频上下文。Tone.start() 的 Promise 在此吞掉失败,并把整段音频标记为
 * 已死 —— 设备没就绪不是能重试的,每次点击再试只会制造一屏未处理拒绝。
 * 在途护栏:全局 onPointerDown 每次交互都会进来,若正在启动就让位给那一次
 * 共享尝试,失败只由它记一记(单次告警、单次置死)。
 */
function safeStart(): void {
  if (!T || audioDead || startPromise) return
  startPromise = T.start()
    .then(() => {
      // 恢复成功才让循环起声;失败走 catch 直接置死
      if (prefs.musicOn) startBgm()
    })
    .catch(() => {
      audioDead = true
      bgmPlaying = false
      // 降级为静音续行:一句警告入日志,不再进 diag 留档
      console.warn('[音频] 音频设备未就绪,静音续行(配乐与音效停用)')
    })
    .finally(() => {
      startPromise = null
    })
}

/** 首次用户交互时调用,加载引擎并解锁声音;每次交互重入无副作用 */
export function unlockAudio(): void {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return
  unlocked = true
  if (T) {
    // 已就绪:在手势调用栈内直接恢复上下文
    safeStart()
    return
  }
  initPromise ??= init()
    .then(() => {
      safeStart()
      applyPrefs()
    })
    .catch(err => {
      console.error('[音频] 引擎加载失败', err)
    })
}

export function startBgm(): void {
  if (!T || bgmPlaying || !prefs.musicOn || audioDead) return
  bgmPlaying = true
  T.getTransport().start('+0.1')
}

export function stopBgm(): void {
  if (!T || !bgmPlaying) return
  bgmPlaying = false
  T.getTransport().stop()
}

/** 古筝刮奏(真采样):速度放缓,余音相叠 */
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
      // 全局按钮音 = 低而闷的木鱼轻叩,限频防连点噪音
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
      // 管钟一撞,金声玉振
      bellSampler?.triggerAttackRelease('D5', '1n', now, 0.6)
      chimeSampler?.triggerAttackRelease('D7', '1n', now + 0.15, 0.2)
      break
    case 'win':
      gliss(['D5', 'E5', 'F#5', 'A5', 'B5'], 0.09)
      break
    case 'lose':
      gliss(['F#4', 'E4', 'B3'], 0.2, 0.5)
      taiko?.triggerAttackRelease('G2', '2n', now + 0.6, 0.45)
      break
    case 'breakthrough':
      // 整条刮奏冲顶 + 管钟定音
      gliss(['F#3', 'A3', 'B3', 'D4', 'E4', 'F#4', 'A4', 'B4', 'D5'], 0.075, 0.6)
      bellSampler?.triggerAttackRelease('D5', '1n', now + 0.8, 0.7)
      break
    case 'fail':
      gliss(['A3', 'E3', 'D3'], 0.24, 0.5)
      taiko?.triggerAttackRelease('C2', '2n', now + 0.8, 0.55)
      break
  }
}
