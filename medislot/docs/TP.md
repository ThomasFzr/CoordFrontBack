# Progression dans le dépôt

Chaque séance dure quatre heures et combine lecture, manipulation et preuve. Chaque étudiant travaille sur le front et le back.

1. **Web** : démarrer la correction, relever une requête de recherche et sa réponse. Prouver la différence entre vide, 404 et service arrêté.
2. **Java** : expliquer le DTO ProfessionalDto et suivre DirectoryController vers ProfessionalRepository. Ajouter un champ facultatif après décision de contrat.
3. **Vue** : modifier ProfessionalCard, expliquer props et événements. Ajouter un filtre local puis distinguer son résultat du filtre serveur.
4. **Contrat** : écrire la réponse vide dans OpenAPI. Provoquer une différence name/fullName et corriger les deux côtés selon le contrat retenu.
5. **Données** : lire la migration et ses clés. Ajouter un index justifié, comparer les plans. Expliquer les dates et le fuseau.
6. **Transaction** : lancer deux réservations concurrentes. Retrouver le verrou et l’index. Déplacer un rendez-vous puis prouver la conservation de son historique.
7. **Sécurité** : deux utilisateurs, tentative d’accès au rendez-vous d’autrui. Vérifier CSRF, cookie, 401, 403 et le refus par propriété.
8. **Tests** : retirer temporairement le contrôle du créneau passé pour voir échouer le test Mockito. Rejouer Testcontainers et Playwright. Rétablir la règle.
9. **SSE et architecture** : deux onglets et une réservation. Arrêter puis relancer le flux. Prouver resynchronisation et absence d’informations patient dans le flux public. Rédiger un ADR.
10. **Livraison** : exécuter la CI localement, lire les trois jobs, provoquer un test rouge puis corriger. Présenter application, preuves, contrat et décision d’architecture.

## Défis professionnels facultatifs

Administration des praticiens avec contrôle de rôle et propriété ; génération récurrente des créneaux ; clé d’idempotence durable ; outbox transactionnelle ; livraison e-mail via port et adapter ; projections pour supprimer N+1 ; quota SSE et révocation immédiate ; test de restauration ; scan SonarQube et seuil qualité ; mesure d’un objectif de latence. Ces approfondissements ne sont pas déclarés implémentés dans la correction de base.
