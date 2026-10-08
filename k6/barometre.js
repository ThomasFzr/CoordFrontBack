// Baromètre : débit croissant par paliers, jusqu'à trouver le premier palier qui ne tient plus les seuils.
// Usage : k6 run k6/barometre.js   (BASE_URL, STEP_SECONDS, LEVELS="20,50,100" pour surcharger)
import http from 'k6/http';
import exec from 'k6/execution';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const STEP_SECONDS = Number(__ENV.STEP_SECONDS || 15);
const LEVELS = (__ENV.LEVELS || '50,100,200,300,400,600,800,1000,1300,1600,2000,2500,3000,4000,5000').split(',').map(Number);
const SLO = { p95: Number(__ENV.SLO_P95 || 500), errorRate: Number(__ENV.SLO_ERRORS || 0.01), served: 0.85 };

const thresholds = {
  // Au-delà de 50 % d'erreurs, continuer n'apprend plus rien.
  http_req_failed: [{ threshold: 'rate<0.5', abortOnFail: true, delayAbortEval: '10s' }],
};
LEVELS.forEach((_, i) => {
  thresholds[`http_req_duration{step:${i}}`] = [`p(95)<${SLO.p95}`];
  thresholds[`http_req_failed{step:${i}}`] = [`rate<${SLO.errorRate}`];
  thresholds[`http_reqs{step:${i}}`] = ['count>=0'];
});

export const options = {
  scenarios: {
    barometre: {
      executor: 'ramping-arrival-rate',
      startRate: LEVELS[0],
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 2000,
      stages: LEVELS.flatMap((rate) => [
        { duration: '2s', target: rate },
        { duration: `${STEP_SECONDS - 2}s`, target: rate },
      ]),
    },
  },
  thresholds,
  summaryTrendStats: ['med', 'p(95)', 'max'],
};

export function setup() {
  const res = http.get(`${BASE_URL}/listings?limit=50`);
  if (res.status !== 200) throw new Error(`API indisponible (HTTP ${res.status})`);
  return { pages: Math.max(1, Math.min(50, res.json('pages'))), ids: res.json('data').map((l) => l._id) };
}

export default function ({ pages, ids }) {
  const elapsed = (Date.now() - exec.scenario.startTime) / 1000;
  const step = String(Math.min(LEVELS.length - 1, Math.floor(elapsed / STEP_SECONDS)));
  const params = { timeout: '5s', tags: { step } };

  if (Math.random() < 0.7) {
    const page = Math.floor(Math.random() * pages) + 1;
    http.get(`${BASE_URL}/listings?page=${page}&limit=20`, { ...params, tags: { ...params.tags, name: 'GET /listings' } });
  } else {
    const id = ids[Math.floor(Math.random() * ids.length)];
    http.get(`${BASE_URL}/listings/${id}`, { ...params, tags: { ...params.tags, name: 'GET /listings/:id' } });
  }
}

export function handleSummary(data) {
  const m = data.metrics;
  const rows = [];
  let breakingStep = null;

  LEVELS.forEach((rate, i) => {
    const reqs = m[`http_reqs{step:${i}}`]?.values.count ?? 0;
    if (!reqs) return;
    const p95 = m[`http_req_duration{step:${i}}`]?.values['p(95)'] ?? NaN;
    const errors = m[`http_req_failed{step:${i}}`]?.values.rate ?? 0;
    const served = reqs / STEP_SECONDS;
    const ok = p95 < SLO.p95 && errors < SLO.errorRate && served >= rate * SLO.served;
    if (!ok && breakingStep === null) breakingStep = i;
    rows.push({ rate, served, p95, errors, ok });
  });

  const lastOk = breakingStep === null ? rows.at(-1) : rows[breakingStep - 1];
  const verdict =
    breakingStep === null
      ? `Aucune rupture jusqu'à ${rows.at(-1)?.rate ?? '?'} req/s.`
      : `Rupture au palier ${LEVELS[breakingStep]} req/s. Dernier palier tenu : ${lastOk ? `${lastOk.rate} req/s` : 'aucun'}.`;

  const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : '—');
  const md = [
    '## Baromètre de charge k6',
    '',
    `Seuils par palier : p95 < ${SLO.p95} ms, erreurs < ${SLO.errorRate * 100} %, débit servi ≥ ${SLO.served * 100} % du palier. Paliers de ${STEP_SECONDS} s.`,
    '',
    `**${verdict}**`,
    '',
    '| Palier visé (req/s) | Servi (req/s) | p95 (ms) | Erreurs | Verdict |',
    '|---:|---:|---:|---:|:---:|',
    ...rows.map((r) => `| ${r.rate} | ${fmt(r.served)} | ${fmt(r.p95)} | ${fmt(r.errors * 100, 2)} % | ${r.ok ? '✅' : '❌'} |`),
    '',
  ].join('\n');

  const out = __ENV.OUT_DIR || 'k6';
  return {
    stdout: `\n${md}\n`,
    [`${out}/barometre.md`]: md,
    [`${out}/barometre.json`]: JSON.stringify({ slo: SLO, stepSeconds: STEP_SECONDS, verdict, breakingRate: breakingStep === null ? null : LEVELS[breakingStep], lastOkRate: lastOk?.rate ?? null, steps: rows }, null, 2),
  };
}
