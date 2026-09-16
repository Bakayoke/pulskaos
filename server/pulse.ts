import { customAlphabet } from 'nanoid'
import type { PulseHitGrade, PulseNote, PulseState } from './types.js'

const noteId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

export function bpmForHeat(heat: number): number {
  return 96 + Math.min(5, Math.max(1, heat)) * 14
}

export function buildPulseChart(opts: {
  kind: PulseState['kind']
  heat: number
  startAt: number
}): PulseState {
  const bpm = bpmForHeat(opts.heat)
  const beatMs = 60_000 / bpm
  const beatCount =
    opts.kind === 'warmup' ? 16 : opts.kind === 'finale' ? 24 : 10 + opts.heat

  const notes: PulseNote[] = []
  let t = opts.startAt + beatMs * 2 // lead-in
  for (let i = 0; i < beatCount; i++) {
    const sync = i > 0 && i % 4 === 0
    const lane = (sync ? 1 : i % 3) as 0 | 1 | 2
    notes.push({
      id: noteId(),
      lane,
      hitAt: Math.round(t),
      sync,
    })
    t += beatMs
  }

  const endsAt = Math.round(t + beatMs)

  return {
    kind: opts.kind,
    bpm,
    startedAt: opts.startAt,
    endsAt,
    notes,
    hits: {},
    syncResults: {},
    multiplier: 1,
  }
}

export function gradeHit(deltaMs: number): PulseHitGrade {
  const abs = Math.abs(deltaMs)
  if (abs <= 70) return 'perfect'
  if (abs <= 140) return 'good'
  return 'miss'
}

export function multiplierFromHits(
  hits: Record<string, PulseHitGrade>,
  noteCount: number,
): number {
  const values = Object.values(hits)
  if (!values.length) return 1
  let score = 0
  for (const g of values) {
    if (g === 'perfect') score += 1
    else if (g === 'good') score += 0.55
  }
  const ratio = score / Math.max(1, noteCount)
  if (ratio >= 0.85) return 2
  if (ratio >= 0.65) return 1.5
  if (ratio >= 0.4) return 1.25
  return 1
}

export function pulsePoints(grade: PulseHitGrade, streak: number): number {
  const base = grade === 'perfect' ? 120 : grade === 'good' ? 70 : 0
  if (!base) return 0
  const streakMult = 1 + Math.min(4, Math.max(0, streak - 1)) * 0.12
  return Math.round(base * streakMult)
}
