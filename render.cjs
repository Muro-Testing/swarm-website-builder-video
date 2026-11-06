// Renders swarm.html frame by frame with Playwright and pipes the frames into FFmpeg.
//
//   node render.cjs samples out/frames            -> a few PNG stills for checking
//   node render.cjs samples out/frames 0,300,950  -> chosen frames only
//   node render.cjs full out/picture.mp4          -> the full 1080x1920, 60 fps video (no sound)
//
// Set EVENTS_OUT=out/events.json to also save every click/key/snap event for mix.py.
// Set CHROME_PATH to use your installed Chrome instead of Playwright's Chromium.
const http = require('http'), fs = require('fs'), path = require('path'), {spawn} = require('child_process');
const {chromium} = require('playwright');

const root = __dirname, mode = process.argv[2] || 'samples', out = process.argv[3] || (mode === 'full' ? 'out/picture.mp4' : 'out/frames');
const W = 1080, H = 1920;
const types = {'.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2'};

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = path.resolve(root, '.' + (u === '/' ? '/swarm.html' : u));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', types[path.extname(p)] || 'application/octet-stream'); res.end(d);
  });
});

server.listen(0, '127.0.0.1', async () => {
  let browser;
  try {
    browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--ignore-gpu-blocklist']});
    const page = await browser.newPage({viewport: {width: W, height: H}});
    page.on('pageerror', e => console.error('PAGE ERROR', e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.ready, null, {timeout: 240000});
    if (process.env.EVENTS_OUT) {
      fs.mkdirSync(path.dirname(process.env.EVENTS_OUT), {recursive: true});
      fs.writeFileSync(process.env.EVENTS_OUT, JSON.stringify(await page.evaluate(() => window.EVENTS)));
    }
    const frames = await page.evaluate(() => window.FRAMES);
    const t0 = Date.now();
    if (mode === 'samples') {
      fs.mkdirSync(out, {recursive: true});
      const list = (process.argv[4] || '0,150,400,700,900,1000,1199').split(',').map(Number);
      for (const f of list) {
        await page.evaluate(n => window.renderFrame(n), f);
        await page.screenshot({path: path.join(out, `f${String(f).padStart(4, '0')}.png`)});
      }
    } else {
      fs.mkdirSync(path.dirname(out), {recursive: true});
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '60', '-vcodec', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '60', out], {stdio: ['pipe', 'ignore', 'inherit']});
      for (let f = 0; f < frames; f++) {
        await page.evaluate(n => window.renderFrame(n), f);
        const buf = await page.screenshot({type: 'jpeg', quality: 95});
        if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
        if (f % 120 === 0) console.log(`frame ${f}/${frames}`);
      }
      ff.stdin.end();
      const code = await new Promise(r => ff.on('close', r));
      if (code) throw Error('ffmpeg exited with ' + code);
    }
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${out}`);
  } catch (e) { console.error(e); process.exitCode = 1; } finally { if (browser) await browser.close(); server.close(); }
});
