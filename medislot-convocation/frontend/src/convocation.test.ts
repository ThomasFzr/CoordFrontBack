import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
 MESSAGES, FALLBACK, OFFLINE, REVOKE_AFTER_MS, ConvocationError, convocationUrl, filenameFrom,
 fetchConvocation, openConvocation, saveConvocation, type Browser,
} from './convocation';

const pdf = (name = 'convocation-rdv-42.pdf', disposition = 'inline') => new Response(
 new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
 { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="${name}"` } },
);
const problem = (status: number, detail: string) => new Response(
 JSON.stringify({ type: 'about:blank', status, detail }),
 { status, headers: { 'Content-Type': 'application/problem+json' } },
);

function fakeBrowser() {
 const tab = { show: vi.fn(), close: vi.fn() };
 const pending: Array<() => void> = [];
 const b: Browser = {
  openTab: vi.fn(() => tab),
  createObjectURL: vi.fn(() => 'blob:medislot/1'),
  revokeObjectURL: vi.fn(),
  later: vi.fn((f: () => void) => { pending.push(f); }),
  save: vi.fn(),
 };
 return { b, tab, runLater: () => pending.splice(0).forEach((f) => f()) };
}

beforeEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Contrat', () => {
 it('construit l’URL du contrat, sans rien d’autre que l’identifiant', () => {
  expect(convocationUrl(42)).toBe('/api/appointments/42/convocation.pdf');
  expect(convocationUrl(42, true)).toBe('/api/appointments/42/convocation.pdf?download=true');
 });
 it('lit le nom proposé par le serveur, sinon un nom neutre', () => {
  expect(filenameFrom('attachment; filename="convocation-rdv-42.pdf"', 42)).toBe('convocation-rdv-42.pdf');
  expect(filenameFrom('inline; filename=convocation-rdv-7.pdf', 7)).toBe('convocation-rdv-7.pdf');
  expect(filenameFrom(null, 42)).toBe('convocation-rdv-42.pdf');
  expect(filenameFrom('inline', 9)).toBe('convocation-rdv-9.pdf');
 });
});

describe('Récupération du PDF', () => {
 it('envoie le cookie, annonce PDF ou erreur JSON, et rend les octets avec leur nom', async () => {
  const fetchMock = vi.fn().mockResolvedValue(pdf());
  vi.stubGlobal('fetch', fetchMock);
  const { blob, name } = await fetchConvocation(42);
  expect(fetchMock).toHaveBeenCalledWith('/api/appointments/42/convocation.pdf', {
   credentials: 'same-origin',
   headers: { Accept: 'application/pdf, application/problem+json' },
  });
  expect(blob.type).toBe('application/pdf');
  expect(name).toBe('convocation-rdv-42.pdf');
 });

 it.each([401, 404, 409])('traduit %i en phrase', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problem(status, 'détail technique')));
  await expect(fetchConvocation(42)).rejects.toEqual(new ConvocationError(MESSAGES[status], status));
 });

 it('affiche le detail du ProblemDetail pour une panne du moteur (500)', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problem(500, 'La convocation n’a pas pu être générée. Réessayez dans un instant.')));
  await expect(fetchConvocation(42)).rejects.toEqual(
   new ConvocationError('La convocation n’a pas pu être générée. Réessayez dans un instant.', 500));
 });

 it('refuse une réponse 200 qui n’est pas un PDF', async () => {
  // Cas réel : un proxy ou un portail Wi-Fi renvoie sa page HTML de connexion avec un 200.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
   new Response('<html>Connexion au réseau</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })));
  await expect(fetchConvocation(42)).rejects.toEqual(new ConvocationError(FALLBACK, 200));
 });

 it('transforme une panne réseau en phrase', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(fetchConvocation(42)).rejects.toEqual(new ConvocationError(OFFLINE, 0));
 });
});

describe('Affichage et mémoire', () => {
 it('ouvre l’onglet avant l’attente, y affiche le PDF, puis libère l’URL blob:', async () => {
  const { b, tab, runLater } = fakeBrowser();
  let answer!: (r: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((ok) => { answer = ok; })));
  const done = openConvocation(42, b);
  expect(b.openTab).toHaveBeenCalledTimes(1);         // déjà ouvert, la réponse n'est pas arrivée
  answer(pdf());
  await done;
  expect(tab.show).toHaveBeenCalledWith('blob:medislot/1');
  expect(b.later).toHaveBeenCalledWith(expect.any(Function), REVOKE_AFTER_MS);
  expect(b.revokeObjectURL).not.toHaveBeenCalled();
  runLater();
  expect(b.revokeObjectURL).toHaveBeenCalledWith('blob:medislot/1');
 });

 it('referme l’onglet vide en cas d’erreur', async () => {
  const { b, tab } = fakeBrowser();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problem(409, 'x')));
  await expect(openConvocation(42, b)).rejects.toThrow(MESSAGES[409]);
  expect(tab.close).toHaveBeenCalled();
  expect(tab.show).not.toHaveBeenCalled();
  expect(b.createObjectURL).not.toHaveBeenCalled();
 });

 it('enregistre avec download=true et le nom du serveur, puis libère l’URL', async () => {
  const { b, runLater } = fakeBrowser();
  const fetchMock = vi.fn().mockResolvedValue(pdf('convocation-rdv-42.pdf', 'attachment'));
  vi.stubGlobal('fetch', fetchMock);
  await saveConvocation(42, b);
  expect(fetchMock.mock.calls[0][0]).toBe('/api/appointments/42/convocation.pdf?download=true');
  expect(b.openTab).not.toHaveBeenCalled();
  expect(b.save).toHaveBeenCalledWith('blob:medislot/1', 'convocation-rdv-42.pdf');
  runLater();
  expect(b.revokeObjectURL).toHaveBeenCalledWith('blob:medislot/1');
 });
});
