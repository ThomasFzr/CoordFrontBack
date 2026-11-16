// Traces du navigateur (cours, chapitre 4). Chaque fetch devient un span client et emporte l'en-tête traceparent :
// le back (agent Java) accroche ses spans sous celui du navigateur. Les spans partent par lots vers /otlp/,
// relayé par Nginx au collecteur : même origine que la page, donc aucun réglage CORS.
import {context, propagation, trace, type Context} from '@opentelemetry/api';
import {W3CTraceContextPropagator} from '@opentelemetry/core';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {registerInstrumentations} from '@opentelemetry/instrumentation';
import {FetchInstrumentation} from '@opentelemetry/instrumentation-fetch';
import {resourceFromAttributes} from '@opentelemetry/resources';
import {
  BatchSpanProcessor, ParentBasedSampler, StackContextManager, TraceIdRatioBasedSampler, TracerProvider,
  type ReadableSpan, type Span, type SpanProcessor,
} from '@opentelemetry/sdk-trace';
import {ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_URL_FULL} from '@opentelemetry/semantic-conventions';

export const SERVICE = 'medislot-web';
const URL_OTLP = /\/otlp\//;

/** Retire la requête (?…) et le fragment (#…) d'une adresse : la saisie d'une recherche peut révéler une donnée de santé. */
export function sansRequete(url: string): string {
  return url.replace(/[?#].*$/, '');
}

/**
 * Garde-fou n° 2 du cours (chapitre 6) : au démarrage de chaque span, url.full (et l'ancien http.url) perdent leur
 * requête. Le span est encore modifiable dans onStart : la saisie ne quitte jamais le navigateur.
 */
export class SansRequeteProcessor implements SpanProcessor {
  onStart(span: Span, _parent: Context): void {
    for (const cle of [ATTR_URL_FULL, 'http.url']) {
      const valeur = span.attributes[cle];
      if (typeof valeur === 'string' && /[?#]/.test(valeur)) span.setAttribute(cle, sansRequete(valeur));
    }
  }
  onEnd(_span: ReadableSpan): void {}
  forceFlush(): Promise<void> { return Promise.resolve(); }
  shutdown(): Promise<void> { return Promise.resolve(); }
}

export interface OptionsTraces {
  /** Processeur d'export. Par défaut : lots vers /otlp/v1/traces. Les tests passent un SimpleSpanProcessor en mémoire. */
  processeur?: SpanProcessor;
  /** Part des traces gardées quand le navigateur est à la racine (1 en formation, 0,1 en production par exemple). */
  ratio?: number;
}

let fournisseur: TracerProvider | null = null;

export function demarrerTraces(options: OptionsTraces = {}): TracerProvider {
  if (fournisseur) return fournisseur; // une seule instrumentation, même si l'appel est répété
  const processeur = options.processeur ?? new BatchSpanProcessor({
    exporter: new OTLPTraceExporter({url: location.origin + '/otlp/v1/traces'}),
  });
  fournisseur = new TracerProvider({
    // 1 · le nom (et la version) du service dans Jaeger, à côté de medislot-api
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE,
      [ATTR_SERVICE_VERSION]: import.meta.env.VITE_GIT_SHA || 'local',
    }),
    // 2 · le navigateur décide (ratio), le back suit (parentbased_always_on)
    sampler: new ParentBasedSampler({root: new TraceIdRatioBasedSampler(options.ratio ?? 1)}),
    // 3 · nettoyage d'abord, envoi ensuite
    spanProcessors: [new SansRequeteProcessor(), processeur],
  });
  trace.setGlobalTracerProvider(fournisseur);
  // 4 · sans gestionnaire de contexte ni propagateur, les spans existent mais traceparent ne part pas
  context.setGlobalContextManager(new StackContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  // 5 · un span par fetch, sauf l'envoi des traces lui-même (sinon chaque lot en crée un autre)
  registerInstrumentations({
    tracerProvider: fournisseur,
    instrumentations: [new FetchInstrumentation({ignoreUrls: [URL_OTLP]})],
  });
  return fournisseur;
}
