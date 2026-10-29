# Exercice : un quality gate SonarQube

Un serveur SonarQube et un jeton de projet sont nécessaires. Ils ne sont pas fournis ni exécutés dans la validation locale. La CI livrée ne prétend pas contenir un scan Sonar réussi.

1. Créer un projet privé de démonstration dans votre serveur SonarQube.
2. Définir SONAR_HOST_URL et SONAR_TOKEN dans l’environnement du scanner ou les secrets GitHub ; ne jamais les écrire dans Git.
3. Exécuter d’abord Maven verify et les tests front. Configurer ensuite un scanner Java compatible avec les versions retenues et les chemins backend/target/classes ; scanner aussi frontend/src.
4. Ajouter des rapports de couverture JaCoCo et LCOV seulement après les avoir réellement générés. Ne pas déclarer une couverture à partir de fichiers absents.
5. Définir un seuil sur le nouveau code, introduire une duplication volontaire, observer le refus puis corriger.
6. Documenter le résultat, l’URL de l’analyse et le commit. Comparer le signal fourni avec les tests comportementaux : l’un ne remplace pas l’autre.

Référence : https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/sonarscanner-for-maven
