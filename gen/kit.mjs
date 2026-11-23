import { readFileSync } from 'node:fs';
const FONT_DIR = new URL('../assets/fonts/', import.meta.url);
const METRICS = JSON.parse(readFileSync(new URL('metrics.json', FONT_DIR), 'utf8'));

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const r2 = n => Math.round(n * 100) / 100;
export const fmt = n => n.toLocaleString('en-US').replace(/,/g, ' '); // thin-space thousands
export const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/** @font-face block for the given font ids, inlined as base64 woff2. */
export function fontFaces(ids) {
  return ids.map(id => `@font-face{font-family:'${id}';src:url(data:font/woff2;base64,${readFileSync(new URL(id + '.woff2', FONT_DIR)).toString('base64')}) format('woff2');}`).join('');
}

/** Advance width of a string, in px. */
export function measure(font, size, str, tracking = 0) {
  const m = METRICS[font]; let w = 0;
  for (const ch of str) w += (m.w[ch] ?? m.w['n'] ?? 500);
  return (w / m.upm) * size + tracking * size * Math.max(0, [...str].length - 1);
}

/** Greedy word wrap. */
export function wrap(font, size, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean); const lines = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (measure(font, size, t) <= maxW || !line) line = t; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Deterministic PRNG (mulberry32) seeded from a string. */
export function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (const c of seed) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h |= 0; h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// 5×7 dot-matrix glyphs, the face a continuous-inkjet coder prints on cartons.
const G = {
  '0':'01110100011001110101110011000101110','1':'00100011000010000100001000010001110','2':'01110100010000100010001000100011111',
  '3':'11111000100010000010000011000101110','4':'00010001100101010010111110001000010','5':'11111100001111000001000011000101110',
  '6':'00110010001000011110100011000101110','7':'11111000010001000100010000100001000','8':'01110100011000101110100011000101110',
  '9':'01110100011000101111000010001001100','A':'01110100011000111111100011000110001','B':'11110100011000111110100011000111110',
  'C':'01110100011000010000100001000101110','D':'11100100101000110001100011001011100','E':'11111100001000011110100001000011111',
  'F':'11111100001000011110100001000010000','G':'01110100011000010111100011000101111','H':'10001100011000111111100011000110001',
  'I':'01110001000010000100001000010001110','K':'10001100101010011000101001001010001','L':'10000100001000010000100001000011111',
  'M':'10001110111010110101100011000110001','N':'10001100011100110101100111000110001','O':'01110100011000110001100011000101110',
  'P':'11110100011000111110100001000010000','R':'11110100011000111110101001001010001','S':'01111100001000001110000010000111110',
  'T':'11111001000010000100001000010000100','U':'10001100011000110001100011000101110','V':'10001100011000110001100010101000100',
  'X':'10001100010101000100010101000110001','Y':'10001100011000101010001000010000100','/':'00000000010001000100010001000000000',
  '-':'00000000000000011111000000000000000',':':'00000011000110000000011000110000000','.':'00000000000000000000000000110001100',' ':'0'.repeat(35),
};
/** Dots for a dot-matrix string: [{x,y,col}] in glyph-pitch units. */
export function dotMatrix(str) {
  const dots = []; let cx = 0;
  for (const ch of str.toUpperCase()) {
    const g = G[ch] || G[' '];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r * 5 + c] === '1') dots.push({ x: cx + c, y: r, col: cx + c });
    cx += 6;
  }
  return { dots, cols: cx - 1 };
}
