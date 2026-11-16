// @vitest-environment happy-dom
// Prouve la propagation sans serveur (cours, chapitre 4) : un faux fetch reçoit l'appel et on lit son traceparent.
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {InMemorySpanExporter, SimpleSpanProcessor} from '@opentelemetry/sdk-trace';
import {sansRequete} from './tracing';

const recus: {url: string; headers: Headers}[] = [];
const exportateur = new InMemorySpanExporter();
let api: typeof import('./api').api;

beforeAll(async () => {
  // 1 · le faux fetch est posé AVANT l'instrumentation, qui l'enveloppe comme le vrai.
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    recus.push({url: String(entree instanceof Request ? entree.url : entree), headers: new Headers(init?.headers)});
    return new Response('{"items":[]}', {status: 200, headers: {'Content-Type': 'application/json'}});
  }));
  const {demarrerTraces} = await import('./tracing');
  // 2 · les spans restent en mémoire : on peut lire leurs identifiants et leurs attributs.
  demarrerTraces({processeur: new SimpleSpanProcessor({exporter: exportateur})});
  ({api} = await import('./api'));
});
afterEach(() => { recus.length = 0; exportateur.reset(); });

// Le span fetch se termine après la réponse (lecture des temps réseau) : on attend celui de la trace reçue,
// pas un span en retard d'un test précédent.
const spanDeLaTrace = (traceId: string) => vi.waitFor(() => {
  const span = exportateur.getFinishedSpans().find(s => s.spanContext().traceId === traceId);
  if (!span) throw new Error('span du navigateur non terminé');
  return span;
}, {timeout: 3000});
const traceparent = () => recus[0].headers.get('traceparent')!.split('-');

describe('traces du navigateur', () => {
  it('ajoute un en-tête traceparent W3C échantillonné', async () => {
    await api('/professionals');
    // 3 · version 00, trace-id de 32 hexa, parent-id de 16 hexa, drapeau 01 (échantillonné).
    expect(recus[0].headers.get('traceparent')).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it("l'en-tête désigne le span fetch du navigateur comme parent du back", async () => {
    await api('/professionals');
    const [, traceId, parentId] = traceparent();
    const span = await spanDeLaTrace(traceId);
    expect(span.spanContext().spanId).toBe(parentId);
    expect(span.attributes['http.request.method']).toBe('GET');
  });

  it('ne garde pas la saisie de la recherche dans url.full', async () => {
    await api('/professionals?q=dermatologie&city=Lyon');
    const span = await spanDeLaTrace(traceparent()[1]);
    expect(String(span.attributes['url.full'])).toMatch(/\/api\/professionals$/);
    expect(JSON.stringify(span.attributes)).not.toContain('dermatologie');
  });

  it("ne trace pas l'envoi des traces lui-même", async () => {
    await fetch('/otlp/v1/traces', {method: 'POST', body: '{}'});
    expect(recus[0].headers.get('traceparent')).toBeNull();
    await new Promise(r => setTimeout(r, 600));
    expect(exportateur.getFinishedSpans().filter(s => String(s.attributes['url.full']).includes('/otlp/'))).toHaveLength(0);
  });
});

describe('sansRequete', () => {
  it('retire la requête et le fragment', () => {
    expect(sansRequete('http://x/api/p?q=a#b')).toBe('http://x/api/p');
    expect(sansRequete('http://x/api/p')).toBe('http://x/api/p');
  });
});
