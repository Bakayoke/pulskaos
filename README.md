# Pulskaos

Party-spel med synlig puls (Guitar Hero-känsla utan musik), mikrospel, Sync Hits, Night Heat, Echo och sabotör.

**Domän:** [pulskaos.com](https://pulskaos.com)

## Stack

- **Client:** React + Vite (Cloudflare)
- **Server:** Express + Socket.io (Railway)
- **Persist:** Redis (rekommenderas i prod) eller `PULSKAOS_DATA_DIR`

## Lokal utveckling

```bash
npm install
npm install --prefix client
npm run dev
```

Öppna http://localhost:5173 — API på :3001.

## Spelet

1. **Lobby** — kod / `?join=ABCD`
2. **Pulse Lane** — timing utan musik (Sync Hits, sabotör)
3. Mikrospel (roteras per natt, färre vid högre Heat):
   - Blitzfakta · Sms-kupp · Emoji-hopp · Sabotage-klotter · Arena-burst · Labbpuls · Live-test
4. **Echo** — klotter blir arena-avatar, felgissningar stör quiz, SMS toast
5. **Rematch** — Night Heat 1→5 (Heat 5 = rent Pulse-Off)

## Deploy

### Railway (API + sockets)

1. Nytt projekt från GitHub
2. Lägg till Redis → `REDIS_URL`
3. Variabler: `PUBLIC_APP_URL=https://pulskaos.com`, `CORS_ORIGIN=https://pulskaos.com,https://www.pulskaos.com`
4. Sätt `VITE_SOCKET_URL` till Railway-URL i `client/.env.production` före client-build
5. Verifiera: `GET /api/health`

### Cloudflare (frontend)

```bash
npm run deploy:cf
```

Koppla `pulskaos.com` / `www` i Cloudflare (routes finns i `wrangler.toml`).
