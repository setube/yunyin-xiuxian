/**
 * 平台探测:要不要劝「添加到主屏幕」。
 *   不劝:安卓 APK / Windows 桌面 / 桌面浏览器;已是主屏幕应用(navigator.standalone 或 display-mode: standalone)。
 *   要劝:iOS 上未安装,含 Chrome/Edge 壳(共用 WebKit 策略)与伪装成 Mac 的 iPadOS 13+ UA。
 */
import { describe, expect, it } from 'vitest'
import { isIos, isInstalledApp, shouldSuggestInstall, type EnvProbe } from './platform'

const UA = {
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  ipadOsAsMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  electron: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) yunyin/1.33.0 Chrome/128.0.0.0 Electron/39.0.0 Safari/537.36'
}

const env = (userAgent: string, rest: Partial<EnvProbe> = {}): EnvProbe => ({ userAgent, ...rest })

describe('平台探测 · 要不要劝「添加到主屏幕」', () => {
  it('iOS 上未安装:该劝 —— Safari 与 Chrome 壳一视同仁,风险相同', () => {
    expect(shouldSuggestInstall(env(UA.iosSafari))).toBe(true)
    expect(shouldSuggestInstall(env(UA.iosChrome))).toBe(true)
    // iPadOS 13+ 伪装成 Mac,靠触点数区分
    expect(shouldSuggestInstall(env(UA.ipadOsAsMac, { maxTouchPoints: 5 }))).toBe(true)
    expect(shouldSuggestInstall(env(UA.macSafari, { maxTouchPoints: 0 }))).toBe(false)
  })

  it('iOS 之外一律不劝:安卓、Windows 桌面、Mac 都不吃 WebKit 那套清存储规则', () => {
    expect(shouldSuggestInstall(env(UA.android))).toBe(false)
    expect(shouldSuggestInstall(env(UA.electron))).toBe(false)
    expect(shouldSuggestInstall(env(UA.macSafari))).toBe(false)
  })

  it('iOS 原生壳(电容 App)里不劝 —— 玩家已经在应用里了', () => {
    // 壳里的 WKWebView 既没有 navigator.standalone,display-mode 也不是 standalone,
    // 光看 UA 与那两项会判成「iOS 未安装」,于是劝人去装一个他正在用的东西
    const inShell = env(UA.iosSafari, { nativeApp: true })
    expect(isIos(inShell), '原生壳仍算 iOS').toBe(true)
    expect(isInstalledApp(inShell), '壳里这两项都是 false,所以下面的排除不能靠它').toBe(false)
    expect(shouldSuggestInstall(inShell), '原生壳里不该劝装到主屏幕').toBe(false)
    // 安卓壳同样不劝
    expect(shouldSuggestInstall(env(UA.android, { nativeApp: true }))).toBe(false)
  })

  it('已经装好了就不再劝:主屏幕 Web App 不受清存储规则管', () => {
    expect(shouldSuggestInstall(env(UA.iosSafari, { standalone: true }))).toBe(false)
    expect(shouldSuggestInstall(env(UA.iosSafari, { displayModeStandalone: true }))).toBe(false)
    expect(isInstalledApp(env(UA.android, { displayModeStandalone: true }))).toBe(true)
  })

  it('「是不是 iOS」与「是不是装好了」是两件事,别混成一条', () => {
    // 装好的 iOS 仍算 iOS
    const installedIos = env(UA.iosSafari, { standalone: true })
    expect(isIos(installedIos)).toBe(true)
    expect(isInstalledApp(installedIos)).toBe(true)
    expect(shouldSuggestInstall(installedIos)).toBe(false)
  })
})
