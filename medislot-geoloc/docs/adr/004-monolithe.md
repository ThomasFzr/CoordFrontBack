# Un déploiement pour le métier

Statut : choix pédagogique implémenté dans la correction.

## Décision

Un monolithe Spring conserve des transactions locales et permet de comprendre les frontières avant une distribution.

## Conséquences et alternatives

Les microservices imposent des coûts réseau, contrats distribués, exploitation et cohérence éventuelle. Le volume de classes ne justifie pas ce choix.

## Vérification

Rejouer les tests et observer le parcours correspondant avant de proposer un changement.
