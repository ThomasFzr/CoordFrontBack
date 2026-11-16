# DTO et contrat partagé

Statut : choix pédagogique implémenté dans la correction.

## Décision

OpenAPI décrit les routes et DTO. Les entités persistantes ne sont pas les réponses publiques.

## Conséquences et alternatives

Il faut maintenir mapping et contrat. Ajouter une propriété facultative peut être compatible ; renommer un champ demande une migration coordonnée.

## Vérification

Rejouer les tests et observer le parcours correspondant avant de proposer un changement.
