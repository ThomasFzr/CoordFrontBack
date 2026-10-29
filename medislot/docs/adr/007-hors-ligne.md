# Hors ligne : cache des lectures et file d'envoi des réservations

Statut : implémenté.

## Décision

Un service worker sert la coquille de l'application et, en secours, la dernière réponse réussie des
lectures utiles (praticiens, créneaux, rendez-vous). Une réservation demandée sans réseau est placée dans
une file sur l'appareil et envoyée au retour de la connexion ; seule la réponse du serveur la confirme.

## Conséquences et alternatives

Un créneau peut être pris pendant la coupure : le 409 est expliqué, et un 409 sur sa propre réservation
(réponse perdue) est reconnu comme une confirmation. Une clé d'idempotence durable côté serveur rendrait ce
cas plus simple. Les données personnelles en cache et la file sont effacées à la déconnexion. Background
Sync permettrait l'envoi page fermée, mais n'est pas disponible partout.

## Vérification

`docs/offline.md`, section « Vérifier ».
