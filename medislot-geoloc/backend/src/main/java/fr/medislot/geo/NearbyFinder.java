package fr.medislot.geo;

import java.util.List;

/** Trouve les cabinets à radiusKm ou moins du centre. L'ordre n'est pas garanti : NearbyService trie. */
public interface NearbyFinder {
  List<Nearby> find(NearbyQuery q);
}
