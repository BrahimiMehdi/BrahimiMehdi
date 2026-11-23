// Collects the numbers every SVG is drawn from. Live via the GitHub GraphQL API,
// or from gen/sample-data.json when no token is available (local preview).
import { readFile, writeFile } from 'node:fs/promises';

const LOGIN = process.env.PROFILE_LOGIN || 'BrahimiMehdi';
const QUERY = `query($login:String!){ user(login:$login){ name login createdAt
  contributionsCollection{ restrictedContributionsCount contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount }}}}
  repositories(ownerAffiliations:OWNER, first:100, orderBy:{field:PUSHED_AT,direction:DESC}){ totalCount
    nodes{ name isPrivate isFork pushedAt defaultBranchRef{ target{ oid }}
      languages(first:8, orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name color }}}}}}}`;

async function fetchRaw() {
  const token = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) return JSON.parse(await readFile(new URL('./sample-data.json', import.meta.url), 'utf8'));
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-svg-generator' },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error('GitHub API: ' + JSON.stringify(json.errors || json).slice(0, 400));
  return json.data;
}

export async function loadData({ snapshot } = {}) {
  const raw = await fetchRaw();
  if (snapshot) { // repo names stripped: the snapshot must never leak private repository names
    const safe = structuredClone(raw);
    safe.user.repositories.nodes.forEach((r, k) => { r.name = 'repo-' + k; });
    await writeFile(new URL('./sample-data.json', import.meta.url), JSON.stringify(safe));
  }
  const u = raw.user;
  const days = u.contributionsCollection.contributionCalendar.weeks
    .flatMap(w => w.contributionDays)
    .map(d => ({ date: d.date, n: d.contributionCount }));
  const year = u.contributionsCollection.contributionCalendar.totalContributions;

  // Languages: own code only (forks excluded), by bytes.
  const own = u.repositories.nodes.filter(r => !r.isFork);
  const bytes = new Map(); const colors = new Map();
  for (const r of own) for (const e of r.languages.edges) {
    bytes.set(e.node.name, (bytes.get(e.node.name) || 0) + e.size);
    colors.set(e.node.name, e.node.color || '#8b949e');
  }
  const total = [...bytes.values()].reduce((a, b) => a + b, 0) || 1;
  const languages = [...bytes.entries()].sort((a, b) => b[1] - a[1])
    .map(([name, b]) => ({ name, pct: (b * 100) / total, color: colors.get(name) }));

  const latest = own.find(r => r.defaultBranchRef?.target?.oid) || own[0];
  const now = new Date(process.env.PROFILE_NOW || Date.now());

  // Streak: consecutive days with contributions, ending today (or yesterday if today is still empty).
  let i = days.length - 1, streak = 0;
  if (i >= 0 && days[i].n === 0) i--;
  for (; i >= 0 && days[i].n > 0; i--) streak++;
  const last28 = days.slice(-28);
  const sum = a => a.reduce((s, d) => s + d.n, 0);

  // Weekly + monthly totals (oldest → newest)
  const weeks = [];
  for (let k = days.length; k > 0; k -= 7) weeks.unshift(sum(days.slice(Math.max(0, k - 7), k)));
  const months = new Map();
  for (const d of days) months.set(d.date.slice(0, 7), (months.get(d.date.slice(0, 7)) || 0) + d.n);

  return {
    login: u.login, name: u.name || u.login, since: u.createdAt.slice(0, 4), now,
    year, days, last28, weeks: weeks.slice(-26), months: [...months.entries()].slice(-12),
    avg28: Math.round(sum(last28) / 28), sum28: sum(last28), active28: last28.filter(d => d.n > 0).length,
    streak, languages,
    // Private repos are only visible with PROFILE_TOKEN; otherwise fall back to the PRIVATE_REPOS variable.
    repos: (() => {
      const pub = u.repositories.nodes.filter(r => !r.isPrivate).length;
      const priv = u.repositories.nodes.filter(r => r.isPrivate).length || Number(process.env.PRIVATE_REPOS || 0);
      return { owned: pub + priv, public: pub, private: priv };
    })(),
    privateContrib: u.contributionsCollection.restrictedContributionsCount,
    lot: (latest?.defaultBranchRef?.target?.oid || '0000000').slice(0, 7).toUpperCase(),
    pushed: new Date(latest?.pushedAt || now),
  };
}
