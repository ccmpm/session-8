# Session 8 game

Every team at session 8 builds one multiplayer browser game. The code that connects the players is already written: `lib/sync.js`. It joins the browsers in a room directly to each other, with Yjs for shared data, and needs no server, no account and no install.

Your team writes the game. You do that by telling your coding agent what to build.

## The prompt

Open your coding agent (Claude Code, Cursor, Codex, ...) in an empty folder and paste this, then describe your game:

> Use the library in https://github.com/ccmpm/session-8 to set up multiplayer sync for a browser game: copy `lib/sync.js` from that repo into `lib/sync.js` here, read its `AGENTS.md` and follow its rules. Plain HTML and JavaScript modules, no build step, no npm packages, no server of our own. `net.setState` for live positions, `net.channel` for one-off events, `net.shared` (Yjs) for scores and anything that must survive a reload. Then build this game: ...

The agent fetches the two files, writes `index.html`, and your game is online with everyone else's.

If your agent cannot fetch from GitHub, load the library straight from a CDN instead of copying it:

```js
import { connect } from 'https://cdn.jsdelivr.net/gh/ccmpm/session-8@main/lib/sync.js';
```

## How to run the game

The page must be served over http; opening the file directly does not work. Any static file server does. Pick the one you have:

- `python3 -m http.server 8000`
- `node serve.js` (the small server in this repo, if you cloned it)
- `npx serve` if you already use npm

Open `http://localhost:8000` in two tabs. Each tab is a separate player.

## Rooms

Without a room name your browser connects to the browsers of every team, even when the game runs on your own laptop. Add `?room=team-blue` to the address to connect only to browsers with the same room name.

## The library

`AGENTS.md` is the full reference. In short:

```js
import { connect } from './lib/sync.js';
const net = await connect({ app: 'ccm-session-8' });

net.id                      // this player's id, the same after a reload
net.setState({ x, y })      // this player's live state, sent 20 times a second
net.players()               // [{ id, me, state }] for every player
net.channel('shot')         // one-off messages: send(data), on((data, fromId) => {})
net.shared('scores')        // a Yjs Y.Map every browser keeps a copy of
net.onChange(() => {})      // runs after any shared map changes
```

`index.html` in this repo is a small working example that uses all three.

## Changing `lib/sync.js`

Only the organisers should need to. If you do, run the test: `npm install`, `npx playwright install chromium`, then `npm test`. The last line says "All 14 checks passed." when it works.
