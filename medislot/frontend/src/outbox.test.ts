import {describe,it,expect,vi,beforeEach} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {useOutbox} from './stores/outbox';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
// Serveur simulé : CSRF, puis la réponse voulue pour POST /appointments et la liste des rendez-vous.
function server(post:()=>Response|Promise<Response>,mine:unknown[]=[]){
 return vi.fn(async(url:string,init?:RequestInit)=>{
  if(url==='/api/csrf')return json({token:'t',headerName:'X-CSRF-TOKEN'});
  if(url==='/api/appointments'&&init?.method==='POST')return post();
  if(url==='/api/appointments')return json(mine);
  throw new Error('inattendu : '+url);
 });
}
const item={userId:1,slotId:42,professionalName:'Dr Sarah Martin',startsAt:'2026-11-02T08:00:00Z',measured:true};
describe('File d’envoi hors ligne',()=>{
 beforeEach(()=>{setActivePinia(createPinia());vi.restoreAllMocks();});
 it('201 : confirmée puis retirée, avec l’en-tête de mesure A/B',async()=>{const f=server(()=>json({id:7},201));vi.stubGlobal('fetch',f);const o=useOutbox();o.enqueue(item);
  expect(await o.flush(1)).toMatchObject([{outcome:'confirmed'}]);expect(o.items).toHaveLength(0);
  const post=f.mock.calls.find(([u,i])=>u==='/api/appointments'&&i?.method==='POST')!;expect(new Headers(post[1]!.headers).get('X-AB-Measure')).toBe('1');});
 it('toujours hors ligne : rien n’est perdu',async()=>{vi.stubGlobal('fetch',server(()=>{throw new TypeError('Failed to fetch')}));const o=useOutbox();o.enqueue(item);
  expect(await o.flush(1)).toEqual([]);expect(o.items).toHaveLength(1);});
 it('409 sur notre propre réservation (réponse perdue) : confirmée',async()=>{vi.stubGlobal('fetch',server(()=>json({detail:'pris'},409),[{slotId:42,status:'CONFIRMED'}]));const o=useOutbox();o.enqueue(item);
  expect(await o.flush(1)).toMatchObject([{outcome:'confirmed'}]);expect(o.items).toHaveLength(0);});
 it('409 : créneau pris par quelqu’un d’autre entre-temps',async()=>{vi.stubGlobal('fetch',server(()=>json({detail:'pris'},409),[]));const o=useOutbox();o.enqueue(item);
  expect(await o.flush(1)).toMatchObject([{outcome:'taken'}]);expect(o.items).toHaveLength(0);});
 it('401 : gardée jusqu’à la reconnexion',async()=>{vi.stubGlobal('fetch',server(()=>json({title:'Connexion requise'},401)));const o=useOutbox();o.enqueue(item);
  expect(await o.flush(1)).toMatchObject([{outcome:'login'}]);expect(o.items).toHaveLength(1);});
 it('n’envoie que les demandes de la personne connectée, sans doublon',async()=>{const f=server(()=>json({id:1},201));vi.stubGlobal('fetch',f);const o=useOutbox();
  o.enqueue(item);o.enqueue(item);o.enqueue({...item,userId:2});expect(o.items).toHaveLength(2);
  await o.flush(1);expect(o.items.map(i=>i.userId)).toEqual([2]);});
});
describe('File d’envoi : serveur injoignable derrière le proxy',()=>{
 beforeEach(()=>{setActivePinia(createPinia());vi.restoreAllMocks();});
 it('502 : la demande reste en file',async()=>{vi.stubGlobal('fetch',server(()=>json({},502)));const o=useOutbox();o.enqueue(item);expect(await o.flush(1)).toEqual([]);expect(o.items).toHaveLength(1);});
});
