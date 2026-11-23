// node gen/build.mjs [outDir]  — renders the monitor SVGs from live GitHub data.
import { mkdir, writeFile } from 'node:fs/promises';
import { loadData } from './data.mjs';
import { monitor, events } from './monitor.mjs';

const out = process.argv[2] || 'out';
await mkdir(out, { recursive: true });
const d = await loadData();
await writeFile(`${out}/monitor.svg`, monitor(d));
await writeFile(`${out}/monitor-events.svg`, events(d));
console.log('rendered monitor.svg, monitor-events.svg');
