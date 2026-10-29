# Test A/B affecté par le serveur

Statut : implémenté pour l'expérience `bouton_reserver_v1`.

## Décision

Le serveur affecte la variante par hachage SHA-256 de la clé et d'un identifiant opaque, et la conserve en
base. Le front affiche la variante reçue et signale l'exposition ; il ne décide jamais de la variante et
n'envoie jamais la conversion. La conversion est écrite par le serveur dans la transaction de la
réservation. L'unité est le navigateur, car les créneaux sont visibles avant connexion.

## Conséquences et alternatives

Un patient sur deux appareils compte deux fois ; randomiser par compte ne mesurerait qu'après connexion.
Un outil tiers (GrowthBook, Unleash, PostHog) apporterait l'analyse séquentielle, au prix d'un échange de
données à encadrer. L'exposition est définie au rendu (et non à la visibilité réelle à l'écran) : même
définition pour A et B, mais elle surestime les personnes qui ont réellement lu le bouton.

## Vérification

`docs/ab-testing.md`, section « Vérifier ».
