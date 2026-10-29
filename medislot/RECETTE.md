# Recette RGAA · réservation MediSlot

Mesures du 29/10/2026 sur http://localhost:8088. Les colonnes « Avant » et « Après » ont été mesurées avec Chrome, axe-core 4.14.0 (règles WCAG 2.0, 2.1 et 2.2, niveaux A et AA) et des parcours Playwright au clavier.

Je n'ai pas fait d'écoute avec NVDA ni VoiceOver. Ce que lirait le lecteur d'écran a été vérifié dans l'arbre d'accessibilité : rôle, nom, état invalide, description et régions annoncées. L'écoute reste à faire par un humain avant toute déclaration.

| Temps / critère RGAA | Avant | Après | OK / KO |
|---|---|---|---|
| 1 · 8.6, 12.7 | Onglet toujours « MediSlot — Votre prochain rendez-vous ». Après « Aller au contenu », Tab mène au nom du premier praticien : la recherche est sautée, car `main` commence sous le bandeau. | Onglet « Trouver un praticien · MediSlot », puis « Mes rendez-vous · MediSlot ». Après « Aller au contenu », Tab mène au champ « Nom du praticien », car `main` englobe le bandeau. | OK |
| 2 · 9.2, 10.7, 3.2 | Les noms des praticiens sont des boutons, pas des titres. Le focus est orange `#ec8d25`, à 2,5:1 sur blanc. Le texte du bandeau est à 4,41:1 et 4,44:1 (règle axe `color-contrast`, 4 éléments). | Chaque nom est un titre h3 qui contient le bouton : 6 titres. Le focus est marine `#12334b`, à 13,1:1, et `summary` est inclus. Le texte du bandeau est blanc, à 5,04:1. | OK |
| 3 · 3.3, 11.9 | Six « Voir la fiche du praticien » identiques. Les bordures des champs de connexion sont `#bfd0dc`, à 1,58:1. | Chaque bouton est nommé « Voir la fiche du praticien Dr … ». Les bordures sont `#6b8496`, à 3,9:1. | OK |
| 4 · 11.10, 11.11 | Le 400 renvoie le message général « Vérifiez les données saisies. », sans indiquer le champ en cause. Les messages de Bean Validation sont ceux par défaut. | « Tous les champs sont obligatoires. » s'affiche avant les champs, et l'aide « 12 caractères au moins. » est reliée au mot de passe. Après l'envoi, le focus va dans le champ fautif, marqué `aria-invalid="true"`. Sa description est « 12 caractères au moins. Erreur : 12 caractères au moins, 72 au plus. ». Le message vient du serveur (`Registration`, en français). Une adresse déjà utilisée s'affiche sous l'e-mail. | OK |
| 5 · 7.3, 12.8 | À l'ouverture, le focus va sur « × ». « Compte de démonstration » (`summary`) est hors du piège clavier. Les boutons `disabled` perdent le focus pendant l'envoi. | À l'ouverture, le focus va sur le titre h2. Le piège clavier inclut `summary` : 10 Tab de suite restent dans la fenêtre. Pendant l'envoi, les boutons passent en `aria-disabled` et une garde dans le code bloque le double envoi. L'origine du focus n'est mémorisée qu'à l'ouverture : après Échap, le focus revient sur « Se connecter », ou sur le h1 si l'élément d'origine a disparu. | OK |
| 6 · 7.5 | Régions `role="status"` et `role="alert"` créées par `v-if` en même temps que leur texte : elles risquent de ne pas être lues. | Les conteneurs `status` et `alert` existent toujours, seul leur contenu apparaît. Cela vaut pour « Votre rendez-vous est confirmé. », « créneau pris », le chargement, l'erreur dans la fenêtre et « Reconnectez-vous… ». Après confirmation, le focus va sur le h1 « Mes rendez-vous ». | OK (NVDA non fait) |
| 7 · 3.1, 8.6 | La vue active n'est marquée que par la couleur. Il y a deux « Annuler » sans contexte. | La vue active porte `aria-current="page"` et un soulignement. Le bouton est nommé « Annuler le rendez-vous du jeudi 5 novembre à 09:00 avec Dr … » ; c'est pareil pour « Déplacer », « Historique » et « Retirer la demande ». | OK |
| axe DevTools | Accueil : 1 règle (`color-contrast`, 4 éléments). Fenêtre de connexion : 1 règle. | Accueil : 0 règle. Fenêtre de connexion : 0. Erreur d'inscription : 0. « Mes rendez-vous » : 0. | OK |

## Preuve automatique

`frontend/e2e/a11y.spec.ts` rejoue le parcours au clavier et lance axe-core sur chaque état : accueil, fenêtre, erreur d'inscription et « Mes rendez-vous ». Le rendez-vous qu'il crée est annulé à la fin. Il tourne en CI avec les autres tests Playwright.

## Reste à faire (humain)

- Écouter le parcours avec NVDA et Firefox, puis avec VoiceOver et Safari, et recopier les phrases de la visionneuse de parole.
- Vérifier « créneau pris » avec deux profils : un second profil réserve le même créneau avec `autre@medislot.test`.
- Faire un audit RGAA complet sur l'échantillon réglementaire. Un axe à 0 ne vaut pas « conforme ».
