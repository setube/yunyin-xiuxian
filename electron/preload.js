const { contextBridge, ipcRenderer } = require('electron')

/*
 * 渲染进程可用的 Electron 接口。
 *
 * 当前前端(src/)没有任何地方调用 electronAPI.* —— 窗口设置(托盘常驻、开机自启)
 * 由主进程自己读写 userData/settings.json,不经过渲染进程。
 * 这四个方法是给将来留的入口;改它们之前先确认主进程侧还认得这些通道名。
 */
contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),

  setSettings: settings => ipcRenderer.invoke('set-settings', settings),

  /** 重建窗口(主进程保留原有 bounds)。原注释写成「切换边框模式」,但 main.js 并不处理边框 */
  restartWindow: () => ipcRenderer.invoke('restart-window'),

  quitApp: () => ipcRenderer.invoke('quit-app')
})
