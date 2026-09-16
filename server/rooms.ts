import { customAlphabet } from 'nanoid'
import { buildSchedule } from './content.js'
import {
  clampStrokes,
  createMicro,
  enterEmojiGuess,
  enterKlotterVote,
  enterLiveScore,
  enterSmsSabotage,
  enterSmsVote,
  resolveArena,
  resolveBlitz,
  resolveEmoji,
  resolveKlotter,
  resolveLabb,
  resolveLive,
  resolveSms,
  toPublicMicro,
} from './micros.js'
import {
  buildPulseChart,
  gradeHit,
  isHitGrade,
  multiplierFromHits,
  pulsePoints,
} from './pulse.js'
import type { EchoBag, Player, PublicRoom, RevealPayload, Room, RoomBanner, StrokePoint } from './types.js'

const codeAlpha = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ', 4)
const idAlpha = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10)

const rooms = new Map<string, Room>()
const socketToPlayer = new Map<string, { code: string; playerId: string }>()
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
const usedBlitz = new Map<string, Set<string>>()

const DISCONNECT_GRACE_MS = 60_000
const IDLE_MS = 12 * 60 * 60 * 1000

let persistHook: (() => void) | null = null

export function setPersistHook(fn: () => void) {
  persistHook = fn
}

function touch(room: Room) {
  room.updatedAt = Date.now()
  persistHook?.()
}

function living(room: Room): Player[] {
  return room.players.filter((p) => p.connected || p.socketId)
}

function activePlayers(room: Room): Player[] {
  return room.players.filter((p) => p.connected && p.playing)
}

function ensureUsed(code: string) {
  if (!usedBlitz.has(code)) usedBlitz.set(code, new Set())
  return usedBlitz.get(code)!
}

export function allRooms() {
  return rooms
}

export function getRoom(code: string) {
  return rooms.get(code.toUpperCase()) ?? null
}

export function getBinding(socketId: string) {
  return socketToPlayer.get(socketId) ?? null
}

export function hydrateRooms(list: Room[]) {
  rooms.clear()
  for (const r of list) {
    if (!r.echo.avatars) r.echo.avatars = {}
    if (!r.echo.emojiFails) r.echo.emojiFails = []
    if (!r.lastMults) r.lastMults = {}
    if (!r.banner) r.banner = null
    for (const p of r.players) {
      if (typeof p.playing !== 'boolean') p.playing = !p.host
    }
    if (r.pulse && !r.pulse.lastGrades) r.pulse.lastGrades = {}
    rooms.set(r.code, r)
  }
}

export function pruneIdleRooms() {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > IDLE_MS) {
      rooms.delete(code)
      usedBlitz.delete(code)
    }
  }
}

function emptyEcho(): EchoBag {
  return { wrongGuesses: [], highlights: [], avatars: {}, emojiFails: [] }
}

function setBanner(room: Room, text: string, kind: RoomBanner['kind'], ms = 2800) {
  room.banner = { text, kind, until: Date.now() + ms }
}

function showReveal(room: Room, payload: RevealPayload, ms = 5200) {
  room.status = 'reveal'
  room.lastReveal = payload
  room.revealUntil = Date.now() + ms
  room.pulse = null
  room.micro = null
  touch(room)
}

function enrichReveal(room: Room, payload: RevealPayload, prevLeaderId: string | null): RevealPayload {
  const ranked = [...payload.scores].sort((a, b) => b.score - a.score)
  const leader = ranked[0]
  let stoleLead: RevealPayload['stoleLead'] = null
  if (leader && prevLeaderId && leader.id !== prevLeaderId && (leader.delta ?? 0) > 0) {
    const from = room.players.find((p) => p.id === prevLeaderId)
    if (from) stoleLead = { name: leader.name, fromName: from.name }
  }
  return { ...payload, stoleLead: stoleLead ?? payload.stoleLead ?? null }
}

function currentLeaderId(room: Room): string | null {
  const ranked = [...room.players].filter((p) => p.playing).sort((a, b) => b.score - a.score)
  return ranked[0]?.id ?? null
}

function dramaReveal(room: Room) {
  const prev = currentLeaderId(room)
  return (r: Room, payload: RevealPayload, ms?: number) => {
    showReveal(r, enrichReveal(r, payload, prev), ms)
  }
}

export function createRoom(
  hostName: string,
  socketId: string,
  language: 'sv' | 'en' = 'sv',
  hostPlays = false,
): { room: Room; playerId: string } {
  let code = codeAlpha()
  while (rooms.has(code)) code = codeAlpha()

  const playerId = idAlpha()
  const host: Player = {
    id: playerId,
    name: hostName.trim().slice(0, 18) || 'Host',
    socketId,
    score: 0,
    streak: 0,
    connected: true,
    host: true,
    playing: hostPlays,
  }

  const room: Room = {
    code,
    status: 'lobby',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostId: playerId,
    players: [host],
    heat: 1,
    night: 1,
    round: 0,
    totalRounds: 0,
    schedule: [],
    currentMicro: null,
    pulse: null,
    micro: null,
    saboteurId: null,
    saboteurCharges: 0,
    echo: emptyEcho(),
    revealUntil: null,
    lastReveal: null,
    language,
    lastMults: {},
    banner: null,
  }

  rooms.set(code, room)
  socketToPlayer.set(socketId, { code, playerId })
  touch(room)
  return { room, playerId }
}

export function joinRoom(
  code: string,
  name: string,
  socketId: string,
): { room: Room; playerId: string } | { error: string } {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'lobby') return { error: 'Spelet har redan startat' }
  if (room.players.length >= 10) return { error: 'Rummet är fullt' }

  const playerId = idAlpha()
  room.players.push({
    id: playerId,
    name: name.trim().slice(0, 18) || 'Spelare',
    socketId,
    score: 0,
    streak: 0,
    connected: true,
    host: false,
    playing: true,
  })
  socketToPlayer.set(socketId, { code: room.code, playerId })
  touch(room)
  return { room, playerId }
}

export function reconnectSocket(code: string, playerId: string, socketId: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player) return { error: 'Spelare saknas' }

  const oldKey = [...disconnectTimers.keys()].find((k) => k.endsWith(`:${playerId}`))
  if (oldKey) {
    clearTimeout(disconnectTimers.get(oldKey))
    disconnectTimers.delete(oldKey)
  }

  if (player.socketId) socketToPlayer.delete(player.socketId)
  player.socketId = socketId
  player.connected = true
  socketToPlayer.set(socketId, { code: room.code, playerId })
  touch(room)
  return { room, playerId }
}

export function disconnectSocket(socketId: string, onChange: (code: string) => void) {
  const binding = socketToPlayer.get(socketId)
  if (!binding) return
  socketToPlayer.delete(socketId)
  const room = getRoom(binding.code)
  if (!room) return
  const player = room.players.find((p) => p.id === binding.playerId)
  if (!player) return
  player.connected = false
  player.socketId = null
  touch(room)
  onChange(room.code)

  const key = `${room.code}:${player.id}`
  const timer = setTimeout(() => {
    disconnectTimers.delete(key)
    const r = getRoom(binding.code)
    if (!r) return
    const p = r.players.find((x) => x.id === binding.playerId)
    if (!p || p.connected) return
    if (r.status === 'lobby') {
      r.players = r.players.filter((x) => x.id !== p.id)
      if (p.host && r.players.length) {
        r.players[0]!.host = true
        r.hostId = r.players[0]!.id
      }
      if (!r.players.length) {
        rooms.delete(r.code)
        usedBlitz.delete(r.code)
        return
      }
    }
    touch(r)
    onChange(r.code)
  }, DISCONNECT_GRACE_MS)
  disconnectTimers.set(key, timer)
}

export function setLanguage(code: string, playerId: string, language: 'sv' | 'en') {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara hosten' }
  if (room.status !== 'lobby') return { error: 'Kan inte ändra nu' }
  room.language = language
  touch(room)
  return { room }
}

export function setHostPlaying(code: string, playerId: string, playing: boolean) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara hosten' }
  if (room.status !== 'lobby') return { error: 'Kan inte ändra nu' }
  const host = room.players.find((p) => p.id === playerId)
  if (!host) return { error: 'Host saknas' }
  host.playing = playing
  touch(room)
  return { room }
}

function pickSaboteur(room: Room) {
  const pool = activePlayers(room)
  if (pool.length < 2) {
    room.saboteurId = null
    room.saboteurCharges = 0
    return
  }
  room.saboteurId = pool[Math.floor(Math.random() * pool.length)]!.id
  room.saboteurCharges = room.heat >= 3 ? 2 : 1
}

export function startGame(code: string, playerId: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara hosten kan starta' }
  if (room.status !== 'lobby') return { error: 'Spelet har startat' }
  if (activePlayers(room).length < 1) return { error: 'Behöver minst 1 spelare (host kan bara TV:a)' }

  for (const p of room.players) {
    p.score = 0
    p.streak = 0
  }
  room.echo = {
    ...emptyEcho(),
    avatars: room.echo.avatars,
    bestSms: room.echo.bestSms,
    highlights: room.echo.highlights.slice(-4),
  }
  room.schedule = buildSchedule(room.heat)
  room.totalRounds = room.schedule.length
  room.round = 0
  room.currentMicro = null
  room.micro = null
  room.lastReveal = null
  room.revealUntil = null
  room.lastMults = {}
  pickSaboteur(room)
  beginPulse(room, room.heat >= 5 ? 'finale' : 'warmup')
  touch(room)
  return { room }
}

export function rematch(code: string, playerId: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara hosten' }
  if (room.status !== 'finished') return { error: 'Inte klart än' }

  room.heat = Math.min(5, room.heat + 1)
  room.night += 1
  room.pulse = null
  room.micro = null
  room.round = 0
  room.currentMicro = null
  room.lastReveal = null
  room.revealUntil = null
  room.saboteurId = null
  room.saboteurCharges = 0
  room.echo = {
    ...emptyEcho(),
    highlights: room.echo.highlights.slice(-6),
    bestSms: room.echo.bestSms,
    avatars: room.echo.avatars,
  }
  for (const p of room.players) {
    p.score = 0
    p.streak = 0
    if (!p.host) p.playing = true
  }
  room.lastMults = {}
  room.schedule = buildSchedule(room.heat)
  room.totalRounds = room.schedule.length
  pickSaboteur(room)
  setBanner(room, `Heat ${room.heat} — kör!`, 'info', 2200)
  beginPulse(room, room.heat >= 5 ? 'finale' : 'warmup')
  if (room.heat >= 5) setBanner(room, 'HEAT 5 — RENT PULSE-OFF', 'finale', 3500)
  touch(room)
  return { room }
}

function beginPulse(room: Room, kind: 'warmup' | 'bridge' | 'finale') {
  room.status = 'pulse'
  room.pulse = buildPulseChart({ kind, heat: room.heat, startAt: Date.now() })
  room.micro = null
  room.currentMicro = null
}

function beginMicro(room: Room, kind: Room['schedule'][number]) {
  room.status = 'micro'
  room.currentMicro = kind
  room.pulse = null
  room.micro = createMicro(room, kind, ensureUsed(room.code))
}

function captureMults(room: Room) {
  if (!room.pulse) return
  const next: Record<string, number> = {}
  for (const p of living(room)) {
    next[p.id] = multiplierFromHits(room.pulse.hits[p.id] ?? {}, room.pulse.notes.length)
  }
  room.lastMults = next
}

function playerPulseMult(room: Room, playerId: string): number {
  if (!room.pulse) return 1
  return multiplierFromHits(room.pulse.hits[playerId] ?? {}, room.pulse.notes.length)
}

function finishNight(room: Room) {
  room.status = 'finished'
  room.pulse = null
  room.micro = null
  room.revealUntil = null
  const ranked = [...room.players].sort((a, b) => b.score - a.score)
  const winner = ranked[0]
  if (winner) room.echo.highlights.push(`${winner.name} vann natten (Heat ${room.heat})`)
  if (room.saboteurId) {
    const sab = room.players.find((p) => p.id === room.saboteurId)
    const last = ranked[ranked.length - 1]
    if (sab && last && sab.id === last.id) {
      room.echo.highlights.push(`Sabotören ${sab.name} avslöjad sist!`)
    } else if (sab && winner && sab.id === winner.id) {
      room.echo.highlights.push(`Sabotören ${sab.name} smet iväg med segern`)
    }
  }
}

function advanceAfterPulse(room: Room) {
  if (room.pulse) {
    for (const p of living(room)) {
      const hits = room.pulse.hits[p.id] ?? {}
      for (const note of room.pulse.notes) {
        if (!hits[note.id]) {
          hits[note.id] = 'miss'
          p.streak = 0
        }
      }
      room.pulse.hits[p.id] = hits
      room.pulse.multiplier = multiplierFromHits(hits, room.pulse.notes.length)
    }
    captureMults(room)
  }

  if (room.pulse?.kind === 'finale' || room.heat >= 5) {
    finishNight(room)
    return
  }

  if (room.round >= room.schedule.length) {
    const sorted = [...room.players].filter((p) => p.playing).sort((a, b) => b.score - a.score)
    if (sorted.length >= 2 && sorted[0]!.score - sorted[1]!.score <= 400) {
      setBanner(room, 'PULSE-OFF — för jämt!', 'finale', 4000)
      beginPulse(room, 'finale')
      return
    }
    finishNight(room)
    return
  }

  const kind = room.schedule[room.round]!
  room.round += 1
  beginMicro(room, kind)
}

function advanceAfterMicro(room: Room) {
  if (room.round >= room.schedule.length) {
    const sorted = [...room.players].filter((p) => p.playing).sort((a, b) => b.score - a.score)
    if (sorted.length >= 2 && sorted[0]!.score - sorted[1]!.score <= 400) {
      setBanner(room, 'PULSE-OFF — för jämt!', 'finale', 4000)
      beginPulse(room, 'finale')
      return
    }
    finishNight(room)
    return
  }
  beginPulse(room, 'bridge')
}

export function submitPulseHit(code: string, playerId: string, noteId: string, lane: number) {
  const room = getRoom(code)
  if (!room || room.status !== 'pulse' || !room.pulse) return { error: 'Ingen puls' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player) return { error: 'Spelare saknas' }
  if (!player.playing) return { error: 'Du hostar bara' }
  const note = room.pulse.notes.find((n) => n.id === noteId)
  if (!note) return { error: 'Okänd not' }
  if (note.lane !== lane) return { error: 'Fel lane' }

  const hits = room.pulse.hits[playerId] ?? {}
  if (hits[noteId]) return { ok: true, grade: hits[noteId] }

  const delta = Date.now() - note.hitAt - 40
  const grade = gradeHit(delta)
  hits[noteId] = grade
  room.pulse.hits[playerId] = hits
  room.pulse.lastGrades[playerId] = grade

  let points = 0
  if (!isHitGrade(grade)) {
    player.streak = 0
  } else {
    player.streak += 1
    points = pulsePoints(grade, player.streak)
    player.score += points
  }

  if (note.sync) {
    const syn = room.pulse.syncResults[note.id] ?? { hit: 0, miss: 0, resolved: false }
    if (!isHitGrade(grade)) syn.miss += 1
    else syn.hit += 1
    const needed = Math.max(1, activePlayers(room).length)
    if (!syn.resolved && syn.hit + syn.miss >= needed) {
      syn.resolved = true
      if (syn.hit >= syn.miss) {
        for (const p of activePlayers(room)) p.score += 80
        room.echo.highlights.push('Sync Hit! Rummet i fas')
        setBanner(room, 'SYNC HIT — alla i fas!', 'sync', 2500)
      } else {
        room.echo.highlights.push('Sync Miss — kaos!')
        setBanner(room, 'SYNC MISS — kaos!', 'drama', 2500)
      }
    }
    room.pulse.syncResults[note.id] = syn
  }

  touch(room)
  return { ok: true, grade, points, streak: player.streak }
}

export function useSabotage(code: string, playerId: string, targetId: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.saboteurId !== playerId) return { error: 'Du är inte sabotör' }
  if (room.saboteurCharges <= 0) return { error: 'Inga laddningar kvar' }

  const target = room.players.find((p) => p.id === targetId)
  if (!target || targetId === playerId) return { error: 'Ogiltigt mål' }

  if (room.status === 'pulse' && room.pulse) {
    const upcoming = room.pulse.notes.find((n) => n.hitAt > Date.now() + 100)
    if (upcoming) {
      const hits = room.pulse.hits[targetId] ?? {}
      if (!hits[upcoming.id]) {
        hits[upcoming.id] = 'miss'
        room.pulse.hits[targetId] = hits
        target.streak = 0
      }
    }
  } else if (room.status === 'micro' && room.micro?.kind === 'klotter') {
    room.micro.klotter.orbUntil = Date.now() + 4000
  } else if (room.status === 'micro' && room.micro?.kind === 'arena') {
    const f = room.micro.arena.fighters[targetId]
    if (f) f.hp = Math.max(0, f.hp - 25)
  } else {
    return { error: 'Kan inte sabotera nu' }
  }

  room.saboteurCharges -= 1
  room.echo.highlights.push(`Sabotage! ${target.name}`)
  setBanner(room, `💥 ${target.name} saboterad!`, 'sabotage', 3000)
  touch(room)
  return { ok: true }
}

export function submitBlitzAnswer(code: string, playerId: string, index: number) {
  const room = getRoom(code)
  if (!room || room.status !== 'micro' || room.micro?.kind !== 'blitz') return { error: 'Ingen blitz' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player?.playing) return { error: 'Du hostar bara' }
  const blitz = room.micro.blitz
  if (blitz.answers[playerId]) return { ok: true }
  if (index < 0 || index >= blitz.options.length) return { error: 'Ogiltigt svar' }
  blitz.answers[playerId] = { index, at: Date.now() }
  if (index !== blitz.correctIndex) {
    player.streak = 0
    const wrong = blitz.options[index]
    if (wrong && !room.echo.wrongGuesses.includes(wrong)) room.echo.wrongGuesses.push(wrong)
  }
  touch(room)
  if (Object.keys(blitz.answers).length >= activePlayers(room).length) resolveBlitz(room, dramaReveal(room))
  return { ok: true }
}

export function submitSmsDraft(code: string, playerId: string, text: string) {
  const room = getRoom(code)
  if (!room || room.status !== 'micro' || room.micro?.kind !== 'sms') return { error: 'Ingen sms-runda' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player?.playing) return { error: 'Du hostar bara' }
  const sms = room.micro.sms
  if (sms.phase !== 'write') return { error: 'Fel fas' }
  const clean = text.trim().slice(0, 140)
  if (!clean) return { error: 'Tomt SMS' }
  sms.drafts[playerId] = clean
  touch(room)
  if (Object.keys(sms.drafts).length >= activePlayers(room).length) {
    enterSmsSabotage(room)
    touch(room)
  }
  return { ok: true }
}

export function submitSmsSabotage(code: string, playerId: string, text: string) {
  const room = getRoom(code)
  if (!room || room.status !== 'micro' || room.micro?.kind !== 'sms') return { error: 'Ingen sms-runda' }
  if (!room.players.find((p) => p.id === playerId)?.playing) return { error: 'Du hostar bara' }
  const sms = room.micro.sms
  if (sms.phase !== 'sabotage') return { error: 'Fel fas' }
  const clean = text.trim().slice(0, 160)
  if (!clean) return { error: 'Tomt' }
  const victim = sms.assignments[playerId]
  if (!victim) return { error: 'Ingen tilldelning' }
  sms.sabotaged[victim] = clean
  touch(room)
  if (Object.keys(sms.sabotaged).length >= activePlayers(room).length) {
    enterSmsVote(room)
    touch(room)
  }
  return { ok: true }
}

export function submitSmsVote(code: string, playerId: string, targetId: string) {
  const room = getRoom(code)
  if (!room || room.status !== 'micro' || room.micro?.kind !== 'sms') return { error: 'Ingen sms-runda' }
  if (!room.players.find((p) => p.id === playerId)?.playing) return { error: 'Du hostar bara' }
  const sms = room.micro.sms
  if (sms.phase !== 'vote') return { error: 'Fel fas' }
  if (!sms.sabotaged[targetId]) return { error: 'Ogiltig' }
  sms.votes[playerId] = targetId
  touch(room)
  if (Object.keys(sms.votes).length >= activePlayers(room).length) resolveSms(room, dramaReveal(room))
  return { ok: true }
}

export function submitEmoji(code: string, playerId: string, text: string) {
  const room = getRoom(code)
  if (!room || room.status !== 'micro' || room.micro?.kind !== 'emoji') return { error: 'Ingen emoji-runda' }
  if (!room.players.find((p) => p.id === playerId)?.playing) return { error: 'Du hostar bara' }
  const e = room.micro.emoji
  if (e.phase !== 'emoji') return { error: 'Fel fas' }
  const clean = text.trim().slice(0, 24)
  if (!clean) return { error: 'Tomt' }
  e.emojis[playerId] = clean
  touch(room)
  if (Object.keys(e.emojis).length >= activePlayers(room).length) {
    enterEmojiGuess(room)
    touch(room)
  }
  return { ok: true }
}

export function submitEmojiGuess(code: string, playerId: string, text: string) {
  const room = getRoom(code)
  if (!room || room.status !== 'micro' || room.micro?.kind !== 'emoji') return { error: 'Ingen emoji-runda' }
  if (!room.players.find((p) => p.id === playerId)?.playing) return { error: 'Du hostar bara' }
  const e = room.micro.emoji
  if (e.phase !== 'guess') return { error: 'Fel fas' }
  const clean = text.trim().slice(0, 40)
  if (!clean) return { error: 'Tomt' }
  e.guesses[playerId] = clean
  touch(room)
  if (Object.keys(e.guesses).length >= activePlayers(room).length) resolveEmoji(room, dramaReveal(room))
  return { ok: true }
}

export function submitKlotter(code: string, playerId: string, strokes: StrokePoint[][]) {
  const room = getRoom(code)
  if (!room || room.status !== 'micro' || room.micro?.kind !== 'klotter') return { error: 'Ingen klotter' }
  if (!room.players.find((p) => p.id === playerId)?.playing) return { error: 'Du hostar bara' }
  const k = room.micro.klotter
  if (k.phase !== 'draw') return { error: 'Fel fas' }
  k.drawings[playerId] = clampStrokes(strokes)
  touch(room)
  if (Object.keys(k.drawings).length >= activePlayers(room).length) {
    enterKlotterVote(room)
    touch(room)
  }
  return { ok: true }
}

export function submitKlotterVote(code: string, playerId: string, targetId: string) {
  const room = getRoom(code)
  if (!room || room.status !== 'micro' || room.micro?.kind !== 'klotter') return { error: 'Ingen klotter' }
  if (!room.players.find((p) => p.id === playerId)?.playing) return { error: 'Du hostar bara' }
  const k = room.micro.klotter
  if (k.phase !== 'vote') return { error: 'Fel fas' }
  if (!k.drawings[targetId]) return { error: 'Ogiltig' }
  k.votes[playerId] = targetId
  touch(room)
  if (Object.keys(k.votes).length >= activePlayers(room).length) resolveKlotter(room, dramaReveal(room))
  return { ok: true }
}

export function arenaPunch(code: string, playerId: string) {
  const room = getRoom(code)
  if (!room || room.status !== 'micro' || room.micro?.kind !== 'arena') return { error: 'Ingen arena' }
  if (!room.players.find((p) => p.id === playerId)?.playing) return { error: 'Du hostar bara' }
  const a = room.micro.arena
  const me = a.fighters[playerId]
  if (!me || me.hp <= 0) return { error: 'K.O.' }
  me.punches += 1
  const others = Object.values(a.fighters).filter((f) => f.id !== playerId && f.hp > 0)
  if (others.length) {
    const t = others[Math.floor(Math.random() * others.length)]!
    t.hp = Math.max(0, t.hp - 4)
  }
  touch(room)
  return { ok: true }
}

export function labbTap(code: string, playerId: string, step: string) {
  const room = getRoom(code)
  if (!room || room.status !== 'micro' || room.micro?.kind !== 'labb') return { error: 'Inget labb' }
  if (!room.players.find((p) => p.id === playerId)?.playing) return { error: 'Du hostar bara' }
  const l = room.micro.labb
  const idx = l.progress[playerId] ?? 0
  const expected = l.recipe[idx]
  if (!expected) return { error: 'Klar' }
  if (step !== expected) {
    l.fails[playerId] = (l.fails[playerId] ?? 0) + 1
    l.progress[playerId] = 0
    touch(room)
    return { ok: true, correct: false }
  }
  const next = idx + 1
  if (next >= l.recipe.length) {
    l.delivered[playerId] = (l.delivered[playerId] ?? 0) + 1
    l.progress[playerId] = 0
  } else l.progress[playerId] = next
  touch(room)
  return { ok: true, correct: true }
}

export function liveDone(code: string, playerId: string, write?: string) {
  const room = getRoom(code)
  if (!room || room.status !== 'micro' || room.micro?.kind !== 'live') return { error: 'Inget live-test' }
  const live = room.micro.live
  if (live.phase !== 'play') return { error: 'Fel fas' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player?.playing) return { error: 'Du hostar bara' }
  live.done[playerId] = true
  if (live.kind === 'write' && write) live.writes[playerId] = write.trim().slice(0, 80)
  touch(room)
  const contestants = activePlayers(room)
  if (contestants.every((p) => live.done[p.id])) {
    enterLiveScore(room)
    touch(room)
  }
  return { ok: true }
}

export function liveScore(code: string, hostId: string, targetId: string, stars: number) {
  const room = getRoom(code)
  if (!room || room.status !== 'micro' || room.micro?.kind !== 'live') return { error: 'Inget live-test' }
  if (room.hostId !== hostId) return { error: 'Bara hosten' }
  const live = room.micro.live
  if (live.phase !== 'score') return { error: 'Fel fas' }
  const s = Math.min(5, Math.max(1, Math.round(stars)))
  live.scores[targetId] = s
  touch(room)
  const contestants = room.players.filter((p) => p.playing)
  if (contestants.every((p) => live.scores[p.id] != null)) resolveLive(room, dramaReveal(room))
  return { ok: true }
}

export function tickRooms(): string[] {
  const changed: string[] = []
  const now = Date.now()

  for (const room of rooms.values()) {
    let dirty = false

    if (room.status === 'pulse' && room.pulse && now >= room.pulse.endsAt) {
      advanceAfterPulse(room)
      dirty = true
    }

    if (room.status === 'micro' && room.micro) {
      const m = room.micro
      if (m.kind === 'blitz' && now >= m.blitz.endsAt) {
        resolveBlitz(room, dramaReveal(room))
        dirty = true
      } else if (m.kind === 'sms' && now >= m.sms.endsAt) {
        if (m.sms.phase === 'write') {
          for (const p of activePlayers(room)) {
            if (!m.sms.drafts[p.id]) m.sms.drafts[p.id] = room.language === 'sv' ? '…senare' : '…later'
          }
          enterSmsSabotage(room)
          dirty = true
        } else if (m.sms.phase === 'sabotage') {
          for (const p of activePlayers(room)) {
            const victim = m.sms.assignments[p.id]
            if (victim && !m.sms.sabotaged[victim] && m.sms.drafts[victim]) {
              m.sms.sabotaged[victim] = `🚨 ${m.sms.drafts[victim]}`
            }
          }
          enterSmsVote(room)
          dirty = true
        } else {
          resolveSms(room, dramaReveal(room))
          dirty = true
        }
      } else if (m.kind === 'emoji' && now >= m.emoji.endsAt) {
        if (m.emoji.phase === 'emoji') {
          enterEmojiGuess(room)
          dirty = true
        } else {
          resolveEmoji(room, dramaReveal(room))
          dirty = true
        }
      } else if (m.kind === 'klotter' && now >= m.klotter.endsAt) {
        if (m.klotter.phase === 'draw') {
          enterKlotterVote(room)
          dirty = true
        } else {
          resolveKlotter(room, dramaReveal(room))
          dirty = true
        }
      } else if (m.kind === 'arena' && now >= m.arena.endsAt) {
        resolveArena(room, dramaReveal(room))
        dirty = true
      } else if (m.kind === 'labb' && now >= m.labb.endsAt) {
        resolveLabb(room, dramaReveal(room))
        dirty = true
      } else if (m.kind === 'live' && now >= m.live.endsAt) {
        if (m.live.phase === 'play') {
          enterLiveScore(room)
          dirty = true
        } else {
          for (const p of room.players.filter((x) => x.playing)) {
            if (m.live.scores[p.id] == null) m.live.scores[p.id] = m.live.done[p.id] ? 3 : 1
          }
          resolveLive(room, dramaReveal(room))
          dirty = true
        }
      }
    }

    if (room.status === 'reveal' && room.revealUntil && now >= room.revealUntil) {
      advanceAfterMicro(room)
      dirty = true
    }

    if (room.banner && now >= room.banner.until) {
      room.banner = null
      dirty = true
    }

    if (dirty) {
      touch(room)
      changed.push(room.code)
    }
  }

  return changed
}

export function toPublicRoom(room: Room, viewerId?: string): PublicRoom {
  const you = viewerId ? room.players.find((p) => p.id === viewerId) : null
  const pulse = room.pulse
    ? {
        kind: room.pulse.kind,
        bpm: room.pulse.bpm,
        startedAt: room.pulse.startedAt,
        endsAt: room.pulse.endsAt,
        notes: room.pulse.notes,
        syncResults: room.pulse.syncResults,
        multiplier: room.pulse.multiplier,
        lastGrades: room.pulse.lastGrades,
        yourHits: viewerId ? room.pulse.hits[viewerId] ?? {} : {},
        yourMultiplier: viewerId ? playerPulseMult(room, viewerId) : room.pulse.multiplier,
        crowd: room.players
          .filter((p) => p.playing)
          .map((p) => ({
            id: p.id,
            name: p.name,
            lastGrade: room.pulse!.lastGrades[p.id] ?? null,
            streak: p.streak,
            score: p.score,
          }))
          .sort((a, b) => b.score - a.score),
      }
    : null

  const banner =
    room.banner && room.banner.until > Date.now() ? room.banner : null

  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    youId: viewerId ?? null,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      streak: p.streak,
      connected: p.connected,
      host: p.host,
      playing: p.playing,
    })),
    heat: room.heat,
    night: room.night,
    round: room.round,
    totalRounds: room.totalRounds,
    currentMicro: room.currentMicro,
    schedule: room.schedule,
    pulse,
    micro: toPublicMicro(room, viewerId),
    saboteurId: room.status === 'finished' ? room.saboteurId : null,
    youAreSaboteur: Boolean(viewerId && room.saboteurId === viewerId),
    saboteurCharges: viewerId && room.saboteurId === viewerId ? room.saboteurCharges : 0,
    echo: room.echo,
    revealUntil: room.revealUntil,
    lastReveal: room.lastReveal,
    language: room.language,
    serverNow: Date.now(),
    playingCount: room.players.filter((p) => p.playing && p.connected).length,
    banner,
    yourStreak: you?.streak ?? 0,
  }
}
