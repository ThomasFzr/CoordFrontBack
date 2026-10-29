import {test,expect} from '@playwright/test';
test('une personne réserve puis annule son rendez-vous',async({page})=>{
 await page.goto('/');await expect(page.getByText('6 praticiens à découvrir')).toBeVisible();
 await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByLabel('Adresse e-mail',{exact:true}).fill('patient@medislot.test');await page.getByLabel('Mot de passe',{exact:true}).fill('MediSlot-demo-2026!');
 await page.getByRole('dialog').getByRole('button',{name:'Se connecter',exact:true}).click();await expect(page.getByRole('button',{name:'Camille · Déconnexion'})).toBeVisible();
 await page.getByRole('button',{name:/Réserver avec/}).first().click();await page.getByRole('button',{name:'Confirmer le rendez-vous',exact:true}).click();
 await expect(page.getByText('Votre rendez-vous est confirmé.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Annuler',exact:true}).first().click();await page.getByRole('button',{name:'Confirmer l’annulation'}).click();
 await expect(page.getByText('Votre rendez-vous a été annulé.',{exact:true})).toBeVisible();
});
