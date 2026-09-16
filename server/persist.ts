import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import type { Room } from './types.js'

export type PersistedSnapshot = {
  version: 1
  savedAt: number
  rooms: Room[]
}

type Backend = {
  name: string
  load(): Promise<PersistedSnapshot | null>
  save(snapshot: PersistedSnapshot): Promise<void>
}

let backend: Backend | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pending: PersistedSnapshot | null = null
let ready = false
let lastSaveAt = 0
let lastError: string | null = null

function emptySnapshot(): PersistedSnapshot {
  return { version: 1, savedAt: Date.now(), rooms: [] }
}

function fileBackend(dir: string): Backend {
  const file = path.join(dir, 'pulskaos-state.json')
  return {
    name: `file:${file}`,
    async load() {
      try {
        const raw = await readFile(file, 'utf8')
        return JSON.parse(raw) as PersistedSnapshot
      } catch {
        return null
      }
    },
    async save(snapshot) {
      await mkdir(dir, { recursive: true })
      await writeFile(file, JSON.stringify(snapshot), 'utf8')
    },
  }
}

async function redisBackend(url: string): Promise<Backend> {
  const { createClient } = await import('redis')
  const client = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 200, 3000),
    },
  })
  client.on('error', (err) => {
    lastError = err instanceof Error ? err.message : 'redis error'
    console.error('Redis error', err)
  })
  await client.connect()
  const key = 'pulskaos:state'
  return {
    name: 'redis',
    async load() {
      const raw = await client.get(key)
      if (!raw) return null
      return JSON.parse(raw) as PersistedSnapshot
    },
    async save(snapshot) {
      await client.set(key, JSON.stringify(snapshot), { EX: 60 * 60 * 48 })
    },
  }
}

async function dirExists(dir: string) {
  try {
    await access(dir)
    return true
  } catch {
    return false
  }
}

export async function initPersist() {
  if (process.env.REDIS_URL) {
    try {
      backend = await redisBackend(process.env.REDIS_URL)
    } catch (err) {
      console.error('Redis init failed', err)
      backend = null
    }
  } else if (process.env.PULSKAOS_DATA_DIR) {
    const dir = process.env.PULSKAOS_DATA_DIR
    if (await dirExists(dir) || true) {
      backend = fileBackend(dir)
    }
  }
  ready = true
  return { configured: Boolean(backend), name: backend?.name ?? 'memory' }
}

export async function loadSnapshot() {
  if (!backend) return emptySnapshot()
  try {
    return (await backend.load()) ?? emptySnapshot()
  } catch (err) {
    lastError = err instanceof Error ? err.message : 'load error'
    return emptySnapshot()
  }
}

export function scheduleSave(snapshot: PersistedSnapshot) {
  pending = snapshot
  if (saveTimer) return
  saveTimer = setTimeout(async () => {
    saveTimer = null
    const snap = pending
    pending = null
    if (!snap || !backend) return
    try {
      snap.savedAt = Date.now()
      await backend.save(snap)
      lastSaveAt = Date.now()
      lastError = null
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'save error'
      console.error('Persist save failed', err)
    }
  }, 400)
}

export function persistStatus() {
  return {
    ready,
    configured: Boolean(backend),
    backend: backend?.name ?? 'memory',
    lastSaveAt,
    lastError,
  }
}
