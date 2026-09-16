import type { MicroKind } from './types.js'

export type BlitzQuestion = {
  prompt: string
  options: string[]
  correctIndex: number
}

export const BLITZ_SV: BlitzQuestion[] = [
  { prompt: 'Vilket land har flest invånare?', options: ['Indien', 'Kina', 'USA', 'Indonesien'], correctIndex: 0 },
  { prompt: 'Vad heter Sveriges valuta?', options: ['Euro', 'Krona', 'Mark', 'Daler'], correctIndex: 1 },
  { prompt: 'Hur många sekunder är en minut?', options: ['50', '60', '100', '90'], correctIndex: 1 },
  { prompt: 'Vilken planet är närmast solen?', options: ['Venus', 'Merkurius', 'Mars', 'Jorden'], correctIndex: 1 },
  { prompt: 'Vad är H2O?', options: ['Syre', 'Väte', 'Vatten', 'Salt'], correctIndex: 2 },
  { prompt: 'Vilken färg får du om du blandar blått och gult?', options: ['Lila', 'Orange', 'Grönt', 'Rosa'], correctIndex: 2 },
  { prompt: 'Hur många ben har en spindel?', options: ['6', '8', '10', '4'], correctIndex: 1 },
  { prompt: 'Vad heter huvudstaden i Norge?', options: ['Bergen', 'Oslo', 'Stockholm', 'Helsingfors'], correctIndex: 1 },
  { prompt: 'Vilket år landade människan på månen?', options: ['1965', '1969', '1972', '1959'], correctIndex: 1 },
  { prompt: 'Vad betyder “www”?', options: ['World Wide Web', 'Wide Web World', 'Web World Wide', 'Wireless Web Wire'], correctIndex: 0 },
]

export const BLITZ_EN: BlitzQuestion[] = [
  { prompt: 'Which planet is closest to the sun?', options: ['Venus', 'Mercury', 'Mars', 'Earth'], correctIndex: 1 },
  { prompt: 'How many seconds in a minute?', options: ['50', '60', '100', '90'], correctIndex: 1 },
  { prompt: 'What is H2O?', options: ['Oxygen', 'Hydrogen', 'Water', 'Salt'], correctIndex: 2 },
  { prompt: 'How many legs does a spider have?', options: ['6', '8', '10', '4'], correctIndex: 1 },
  { prompt: 'What color do you get mixing blue and yellow?', options: ['Purple', 'Orange', 'Green', 'Pink'], correctIndex: 2 },
  { prompt: 'Capital of France?', options: ['Lyon', 'Paris', 'Nice', 'Marseille'], correctIndex: 1 },
  { prompt: 'Year of the first moon landing?', options: ['1965', '1969', '1972', '1959'], correctIndex: 1 },
  { prompt: 'What does “www” stand for?', options: ['World Wide Web', 'Wide Web World', 'Web World Wide', 'Wireless Web Wire'], correctIndex: 0 },
]

export const SMS_PROMPTS_SV = [
  'Skriv ett SMS till chefen varför du är sen',
  'Skriv ett SMS till en kompis och ställer in er middag',
  'Skriv ett SMS till grannen om högljudd musik',
  'Skriv ett SMS och ber om att låna 500 kr',
  'Skriv ett SMS till någon du svärmar för',
]

export const SMS_PROMPTS_EN = [
  'Text your boss why you’re late',
  'Text a friend canceling dinner',
  'Text your neighbor about loud music',
  'Text someone asking to borrow money',
  'Text someone you have a crush on',
]

export const EMOJI_WORDS_SV = [
  'pizza', 'haj', 'regnbåge', 'kaffe', 'fotboll', 'drake', 'robot', 'vampyr', 'tåg', 'ananas',
  'ninja', 'vulkan', 'unicorn', 'glass', 'astronaut',
]

export const EMOJI_WORDS_EN = [
  'pizza', 'shark', 'rainbow', 'coffee', 'soccer', 'dragon', 'robot', 'vampire', 'train', 'pineapple',
  'ninja', 'volcano', 'unicorn', 'icecream', 'astronaut',
]

export const KLOTTER_WORDS_SV = [
  'katt', 'cykel', 'pizza', 'spöke', 'solglasögon', 'haj', 'gitarr', 'raket', 'ananas', 'ninja',
]

export const KLOTTER_WORDS_EN = [
  'cat', 'bike', 'pizza', 'ghost', 'sunglasses', 'shark', 'guitar', 'rocket', 'pineapple', 'ninja',
]

export const LABB_STEPS = ['RÖD', 'BLÅ', 'VÄRME', 'LEVERERA'] as const

export const LIVE_SV: { challenge: string; kind: 'physical' | 'write' }[] = [
  { challenge: 'Stå på ett ben i 10 sekunder', kind: 'physical' },
  { challenge: 'Gör din bästa robotdans', kind: 'physical' },
  { challenge: 'Hämta något blått och visa upp det', kind: 'physical' },
  { challenge: 'Skriv en slogan för Pulskaos', kind: 'write' },
  { challenge: 'Hitta på ett smeknamn till personen till vänster', kind: 'write' },
  { challenge: 'Gör din mest dramatiska “nej”-gest', kind: 'physical' },
]

export const LIVE_EN: { challenge: string; kind: 'physical' | 'write' }[] = [
  { challenge: 'Stand on one leg for 10 seconds', kind: 'physical' },
  { challenge: 'Do your best robot dance', kind: 'physical' },
  { challenge: 'Find something blue and show it', kind: 'physical' },
  { challenge: 'Write a slogan for Pulskaos', kind: 'write' },
  { challenge: 'Invent a nickname for the person on your left', kind: 'write' },
  { challenge: 'Do your most dramatic “no” gesture', kind: 'physical' },
]

export function pickBlitz(lang: 'sv' | 'en', used: Set<string>): BlitzQuestion {
  const bank = lang === 'sv' ? BLITZ_SV : BLITZ_EN
  const available = bank.filter((q) => !used.has(q.prompt))
  const pool = available.length ? available : bank
  const q = pool[Math.floor(Math.random() * pool.length)]!
  used.add(q.prompt)
  return { ...q, options: [...q.options] }
}

export function pickSmsPrompt(lang: 'sv' | 'en'): string {
  const bank = lang === 'sv' ? SMS_PROMPTS_SV : SMS_PROMPTS_EN
  return bank[Math.floor(Math.random() * bank.length)]!
}

export function pickEmojiWord(lang: 'sv' | 'en'): string {
  const bank = lang === 'sv' ? EMOJI_WORDS_SV : EMOJI_WORDS_EN
  return bank[Math.floor(Math.random() * bank.length)]!
}

export function pickKlotterWord(lang: 'sv' | 'en'): string {
  const bank = lang === 'sv' ? KLOTTER_WORDS_SV : KLOTTER_WORDS_EN
  return bank[Math.floor(Math.random() * bank.length)]!
}

export function pickLive(lang: 'sv' | 'en') {
  const bank = lang === 'sv' ? LIVE_SV : LIVE_EN
  return bank[Math.floor(Math.random() * bank.length)]!
}

const ALL_KINDS: MicroKind[] = ['blitz', 'sms', 'emoji', 'klotter', 'arena', 'labb', 'live']

export function buildSchedule(heat: number): MicroKind[] {
  if (heat >= 5) return []
  if (heat >= 4) return [pick(ALL_KINDS.filter((k) => k !== 'klotter' && k !== 'live'))]
  if (heat >= 3) return shuffle(ALL_KINDS).slice(0, 2)
  const count = heat === 1 ? 4 : 3
  return shuffle(ALL_KINDS).slice(0, count)
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}
