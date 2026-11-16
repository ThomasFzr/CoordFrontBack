package fr.medislot.document;

/**
 * Modèle de vue de la convocation : uniquement des valeurs prêtes à afficher, déjà formatées.
 * C'est le contrat entre le code (qui remplit) et templates/convocation.html (qui affiche) :
 * le modèle ne calcule rien, il ne fait que des th:text.
 */
public record ConvocationView(
    String reference,        // « RDV-42 »
    String patientName,
    String professionalName,
    String specialty,        // « Cardiologie », déjà traduit
    String address, String city,
    String day,              // « mardi 24 novembre 2026 »
    String time,             // « 9 h 30 », heure de Paris
    String issuedOn) {       // « 16 novembre 2026 »
}
