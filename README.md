# Session 8 game

One multiplayer browser game, built by every team in this repository.

The part that connects the players is already built, in `lib/sync.js`, and you build the game on top of it.

## How to run it

1. In a terminal, go to this folder.
2. Run `npm start`.
3. In your browser, open `http://localhost:8000`.
4. Open the same address in a second tab. Each tab is a separate player.

You see two dots. When you move one with WASD or the arrow keys, it also moves in the other tab.

## How to test without the other teams

Add `?room=` and a name to the address. Example: `http://localhost:8000/?room=team-blue`. Only browsers with the same room name meet each other.

## What `lib/sync.js` gives you

- State is what each player looks like right now, for example the position. It is sent to the other players 20 times a second.
- Channels carry messages for things that happen once, for example a throw.
- Shared maps hold data that every browser keeps a copy of, for example the scores. The data is still there after a reload, and players who join later get it.

`CLAUDE.md` has the full list and the rules. Claude Code reads that file by itself.

## How to check `lib/sync.js` still works

Run this only if you changed `lib/sync.js`.

1. First time only: run `npm install`, then `npx playwright install chromium`.
2. Run `npm test`.

The test opens three browsers and checks 14 things. It ends with "All 14 checks passed."
