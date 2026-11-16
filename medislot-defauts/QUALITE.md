# QUALITE.md · MediSlot à défauts sous SonarQube

## Contexte

- **Serveur :** SonarQube Community Build 26.10.0.133078, local (`sonarqube/compose.yaml` à la racine du dépôt), à l'adresse http://localhost:9000.
- **Profil :** « Sonar way core ». Mode MQR.
- **Projets :** `medislot-defauts-backend` et `medislot-defauts-frontend`.
- **Analyses :** toutes du 29/10/2026, heure de Paris.
- **Jeton :** un jeton d'analyse global, valable 7 jours, passé par la variable `SONAR_TOKEN`. Il n'apparaît dans aucun fichier du dépôt ni dans aucune commande.

## 1 · Les mesures (étapes 2 et 3)

« Overall Code ». Le nombre entre parenthèses est le nombre de problèmes ouverts.

| Projet | Analyse | Lignes | Sécu. | Fiab. | Maint. | Couverture | Dupl. | Porte |
|---|---|---|---|---|---|---|---|---|
| back | 1.0 · 16:09 | 943 | E (16) | E (23) | A (1) | 20,1 % (lignes 23,2 %, sur 419) | 9,9 % | Passed, mais aucune condition évaluée |
| front | 1.0 · 16:11 | 584 | D (4) | D (17) | A (5) | 3,2 % (lignes 3,1 %, sur 324) | 16,6 % | Passed, mais aucune condition évaluée |
| back | 1.2 · 16:16 | 940 | E (14) | E (23) | A (1) | 20,3 % | 9,9 % | Passed (`new_violations` = 0) |
| front | 1.2 · 16:16 | 598 | D (3) | C (13) | A (0) | 5,8 % | 16,2 % | Passed (`new_violations` = 0) |

Remarques :

- **Première analyse :** les deux portes sont vertes alors qu'il y a 60 problèmes ouverts. Tout le code est « ancien » et la porte ne juge que le nouveau code. C'est le piège décrit dans le cours.
- **Back :** 3 tests, dont 1 désactivé. `BookingIntegrationTest.anotherPatientCannotCancelAndCancellationKeepsHistory` porte `@Disabled`.
- **Front :** 1 test sauté. `api.test.ts:7`, « propage une panne réseau », est en `it.skip`. Sans le plugin Vue, Vitest exclurait les `.vue` de la couverture. Je l'ai ajouté dans `vitest.config.ts`, ce qui permet de mesurer les `.vue` : ils sont presque tous à 0 %.

## 2 · Les problèmes (étapes 4 et 5)

| # | Problème (fichier:ligne) | Règle, qualité, sévérité | Décision et raison | Preuve |
|---|---|---|---|---|
| 1 | `backend/…/api/DebugController.java:39` (clé AWS d'export en clair) | `secrets:S6290` et `java:S6418` · Sécurité · Blocker | **Corriger (back).** La clé secrète AWS était écrite dans le code, donc présente dans Git, dans les images et dans les sauvegardes. Je l'ai supprimée : elle ne servait que dans du code commenté, que j'ai retiré aussi. L'identifiant de clé vient maintenant de `medislot.export.aws-access-key-id`, alimenté par la variable `EXPORT_AWS_ACCESS_KEY_ID`. La clé reste dans l'historique Git : il faut la révoquer chez AWS. Elle est fictive ici. | Commit `c3887c7`. Analyse 1.1 de 16:13 : les deux règles sont *Closed / Fixed*. Problèmes ouverts du back : 39 → 37. Tests verts. |
| 2 | `frontend/src/components/AdminDebug.vue:27` (`eval(expression)`) | `typescript:S1523` · Sécurité High, Maintenabilité Low | **Corriger (front).** La « calculatrice de tarif » exécutait du JavaScript saisi par l'utilisateur. Elle utilise maintenant `calculerTarif()` (`services/tarif.ts`), qui n'accepte que « nombre opérateur nombre » et refuse tout le reste. Le cas est couvert par 3 tests unitaires. | Commit `319b2e3`. Analyse 1.1 de 16:14 : *Closed / Fixed*. Problèmes ouverts du front : 21 → 20. Couverture du nouveau code : 85,7 %. |
| 3 | `frontend/src/App.vue:50`, `:51`, `:52`, `:53` (`id="modal-title"` répété) | `Web:S7930` ×4 · Fiabilité High, Maintenabilité High | **Faux positif.** Les cinq `h2#modal-title` sont dans des branches `v-if` / `v-else-if` exclusives : un seul est rendu à la fois, et `aria-labelledby="modal-title"` en a besoin. La raison est écrite en commentaire de chaque problème. | Les 4 problèmes sont marqués *Resolved / False-positive*, chacun avec son commentaire. Problèmes ouverts du front : 20 → 16. |
| 4 | `backend/…/api/AppointmentExportController.java:53` (`a.patientId == patient`) | `java:S4973` · Fiabilité · Medium | **Corriger, pas encore fait (back).** Ce sont deux `Long` comparés par référence. Le résultat n'est vrai que pour les identifiants de −128 à 127, grâce au cache de `Long`. Au-delà, l'export CSV d'un patient revient vide. La correction est `a.patientId.equals(patient)`, avec un test au-delà de l'identifiant 127. | Corrigé : `patient.equals(a.patientId)`. Voir § 4. |
| 5 | `backend/…/security/SecurityConfig.java:23` (CSRF ignoré sur `/api/patients/**`, `/api/compte/**`, `/api/debug/**`…) | `java:S4502` · Sécurité · High | **Corriger, pas encore fait (back et contrat).** Ces routes s'appuient sur le cookie de session, mais elles acceptent les requêtes sans jeton CSRF. Un site tiers peut donc, au nom d'un patient connecté, modifier son profil, y compris son rôle et son mot de passe (`PUT /api/patients/{id}`). Il faut retirer ces exclusions et faire envoyer le jeton par le front, qui le fait déjà pour les autres routes. | Corrigé : plus aucune exclusion CSRF, le front passe par `api()`. Voir § 4. |
| + | `backend/…/api/DebugController.java:128-132` (`POST /api/debug/import`, lignes après la correction n° 1) | aucune règle levée | **Non vu par SonarQube.** La route lit un `ObjectInputStream.readObject()` directement sur le corps de la requête. Elle est publique (`permitAll`) et sans CSRF. C'est une désérialisation Java de données non fiables, qui peut aller jusqu'à l'exécution de code à distance. La Community Build ne fait pas de suivi des données (taint analysis), elle ne peut donc pas relier la requête à `readObject`. **Décision :** supprimer la route. | Constaté à la lecture du code. `DebugController` est supprimé en entier (§ 4). |

D'autres défauts ne sont signalés par aucune règle :

- `application.yml` expose tous les endpoints actuator (`include: "*"`) avec `show-values: ALWAYS`, et `/actuator/**` est en `permitAll`. `/actuator/env` affiche donc les mots de passe, sans connexion.
- `medislot.admin-password` et `medislot.jwt-secret` sont en clair dans `application.yml`.
- Le mot de passe administrateur est écrit en dur dans `DebugController.java:37`. Il l'est aussi dans le bundle front (`AdminDebug.vue:7`), où il est en plus recopié dans un cookie.
- `PUT /api/patients/{id}` modifie n'importe quel compte, rôle compris, sans vérifier que c'est le sien. `S4684` signale l'entité exposée, pas ce manque de contrôle.
- Les deux tests désactivés cachent justement des vérifications de propriétaire et de panne.

## 3 · La porte (étape 6)

- **Porte :** `MediSlot-TP`, copie de « Sonar way », associée aux deux projets. Ses conditions portent sur le nouveau code : `new_violations` > 0, `new_coverage` < 80 %, `new_duplicated_lines_density` > 3 %, `new_security_hotspots_reviewed` < 100 %.
- **Défaut ajouté exprès :** `if (nom == "*") nom = "";` dans `PractitionerSearchController.java:36`, non commité. Le nouveau code est compté depuis la version 1.1 (`PREVIOUS_VERSION`).
- **Verdict 1.2 avant (16:16:02) :** **Failed**. Condition `new_violations` = **1** (seuil : > 0), levée par `java:S4973` à la ligne 36. Avec `-Dsonar.qualitygate.wait=true`, la commande Maven échoue (`BUILD FAILURE`) : le pipeline serait rouge.
- **Verdict 1.2 après (16:16:35) :** **Passed**. Le défaut est retiré par `git checkout`, et `new_violations` = 0. Aucun seuil n'a été modifié et aucun problème n'a été marqué *Accepted*.
- **Bonus GitHub Actions : non fait.** Le serveur tourne sur ce poste, en `127.0.0.1:9000` : un runner hébergé par GitHub ne peut pas le joindre. Il faudrait un runner auto-hébergé sur ce poste, ou SonarQube Cloud avec un dépôt public. Exposer le SonarQube local sur Internet est exclu.

## 4 · Corrections de sécurité (après l'étape 6)

Tout ce qui précède décrit l'état analysé le 29/10/2026. Les corrections ci-dessous sont venues ensuite. **SonarQube n'a pas été relancé** : leur effet sur les mesures n'est pas mesuré.

**Vérifié le 16/11/2026 :**

- **Back :** `mvn test` dans `maven:3.9-eclipse-temurin-25` donne 9 tests, 0 échec. Le test ignoré est le `@Disabled` d'origine.
- **Front :** `vue-tsc` et Vitest sont verts.
- **Pile Docker démarrée :** Playwright passe 3 tests sur 3 (réservation, contrat, inscription).
- **Contrôles `curl` sur l'application :**
  - `/api/debug/*` n'existe plus.
  - `/actuator/env` et `/actuator/configprops` répondent 404.
  - Même réponse à « mot de passe oublié » pour un compte connu ou inconnu ; 403 sans jeton CSRF.
  - `next=//evil.example` redirige vers `/`.
  - La ville `lyon' OR '1'='1` ne renvoie rien.
  - Profil d'un autre : 403. `PUT` sans CSRF : 403. `role=ADMIN` est ignoré.
  - Fiche du rendez-vous d'un autre patient : 404.

| Problème | Correction | Vérification |
|---|---|---|
| `java:S2077`, recherche de praticiens (SQL concaténé) | Requête paramétrée (`?`). La regex du nom n'est plus exposée au ReDoS. | `searchUsesParametersNotConcatenatedSql` |
| `java:S4684`, et pas de contrôle du propriétaire sur `/api/patients/{id}` | Objets `Profil` et `ModificationProfil` : le rôle et le mot de passe ne sont plus modifiables. Le profil est lu et modifié par son seul propriétaire, sinon 403. Le nom du fichier avatar est réduit à son dernier segment (plus de `../`). | `profileIsADtoAndOnlyForItsOwner` |
| `java:S2245`, jeton de réinitialisation prévisible | 32 octets tirés avec `SecureRandom`. | `resetTokenIsUnpredictableSingleUseAndNeverReturned` |
| Jeton renvoyé dans la réponse (`lienDeTest`) et écrit dans le journal ; nouveau mot de passe journalisé et renvoyé ; message différent selon que l'adresse a un compte ou non | Réponse identique pour toute adresse, sans jeton ni lien. Jeton à usage unique, valable 15 min. 12 caractères minimum. Le journal ne contient plus que l'identifiant technique du compte. **Conséquence :** sans service d'e-mail, le parcours « mot de passe oublié » ne peut plus être mené de bout en bout en local. | même test |
| Redirection ouverte (`/api/compte/suite?next=`, `next` côté front) | Seuls les chemins internes sont suivis (`/…`, jamais `//…` ni une URL complète). | `redirectAfterLoginStaysInTheApp` |
| `java:S5443` et `java:S4973`, export CSV | Le CSV est construit en mémoire, sans fichier temporaire. `Long` est comparé avec `equals`. | `exportIsBuiltInMemoryForItsPatientOnly` |
| `GET /api/appointments/{id}/fiche` lisible par tout utilisateur connecté | Réservé au patient du rendez-vous, sinon 404. | même test |
| `java:S6437`, secrets dans le code et la configuration | Mot de passe de démo pris dans `DEMO_PASSWORD` ; `DEMO_SEED` vaut `false` par défaut. `admin-password` et `jwt-secret`, inutilisés, sont retirés d'`application.yml`. Ils restent dans l'historique Git : à faire tourner s'ils avaient été réels. | `demoDataRequiresAConfiguredPassword` |
| `java:S4502` et `java:S5122`, CSRF et CORS | Plus aucune exclusion CSRF. Le CORS ouvert à `*` avec cookies est retiré (même origine via Nginx). | relecture de `SecurityConfig` |
| Actuator ouvert (`/actuator/env`) | Seul `health` est exposé et public. | relecture d'`application.yml` |
| Désérialisation, mot de passe administrateur en dur, export des empreintes de mots de passe | `DebugController` est supprimé, avec ses appels côté front (`AdminDebug.vue`, `adminService.ts`). | — |
| XSS par `v-html` et `innerHTML` (`RecherchePraticien`, `MonProfil`, `Messagerie`) | Affichage en texte par l'interpolation de Vue. | `vue-tsc` et Vitest verts |
| Identifiants enregistrés en clair dans `localStorage` (`ConnexionAvancee.vue`) | Ligne supprimée. | relecture |
| `typescript:S5852` (ReDoS) et `typescript:S2245` | Regex de l'e-mail et de la ville réécrites sans répétition imbriquée. Référence tirée avec `crypto.randomUUID`. | relecture |

Restent ouverts : les en-têtes de sécurité HTTP, toujours désactivés (`headers(h -> h.disable())`) ; le profil recopié dans `localStorage` et l'identifiant `1` par défaut de `MonProfil.vue` ; le cookie de session sans `HttpOnly` (`server.servlet.session.cookie.http-only: false`).

## Rejouer les analyses

Dans un terminal où `SONAR_TOKEN` est chargé, sans écho, comme dans le cours (étape 4).

- **Back.** Commande lancée depuis la racine du dépôt, pour que SonarQube voie l'historique Git :

  ```
  docker run --rm --network sonarqube-local_default -v "$PWD":/repo -w /repo/medislot-defauts/backend \
    -v /var/run/docker.sock:/var/run/docker.sock -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
    -e SONAR_TOKEN maven:3.9-eclipse-temurin-25 mvn -B \
    org.jacoco:jacoco-maven-plugin:0.8.16:prepare-agent verify org.jacoco:jacoco-maven-plugin:0.8.16:report \
    org.sonarsource.scanner.maven:sonar-maven-plugin:5.8.0.7211:sonar \
    -Dsonar.host.url=http://sonarqube-local:9000 -Dsonar.projectKey=medislot-defauts-backend \
    -Dsonar.projectVersion=1.2 -Dsonar.qualitygate.wait=true
  ```

- **Front.** Commencer par `npx vitest run --coverage` dans `frontend/`. Ensuite, depuis la racine du dépôt :

  ```
  docker run --rm --network sonarqube-local_default -e SONAR_HOST_URL=http://sonarqube-local:9000 \
    -e SONAR_TOKEN -v "$PWD":/usr/src sonarsource/sonar-scanner-cli \
    -Dsonar.projectBaseDir=/usr/src/medislot-defauts/frontend -Dsonar.qualitygate.wait=true
  ```
