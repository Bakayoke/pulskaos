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
  setHostPlaying,
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

function qrUrl(data: string, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(data)}`
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [room, setRoom] = useState<PublicRoom | null>(null)
  const [name, setName] = useState(loadSession()?.name ?? '')
  const [code, setCode] = useState('')
  const [lang, setLang] = useState<'sv' | 'en'>('sv')
  const [error, setError] = useState('')
  const [mute, setMute] = useState(isMuted())
  const [busy, setBusy] = useState(false)
  const [tvMode, setTvMode] = useState(false)
  const [startAsTv, setStartAsTv] = useState(true)

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
      // Default: host does not play (TV). Optional play-along via chip.
      await createGame(name || 'Host', lang, !startAsTv)
      setTvMode(startAsTv)
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
    <div className={`app${tvMode && screen === 'play' ? ' tv-mode' : ''}`}>
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
        <div className="topbar-actions">
          {screen === 'play' && room && room.youId === room.hostId && (
            <button
              type="button"
              className={`icon-btn ${tvMode ? 'on' : ''}`}
              onClick={() => setTvMode((v) => !v)}
            >
              {tvMode ? 'TV av' : 'TV-läge'}
            </button>
          )}
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
        </div>
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
              <>
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
                <div className="lang-row">
                  <button
                    type="button"
                    className={startAsTv ? 'chip on' : 'chip'}
                    onClick={() => setStartAsTv(true)}
                  >
                    Host på TV
                  </button>
                  <button
                    type="button"
                    className={!startAsTv ? 'chip on' : 'chip'}
                    onClick={() => setStartAsTv(false)}
                  >
                    Spela med
                  </button>
                </div>
              </>
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
            tvMode={tvMode}
            setTvMode={setTvMode}
            onLeave={() => {
              clearSession()
              setRoom(null)
              setTvMode(false)
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

function PlayView({
  room,
  tvMode,
  setTvMode,
  onLeave,
}: {
  room: PublicRoom
  tvMode: boolean
  setTvMode: (v: boolean) => void
  onLeave: () => void
}) {
  const me = room.players.find((p) => p.id === room.youId)
  const spectating = Boolean(me && !me.playing)

  if (room.status === 'lobby')
    return <Lobby room={room} tvMode={tvMode} setTvMode={setTvMode} onLeave={onLeave} />
  if (room.status === 'pulse' && room.pulse)
    return <PulseView room={room} tvMode={tvMode} spectating={spectating} />
  if (room.status === 'micro' && room.micro)
    return (
      <section className="play">
        {(tvMode || spectating) && (
          <p className="tv-wait">
            {spectating ? 'Du hostar — spelarna kör på mobilen' : 'TV-läge'} · {room.playingCount} spelare
          </p>
        )}
        <MicroView room={room} tvMode={tvMode || spectating} />
        <ScoreRail room={room} />
      </section>
    )
  if (room.status === 'reveal' && room.lastReveal) return <RevealView room={room} />
  if (room.status === 'finished') return <WinnerView room={room} onLeave={onLeave} />
  return <p className="muted">Laddar…</p>
}

function ScoreRail({ room }: { room: PublicRoom }) {
  const sorted = [...room.players]
    .filter((p) => p.playing)
    .sort((a, b) => b.score - a.score)
  const hosts = room.players.filter((p) => !p.playing)
  return (
    <div className="score-rail">
      <div className="meta-pills">
        <span className="pill heat">Heat {room.heat}</span>
        <span className="pill">Natt {room.night}</span>
        <span className="pill">{room.playingCount} spelare</span>
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
      {hosts.length > 0 && (
        <p className="host-note">Host: {hosts.map((h) => h.name).join(', ')}</p>
      )}
    </div>
  )
}

function Lobby({
  room,
  tvMode,
  setTvMode,
  onLeave,
}: {
  room: PublicRoom
  tvMode: boolean
  setTvMode: (v: boolean) => void
  onLeave: () => void
}) {
  const isHost = room.youId === room.hostId
  const me = room.players.find((p) => p.id === room.youId)
  const joinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}?join=${room.code}`
      : `?join=${room.code}`
  const players = room.players.filter((p) => p.playing)
  const canStart = room.playingCount >= 1

  return (
    <section className="play lobby">
      <div className="lobby-hero">
        <p className="eyebrow">{tvMode ? 'TV-lobby' : 'Lobby'}</p>
        <div className="code-block">
          <span>Kod</span>
          <strong>{room.code}</strong>
        </div>
        <div className="invite-qr">
          <img
            src={qrUrl(joinUrl, tvMode ? 280 : 200)}
            alt="QR för att gå med"
            width={tvMode ? 280 : 200}
            height={tvMode ? 280 : 200}
          />
        </div>
        {!tvMode && (
          <>
            <p className="muted small">Skanna QR eller dela koden.</p>
            <a className="join-link" href={joinUrl}>
              {joinUrl.replace(/^https?:\/\//, '')}
            </a>
          </>
        )}
        {tvMode && (
          <p className="lobby-waiting-hint">
            {players.length === 0
              ? 'Väntar på spelare…'
              : `${players.length} redo — starta när ni är klara`}
          </p>
        )}
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
              <button
                type="button"
                className={tvMode ? 'chip on' : 'chip'}
                onClick={() => setTvMode(!tvMode)}
              >
                {tvMode ? 'TV på' : 'TV'}
              </button>
              <button
                type="button"
                className={me?.playing ? 'chip on' : 'chip'}
                onClick={() => void setHostPlaying(!(me?.playing ?? false))}
              >
                {me?.playing ? 'Spelar med' : 'Bara hosta'}
              </button>
            </div>
            <button
              type="button"
              className="btn primary pulse-btn"
              disabled={!canStart}
              onClick={() => {
                uiClick()
                void startGame()
              }}
            >
              Starta Pulse
            </button>
            {!canStart && (
              <p className="muted small">Minst en spelare måste gå med (eller välj “Spelar med”).</p>
            )}
          </>
        )}
        {!isHost && <p className="muted">Väntar på host…</p>}
        {!tvMode && (
          <button type="button" className="btn ghost" onClick={onLeave}>
            Lämna
          </button>
        )}
      </div>
    </section>
  )
}

function PulseView({
  room,
  tvMode,
  spectating,
}: {
  room: PublicRoom
  tvMode: boolean
  spectating: boolean
}) {
  const pulse = room.pulse!
  const [now, setNow] = useState(Date.now())
  const [flash, setFlash] = useState<PulseHitGrade | null>(null)
  const lastBeat = useRef(0)
  const skew = useRef(room.serverNow - Date.now())
  const displayOnly = tvMode || spectating

  useEffect(() => {
    skew.current = room.serverNow - Date.now()
  }, [room.serverNow])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + skew.current), 16)
    return () => clearInterval(id)
  }, [])

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
    if (displayOnly) return
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
    if (displayOnly) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A' || e.key === '1') void onHit(0)
      if (e.key === 's' || e.key === 'S' || e.key === '2') void onHit(1)
      if (e.key === 'd' || e.key === 'D' || e.key === '3') void onHit(2)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onHit, displayOnly])

  const travel = 1400
  const kindLabel =
    pulse.kind === 'warmup' ? 'Warmup' : pulse.kind === 'finale' ? 'Pulse-Off' : 'Bridge'

  return (
    <section className="play pulse-play">
      <div className="pulse-header">
        <div>
          <p className="eyebrow">{kindLabel}{displayOnly ? ' · TV' : ''}</p>
          <h2>
            {pulse.bpm} <span className="unit">BPM</span>
          </h2>
        </div>
        {!displayOnly && (
          <div className="mult">
            ×{pulse.yourMultiplier.toFixed(2)}
            <span>mult</span>
          </div>
        )}
        {displayOnly && (
          <div className="mult">
            {room.playingCount}
            <span>spelare</span>
          </div>
        )}
      </div>

      {displayOnly && (
        <p className="tv-wait">Spelarna träffar pulsen på sina telefoner</p>
      )}

      <div className={`lane-stage ${flash ? `flash-${flash}` : ''} ${displayOnly ? 'tv-lanes' : ''}`}>
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
            {!displayOnly && (
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
            )}
          </div>
        ))}
      </div>

      {flash && !displayOnly && (
        <div className={`grade-pop ${flash}`} key={flash + String(now)}>
          {flash === 'perfect' ? 'PERFECT' : flash === 'good' ? 'GOOD' : 'MISS'}
        </div>
      )}

      <ScoreRail room={room} />

      {!displayOnly && room.youAreSaboteur && room.saboteurCharges > 0 && (
        <div className="sab-row">
          {room.players
            .filter((p) => p.id !== room.youId && p.playing)
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
  const ranked = [...room.players].filter((p) => p.playing).sort((a, b) => b.score - a.score)
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
