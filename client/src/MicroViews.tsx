import { useEffect, useRef, useState } from 'react'
import {
  arenaPunch,
  arenaSubmit,
  blitzAnswer,
  emojiGuess,
  emojiSubmit,
  klotterSubmit,
  klotterVote,
  labbTap,
  liveDone,
  liveScore,
  smsDraft,
  smsSabotage,
  smsVote,
} from './api'
import { dramaSting, uiClick } from './sfx'
import type { PublicRoom, StrokePoint } from './types'

function useCountdown(endsAt: number | null | undefined, serverNow: number) {
  const [left, setLeft] = useState(0)
  const skew = useRef(0)
  useEffect(() => {
    skew.current = serverNow - Date.now()
  }, [serverNow])
  useEffect(() => {
    if (!endsAt) return
    const tick = () => setLeft(Math.max(0, endsAt - (Date.now() + skew.current)))
    tick()
    const id = setInterval(tick, 50)
    return () => clearInterval(id)
  }, [endsAt])
  return left
}

function Timer({ endsAt, serverNow, total }: { endsAt: number; serverNow: number; total: number }) {
  const left = useCountdown(endsAt, serverNow)
  return (
    <div className="timer-bar">
      <div style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
    </div>
  )
}

function MiniDoodle({ strokes, shake }: { strokes: StrokePoint[][]; shake?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const w = c.width
    const h = c.height
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = '#d6ff3f'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (const stroke of strokes) {
      if (stroke.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(stroke[0]!.x * w, stroke[0]!.y * h)
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i]!.x * w, stroke[i]!.y * h)
      ctx.stroke()
    }
  }, [strokes])
  return <canvas ref={ref} width={120} height={120} className={`mini-doodle ${shake ? 'shake' : ''}`} />
}

function DrawPad({
  onSubmit,
  orbActive,
}: {
  onSubmit: (strokes: StrokePoint[][]) => void
  orbActive: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<StrokePoint[][]>([])
  const drawing = useRef(false)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const paint = () => {
      ctx.fillStyle = '#0a0e14'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.strokeStyle = orbActive ? '#ff3b5c' : '#f2f4f8'
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      for (const stroke of strokes.current) {
        if (stroke.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(stroke[0]!.x * c.width, stroke[0]!.y * c.height)
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i]!.x * c.width, stroke[i]!.y * c.height)
        }
        ctx.stroke()
      }
    }
    paint()
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect()
      return {
        x: (e.clientX - r.left) / r.width,
        y: (e.clientY - r.top) / r.height,
      }
    }
    const down = (e: PointerEvent) => {
      drawing.current = true
      c.setPointerCapture(e.pointerId)
      strokes.current.push([pos(e)])
    }
    const move = (e: PointerEvent) => {
      if (!drawing.current) return
      strokes.current[strokes.current.length - 1]?.push(pos(e))
      paint()
    }
    const up = () => {
      drawing.current = false
    }
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    c.addEventListener('pointercancel', up)
    return () => {
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
      c.removeEventListener('pointercancel', up)
    }
  }, [orbActive])

  return (
    <div className={`draw-wrap ${orbActive ? 'orb' : ''}`}>
      <canvas ref={ref} width={360} height={360} className="draw-pad" />
      <button
        type="button"
        className="btn primary"
        onClick={() => onSubmit(strokes.current)}
      >
        Klar
      </button>
    </div>
  )
}

export function MicroView({ room, tvMode = false }: { room: PublicRoom; tvMode?: boolean }) {
  const micro = room.micro
  if (!micro) return null

  if (tvMode) {
    return <TvMicroMirror room={room} />
  }

  if (micro.kind === 'blitz') {
    return (
      <section className="play">
        <p className="eyebrow">Blitzfakta</p>
        <Timer endsAt={micro.endsAt} serverNow={room.serverNow} total={9000} />
        <h2 className="prompt">{micro.prompt}</h2>
        <div className="option-grid">
          {micro.options.map((opt, i) => {
            const isTrap = micro.echoTrapIndex === i
            const fellForIt = isTrap && micro.yourAnswer === i
            return (
              <button
                key={opt}
                type="button"
                className={`option ${micro.yourAnswer === i ? 'picked' : ''} ${fellForIt ? 'echo-trap hit' : ''}`}
                disabled={micro.yourAnswer !== null}
                onClick={() => {
                  if (isTrap) dramaSting()
                  else uiClick()
                  void blitzAnswer(i)
                }}
              >
                {fellForIt && <span className="trap-tag">Echo-fälla!</span>}
                {opt}
              </button>
            )
          })}
        </div>
        <p className="muted ready-count">
          {micro.answeredCount}/{room.playingCount} svarade
        </p>
      </section>
    )
  }

  if (micro.kind === 'sms') return <SmsView room={room} />
  if (micro.kind === 'emoji') return <EmojiView room={room} />
  if (micro.kind === 'klotter') return <KlotterView room={room} />
  if (micro.kind === 'arena') return <ArenaView room={room} />
  if (micro.kind === 'labb') return <LabbView room={room} />
  if (micro.kind === 'live') return <LiveView room={room} />
  return null
}

function TvMicroMirror({ room }: { room: PublicRoom }) {
  const micro = room.micro!
  const left = useCountdown(micro.endsAt, room.serverNow)
  const totalMs =
    micro.kind === 'blitz'
      ? 9000
      : micro.kind === 'sms'
        ? 35000
        : micro.kind === 'live'
          ? 45000
          : micro.kind === 'labb'
            ? 40000
            : 28000

  const title =
    micro.kind === 'blitz'
      ? 'Blitzfakta'
      : micro.kind === 'sms'
        ? micro.phase === 'vote'
          ? 'Sms-kupp · Rösta'
          : micro.phase === 'sabotage'
            ? 'Sms-kupp · Sabotage'
            : 'Sms-kupp · Skriv'
        : micro.kind === 'emoji'
          ? micro.phase === 'guess'
            ? 'Emoji-hopp · Gissa'
            : 'Emoji-hopp · Skapa'
          : micro.kind === 'klotter'
            ? micro.phase === 'vote'
              ? 'Sabotage-klotter · Rösta'
              : 'Sabotage-klotter · Rita'
            : micro.kind === 'arena'
              ? micro.phase === 'draw'
                ? 'Kludd-burst · Rita'
                : 'Kludd-burst · Dunka'
              : micro.kind === 'labb'
                ? 'Labbpuls'
                : micro.phase === 'score'
                  ? 'Live-test · Betyg'
                  : 'Live-test'

  let body: string | null = null
  if (micro.kind === 'blitz') body = micro.prompt
  if (micro.kind === 'sms') body = micro.prompt
  if (micro.kind === 'emoji' && micro.phase === 'guess' && micro.guessTarget)
    body = null // shown as parade
  if (micro.kind === 'live') body = micro.challenge
  if (micro.kind === 'labb') body = micro.recipe.join(' → ')
  if (micro.kind === 'arena') body = micro.phase === 'draw' ? micro.prompt : null
  if (micro.kind === 'klotter' && micro.phase === 'draw') body = 'Rita på mobilen'

  return (
    <div className="tv-micro">
      <p className="eyebrow">{title}</p>
      <div className="timer-bar">
        <div style={{ width: `${Math.min(100, (left / totalMs) * 100)}%` }} />
      </div>
      {body && <h2 className="prompt tv-prompt">{body}</h2>}

      {micro.kind === 'blitz' && (
        <div className="option-grid tv-options">
          {micro.options.map((opt) => (
            <div key={opt} className="option static">
              {opt}
            </div>
          ))}
          <p className="muted ready-count">
            {micro.answeredCount}/{room.playingCount} svarade
          </p>
        </div>
      )}

      {micro.kind === 'sms' && micro.phase === 'vote' && micro.voteOptions && (
        <div className="vote-list tv-sms-votes">
          {micro.voteOptions.map((o) => (
            <div key={o.id} className="sms-card">
              <span>{o.authorName}</span>
              <p>{o.text}</p>
            </div>
          ))}
          <p className="muted ready-count">
            {micro.voteCount}/{room.playingCount} röstat
          </p>
        </div>
      )}
      {micro.kind === 'sms' && micro.phase !== 'vote' && (
        <p className="muted ready-count">
          {micro.phase === 'write'
            ? `${micro.draftCount}/${room.playingCount} skrivit`
            : `${micro.sabotageCount}/${room.playingCount} sabbat`}
        </p>
      )}

      {micro.kind === 'emoji' && (
        <>
          {micro.phase === 'guess' && micro.crowdEmojis && micro.crowdEmojis.length > 0 ? (
            <div className="emoji-parade">
              {micro.crowdEmojis.map((e) => (
                <div key={e.id} className="emoji-parade-item">
                  <span className="emoji-huge">{e.emoji}</span>
                  <span>{e.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="tv-wait">
              {micro.emojiCount}/{room.playingCount} har skickat emoji
            </p>
          )}
          {micro.phase === 'guess' && (
            <p className="muted ready-count">
              {micro.guessCount}/{room.playingCount} gissat
            </p>
          )}
        </>
      )}

      {micro.kind === 'arena' && micro.phase === 'draw' && (
        <p className="muted ready-count">
          {micro.drawCount}/{room.playingCount} ritat
        </p>
      )}
      {micro.kind === 'arena' && micro.phase === 'fight' && (
        <div className="arena-stage tv-arena">
          {micro.fighters.map((f) => (
            <div key={f.id} className="fighter" style={{ left: `${f.x}%` }}>
              {f.avatar && f.avatar.length > 0 ? (
                <MiniDoodle strokes={f.avatar} />
              ) : (
                <div className="fighter-fallback">{f.name.slice(0, 2).toUpperCase()}</div>
              )}
              <div className="hp">
                <div style={{ width: `${f.hp}%` }} />
              </div>
              <span>
                {f.name} · {f.punches}
              </span>
            </div>
          ))}
        </div>
      )}

      {micro.kind === 'klotter' && micro.phase === 'vote' && micro.voteOptions && (
        <div className="doodle-vote">
          {micro.voteOptions.map((o) => (
            <div key={o.id} className="doodle-card">
              <MiniDoodle strokes={o.strokes} />
              <span>{o.name}</span>
            </div>
          ))}
          <p className="muted ready-count">
            {micro.voteCount}/{room.playingCount} röstat
          </p>
        </div>
      )}
      {micro.kind === 'klotter' && micro.phase === 'draw' && (
        <p className="muted ready-count">
          {micro.drawCount}/{room.playingCount} ritat
        </p>
      )}

      {micro.kind === 'labb' && (
        <ol className="reveal-scores">
          {micro.leaderboard.map((l) => (
            <li key={l.id}>
              <span>{l.name}</span>
              <span>{l.delivered}</span>
            </li>
          ))}
        </ol>
      )}

      {micro.kind === 'live' && (
        <div className="vote-list">
          {micro.players.map((p) => (
            <div key={p.id} className="sms-card">
              <span>
                {p.name}
                {p.done ? ' · klar' : ' · …'}
                {p.write ? ` — “${p.write}”` : ''}
              </span>
            </div>
          ))}
          <p className="muted ready-count">
            {micro.phase === 'play'
              ? `${micro.doneCount}/${room.playingCount} klara`
              : `${micro.votersDone}/${room.playingCount} har betygsatt`}
          </p>
        </div>
      )}
    </div>
  )
}

function SmsView({ room }: { room: PublicRoom }) {
  const micro = room.micro!
  if (micro.kind !== 'sms') return null
  const [text, setText] = useState('')
  return (
    <section className="play">
      <p className="eyebrow">
        Sms-kupp · {micro.phase === 'write' ? 'Skriv' : micro.phase === 'sabotage' ? 'Sabba' : 'Rösta'}
      </p>
      <Timer endsAt={micro.endsAt} serverNow={room.serverNow} total={35000} />
      <h2 className="prompt">{micro.prompt}</h2>
      {micro.phase === 'write' &&
        (micro.yourDraft ? (
          <p className="locked">Skickat — väntar…</p>
        ) : (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={140} rows={3} />
            <button type="button" className="btn primary" onClick={() => void smsDraft(text).then(() => setText(''))}>
              Skicka
            </button>
          </>
        ))}
      {micro.phase === 'sabotage' && micro.sabotageTarget && (
        <>
          <div className="sms-card">
            <span>{micro.sabotageTarget.name} skrev</span>
            <p>{micro.sabotageTarget.text}</p>
          </div>
          {micro.yourSabotage ? (
            <p className="locked">Sabotage inne.</p>
          ) : (
            <>
              <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={160} rows={3} />
              <button
                type="button"
                className="btn primary"
                onClick={() => void smsSabotage(text).then(() => setText(''))}
              >
                Sabotera
              </button>
            </>
          )}
        </>
      )}
      {micro.phase === 'vote' && micro.voteOptions && (
        <div className="vote-list">
          {micro.voteOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`sms-card vote ${micro.yourVote === o.id ? 'picked' : ''}`}
              disabled={micro.yourVote !== null}
              onClick={() => void smsVote(o.id)}
            >
              <span>Anonym kupp</span>
              <p>{o.text}</p>
            </button>
          ))}
        </div>
      )}
      <p className="muted ready-count">
        {micro.phase === 'write' && `${micro.draftCount}/${room.playingCount} skrivit`}
        {micro.phase === 'sabotage' && `${micro.sabotageCount}/${room.playingCount} sabbat`}
        {micro.phase === 'vote' && `${micro.voteCount}/${room.playingCount} röstat`}
      </p>
    </section>
  )
}

function EmojiView({ room }: { room: PublicRoom }) {
  const micro = room.micro!
  if (micro.kind !== 'emoji') return null
  const [text, setText] = useState('')
  return (
    <section className="play">
      <p className="eyebrow">Emoji-hopp · {micro.phase === 'emoji' ? 'Emoji' : 'Gissa'}</p>
      <Timer endsAt={micro.endsAt} serverNow={room.serverNow} total={28000} />
      {micro.phase === 'emoji' && (
        <>
          <h2 className="prompt">Visa med emoji: {micro.yourWord}</h2>
          {micro.yourEmoji ? (
            <p className="locked">{micro.yourEmoji}</p>
          ) : (
            <>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={24} placeholder="🍕🦈…" />
              <button type="button" className="btn primary" onClick={() => void emojiSubmit(text).then(() => setText(''))}>
                Skicka emoji
              </button>
            </>
          )}
        </>
      )}
      {micro.phase === 'guess' && micro.guessTarget && (
        <>
          <h2 className="prompt emoji-big">{micro.guessTarget.emoji}</h2>
          {micro.yourGuess ? (
            <p className="locked">Gissning inne.</p>
          ) : (
            <>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={40} placeholder="Vad betyder det?" />
              <button type="button" className="btn primary" onClick={() => void emojiGuess(text).then(() => setText(''))}>
                Gissa
              </button>
            </>
          )}
        </>
      )}
      <p className="muted ready-count">
        {micro.phase === 'emoji'
          ? `${micro.emojiCount}/${room.playingCount} emoji`
          : `${micro.guessCount}/${room.playingCount} gissat`}
      </p>
    </section>
  )
}

function KlotterView({ room }: { room: PublicRoom }) {
  const micro = room.micro!
  if (micro.kind !== 'klotter') return null
  return (
    <section className="play">
      <p className="eyebrow">Sabotage-klotter · {micro.phase === 'draw' ? 'Rita' : 'Rösta'}</p>
      <Timer endsAt={micro.endsAt} serverNow={room.serverNow} total={28000} />
      {micro.phase === 'draw' && (
        <>
          <h2 className="prompt">Rita: {micro.yourWord}</h2>
          {micro.yourDrawing ? (
            <p className="locked">Inlämnad.</p>
          ) : (
            <DrawPad orbActive={micro.orbActive} onSubmit={(s) => void klotterSubmit(s)} />
          )}
        </>
      )}
      {micro.phase === 'vote' && micro.voteOptions && (
        <div className="doodle-vote">
          {micro.voteOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`doodle-card ${micro.yourVote === o.id ? 'picked' : ''}`}
              disabled={micro.yourVote !== null}
              onClick={() => void klotterVote(o.id)}
            >
              <MiniDoodle strokes={o.strokes} />
              <span>{o.name}</span>
            </button>
          ))}
        </div>
      )}
      <p className="muted ready-count">
        {micro.phase === 'draw'
          ? `${micro.drawCount}/${room.playingCount} ritat`
          : `${micro.voteCount}/${room.playingCount} röstat`}
      </p>
    </section>
  )
}

function ArenaView({ room }: { room: PublicRoom }) {
  const micro = room.micro!
  if (micro.kind !== 'arena') return null
  return (
    <section className="play">
      <p className="eyebrow">
        Kludd-burst · {micro.phase === 'draw' ? 'Rita' : 'Dunka'}
      </p>
      <Timer
        endsAt={micro.endsAt}
        serverNow={room.serverNow}
        total={micro.phase === 'draw' ? 16000 : 18000}
      />
      <h2 className="prompt">{micro.prompt}</h2>
      {micro.phase === 'draw' && (
        <>
          {micro.yourDrawing ? (
            <p className="locked">Klar — väntar på övriga.</p>
          ) : (
            <DrawPad orbActive={false} onSubmit={(s) => void arenaSubmit(s)} />
          )}
          <p className="muted ready-count">
            {micro.drawCount}/{room.playingCount} ritat
          </p>
        </>
      )}
      {micro.phase === 'fight' && (
        <>
          <div className="arena-stage">
            {micro.fighters.map((f) => (
              <div key={f.id} className="fighter" style={{ left: `${f.x}%` }}>
                {f.avatar && f.avatar.length > 0 ? (
                  <MiniDoodle strokes={f.avatar} shake={f.hp < 40} />
                ) : (
                  <div className="fighter-fallback">{f.name.slice(0, 2).toUpperCase()}</div>
                )}
                <div className="hp">
                  <div style={{ width: `${f.hp}%` }} />
                </div>
                <span>{f.name}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn primary punch-btn"
            onPointerDown={(e) => {
              e.preventDefault()
              void arenaPunch()
            }}
          >
            DUNKA · {micro.yourPunches}
          </button>
        </>
      )}
    </section>
  )
}

function LabbView({ room }: { room: PublicRoom }) {
  const micro = room.micro!
  if (micro.kind !== 'labb') return null
  const next = micro.recipe[micro.yourStep]
  return (
    <section className="play">
      <p className="eyebrow">Labbpuls</p>
      <Timer endsAt={micro.endsAt} serverNow={room.serverNow} total={40000} />
      <h2 className="prompt">Levererade: {micro.yourDelivered} · Fail: {micro.yourFails}</h2>
      <p className="lede">Nästa steg: <strong>{next ?? '—'}</strong></p>
      <div className="labb-grid">
        {micro.recipe.map((step) => (
          <button
            key={step}
            type="button"
            className={`btn ${step === next ? 'primary' : 'ghost'}`}
            onClick={() => void labbTap(step)}
          >
            {step}
          </button>
        ))}
      </div>
      <ol className="reveal-scores">
        {micro.leaderboard.map((l) => (
          <li key={l.id}>
            <span>{l.name}</span>
            <span>{l.delivered}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function LiveView({ room }: { room: PublicRoom }) {
  const micro = room.micro!
  if (micro.kind !== 'live') return null
  const [text, setText] = useState('')
  const me = room.players.find((p) => p.id === room.youId)
  const playing = Boolean(me?.playing)
  const others = micro.players.filter((p) => p.id !== room.youId)
  const ratedAll =
    playing && others.length > 0 && others.every((p) => micro.yourVotes[p.id] != null)

  return (
    <section className="play">
      <p className="eyebrow">Live-test · {micro.phase === 'play' ? 'Utför' : 'Peer-betyg'}</p>
      <Timer endsAt={micro.endsAt} serverNow={room.serverNow} total={45000} />
      <h2 className="prompt">{micro.challenge}</h2>
      {micro.phase === 'play' && playing && (
        <>
          {micro.challengeKind === 'write' && !micro.yourDone && (
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={80} rows={2} />
          )}
          {micro.yourDone ? (
            <p className="locked">Klar — väntar på övriga.</p>
          ) : (
            <button
              type="button"
              className="btn primary"
              onClick={() => void liveDone(micro.challengeKind === 'write' ? text : undefined)}
            >
              Jag är klar
            </button>
          )}
        </>
      )}
      {micro.phase === 'play' && !playing && (
        <p className="muted">{micro.doneCount} klara — spelarna kör live.</p>
      )}
      {micro.phase === 'score' && playing && (
        <>
          {ratedAll ? (
            <p className="locked">Betyg inne — väntar på övriga.</p>
          ) : (
            <div className="vote-list">
              {others.map((p) => (
                <div key={p.id} className="sms-card">
                  <span>
                    {p.name}
                    {p.write ? ` — “${p.write}”` : p.done ? ' · klar' : ' · missade'}
                  </span>
                  <div className="star-row">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`chip ${micro.yourVotes[p.id] === s ? 'on' : ''}`}
                        onClick={() => void liveScore(p.id, s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {micro.phase === 'score' && !playing && (
        <div className="vote-list">
          {micro.players.map((p) => (
            <div key={p.id} className="sms-card">
              <span>
                {p.name}
                {p.write ? ` — “${p.write}”` : ''}
              </span>
            </div>
          ))}
          <p className="muted">
            Spelarna betygsätter varandra · {micro.votersDone}/{room.playingCount}
          </p>
        </div>
      )}
      {micro.phase === 'play' && (
        <p className="muted ready-count">
          {micro.doneCount}/{room.playingCount} klara
        </p>
      )}
      {micro.phase === 'score' && playing && (
        <p className="muted ready-count">
          {micro.votersDone}/{room.playingCount} har betygsatt
        </p>
      )}
    </section>
  )
}
