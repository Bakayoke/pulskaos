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

  // One golden candidate slot mid-chart (warmup/bridge only)
  const goldenSlot =
    opts.kind === 'finale'
      ? -1
      : Math.floor(beatCount * 0.45) + Math.floor(Math.random() * Math.max(1, Math.floor(beatCount * 0.2)))

  for (let i = 0; i < beatCount; i++) {
    const sync = i > 0 && i % 4 === 0
    const golden = !sync && i === goldenSlot
    const lane = (sync ? 1 : golden ? 1 : i % 3) as 0 | 1 | 2
    notes.push({
      id: noteId(),
      lane,
      hitAt: Math.round(t),
      sync,
      golden: golden || undefined,
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
    goldenPerfect: {},
    chaosUntil: null,
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
  goldenBoost = false,
): number {
  const values = Object.values(hits)
  if (!values.length) return goldenBoost ? 2 : 1
  let score = 0
  for (const g of values) {
    if (g === 'perfect') score += 1
    else if (g === 'good') score += 0.55
    else if (g === 'almost') score += 0.25
  }
  const ratio = score / Math.max(1, noteCount)
  let mult = 1
  if (ratio >= 0.85) mult = 2
  else if (ratio >= 0.65) mult = 1.5
  else if (ratio >= 0.4) mult = 1.25
  if (goldenBoost) mult *= 2
  return mult
}

export function pulsePoints(grade: PulseHitGrade, streak: number, golden = false): number {
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
  const goldMult = golden && grade === 'perfect' ? 2.5 : 1
  return Math.round(base * streakMult * goldMult)
}

export function isHitGrade(grade: PulseHitGrade): boolean {
  return grade === 'perfect' || grade === 'good' || grade === 'almost'
}
