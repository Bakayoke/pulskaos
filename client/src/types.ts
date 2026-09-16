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
export type PulseHitGrade = 'perfect' | 'good' | 'almost' | 'early' | 'late' | 'miss'
export type StrokePoint = { x: number; y: number }

export type PublicPlayer = {
  id: string
  name: string
  score: number
  streak: number
  connected: boolean
  host: boolean
  playing: boolean
}

export type PulseNote = {
  id: string
  lane: 0 | 1 | 2
  hitAt: number
  sync: boolean
}

export type RoomBanner = {
  text: string
  kind: 'sync' | 'sabotage' | 'finale' | 'info' | 'drama'
  until: number
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
      yourDone: boolean
      yourWrite: string | null
      doneCount: number
      yourVotes: Record<string, number>
      votersDone: number
      players: {
        id: string
        name: string
        done: boolean
        write: string | null
      }[]
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
  pulse: {
    kind: 'warmup' | 'bridge' | 'finale'
    bpm: number
    startedAt: number
    endsAt: number
    notes: PulseNote[]
    syncResults: Record<string, { hit: number; miss: number; resolved: boolean }>
    multiplier: number
    lastGrades: Record<string, PulseHitGrade>
    yourHits: Record<string, PulseHitGrade>
    yourMultiplier: number
    crowd: {
      id: string
      name: string
      lastGrade: PulseHitGrade | null
      streak: number
      score: number
    }[]
  } | null
  micro: PublicMicro | null
  saboteurId: string | null
  youAreSaboteur: boolean
  saboteurCharges: number
  echo: {
    bestSms?: { text: string; authorName: string }
    wrongGuesses: string[]
    highlights: string[]
    avatars: Record<string, StrokePoint[][]>
    emojiFails: string[]
  }
  revealUntil: number | null
  lastReveal: {
    title: string
    lines: string[]
    scores: { id: string; name: string; delta: number; score: number }[]
    stoleLead?: { name: string; fromName: string } | null
    drama?: string | null
  } | null
  language: 'sv' | 'en'
  serverNow: number
  playingCount: number
  banner: RoomBanner | null
  yourStreak: number
}
