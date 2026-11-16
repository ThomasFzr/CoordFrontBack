# GEOLOC.md — Trouver un praticien à moins de 5 km

MediSlot, recherche « Autour de moi » ou par adresse. Le front obtient une position, le back calcule les
distances, la base filtre vite, et la position n'est gardée nulle part.

Point de départ : MediSlot d'origine (`MediSlot_application.zip`, importé dans `medislot/` au commit `d56b81e`). Le kit
de départ du TP n'était pas disponible : les fichiers qu'il fournit (migration V2, positions de démonstration,
`findInBox`, branchement dans `DirectoryController`, `NearbyBar.vue`) ont été écrits ici, avec les noms du sujet.

| Lancer | Commande |
| --- | --- |
| Application | `docker compose -p medislot-geoloc up -d --build`, puis http://localhost:8088 |
| Défi PostGIS | `docker compose -p medislot-geoloc-postgis -f compose.yaml -f compose.postgis.yaml up -d --build` |
| Preuves sur la pile | `tests/preuves_geoloc.sh` |

---

## §1 Le contrat

Même ressource qu'avant, trois paramètres en plus. Le front n'a qu'un appel à connaître, et la réponse garde sa forme.

```
GET /api/professionals?lat=45.758&lon=4.832&radiusKm=5&specialty=cardiology&page=0&size=6
```

### Paramètres

| Paramètre | Unité | Règle | Si absent | Message du 400 (`detail`) |
| --- | --- | --- | --- | --- |
| `lat` | degrés décimaux WGS 84 (EPSG:4326) | -90 à 90, nombre fini, avec `lon` | recherche d'origine (ville, nom) | « Latitude invalide : entre -90 et 90 degrés. » |
| `lon` | degrés décimaux WGS 84 | -180 à 180, nombre fini, avec `lat` | idem | « Longitude invalide : entre -180 et 180 degrés. » |
| `lat` sans `lon` (ou l'inverse, ou `radiusKm` seul) | | les deux ensemble | | « Indiquez lat et lon ensemble. » |
| `radiusKm` | kilomètres | plus de 0, au plus 20 | 5 | « Rayon invalide : plus de 0 et au plus 20 km. » |
| `specialty` | code (`general`, `cardiology`…) | 60 caractères au plus | toutes | « Spécialité invalide : 60 caractères au plus. » |
| `page`, `size` | entiers | `page` ≥ 0, `size` de 1 à 50 | 0 et 6 | « Pagination invalide : page à partir de 0, size de 1 à 50. » |
| `city`, `q` | | interdits en recherche par position | | « Recherche par position : city et q ne s'appliquent pas. » |
| valeur non numérique (`lat=abc`) | | | | « Paramètre invalide : lat. » |

Les refus sont vérifiés dans cet ordre, avant toute requête SQL (`NearbyQuery.of`). `NaN` et `Infinity`, que Spring
convertit volontiers en `Double`, sont refusés par `Double.isFinite`. Le message ne recopie jamais la valeur reçue.

Pourquoi 20 km au plus : sans plafond, `radiusKm=20000` demande toute la base. 20 km couvrent une agglomération.

### Réponse (200)

```json
{"items": [
   {"id": 3, "name": "Dr Amel Benali", "specialty": "dermatology", "city": "Lyon",
    "address": "6 rue de la Charité", "bio": "…", "fee": 60,
    "latitude": 45.755824, "longitude": 4.832967, "distanceKm": 0.2}],
 "page": 0, "size": 6, "total": 6}
```

- `latitude`, `longitude` : position du **cabinet** (adresse professionnelle, publique), utile pour la carte. `null` si
  le cabinet n'est pas géocodé ; il n'apparaît alors pas dans la recherche par position.
- `distanceKm` : distance **à vol d'oiseau**, en km, **arrondie à 0,1 km**. Présente seulement en recherche par position.
  Jamais la position du patient.
- **Tri** : distance exacte croissante, puis nom, puis id (ordre total et stable). Le back trie **tous** les résultats
  du rayon sur la valeur exacte, **puis** découpe la page. Le front ne trie rien.
- `total` : nombre de cabinets dans le rayon, pour la pagination.

Contrat écrit aussi dans `docs/openapi.yaml` (paramètres, bornes, champs `latitude`, `longitude`, `distanceKm`).

### Les ordres de coordonnées

| latitude, longitude | longitude, latitude |
| --- | --- |
| API Geolocation, contrat MediSlot, `GeoDistance.haversineKm(lat1, lon1, …)`, Leaflet `[lat, lng]`, `DemoData`, migration V2 | GeoJSON du géocodeur `coordinates: [lon, lat]`, PostGIS `ST_MakePoint(x, y)` |

Chaque passage d'un monde à l'autre porte un commentaire (`geo.ts`, `V3__postgis.sql`, `PostgisNearbyFinder`).

---

## §2 Côté front : position, refus, adresse

`frontend/src/geo.ts`, `components/NearbyBar.vue`, `components/NearbyMap.vue`, intégration dans `App.vue`.

### Position du navigateur (`getPosition`)

- Demandée **après un clic** sur « Autour de moi (5 km) », jamais au montage du composant.
- Contexte non sécurisé (`window.isSecureContext` faux, HTTP hors `localhost`) : refus immédiat, sans interroger le
  navigateur, et proposition de saisir une adresse.
- Options : `enableHighAccuracy: false` (5 km de rayon : inutile de réveiller le GPS), `timeout: 10000` (pas de bouton
  « en cours » sans fin), `maximumAge: 300000` (une position de moins de 5 minutes suffit).
- `accuracy` est gardée : au-delà de 1 km, l'interface écrit « position approximative, à N km près ».

| Cas | Message affiché (`role="alert"`) |
| --- | --- |
| code 1, `PERMISSION_DENIED` | Localisation refusée. Saisissez une adresse ou un code postal. |
| code 2, `POSITION_UNAVAILABLE` | Position introuvable pour le moment. Saisissez une adresse. |
| code 3, `TIMEOUT` | La localisation prend trop de temps. Réessayez ou saisissez une adresse. |
| page non sécurisée | La localisation exige une page sécurisée (HTTPS). Saisissez une adresse ou un code postal. |
| pas d'API Geolocation | Votre navigateur ne sait pas donner votre position. Saisissez une adresse ou un code postal. |

Les 400 du back sont affichés tels quels (`detail` du ProblemDetail), sans traduction.

### Adresse ou code postal (`geocode`)

Service : Géoplateforme de l'IGN (`https://data.geopf.fr/geocodage/search`, données BAN), `limit=1`.

- **Ordre** : `coordinates` est en GeoJSON, `[longitude, latitude]` → `const [lon, lat] = f.geometry.coordinates`.
  Testé avec une adresse lyonnaise réelle : la latitude reste à ~45,7 (Lyon), pas en Somalie.
- **Score** : en dessous de 0,5, le premier résultat est souvent dans une autre commune (essai réel « Place de la
  Mairie 69130 Écully » → Meaux-la-Montagne, score 0,39). Message : « Adresse introuvable ou trop imprécise. Précisez la
  ville ou le code postal. »
- **Limite d'usage** : gratuit, sans clé, **50 requêtes par seconde et par adresse IP** (en-tête `RateLimit-Limit: 50`).
  **Parade** : un cache en mémoire par adresse normalisée (espaces et casse ignorés : « 69002  LYON » et « 69002 lyon »
  font un seul appel), un appel seulement à la validation du formulaire (pas d'autocomplétion), et un message en cas
  de 429 (« Le service d'adresses est très sollicité. Réessayez dans une seconde. »). Un échec n'est pas mis en cache.
  Pas de Nominatim : 1 requête/s au plus, autocomplétion interdite.
- L'adresse saisie part directement du navigateur vers l'IGN (service public, sans compte) ; elle ne passe pas par
  le back MediSlot et n'y est pas gardée.

### Paramètres et affichage

- `nearbyParams` envoie `lat`, `lon` **arrondis à 3 décimales** (≈ 111 m en latitude), `radiusKm`, `page`, `size`,
  et `specialty` si choisie.
- `formatDistance` : « 300 m » sous 1 km, « 1,2 km » au-delà (format français). Chaque carte praticien affiche
  « À 1,2 km à vol d'oiseau », et l'en-tête des résultats le rappelle.
- Changer de spécialité relance la recherche autour du même centre ; « Rechercher » (ville, nom) ou « Revenir à la
  recherche par ville » quitte le mode position.

### Défi front : la carte (`NearbyMap.vue`)

Leaflet 1.9.4, chargé à la demande (bouton « Voir sur une carte », module séparé à la construction). Tuiles
OpenStreetMap avec l'attribution « © OpenStreetMap contributors » visible ; aucune tuile préchargée, défilement à la
molette désactivé. Un cercle de 5 km, le centre, un marqueur par cabinet de la page. La carte est un plus : la liste
reste complète et lisible sans elle ; le conteneur a un `aria-label` qui renvoie à la liste.

---

## §3 Côté back : distance, boîte, tri, PostGIS

Paquet `fr.medislot.geo`.

### Distance (`GeoDistance`)

Formule de haversine sur une sphère de rayon `EARTH_RADIUS_KM = 6371.0` (rayon moyen, IUGG) : conversion en radians
dès l'entrée, garde `Math.min(1, √h)` contre un `NaN` aux antipodes. `roundKm` arrondit au dixième, pour l'affichage
seulement.

| Trajet | Haversine | Référence indépendante | Écart |
| --- | --- | --- | --- |
| Nashville BNA → Los Angeles LAX | 2 886,444 km | Rosetta Code : 2 886,444 km (R = 6 371) | < 1 m |
| Bellecour → av. de la République (Paris) | 392,34 km | PostGIS (ellipsoïde) : 392,549 km | 0,05 % |
| 1° de latitude | 111,195 km | π × R / 180 | exact |

### Recherche sans PostGIS (défaut) : boîte puis cercle

1. `BoundingBox.around(lat, lon, r)` : demi-hauteur `r / R` en degrés (0,0450° pour 5 km), demi-largeur
   `asin(sin(r/R) / cos φ)` (0,0644° à Lyon : un degré de longitude rétrécit avec la latitude). Pôle dans le cercle ou
   antiméridien traversé : toutes les longitudes (la boîte reste un sur-ensemble ; le filtre exact fait le reste).
2. `ProfessionalRepository.findInBox` (JPQL) : `latitude BETWEEN … AND longitude BETWEEN …`, servi par l'index B-tree
   `professional_lat_lon_idx (latitude, longitude)` de la migration V2.
3. `BoxNearbyFinder` : haversine sur les quelques lignes de la boîte, puis `distanceKm <= radiusKm`. **Ce filtre
   écarte les coins** : sans lui, un cabinet jusqu'à 5 × √2 ≈ 7,1 km apparaîtrait dans une liste « à moins de 5 km ».
   Dans les données de démonstration, Oullins (5,2 km de Bellecour) est dans la boîte et doit disparaître.
4. `NearbyService.search` : tri par `ORDER` (distance exacte, nom, id), **puis** `subList` pour la page.

Migration V2 : deux colonnes `DOUBLE PRECISION`, contraintes de bornes, contrainte « les deux ou aucune », index, et
positions des six cabinets d'origine pour une base déjà créée. `DemoData` ajoute les cabinets manquants par nom :
une ancienne base reçoit aussi les cinq nouveaux cabinets lyonnais (pas besoin de changer de nom de projet).

Données de démonstration (fictives ; positions d'adresses publiques géocodées avec la Géoplateforme le 16/11/2026) :
11 praticiens, dont 7 autour de Lyon ; 6 à moins de 5 km de la place Bellecour (45.7576, 4.8317).

### Défi back : PostGIS (profil `postgis`)

- `db/postgis/V3__postgis.sql` (ajouté à `spring.flyway.locations` par `application-postgis.yml`) :
  `CREATE EXTENSION postgis`, colonne calculée `location geography(Point, 4326) GENERATED ALWAYS AS
  (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED`, index `GIST`.
- `PostgisNearbyFinder.SQL` : `ST_DWithin(p.location, c.pt, :meters)` (l'index GiST fait la boîte),
  `ST_Distance(...) / 1000` sur l'ellipsoïde. Même tri, même découpage par `NearbyService`.
- `compose.postgis.yaml` : image `postgis/postgis:18-3.6` (amd64 seulement, émulée sur Apple Silicon) et
  `SPRING_PROFILES_ACTIVE=postgis`. À lancer **sous un autre nom de projet** : une base migrée en V3 n'est plus acceptée
  par Flyway sans le profil postgis.

Plan relevé sur la pile PostGIS (PostGIS 3.6.4, PostgreSQL 18.6), sans rien forcer :

```
Index Scan using professional_location_gix on professional p
  Index Cond: (location && _st_expand('0101…'::geography, '5000'::double precision))
  Filter: st_dwithin(location, '0101…'::geography, '5000'::double precision, true)
```

Choix de MediSlot : la boîte reste le défaut (elle tourne sur l'image `postgres:18` du projet, sans dépendance).
PostGIS devient intéressant pour de gros volumes, un tri et une pagination en SQL, ou des zones (polygones).

---

## §4 Vie privée : où la position n'est pas gardée, et la preuve

La position d'un patient est une donnée personnelle (RGPD, art. 4) ; minimisation (art. 5) : on s'en sert pour la
requête, puis on l'oublie.

| Où elle pourrait rester | Ce que fait MediSlot | Preuve |
| --- | --- | --- |
| Réseau | arrondie à 3 décimales par le front avant l'envoi (≈ 111 m) | `geo.test.ts` « n'envoie jamais la position précise » ; Playwright vérifie `lat=45.758` dans la requête |
| Journal d'accès nginx | `log_format sans_position` : `$uri` (chemin sans `?lat=…`), jamais `$request`, `$request_uri`, `$args` ; appliqué au serveur entier et à `location /api/` | `GeolocPrivacyTest.nginxLogsThePathWithoutTheQueryString` ; `tests/preuves_geoloc.sh` lit `docker compose logs frontend` |
| Journal d'erreurs nginx | une erreur amont (« upstream timed out … request: "GET /api/…?lat=…" ») recopie la requête : `error_log … crit` dans `location /api/` ; le 502/504 reste visible dans le journal d'accès | relu dans `nginx.conf` |
| Journaux Spring | aucun `Logger`, `System.out` ni `printStackTrace` dans le paquet `geo` ; les messages d'erreur ne recopient pas la valeur reçue | `GeolocPrivacyTest.theGeoPackageNeverLogs` ; `NearbySearchApiTest.theResponseNeverEchoesTheReceivedPosition` ; le script cherche `lat=` dans `docker compose logs backend` |
| Base de données | aucune table ni colonne pour la position du patient ; seul `Professional` (cabinet, public) a une position | `GeolocPrivacyTest.noEntityStoresAPatientPosition` |
| Réponse | distance arrondie à 0,1 km, jamais la position reçue | `NearbySearchApiTest` |
| Navigateur | la position vit dans une variable de la page ; ni `localStorage`, ni URL de la page | lecture de `App.vue` |

Relevé sur la pile (`docker compose -p medislot-geoloc logs frontend`) :

```
192.168.164.1 [16/Nov/2026:11:18:14 +0000] "GET /api/professionals" 400 120
```

Pourquoi l'arrondi de la distance : une distance exacte, vue depuis trois endroits, permet de retrouver un point
(trilatération). La position d'un cabinet est publique, celle d'un patient ne l'est pas.

---

## §5 Preuves

### Tests

| Suite | Commande | Résultat (16/11/2026) |
| --- | --- | --- |
| Back | `./mvnw test` (Testcontainers : Docker requis) | **44 tests, 0 échec, 0 ignoré** |
| dont | `GeoDistanceTest` 8 · `BoundingBoxTest` 4 · `NearbySearchApiTest` 19 · `NearbyPostgresTest` 4 (postgres:18) · `PostgisNearbyTest` 3 (postgis/postgis:18-3.6) · `GeolocPrivacyTest` 3 · réservation 3 | |
| Front | `npm test` (Vitest) | **17 tests verts** (dont 14 dans `geo.test.ts` : Position 5, Paramètres 2, Affichage 2, Géocodage 5) |
| Build | `npm run build` (vue-tsc + Vite) | passe |
| Bout en bout | `npm run test:e2e` (Playwright, pile lancée) | **5 tests verts**, dont `nearby.spec.ts` (2) |
| Pile | `tests/preuves_geoloc.sh` | toutes les preuves vertes, profil défaut **et** profil postgis |

Les tests attendent des valeurs indépendantes du code (Rosetta Code, PostGIS, géométrie, lieux réels géocodés).
Contre-épreuve faite : sans `Math.toRadians`, 7 tests de `GeoDistanceTest` échouent ; sans le filtre
`distanceKm <= radiusKm`, `NearbySearchApiTest` échoue (le coin d'Oullins entre dans la liste).

### Les quatre essais dans l'application

Position simulée : place Bellecour (45.7576, 4.8317), panneau Sensors de Chrome ou contexte Playwright.

| Essai | Résultat observé |
| --- | --- |
| Autour de moi, Bellecour | « 6 praticiens à moins de 5 km » : Dr Amel Benali 300 m, Dr Hugo Petit 1,2 km, Dr Julie Fabre 2 km, Dr Marc Roussel 2 km, Dr Nicolas Garnier 2,2 km, Dr Claire Vidal 3,8 km. Requête envoyée : `lat=45.758&lon=4.832`. Oullins (5,2 km) absent. |
| Avec la spécialité Cardiologie | « 2 praticiens à moins de 5 km » : Dr Marc Roussel, Dr Claire Vidal. |
| Permission bloquée | « Localisation refusée. Saisissez une adresse ou un code postal. » ; la saisie « 69002 Lyon » + « Chercher autour » donne la liste autour de « 69002 Lyon ». |
| `lat=95`, puis le journal de nginx | 400 `{"detail":"Latitude invalide : entre -90 et 90 degrés."}` ; journal : `"GET /api/professionals" 400 120`, sans coordonnées. |

Remarque : depuis le point exact, Dr Amel Benali est à 0,22 km (« 0,2 ») ; depuis le point **arrondi** envoyé par le
front, à 0,25 km, affiché « 300 m ». L'arrondi à 3 décimales déplace le centre de 100 m au plus : invisible à l'échelle
de 5 km, mais visible sur le premier cabinet. C'est le prix, assumé, de la minimisation.

---

## §6 Limites

- **« À vol d'oiseau » ne promet pas** un trajet : ni la distance par la route, ni le temps à pied ou en transports, ni
  l'absence d'obstacle (le Rhône, la Saône, une voie ferrée). Un cabinet « à 2 km » peut demander 30 minutes de bus.
  L'interface le dit sur chaque carte. Elle ne dit rien non plus de l'accessibilité du cabinet ni des disponibilités.
- La sphère se trompe de moins de 0,5 % (moins de 25 m sur 5 km) par rapport à l'ellipsoïde : négligeable pour trier
  des cabinets dans une ville, pas pour facturer un trajet.
- Le cercle est tranché sur la distance exacte depuis le point arrondi : un cabinet à 4,95 km du point réel peut
  passer juste au-delà de 5 km (et inversement), à 100 m près.
- La position du navigateur peut être fausse ou grossière (adresse IP, Wi-Fi) : on affiche la précision au-delà de
  1 km, et une position inconnue vaut `null`, jamais (0, 0).
- Une recherche en GET met la position dans l'URL : elle est absente des journaux nginx et Spring de MediSlot, mais un
  proxy d'entreprise, une extension de navigateur ou un outil de mesure d'audience pourraient la voir. L'arrondi limite
  ce qui fuit.
- Le géocodage dépend d'un service public tiers (disponibilité, limite de débit) ; le cache est en mémoire de l'onglet.
- Tuiles OpenStreetMap : usage modéré seulement (politique de l'OSMF) ; pour un vrai trafic, un fournisseur de tuiles
  ou ses propres tuiles.
- nginx résout l'adresse du back au démarrage : si le conteneur back est recréé seul, `docker compose restart frontend`
  (le script de preuves le rappelle).
