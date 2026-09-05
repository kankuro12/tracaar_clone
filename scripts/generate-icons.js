// Generates PWA icon PNGs (public/icons/) from the existing pin-in-circle mark.
// Run with `node scripts/generate-icons.js` whenever the mark or icon sizes change.
const path = require('path');
const { chromium } = require('playwright');

const PIN = '<path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/>';

function html(size, { maskable = false } = {}) {
  // Maskable icons get padded into Android's ~80% safe zone so the mask doesn't clip the pin.
  const pinScale = maskable ? 0.55 : 0.72;
  return `<!doctype html><html><head><style>
    html,body{margin:0;padding:0}
    .bg{width:${size}px;height:${size}px;background:#2563eb;display:flex;align-items:center;justify-content:center}
    svg{width:${size * pinScale}px;height:${size * pinScale}px}
  </style></head><body>
    <div class="bg">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${PIN.replace('<circle', '<circle fill="#2563eb"')}</svg>
    </div>
  </body></html>`;
}

async function shot(browser, size, file, opts) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(size, opts));
  await page.screenshot({ path: file });
  await page.close();
}

async function main() {
  const browser = await chromium.launch();
  const out = path.join(__dirname, '..', 'public', 'icons');
  await shot(browser, 192, path.join(out, 'icon-192.png'));
  await shot(browser, 512, path.join(out, 'icon-512.png'));
  await shot(browser, 512, path.join(out, 'icon-maskable-512.png'), { maskable: true });
  await browser.close();
  console.log('icons written to', out);
}

main().catch((e) => { console.error(e); process.exit(1); });
