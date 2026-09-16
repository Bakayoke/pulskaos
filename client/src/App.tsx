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
  countdownBeep,
  dramaSting,
  isMuted,
  leadSteal,
  playGrade,
  setMuted,
  syncBoom,
  tickPulse,
  uiClick,
  winFanfare,
} from './sfx'
import type { PublicRoom, PulseHitGrade } from './types'

type Screen = 'home' | 'create' | 'join' | 'play'

function useCountdown(endsAt: number | null | undefined, serverNow: number) {
  const [left, setLeft] = useState(0)
  const skew = useRef(0)
  useEffect(() => {
    skew.current = serverNow - Date.now()
  }, [serverNow])
  useEffect(() => {
    if (!endsAt) {
      setLeft(0)
      return
    }
    const tick = () => setLeft(Math.max(0, (endsAt - (Date.now() + skew.current)) / 1000))
    tick()
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [endsAt])
  return left
}

function qrUrl(data: string, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(data)}`
}

function isFullscreenActive() {
  const doc = document as Document & { webkitFullscreenElement?: Element | null }
  return Boolean(document.fullscreenElement || doc.webkitFullscreenElement)
}

async function enterFullscreen() {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
  }
  try {
    if (el.requestFullscreen) await el.requestFullscreen()
    else el.webkitRequestFullscreen?.()
  } catch {
    /* CSS tv-mode still applies */
  }
}

async function exitFullscreen() {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void
    webkitFullscreenElement?: Element | null
  }
  try {
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen()
      else doc.webkitExitFullscreen?.()
    }
  } catch {
    /* ignore */
  }
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
  const [fsActive, setFsActive] = useState(() => isFullscreenActive())
  const hadFs = useRef(false)

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

  useEffect(() => {
    document.body.classList.toggle('tv-mode', tvMode && screen === 'play')
    return () => document.body.classList.remove('tv-mode')
  }, [tvMode, screen])

  useEffect(() => {
    const onFs = () => setFsActive(isFullscreenActive())
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs as EventListener)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener('webkitfullscreenchange', onFs as EventListener)
    }
  }, [])

  useEffect(() => {
    if (fsActive) hadFs.current = true
    if (!fsActive && hadFs.current && tvMode) {
      hadFs.current = false
      setTvMode(false)
    }
  }, [fsActive, tvMode])

  async function enableTvMode() {
    // Must run in a user gesture for browser fullscreen
    await enterFullscreen()
    setFsActive(isFullscreenActive())
    setTvMode(true)
  }

  async function disableTvMode() {
    setTvMode(false)
    hadFs.current = false
    await exitFullscreen()
    setFsActive(false)
  }

  async function toggleTvMode() {
    if (tvMode) await disableTvMode()
    else await enableTvMode()
  }

  async function onCreate() {
    setBusy(true)
    setError('')
    try {
      uiClick()
      // Fullscreen must start in the same gesture as the click (before await network).
      if (startAsTv) {
        await enterFullscreen()
        setFsActive(isFullscreenActive())
      }
      await createGame(name || 'Host', lang, !startAsTv)
      setScreen('play')
      setTvMode(startAsTv)
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
    <div className={`app${tvMode && screen === 'play' ? ' tv-mode' : ''}${fsActive ? ' is-fullscreen' : ''}`}>
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
              onClick={() => void toggleTvMode()}
            >
              {tvMode ? 'TV av' : 'TV-läge'}
            </button>
          )}
          {tvMode && !fsActive && (
            <button type="button" className="icon-btn on" onClick={() => void enterFullscreen().then(() => setFsActive(isFullscreenActive()))}>
              Fullskärm
            </button>
          )}
          <button
            type="button"
            className="icon-btn hide-on-tv"
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
            setTvMode={(on) => {
              if (on) void enableTvMode()
              else void disableTvMode()
            }}
            onLeave={() => {
              void disableTvMode()
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
      <p className="sister-label">Fler party-spel</p>
      <SisterGames />
    </section>
  )
}

const SISTER_GAMES = [
  { name: 'Factopia', href: 'https://factopia.net', hint: 'Blixtquiz' },
  { name: 'Klotterkaos', href: 'https://klotterkaos.com', hint: 'Rita & sabba' },
  { name: 'Kluddkrig', href: 'https://kluddkrig.com', hint: 'Doodle-fight' },
  { name: 'Party Paths', href: 'https://partypaths.com', hint: 'Emoji-visklek' },
  { name: 'Sabotext', href: 'https://sabotext.com', hint: 'SMS-kupp' },
  { name: 'Your Task Is', href: 'https://yourtaskis.com', hint: 'Live-utmaning' },
  { name: 'Scourgeborn', href: 'https://scourgeborn.com', hint: 'Labbpuls' },
] as const

function SisterGames({ compact }: { compact?: boolean } = {}) {
  return (
    <div className={`sister-games${compact ? ' compact' : ''}`}>
      {SISTER_GAMES.map((g) => (
        <a
          key={g.href}
          className="sister-game"
          href={g.href}
          target="_blank"
          rel="noreferrer"
        >
          <strong>{g.name}</strong>
          {!compact && <span className="sister-hint">{g.hint}</span>}
        </a>
      ))}
    </div>
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
  return (
    <>
      {room.banner && <Banner key={room.banner.text + room.banner.until} banner={room.banner} />}
      {room.status === 'pulse' && room.pulse && (
        <PulseView room={room} tvMode={tvMode} spectating={spectating} />
      )}
      {room.status === 'micro' && room.micro && (
        <section className="play">
          {(tvMode || spectating) && (
            <p className="tv-wait">
              {spectating ? 'Du hostar — spelarna kör på mobilen' : 'TV-läge'} · {room.playingCount}{' '}
              spelare
            </p>
          )}
          <MicroView room={room} tvMode={tvMode || spectating} />
          <ScoreRail room={room} />
        </section>
      )}
      {room.status === 'reveal' && room.lastReveal && <RevealView room={room} />}
      {room.status === 'finished' && <WinnerView room={room} onLeave={onLeave} />}
      {room.status !== 'pulse' &&
        room.status !== 'micro' &&
        room.status !== 'reveal' &&
        room.status !== 'finished' && <p className="muted">Laddar…</p>}
    </>
  )
}

function Banner({ banner }: { banner: NonNullable<PublicRoom['banner']> }) {
  useEffect(() => {
    if (banner.kind === 'sabotage' || banner.kind === 'drama' || banner.kind === 'chaos') dramaSting()
    if (banner.kind === 'finale' || banner.kind === 'sync' || banner.kind === 'golden') syncBoom()
  }, [banner.kind, banner.text])
  return <div className={`room-banner ${banner.kind}`}>{banner.text}</div>
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
  const [pointsPop, setPointsPop] = useState<number | null>(null)
  const lastBeat = useRef(-1)
  const lastCountdown = useRef(-1)
  const skew = useRef(room.serverNow - Date.now())
  const displayOnly = tvMode || spectating

  useEffect(() => {
    skew.current = room.serverNow - Date.now()
  }, [room.serverNow])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + skew.current), 16)
    return () => clearInterval(id)
  }, [])

  const beatMs = 60_000 / pulse.bpm
  const firstNote = pulse.notes[0]?.hitAt ?? pulse.startedAt + beatMs * 2
  const tutorialActive = pulse.kind === 'warmup' && now < firstNote
  const countdownLeft = Math.ceil((firstNote - now) / 1000)

  useEffect(() => {
    const elapsed = now - pulse.startedAt
    const beat = Math.floor(elapsed / beatMs)
    if (beat !== lastBeat.current && beat >= 0) {
      lastBeat.current = beat
      tickPulse()
    }
  }, [now, beatMs, pulse.startedAt])

  useEffect(() => {
    if (!tutorialActive) return
    if (countdownLeft >= 1 && countdownLeft <= 3 && countdownLeft !== lastCountdown.current) {
      lastCountdown.current = countdownLeft
      countdownBeep(countdownLeft)
    }
  }, [tutorialActive, countdownLeft])

  const onHit = useEffectEvent(async (lane: 0 | 1 | 2) => {
    if (displayOnly || tutorialActive) return
    const chaos = Boolean(pulse.chaosUntil && now < pulse.chaosUntil)
    const mapped = (chaos ? ((2 - lane) as 0 | 1 | 2) : lane)
    const upcoming = pulse.notes
      .filter((n) => n.lane === mapped && !pulse.yourHits[n.id])
      .sort((a, b) => Math.abs(a.hitAt - now) - Math.abs(b.hitAt - now))[0]
    if (!upcoming) {
      playGrade('miss')
      setFlash('miss')
      setPointsPop(null)
      return
    }
    if (Math.abs(upcoming.hitAt - now) > 300) {
      playGrade('miss')
      setFlash('miss')
      setPointsPop(null)
      return
    }
    const res = await pulseHit(upcoming.id, mapped)
    const grade = (res.grade as PulseHitGrade) || 'miss'
    const streak = res.streak ?? room.yourStreak
    setFlash(grade)
    setPointsPop(res.points && res.points > 0 ? res.points : null)
    playGrade(grade, streak)
    if (upcoming.sync && (grade === 'perfect' || grade === 'good' || grade === 'almost')) syncBoom()
    if (upcoming.golden && grade === 'perfect') syncBoom()
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
  const chaosActive = Boolean(pulse.chaosUntil && now < pulse.chaosUntil)
  const gradeLabel =
    flash === 'perfect'
      ? 'PERFECT'
      : flash === 'good'
        ? 'GOOD'
        : flash === 'almost'
          ? 'ALMOST'
          : flash === 'early'
            ? 'EARLY'
            : flash === 'late'
              ? 'LATE'
              : flash === 'miss'
                ? 'MISS'
                : ''

  return (
    <section className={`play pulse-play${chaosActive ? ' chaos-mode' : ''}`}>
      <div className="pulse-header">
        <div>
          <p className="eyebrow">
            {kindLabel}
            {displayOnly ? ' · TV' : ''}
            {chaosActive ? ' · KAOS' : ''}
          </p>
          <h2>
            {pulse.bpm} <span className="unit">BPM</span>
          </h2>
        </div>
        {!displayOnly && (
          <div className="mult-stack">
            <div className={`mult${pulse.yourGolden ? ' golden' : ''}`}>
              ×{pulse.yourMultiplier.toFixed(2)}
              <span>{pulse.yourGolden ? 'golden' : 'mult'}</span>
            </div>
            <div className="streak-meter">
              Streak <strong>{room.yourStreak}</strong>
            </div>
          </div>
        )}
        {displayOnly && (
          <div className="mult">
            {room.playingCount}
            <span>spelare</span>
          </div>
        )}
      </div>

      {tutorialActive && (
        <div className="pulse-tutorial">
          {countdownLeft > 0 ? (
            <span className="countdown-num">{countdownLeft}</span>
          ) : (
            <span className="countdown-num go">GO</span>
          )}
          <p>Träffa den gröna linjen · A / S / D</p>
        </div>
      )}

      {chaosActive && (
        <p className="chaos-banner-inline">LANES INVERTERADE — A↔D</p>
      )}

      {displayOnly && <p className="tv-wait">Spelarna träffar pulsen på sina telefoner</p>}

      {displayOnly && pulse.crowd.length > 0 && (
        <div className="crowd-board">
          {pulse.crowd.map((c) => (
            <div key={c.id} className={`crowd-chip ${c.lastGrade ?? ''}`}>
              <strong>{c.name}</strong>
              <span>{c.lastGrade ? c.lastGrade.toUpperCase() : '—'}</span>
              <em>×{c.streak}</em>
            </div>
          ))}
        </div>
      )}

      <div
        className={`lane-stage ${flash ? `flash-${flash}` : ''} ${displayOnly ? 'tv-lanes' : ''} ${chaosActive ? 'chaos' : ''}`}
      >
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
                    className={`note ${n.sync ? 'sync' : ''} ${n.golden ? 'golden' : ''} ${hit ?? ''}`}
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
          {gradeLabel}
          {pointsPop ? <span className="pts-pop">+{pointsPop}</span> : null}
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
  const [shown, setShown] = useState(0)
  useEffect(() => {
    setShown(0)
    if (r.stoleLead) leadSteal()
    else if (r.drama) dramaSting()
    const id = setInterval(() => setShown((n) => n + 1), 180)
    return () => clearInterval(id)
  }, [r])

  return (
    <section className="play reveal">
      <p className="eyebrow">Poäng</p>
      <h2 className="reveal-title">{r.title}</h2>
      {r.stoleLead && (
        <p className="stole-banner">
          {r.stoleLead.name} stal ledningen från {r.stoleLead.fromName}!
        </p>
      )}
      {r.drama && !r.stoleLead && <p className="stole-banner soft">{r.drama}</p>}
      {r.lines.map((l) => (
        <p key={l} className="lede">
          {l}
        </p>
      ))}
      <ol className="reveal-scores">
        {r.scores.map((s, i) => (
          <li
            key={s.id}
            className={`${s.id === room.youId ? 'you' : ''} ${shown > i ? 'in' : 'out'}`}
          >
            <span>
              #{i + 1} {s.name}
            </span>
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
  const you = room.players.find((p) => p.id === room.youId)
  const playing = Boolean(you?.playing)
  const recorded = useRef(false)
  const rematch = room.rematch
  const rematchLeft = useCountdown(rematch?.endsAt, room.serverNow)

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

      <EchoReel room={room} winnerName={winner?.name ?? null} />

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

      <div className="actions rematch-actions">
        {rematch && (
          <div className="rematch-meter">
            <div
              className="rematch-bar"
              style={{
                width: `${Math.max(0, Math.min(100, (rematchLeft / 12) * 100))}%`,
              }}
            />
            <p>
              Rematch Heat {Math.min(5, room.heat + 1)} · {rematch.voteCount}/{rematch.need} redo
              {rematchLeft > 0 ? ` · ${Math.ceil(rematchLeft)}s` : ''}
            </p>
          </div>
        )}
        {playing && (
          <button
            type="button"
            className={`btn primary pulse-btn${rematch?.youVoted ? ' voted' : ''}`}
            disabled={Boolean(rematch?.youVoted)}
            onClick={() => {
              uiClick()
              void rematchGame()
            }}
          >
            {rematch?.youVoted
              ? 'Du är redo!'
              : rematch
                ? `IGEN! · Heat ${Math.min(5, room.heat + 1)}`
                : `Starta omröstning · Heat ${Math.min(5, room.heat + 1)}`}
          </button>
        )}
        {!playing && (
          <p className="muted tv-wait">
            {rematch
              ? 'Spelarna trycker IGEN på telefonerna'
              : 'Väntar på att någon startar omröstning…'}
          </p>
        )}
        <button type="button" className="btn ghost" onClick={onLeave}>
          Avsluta
        </button>
      </div>

      <p className="sister-label">Sug efter mer?</p>
      <SisterGames compact />
    </section>
  )
}

type ReelSlide = {
  key: string
  kind: 'crown' | 'sms' | 'beat' | 'fail' | 'doodle' | 'sab'
  title: string
  body?: string
  name?: string
  strokes?: { x: number; y: number }[][]
}

function buildEchoSlides(room: PublicRoom, winnerName: string | null): ReelSlide[] {
  const slides: ReelSlide[] = []
  if (winnerName) {
    slides.push({
      key: 'crown',
      kind: 'crown',
      title: 'Nattens kung',
      body: winnerName,
    })
  }
  if (room.echo.bestSms) {
    slides.push({
      key: 'sms',
      kind: 'sms',
      title: 'Bästa kuppen',
      body: `“${room.echo.bestSms.text}”`,
      name: room.echo.bestSms.authorName,
    })
  }
  for (const [i, h] of room.echo.highlights.slice(-5).entries()) {
    if (winnerName && h.includes(winnerName) && h.includes('vann')) continue
    slides.push({ key: `h-${i}`, kind: 'beat', title: 'Echo', body: h })
  }
  for (const [i, f] of [...room.echo.emojiFails, ...room.echo.wrongGuesses]
    .slice(-3)
    .entries()) {
    slides.push({
      key: `f-${i}`,
      kind: 'fail',
      title: 'Klassisk miss',
      body: f,
    })
  }
  const avatars = Object.entries(room.echo.avatars).slice(0, 3)
  for (const [id, strokes] of avatars) {
    const name = room.players.find((p) => p.id === id)?.name ?? '???'
    slides.push({
      key: `a-${id}`,
      kind: 'doodle',
      title: 'Klotter-avatar',
      name,
      strokes,
    })
  }
  if (room.saboteurId) {
    const sab = room.players.find((p) => p.id === room.saboteurId)
    if (sab) {
      slides.push({
        key: 'sab',
        kind: 'sab',
        title: 'Sabotören avslöjad',
        body: sab.name,
      })
    }
  }
  return slides.length ? slides : [{ key: 'empty', kind: 'beat', title: 'Echo', body: 'En natt utan spår…' }]
}

function MiniDoodle({ strokes }: { strokes: { x: number; y: number }[][] }) {
  const paths = strokes
    .map((stroke) => {
      if (!stroke.length) return ''
      return stroke
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x * 100).toFixed(1)} ${(p.y * 100).toFixed(1)}`)
        .join(' ')
    })
    .filter(Boolean)
  return (
    <svg className="reel-doodle" viewBox="0 0 100 100" aria-hidden>
      {paths.map((d) => (
        <path key={d.slice(0, 24)} d={d} />
      ))}
    </svg>
  )
}

function EchoReel({ room, winnerName }: { room: PublicRoom; winnerName: string | null }) {
  const slides = buildEchoSlides(room, winnerName)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (slides.length <= 1) return
    const id = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 1600)
    return () => window.clearInterval(id)
  }, [slides.length])

  const slide = slides[idx] ?? slides[0]!

  return (
    <div className="echo-reel" aria-live="polite">
      <div className={`echo-slide ${slide.kind}`} key={slide.key}>
        <span className="reel-tag">{slide.title}</span>
        {slide.kind === 'doodle' && slide.strokes ? (
          <>
            <MiniDoodle strokes={slide.strokes} />
            <strong className="reel-name">{slide.name}</strong>
          </>
        ) : (
          <>
            <p className="reel-body">{slide.body}</p>
            {slide.name && <cite className="reel-name">— {slide.name}</cite>}
          </>
        )}
      </div>
      {slides.length > 1 && (
        <div className="reel-dots">
          {slides.map((s, i) => (
            <span key={s.key} className={i === idx ? 'on' : ''} />
          ))}
        </div>
      )}
    </div>
  )
}
