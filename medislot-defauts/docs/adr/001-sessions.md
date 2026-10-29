# Sessions de même origine

Statut : choix pédagogique implémenté dans la correction.

## Décision

La session conserve l’identité côté serveur. Le cookie HttpOnly accompagne les requêtes et SSE. Spring fournit un jeton CSRF que le front relit après connexion et déconnexion.

## Conséquences et alternatives

Un JWT signé convient à d’autres frontières, mais impose stockage, expiration, renouvellement et révocation. CORS ne remplace aucune autorisation.

## Vérification

Rejouer les tests et observer le parcours correspondant avant de proposer un changement.
