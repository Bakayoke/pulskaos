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
  // Warmup: longer lead-in for 3-2-1 tutorial
  const leadBeats = opts.kind === 'warmup' ? 4 : 2
  const beatCount =
    opts.kind === 'warmup' ? 16 : opts.kind === 'finale' ? 24 : 10 + opts.heat

  const notes: PulseNote[] = []
  let t = opts.startAt + beatMs * leadBeats
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
    lastGrades: {},
  }
}

/** deltaMs = now - hitAt (negative = early) */
export function gradeHit(deltaMs: number): PulseHitGrade {
  const abs = Math.abs(deltaMs)
  if (abs <= 70) return 'perfect'
  if (abs <= 140) return 'good'
  if (abs <= 185) return 'almost'
  if (deltaMs < 0 && abs <= 280) return 'early'
  if (deltaMs > 0 && abs <= 280) return 'late'
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
    else if (g === 'almost') score += 0.25
  }
  const ratio = score / Math.max(1, noteCount)
  if (ratio >= 0.85) return 2
  if (ratio >= 0.65) return 1.5
  if (ratio >= 0.4) return 1.25
  return 1
}

export function pulsePoints(grade: PulseHitGrade, streak: number): number {
  const base =
    grade === 'perfect'
      ? 120
      : grade === 'good'
        ? 70
        : grade === 'almost'
          ? 25
          : 0
  if (!base) return 0
  const streakMult = 1 + Math.min(4, Math.max(0, streak - 1)) * 0.12
  return Math.round(base * streakMult)
}

export function isHitGrade(grade: PulseHitGrade): boolean {
  return grade === 'perfect' || grade === 'good' || grade === 'almost'
}
