// Convocation PDF : contrat de GET /api/appointments/{id}/convocation.pdf (docs/openapi.yaml).
// fetch, puis blob : on vérifie le code ET le type avant de croire qu'on tient un PDF,
// et chaque refus devient une phrase dans la page, jamais du JSON dans un onglet.

export const MESSAGES: Record<number, string> = {
 401: 'Votre session a expiré. Reconnectez-vous.',
 404: 'Ce rendez-vous est introuvable.',
 409: 'Ce rendez-vous est annulé : il n’a plus de convocation.',
};
export const FALLBACK = 'La convocation n’a pas pu être préparée. Réessayez dans un instant.';
export const OFFLINE = 'Connexion impossible. Vérifiez le réseau puis réessayez.';
/** Délai avant de libérer l'URL blob: (l'onglet a eu le temps de charger le PDF). */
export const REVOKE_AFTER_MS = 60_000;

export class ConvocationError extends Error {
 constructor(message: string, public status: number) { super(message); this.name = 'ConvocationError'; }
}

export function convocationUrl(id: number, download = false): string {
 return `/api/appointments/${encodeURIComponent(String(id))}/convocation.pdf${download ? '?download=true' : ''}`;
}

/** Nom proposé par le serveur (Content-Disposition), sinon un nom neutre : jamais de donnée de santé. */
export function filenameFrom(header: string | null, id: number): string {
 const match = header?.match(/filename="?([^";]+)"?/);
 const name = match?.[1]?.trim().replace(/[\\/]/g, '_');
 return name || `convocation-rdv-${id}.pdf`;
}

async function messageOf(r: Response): Promise<string> {
 if (MESSAGES[r.status]) return MESSAGES[r.status];
 try {
  const p = await r.json() as { detail?: unknown };
  if (typeof p.detail === 'string' && p.detail.trim()) return p.detail;
 } catch { /* corps absent ou pas en JSON */ }
 return FALLBACK;
}

export async function fetchConvocation(id: number, download = false): Promise<{ blob: Blob; name: string }> {
 let r: Response;
 try {
  r = await fetch(convocationUrl(id, download), {
   credentials: 'same-origin',                                           // le cookie de session part
   headers: { Accept: 'application/pdf, application/problem+json' },     // un PDF, ou une erreur JSON
  });
 } catch {
  throw new ConvocationError(OFFLINE, 0);
 }
 if (!r.ok) throw new ConvocationError(await messageOf(r), r.status);
 const type = r.headers.get('Content-Type') ?? '';
 if (!type.toLowerCase().startsWith('application/pdf')) {               // 200 en HTML (portail, proxy) : pas un PDF
  throw new ConvocationError(FALLBACK, r.status);
 }
 const blob = await r.blob();
 return { blob, name: filenameFrom(r.headers.get('Content-Disposition'), id) };
}

/** Les appels au navigateur, regroupés pour être remplacés par des faux dans les tests. */
export interface Tab { show(url: string): void; close(): void }
export interface Browser {
 openTab(): Tab;
 createObjectURL(blob: Blob): string;
 revokeObjectURL(url: string): void;
 later(f: () => void, ms: number): void;
 save(url: string, filename: string): void;
}

export const realBrowser: Browser = {
 openTab() {
  // Ouvert pendant le clic : un onglet ouvert après une attente serait bloqué.
  const w = window.open('', '_blank');
  if (w) w.opener = null;
  return {
   show(url) {
    if (w && !w.closed) w.location.href = url;
    else realBrowser.save(url, '');                 // onglet bloqué : on retombe sur un lien
   },
   close() { w?.close(); },
  };
 },
 createObjectURL: (blob) => URL.createObjectURL(blob),
 revokeObjectURL: (url) => URL.revokeObjectURL(url),
 later: (f, ms) => { setTimeout(f, ms); },
 save(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;              // le nom proposé par le serveur
  else { a.target = '_blank'; a.rel = 'noopener'; }
  document.body.append(a);
  a.click();
  a.remove();
 },
};

export async function openConvocation(id: number, browser: Browser): Promise<void> {
 const tab = browser.openTab();                     // avant await
 try {
  const { blob } = await fetchConvocation(id);
  const url = browser.createObjectURL(blob);
  tab.show(url);
  browser.later(() => browser.revokeObjectURL(url), REVOKE_AFTER_MS);
 } catch (e) {
  tab.close();                                      // pas d'onglet vide
  throw e;
 }
}

export async function saveConvocation(id: number, browser: Browser): Promise<void> {
 const { blob, name } = await fetchConvocation(id, true);
 const url = browser.createObjectURL(blob);
 browser.save(url, name);
 browser.later(() => browser.revokeObjectURL(url), REVOKE_AFTER_MS);
}
