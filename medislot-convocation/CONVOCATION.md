# CONVOCATION.md — Télécharger sa convocation en PDF

TP « Génération de documents » (module Coordination Front & Back). Sur « Mes rendez-vous », chaque
rendez-vous confirmé propose **Ma convocation (PDF)** et **Enregistrer**. Le PDF est fabriqué par Spring,
protégé par l'endpoint, récupéré et affiché par Vue, et ce qui est imprimé est vérifié par des tests.

> **Point de départ.** Le kit `Kit_TP_Generation_de_documents_depart.zip` n'était pas disponible. Je suis
> parti de `MediSlot_application.zip` (version d'origine, comme pour le TP OpenTelemetry) et j'ai écrit
> tout ce que le kit devait fournir ou faire compléter : service, contrôleur, modèle de vue, formats,
> moteur, modèle HTML, polices, `convocation.ts`, bouton, et les tests (mêmes noms et mêmes nombres que
> ceux annoncés par le cours : 6 + 6 + 4 côté back, 12 côté front). Les rôles « front » et « back » n'ont
> donc pas été tenus par deux personnes : la relecture croisée de l'étape 6 reste à faire en binôme.

Données fictives uniquement (comptes et praticiens de démonstration). Aucune ordonnance n'est produite.

---

## §1 · Le contrat du téléchargement

Écrit avant le code, et reporté dans [`docs/openapi.yaml`](docs/openapi.yaml)
(route `/appointments/{id}/convocation.pdf`, ajout seul : 109 lignes, rien d'autre modifié).

| Élément | Valeur |
|---|---|
| Requête | `GET /api/appointments/{id}/convocation.pdf` — session (cookie `HttpOnly`, `SameSite=Lax`), pas de CSRF : un GET ne modifie rien |
| Option | `?download=true` : enregistrer au lieu d'afficher |
| `Accept` envoyé par le front | `application/pdf, application/problem+json` |
| Succès | `200`, corps PDF |
| `Content-Type` | `application/pdf` |
| `Content-Disposition` | `inline; filename="convocation-rdv-{id}.pdf"` (défaut) · `attachment; …` avec `download=true` |
| `Cache-Control` | `no-store` (ni le navigateur ni un proxy ne gardent de copie, poste partagé compris) |
| `Content-Length` | taille exacte du PDF |
| Droits | le rendez-vous doit appartenir au patient connecté **et** être `CONFIRMED` ; contrôlé côté serveur à chaque requête, **avant** de fabriquer |

| Code | Quand | Corps | Ce que le front affiche (`role="alert"`) |
|---|---|---|---|
| 401 | Pas de session | `application/problem+json` | « Votre session a expiré. Reconnectez-vous. » |
| 404 | Rendez-vous inexistant **ou d'un autre patient** (jamais 403 : on n'avoue pas qu'il existe) | ProblemDetail `Rendez-vous introuvable.` | « Ce rendez-vous est introuvable. » |
| 409 | Rendez-vous annulé | ProblemDetail `Ce rendez-vous est annulé : il n’a plus de convocation.` | « Ce rendez-vous est annulé : il n’a plus de convocation. » |
| 500 | Le moteur PDF a échoué | ProblemDetail `La convocation n’a pas pu être générée. Réessayez dans un instant.` | le `detail` du ProblemDetail |
| — | Réseau coupé | — | « Connexion impossible. Vérifiez le réseau puis réessayez. » |
| 200 non PDF | ex. page HTML d'un proxy | — | « La convocation n’a pas pu être préparée. Réessayez dans un instant. » |

Rien de médical dans l'URL ni dans le nom de fichier : seulement le numéro du rendez-vous, qui ne donne
rien sans la session qui autorise à le lire. Ni nom, ni spécialité, ni date (ils finiraient dans
l'historique, les journaux nginx et le dossier « Téléchargements »).

## §2 · Où le PDF est fabriqué, et pourquoi

**Côté serveur (Thymeleaf + Open HTML to PDF, dans le processus Spring).** La convocation *fait foi* : le
patient se présente à l'heure imprimée, il faut donc un seul rendu, versionné avec le back, identique pour
le patient, le cabinet et l'archive, avec une police embarquée plutôt que celles du poste. Elle contient
des données de santé (praticien, spécialité) : elles restent sur le serveur, qui n'envoie que le PDF du
patient autorisé. Coût mesuré : ~20 ms et ~25 Ko par convocation, pas besoin d'asynchrone (chapitre 5).

Bibliothèques vérifiées sur la pile avant de les ajouter (`backend/pom.xml`) :

| Composant | Version | Constat |
|---|---|---|
| Spring Boot · Java | 4.1.1 · 25 | inchangés |
| `spring-boot-starter-thymeleaf` | géré par Boot → Thymeleaf 3.1.5 (`thymeleaf-spring6`) | SpEL, `th:text` échappe |
| `io.github.openhtmltopdf:openhtmltopdf-pdfbox` | 1.1.113 | groupe maintenu (pas l'ancien `com.openhtmltopdf`, arrêté en 1.0.10) |
| Apache PDFBox | 3.0.8 (amené par le moteur) | sert aussi aux tests (`Loader`, `PDFTextStripper`) |
| DejaVu Sans / Sans Bold | 2.37 | `resources/fonts`, licence Bitstream Vera + domaine public (`LICENSE-DejaVu.txt`) ; archive officielle vérifiée par SHA-256 `fa9ca4d1…846e17d7` |

## §3 · Ce qui est imprimé : modèle, police, fuseau

Répartition :

- **Modèle de vue** [`ConvocationView`](backend/src/main/java/fr/medislot/document/ConvocationView.java) :
  la liste des cases, uniquement des chaînes prêtes à afficher (`reference`, `patientName`,
  `professionalName`, `specialty` déjà traduite, `address`, `city`, `day`, `time`, `issuedOn`).
- **Modèle HTML** [`templates/convocation.html`](backend/src/main/resources/templates/convocation.html) :
  `lang="fr"`, `<title>Convocation RDV-n</title>`, `@page { size: A4 }`, pied « MediSlot · page n sur m »,
  `font-family: 'DejaVu Sans'` partout, CSS 2.1 sans flex ni grid, **uniquement des `th:text`**, aucun calcul.
- **Formats** [`ConvocationFormats`](backend/src/main/java/fr/medislot/document/ConvocationFormats.java) :
  jour, heure, date d'émission et libellé de spécialité, en `Europe/Paris` écrit dans le code.
- **Moteur** [`PdfRenderer`](backend/src/main/java/fr/medislot/document/PdfRenderer.java) : les deux
  polices embarquées (sous-ensemble), `usePdfUaAccessibility(true)` (PDF balisé), journaux du moteur
  ramenés à WARNING, échec → 500 avec un message neutre (aucune donnée du patient dans le journal).

**Le bug du fuseau, en une phrase.** Le formateur d'heure était réglé sur `ZoneOffset.UTC` au lieu de
`Europe/Paris` : l'instant stocké en UTC était imprimé tel quel, d'où « 8 h 30 » pour un rendez-vous de
9 h 30 en hiver (et « 7 h 30 » en été), exactement la scène de mardi 8 h 25. Reproduit avant correction :

```
[ERROR]   ConvocationServiceTest.heureDeParisEnEte:115 expected: <9 h 30> but was: <7 h 30>
[ERROR]   ConvocationServiceTest.heureDeParisEnHiver:107 expected: <9 h 30> but was: <8 h 30>
```

Correction : `.withZone(PARIS)`. Le conteneur du back tourne en UTC (`date` → `Mon Nov 16 10:42:43 AM UTC 2026`,
`TZ` non défini) et imprime pourtant la bonne heure : le fuseau est dans le code, pas dans le serveur.

**La police.** Sans les deux `font(...)`, le mode accessible refuse le texte :
`FontNotFoundException: No font for the following specification has been found: … families: [DejaVu Sans]`,
transformé en `500 "La convocation n’a pas pu être générée…"` (vérifié en commentant les deux lignes, puis restauré).

**Épreuve relue comme un patient** (`backend/target/convocation-exemple.pdf`, produit par
`ConvocationPdfTest`) : une page A4, « Bonjour **Hélène Durand**, votre rendez-vous est confirmé. »,
« **mardi 24 novembre 2026 à 9 h 30** (heure de Paris) », praticien, spécialité, adresse, consignes,
pied « MediSlot · page 1 sur 1 ».

## §4 · Intégration et preuves sur l'application qui tourne

Pile complète : `docker compose -p medislot-convocation up -d --build`, puis http://localhost:8088.

### Clic réel (Playwright, `frontend/e2e/convocation.spec.ts`)

| Parcours | Résultat |
|---|---|
| Connexion `patient@medislot.test`, réservation, « Mes rendez-vous », **Ma convocation (PDF)** | un onglet s'ouvre au clic et reçoit l'URL `blob:` ; aucune alerte |
| **Enregistrer** | téléchargement nommé `convocation-rdv-{id}.pdf` (le nom proposé par le serveur) |
| Rendez-vous annulé « dans un autre onglet » (API, flux SSE coupé pour que la liste ne se rafraîchisse pas), puis clic | phrase « Ce rendez-vous est annulé : il n’a plus de convocation. » dans la carte, l'onglet vide est refermé |

```
$ npx playwright test                       # Chromium headless shell
  5 passed (3.3s)
$ PW_CHANNEL=chromium npx playwright test   # nouveau headless, avec visionneuse PDF
  5 passed (4.0s)
```

Observation : le Chromium « headless shell » n'a pas de visionneuse PDF ; l'onglet reçoit bien le `blob:`
mais le navigateur le télécharge au lieu de l'afficher (nom aléatoire, puisque c'est une URL `blob:`). Le
nouveau headless l'affiche (`chrome-extension://…/index.html` puis `blob:http://localhost:8088/…`). Le test
accepte les deux issues ; c'est aussi pourquoi le bouton **Enregistrer** existe, avec le nom du serveur.

### En-têtes et codes (`tests/preuves_convocation.sh`, curl à travers nginx)

```
== Rendez-vous 19 réservé, créneau 62, startsAt (UTC, API) = 2026-11-17T09:00:00Z
   Heure de Paris attendue sur le PDF : 10 h 00

== 1. Propriétaire, affichage : curl -D - http://localhost:8088/api/appointments/19/convocation.pdf
HTTP/1.1 200
Content-Type: application/pdf
Content-Length: 24872
Content-Disposition: inline; filename="convocation-rdv-19.pdf"
Cache-Control: no-store
X-Content-Type-Options: nosniff
   Corps : %PDF-1.6 … 24872 octets

== 2. Propriétaire, enregistrement : ?download=true
HTTP/1.1 200
Content-Disposition: attachment; filename="convocation-rdv-19.pdf"

== 3. Second patient, même numéro
HTTP/1.1 404
Content-Type: application/problem+json
{"detail":"Rendez-vous introuvable.","instance":"/api/appointments/19/convocation.pdf","status":404,"title":"Not Found"}

== 4. Sans session
HTTP/1.1 401
Content-Type: application/problem+json;charset=ISO-8859-1
{"title":"Connexion requise","status":401}

== 5. Après annulation par le propriétaire
HTTP/1.1 409
Content-Type: application/problem+json
{"detail":"Ce rendez-vous est annulé : il n’a plus de convocation.","instance":"/api/appointments/19/convocation.pdf","status":409,"title":"Conflict"}
```

### Même heure que la liste « Mes rendez-vous »

Premier rendez-vous de la session (`startsAt` = `2026-11-17T08:00:00Z`) : la liste affiche **09:00**
(`Intl.DateTimeFormat`, `timeZone: 'Europe/Paris'`, `types.ts`) et le PDF servi par la pile, relu,
imprime « **mardi 17 novembre 2026 à 9 h 00** (heure de Paris) », « Bonjour Camille Dupont ».

### Durée de génération

Dix appels successifs sur la pile locale (à chaud, à travers nginx) : 19 à 29 ms (`curl -w %{time_total}`).
Rien qui justifie une génération asynchrone pour une page (voir §5).

### Question de l'étape 2 : quel cas réel imite « refuse une réponse 200 qui n'est pas un PDF » ?

Une réponse `200` en `text/html` : la page de connexion d'un proxy d'entreprise ou d'un portail Wi-Fi,
ou, dans MediSlot même, le repli SPA de nginx (`try_files … /index.html`) si l'URL perd son préfixe `/api` :

```
$ curl -s -D - -o /dev/null localhost:8088/appointments/19/convocation.pdf
HTTP/1.1 200 OK
Content-Type: text/html
```

Sans le contrôle du `Content-Type`, le front ouvrirait ou enregistrerait cette page HTML sous un nom en `.pdf`.

## §5 · Défi : le contrat d'un document long (récapitulatif annuel)

Besoin imaginé : un récapitulatif de cent rendez-vous, trop long pour une requête (le délai de nginx est
`proxy_read_timeout 150s`). Contrat en trois appels, sans code :

| # | Appel | Requête | Réponses |
|---|---|---|---|
| 1 | **Commander** | `POST /api/me/summaries` + en-tête CSRF (il crée une tâche), corps `{ "year": 2026 }` | `202 Accepted`, `Location: /api/me/summaries/{jobId}`, corps `{ "id", "status": "PENDING" }` · si une tâche identique est déjà `PENDING`/`RUNNING` ou `DONE` non expirée : `202` vers **la même** tâche (double clic = une seule génération) · `400` année invalide · `401` · `429` + `Retry-After` au-delà de 3 commandes par heure |
| 2 | **Suivre** | `GET /api/me/summaries/{jobId}` | `200` `{ "status": "PENDING" \| "RUNNING" \| "DONE" \| "FAILED", "progress": 0-100, "expiresAt"? }`, `Cache-Control: no-store`, `Retry-After: 2` tant que non terminé · `404` si inconnue, d'un autre patient ou expirée |
| 3 | **Télécharger** | `GET /api/me/summaries/{jobId}/file[?download=true]` | mêmes en-têtes que la convocation : `200 application/pdf`, `Content-Disposition` avec `recapitulatif-{jobId}.pdf` (ni nom ni année de soins dans le nom), `no-store` · `409` si pas encore `DONE` · `404` comme ci-dessus · `410 Gone` si le fichier a été purgé |

**Qui protège quoi.**

- **CSRF** : seul le `POST` modifie (il crée une tâche) ; il exige le jeton. Les `GET` ne modifient rien.
- **Propriétaire** : la tâche enregistre `patient_id` ; chaque appel (suivre, télécharger) le compare au
  patient connecté et répond `404` sinon. Le numéro de tâche seul ne donne aucun accès (identifiant
  aléatoire de préférence, mais la vraie protection reste le contrôle serveur).
- **Durée de vie** : fichier conservé 24 h après `DONE` (`expiresAt`), puis purge planifiée du fichier et
  de la ligne ; tâches en base pour survivre à un redémarrage ; `FAILED` relançable par une nouvelle commande.

**Côté front.** Bouton désactivé dès le clic ; suivi toutes les **2 s** (ou la valeur de `Retry-After`),
« Préparation… n % » annoncé dans une zone `role="status"` ; on abandonne après **60 tentatives (2 min)**
avec « Le document prend du retard : vous le retrouverez dans votre espace », ou dès `FAILED` (message +
bouton « Réessayer »), et on arrête la boucle si le patient quitte la page. Le téléchargement final suit le
chapitre 3 (fetch, `ok` et `Content-Type`, blob, révocation). Alternative au suivi : un événement
`summary-ready` sur le flux SSE privé `/api/notifications/events`, déjà présent dans MediSlot.

## §6 · Vérification finale

Depuis un terminal propre (le back via l'image `maven:3.9-eclipse-temurin-25`, faute de JDK local ;
Docker monté pour Testcontainers) :

```
$ ./mvnw test        # équivalent : docker run … maven:3.9-eclipse-temurin-25 mvn -B test
Tests run: 6  … ConvocationServiceTest
Tests run: 6  … ConvocationPdfTest
Tests run: 1  … BookingServiceTest
Tests run: 4  … ConvocationControllerTest
Tests run: 2  … BookingIntegrationTest
Tests run: 19, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS

$ npm test
 Test Files  2 passed (2)
      Tests  15 passed (15)        # 12 convocation.test.ts + 3 api.test.ts
$ npx vue-tsc --noEmit             # aucune erreur
$ npx playwright test              # 5 passed (dont 2 convocation)
```

Ce que chaque niveau attrape (chapitre 6) :

| Niveau | Tests | Attrape |
|---|---|---|
| 1 · le PDF | `ConvocationPdfTest` : texte, accents (« Hélène Durand »), 1 page A4 595×842, polices toutes embarquées (DejaVuSans), balisé (`StructureTreeRoot`, `MarkInfo`), `lang=fr`, titre, échappement de `<b>…</b> & Cie` | « H?l?ne », page Letter, PDF non balisé, injection HTML |
| 2 · les règles | `ConvocationServiceTest` : propriétaire, autre patient 404 **sans rendu**, inexistant 404, annulé 409 sans rendu, 9 h 30 hiver, 9 h 30 été | 8 h 30 au lieu de 9 h 30, PDF d'un autre patient |
| 3 · le contrat HTTP | `ConvocationControllerTest` (MockMvc) + `convocation.test.ts` (Vitest, faux `browser`) | en-têtes oubliés, JSON enregistré en `.pdf`, onglet vide, URL `blob:` jamais libérée |
| 4 · l'application | `tests/preuves_convocation.sh`, `e2e/convocation.spec.ts` | nginx, cookie, polices et fuseau du conteneur |

Le piège de l'étape 3 est couvert : en déplaçant `browser.openTab()` après `await`, les tests « ouvre
l'onglet avant l'attente… » et « referme l'onglet vide… » passent au rouge (`2 failed | 10 passed`),
vérifié puis restauré.

### Auto-vérification

- [x] Le nom de fichier ne contient ni nom, ni spécialité, ni date : `convocation-rdv-19.pdf`.
- [x] Un autre patient reçoit 404, pas 403, et aucun PDF n'est fabriqué pour lui (`verifyNoInteractions(renderer)`).
- [x] L'heure imprimée est juste en hiver comme en été (`2026-11-24T08:30Z` et `2026-07-07T07:30Z` → « 9 h 30 »).
- [x] Le PDF contient « Hélène Durand » au test, avec sa police embarquée.
- [x] Une erreur affiche une phrase, jamais du JSON ni un onglet vide (unitaire + Playwright).
- [x] Chaque affirmation du §4 a sa commande ou sa sortie collée.
- [ ] Relecture croisée front / back par le binôme (à faire : TP réalisé seul, voir l'encadré en tête).

### Limites connues

- PDF balisé et testé (arbre de structure, langue, titre), mais **pas validé** par un outil PDF/UA dédié
  (PAC, veraPDF) ; profil d'archivage PDF/A non activé.
- Si le navigateur bloque quand même l'onglet, `realBrowser` retombe sur un lien `target="_blank"`, qui
  peut lui aussi être bloqué : le bouton **Enregistrer** reste alors la voie sûre.
- Le composant `ConvocationButton.vue` n'a pas de test unitaire (pas de `@vue/test-utils` dans le projet) :
  il est couvert par Playwright.
