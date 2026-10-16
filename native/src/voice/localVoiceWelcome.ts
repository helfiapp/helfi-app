export const LOCAL_VOICE_WELCOME_TEXT = 'Hi, I’m Helfi. What can I help you with?'

type WelcomeEvent = { playbackId?: string; status?: string; completed?: boolean }
type WelcomeIo = {
  playbackId: string
  isCurrent: () => boolean
  assetUri: () => Promise<string>
  player?: { playVoiceWelcome?: (uri: string, id: string) => Promise<boolean>; stopVoiceWelcome?: (id: string) => Promise<unknown> } | null
  listen: (callback: (event: WelcomeEvent) => void) => { remove: () => void }
  onStage: (stage: string) => void
  onPlaying: (playing: boolean) => void
  onComplete: (text: string) => void
  onUnavailable: (message: string) => void
}

// A single bundled recording under the existing native WebRTC audio session.
// This helper has no speech generation, networking, billing or app-action path.
export function createLocalVoiceWelcome(io: WelcomeIo) {
  let started = false
  let cancelled = false
  let completed = false
  let playing = false
  let nativeRequested = false
  let subscription: { remove: () => void } | null = null
  const current = () => !cancelled && !completed && io.isCurrent()
  const detach = () => { subscription?.remove(); subscription = null }
  const stop = async (reason = 'stopped') => {
    if (cancelled || completed) return
    cancelled = true
    detach()
    if (playing) { playing = false; io.onPlaying(false) }
    io.onStage(`welcome-${reason}`)
    if (nativeRequested) await io.player?.stopVoiceWelcome?.(io.playbackId).catch(() => {})
  }
  const start = async () => {
    if (started || !current()) return
    started = true
    if (!io.player?.playVoiceWelcome || !io.player.stopVoiceWelcome) {
      cancelled = true
      io.onStage('welcome-unavailable')
      io.onUnavailable('This app build cannot play the opening welcome. You can start speaking.')
      return
    }
    try {
      subscription = io.listen(event => {
        if (event.playbackId !== io.playbackId || !current()) return
        if (event.status === 'started') {
          if (playing) return
          playing = true
          io.onStage('welcome-started')
          io.onPlaying(true)
        } else if (event.status === 'finished' && event.completed === true && playing) {
          completed = true
          playing = false
          detach()
          io.onPlaying(false)
          io.onStage('welcome-finished')
          io.onComplete(LOCAL_VOICE_WELCOME_TEXT)
        } else if (['stopped', 'interrupted', 'failed'].includes(event.status || '')) {
          void stop(event.status).then(() => {
            if (event.status === 'failed' && io.isCurrent()) io.onUnavailable('The opening welcome could not be played. You can start speaking.')
          })
        }
      })
      const uri = await io.assetUri()
      if (!current()) { detach(); return }
      if (!uri.startsWith('file://')) throw new Error('The bundled opening welcome is unavailable.')
      nativeRequested = true
      if (!await io.player.playVoiceWelcome(uri, io.playbackId)) throw new Error('The opening welcome could not be played.')
      // A stop while the native call was pending must win over its late result.
      if (!current() && !completed) await io.player.stopVoiceWelcome(io.playbackId).catch(() => {})
    } catch {
      if (!current()) return
      await stop('unavailable')
      if (io.isCurrent()) io.onUnavailable('The opening welcome could not be played. You can start speaking.')
    }
  }
  return { start, stop, isPlaying: () => playing }
}
