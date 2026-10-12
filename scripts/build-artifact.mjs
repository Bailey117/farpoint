// Inlines the Vite build into one self-contained HTML file (dist/farpoint.html)
// so the game can be shared as a single page. Run after `vite build`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const index = readFileSync(join(dist, 'index.html'), 'utf8');

const jsPath = index.match(/<script[^>]*src="\/?([^"]+\.js)"/)?.[1];
const cssPath = index.match(/<link[^>]*href="\/?([^"]+\.css)"/)?.[1];
if (!jsPath || !cssPath) throw new Error('Could not find the built JS and CSS in dist/index.html');

const js = readFileSync(join(dist, jsPath), 'utf8');
const css = readFileSync(join(dist, cssPath), 'utf8');
// A literal closing script tag inside the bundle would end the inline script early.
if (/<\/script/i.test(js)) throw new Error('Bundle contains "</script"; cannot inline safely');
if (/<\/style/i.test(css)) throw new Error('Stylesheet contains "</style"; cannot inline safely');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Farpoint</title>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script type="module">${js}</script>
</body>
</html>
`;

const out = join(dist, 'farpoint.html');
writeFileSync(out, html);
console.log(`Wrote ${out} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB)`);
