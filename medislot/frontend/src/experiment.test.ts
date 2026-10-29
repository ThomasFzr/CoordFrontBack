import {describe,it,expect,vi,beforeEach} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {useExperiment} from './stores/experiment';
const reply=(body:unknown,status=200)=>vi.fn().mockResolvedValue(new Response(JSON.stringify(body),{status}));
describe('Test A/B : affectation reçue par le front',()=>{
 beforeEach(()=>{setActivePinia(createPinia());vi.restoreAllMocks();});
 it('affiche le libellé B et mesure quand le serveur affecte B',async()=>{vi.stubGlobal('fetch',reply({experiment:'bouton_reserver_v1',enabled:true,variant:'B',bucket:254}));const e=useExperiment();expect(e.variant).toBeNull();await e.load();expect(e.label).toBe('Choisir ce créneau');expect(e.measureHeaders()).toEqual({'X-AB-Measure':'1'});});
 it('expérience désactivée : A, sans mesure',async()=>{vi.stubGlobal('fetch',reply({experiment:'bouton_reserver_v1',enabled:false,variant:'A'}));const e=useExperiment();await e.load();expect(e.label).toBe('Réserver');expect(e.measured).toBe(false);expect(e.measureHeaders()).toEqual({});});
 it('erreur HTTP : A de secours, sans mesure',async()=>{vi.stubGlobal('fetch',reply({},503));const e=useExperiment();await e.load();expect(e.variant).toBe('A');expect(e.measured).toBe(false);});
 it('panne réseau : A de secours, sans nouvelle demande',async()=>{const f=vi.fn().mockRejectedValue(new TypeError('Network failure'));vi.stubGlobal('fetch',f);const e=useExperiment();await e.load();await e.load();expect(e.variant).toBe('A');expect(e.measured).toBe(false);expect(f).toHaveBeenCalledTimes(1);});
 it('une seule demande d’affectation par page',async()=>{const f=reply({enabled:true,variant:'A',bucket:3});vi.stubGlobal('fetch',f);const e=useExperiment();await Promise.all([e.load(),e.load()]);expect(f).toHaveBeenCalledTimes(1);});
});
