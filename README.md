# Session 8 game

This page is for team members at session 8. Every team builds one multiplayer browser game in this repository.

The code that connects the players is already written. It is in `lib/sync.js`. Your team writes the game.

You need Node.js version 18 or later.

## How to run the game

1. Open a terminal in the folder of this repository.
2. Run `npm start`. The terminal prints `http://localhost:8000`.
3. In your browser, open `http://localhost:8000`.
4. Open the same address in a second tab. Each tab is a separate player.

When the two tabs connect, each tab shows two dots. Your dot has a white outline. Press W, A, S, D or the arrow keys to move your dot. It moves in the other tab too.

## How to change the game

1. Open a second terminal in the folder of this repository.
2. Start your coding agent, for example Claude Code. The agent reads `AGENTS.md`, which has the rules for `lib/sync.js`.
3. Type what the game must do.
4. In your browser, reload both tabs. The tabs show the changed game.

## How to test without the other teams

Without a room name, your browser connects to the browsers of every team, even when the game runs on your own laptop.

Add `?room=` and a room name to the address, for example `http://localhost:8000/?room=team-blue`. Your browser then connects only to browsers with the same room name.

## How to check `lib/sync.js` after a change

If you changed `lib/sync.js`, run the test.

1. First time only: run `npm install`, then run `npx playwright install chromium`.
2. Run `npm test`. The test opens three browsers.
3. Read the last line. It says "All 14 checks passed." when `lib/sync.js` works.
