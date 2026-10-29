# Verrou et unicité pour réserver

Statut : choix pédagogique implémenté dans la correction.

## Décision

Le service verrouille le créneau dans sa transaction. L’index unique partiel sur les rendez-vous confirmés protège aussi la base.

## Conséquences et alternatives

Le verrou augmente l’attente sur un créneau disputé. Une stratégie optimiste ou une écriture conditionnelle peuvent aussi convenir, à tester en concurrence.

## Vérification

Rejouer les tests et observer le parcours correspondant avant de proposer un changement.
