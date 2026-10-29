package fr.medislot;
import fr.medislot.ab.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
/** Valeurs de référence : exemples chiffrés du cours A/B (chapitres 3 et 4). */
class AbStatsTest {
 @Test void hachageDuCours(){assertEquals(254,AbService.bucket("bouton_reserver_v1","7f3a9c4e"));assertEquals("B",AbService.variantFor("bouton_reserver_v1","7f3a9c4e"));}
 @Test void memeEntreeMemeVersionEtCleIndependante(){
  String id=UUID.randomUUID().toString();
  assertEquals(AbService.variantFor("bouton_reserver_v1",id),AbService.variantFor("bouton_reserver_v1",id));
  long differentes=java.util.stream.IntStream.range(0,2000).mapToObj(i->UUID.randomUUID().toString())
   .filter(u->!AbService.variantFor("bouton_reserver_v1",u).equals(AbService.variantFor("autre_experience_v1",u))).count();
  assertTrue(differentes>800&&differentes<1200,"deux clés doivent donner des groupes indépendants : "+differentes);
 }
 @Test void repartitionProcheDe5050(){
  long a=java.util.stream.IntStream.range(0,100_000).filter(i->AbService.variantFor("bouton_reserver_v1",UUID.randomUUID().toString()).equals("A")).count();
  assertTrue(Math.abs(a-50_000)<1_000,"répartition : "+a+" en A sur 100 000");
 }
 @Test void srmDuCours(){var s=AbStats.srm(3800,3500);assertEquals(12.33,s.chi2(),0.01);assertEquals(0.0004,s.pValue(),0.0001);assertTrue(s.alert());assertFalse(AbStats.srm(3710,3690).alert());}
 @Test void scèneDOuvertureRienDeProuvé(){var c=AbStats.compare(200,20,200,26);assertEquals(3.0,c.diffPoints(),1e-9);assertEquals(-3.2,c.ciLowPoints(),0.1);assertEquals(9.2,c.ciHighPoints(),0.1);assertEquals(30.0,c.relativePercent(),1e-9);assertEquals(0.35,c.pValue(),0.02);}
 @Test void jour14DuCours(){var c=AbStats.compare(3710,371,3690,443);assertEquals(2.0,c.diffPoints(),0.01);assertEquals(0.6,c.ciLowPoints(),0.1);assertEquals(3.4,c.ciHighPoints(),0.1);assertEquals(0.006,c.pValue(),0.002);}
 @Test void aucunExposeAucuneComparaison(){assertNull(AbStats.compare(0,0,10,1));}
}
