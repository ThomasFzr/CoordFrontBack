# Test A/B : bouton de réservation

Expérience `bouton_reserver_v1`. Une seule différence entre les versions : le texte du bouton placé sous
les créneaux de chaque praticien. Le style, la place, l'action (ouvrir la confirmation du premier créneau
libre) et les créneaux proposés sont identiques.

| Version | Libellé |
|---|---|
| A (référence) | Réserver |
| B | Choisir ce créneau |

## Fiche d'expérience

Écrite avant le lancement ; les deux dernières lignes se remplissent à la date de fin, pas avant.

| Élément | Valeur |
|---|---|
| Hypothèse | Si « Choisir ce créneau » remplace « Réserver » pour les patients qui voient des créneaux, le taux de navigateurs ayant une réservation confirmée augmente d'au moins 2 points, parce que le libellé décrit ce qui se passe au clic. |
| Métrique principale | `converted / exposed`, par navigateur (cookie `ab_visitor`). Une réservation confirmée par le serveur, pas un clic. |
| Garde-fous | Annulations sous 24 h ; refus « créneau indisponible » (409) ; temps d'affichage du bouton (affectation abandonnée au-delà de 800 ms) ; contrôle de répartition SRM (`srm.alert`). |
| Unité | Navigateur : identifiant opaque UUID, tiré au sort une fois, compté une fois. |
| Taille, durée | Taux actuel supposé 10 %, effet visé 2 points : n ≈ 16 × 0,09 / 0,02² = 3 600 navigateurs exposés par version, puis arrondi à des semaines entières (14 jours à 600 exposés par jour). |
| Règle de décision | Pas de SRM, garde-fous tenus, intervalle de confiance de l'écart entièrement au-dessus de 0 → déployer B ; IC étroit autour de 0 → garder A ; IC large → itérer avec une nouvelle clé. On ne regarde la métrique principale qu'à la date de fin. |
| Résultat | (à la date de fin) |
| Décision, leçon | (déployer, itérer ou abandonner, et pourquoi) |

Les essais du laboratoire démontrent le fonctionnement technique. Quelques visiteurs simulés ne permettent
pas de déclarer une version meilleure pour de vrais patients.

## Qui fait quoi

| Maillon | Où | Garantie |
|---|---|---|
| Affectation | `AbService.assign`, `GET /api/ab/assignment` | SHA-256 de `bouton_reserver_v1:<uuid>`, premier octet non signé : 0-127 → A, 128-255 → B. Ligne créée une fois (`ON CONFLICT DO NOTHING`) puis relue : une affectation existante n'est jamais recalculée. |
| Cookie | `AbController` | `ab_visitor`, UUID aléatoire, HttpOnly, SameSite=Lax, 390 jours, posé une seule fois et jamais prolongé ; réponse `Cache-Control: no-store`. Toute autre valeur est refusée. |
| Affichage | `stores/experiment.ts`, `ProfessionalCard.vue` | Squelette de la taille du bouton tant que la variante est inconnue (pas de A provisoire). Au-delà de 800 ms ou en cas d'erreur : A, hors mesure, sans nouvelle demande. |
| Exposition | `exposeIfAvailable`, `POST /api/ab/exposure` | Après le rendu Vue (`nextTick`), si au moins un bouton testé est dans la page. Le serveur écrit `exposed_at` par une seule mise à jour conditionnelle (`… AND exposed_at IS NULL`) : la première date est conservée, une redéclaration ne compte pas. |
| Conversion | `BookingService.book` → `AbService.attribute` | Dans la transaction de la réservation : rien n'est écrit si elle échoue (409). Attribuée seulement si le front envoie `X-AB-Measure: 1`, si le navigateur a été exposé dans les 24 h et si l'expérience est active. Une ligne par rendez-vous ; `converted` compte les navigateurs distincts. |
| Indicateurs | `GET /api/ab/metrics` | Par variante : `assigned`, `exposed`, `converted`, `bookings`, `rate` (null sans exposé). Contrôle SRM (khi-deux sur les exposés, alerte si p < 0,001) et comparaison B − A avec IC à 95 % et p-value. |
| Arrêt | `AB_ENABLED=false` | Tout le monde voit A au rechargement, aucun cookie, aucune affectation ni mesure ; les données déjà collectées restent consultables. |

## Conformité

- Le cookie `ab_visitor` est un traceur. Il est conçu pour l'exemption CNIL « mesure d'audience et A/B
  testing » : finalité limitée à ce test, identifiant aléatoire sans donnée patient, durée de 390 jours
  jamais prolongée, indicateurs agrégés. L'information des personnes et un moyen simple de s'opposer
  restent à ajouter avant un usage réel.
- Aucune donnée de santé dans la mesure : ni praticien, ni spécialité, ni motif. `ab_conversion` ne garde
  que l'identifiant du rendez-vous, nécessaire pour ne pas compter deux fois la même réservation. Ce
  rapprochement avec un patient connecté est la zone grise décrite dans le cours : le DPO tranche, et
  l'expérience passe sous consentement si l'exemption ne le couvre pas.
- Le groupe A reçoit le service actuel ; l'arrêt est immédiat sans redéploiement de code.

## Vérifier

```sh
mvn -f backend/pom.xml verify          # AbStatsTest (valeurs du cours), AbIntegrationTest (PostgreSQL)
cd frontend && npm test                # store d'expérience (secours, désactivation, une seule demande)
ci/ab-smoke.sh                         # TP étapes 2, 4, 5 au niveau HTTP, à travers Nginx
cd frontend && npm run test:e2e        # e2e/ab.spec.ts : libellés, stabilité, scintillement, secours, clavier
AB_ENABLED=false docker compose up -d backend && ci/ab-smoke.sh http://localhost:8088 --disabled
```
