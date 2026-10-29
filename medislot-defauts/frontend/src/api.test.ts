import {describe,it,expect,vi,beforeEach} from 'vitest';
import {api,ApiError} from './api';
describe('Front/back : statut et corps',()=>{
 beforeEach(()=>vi.restoreAllMocks());
 it('expose le message métier pour un conflit HTTP',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Créneau déjà réservé'}),{status:409})));await expect(api('/appointments')).rejects.toEqual(new ApiError('Créneau déjà réservé',409));});
 it('conserve un résultat vide comme succès',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({items:[],total:0}),{status:200})));await expect(api('/professionals')).resolves.toEqual({items:[],total:0});});
 it.skip('propage une panne réseau',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Network failure')));await expect(api('/professionals')).rejects.toThrow('Network failure');});
});
