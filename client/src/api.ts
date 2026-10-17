import { io, type Socket } from 'socket.io-client'
import type { PublicRoom } from './types'

const SESSION_KEY = 'pulskaos-session'

type Session = { code: string; playerId: string; name: string }

let socket: Socket | null = null
let roomHandler: ((room: PublicRoom) => void) | null = null
let connHandler: ((connected: boolean) => void) | null = null
let rejoinInFlight: Promise<Session | null> | null = null

function socketUrl() {
  const env = import.meta.env.VITE_SOCKET_URL as string | undefined
  return env && env.length ? env : undefined
}

function isGoneError(error: string) {
  const e = error.toLowerCase()
  return (
    e.includes('finns inte') ||
    e.includes('saknas') ||
    e.includes('not found') ||
    e.includes('missing')
  )
}

export function getSocket() {
  if (!socket) {
    socket = io(socketUrl(), {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 400,
      reconnectionDelayMax: 4000,
      timeout: 12000,
    })
    socket.on('room', (room: PublicRoom) => roomHandler?.(room))
    socket.on('connect', () => {
      connHandler?.(true)
      // Socket.io gives a new id after every reconnect — re-bind the seat.
      void ensureSessionBound()
    })
    socket.on('disconnect', () => {
      connHandler?.(false)
    })
  }
  return socket
}

export function bindRoom(handler: (room: PublicRoom) => void) {
  roomHandler = handler
}

export function bindConnection(handler: (connected: boolean) => void) {
  connHandler = handler
  handler(Boolean(socket?.connected))
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

function whenConnected(s: Socket, ms = 12000): Promise<void> {
  if (s.connected) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      cleanup()
      reject(new Error('Ingen anslutning'))
    }, ms)
    const onConnect = () => {
      cleanup()
      resolve()
    }
    const cleanup = () => {
      window.clearTimeout(t)
      s.off('connect', onConnect)
    }
    s.once('connect', onConnect)
  })
}

function emitAck<T = Record<string, unknown>>(
  event: string,
  data?: unknown,
): Promise<T> {
  const s = getSocket()
  return whenConnected(s).then(
    () =>
      new Promise((resolve, reject) => {
        s.timeout(12000).emit(event, data ?? {}, (err: Error | null, res: T) => {
          if (err) reject(err)
          else resolve(res)
        })
      }),
  )
}

/** Re-attach local session to the current socket. Safe to call often. */
export async function ensureSessionBound(): Promise<Session | null> {
  const session = loadSession()
  if (!session) return null
  if (rejoinInFlight) return rejoinInFlight

  rejoinInFlight = (async () => {
    try {
      const res = await emitAck<{ ok?: boolean; error?: string }>('rejoin', {
        code: session.code,
        playerId: session.playerId,
      })
      if (res.error) {
        if (isGoneError(res.error)) clearSession()
        return null
      }
      return session
    } catch {
      // Transient network — keep session so the next connect can retry.
      return null
    } finally {
      rejoinInFlight = null
    }
  })()

  return rejoinInFlight
}

async function leavePreviousSeat() {
  const prev = loadSession()
  if (!prev) return
  try {
    await ensureSessionBound()
    await emitAck('leave')
  } catch {
    /* old room may already be gone */
  }
  clearSession()
}

export async function createGame(name: string, language: 'sv' | 'en', hostPlays = false) {
  await leavePreviousSeat()
  const res = await emitAck<{ ok?: boolean; error?: string; playerId?: string; code?: string }>(
    'create',
    { name, language, hostPlays },
  )
  if (res.error || !res.code || !res.playerId) throw new Error(res.error || 'Kunde inte skapa')
  saveSession({ code: res.code, playerId: res.playerId, name })
  return res
}

export async function joinGame(code: string, name: string) {
  const prev = loadSession()
  if (prev && prev.code === code.toUpperCase()) {
    const rebound = await ensureSessionBound()
    if (rebound) return { ok: true, code: rebound.code, playerId: rebound.playerId }
  }
  await leavePreviousSeat()
  const res = await emitAck<{ ok?: boolean; error?: string; playerId?: string; code?: string }>(
    'join',
    { code, name },
  )
  if (res.error || !res.code || !res.playerId) throw new Error(res.error || 'Kunde inte gå med')
  saveSession({ code: res.code, playerId: res.playerId, name })
  return res
}

export async function rejoinGame() {
  return ensureSessionBound()
}

export const startGame = () => emitAck('start')
export const backToLobby = () => emitAck('backToLobby')
export async function leaveGame() {
  try {
    await emitAck('leave')
  } finally {
    clearSession()
  }
}
export const rematchGame = () => emitAck('voteRematch')
export const voteRematch = () => emitAck('voteRematch')
export const setLanguage = (language: 'sv' | 'en') => emitAck('setLanguage', { language })
export const setHostPlaying = (playing: boolean) => emitAck('setHostPlaying', { playing })
export const pulseHit = (noteId: string, lane: number) =>
  emitAck<{ ok?: boolean; grade?: string; points?: number; streak?: number; error?: string }>(
    'pulseHit',
    { noteId, lane },
  )
export const useSabotage = (targetId: string) => emitAck('sabotage', { targetId })
export const blitzAnswer = (index: number) => emitAck('blitzAnswer', { index })
export const smsDraft = (text: string) => emitAck('smsDraft', { text })
export const smsSabotage = (text: string) => emitAck('smsSabotage', { text })
export const smsVote = (targetId: string) => emitAck('smsVote', { targetId })
export const emojiSubmit = (text: string) => emitAck('emojiSubmit', { text })
export const emojiGuess = (text: string) => emitAck('emojiGuess', { text })
export const klotterSubmit = (strokes: { x: number; y: number }[][]) =>
  emitAck('klotterSubmit', { strokes })
export const klotterVote = (targetId: string) => emitAck('klotterVote', { targetId })
export const arenaPunch = () => emitAck('arenaPunch')
export const arenaSubmit = (strokes: { x: number; y: number }[][]) =>
  emitAck('arenaSubmit', { strokes })
export const labbTap = (step: string) =>
  emitAck<{ ok?: boolean; correct?: boolean; error?: string }>('labbTap', { step })
export const liveDone = (write?: string) => emitAck('liveDone', { write })
export const liveScore = (targetId: string, stars: number) =>
  emitAck('liveScore', { targetId, stars })
