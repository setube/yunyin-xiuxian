import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, session } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import pkg from '../package.json'

// package.json 没有 title 字段,取 electron-builder 的 productName
const APP_TITLE = pkg.build.productName

// 开发时是项目根目录,打包后是 app.asar
const appRoot = app.getAppPath()

const preloadPath = path.join(appRoot, 'dist-electron', 'preload.js')

const distPath = path.join(appRoot, 'dist')

const publicPath = path.join(appRoot, 'public')

const settingsPath = path.join(app.getPath('userData'), 'settings.json')

const defaultSettings = {
  closeToTray: false,
  autoLaunch: false
}

const loadSettings = () => {
  try {
    if (fs.existsSync(settingsPath)) {
      return { ...defaultSettings, ...JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) }
    }
  } catch (e) {
    console.error('Failed to load settings:', e)
  }
  return { ...defaultSettings }
}

const saveSettings = s => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2))
  } catch (e) {
    console.error('Failed to save settings:', e)
  }
}

let settings = loadSettings()
let win = null
let tray = null
let isQuitting = false

const destroyTray = () => {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

const setAutoLaunch = enable => {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: app.getPath('exe')
  })
}

const createTray = () => {
  if (tray) return

  const iconPath = path.join(publicPath, 'favicon.ico')
  const trayIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()

  tray = new Tray(trayIcon)
  tray.setToolTip(APP_TITLE)

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => win?.show() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => win?.show())
}

const createAppMenu = () => {
  const template = [
    {
      label: '设置',
      submenu: [
        {
          label: '关闭时最小化到托盘',
          type: 'checkbox',
          checked: settings.closeToTray,
          click: menuItem => {
            settings.closeToTray = menuItem.checked
            saveSettings(settings)
            if (settings.closeToTray) {
              createTray()
            } else {
              destroyTray()
            }
          }
        },
        {
          label: '开机自动启动',
          type: 'checkbox',
          checked: settings.autoLaunch,
          click: menuItem => {
            settings.autoLaunch = menuItem.checked
            saveSettings(settings)
            setAutoLaunch(settings.autoLaunch)
          }
        },
        {
          label: '退出游戏',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            isQuitting = true
            app.quit()
          }
        }
      ]
    },
    {
      label: '开发',
      submenu: [
        {
          label: '开发者工具',
          accelerator: 'F12',
          click: () => win?.webContents.toggleDevTools()
        },
        {
          label: '重新加载',
          accelerator: 'CmdOrCtrl+R',
          click: () => win?.webContents.reload()
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

const createWindow = () => {
  win = new BrowserWindow({
    title: APP_TITLE,
    icon: path.join(publicPath, 'favicon.ico'),
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath
    }
  })

  createAppMenu()
  win.loadFile(path.join(distPath, 'index.html'))

  /*
   * WebDAV CORS 绕过:注入 CORS 响应头。
   *
   * 渲染层目前没有任何 WebDAV 代码(grep PROPFIND / webdav 只命中这一处),
   * 但这段拦截器**无条件对所有响应生效**,故它有两条沉默的副作用:
   *   · 把任何响应的 access-control-allow-origin 改成 `*`
   *   · 剥掉 WWW-Authenticate —— 将来若加需要认证的接口,浏览器不会弹原生认证框,
   *     应用也收不到 401 质询,只会看到一个没有原因的失败
   *
   * 保留而不是删:它可能是给云存档预留的。真要接认证接口时,须先给它加 host 白名单。
   */
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    headers['access-control-allow-origin'] = ['*']
    headers['access-control-allow-methods'] = ['GET, PUT, DELETE, PROPFIND, HEAD, OPTIONS']
    headers['access-control-allow-headers'] = ['Authorization, Content-Type, Depth']
    // 剥离 WWW-Authenticate,防止弹出原生认证对话框(认证错误由应用处理)
    delete headers['www-authenticate']
    delete headers['WWW-Authenticate']
    callback({ responseHeaders: headers })
  })

  win.on('close', e => {
    if (settings.closeToTray && !isQuitting) {
      e.preventDefault()
      win.hide()
      createTray()
    }
  })
}

ipcMain.handle('get-settings', () => settings)

ipcMain.handle('set-settings', (_, newSettings) => {
  settings = { ...settings, ...newSettings }
  saveSettings(settings)

  setAutoLaunch(settings.autoLaunch)

  if (settings.closeToTray) {
    createTray()
  } else {
    destroyTray()
  }

  return { needRestart: false }
})

ipcMain.handle('restart-window', () => {
  if (win) {
    const bounds = win.getBounds()
    win.destroy()
    createWindow()
    win.setBounds(bounds)
  }
})

ipcMain.handle('quit-app', () => {
  isQuitting = true
  app.quit()
})

app.whenReady().then(async () => {
  // 开窗前清掉 Service Worker 与其缓存:Electron 允许 file:// 注册 SW,1.34.0 注册的 SW 接管导航后
  // fetch() file:// 失败致白屏,且先于新页面执行,只能由外壳拆。只动这两类存储,localStorage(存档)不碰
  try {
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })
  } catch {
    // 清不掉也照常开窗:sw.js 自身还有一道自我注销
  }
  createWindow()

  if (settings.closeToTray) {
    createTray()
  }

  setAutoLaunch(settings.autoLaunch)
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (win) {
    win.show()
  } else {
    createWindow()
  }
})
