# TRACES.md · Diagnostiquer MediSlot par les traces

## 0 · Point de départ

Le kit `Kit_TP_OpenTelemetry_depart.zip` n'était pas disponible. Le TP part donc de `MediSlot_application.zip`, la version d'origine de MediSlot, déjà importée dans `medislot/`. L'instrumentation a été écrite **à partir de zéro**, selon le cours (chapitres 3 à 6), et ne complète pas des TODO.

Ce que cela change :

- **Pas de bugs cachés.** Les ajouts du kit sont absents : passerelle SMS simulée, libellés d'historique, rendez-vous de démonstration.
  - T2 se reproduit sur ce code (§ 3).
  - T1 et T3 ne se reproduisent pas (§ 2 et § 4).
- **Pas de tests fournis.** `tests/verifier_traces.sh`, `frontend/e2e/trace.spec.ts` et `frontend/src/tracing.test.ts` ont été écrits ici, avec ce que l'énoncé demande à chacun de vérifier.
- **Tout a tourné le 16/11/2026** sur la pile Docker (OrbStack), back compilé et testé dans `maven:3.9-eclipse-temurin-25`. Les identifiants de trace ci-dessous sont des relevés réels dans Jaeger 2.23.0.

## 1 · L'instrumentation en place

| Maillon | Fichier | Ce qui est fait |
|---|---|---|
| Back · image | `backend/Dockerfile` | Agent Java 2.33.1 ajouté dans `/app` avec `ADD --chmod=644 --checksum=sha256:e43a270d…`. L'empreinte a été calculée sur le JAR téléchargé (26 507 624 octets). La JVM tourne sous l'utilisateur 10001. |
| Back · configuration | `compose.yaml` | `JAVA_TOOL_OPTIONS=-javaagent:…`, `OTEL_SERVICE_NAME=medislot-api`, `service.version=${GIT_SHA:-local}`, `deployment.environment.name=formation`, envoi OTLP/HTTP vers `collector:4318`, `parentbased_always_on`. Métriques et journaux sont coupés. |
| Back · span métier | `BookingService.book` | `@WithSpan("medislot.reservation")` avec `medislot.slot.id` (paramètre) et `medislot.appointment.id` (`Span.current()`, après l'enregistrement). |
| Back · référence | `observabilite/TraceIdHeaderFilter` | En-tête `X-Trace-Id` sur chaque réponse, y compris les réponses d'erreur (premier filtre de la chaîne). |
| Front · SDK | `frontend/src/tracing.ts`, appelé dans `main.ts` avant `createApp` | `TracerProvider` (`medislot-web`, `service.version` = `VITE_GIT_SHA`), `ParentBased(TraceIdRatioBased(1))`, `BatchSpanProcessor` vers `/otlp/v1/traces`, `StackContextManager`, `W3CTraceContextPropagator`, `FetchInstrumentation` (sans `/otlp/`). |
| Front · garde-fou | `SansRequeteProcessor` dans `tracing.ts` | Dans `onStart`, `url.full` (et l'ancien `http.url`) perd sa requête et son fragment. La saisie ne quitte pas le navigateur. |
| Front · message | `frontend/src/api.ts` | Une erreur affiche « … (réf. <trace-id>) » ; `ApiError.traceId` porte l'identifiant. |
| Nginx | `frontend/nginx.conf` | `location /otlp/` → `http://collector:4318/` : la barre finale retire `/otlp`. Seule la méthode `POST` est acceptée, corps limité à 1 Mo. |
| Collecteur | `observabilite/collector.yaml` (0.165.0) | Récepteur `otlp` HTTP sur `0.0.0.0:4318`. Pipeline `traces` : `memory_limiter` → `attributes/sante` (supprime `url.query`, `enduser.id`, `user.email`, `user.name`) → `transform/sante` (coupe la requête de `url.full`) → `batch`. Sortie vers `otlp_grpc/jaeger` et `debug`. |
| Jaeger | `compose.yaml` (2.23.0) | Interface sur `127.0.0.1:16686` uniquement, car Jaeger n'a pas d'authentification. Le collecteur ne publie aucun port. |

Versions npm (épinglées) : `@opentelemetry/api` 1.10.0 · `sdk-trace`, `core`, `resources` 3.1.1 · `instrumentation`, `instrumentation-fetch`, `exporter-trace-otlp-http` 0.301.2 · `semantic-conventions` 1.45.0 · `happy-dom` 21.0.4 (tests). Le JavaScript construit fait **160,32 Ko, 57,15 Ko compressé** (`npm run build`), soit les 160 Ko annoncés par le cours.

Pour démarrer : `export GIT_SHA=$(git rev-parse --short HEAD) && docker compose up -d --build`. Le projet Compose s'appelle `medislot-otel` : arrêtez d'abord le MediSlot du module, qui occupe aussi le port 8088.

### Relevés de mise en route

- `docker compose logs backend` : `opentelemetry-javaagent - version: 2.33.1`, puis `Started MedislotApplication in 4.639 seconds`. Le build de l'image a vérifié l'empreinte de l'agent.
- Collecteur : `Everything is ready. Begin running and processing data.` La configuration est acceptée, y compris `transform/sante`.
- Jaeger (`/api/v3/services`) : `medislot-api`, `medislot-web`, `jaeger`. Attention : l'ancien `/api/services` répond 404 en Jaeger 2.
- Cascade d'une recherche, comme dans le cours : `medislot-web · GET` → `medislot-api · GET /api/professionals` (126 ms, premier appel) → `ProfessionalRepository.search` → `SELECT fr.medislot.domain.Professional` → `SELECT medislot.professional`.
- `X-Trace-Id` : renvoyé sur une réponse 200 (`GET /api/appointments`) et sur une réponse 404 (`GET /api/appointments/999999/history`). Il est égal au trace-id du `traceparent` envoyé.
- Saisie : trace `660948398a1d21b9613e26c5f0efc89a` de `GET /api/professionals?q=dermatologie&city=Lyon`. Jaeger ne garde que `http.route` et `url.path = /api/professionals`. « dermatologie » n'apparaît nulle part, et `url.query` est absent.

## 2 · T1 · « Confirmer un rendez-vous prend plus d'une seconde »

**Non reproductible sur ce code.** Dans le kit, la confirmation appelle une passerelle SMS simulée (`sms-passerelle`), absente de `MediSlot_application`. Ici, `BookingService.book` n'appelle aucun service externe.

Procédure à suivre sur le kit, ou pour vérifier ici que rien n'est lent :

- Recherche Jaeger : service `medislot-api`, opération `POST /api/appointments`, durée min. `500ms`.
- Preuve attendue : sous `medislot.reservation`, un span **client** (`java-httpclient`) dont `server.address` désigne le service appelé, et qui porte l'essentiel de la durée.
- Identifiant de trace : sans objet ici (pas de service appelé à la confirmation). La trace `91cda3e2ab646eb754cc5542481ab381` le confirme : sous `medislot.reservation`, uniquement des spans SQL.

## 3 · T2 · « Mes rendez-vous sollicite la base bien plus que prévu »

**Présent dans ce code.** Lu dans le code, ce qui n'a rien d'une preuve de trace : ce n'est qu'une prédiction à confirmer dans Jaeger.

- `AppointmentController.list` charge les rendez-vous du patient, puis appelle `dto(a)` pour **chacun**.
- `dto` fait `slots.findById(a.slotId)` et `professionals.findById(s.professionalId)`.
- Pour N rendez-vous : **1 + 2N** requêtes SQL. C'est le problème N+1.

Relevé dans Jaeger, ce qui en fait cette fois une preuve :

- Recherche : service `medislot-api`, opération `GET /api/appointments`, en `patient@medislot.test` après six réservations. Le patient a 7 rendez-vous, dont celui, annulé, du test Playwright de réservation.
- Identifiant de trace : **`f066fbecdbf77d55997a534dcce94941`**.
- Preuve : 63 spans au total, dont 18 `SELECT`. On compte `SELECT medislot.appointment` ×1, puis **`SELECT medislot.slot` ×7** et **`SELECT medislot.professional` ×7**, en alternance, plus l'identification de l'utilisateur. Soit exactement 1 + 2 × 7.
- Durée du span serveur : **10,7 ms**. Les 18 `SELECT` cumulent 3,1 ms.

**Pourquoi la durée ne le montre presque pas.** Chaque requête est rapide et la base est locale. Avec quelques rendez-vous, le total reste sous quelques dizaines de millisecondes. Le défaut est le **nombre** d'allers-retours, qui croît avec l'historique du patient, pas la durée d'un appel. D'où la consigne : compter les barres, pas seulement les mesurer.

**Coupable.** Maillon Spring, puis la base par ricochet : `fr.medislot.api.AppointmentController#list`, via `dto(Appointment)`.

**Piste (équipe back).** Une seule requête avec jointures (projection JPQL `appointment ⋈ slot ⋈ professional` vers `AppointmentDto`), ou deux requêtes `findAllById` sur les créneaux et les praticiens, réunies en mémoire. Ensuite, rejouer le parcours : la nouvelle trace doit montrer 1 à 3 spans SQL, quel que soit le nombre de rendez-vous.

## 4 · T3 · « L'historique de certains rendez-vous affiche “Le service est momentanément indisponible” »

**Non reproductible sur ce code.** Dans le kit, ce sont les libellés d'historique ajoutés qui échouent, et seulement pour certains rendez-vous. Ici, `GET /api/appointments/{id}/history` renvoie l'action brute, sans libellé.

Ce qui est prêt pour l'enquête, et vérifié : en cas d'erreur, le message du front affiche maintenant « (réf. <trace-id>) ». Dans Jaeger, champ « Lookup by Trace ID », on colle cette référence. Le span serveur est en `error=true`, et son événement `exception` donne `exception.type`, `exception.message` et la ligne dans `exception.stacktrace`.

- Identifiant de trace : sans objet ici (pas de libellés d'historique). La trace d'erreur `68879fcb14e9a61f59d71b4c8be390ed` (404 sur un rendez-vous inexistant) montre le chemin : référence affichée, puis « Lookup by Trace ID ». Un 4xx ne met pas le span serveur en erreur.

## 5 · Span métier et données de santé

`medislot.reservation` porte `medislot.slot.id` et `medislot.appointment.id`. Relevé : trace `91cda3e2ab646eb754cc5542481ab381`, six réservations, chaque `medislot.reservation` enfant de `POST /api/appointments`, par exemple `{medislot.slot.id: 1, medislot.appointment.id: 2}`. Aucune occurrence de `medislot.test` dans la trace. Ce sont deux identifiants techniques : ils suffisent pour retrouver le créneau et le rendez-vous en base, et ne disent rien à qui n'a pas accès à la base.

**Le paramètre `email` de `book` serait-il utile ?** Il permettrait de chercher les traces d'un patient. Mais rattaché à un rendez-vous chez un praticien d'une spécialité donnée, il devient une donnée de santé (RGPD, art. 4.15 et 9). Il serait copié dans le collecteur, dans Jaeger et dans les tickets. L'identifiant du rendez-vous mène au même patient, pour qui a accès à la base. `email` n'est donc pas annoté.

Garde-fous en série :

1. **Code :** seulement des identifiants.
2. **Navigateur :** `SansRequeteProcessor` retire la saisie de l'URL.
3. **Collecteur :** `attributes/sante` et `transform/sante`.

Côté SQL, l'agent remplace les valeurs par `?` dans `db.statement`.

## 6 · Sorties des tests

### `npm test` (frontend/)

```
> medislot@1.0.0 test
> vitest run
 RUN  v4.1.11 /Users/thomasfoltzer/Documents/Development/m2/CoordFrontBack/medislot-otel/frontend
 Test Files  2 passed (2)
      Tests  9 passed (9)
   Start at  10:21:02
   Duration  1.41s (transform 27ms, setup 0ms, import 63ms, tests 1.24s, environment 87ms)
```

Ce que couvre `tracing.test.ts` :

- un `traceparent` W3C échantillonné ;
- le `parent-id` de l'en-tête est le span fetch du navigateur ;
- aucune saisie dans `url.full` ;
- l'envoi vers `/otlp/` n'est pas tracé ;
- la fonction `sansRequete`.

`api.test.ts` vérifie aussi la référence « (réf. … ) » tirée de `X-Trace-Id`.

### `bash tests/verifier_traces.sh`

```
OK     1. Jaeger connaît le service medislot-api
OK     2. Trace 1d49ab64b05315f2af9e00e33527c50c : span serveur du back, enfant du traceparent reçu, avec ses requêtes SQL
OK     3. /otlp/ relaie vers le collecteur : medislot-web et medislot-api partagent la trace 1d49ab64b05315f2af9e00e33527c50c
Bilan : 3 OK, 0 ÉCHEC
```

### `npx playwright test e2e/trace.spec.ts`

```
Running 1 test using 1 worker
  ✓  1 e2e/trace.spec.ts:21:1 › une recherche produit une trace front puis back (6.6s)
  1 passed (7.2s)
```

Les trois tests de bout en bout d'origine (`booking`, `contract`, `registration`) passent aussi avec l'instrumentation : 4 passed.
