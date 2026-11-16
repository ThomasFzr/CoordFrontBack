import {test,expect} from '@playwright/test';

test('inscription, limite UTF-8 du mot de passe et connexion',async({request})=>{
 const csrf=await (await request.get('/api/csrf')).json();
 const headers={[csrf.headerName]:csrf.token};
 const email=`test-${Date.now()}@medislot.test`;
 const invalid=await request.post('/api/register',{headers,data:{email,name:'Patient de test',password:'é'.repeat(40)}});
 expect(invalid.status()).toBe(400);
 const created=await request.post('/api/register',{headers,data:{email,name:'Patient de test',password:'MediSlot-test-2026!'}});
 expect(created.status()).toBe(201);
 expect((await created.json()).role).toBe('PATIENT');
 const login=await request.post('/api/login',{headers,form:{username:email,password:'MediSlot-test-2026!'}});
 expect(login.status()).toBe(204);
 const me=await request.get('/api/me');
 expect(me.status()).toBe(200);
 expect((await me.json()).email).toBe(email);
});
