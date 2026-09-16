import {
  LABB_STEPS,
  pickBlitz,
  pickEmojiWord,
  pickKlotterWord,
  pickLive,
  pickSmsPrompt,
} from './content.js'
import type {
  MicroKind,
  MicroState,
  Player,
  PublicMicro,
  RevealPayload,
  Room,
  StrokePoint,
} from './types.js'

function active(room: Room): Player[] {
  return room.players.filter((p) => p.connected && p.playing)
}

function living(room: Room): Player[] {
  return room.players.filter((p) => p.connected || p.socketId)
}

function rotateAssignments(ids: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (ids.length === 1) {
    out[ids[0]!] = ids[0]!
    return out
  }
  const rotated = [...ids.slice(1), ids[0]!]
  ids.forEach((id, i) => {
    out[id] = rotated[i]!
  })
  return out
}

function scoreRows(
  room: Room,
  deltas: Record<string, number>,
): RevealPayload['scores'] {
  return room.players
    .filter((p) => p.playing)
    .map((p) => ({
      id: p.id,
      name: p.name,
      delta: deltas[p.id] ?? 0,
      score: p.score,
    }))
    .sort((a, b) => b.score - a.score)
}

export function createMicro(
  room: Room,
  kind: MicroKind,
  usedBlitz: Set<string>,
): MicroState {
  const now = Date.now()
  const players = active(room)

  if (kind === 'blitz') {
    const q = pickBlitz(room.language, usedBlitz)
    const options = [...q.options]
    const echoWrong = [...room.echo.wrongGuesses, ...room.echo.emojiFails]
    if (echoWrong.length && options.length >= 4) {
      const guess = echoWrong[echoWrong.length - 1]!
      if (!options.includes(guess)) options[3] = guess.slice(0, 40)
    }
    return {
      kind: 'blitz',
      blitz: {
        prompt: q.prompt,
        options,
        correctIndex: q.correctIndex,
        endsAt: now + (room.heat >= 4 ? 7000 : 9000),
        answers: {},
      },
    }
  }

  if (kind === 'sms') {
    return {
      kind: 'sms',
      sms: {
        phase: 'write',
        prompt: pickSmsPrompt(room.language),
        endsAt: now + 35_000,
        drafts: {},
        assignments: {},
        sabotaged: {},
        votes: {},
      },
    }
  }

  if (kind === 'emoji') {
    const words: Record<string, string> = {}
    for (const p of players) words[p.id] = pickEmojiWord(room.language)
    return {
      kind: 'emoji',
      emoji: {
        phase: 'emoji',
        endsAt: now + 28_000,
        words,
        emojis: {},
        assignments: {},
        guesses: {},
      },
    }
  }

  if (kind === 'klotter') {
    const words: Record<string, string> = {}
    for (const p of players) words[p.id] = pickKlotterWord(room.language)
    return {
      kind: 'klotter',
      klotter: {
        phase: 'draw',
        endsAt: now + 28_000,
        words,
        drawings: {},
        votes: {},
        orbUntil: null,
      },
    }
  }

  if (kind === 'arena') {
    const fighters: Record<string, { id: string; x: number; hp: number; punches: number }> = {}
    let i = 0
    for (const p of players) {
      fighters[p.id] = {
        id: p.id,
        x: 12 + (i % 5) * 18,
        hp: 100,
        punches: 0,
      }
      i++
    }
    return {
      kind: 'arena',
      arena: {
        endsAt: now + 28_000,
        startedAt: now,
        fighters,
      },
    }
  }

  if (kind === 'labb') {
    const progress: Record<string, number> = {}
    const delivered: Record<string, number> = {}
    const fails: Record<string, number> = {}
    for (const p of players) {
      progress[p.id] = 0
      delivered[p.id] = 0
      fails[p.id] = 0
    }
    return {
      kind: 'labb',
      labb: {
        endsAt: now + 40_000,
        recipe: [...LABB_STEPS],
        progress,
        delivered,
        fails,
      },
    }
  }

  // live
  const challenge = pickLive(room.language)
  return {
    kind: 'live',
    live: {
      phase: 'play',
      endsAt: now + 45_000,
      challenge: challenge.challenge,
      kind: challenge.kind,
      done: {},
      writes: {},
      votes: {},
      scores: {},
    },
  }
}

export function toPublicMicro(room: Room, viewerId?: string): PublicMicro | null {
  if (!room.micro) return null
  const m = room.micro

  if (m.kind === 'blitz') {
    const b = m.blitz
    return {
      kind: 'blitz',
      endsAt: b.endsAt,
      prompt: b.prompt,
      options: b.options,
      yourAnswer: viewerId ? b.answers[viewerId]?.index ?? null : null,
      answeredCount: Object.keys(b.answers).length,
      correctIndex: room.status === 'reveal' ? b.correctIndex : null,
    }
  }

  if (m.kind === 'sms') {
    const s = m.sms
    const victimId = viewerId ? s.assignments[viewerId] : null
    const victim = victimId ? room.players.find((p) => p.id === victimId) : null
    return {
      kind: 'sms',
      endsAt: s.endsAt,
      phase: s.phase,
      prompt: s.prompt,
      yourDraft: viewerId ? s.drafts[viewerId] ?? null : null,
      draftCount: Object.keys(s.drafts).length,
      sabotageTarget:
        s.phase === 'sabotage' && victim && victimId
          ? { id: victimId, name: victim.name, text: s.drafts[victimId] ?? '' }
          : null,
      yourSabotage: viewerId && victimId ? s.sabotaged[victimId] ?? null : null,
      sabotageCount: Object.keys(s.sabotaged).length,
      voteOptions:
        s.phase === 'vote'
          ? Object.entries(s.sabotaged).map(([id, text]) => ({
              id,
              text,
              authorName: room.players.find((p) => p.id === id)?.name ?? '???',
            }))
          : null,
      yourVote: viewerId ? s.votes[viewerId] ?? null : null,
      voteCount: Object.keys(s.votes).length,
    }
  }

  if (m.kind === 'emoji') {
    const e = m.emoji
    const authorId = viewerId ? e.assignments[viewerId] : null
    return {
      kind: 'emoji',
      endsAt: e.endsAt,
      phase: e.phase,
      yourWord: viewerId && e.phase === 'emoji' ? e.words[viewerId] ?? null : null,
      yourEmoji: viewerId ? e.emojis[viewerId] ?? null : null,
      emojiCount: Object.keys(e.emojis).length,
      guessTarget:
        e.phase === 'guess' && authorId && e.emojis[authorId]
          ? { authorId, emoji: e.emojis[authorId]! }
          : null,
      yourGuess: viewerId ? e.guesses[viewerId] ?? null : null,
      guessCount: Object.keys(e.guesses).length,
    }
  }

  if (m.kind === 'klotter') {
    const k = m.klotter
    return {
      kind: 'klotter',
      endsAt: k.endsAt,
      phase: k.phase,
      yourWord: viewerId && k.phase === 'draw' ? k.words[viewerId] ?? null : null,
      yourDrawing: viewerId ? k.drawings[viewerId] ?? null : null,
      drawCount: Object.keys(k.drawings).length,
      voteOptions:
        k.phase === 'vote'
          ? Object.entries(k.drawings).map(([id, strokes]) => ({
              id,
              name: room.players.find((p) => p.id === id)?.name ?? '???',
              strokes,
            }))
          : null,
      yourVote: viewerId ? k.votes[viewerId] ?? null : null,
      voteCount: Object.keys(k.votes).length,
      orbActive: Boolean(k.orbUntil && k.orbUntil > Date.now()),
    }
  }

  if (m.kind === 'arena') {
    const a = m.arena
    return {
      kind: 'arena',
      endsAt: a.endsAt,
      startedAt: a.startedAt,
      fighters: Object.values(a.fighters).map((f) => ({
        id: f.id,
        name: room.players.find((p) => p.id === f.id)?.name ?? '???',
        x: f.x,
        hp: f.hp,
        punches: f.punches,
        avatar: room.echo.avatars[f.id] ?? null,
      })),
      yourPunches: viewerId ? a.fighters[viewerId]?.punches ?? 0 : 0,
    }
  }

  if (m.kind === 'labb') {
    const l = m.labb
    return {
      kind: 'labb',
      endsAt: l.endsAt,
      recipe: l.recipe,
      yourStep: viewerId ? l.progress[viewerId] ?? 0 : 0,
      yourDelivered: viewerId ? l.delivered[viewerId] ?? 0 : 0,
      yourFails: viewerId ? l.fails[viewerId] ?? 0 : 0,
      leaderboard: active(room)
        .map((p) => ({
          id: p.id,
          name: p.name,
          delivered: l.delivered[p.id] ?? 0,
        }))
        .sort((a, b) => b.delivered - a.delivered),
    }
  }

  const live = m.live
  const contestants = room.players.filter((p) => p.playing)
  const votersDone = contestants.filter((v) =>
    contestants.every((t) => v.id === t.id || live.votes[v.id]?.[t.id] != null),
  ).length
  return {
    kind: 'live',
    endsAt: live.endsAt,
    phase: live.phase,
    challenge: live.challenge,
    challengeKind: live.kind,
    yourDone: viewerId ? Boolean(live.done[viewerId]) : false,
    yourWrite: viewerId ? live.writes[viewerId] ?? null : null,
    doneCount: Object.keys(live.done).length,
    yourVotes: viewerId ? { ...(live.votes[viewerId] ?? {}) } : {},
    votersDone,
    players: contestants.map((p) => ({
      id: p.id,
      name: p.name,
      done: Boolean(live.done[p.id]),
      write: live.writes[p.id] ?? null,
    })),
  }
}

export type RevealFn = (room: Room, payload: RevealPayload, ms?: number) => void

function applyDelta(room: Room, playerId: string, delta: number) {
  const p = room.players.find((x) => x.id === playerId)
  if (!p) return
  p.score += delta
}

export function resolveBlitz(room: Room, reveal: RevealFn) {
  if (room.micro?.kind !== 'blitz') return
  const blitz = room.micro.blitz
  const deltas: Record<string, number> = {}
  const start = blitz.endsAt - (room.heat >= 4 ? 7000 : 9000)

  for (const p of living(room)) {
    const ans = blitz.answers[p.id]
    let delta = 0
    if (ans && ans.index === blitz.correctIndex) {
      const speed = Math.max(0, 1 - (ans.at - start) / 9000)
      const pulseMult = room.lastMults[p.id] ?? 1
      const streakMult = 1 + Math.min(3, Math.max(0, p.streak)) * 0.1
      delta = Math.round((700 + speed * 500) * pulseMult * streakMult)
      delta = Math.round(delta * (1 + (room.heat - 1) * 0.05))
      applyDelta(room, p.id, delta)
      p.streak += 1
    } else {
      p.streak = 0
    }
    deltas[p.id] = delta
  }

  reveal(room, {
    title: room.language === 'sv' ? 'Blitzfakta' : 'Blitz facts',
    lines: [
      room.language === 'sv'
        ? `Rätt: ${blitz.options[blitz.correctIndex]}`
        : `Correct: ${blitz.options[blitz.correctIndex]}`,
    ],
    scores: scoreRows(room, deltas),
  })
}

export function resolveSms(room: Room, reveal: RevealFn) {
  if (room.micro?.kind !== 'sms') return
  const sms = room.micro.sms
  const tally = new Map<string, number>()
  for (const target of Object.values(sms.votes)) {
    tally.set(target, (tally.get(target) ?? 0) + 1)
  }
  const deltas: Record<string, number> = {}
  let bestId: string | null = null
  let bestVotes = -1
  for (const p of living(room)) {
    const votes = tally.get(p.id) ?? 0
    const delta = votes * 100
    applyDelta(room, p.id, delta)
    deltas[p.id] = delta
    if (votes > bestVotes) {
      bestVotes = votes
      bestId = p.id
    }
  }
  if (bestId) {
    const author = room.players.find((p) => p.id === bestId)
    const text = sms.sabotaged[bestId]
    if (author && text) {
      room.echo.bestSms = { text, authorName: author.name }
      room.echo.highlights.push(`Bästa kuppen: ${author.name}`)
    }
  }
  reveal(room, {
    title: room.language === 'sv' ? 'Sms-kupp' : 'Text heist',
    lines: room.echo.bestSms
      ? [`Vinnare: ${room.echo.bestSms.authorName}`, `“${room.echo.bestSms.text}”`]
      : [],
    scores: scoreRows(room, deltas),
    drama: room.echo.bestSms ? `Bästa kuppen av ${room.echo.bestSms.authorName}` : null,
  })
}

export function resolveEmoji(room: Room, reveal: RevealFn) {
  if (room.micro?.kind !== 'emoji') return
  const e = room.micro.emoji
  const deltas: Record<string, number> = {}
  for (const p of living(room)) {
    const authorId = e.assignments[p.id]
    const guess = (e.guesses[p.id] ?? '').trim().toLowerCase()
    const word = authorId ? (e.words[authorId] ?? '').toLowerCase() : ''
    let delta = 0
    if (guess && word && (guess === word || word.includes(guess) || guess.includes(word))) {
      delta = Math.round(500 * (room.lastMults[p.id] ?? 1))
      applyDelta(room, p.id, delta)
      p.streak += 1
    } else {
      p.streak = 0
      if (guess) {
        room.echo.emojiFails.push(guess.slice(0, 40))
        room.echo.wrongGuesses.push(guess.slice(0, 40))
      }
    }
    deltas[p.id] = delta
  }
  reveal(room, {
    title: room.language === 'sv' ? 'Emoji-hopp' : 'Emoji hop',
    lines: Object.entries(e.guesses)
      .slice(0, 3)
      .map(([gid, guess]) => {
        const authorId = e.assignments[gid]
        const word = authorId ? e.words[authorId] : '?'
        const name = room.players.find((p) => p.id === gid)?.name ?? '?'
        return `${name}: “${guess}” ← ${word}`
      }),
    scores: scoreRows(room, deltas),
  })
}

export function resolveKlotter(room: Room, reveal: RevealFn) {
  if (room.micro?.kind !== 'klotter') return
  const k = room.micro.klotter
  const tally = new Map<string, number>()
  for (const target of Object.values(k.votes)) {
    tally.set(target, (tally.get(target) ?? 0) + 1)
  }
  const deltas: Record<string, number> = {}
  let bestId: string | null = null
  let best = -1
  for (const p of living(room)) {
    const votes = tally.get(p.id) ?? 0
    const delta = votes * 120
    applyDelta(room, p.id, delta)
    deltas[p.id] = delta
    if (k.drawings[p.id]) room.echo.avatars[p.id] = k.drawings[p.id]!
    if (votes > best) {
      best = votes
      bestId = p.id
    }
  }
  if (bestId) {
    const name = room.players.find((p) => p.id === bestId)?.name
    if (name) room.echo.highlights.push(`Klotter-kung: ${name}`)
  }
  reveal(room, {
    title: room.language === 'sv' ? 'Sabotage-klotter' : 'Sabotage doodle',
    lines: ['Ritningarna lever vidare som Echo-fighters'],
    scores: scoreRows(room, deltas),
  })
}

export function resolveArena(room: Room, reveal: RevealFn) {
  if (room.micro?.kind !== 'arena') return
  const a = room.micro.arena
  const deltas: Record<string, number> = {}
  for (const p of living(room)) {
    const f = a.fighters[p.id]
    const punches = f?.punches ?? 0
    const delta = Math.round(punches * 18 * (room.lastMults[p.id] ?? 1))
    applyDelta(room, p.id, delta)
    deltas[p.id] = delta
  }
  const top = Object.values(a.fighters).sort((x, y) => y.punches - x.punches)[0]
  if (top) {
    const name = room.players.find((p) => p.id === top.id)?.name
    if (name) room.echo.highlights.push(`Arena-burst: ${name} dunkade mest`)
  }
  reveal(room, {
    title: 'Arena-burst',
    lines: ['Punch-race med dina Echo-avatars'],
    scores: scoreRows(room, deltas),
  })
}

export function resolveLabb(room: Room, reveal: RevealFn) {
  if (room.micro?.kind !== 'labb') return
  const l = room.micro.labb
  const deltas: Record<string, number> = {}
  for (const p of living(room)) {
    const delivered = l.delivered[p.id] ?? 0
    const fails = l.fails[p.id] ?? 0
    const delta = Math.max(0, delivered * 220 - fails * 40)
    const scaled = Math.round(delta * (room.lastMults[p.id] ?? 1))
    applyDelta(room, p.id, scaled)
    deltas[p.id] = scaled
  }
  reveal(room, {
    title: room.language === 'sv' ? 'Labbpuls' : 'Lab pulse',
    lines: [`Recept: ${l.recipe.join(' → ')}`],
    scores: scoreRows(room, deltas),
  })
}

export function finalizeLiveScores(room: Room) {
  if (room.micro?.kind !== 'live') return
  const live = room.micro.live
  const contestants = active(room)
  for (const target of contestants) {
    const ratings: number[] = []
    for (const voter of contestants) {
      if (voter.id === target.id) continue
      const s = live.votes[voter.id]?.[target.id]
      if (typeof s === 'number') ratings.push(s)
    }
    if (ratings.length) {
      live.scores[target.id] = Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
    } else {
      live.scores[target.id] = live.done[target.id] ? 3 : 1
    }
  }
}

export function liveVotingComplete(room: Room) {
  if (room.micro?.kind !== 'live') return false
  const live = room.micro.live
  const contestants = active(room)
  if (contestants.length <= 1) return true
  return contestants.every((voter) =>
    contestants.every((target) => voter.id === target.id || live.votes[voter.id]?.[target.id] != null),
  )
}

export function resolveLive(room: Room, reveal: RevealFn) {
  if (room.micro?.kind !== 'live') return
  const live = room.micro.live
  if (Object.keys(live.scores).length === 0) finalizeLiveScores(room)
  const deltas: Record<string, number> = {}
  for (const p of room.players.filter((x) => x.playing)) {
    const stars = live.scores[p.id] ?? (live.done[p.id] ? 3 : 0)
    const delta = stars * 100
    applyDelta(room, p.id, delta)
    deltas[p.id] = delta
  }
  reveal(room, {
    title: room.language === 'sv' ? 'Live-test' : 'Live test',
    lines: [live.challenge],
    scores: scoreRows(room, deltas),
  })
}

export function enterSmsSabotage(room: Room) {
  if (room.micro?.kind !== 'sms') return
  const sms = room.micro.sms
  sms.phase = 'sabotage'
  sms.endsAt = Date.now() + 30_000
  sms.assignments = rotateAssignments(active(room).map((p) => p.id))
}

export function enterSmsVote(room: Room) {
  if (room.micro?.kind !== 'sms') return
  const sms = room.micro.sms
  sms.phase = 'vote'
  sms.endsAt = Date.now() + 25_000
  for (const p of active(room)) {
    if (!sms.sabotaged[p.id] && sms.drafts[p.id]) sms.sabotaged[p.id] = sms.drafts[p.id]!
  }
}

export function enterEmojiGuess(room: Room) {
  if (room.micro?.kind !== 'emoji') return
  const e = room.micro.emoji
  e.phase = 'guess'
  e.endsAt = Date.now() + 25_000
  for (const p of active(room)) {
    if (!e.emojis[p.id]) e.emojis[p.id] = '❓'
  }
  e.assignments = rotateAssignments(active(room).map((p) => p.id))
}

export function enterKlotterVote(room: Room) {
  if (room.micro?.kind !== 'klotter') return
  const k = room.micro.klotter
  k.phase = 'vote'
  k.endsAt = Date.now() + 22_000
  for (const p of active(room)) {
    if (!k.drawings[p.id]) k.drawings[p.id] = []
  }
}

export function enterLiveScore(room: Room) {
  if (room.micro?.kind !== 'live') return
  const live = room.micro.live
  live.phase = 'score'
  live.endsAt = Date.now() + 40_000
  live.votes = {}
  live.scores = {}
  // Solo: no peers to rate — auto-score from completion.
  if (active(room).length <= 1) {
    for (const p of active(room)) live.scores[p.id] = live.done[p.id] ? 5 : 1
  }
}

export function clampStrokes(strokes: StrokePoint[][]): StrokePoint[][] {
  return strokes.slice(0, 12).map((s) =>
    s.slice(0, 80).map((p) => ({
      x: Math.min(1, Math.max(0, Number(p.x) || 0)),
      y: Math.min(1, Math.max(0, Number(p.y) || 0)),
    })),
  )
}
