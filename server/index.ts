import cors from 'cors'
import express from 'express'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import {
  initPersist,
  loadSnapshot,
  persistStatus,
  scheduleSave,
} from './persist.js'
import {
  allRooms,
  createRoom,
  disconnectSocket,
  getBinding,
  hydrateRooms,
  joinRoom,
  pruneIdleRooms,
  reconnectSocket,
  rematch,
  setLanguage,
  setHostPlaying,
  setPersistHook,
  startGame,
  submitBlitzAnswer,
  submitPulseHit,
  submitSmsDraft,
  submitSmsSabotage,
  submitSmsVote,
  submitEmoji,
  submitEmojiGuess,
  submitKlotter,
  submitKlotterVote,
  arenaPunch,
  labbTap,
  liveDone,
  liveScore,
  tickRooms,
  toPublicRoom,
  useSabotage,
} from './rooms.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3001)

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://pulskaos.com',
  'https://www.pulskaos.com',
]
const allowedOrigins = [
  ...defaultOrigins,
  ...(process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
]

const app = express()
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
      return cb(null, false)
    },
  }),
)
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    game: 'pulskaos',
    rooms: allRooms().size,
    persist: persistStatus(),
  })
})

const dist = path.join(__dirname, '../client/dist')
app.use(express.static(dist))
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
  res.sendFile(path.join(dist, 'index.html'), (err) => {
    if (err) next()
  })
})

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  pingInterval: 10000,
  pingTimeout: 20000,
})

function broadcastRoom(code: string) {
  const room = [...allRooms().values()].find((r) => r.code === code)
  if (!room) return
  for (const [, socket] of io.sockets.sockets) {
    const binding = getBinding(socket.id)
    if (!binding || binding.code !== code) continue
    socket.emit('room', toPublicRoom(room, binding.playerId))
  }
}

function persistAll() {
  scheduleSave({
    version: 1,
    savedAt: Date.now(),
    rooms: [...allRooms().values()],
  })
}

setPersistHook(persistAll)

io.on('connection', (socket) => {
  socket.on('create', (data, ack) => {
    const name = String(data?.name ?? 'Host')
    const language = data?.language === 'en' ? 'en' : 'sv'
    const hostPlays = Boolean(data?.hostPlays)
    const { room, playerId } = createRoom(name, socket.id, language, hostPlays)
    socket.join(room.code)
    ack?.({ ok: true, playerId, code: room.code })
    broadcastRoom(room.code)
  })

  socket.on('join', (data, ack) => {
    const code = String(data?.code ?? '').toUpperCase()
    const name = String(data?.name ?? 'Spelare')
    const result = joinRoom(code, name, socket.id)
    if ('error' in result) return ack?.({ error: result.error })
    socket.join(result.room.code)
    ack?.({ ok: true, playerId: result.playerId, code: result.room.code })
    broadcastRoom(result.room.code)
  })

  socket.on('rejoin', (data, ack) => {
    const code = String(data?.code ?? '').toUpperCase()
    const playerId = String(data?.playerId ?? '')
    const result = reconnectSocket(code, playerId, socket.id)
    if ('error' in result) return ack?.({ error: result.error })
    socket.join(result.room.code)
    ack?.({ ok: true, playerId: result.playerId, code: result.room.code })
    broadcastRoom(result.room.code)
  })

  socket.on('setLanguage', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const language = data?.language === 'en' ? 'en' : 'sv'
    const result = setLanguage(binding.code, binding.playerId, language)
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('setHostPlaying', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = setHostPlaying(binding.code, binding.playerId, Boolean(data?.playing))
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('start', (_data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = startGame(binding.code, binding.playerId)
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('rematch', (_data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = rematch(binding.code, binding.playerId)
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('pulseHit', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = submitPulseHit(
      binding.code,
      binding.playerId,
      String(data?.noteId ?? ''),
      Number(data?.lane ?? -1),
    )
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true, grade: result.grade })
    broadcastRoom(binding.code)
  })

  socket.on('sabotage', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = useSabotage(binding.code, binding.playerId, String(data?.targetId ?? ''))
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('blitzAnswer', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = submitBlitzAnswer(binding.code, binding.playerId, Number(data?.index))
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('smsDraft', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = submitSmsDraft(binding.code, binding.playerId, String(data?.text ?? ''))
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('smsSabotage', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = submitSmsSabotage(binding.code, binding.playerId, String(data?.text ?? ''))
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('smsVote', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = submitSmsVote(binding.code, binding.playerId, String(data?.targetId ?? ''))
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('emojiSubmit', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = submitEmoji(binding.code, binding.playerId, String(data?.text ?? ''))
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('emojiGuess', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = submitEmojiGuess(binding.code, binding.playerId, String(data?.text ?? ''))
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('klotterSubmit', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = submitKlotter(binding.code, binding.playerId, data?.strokes ?? [])
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('klotterVote', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = submitKlotterVote(binding.code, binding.playerId, String(data?.targetId ?? ''))
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('arenaPunch', (_data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = arenaPunch(binding.code, binding.playerId)
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('labbTap', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = labbTap(binding.code, binding.playerId, String(data?.step ?? ''))
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true, correct: result.correct })
    broadcastRoom(binding.code)
  })

  socket.on('liveDone', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = liveDone(binding.code, binding.playerId, data?.write ? String(data.write) : undefined)
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('liveScore', (data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ error: 'Inte ansluten' })
    const result = liveScore(
      binding.code,
      binding.playerId,
      String(data?.targetId ?? ''),
      Number(data?.stars ?? 3),
    )
    if ('error' in result) return ack?.({ error: result.error })
    ack?.({ ok: true })
    broadcastRoom(binding.code)
  })

  socket.on('disconnect', () => {
    disconnectSocket(socket.id, (code) => broadcastRoom(code))
  })
})

setInterval(() => {
  for (const code of tickRooms()) broadcastRoom(code)
  pruneIdleRooms()
}, 100)

async function boot() {
  const persist = await initPersist()
  console.log('Persist:', persist)
  const snap = await loadSnapshot()
  if (snap.rooms?.length) hydrateRooms(snap.rooms)
  httpServer.listen(PORT, () => {
    console.log(`Pulskaos API on :${PORT}`)
  })
}

boot()
