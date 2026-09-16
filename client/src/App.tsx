import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import {
  bindRoom,
  clearSession,
  createGame,
  getSocket,
  joinGame,
  loadSession,
  pulseHit,
  rejoinGame,
  rematchGame,
  setLanguage,
  startGame,
  useSabotage,
} from './api'
import { MicroView } from './MicroViews'
import { getRecord, recordResult, taunt } from './rivalry'
import {
  hitGood,
  hitMiss,
  hitPerfect,
  isMuted,
  setMuted,
  syncBoom,
  tickPulse,
  uiClick,
  winFanfare,
} from './sfx'
import type { PublicRoom, PulseHitGrade } from './types'

type Screen = 'home' | 'create' | 'join' | 'play'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [room, setRoom] = useState<PublicRoom | null>(null)
  const [name, setName] = useState(loadSession()?.name ?? '')
  const [code, setCode] = useState('')
  const [lang, setLang] = useState<'sv' | 'en'>('sv')
  const [error, setError] = useState('')
  const [mute, setMute] = useState(isMuted())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getSocket()
    bindRoom(setRoom)
    const params = new URLSearchParams(window.location.search)
    const join = params.get('join')
    if (join) {
      setCode(join.toUpperCase())
      setScreen('join')
    }
    void rejoinGame().then((s) => {
      if (s) setScreen('play')
    })
  }, [])

  useEffect(() => {
    if (room) setScreen('play')
  }, [room])

  async function onCreate() {
    setBusy(true)
    setError('')
    try {
      uiClick()
      await createGame(name || 'Host', lang)
      setScreen('play')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fel')
    } finally {
      setBusy(false)
    }
  }

  async function onJoin() {
    setBusy(true)
    setError('')
    try {
      uiClick()
      await joinGame(code.trim().toUpperCase(), name || 'Spelare')
      setScreen('play')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fel')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <div className="pulse-bg" aria-hidden>
        <div className="pulse-ring r1" />
        <div className="pulse-ring r2" />
        <div className="pulse-ring r3" />
        <div className="grid-fade" />
      </div>

      <header className="topbar">
        <button
          type="button"
          className="brand-btn"
          onClick={() => {
            if (screen === 'play' && room?.status === 'lobby') return
            if (screen !== 'play') setScreen('home')
          }}
        >
          <span className="brand-mark">PK</span>
          <span className="brand-name">Pulskaos</span>
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Mute"
          onClick={() => {
            const next = !mute
            setMute(next)
            setMuted(next)
          }}
        >
          {mute ? 'Ljud av' : 'Ljud'}
        </button>
      </header>

      <main className="shell">
        {screen === 'home' && (
          <Home
            onCreate={() => setScreen('create')}
            onJoin={() => setScreen('join')}
          />
        )}
        {screen === 'create' && (
          <AuthCard
            title="Skapa natt"
            name={name}
            setName={setName}
            error={error}
            busy={busy}
            extra={
              <div className="lang-row">
                <button
                  type="button"
                  className={lang === 'sv' ? 'chip on' : 'chip'}
                  onClick={() => setLang('sv')}
                >
                  Svenska
                </button>
                <button
                  type="button"
                  className={lang === 'en' ? 'chip on' : 'chip'}
                  onClick={() => setLang('en')}
                >
                  English
                </button>
              </div>
            }
            actionLabel="Öppna lobby"
            onAction={onCreate}
            onBack={() => setScreen('home')}
          />
        )}
        {screen === 'join' && (
          <AuthCard
            title="Gå med"
            name={name}
            setName={setName}
            error={error}
            busy={busy}
            extra={
              <label className="field">
                <span>Kod</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={4}
                  placeholder="ABCD"
                  autoCapitalize="characters"
                />
              </label>
            }
            actionLabel="Anslut"
            onAction={onJoin}
            onBack={() => setScreen('home')}
          />
        )}
        {screen === 'play' && room && (
          <PlayView
            room={room}
            onLeave={() => {
              clearSession()
              setRoom(null)
              setScreen('home')
            }}
          />
        )}
      </main>
    </div>
  )
}

function Home({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <section className="hero">
      <p className="eyebrow">Party · Timing · Kaos</p>
      <h1>
        Träffa pulsen.
        <br />
        <span className="accent-text">Överlev natten.</span>
      </h1>
      <p className="lede">
        Guitar Hero-känsla utan musik — synlig puls, mikrospel och rematch som hettar till.
      </p>
      <div className="cta-row">
        <button type="button" className="btn primary pulse-btn" onClick={onCreate}>
          Skapa natt
        </button>
        <button type="button" className="btn ghost" onClick={onJoin}>
          Gå med
        </button>
      </div>
      <ul className="feature-strip">
        <li>Pulse</li>
        <li>Blitz</li>
        <li>Sms</li>
        <li>Emoji</li>
        <li>Klotter</li>
        <li>Arena</li>
        <li>Labb</li>
        <li>Live</li>
      </ul>
    </section>
  )
}

function AuthCard(props: {
  title: string
  name: string
  setName: (v: string) => void
  extra?: ReactNode
  actionLabel: string
  onAction: () => void
  onBack: () => void
  error: string
  busy: boolean
}) {
  return (
    <section className="panel">
      <button type="button" className="linkish" onClick={props.onBack}>
        ← Tillbaka
      </button>
      <h2>{props.title}</h2>
      <label className="field">
        <span>Namn</span>
        <input
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
          maxLength={18}
          placeholder="Ditt nick"
        />
      </label>
      {props.extra}
      {props.error && <p className="error">{props.error}</p>}
      <button
        type="button"
        className="btn primary"
        disabled={props.busy}
        onClick={props.onAction}
      >
        {props.actionLabel}
      </button>
    </section>
  )
}

function PlayView({ room, onLeave }: { room: PublicRoom; onLeave: () => void }) {
  if (room.status === 'lobby') return <Lobby room={room} onLeave={onLeave} />
  if (room.status === 'pulse' && room.pulse) return <PulseView room={room} />
  if (room.status === 'micro' && room.micro)
    return (
      <section className="play">
        <MicroView room={room} />
        <ScoreRail room={room} />
      </section>
    )
  if (room.status === 'reveal' && room.lastReveal) return <RevealView room={room} />
  if (room.status === 'finished') return <WinnerView room={room} onLeave={onLeave} />
  return <p className="muted">Laddar…</p>
}

function ScoreRail({ room }: { room: PublicRoom }) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score)
  return (
    <div className="score-rail">
      <div className="meta-pills">
        <span className="pill heat">Heat {room.heat}</span>
        <span className="pill">Natt {room.night}</span>
        {room.youAreSaboteur && (
          <span className="pill danger">Sabotör · {room.saboteurCharges}</span>
        )}
      </div>
      <ol>
        {sorted.map((p, i) => (
          <li key={p.id} className={p.id === room.youId ? 'you' : ''}>
            <span className="rank">{i + 1}</span>
            <span className="nm">
              {p.name}
              {!p.connected && ' ·'}
            </span>
            <span className="sc">{p.score}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Lobby({ room, onLeave }: { room: PublicRoom; onLeave: () => void }) {
  const isHost = room.youId === room.hostId
  const joinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}?join=${room.code}`
      : `?join=${room.code}`

  return (
    <section className="play">
      <div className="lobby-hero">
        <p className="eyebrow">Lobby</p>
        <div className="code-block">
          <span>Kod</span>
          <strong>{room.code}</strong>
        </div>
        <p className="muted small">Dela länken eller koden. TV:n visar lobbyn.</p>
        <a className="join-link" href={joinUrl}>
          {joinUrl.replace(/^https?:\/\//, '')}
        </a>
      </div>
      <ScoreRail room={room} />
      <div className="actions">
        {isHost && (
          <>
            <div className="lang-row">
              <button
                type="button"
                className={room.language === 'sv' ? 'chip on' : 'chip'}
                onClick={() => void setLanguage('sv')}
              >
                SV
              </button>
              <button
                type="button"
                className={room.language === 'en' ? 'chip on' : 'chip'}
                onClick={() => void setLanguage('en')}
              >
                EN
              </button>
            </div>
            <button
              type="button"
              className="btn primary pulse-btn"
              onClick={() => {
                uiClick()
                void startGame()
              }}
            >
              Starta Pulse
            </button>
          </>
        )}
        {!isHost && <p className="muted">Väntar på host…</p>}
        <button type="button" className="btn ghost" onClick={onLeave}>
          Lämna
        </button>
      </div>
    </section>
  )
}

function PulseView({ room }: { room: PublicRoom }) {
  const pulse = room.pulse!
  const [now, setNow] = useState(Date.now())
  const [flash, setFlash] = useState<PulseHitGrade | null>(null)
  const lastBeat = useRef(0)
  const skew = useRef(room.serverNow - Date.now())

  useEffect(() => {
    skew.current = room.serverNow - Date.now()
  }, [room.serverNow])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + skew.current), 16)
    return () => clearInterval(id)
  }, [])

  // Metronome tick without music
  useEffect(() => {
    const beatMs = 60_000 / pulse.bpm
    const elapsed = now - pulse.startedAt
    const beat = Math.floor(elapsed / beatMs)
    if (beat !== lastBeat.current && beat >= 0) {
      lastBeat.current = beat
      tickPulse()
    }
  }, [now, pulse.bpm, pulse.startedAt])

  const onHit = useEffectEvent(async (lane: 0 | 1 | 2) => {
    const upcoming = pulse.notes
      .filter((n) => n.lane === lane && !pulse.yourHits[n.id])
      .sort((a, b) => Math.abs(a.hitAt - now) - Math.abs(b.hitAt - now))[0]
    if (!upcoming) {
      hitMiss()
      setFlash('miss')
      return
    }
    if (Math.abs(upcoming.hitAt - now) > 220) {
      hitMiss()
      setFlash('miss')
      return
    }
    const res = await pulseHit(upcoming.id, lane)
    const grade = (res.grade as PulseHitGrade) || 'miss'
    setFlash(grade)
    if (grade === 'perfect') hitPerfect()
    else if (grade === 'good') hitGood()
    else hitMiss()
    if (upcoming.sync) syncBoom()
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A' || e.key === '1') void onHit(0)
      if (e.key === 's' || e.key === 'S' || e.key === '2') void onHit(1)
      if (e.key === 'd' || e.key === 'D' || e.key === '3') void onHit(2)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onHit])

  const travel = 1400
  const kindLabel =
    pulse.kind === 'warmup' ? 'Warmup' : pulse.kind === 'finale' ? 'Pulse-Off' : 'Bridge'

  return (
    <section className="play pulse-play">
      <div className="pulse-header">
        <div>
          <p className="eyebrow">{kindLabel}</p>
          <h2>
            {pulse.bpm} <span className="unit">BPM</span>
          </h2>
        </div>
        <div className="mult">
          ×{pulse.yourMultiplier.toFixed(2)}
          <span>mult</span>
        </div>
      </div>

      <div className={`lane-stage ${flash ? `flash-${flash}` : ''}`}>
        <div className="hit-line" />
        {[0, 1, 2].map((lane) => (
          <div key={lane} className="lane">
            {pulse.notes
              .filter((n) => n.lane === lane)
              .map((n) => {
                const y = ((n.hitAt - now) / travel) * 100
                if (y < -15 || y > 110) return null
                const hit = pulse.yourHits[n.id]
                return (
                  <div
                    key={n.id}
                    className={`note ${n.sync ? 'sync' : ''} ${hit ?? ''}`}
                    style={{ top: `${50 - y * 0.45}%` }}
                  />
                )
              })}
            <button
              type="button"
              className="lane-pad"
              onPointerDown={(e) => {
                e.preventDefault()
                void onHit(lane as 0 | 1 | 2)
              }}
            >
              {lane === 0 ? 'A' : lane === 1 ? 'S' : 'D'}
            </button>
          </div>
        ))}
      </div>

      {flash && (
        <div className={`grade-pop ${flash}`} key={flash + String(now)}>
          {flash === 'perfect' ? 'PERFECT' : flash === 'good' ? 'GOOD' : 'MISS'}
        </div>
      )}

      <ScoreRail room={room} />

      {room.youAreSaboteur && room.saboteurCharges > 0 && (
        <div className="sab-row">
          {room.players
            .filter((p) => p.id !== room.youId)
            .map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn danger sm"
                onClick={() => void useSabotage(p.id)}
              >
                Frys {p.name}
              </button>
            ))}
        </div>
      )}
    </section>
  )
}

function RevealView({ room }: { room: PublicRoom }) {
  const r = room.lastReveal!
  return (
    <section className="play reveal">
      <p className="eyebrow">Poäng</p>
      <h2>{r.title}</h2>
      {r.lines.map((l) => (
        <p key={l} className="lede">
          {l}
        </p>
      ))}
      <ol className="reveal-scores">
        {r.scores.map((s) => (
          <li key={s.id} className={s.id === room.youId ? 'you' : ''}>
            <span>{s.name}</span>
            <span className={s.delta > 0 ? 'up' : ''}>
              {s.delta > 0 ? `+${s.delta}` : s.delta} · {s.score}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function WinnerView({ room, onLeave }: { room: PublicRoom; onLeave: () => void }) {
  const ranked = [...room.players].sort((a, b) => b.score - a.score)
  const winner = ranked[0]
  const isHost = room.youId === room.hostId
  const you = room.players.find((p) => p.id === room.youId)
  const recorded = useRef(false)

  useEffect(() => {
    if (!winner || !you || recorded.current) return
    recorded.current = true
    recordResult(
      you.name,
      winner.name,
      ranked.map((p) => p.name),
    )
    winFanfare()
  }, [winner, you, ranked])

  const rec = you ? getRecord(you.name) : { w: 0, l: 0 }

  return (
    <section className="play winner">
      <p className="eyebrow">Natt {room.night} klar · Heat {room.heat}</p>
      <h2>
        {winner ? (
          <>
            {winner.name} <span className="accent-text">vinner</span>
          </>
        ) : (
          'Oavgjort'
        )}
      </h2>
      {you && winner && <p className="lede">{taunt(you.name, winner.name)}</p>}
      <p className="muted">
        Husrekord {rec.w}–{rec.l}
      </p>

      {room.echo.bestSms && (
        <blockquote className="echo-card">
          <span>Echo · bästa kuppen</span>
          <p>“{room.echo.bestSms.text}”</p>
          <cite>— {room.echo.bestSms.authorName}</cite>
        </blockquote>
      )}

      {room.echo.highlights.length > 0 && (
        <ul className="echo-list">
          {room.echo.highlights.slice(-5).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}

      {room.saboteurId && (
        <p className="pill danger inline">
          Sabotör: {room.players.find((p) => p.id === room.saboteurId)?.name}
        </p>
      )}

      <ol className="reveal-scores">
        {ranked.map((p, i) => (
          <li key={p.id} className={p.id === room.youId ? 'you' : ''}>
            <span>
              #{i + 1} {p.name}
            </span>
            <span>{p.score}</span>
          </li>
        ))}
      </ol>

      <div className="actions">
        {isHost && (
          <button
            type="button"
            className="btn primary pulse-btn"
            onClick={() => {
              uiClick()
              void rematchGame()
            }}
          >
            Rematch · Heat {Math.min(5, room.heat + 1)}
          </button>
        )}
        {!isHost && <p className="muted">Host startar rematch…</p>}
        <button type="button" className="btn ghost" onClick={onLeave}>
          Avsluta
        </button>
      </div>
    </section>
  )
}
