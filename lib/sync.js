// Browser-to-browser sync for a multiplayer game. No game server.
//
// Browsers in the same room find each other through public relays (Trystero),
// then talk directly over WebRTC. This file gives a game three things:
//
//   state     what each player looks like right now (position, angle, ...).
//             Sent to the others 20 times a second. Gone when the player leaves.
//   channels  one-off messages to the other players ("I threw a ball").
//             Not stored. A player who joins later never sees them.
//   shared    maps that every browser keeps a copy of (scores, names, the level).
//             Saved in the browser, merged when players reconnect, and sent in
//             full to players who join later. Backed by a Yjs document.
//
// See CLAUDE.md for the rules on which one to use.

import * as Y from 'https://cdn.jsdelivr.net/npm/yjs@13.6.33/+esm';

export { Y };

const STATE_HZ = 20;
const MAX_CHANNEL_BYTES = 12; // Trystero's limit on a message name

const store = {
  get(area, k) { try { return area.getItem(k); } catch { return null; } },
  set(area, k, v) { try { area.setItem(k, v); } catch {} },
};

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
function fromBase64(text) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }

/**
 * Join a room and return the connection.
 *
 * @param {object} [options]
 * @param {string} [options.app]   Name of the game. Browsers only meet others with the same app and room.
 * @param {string} [options.room]  Room name. Defaults to ?room= in the address, then "main".
 * @param {string} [options.via]   How browsers find each other: "nostr" (default), "mqtt" or "torrent".
 *                                 Defaults to ?via= in the address.
 * @param {string} [options.id]    Player id. Defaults to one made for this tab, kept across reloads.
 */
export async function connect({ app = 'ccm-session-8', room, via, id } = {}) {
  const query = new URLSearchParams(location.search);
  room = room || query.get('room') || 'main';
  via = via || query.get('via') || 'nostr';
  const { joinRoom } = await import(`https://cdn.jsdelivr.net/npm/@trystero-p2p/${via}@0.25.4/+esm`);

  // One id per tab, so two tabs on one laptop are two players. Reloading keeps it.
  if (!id) {
    id = store.get(sessionStorage, 'sync-id') || Math.random().toString(36).slice(2, 10);
    store.set(sessionStorage, 'sync-id', id);
  }

  // ---------- Shared maps (Yjs) ----------
  const doc = new Y.Doc();
  const docKey = `sync-doc:${app}:${room}`;
  const saved = store.get(localStorage, docKey);
  if (saved) try { Y.applyUpdate(doc, fromBase64(saved), 'disk'); } catch {}
  const changeHandlers = new Set();
  let saveTimer = 0;
  doc.on('update', (update, origin) => {
    if (origin !== 'remote' && origin !== 'disk') docUpdate.send(update);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      // Merge with what another tab saved, so two tabs on one laptop do not overwrite each other.
      const other = store.get(localStorage, docKey);
      if (other) try { Y.applyUpdate(doc, fromBase64(other), 'disk'); } catch {}
      store.set(localStorage, docKey, toBase64(Y.encodeStateAsUpdate(doc)));
    }, 300);
    for (const fn of changeHandlers) fn();
  });

  // ---------- The room ----------
  const trystero = joinRoom({ appId: app }, room);
  const hello = trystero.makeAction('_hello');      // { id }
  const stateMsg = trystero.makeAction('_state');   // this player's live state
  const docVector = trystero.makeAction('_sv');     // Yjs state vector
  const docUpdate = trystero.makeAction('_up');     // Yjs update

  const peers = new Map();   // Trystero peer id -> { id, state, waiting }
  const joinHandlers = new Set(), leaveHandlers = new Set();
  let myState = null, stateDirty = false;

  function peerOf(peerId) {
    if (!peers.has(peerId)) peers.set(peerId, { id: null, state: null, waiting: [] });
    return peers.get(peerId);
  }
  // Messages can arrive before we know who sent them. They wait for the hello.
  function whenKnown(peerId, fn) {
    const p = peerOf(peerId);
    if (p.id) fn(p); else if (p.waiting.length < 200) p.waiting.push(fn);
  }

  trystero.onPeerJoin = (peerId) => {
    peerOf(peerId);
    hello.send({ id }, { target: peerId });
    if (myState) stateMsg.send(myState, { target: peerId });
    docVector.send(Y.encodeStateVector(doc), { target: peerId });
  };
  trystero.onPeerLeave = (peerId) => {
    const p = peers.get(peerId);
    peers.delete(peerId);
    if (p && p.id) for (const fn of leaveHandlers) fn(p.id);
  };
  hello.onMessage = (msg, { peerId }) => {
    const p = peerOf(peerId);
    if (p.id) return;
    p.id = String(msg.id);
    for (const fn of joinHandlers) fn(p.id);
    for (const fn of p.waiting.splice(0)) fn(p);
  };
  stateMsg.onMessage = (state, { peerId }) => { peerOf(peerId).state = state; };
  // A browser tells us what it has; we send back only what it is missing.
  docVector.onMessage = (vector, { peerId }) =>
    docUpdate.send(Y.encodeStateAsUpdate(doc, new Uint8Array(vector)), { target: peerId });
  docUpdate.onMessage = (update) => Y.applyUpdate(doc, new Uint8Array(update), 'remote');

  setInterval(() => {
    if (!stateDirty) return;
    stateDirty = false;
    if (peers.size) stateMsg.send(myState);
  }, 1000 / STATE_HZ);

  const channels = new Map();

  const net = {
    /** This player's id. The same after a reload. */
    id,
    room,
    /** The Yjs document behind the shared maps. */
    doc,

    /** Set this player's live state. Pass the whole state each time. Sent 20 times a second at most. */
    setState(state) { myState = state; stateDirty = true; },

    /** Everyone in the room who has set a state, you included: [{ id, me, state }]. */
    players() {
      const list = myState ? [{ id, me: true, state: myState }] : [];
      for (const p of peers.values()) if (p.id && p.state) list.push({ id: p.id, me: false, state: p.state });
      return list;
    },

    /** Call fn(id) when another player connects. Returns a function that stops it. */
    onJoin(fn) { joinHandlers.add(fn); return () => joinHandlers.delete(fn); },
    /** Call fn(id) when another player leaves. Returns a function that stops it. */
    onLeave(fn) { leaveHandlers.add(fn); return () => leaveHandlers.delete(fn); },

    /**
     * A named message channel. send(data) goes to every other player, never back to you.
     * on(fn) calls fn(data, fromId) for each message. The name is 12 characters at most.
     */
    channel(name) {
      if (channels.has(name)) return channels.get(name);
      if (name.startsWith('_')) throw new Error(`Channel name "${name}" must not start with "_".`);
      if (new TextEncoder().encode(name).length > MAX_CHANNEL_BYTES)
        throw new Error(`Channel name "${name}" is too long. The limit is ${MAX_CHANNEL_BYTES} characters.`);
      const action = trystero.makeAction(name);
      const handlers = new Set();
      action.onMessage = (data, { peerId }) => whenKnown(peerId, (p) => { for (const fn of handlers) fn(data, p.id); });
      const ch = {
        send(data) { if (peers.size) action.send(data); },
        on(fn) { handlers.add(fn); return () => handlers.delete(fn); },
      };
      channels.set(name, ch);
      return ch;
    },

    /**
     * A shared map (a Yjs Y.Map): get, set, delete, has, forEach, entries, toJSON.
     * Every browser has a copy. It is saved and reaches players who join later.
     */
    shared(name) { return doc.getMap(name); },

    /** Call fn() after any shared map changes, from you or anyone else. */
    onChange(fn) { changeHandlers.add(fn); return () => changeHandlers.delete(fn); },
  };

  window.net = net; // for the console and tests
  return net;
}
