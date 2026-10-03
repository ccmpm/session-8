# Session 8 game

Rules for the coding agent that builds a session 8 game: one file, `index.html`, that works when opened by double-clicking it.

## Networking is already built

Use `lib/sync.js` for everything that goes between players. Import it from `https://cdn.jsdelivr.net/gh/ccmpm/session-8@main/lib/sync.js`; do not copy it into the project. It connects the browsers in a room directly to each other, and through ccm.pm's relay when two networks will not connect directly. The game has no server of its own.

- You must not add a server, a database, WebSocket code or WebRTC code.
- You must not import Trystero or Yjs yourself. `lib/sync.js` already does.
- You must not change `lib/sync.js` or write your own copy of it.

```js
import { connect } from 'https://cdn.jsdelivr.net/gh/ccmpm/session-8@main/lib/sync.js';
const net = await connect({ app: 'TEAMNAME' });   // the team's name: players only meet others with the same app name

net.id                      // this player's id, the same after a reload
net.setState({ x, y })      // this player's live state
net.players()               // [{ id, me, state }] for every player who has set a state
net.onJoin(id => {})        // another player connected
net.onLeave(id => {})       // another player left

const shot = net.channel('shot');        // name: 12 characters at most
shot.send({ x, y });                     // goes to every other player, not back to you
shot.on((data, fromId) => {});

const scores = net.shared('scores');     // a Yjs Y.Map: get, set, delete, has, entries, forEach
net.onChange(() => {});                  // runs after any shared map changes
```

`https://raw.githubusercontent.com/ccmpm/session-8/main/example.html` is a small working one-file example that uses all three parts.

## Which part to use

| The data | Use | Why |
|---|---|---|
| Changes many times a second and only matters now: position, angle, health bar, "is boosted" | `net.setState` | Sent 20 times a second. A player who joins later gets the current state. Gone when the player leaves. |
| Something that happens once: a throw, a hit, a sound, a chat line on screen | `net.channel` | Sent once and not stored. A player who joins later never sees it. |
| Must still be there after a reload, or must reach players who join later: scores, names, the level, items on the floor | `net.shared` | Every browser keeps a copy. Saved in the browser and merged when players reconnect. |

## Rules for state

- Pass the whole state to `net.setState` each time. It replaces the old state.
- Call `net.setState` again after you change a field. Changing the object alone sends nothing.
- Move other players smoothly: their state arrives 20 times a second, so draw them moving toward the newest position.

## Rules for shared maps

- Store plain values: numbers, strings, plain objects and arrays. To change an object, `set` the whole object again.
- When two players set the same key at the same moment, one of the two values is lost. So a player must only write keys that contain their own id. Example: `coffees.set(net.id, n + 1)`.
- For events that involve two players, add one new key per event and count the keys. Example: `hits.set(throwerId + '|' + throwNumber, { by: throwerId, victim: net.id })`. The score of a player is the number of entries with their id in `by`.
- Decide each event in one browser only. Example: the player who is hit records the hit. Then the hit is counted once.

## Running and testing

- One file, `index.html`, plain HTML with one `<script type="module">`. No build step, no npm, no server. Everything it needs comes from `https://cdn.jsdelivr.net`.
- It must work opened from disk (`file://`): import only from https URLs, never from a local path.
- Each open copy of the page is a separate player. Open it in two tabs to test.
- Put `window.net = net` so the console can inspect the connection. Example: `net.players()`.
