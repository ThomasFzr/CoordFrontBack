import {test, expect, type APIRequestContext} from '@playwright/test';

// Preuve de bout en bout (cours, chapitres 4 et 5) : la pile tourne (docker compose up -d --build) et Jaeger aussi.
const JAEGER = process.env.JAEGER_URL || 'http://localhost:16686';

type Span = {spanID: string; operationName: string; processID: string; references: {refType: string; spanID: string}[]; tags: {key: string; value: unknown}[]};
type Trace = {spans: Span[]; processes: Record<string, {serviceName: string}>};

async function traceJaeger(request: APIRequestContext, traceId: string): Promise<Trace> {
  let trace: Trace | undefined;
  // Les spans du navigateur partent par lots (toutes les 5 s environ) : on attend que les deux services soient là.
  await expect.poll(async () => {
    const r = await request.get(`${JAEGER}/api/traces/${traceId}`);
    if (!r.ok()) return [];
    trace = (await r.json()).data?.[0];
    return trace ? Object.values(trace.processes).map(p => p.serviceName).sort() : [];
  }, {timeout: 30_000, intervals: [1000]}).toEqual(['medislot-api', 'medislot-web']);
  return trace!;
}

test('une recherche produit une trace front puis back', async ({page, request}) => {
  const requete = page.waitForRequest(r => new URL(r.url()).pathname === '/api/professionals');
  await page.goto('/');
  const traceparent = (await requete).headers()['traceparent'];
  expect(traceparent, 'traceparent absent : gestionnaire de contexte ou propagateur manquant').toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  const [, traceId, parentId] = traceparent.split('-');

  const trace = await traceJaeger(request, traceId);
  const service = (s: Span) => trace.processes[s.processID].serviceName;
  const navigateur = trace.spans.find(s => s.spanID === parentId);
  expect(navigateur && service(navigateur), 'le span du traceparent est celui du navigateur').toBe('medislot-web');

  // Le span serveur du back est l'ENFANT direct du span fetch du navigateur.
  const serveur = trace.spans.find(s => service(s) === 'medislot-api' && s.tags.some(t => t.key === 'span.kind' && t.value === 'server'));
  expect(serveur, 'span serveur de medislot-api').toBeTruthy();
  expect(serveur!.references).toContainEqual(expect.objectContaining({refType: 'CHILD_OF', spanID: parentId}));

  // La saisie ne voyage pas : aucun attribut du navigateur ne garde la requête de l'URL.
  for (const t of navigateur!.tags) expect(String(t.value), t.key).not.toMatch(/\?/);
});
