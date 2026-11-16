package fr.medislot.geo;

import fr.medislot.domain.Professional;

/** Un cabinet trouvé et sa distance exacte (non arrondie) au centre de la recherche, en km. */
public record Nearby(Professional professional, double distanceKm) {}
