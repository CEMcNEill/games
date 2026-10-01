# Bug Survivors co-op relay

A Cloudflare Worker with one Durable Object per room code, on the route `play.funglass.es/mp/*`. The static site
stays on Hostinger; Cloudflare sends only `/mp/*` here. It runs the lobby (join by code, ready, a 3 s countdown) and
then relays the game's input turns (20 a second) to everyone in the room. It never runs game code. See
`../bug-survivors/COOP.md`.

- `GET /mp/health` returns `ok`
- `GET /mp/ws/<CODE>` opens a WebSocket into room CODE (4 letters; ZZZ1-ZZZ3 = a room with 1-3 bots, which give their seats
  to real players who join)

## Run and deploy

    npm install
    wrangler dev            # ws://127.0.0.1:8787/mp/ws/ABCD (the game: ?mp=ws://127.0.0.1:8787/mp)
    wrangler login          # once
    wrangler deploy         # route play.funglass.es/mp/* on the funglass.es zone

This fits the free Workers plan (SQLite-backed Durable Objects; incoming WebSocket messages bill at 20:1).
