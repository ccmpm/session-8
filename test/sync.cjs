// Checks lib/sync.js with real browsers: state, channels, shared maps, a reload and a late joiner.
// Run: npm test   (first time: npm install && npx playwright install chromium)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/?room=test-${Date.now().toString(36)}`;
  const browser = await chromium.launch();
  const errors = [];
  const open = async (label) => {
    const page = await (await browser.newContext()).newPage();
    page.on('pageerror', e => errors.push(`${label}: ${e}`));
    await page.goto(url);
    await page.waitForFunction(() => window.net, null, { timeout: 30000 });
    return page;
  };
  const until = async (fn, seconds = 45) => {
    for (let i = 0; i < seconds * 2; i++) { if (await fn()) return true; await sleep(500); }
    return false;
  };
  const results = [];
  const check = (name, ok) => { results.push([name, !!ok]); console.log((ok ? 'pass  ' : 'FAIL  ') + name); };

  const a = await open('A'), b = await open('B');
  const idA = await a.evaluate(() => net.id), idB = await b.evaluate(() => net.id);
  check('two browsers get different ids', idA !== idB);
  check('two browsers find each other', await until(async () =>
    (await a.evaluate(() => net.players().length)) === 2 && (await b.evaluate(() => net.players().length)) === 2));

  await a.evaluate(() => net.setState({ x: 111, y: 222 }));
  check('state reaches the other browser', await until(() =>
    b.evaluate(id => net.players().some(p => p.id === id && p.state.x === 111 && p.state.y === 222), idA), 10));

  await b.evaluate(() => { window.got = []; net.channel('t').on((data, from) => window.got.push({ data, from })); });
  await a.evaluate(() => { window.got = []; net.channel('t').on((data, from) => window.got.push({ data, from })); });
  await sleep(300);
  await a.evaluate(() => net.channel('t').send({ n: 7 }));
  check('a channel message arrives with the sender id', await until(() =>
    b.evaluate(id => window.got.length === 1 && window.got[0].data.n === 7 && window.got[0].from === id, idA), 10));
  check('a channel message does not come back to the sender', await a.evaluate(() => window.got.length === 0));

  await a.evaluate(() => net.shared('t').set('k', 'v'));
  check('a shared map reaches the other browser', await until(() => b.evaluate(() => net.shared('t').get('k') === 'v'), 10));
  await b.evaluate(() => { window.changes = 0; net.onChange(() => window.changes++); });
  await a.evaluate(() => net.shared('t').set('k2', 2));
  check('onChange runs for a change made by another browser', await until(() => b.evaluate(() => window.changes > 0), 10));

  let threw = false;
  try { await a.evaluate(() => net.channel('a-name-that-is-too-long')); } catch { threw = true; }
  check('a channel name over 12 characters is refused', threw);

  await sleep(600); // let the save timer write the document
  await a.reload();
  await a.waitForFunction(() => window.net);
  check('the id is the same after a reload', (await a.evaluate(() => net.id)) === idA);
  check('a shared map is still there after a reload', await a.evaluate(() => net.shared('t').get('k') === 'v'));

  const c = await open('C');
  check('a late joiner gets the shared maps', await until(() => c.evaluate(() => net.shared('t').get('k2') === 2)));
  check('a late joiner sees the players already there', await until(() => c.evaluate(() => net.players().length === 3)));

  await b.close();
  check('a player who leaves is removed', await until(() => c.evaluate(id => !net.players().some(p => p.id === id), idB), 30));
  check('no page errors', errors.length === 0);
  for (const e of errors) console.log('  ' + e);

  await browser.close(); server.close();
  const failed = results.filter(r => !r[1]).length;
  console.log(failed ? `\n${failed} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
  process.exit(failed ? 1 : 0);
})();
