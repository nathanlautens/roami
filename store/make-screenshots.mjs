// Builds App Store / Play Store screenshots.
//
//   npm run screenshots
//
// For each screen it uses a real capture from store/raw/<name>.png if you've
// added one (take them on a phone from the TestFlight / Play build), otherwise
// it renders the design stand-in from store/screens/<name>.html. Then it frames
// it with a headline and writes:
//   store/out/ios/      1290 × 2796  (6.9" iPhone, the size Apple asks for)
//   store/out/android/  1080 × 1920  (Play phone screenshots)
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const SHOTS = [
  { name: 'feed', headline: 'Plans, minus<br>the admin.', bg: '#C6F432' },
  { name: 'send', headline: 'Throw out a Roam<br>in seconds.', bg: '#FF5CAD' },
  { name: 'respond', headline: 'One tap. In, maybe<br>or next time.', bg: '#FFE14D' },
  { name: 'vote', headline: "Can't pick a night?<br>Put it to a vote.", bg: '#B69CFF' },
  { name: 'buzzer', headline: 'BZZZT.<br>Plans: made.', bg: '#C6F432' },
];

const SIZES = [
  { dir: 'ios', w: 1290, h: 2796 },
  { dir: 'android', w: 1080, h: 1920 },
];

const font = (p) => pathToFileURL(join(root, 'node_modules/@expo-google-fonts', p)).href;

function frame({ w, h }, shot, img) {
  const scale = w / 430; // design the frame at 430pt wide
  const H = h / scale;
  // Leave ~170pt for the headline; shrink the phone on shorter (Android) canvases.
  const phoneH = Math.min(330 * (844 / 390), H - 170);
  const phoneW = phoneH * (390 / 844);
  const headlineSpace = H - phoneH;
  return `<!doctype html><html><head><style>
  @font-face { font-family: B; font-weight: 800; src: url('${font('bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf')}'); }
  html,body{margin:0}
  body{width:430px;height:${H}px;overflow:hidden;background:${shot.bg};zoom:1;position:relative;font-family:B}
  h1{position:absolute;left:0;right:0;top:${Math.max(28, headlineSpace / 2 - 50)}px;margin:0;text-align:center;font-size:42px;line-height:1;letter-spacing:-1.5px;color:#17121F}
  .phone{position:absolute;left:50%;bottom:${-phoneH * 0.02}px;transform:translateX(-50%) rotate(-2deg);width:${phoneW}px;height:${phoneH}px;border:7px solid #17121F;border-radius:52px;overflow:hidden;background:#17121F;box-shadow:10px 10px 0 #17121F}
  .phone img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:45px;display:block}
  .island{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:96px;height:28px;border-radius:16px;background:#17121F}
  </style></head><body>
  <h1>${shot.headline}</h1>
  <div class="phone"><img src="${img}"><div class="island"></div></div>
  </body></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  // 1. Get each raw screen as a PNG data URL.
  const raws = {};
  const screenPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  for (const shot of SHOTS) {
    const real = join(here, 'raw', `${shot.name}.png`);
    if (existsSync(real)) {
      raws[shot.name] = `data:image/png;base64,${readFileSync(real).toString('base64')}`;
      console.log(`  ${shot.name}: using your capture`);
      continue;
    }
    await screenPage.goto(pathToFileURL(join(here, 'screens', `${shot.name}.html`)).href);
    await screenPage.evaluate(() => document.fonts.ready);
    const png = await screenPage.screenshot({ type: 'png' });
    raws[shot.name] = `data:image/png;base64,${png.toString('base64')}`;
    console.log(`  ${shot.name}: using the design stand-in`);
  }
  await screenPage.close();

  // 2. Frame them for each store.
  for (const size of SIZES) {
    const out = join(here, 'out', size.dir);
    mkdirSync(out, { recursive: true });
    const scale = size.w / 430;
    const page = await browser.newPage({ viewport: { width: 430, height: Math.round(size.h / scale) }, deviceScaleFactor: scale });
    for (const [i, shot] of SHOTS.entries()) {
      // Load from a file (not setContent) so the local font files are allowed.
      const tmp = join(out, '.frame.html');
      writeFileSync(tmp, frame(size, shot, raws[shot.name]));
      await page.goto(pathToFileURL(tmp).href);
      rmSync(tmp);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(out, `${i + 1}-${shot.name}.png`), clip: { x: 0, y: 0, width: 430, height: size.h / scale } });
    }
    await page.close();
    console.log(`✓ ${size.dir}: ${SHOTS.length} screenshots in store/out/${size.dir}`);
  }
} finally {
  await browser.close();
}
