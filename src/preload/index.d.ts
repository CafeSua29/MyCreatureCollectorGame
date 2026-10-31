import { ElectronAPI } from '@electron-toolkit/preload'
import type { GameApi } from './api'

declare global {
  interface Window {
    electron: ElectronAPI
    api: GameApi
  }
}
