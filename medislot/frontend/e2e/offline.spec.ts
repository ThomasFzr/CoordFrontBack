import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
// Hors ligne → cache → retour du réseau → envoi. Le service worker n'est actif que sur l'application construite.
async function login(page:Page){
 await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByLabel('Adresse e-mail',{exact:true}).fill('patient@medislot.test');await page.getByLabel('Mot de passe',{exact:true}).fill('MediSlot-demo-2026!');
 await page.getByRole('dialog').getByRole('button',{name:'Se connecter',exact:true}).click();await expect(page.getByRole('button',{name:'Camille · Déconnexion'})).toBeVisible();
}
// Prépare la page : service worker actif et lectures mises en cache pendant qu'on est en ligne.
async function warmUp(page:Page){
 await page.goto('/');await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
 await page.reload();await expect(page.getByText('6 praticiens à découvrir')).toBeVisible();
 await login(page);
 await page.getByRole('button',{name:'Mes rendez-vous'}).click();await expect(page.getByRole('heading',{name:'Mes rendez-vous'})).toBeVisible();
 await page.getByRole('button',{name:'Trouver un praticien'}).click();
}
async function bookOffline(page:Page,card:number){
 await page.locator('.doctor-card').nth(card).locator('.slot').first().click();
 await page.getByRole('button',{name:'Confirmer le rendez-vous',exact:true}).click();
 await expect(page.getByText(/sera envoyée dès le retour de la connexion\. Elle n’est pas encore confirmée\./)).toBeVisible();
 await expect(page.getByText('En attente d’envoi · non confirmé')).toBeVisible();
}
// Le premier bouton d'une carte est le premier créneau renvoyé par l'API pour ce praticien (même ordre de recherche).
async function firstSlotOfCard(request:APIRequestContext,card:number){
 const found=await (await request.get('/api/professionals?q=&city=&specialty=&page=0&size=6')).json();
 return (await (await request.get(`/api/professionals/${found.items[card].id}/slots`)).json())[0].id as number;
}
// Une autre personne réserve en ligne, par l'API (session, CSRF), pendant que la première est hors ligne.
async function bookAsOther(request:APIRequestContext,slotId:number){
 let csrf=await (await request.get('/api/csrf')).json();
 await request.post('/api/login',{headers:{[csrf.headerName]:csrf.token},form:{username:'autre@medislot.test',password:'MediSlot-demo-2026!'}});
 csrf=await (await request.get('/api/csrf')).json();
 return (await request.post('/api/appointments',{headers:{[csrf.headerName]:csrf.token},data:{slotId}})).status();
}

test('hors ligne → cache → en ligne → envoi : la réservation est confirmée au retour du réseau',async({page,context})=>{
 await warmUp(page);
 await context.setOffline(true);
 const fromCache:string[]=[];page.on('response',r=>{if(r.url().includes('/api/professionals')&&r.headers()['x-medislot-offline'])fromCache.push(r.url());});
 await page.reload();
 await expect(page.getByText('6 praticiens à découvrir')).toBeVisible();
 await expect(page.getByText(/^Vous êtes hors ligne\./)).toBeVisible();
 expect(fromCache.length,'praticiens et créneaux servis depuis le cache').toBeGreaterThan(0);
 await bookOffline(page,2);
 await context.setOffline(false);
 await expect(page.getByText(/Votre rendez-vous du .* est confirmé\./)).toBeVisible();
 await expect(page.getByText('En attente d’envoi · non confirmé')).toHaveCount(0);
 await expect(page.getByText(/^Vous êtes hors ligne\./)).toHaveCount(0);
});

test('créneau pris pendant la coupure : la personne est prévenue, rien n’est confirmé à tort',async({page,context,playwright,baseURL})=>{
 await warmUp(page);
 const slotId=await firstSlotOfCard(page.request,3);
 await context.setOffline(true);
 await bookOffline(page,3);
 const other=await playwright.request.newContext({baseURL});
 expect(await bookAsOther(other,slotId)).toBe(201);await other.dispose();
 await context.setOffline(false);
 await expect(page.getByText(/a été pris pendant que vous étiez hors ligne\. Choisissez-en un autre\./)).toBeVisible();
 await expect(page.getByText('En attente d’envoi · non confirmé')).toHaveCount(0);
});

// Panne du serveur avec réseau présent : pas d'événement « online », le flux SSE et le filet de 15 s doivent
// relancer l'envoi ; le redémarrage efface les sessions (en mémoire), il faut donc se reconnecter.
test('serveur arrêté puis redémarré : file conservée, reconnexion demandée, puis envoi',async({page})=>{
 test.skip(!process.env.E2E_DOCKER,'arrête le conteneur backend : E2E_DOCKER=1 requis');
 test.setTimeout(150_000);
 const {execSync}=await import('node:child_process');
 const compose=(action:string)=>execSync(`docker compose ${action} backend`,{cwd:new URL('../..',import.meta.url).pathname,stdio:'ignore'});
 await warmUp(page);
 try{
  compose('stop');
  const started=Date.now();await page.reload();
  await expect(page.locator('.doctor-card .slot').first()).toBeVisible({timeout:15_000});
  expect(Date.now()-started,'page utilisable rapidement malgré la panne').toBeLessThan(10_000);
  await expect(page.getByText(/^Vous êtes hors ligne\./)).toBeVisible();
  await expect(page.getByRole('button',{name:'Camille · Déconnexion'})).toBeVisible();
  await bookOffline(page,4);
 }finally{compose('start');}
 await expect(page.getByRole('dialog').getByText('Heureux de vous retrouver')).toBeVisible({timeout:90_000});
 await expect(page.getByRole('dialog').getByText('Reconnectez-vous pour envoyer votre demande en attente.')).toBeVisible();
 await page.getByLabel('Adresse e-mail',{exact:true}).fill('patient@medislot.test');await page.getByLabel('Mot de passe',{exact:true}).fill('MediSlot-demo-2026!');
 await page.getByRole('dialog').getByRole('button',{name:'Se connecter',exact:true}).click();
 await expect(page.getByText(/Votre rendez-vous du .* est confirmé\./)).toBeVisible({timeout:20_000});
 await page.getByRole('button',{name:'Trouver un praticien'}).click();
 await expect(page.getByText('Disponibilités en direct'),'le direct se rétablit seul').toBeVisible({timeout:20_000});
});
