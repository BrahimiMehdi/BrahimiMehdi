// Variant B: the developer on a bedside monitor. Every waveform is drawn from real contribution data.
import { esc, r2, fmt, MONTHS, fontFaces, measure } from './kit.mjs';

const BG = '#04070A', PANEL = '#0D141C', RULE = '#1B2733', DIM = '#8C9BAD', TXT = '#E6EDF5';
const ECG = '#3DF27E', PLETH = '#2FD4F0', RESP = '#F7CC3B', NIBP = '#F4F7FA', TEMP = '#FF9A4D', ALARM = '#F5C518';
const SWEEP = 14; // seconds per sweep, all channels (shared paper speed)

const t = (x, y, font, size, fill, str, extra = '') =>
  `<text x="${r2(x)}" y="${r2(y)}" font-family="${font}" font-size="${size}" fill="${fill}"${extra}>${esc(str)}</text>`;
const scale = (v, max) => Math.sqrt(v / (max || 1));

function clock(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Algiers', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(now).map(x => [x.type, x.value]));
  return `${p.day} ${p.month.toUpperCase()} ${p.year}  ${p.hour}:${p.minute}`;
}

/* waveform templates: f(u) for u in [0,1] → height in [−.3, 1] */
const ecgBeat = u => {
  const g = (c, w, a) => a * Math.exp(-((u - c) ** 2) / (2 * w * w));
  return g(0.16, 0.035, 0.12) + g(0.31, 0.012, -0.1) + g(0.345, 0.014, 1) + g(0.38, 0.013, -0.24) + g(0.62, 0.06, 0.26);
};
const plethPulse = u => {
  const rise = u < 0.2 ? Math.sin((u / 0.2) * Math.PI / 2) : 0;
  const fall = u >= 0.2 ? Math.exp(-(u - 0.2) * 4.2) * (1 + 0.16 * Math.exp(-((u - 0.47) ** 2) / 0.003)) : 0;
  return u < 0.2 ? rise : fall;
};
const breath = u => (u < 0.42 ? Math.sin((u / 0.42) * Math.PI / 2) : Math.max(0, Math.cos(Math.min(1, (u - 0.42) / 0.58) * Math.PI / 2)) ** 1.6);

function trace(values, template, x0, w, base, amp, minAmp, samples = 26) {
  const max = Math.max(...values), bw = w / values.length; let d = '';
  values.forEach((v, i) => {
    const a = minAmp + (amp - minAmp) * scale(v, max);
    for (let s = 0; s <= samples; s++) {
      const u = s / samples, x = x0 + i * bw + u * bw, y = base - template(u) * a;
      d += (i === 0 && s === 0 ? 'M' : 'L') + r2(x) + ' ' + r2(y);
    }
  });
  return { d, bw };
}

/** keyframes that flash at the moments the sweep draws each beat's peak */
function syncKeys(name, n, bw, w, peakU, on, off) {
  const span = w + 28; let k = `@keyframes ${name}{0%{${off}}`;
  for (let i = 0; i < n; i++) {
    const p = ((i * bw + peakU * bw + 28) / span) * 100;
    k += `${r2(Math.max(0, p - 0.05))}%{${off}}${r2(p)}%{${on}}${r2(Math.min(100, p + 1.6))}%{${off}}`;
  }
  return k + `100%{${off}}}`;
}

function channel(id, y, h, color, label, sub, wave, W) {
  return `<g clip-path="url(#c${id})">
    <path d="${wave}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    <rect class="sweep" x="0" y="${y}" width="28" height="${h}" fill="${BG}"/>
  </g>
  <clipPath id="c${id}"><rect x="0" y="${y}" width="${W}" height="${h}"/></clipPath>
  ${t(14, y + 22, 'barlowc-semibold', 19, color, label)}${t(14 + measure('barlowc-semibold', 19, label) + 10, y + 22, 'barlowc-medium', 16, DIM, sub)}`;
}

export function monitor(d) {
  const W = 760; // waveform area width (screen units)
  const days = d.last28.map(x => x.n), weeks = d.weeks, months = d.months.map(m => m[1]);
  const ecg = trace(days, ecgBeat, 0, W, 190, 108, 10);
  const pl = trace(weeks, plethPulse, 0, W, 344, 92, 6);
  const rs = trace(months, breath, 0, W, 470, 84, 8, 40);
  const ts = d.languages[0];
  const yearDays = d.days.slice(-364), yMax = Math.max(...yearDays.map(x => x.n));
  const trend = yearDays.map((x, i) => {
    const h = x.n ? 3 + 62 * scale(x.n, yMax) : 1.2;
    return `<rect x="${r2(i * (W / 364))}" y="${r2(590 - h)}" width="${r2(W / 364 - 0.5)}" height="${r2(h)}"/>`;
  }).join('');
  const mStart = d.months.map((m, i) => {
    const idx = yearDays.findIndex(x => x.date.startsWith(m[0]));
    return idx < 0 ? '' : `<line x1="${r2(idx * (W / 364))}" y1="512" x2="${r2(idx * (W / 364))}" y2="592" stroke="${RULE}" stroke-width="1"/>`
      + t(idx * (W / 364) + 4, 604 - 2, 'barlowc-medium', 12, DIM, MONTHS[+m[0].slice(5, 7) - 1]);
  }).join('');

  const P = 780; // parameter column x
  const heart = 'M0 4.5C0 1.6 2.2 0 4.4 0 6 0 7.2 1 8 2.2 8.8 1 10 0 11.6 0 13.8 0 16 1.6 16 4.5 16 9 8 14 8 14S0 9 0 4.5z';
  const now = clock(d.now);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 724" width="100%" role="img" aria-labelledby="tt">
<title id="tt">A bedside patient monitor for Brahimi Mehdi, PharmD, drawn from GitHub activity. ECG: daily contributions over 28 days, average ${d.avg28} a day. Pleth: weekly totals over 26 weeks. Resp: monthly totals. TypeScript ${ts.pct.toFixed(0)} percent of code, ${d.repos.owned} repositories, ${d.streak}-day streak, ${fmt(d.year)} contributions in 12 months.</title>
<style>${fontFaces(['barlowc-medium', 'barlowc-semibold', 'barlowc-bold'])}
.sweep{animation:sweep ${SWEEP}s linear infinite}
@keyframes sweep{from{transform:translateX(-28px)}to{transform:translateX(${W}px)}}
.heart{animation:heart ${SWEEP}s linear infinite}
${syncKeys('heart', days.length, ecg.bw, W, 0.345, 'opacity:1', 'opacity:.18')}
.amp{animation:amp ${SWEEP}s linear infinite;transform-box:fill-box;transform-origin:bottom}
${syncKeys('amp', weeks.length, pl.bw, W, 0.2, 'transform:scaleY(1)', 'transform:scaleY(.25)')}
.alarm{animation:alarm 1.6s steps(1) infinite}
@keyframes alarm{0%{opacity:1}50%{opacity:.38}}
@media (prefers-reduced-motion:reduce){.sweep,.heart,.amp,.alarm{animation:none}.sweep{display:none}}
</style>
<defs>
  <linearGradient id="bez" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#30363E"/><stop offset=".08" stop-color="#22272D"/><stop offset="1" stop-color="#16191D"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".05"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#0E1822" stroke-width="1"/></pattern>
  <radialGradient id="knob" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#3B434D"/><stop offset="1" stop-color="#14181C"/></radialGradient>
</defs>
<rect x="0" y="0" width="1200" height="724" rx="34" fill="url(#bez)"/>
<rect x="1" y="1" width="1198" height="722" rx="33" fill="none" stroke="#454D57" stroke-width="1.2"/>
<rect x="24" y="24" width="1152" height="612" rx="12" fill="#000"/>
<g transform="translate(30,30)">
  <rect width="1140" height="600" rx="8" fill="${BG}"/>
  <rect x="0" y="46" width="${W}" height="440" fill="url(#grid)"/>
  <!-- patient banner -->
  <rect width="1140" height="46" fill="${PANEL}"/>
  ${t(16, 32, 'barlowc-semibold', 24, TXT, 'BRAHIMI, MEHDI')}
  ${t(16 + measure('barlowc-semibold', 24, 'BRAHIMI, MEHDI') + 14, 31, 'barlowc-medium', 18, DIM, 'PharmD · Full-stack · Adult · Bed DZ-01')}
  <g class="alarm"><rect x="560" y="8" width="220" height="30" rx="3" fill="${ALARM}"/>${t(670, 30, 'barlowc-bold', 20, '#111', 'PHP  LEADS OFF', ' text-anchor="middle" letter-spacing="1"')}</g>
  ${t(1084, 31, 'barlowc-semibold', 20, TXT, now, ' text-anchor="end"')}
  <g transform="translate(1100,13)" fill="none" stroke="${DIM}" stroke-width="2" stroke-linecap="round"><path d="M10 2a6 6 0 0 1 6 6v5l2 3H2l2-3V8a6 6 0 0 1 6-6zM8 19a2 2 0 0 0 4 0"/><path d="M1 1l20 20" stroke="${ALARM}"/></g>
  <line x1="${W + 10}" y1="46" x2="${W + 10}" y2="600" stroke="${RULE}" stroke-width="2"/>

  ${channel('e', 50, 176, ECG, 'II', 'contributions · daily · 28 d', ecg.d, W)}
  ${channel('p', 230, 128, PLETH, 'Pleth', 'weekly · 26 wk', pl.d, W)}
  ${channel('r', 362, 122, RESP, 'Resp', 'monthly · 12 mo', rs.d, W)}
  <line x1="0" y1="490" x2="${W}" y2="490" stroke="${RULE}" stroke-width="2"/>
  ${t(14, 512, 'barlowc-semibold', 17, TXT, 'Trend')}${t(14 + measure('barlowc-semibold', 17, 'Trend') + 10, 512, 'barlowc-medium', 15, DIM, 'contributions per day · 12 months')}
  ${mStart}
  <g fill="${ECG}" opacity=".78">${trend}</g>

  <!-- parameters -->
  <g transform="translate(${P},0)">
    ${t(18, 80, 'barlowc-semibold', 24, ECG, 'HR')}${t(18, 102, 'barlowc-medium', 16, DIM, 'contributions / day, 28 d')}
    ${t(342, 78, 'barlowc-medium', 15, ECG, '300', ' text-anchor="end" opacity=".7"')}${t(342, 96, 'barlowc-medium', 15, ECG, '1', ' text-anchor="end" opacity=".7"')}
    <path class="heart" d="${heart}" fill="${ECG}" transform="translate(22,146) scale(1.6)"/>
    ${t(346, 208, 'barlowc-bold', 118, ECG, String(d.avg28), ' text-anchor="end"')}
    <line x1="0" y1="226" x2="360" y2="226" stroke="${RULE}" stroke-width="2"/>

    ${t(18, 256, 'barlowc-semibold', 24, PLETH, 'TS')}${t(18, 278, 'barlowc-medium', 16, PLETH, '%', ' opacity=".8"')}${t(18, 300, 'barlowc-medium', 16, DIM, 'TypeScript saturation')}
    <rect x="214" y="250" width="10" height="94" rx="2" fill="#0E2730"/><rect class="amp" x="214" y="250" width="10" height="94" rx="2" fill="${PLETH}"/>
    ${t(346, 344, 'barlowc-bold', 96, PLETH, ts.pct.toFixed(0), ' text-anchor="end"')}
    <line x1="0" y1="358" x2="360" y2="358" stroke="${RULE}" stroke-width="2"/>

    ${t(18, 388, 'barlowc-semibold', 24, NIBP, 'NIBP')}${t(18, 410, 'barlowc-medium', 16, DIM, 'repositories, owned / public')}
    ${t(346, 474, 'barlowc-bold', 72, NIBP, `${d.repos.owned}/${d.repos.public}`, ' text-anchor="end"')}
    <line x1="0" y1="490" x2="360" y2="490" stroke="${RULE}" stroke-width="2"/>
    <line x1="170" y1="490" x2="170" y2="600" stroke="${RULE}" stroke-width="2"/>

    ${t(18, 518, 'barlowc-semibold', 20, TEMP, 'STREAK')}${t(18, 538, 'barlowc-medium', 14, DIM, 'days in a row')}
    ${t(156, 590, 'barlowc-bold', 54, TEMP, String(d.streak), ' text-anchor="end"')}
    ${t(188, 518, 'barlowc-semibold', 20, RESP, 'YEAR')}${t(188, 538, 'barlowc-medium', 14, DIM, 'contributions, 12 mo')}
    ${t(346, 590, 'barlowc-bold', 54, RESP, fmt(d.year), ' text-anchor="end"')}
  </g>
</g>
<rect x="30" y="30" width="1140" height="600" rx="8" fill="url(#glass)"/>
<!-- hardware -->
<circle cx="58" cy="680" r="5" fill="${ECG}"/><circle cx="58" cy="680" r="9" fill="${ECG}" opacity=".18"/>
${t(76, 686, 'barlowc-medium', 17, '#7D8793', 'ON')}
${t(140, 686, 'barlowc-semibold', 17, '#9AA4AF', 'M 6429', ' letter-spacing="2"')}${t(140 + measure('barlowc-semibold', 17, 'M 6429') + 22, 686, 'barlowc-medium', 16, '#6B7580', 'multiparameter · GitHub activity')}
${['ALARM', 'TREND', 'EVENT', 'MENU'].map((s, i) => `<rect x="${760 + i * 82}" y="662" width="70" height="36" rx="7" fill="#15191E" stroke="#3B434D"/>${t(795 + i * 82, 685, 'barlowc-semibold', 14, '#8D97A2', s, ' text-anchor="middle" letter-spacing="1"')}`).join('')}
<circle cx="1126" cy="680" r="30" fill="url(#knob)" stroke="#4A525C"/>
${Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return `<line x1="${r2(1126 + Math.cos(a) * 25)}" y1="${r2(680 + Math.sin(a) * 25)}" x2="${r2(1126 + Math.cos(a) * 29)}" y2="${r2(680 + Math.sin(a) * 29)}" stroke="#0E1114" stroke-width="2"/>`; }).join('')}
</svg>`;
}

/* -------------------------------------------------------- event review -- */
export function events(d) {
  // public repositories only
  const rows = [
    ['2021', 'Pharma-At-Hand', 'pharma-at-hand.vercel.app', 'JAVASCRIPT', '#F1E05A'],
    ['2022', 'dallal-delices', 'dallal-delices.vercel.app', 'JAVASCRIPT', '#F1E05A'],
    ['2023', 'discover-algeria-country', 'discover-algeria-country.netlify.app', 'TYPESCRIPT', '#5A9BE6'],
    ['2023', 'ThreeJoy', 'github.com/BrahimiMehdi/ThreeJoy', 'HTML', '#E34C26'],
    ['2024', 'particles-shader', 'github.com/BrahimiMehdi/particles-shader', 'JAVASCRIPT', '#F1E05A'],
    ['2024', 'it-blog', 'it-blog-two.vercel.app', 'TYPESCRIPT', '#5A9BE6'],
    ['2024', 'tech-for-hope', 'github.com/BrahimiMehdi/tech-for-hope', 'TYPESCRIPT', '#5A9BE6'],
  ];
  const orders = [
    ['TypeScript', 'continuous'],
    ['Next.js · React', 'daily'],
    ['Payload CMS', 'daily'],
    ['PostgreSQL · SQLite', 'as needed'],
    ['Tailwind CSS', 'daily'],
    ['Docker · Coolify', 'every deploy'],
    ['Three.js · GLSL', 'evenings'],
    ['Electron', 'as needed'],
  ];
  const RH = 56, Y0 = 108;
  const H = Y0 + rows.length * RH + RH + 44;
  const now = clock(d.now);
  let tbl = rows.map(([yr, ev, sub, tag, col], i) => {
    const y = Y0 + i * RH;
    const tw = measure('barlowc-bold', 14, tag) + 18;
    return `${i % 2 ? `<rect x="0" y="${y}" width="740" height="${RH}" fill="#081017"/>` : ''}
      ${t(18, y + 34, 'barlowc-semibold', 20, DIM, yr)}
      ${t(84, y + 25, 'barlowc-semibold', 20, TXT, ev)}${t(84, y + 45, 'barlowc-medium', 16, DIM, sub)}
      <rect x="${722 - tw}" y="${y + 18}" width="${tw}" height="22" rx="3" fill="none" stroke="${col}" stroke-width="1.4"/>${t(722 - tw / 2, y + 34, 'barlowc-bold', 14, col, tag, ' text-anchor="middle" letter-spacing="1"')}`;
  }).join('');
  const yNow = Y0 + rows.length * RH;
  tbl += `<rect x="0" y="${yNow}" width="740" height="${RH}" fill="#0B1E14"/><rect x="0" y="${yNow}" width="740" height="${RH}" fill="none" stroke="${ECG}" stroke-width="1.5"/>
    ${t(18, yNow + 34, 'barlowc-bold', 20, ECG, 'NOW')}
    ${t(84, yNow + 25, 'barlowc-semibold', 20, TXT, `Last push, batch ${d.lot}`)}${t(84, yNow + 45, 'barlowc-medium', 16, DIM, `${d.streak}-day streak · ${fmt(d.sum28)} contributions in 28 days`)}
    <circle class="live" cx="712" cy="${yNow + 28}" r="6" fill="${ECG}"/>`;

  const ord = orders.map(([drug, freq], i) => {
    const y = Y0 + i * 52;
    return `${t(20, y + 32, 'barlowc-semibold', 20, TXT, drug)}${t(352, y + 32, 'barlowc-medium', 17, DIM, freq, ' text-anchor="end"')}
      <circle cx="${352 - measure('barlowc-medium', 17, freq) - 14}" cy="${y + 26}" r="4" fill="${ECG}"/>
      <line x1="20" y1="${y + 50}" x2="352" y2="${y + 50}" stroke="${RULE}"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 ${H + 48}" width="100%" role="img" aria-labelledby="tt">
<title id="tt">Event review. ${rows.map(r => r[0] + ': ' + r[1] + ' (' + r[2] + ')').join('. ')}. Active orders: ${orders.map(o => o[0] + ' ' + o[1]).join(', ')}.</title>
<style>${fontFaces(['barlowc-medium', 'barlowc-semibold', 'barlowc-bold'])}
.live{animation:live 2s ease-in-out infinite}@keyframes live{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.live{animation:none}}</style>
<rect width="1200" height="${H + 48}" rx="26" fill="#1C2026"/>
<rect x="1" y="1" width="1198" height="${H + 46}" rx="25" fill="none" stroke="#3E464F" stroke-width="1.2"/>
<g transform="translate(24,24)">
  <rect width="1152" height="${H}" rx="8" fill="${BG}"/>
  <rect width="1152" height="46" fill="${PANEL}"/>
  ${t(16, 31, 'barlowc-semibold', 22, TXT, 'EVENT REVIEW')}${t(16 + measure('barlowc-semibold', 22, 'EVENT REVIEW') + 14, 31, 'barlowc-medium', 18, DIM, 'BRAHIMI, MEHDI · since ' + d.since)}
  ${t(1136, 31, 'barlowc-semibold', 20, TXT, now, ' text-anchor="end"')}
  ${t(18, 86, 'barlowc-medium', 15, DIM, 'TIME', ' letter-spacing="1.5"')}${t(84, 86, 'barlowc-medium', 15, DIM, 'EVENT', ' letter-spacing="1.5"')}${t(722, 86, 'barlowc-medium', 15, DIM, 'TYPE', ' text-anchor="end" letter-spacing="1.5"')}
  <line x1="0" y1="98" x2="740" y2="98" stroke="${RULE}" stroke-width="2"/>
  ${tbl}
  <line x1="760" y1="46" x2="760" y2="${H}" stroke="${RULE}" stroke-width="2"/>
  <g transform="translate(772,0)">
    ${t(20, 86, 'barlowc-medium', 15, DIM, 'ACTIVE ORDERS', ' letter-spacing="1.5"')}${t(352, 86, 'barlowc-medium', 15, DIM, 'FREQUENCY', ' text-anchor="end" letter-spacing="1.5"')}
    <line x1="0" y1="98" x2="368" y2="98" stroke="${RULE}" stroke-width="2"/>
    ${ord}
    ${t(20, Y0 + orders.length * 52 + 36, 'barlowc-medium', 16, DIM, 'Prescriber: Brahimi Mehdi, PharmD')}
  </g>
</g>
</svg>`;
}
