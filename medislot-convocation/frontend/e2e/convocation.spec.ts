import {test,expect,type Page} from '@playwright/test';

// Étape 4 du TP : on clique comme un patient, sur la vraie pile (nginx → Spring → PostgreSQL).
async function bookAsPatient(page:Page){
 await page.goto('/');
 await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByLabel('Adresse e-mail',{exact:true}).fill('patient@medislot.test');
 await page.getByLabel('Mot de passe',{exact:true}).fill('MediSlot-demo-2026!');
 await page.getByRole('dialog').getByRole('button',{name:'Se connecter',exact:true}).click();
 await expect(page.getByRole('button',{name:'Camille · Déconnexion'})).toBeVisible();
 await page.getByRole('button',{name:/Réserver avec/}).first().click();
 await page.getByRole('button',{name:'Confirmer le rendez-vous',exact:true}).click();
 await expect(page.getByText('Votre rendez-vous est confirmé.',{exact:true})).toBeVisible();
 // La liste est triée du plus récent au plus ancien : le premier rendez-vous est celui-ci.
 const card=page.locator('article.appointment').first();
 const id=(await page.request.get('/api/appointments').then(r=>r.json()))[0].id as number;
 return {card,id};
}

test('la convocation s’affiche dans un onglet et s’enregistre sous le nom du serveur',async({page})=>{
 const {card,id}=await bookAsPatient(page);
 const [popup]=await Promise.all([page.waitForEvent('popup'),card.getByRole('button',{name:/^Ma convocation \(PDF\)/}).click()]);
 // L'onglet reçoit le blob: PDF. Avec visionneuse (Chrome, nouveau headless), il l'affiche ;
 // sans visionneuse (Chromium headless shell), le navigateur le télécharge depuis l'onglet.
 const shown=await Promise.race([
  // Sans visionneuse, la navigation vers le blob: est abandonnée (ERR_ABORTED) au profit du téléchargement.
  popup.waitForURL(/^blob:/).then(()=>'visionneuse',()=>new Promise<string>(()=>{})),
  popup.waitForEvent('download').then(()=>'téléchargé depuis l’onglet'),
 ]);
 test.info().annotations.push({type:'onglet',description:shown});
 await expect(card.getByRole('alert')).toHaveCount(0);
 const [download]=await Promise.all([page.waitForEvent('download'),card.getByRole('button',{name:/^Enregistrer la convocation/}).click()]);
 expect(download.suggestedFilename()).toBe(`convocation-rdv-${id}.pdf`);
});

test('un rendez-vous annulé dans un autre onglet donne une phrase, pas un onglet vide',async({page})=>{
 // Sans le flux SSE privé, la liste ne se met pas à jour seule : le bouton reste là, comme sur un onglet resté ouvert.
 await page.route('**/api/notifications/events',r=>r.abort());
 const {card,id}=await bookAsPatient(page);
 // Annulation « depuis un autre onglet » : même session, sans rafraîchir la liste.
 const csrf=await page.request.get('/api/csrf').then(r=>r.json());
 expect((await page.request.post(`/api/appointments/${id}/cancel`,{headers:{[csrf.headerName]:csrf.token}})).ok()).toBe(true);
 const [popup]=await Promise.all([page.waitForEvent('popup'),card.getByRole('button',{name:/^Ma convocation \(PDF\)/}).click()]);
 await expect(card.getByRole('alert')).toHaveText('Ce rendez-vous est annulé : il n’a plus de convocation.');
 await expect.poll(()=>popup.isClosed()).toBe(true);
});
