const KEY = 'pulskaos-rivalry'

type RecordMap = Record<string, { w: number; l: number }>

function load(): RecordMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as RecordMap
  } catch {
    return {}
  }
}

function save(map: RecordMap) {
  localStorage.setItem(KEY, JSON.stringify(map))
}

export function recordResult(you: string, winner: string, others: string[]) {
  const map = load()
  const key = you.toLowerCase()
  if (!map[key]) map[key] = { w: 0, l: 0 }
  if (winner.toLowerCase() === key) map[key].w += 1
  else map[key].l += 1
  void others
  save(map)
}

export function getRecord(name: string) {
  return load()[name.toLowerCase()] ?? { w: 0, l: 0 }
}

export function taunt(you: string, winner: string) {
  const r = getRecord(you)
  if (winner.toLowerCase() === you.toLowerCase()) {
    return r.w > 1 ? `Husrekord ${r.w}–${r.l}. Dominans.` : 'Första skalpen i huset.'
  }
  return r.l > r.w ? `${r.w}–${r.l}. Revansch?` : 'Nära. En gång till.'
}
