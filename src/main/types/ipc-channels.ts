export const IPC = {
  OVERLAY_STATE_UPDATE: 'overlay:state-update',  // main → overlay
  OVERLAY_STATE_PUSH: 'overlay:state-push',       // renderer → main (kernel updates)
  OVERLAY_TOGGLE: 'overlay:toggle',
  SCREEN_FRAME_READY: 'screen:frame-ready',
  SCREEN_SOURCE_ID_GET: 'screen:get-source-id',  // overlay → main (invoke)
  GAZE_UPDATE: 'gaze:update',
  PRESCRIPTION_SAVE: 'prescription:save',
  PRESCRIPTION_LOAD: 'prescription:load',
  DISTANCE_UPDATE: 'distance:update',
  WINDOW_SHOW_MAIN: 'window:show-main',
  WINDOW_HIDE_MAIN: 'window:hide-main',
  DISPLAY_INFO: 'display:info',
  OVERLAY_INTERACTIVE: 'overlay:interactive',
  VALIDATION_EXPORT: 'validation:export',
} as const

export type IPC = typeof IPC
export type IpcChannel = IPC[keyof IPC]
