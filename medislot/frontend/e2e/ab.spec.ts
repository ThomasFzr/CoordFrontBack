import {test,expect,type Page,type BrowserContext,type APIRequestContext} from '@playwright/test';
import {createHash,randomUUID} from 'node:crypto';
// Test A/B bouton_reserver_v1 : mêmes règles que le serveur (SHA-256 de « clé:identifiant », premier octet < 128 → A).
const EXP='bouton_reserver_v1',LABEL={A:'Réserver',B:'Choisir ce créneau'} as const;
type V='A'|'B';
const variantOf=(id:string):V=>createHash('sha256').update(`${EXP}:${id}`).digest()[0]<128?'A':'B';
function visitor(v:V){for(;;){const id=randomUUID();if(variantOf(id)===v)return id;}}
async function asVisitor(context:BrowserContext,baseURL:string,v:V){const id=visitor(v);await context.addCookies([{name:'ab_visitor',value:id,url:baseURL}]);return id;}
async function metrics(request:APIRequestContext,v:V){const m=await (await request.get('/api/ab/metrics')).json();return m.variants.find((x:{variant:string})=>x.variant===v);}
async function login(page:Page){
 await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByLabel('Adresse e-mail',{exact:true}).fill('autre@medislot.test');await page.getByLabel('Mot de passe',{exact:true}).fill('MediSlot-demo-2026!');
 await page.getByRole('dialog').getByRole('button',{name:'Se connecter',exact:true}).click();await expect(page.getByRole('button',{name:'Alex · Déconnexion'})).toBeVisible();
}
const exposure=(page:Page)=>page.waitForRequest(r=>r.url().endsWith('/api/ab/exposure')&&r.method()==='POST');

for(const v of ['A','B'] as const){
 test(`version ${v} : libellé, stable au rechargement, une seule exposition`,async({page,context,request,baseURL})=>{
  await asVisitor(context,baseURL!,v);const before=await metrics(request,v);
  const exposed=exposure(page);await page.goto('/');await exposed;
  const cta=page.locator('[data-ab-cta]');await expect(cta.first()).toHaveText(LABEL[v]);
  await expect(page.locator('[data-ab-cta]',{hasText:LABEL[v==='A'?'B':'A']})).toHaveCount(0);
  for(let i=0;i<2;i++){await page.reload();await expect(cta.first()).toHaveText(LABEL[v]);}
  await expect.poll(async()=>(await metrics(request,v)).exposed).toBe(before.exposed+1);
  expect((await metrics(request,v)).assigned).toBe(before.assigned+1);
 });
}

test('A et B ne diffèrent que par le texte : même style, même place',async({browser,baseURL})=>{
 const styles:Record<string,unknown>={};
 for(const v of ['A','B'] as const){
  const context=await browser.newContext();await asVisitor(context,baseURL!,v);const page=await context.newPage();await page.goto('/');
  const cta=page.locator('[data-ab-cta]').first();await expect(cta).toHaveText(LABEL[v]);
  styles[v]=await cta.evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,color:s.color,width:el.getBoundingClientRect().width,radius:s.borderRadius,font:s.fontWeight}});
  await context.close();
 }
 expect(styles.B).toEqual(styles.A);
});

test('pas de scintillement : squelette tant que la variante n’est pas connue',async({page,context,baseURL})=>{
 await asVisitor(context,baseURL!,'B');
 await page.route('**/api/ab/assignment',async route=>{await new Promise(r=>setTimeout(r,600));await route.continue();});
 await page.goto('/');
 await expect(page.locator('.cta-skeleton').first()).toBeVisible();
 await expect(page.locator('[data-ab-cta]')).toHaveCount(0);
 await expect(page.locator('[data-ab-cta]').first()).toHaveText(LABEL.B);
});

test('aucun créneau disponible : aucune exposition',async({page,context,baseURL})=>{
 await asVisitor(context,baseURL!,'A');let sent=false;page.on('request',r=>{if(r.url().endsWith('/api/ab/exposure'))sent=true;});
 await page.route('**/api/professionals/*/slots',route=>route.fulfill({json:[]}));
 await page.goto('/');await expect(page.getByText('Aucun créneau disponible dans les 14 prochains jours.').first()).toBeVisible();
 await page.waitForTimeout(800);expect(sent).toBe(false);
});

test('réservation par le bouton testé : conversion attribuée à la bonne version',async({page,context,request,baseURL})=>{
 await asVisitor(context,baseURL!,'B');const before=await metrics(request,'B');
 const exposed=exposure(page);await page.goto('/');await exposed;await login(page);
 const booking=page.waitForRequest(r=>r.url().endsWith('/api/appointments')&&r.method()==='POST');
 await page.locator('[data-ab-cta]').first().click();await page.getByRole('button',{name:'Confirmer le rendez-vous',exact:true}).click();
 expect((await booking).headers()['x-ab-measure']).toBe('1');
 await expect(page.getByText('Votre rendez-vous est confirmé.',{exact:true})).toBeVisible();
 await expect.poll(async()=>(await metrics(request,'B')).converted).toBe(before.converted+1);
});

test('affectation indisponible : version A de secours, rien n’est mesuré, la réservation fonctionne',async({page,request})=>{
 const before=await metrics(request,'A');let exposureSent=false;page.on('request',r=>{if(r.url().endsWith('/api/ab/exposure'))exposureSent=true;});
 await page.route('**/api/ab/assignment',route=>route.abort());
 await page.goto('/');await expect(page.locator('[data-ab-cta]').first()).toHaveText(LABEL.A);await login(page);
 const booking=page.waitForRequest(r=>r.url().endsWith('/api/appointments')&&r.method()==='POST');
 await page.locator('[data-ab-cta]').first().click();await page.getByRole('button',{name:'Confirmer le rendez-vous',exact:true}).click();
 expect((await booking).headers()['x-ab-measure']).toBeUndefined();
 await expect(page.getByText('Votre rendez-vous est confirmé.',{exact:true})).toBeVisible();
 expect(exposureSent).toBe(false);
 const after=await metrics(request,'A');expect([after.assigned,after.exposed,after.converted]).toEqual([before.assigned,before.exposed,before.converted]);
});

test('clavier : le bouton testé est atteignable et s’active au clavier',async({page,context,baseURL})=>{
 await asVisitor(context,baseURL!,'B');await page.goto('/');
 const cta=page.locator('[data-ab-cta]').first();await expect(cta).toHaveText(LABEL.B);
 await expect(cta).toHaveAttribute('aria-label',/^Choisir ce créneau avec Dr /);
 await cta.focus();await expect(cta).toBeFocused();await page.keyboard.press('Enter');
 await expect(page.getByRole('dialog')).toBeVisible();
});
