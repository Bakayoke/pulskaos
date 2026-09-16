let ctx: AudioContext | null = null
let muted = localStorage.getItem('pulskaos-mute') === '1'

function ac() {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export function isMuted() {
  return muted
}

export function setMuted(v: boolean) {
  muted = v
  localStorage.setItem('pulskaos-mute', v ? '1' : '0')
}

function beep(freq: number, dur: number, type: OscillatorType = 'square', gain = 0.04) {
  if (muted) return
  try {
    const c = ac()
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.value = gain
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur)
    o.connect(g)
    g.connect(c.destination)
    o.start()
    o.stop(c.currentTime + dur)
  } catch {
    /* ignore */
  }
}

export function tickPulse() {
  beep(180, 0.04, 'triangle', 0.03)
  if (navigator.vibrate) navigator.vibrate(12)
}

export function hitPerfect(streak = 1) {
  const bump = Math.min(8, streak) * 40
  beep(880 + bump, 0.07, 'square', 0.05)
  beep(1320 + bump, 0.05, 'sine', 0.03)
  if (navigator.vibrate) navigator.vibrate(20)
}

export function hitGood() {
  beep(520, 0.06, 'square', 0.04)
}

export function hitAlmost() {
  beep(360, 0.05, 'triangle', 0.035)
}

export function hitEarlyLate() {
  beep(200, 0.06, 'sawtooth', 0.03)
}

export function hitMiss() {
  beep(120, 0.1, 'sawtooth', 0.035)
  if (navigator.vibrate) navigator.vibrate([30, 20, 30])
}

export function syncBoom() {
  beep(90, 0.15, 'triangle', 0.06)
  beep(220, 0.1, 'sine', 0.04)
}

export function dramaSting() {
  beep(150, 0.12, 'sawtooth', 0.05)
  setTimeout(() => beep(90, 0.15, 'triangle', 0.05), 80)
}

export function leadSteal() {
  beep(440, 0.08)
  setTimeout(() => beep(660, 0.1), 70)
  setTimeout(() => beep(880, 0.14), 140)
}

export function countdownBeep(n: number) {
  beep(n <= 1 ? 660 : 330, 0.08, 'square', 0.045)
}

export function uiClick() {
  beep(440, 0.03, 'square', 0.025)
}

export function winFanfare() {
  beep(523, 0.1)
  setTimeout(() => beep(659, 0.1), 90)
  setTimeout(() => beep(784, 0.18), 180)
}

export function playGrade(
  grade: 'perfect' | 'good' | 'almost' | 'early' | 'late' | 'miss',
  streak = 1,
) {
  if (grade === 'perfect') hitPerfect(streak)
  else if (grade === 'good') hitGood()
  else if (grade === 'almost') hitAlmost()
  else if (grade === 'early' || grade === 'late') hitEarlyLate()
  else hitMiss()
}
