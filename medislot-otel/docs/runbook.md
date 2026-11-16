# Exploiter et diagnostiquer le laboratoire

## Démarrage

`docker compose up -d --build`, puis `docker compose ps`. La base doit être healthy. Tester `curl http://localhost:18080/actuator/health`. Ouvrir le front sur 8088. Pour les journaux : `docker compose logs --tail 100 backend`.

## Incidents à reproduire

1. 401 : vérifier la session et /api/me. Une page chargée ne prouve pas une session authentifiée.
2. 403 sur écriture : relire /api/csrf après connexion, vérifier l’en-tête et le cookie. Ne pas désactiver CSRF pour masquer le problème.
3. 409 : relire les créneaux et demander un autre choix. Ne pas réessayer automatiquement une nouvelle réservation.
4. SSE silencieux : inspecter Content-Type, buffering du proxy, timeout, heartbeat et listeners. Vérifier que ready provoque une resynchronisation.
5. Base indisponible : vérifier le service db et l’adresse interne db:5432. localhost dans un conteneur désigne ce conteneur.
6. Lenteur : mesurer la latence du endpoint, le nombre de requêtes SQL et les appels du navigateur avant d’ajouter un cache.

## Sauvegarde et restauration de test

Utiliser pg_dump/pg_restore dans un environnement isolé. Une sauvegarde sans essai de restauration ne constitue pas une preuve. Ne jamais écraser la base active pour un exercice. Consigner version du schéma, date, emplacement et résultat de restauration.

## Mise en service et rollback

Le workflow release archive des images identifiées par commit. Un déploiement distant n’est pas configuré. Avant publication : vérifier les migrations et leur compatibilité, les secrets, les checks de santé et le parcours de réservation. Une migration destructive demande une stratégie propre, le retour à l’image précédente ne l’annule pas.
