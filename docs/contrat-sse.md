# Contrat temps réel (SSE)

MongoDB conserve. L'API décide. SSE informe. Le front relit.

Le front et l'API partagent une origine : nginx (port 8080) sert le front et relaie `/api/…` vers l'API
sans tampon. L'API reste aussi joignable directement sur le port 3000.

## Échanges

| Échange | Contrat |
|---|---|
| `GET /api/listings` | 200 ; `{ page, limit, total, pages, data[] }`, chaque annonce porte `status` et `version` si elle en a. |
| `GET /api/listings/:id` | 200 ; annonce sans le champ `booking` (jamais public). 404 si inconnue. |
| `POST /api/listings/:id/reservations` | Corps `{ "customerId": "…" }` (identité fictive). 201 si accepté, 409 si déjà réservée, 404 si inconnue, 400 sans `customerId`. |
| `DELETE /api/listings/:id/reservations` | 204 si une réservation est annulée, 404 sinon. |
| `GET /api/events` | 200 ; `Content-Type: text/event-stream`. |
| `ready` | Envoyé à chaque abonnement, avec `retry: 2000`. Données `{"action":"reload"}` : relire la liste. |
| `listing-updated` | Envoyé **après** chaque écriture réussie. Données `{ listingId, change, version }`, `change` ∈ `created`, `updated`, `deleted`, `reserved`, `released`. Déclenche une relecture. |
| `: keepalive` | Commentaire toutes les 15 s (`SSE_HEARTBEAT_MS`), sans action métier. |

`version` compte les modifications d'une annonce. L'`id:` d'un événement est un compteur local au
processus : il repart à zéro au redémarrage et ne permet pas de rejouer les événements manqués.

## Comportement attendu du front

- Un seul `EventSource` par onglet, fermé quand la page est quittée (`pagehide`).
- À `ready` et à `listing-updated` : relecture sérialisée de la liste (une lecture à la fois, la dernière demande gagne).
- En cas d'erreur : afficher « Connexion interrompue… » sans fermer le flux. Si le navigateur abandonne
  (réponse non-SSE, par exemple 502 pendant un redémarrage de l'API), le front recrée le flux après 2 s.
- Relecture de secours toutes les 30 s. `?poll=0` la désactive pour vérifier SSE seul.
- Seule la réponse du `POST` personnel confirme une réservation ; un onglet qui reçoit `reserved`
  affiche l'annonce indisponible, sans message de confirmation.
- Les actions de réservation ne sont proposées que sur les annonces fictives (`_id` en `test-…`),
  créées avec le bouton « + Annonce de test ».

## Limites connues

- La diffusion est en mémoire : avec plusieurs instances de l'API, un abonné ne reçoit que les écritures
  de son instance. Il faudrait un mécanisme partagé de diffusion.
- Une modification faite directement dans MongoDB (hors API) n'émet aucun événement ; seule la relecture
  de secours la rattrape.
- Pas d'authentification : le flux est public, d'où l'absence de toute donnée de réservation.

## Vérification

`ci/test.sh` vérifie le contrat HTTP et le flux à travers nginx, puis `ci/e2e.mjs` rejoue le TP dans
Chrome : deux onglets synchronisés sans navigation, confirmation seulement dans l'onglet qui réserve,
troisième onglet à jour à sa connexion, fermeture d'un abonné, une seule connexion après plusieurs
rechargements, redémarrage de l'API avec reconnexion et données conservées.
