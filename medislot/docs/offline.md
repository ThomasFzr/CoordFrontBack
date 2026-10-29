# Hors ligne : cache, file d'envoi, envoi au retour du réseau

Parcours : **hors ligne → cache → retour du réseau → envoi**. L'application reste consultable sans réseau
et une réservation demandée hors ligne est envoyée automatiquement au retour de la connexion. Elle n'est
jamais présentée comme confirmée avant la réponse du serveur.

## Ce qui fonctionne sans réseau

| Élément | Comportement |
|---|---|
| Ouverture de l'application | Page et fichiers construits mis en cache par le service worker (`public/sw.js`) dès la première visite. |
| Praticiens, créneaux, mes rendez-vous, notifications, session | Réseau d'abord ; sans réseau (ou serveur injoignable : 502 à 504), dernière réponse réussie de cet appareil, marquée `X-MediSlot-Offline`. |
| Bandeau | « Vous êtes hors ligne… » dès que le navigateur est hors ligne ou qu'une donnée vient du cache. |
| Réservation | Mise en file sur l'appareil (`stores/outbox.ts`), affichée dans « Mes rendez-vous » : « En attente d'envoi · non confirmé », avec « Retirer la demande ». |
| Déplacement, annulation | Non mis en file : message demandant de réessayer avec le réseau. |
| Jamais en cache | Écritures, flux SSE, test A/B, jeton CSRF. |

## Au retour du réseau

La file est envoyée à l'événement `online`, au démarrage, à la connexion et à la reconnexion du flux SSE,
une demande après l'autre, avec le même en-tête `X-AB-Measure` que si elle était partie tout de suite.

| Réponse | Résultat pour la personne |
|---|---|
| 201 | « Votre rendez-vous du … est confirmé. » |
| 409 et le rendez-vous existe déjà pour elle | Confirmé : la réponse d'un premier envoi s'était perdue. |
| 409 sinon | « Le créneau … a été pris pendant que vous étiez hors ligne. Choisissez-en un autre. » |
| 401 | La demande reste en file : « Reconnectez-vous pour envoyer votre demande en attente. » |
| Toujours injoignable | La demande reste en file, nouvel essai au prochain déclencheur. |
| Autre refus | La demande est retirée et la raison affichée. |

## Serveur en panne, réseau présent

| Mécanisme | Effet |
|---|---|
| Nginx `proxy_connect_timeout 2s` | Le proxy répond 502/504 en 2 s au lieu d'attendre ≈ 14 s par requête. |
| Service worker : délai de 4 s, puis 5 s « serveur indisponible » | Une lecture lente bascule sur le cache ; après un échec, les lectures suivantes sont servies depuis le cache sans attendre. Page utilisable en ≈ 2 s pendant la panne. |
| Flux SSE recréé | Une réponse non-SSE (502-504) fait abandonner `EventSource` : `useLive` recrée le flux toutes les 3 s jusqu'au retour du serveur. |
| Nouvel essai toutes les 15 s | Tant qu'une demande attend, l'envoi est retenté même sans événement `online` ni reconnexion SSE. |
| Session perdue (401) | Le serveur garde les sessions en mémoire : après un redémarrage, la page repasse « non connectée », ouvre la connexion, et la demande part dès la reconnexion. |

## Limites et choix

- Les créneaux affichés hors ligne peuvent ne plus être libres : seul le serveur tranche, d'où le 409
  traité au retour du réseau.
- La file vit dans le `localStorage` de l'appareil (praticien, date, identifiant du créneau, sans motif ni
  spécialité). Elle est vidée à la déconnexion, comme le cache des lectures personnelles.
- Pas de Background Sync : l'envoi suppose que l'application soit ouverte au retour du réseau.
- Le service worker n'est enregistré que sur l'application construite (`npm run build`, Docker), pas avec
  `npm run dev`.

## Vérifier

```sh
cd frontend && npm test                                     # outbox.test.ts : 201, 409, 401, 502, hors ligne, une file par personne
cd frontend && PW_CHANNEL=chrome E2E_DOCKER=1 npx playwright test e2e/offline.spec.ts   # E2E_DOCKER : arrête et relance le conteneur backend
```

À la main : se connecter, ouvrir « Mes rendez-vous », puis DevTools → Network → **Offline**. Recharger la
page : elle s'affiche avec le bandeau. Réserver un créneau : la demande apparaît « En attente d'envoi ».
Repasser **No throttling** : le message de confirmation s'affiche sans rien faire.

Panne du serveur : `docker compose stop backend`, recharger (bandeau, données de l'appareil), réserver
(« En attente d'envoi »), puis `docker compose start backend` sans toucher à la page : la connexion est
proposée (session perdue au redémarrage) et la demande est confirmée après reconnexion.
