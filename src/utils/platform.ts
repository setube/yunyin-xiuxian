/**
 * 平台探测:要不要劝玩家「添加到主屏幕」。
 * iOS WebKit 会清掉七天未打开站点的脚本可写存储(含 localStorage 存档、Service Worker 注册与缓存);
 * 主屏幕 Web App 不受此限。iOS 上所有浏览器都是 WebKit,不区分浏览器。
 * 安卓 APK 与 Windows Electron 用应用自己的存储,一律返回 false。
 */

import { Capacitor } from '@capacitor/core'

/** 一次环境取样;做成参数供用例喂各种 UA */
export interface EnvProbe {
  userAgent: string
  /** iOS Safari「添加到主屏幕」后 navigator.standalone 为 true */
  standalone?: boolean
  /** 已安装的 PWA(桌面 Chrome、安卓 Chrome 亦适用) */
  displayModeStandalone?: boolean
  /** iPadOS 13+ 的 Safari 把 UA 伪装成 Mac,只能靠触点数认出来 */
  maxTouchPoints?: number
  /** Capacitor 原生壳(安卓 APK / iOS 版)。壳里 standalone 恒为 false,不排除就会劝玩家去装已经在用的东西 */
  nativeApp?: boolean
}

/** 从当前窗口取样 */
export function probeEnv(): EnvProbe {
  return {
    userAgent: navigator.userAgent,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
    displayModeStandalone:
      typeof matchMedia === 'function' &&
      (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches),
    maxTouchPoints: navigator.maxTouchPoints,
    nativeApp: Capacitor.isNativePlatform()
  }
}

/** iPhone / iPad / iPod,含 iPadOS 13+ */
export function isIos(env: EnvProbe): boolean {
  if (/iPad|iPhone|iPod/.test(env.userAgent)) return true
  return /Macintosh/.test(env.userAgent) && (env.maxTouchPoints ?? 0) > 1
}

/** 已装好的应用(主屏幕 Web App / 安装的 PWA) */
export function isInstalledApp(env: EnvProbe): boolean {
  return env.standalone === true || env.displayModeStandalone === true
}

/** 要不要劝安装:在 iOS 上、未安装,且不是原生壳里 */
export function shouldSuggestInstall(env: EnvProbe): boolean {
  if (env.nativeApp === true) return false
  return isIos(env) && !isInstalledApp(env)
}
