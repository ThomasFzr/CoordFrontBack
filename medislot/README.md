# MediSlot — application de référence

Application pédagogique Java 25 LTS, Spring Boot 4.1.1, Vue 3, TypeScript, Pinia et PostgreSQL 18. Interface de recherche inspirée des parcours de réservation Doctolib, sous l’identité propre MediSlot. Praticiens et utilisateurs fictifs.

## Démarrer en une commande

Installer Docker Desktop (ou Docker Engine + Compose), ouvrir ce dossier et exécuter :

```sh
docker compose up -d --build
```

Ouvrir http://localhost:8088. Le premier démarrage télécharge les images et dépendances. Vérifier `docker compose ps` puis `docker compose logs backend` si nécessaire.

Compte : `patient@medislot.test` / `MediSlot-demo-2026!`.
Second patient : `autre@medislot.test`, même mot de passe. On peut aussi créer un compte depuis l’interface.

Le navigateur passe par Nginx. `/api` rejoint Spring. PostgreSQL utilise un volume persistant. Les disponibilités fictives couvrent les dix jours suivant la première initialisation. Pour des sessions de formation ultérieures, renouveler les créneaux en base ou utiliser un nouveau nom de projet Compose avec `docker compose -p medislot-nouvelle-session up -d --build` après avoir arrêté l’ancien projet. Ne pas effacer un volume contenant un travail à conserver.

## Parcours disponibles

- Recherche par praticien, spécialité et ville, avec pagination.
- Fiches de praticiens et créneaux dans le fuseau Europe/Paris.
- Inscription, connexion et déconnexion par session avec protection CSRF.
- Réservation, déplacement atomique et annulation.
- Contrôle du propriétaire de chaque rendez-vous.
- Historique des opérations et notifications persistantes.
- SSE public pour les disponibilités, SSE privé pour les notifications.
- Resynchronisation après reconnexion, fermeture des abonnements et heartbeat.

La gestion administrative des praticiens et de leurs horaires n’est pas une interface fournie : les données fictives sont initialisées dans `DemoData`. L’atelier d’extension propose ce besoin après le socle patient.

## Développer sans reconstruire les images

1. `docker compose up -d db`
2. Java 25 LTS et Maven 3.9 : dans `backend`, exécuter `mvn spring-boot:run` avec `DATABASE_URL=jdbc:postgresql://localhost:55432/medislot` et `PORT=18080`.
3. Node 24 LTS : dans `frontend`, exécuter `npm ci` puis `npm run dev`. Ouvrir http://127.0.0.1:5173.

Sous PowerShell, une variable se définit par exemple avec `$env:PORT='18080'`.

## Vérifier

```sh
mvn -f backend/pom.xml verify
cd frontend
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Docker doit fonctionner pour les tests PostgreSQL Testcontainers. Les tests bout en bout ciblent par défaut http://localhost:8088. Ils utilisent les données de démonstration et laissent un rendez-vous annulé comme preuve de leur parcours. Pour un autre serveur, définir `APP_URL`.

## GitHub Actions

Dans ce dépôt, MediSlot est un sous-dossier : sa CI est `.github/workflows/medislot.yml` à la racine du dépôt (jobs back, front et bout en bout, plus la vérification HTTP du test A/B). Elle ne se lance que si `medislot/` change. `release.yml` et Dependabot ne sont pas repris. `release.yml` relance la vérification puis construit des images téléchargeables à la demande si les tests réussissent. Les actions sont épinglées à des commits et Dependabot propose les mises à jour.

Les workflows n’ont pas été exécutés sur un dépôt GitHub distant pendant la fabrication du support. Les commandes de compilation, tests et Compose ont été exécutées localement. Le déploiement vers un hébergeur nécessite sa configuration et ses secrets. Paramétrer les règles de protection de `main`, les checks requis et les reviewers de l’environnement `staging` dans GitHub.

## Choix et limites

Le projet privilégie des fichiers courts et des responsabilités identifiables. Les entités JPA ont des champs publics pour rendre l’anatomie visible. Les contrôleurs transmettent des DTO. Certaines lectures de rendez-vous font plusieurs accès SQL : mesurer puis remplacer par une projection fait partie de l’atelier performance.

L’index unique partiel PostgreSQL et les verrous protègent la réservation. La création répétée renvoie un conflit, sans cache durable de clés d’idempotence. Le listener SSE est local au processus. La reconnexion relit l’état, sans rejeu historique. Une outbox et un bus partagé sont des approfondissements documentés.

Les comptes fictifs, HTTP local, données d’amorçage et mots de passe de base sont réservés à la formation. Avant toute exploitation réelle : terminer le durcissement, retirer l’amorçage, configurer les secrets, HTTPS et les cookies Secure, traiter la révocation SSE immédiate, les limites de connexions, le contrôle des tentatives, les sauvegardes et le contexte réglementaire. Aucune donnée réelle de santé ne doit être ajoutée au laboratoire.

## Test A/B du bouton de réservation

Expérience `bouton_reserver_v1` : « Réserver » (A) ou « Choisir ce créneau » (B) sous les créneaux de chaque praticien. Affectation stable par navigateur, exposition et conversions comptées une fois, indicateurs sur http://localhost:8088/api/ab/metrics. Arrêt sans perte de données avec `AB_ENABLED=false docker compose up -d backend`. Détails, fiche d'expérience et vérifications : `docs/ab-testing.md`.

## Repères

`docs/openapi.yaml` : contrat. `docs/architecture.md` : structure et flux. `docs/adr` : décisions. `docs/runbook.md` : diagnostic. `docs/TP.md` : progression et défis. `docs/diagrammes` : Mermaid et PlantUML. La racine de la formation contient les PowerPoint, sources, activités et livrets.
