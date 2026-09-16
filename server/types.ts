export type RoomStatus = 'lobby' | 'pulse' | 'micro' | 'reveal' | 'finished'

export type MicroKind =
  | 'blitz'
  | 'sms'
  | 'emoji'
  | 'klotter'
  | 'arena'
  | 'labb'
  | 'live'

export type SmsPhase = 'write' | 'sabotage' | 'vote'
export type EmojiPhase = 'emoji' | 'guess'
export type KlotterPhase = 'draw' | 'vote'
export type LivePhase = 'play' | 'score'

export type Player = {
  id: string
  name: string
  socketId: string | null
  score: number
  streak: number
  connected: boolean
  host: boolean
}

export type PulseNote = {
  id: string
  lane: 0 | 1 | 2
  hitAt: number
  sync: boolean
}

export type PulseHitGrade = 'perfect' | 'good' | 'miss'

export type PulseState = {
  kind: 'warmup' | 'bridge' | 'finale'
  bpm: number
  startedAt: number
  endsAt: number
  notes: PulseNote[]
  hits: Record<string, Record<string, PulseHitGrade>>
  syncResults: Record<string, { hit: number; miss: number; resolved: boolean }>
  multiplier: number
}

export type BlitzState = {
  prompt: string
  options: string[]
  correctIndex: number
  endsAt: number
  answers: Record<string, { index: number; at: number }>
}

export type SmsState = {
  phase: SmsPhase
  prompt: string
  endsAt: number
  drafts: Record<string, string>
  assignments: Record<string, string>
  sabotaged: Record<string, string>
  votes: Record<string, string>
}

export type EmojiState = {
  phase: EmojiPhase
  endsAt: number
  words: Record<string, string>
  emojis: Record<string, string>
  /** guesserId → authorId */
  assignments: Record<string, string>
  guesses: Record<string, string>
}

export type StrokePoint = { x: number; y: number }

export type KlotterState = {
  phase: KlotterPhase
  endsAt: number
  words: Record<string, string>
  drawings: Record<string, StrokePoint[][]>
  votes: Record<string, string>
  orbUntil: number | null
}

export type ArenaFighter = {
  id: string
  x: number
  hp: number
  punches: number
}

export type ArenaState = {
  endsAt: number
  startedAt: number
  fighters: Record<string, ArenaFighter>
}

export type LabbState = {
  endsAt: number
  recipe: string[]
  progress: Record<string, number>
  delivered: Record<string, number>
  fails: Record<string, number>
}

export type LiveState = {
  phase: LivePhase
  endsAt: number
  challenge: string
  kind: 'physical' | 'write'
  done: Record<string, boolean>
  writes: Record<string, string>
  scores: Record<string, number>
}

export type EchoBag = {
  bestSms?: { text: string; authorName: string }
  wrongGuesses: string[]
  highlights: string[]
  avatars: Record<string, StrokePoint[][]>
  emojiFails: string[]
}

export type MicroState =
  | { kind: 'blitz'; blitz: BlitzState }
  | { kind: 'sms'; sms: SmsState }
  | { kind: 'emoji'; emoji: EmojiState }
  | { kind: 'klotter'; klotter: KlotterState }
  | { kind: 'arena'; arena: ArenaState }
  | { kind: 'labb'; labb: LabbState }
  | { kind: 'live'; live: LiveState }

export type Room = {
  code: string
  status: RoomStatus
  createdAt: number
  updatedAt: number
  hostId: string
  players: Player[]
  heat: number
  night: number
  round: number
  totalRounds: number
  schedule: MicroKind[]
  currentMicro: MicroKind | null
  pulse: PulseState | null
  micro: MicroState | null
  saboteurId: string | null
  saboteurCharges: number
  echo: EchoBag
  revealUntil: number | null
  lastReveal: RevealPayload | null
  language: 'sv' | 'en'
  lastMults: Record<string, number>
}

export type RevealPayload = {
  title: string
  lines: string[]
  scores: { id: string; name: string; delta: number; score: number }[]
}

export type PublicPlayer = {
  id: string
  name: string
  score: number
  streak: number
  connected: boolean
  host: boolean
}

export type PublicRoom = {
  code: string
  status: RoomStatus
  hostId: string
  youId: string | null
  players: PublicPlayer[]
  heat: number
  night: number
  round: number
  totalRounds: number
  currentMicro: MicroKind | null
  schedule: MicroKind[]
  pulse: (Omit<PulseState, 'hits'> & {
    yourHits: Record<string, PulseHitGrade>
    yourMultiplier: number
  }) | null
  micro: PublicMicro | null
  saboteurId: string | null
  youAreSaboteur: boolean
  saboteurCharges: number
  echo: EchoBag
  revealUntil: number | null
  lastReveal: RevealPayload | null
  language: 'sv' | 'en'
  serverNow: number
}

export type PublicMicro =
  | {
      kind: 'blitz'
      endsAt: number
      prompt: string
      options: string[]
      yourAnswer: number | null
      answeredCount: number
      correctIndex: number | null
    }
  | {
      kind: 'sms'
      endsAt: number
      phase: SmsPhase
      prompt: string
      yourDraft: string | null
      draftCount: number
      sabotageTarget: { id: string; name: string; text: string } | null
      yourSabotage: string | null
      sabotageCount: number
      voteOptions: { id: string; text: string; authorName: string }[] | null
      yourVote: string | null
      voteCount: number
    }
  | {
      kind: 'emoji'
      endsAt: number
      phase: EmojiPhase
      yourWord: string | null
      yourEmoji: string | null
      emojiCount: number
      guessTarget: { authorId: string; emoji: string } | null
      yourGuess: string | null
      guessCount: number
    }
  | {
      kind: 'klotter'
      endsAt: number
      phase: KlotterPhase
      yourWord: string | null
      yourDrawing: StrokePoint[][] | null
      drawCount: number
      voteOptions: { id: string; name: string; strokes: StrokePoint[][] }[] | null
      yourVote: string | null
      voteCount: number
      orbActive: boolean
    }
  | {
      kind: 'arena'
      endsAt: number
      startedAt: number
      fighters: {
        id: string
        name: string
        x: number
        hp: number
        punches: number
        avatar: StrokePoint[][] | null
      }[]
      yourPunches: number
    }
  | {
      kind: 'labb'
      endsAt: number
      recipe: string[]
      yourStep: number
      yourDelivered: number
      yourFails: number
      leaderboard: { id: string; name: string; delivered: number }[]
    }
  | {
      kind: 'live'
      endsAt: number
      phase: LivePhase
      challenge: string
      challengeKind: 'physical' | 'write'
      isHost: boolean
      yourDone: boolean
      yourWrite: string | null
      doneCount: number
      players: { id: string; name: string; done: boolean; write: string | null; score: number | null }[]
    }
