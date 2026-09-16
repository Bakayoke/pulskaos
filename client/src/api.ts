import { io, type Socket } from 'socket.io-client'
import type { PublicRoom } from './types'

const SESSION_KEY = 'pulskaos-session'

type Session = { code: string; playerId: string; name: string }

let socket: Socket | null = null
let roomHandler: ((room: PublicRoom) => void) | null = null

function socketUrl() {
  const env = import.meta.env.VITE_SOCKET_URL as string | undefined
  return env && env.length ? env : undefined
}

export function getSocket() {
  if (!socket) {
    socket = io(socketUrl(), {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    })
    socket.on('room', (room: PublicRoom) => roomHandler?.(room))
  }
  return socket
}

export function bindRoom(handler: (room: PublicRoom) => void) {
  roomHandler = handler
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

function emitAck<T = Record<string, unknown>>(
  event: string,
  data?: unknown,
): Promise<T> {
  const s = getSocket()
  return new Promise((resolve, reject) => {
    s.timeout(12000).emit(event, data ?? {}, (err: Error | null, res: T) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

export async function createGame(name: string, language: 'sv' | 'en', hostPlays = false) {
  const res = await emitAck<{ ok?: boolean; error?: string; playerId?: string; code?: string }>(
    'create',
    { name, language, hostPlays },
  )
  if (res.error || !res.code || !res.playerId) throw new Error(res.error || 'Kunde inte skapa')
  saveSession({ code: res.code, playerId: res.playerId, name })
  return res
}

export async function joinGame(code: string, name: string) {
  const res = await emitAck<{ ok?: boolean; error?: string; playerId?: string; code?: string }>(
    'join',
    { code, name },
  )
  if (res.error || !res.code || !res.playerId) throw new Error(res.error || 'Kunde inte gå med')
  saveSession({ code: res.code, playerId: res.playerId, name })
  return res
}

export async function rejoinGame() {
  const session = loadSession()
  if (!session) return null
  const res = await emitAck<{ ok?: boolean; error?: string }>('rejoin', {
    code: session.code,
    playerId: session.playerId,
  })
  if (res.error) {
    clearSession()
    return null
  }
  return session
}

export const startGame = () => emitAck('start')
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
export const labbTap = (step: string) =>
  emitAck<{ ok?: boolean; correct?: boolean; error?: string }>('labbTap', { step })
export const liveDone = (write?: string) => emitAck('liveDone', { write })
export const liveScore = (targetId: string, stars: number) =>
  emitAck('liveScore', { targetId, stars })
