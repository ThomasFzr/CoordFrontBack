package fr.medislot.repository;
import fr.medislot.domain.Professional;
import java.util.List;
import org.springframework.data.jpa.repository.*;
public interface ProfessionalRepository extends JpaRepository<Professional,Long> { @Query("select p from Professional p where (:specialty = '' or p.specialty = :specialty) and (:city = '' or lower(p.city) like lower(concat('%',:city,'%'))) and (:q = '' or lower(p.name) like lower(concat('%',:q,'%')))")
 org.springframework.data.domain.Page<Professional> search(String specialty, String city, String q, org.springframework.data.domain.Pageable pageable);

 /** Boîte englobante : comparaisons simples, servies par l'index (latitude, longitude). Les coins sont écartés en Java. */
 @Query("select p from Professional p"
   + " where p.latitude between :minLat and :maxLat"
   + " and p.longitude between :minLon and :maxLon"
   + " and (:specialty = '' or p.specialty = :specialty)")
 List<Professional> findInBox(String specialty, double minLat, double maxLat, double minLon, double maxLon);

 boolean existsByName(String name);
}
