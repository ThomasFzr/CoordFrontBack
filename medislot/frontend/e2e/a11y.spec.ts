import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
// TP RGAA : le parcours de réservation au clavier seul, ce qu'annonce chaque état, puis axe-core (WCAG 2.x A et AA) sur cet état.
const axe=async(page:Page)=>{const r=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();expect(r.violations.map(v=>`${v.id} : ${v.nodes.map(n=>n.target.join(' ')).join(', ')}`)).toEqual([]);};
const focused=(page:Page)=>page.evaluate(()=>{const e=document.activeElement as HTMLElement;return (e.getAttribute('aria-label')||e.textContent||'').trim();});

test('arrivée : titre de l’onglet, lien d’évitement, focus visible, aucune violation axe',async({page})=>{
 await page.goto('/');await expect(page.getByText('6 praticiens à découvrir')).toBeVisible();
 await expect(page).toHaveTitle('Trouver un praticien · MediSlot');
 await page.keyboard.press('Tab');expect(await focused(page)).toBe('Aller au contenu');
 await page.keyboard.press('Enter');await page.keyboard.press('Tab');await expect(page.getByLabel('Nom du praticien')).toBeFocused();
 const outline=await page.getByLabel('Nom du praticien').evaluate(e=>getComputedStyle(e).outlineColor);expect(outline).toBe('rgb(18, 51, 75)');
 await expect(page.getByRole('heading',{level:3,name:/^Dr /})).toHaveCount(6);
 await axe(page);
});

test('fenêtre de connexion : focus sur le titre, piège clavier, erreur sous le champ, retour du focus',async({page})=>{
 await page.goto('/');await expect(page.getByText('6 praticiens à découvrir')).toBeVisible();
 const opener=page.getByRole('button',{name:'Se connecter',exact:true});await opener.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'Heureux de vous retrouver'})).toBeFocused();
 await axe(page);
 // « Compte de démonstration » (summary) est atteignable, et Tab ne sort jamais de la fenêtre.
 const reached:string[]=[];for(let i=0;i<10;i++){await page.keyboard.press('Tab');reached.push(await focused(page));expect(await page.evaluate(()=>!!document.activeElement?.closest('[role=dialog]'))).toBe(true);}
 expect(reached).toContain('Compte de démonstration');
 // Inscription avec un mot de passe trop court : focus dans le champ, état invalide, message du serveur relié.
 await page.getByRole('button',{name:'Créer un compte'}).click();
 await page.getByLabel('Votre nom').fill('Léa Test');await page.getByLabel('Adresse e-mail').fill(`lea-${Date.now()}@medislot.test`);
 await page.getByLabel('Mot de passe').fill('court');await page.getByLabel('Mot de passe').press('Enter');
 const pw=page.getByLabel('Mot de passe');await expect(pw).toBeFocused();await expect(pw).toHaveAttribute('aria-invalid','true');
 await expect(pw).toHaveAccessibleDescription(/12 caractères au moins\. Erreur : 12 caractères au moins/);
 await axe(page);
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(opener).toBeFocused();
});

test('réservation au clavier : confirmation annoncée, focus sur « Mes rendez-vous », puis annulation',async({page})=>{
 await page.goto('/');await expect(page.getByText('6 praticiens à découvrir')).toBeVisible();
 await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByLabel('Adresse e-mail').fill('patient@medislot.test');await page.getByLabel('Mot de passe').fill('MediSlot-demo-2026!');await page.getByLabel('Mot de passe').press('Enter');
 await expect(page.getByRole('button',{name:'Camille · Déconnexion'})).toBeVisible();
 const slot=page.getByRole('button',{name:/^Réserver avec/}).first();await slot.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'Confirmer votre rendez-vous'})).toBeFocused();
 await page.getByRole('button',{name:'Confirmer le rendez-vous'}).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{level:1,name:'Mes rendez-vous'})).toBeFocused();
 await expect(page).toHaveTitle('Mes rendez-vous · MediSlot');
 await expect(page.getByRole('status').filter({hasText:'Votre rendez-vous est confirmé.'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Mes rendez-vous'})).toHaveAttribute('aria-current','page');
 await axe(page);
 // Chaque action dit de quel rendez-vous il s'agit ; on annule celui qu'on vient de créer pour ne rien laisser en base.
 const cancel=page.getByRole('button',{name:/^Annuler le rendez-vous du /}).first();await cancel.click();
 await page.getByRole('button',{name:'Confirmer l’annulation'}).click();
 await expect(page.getByRole('status').filter({hasText:'Votre rendez-vous a été annulé.'})).toBeVisible();
});
