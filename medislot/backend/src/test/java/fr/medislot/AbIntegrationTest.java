package fr.medislot;
import fr.medislot.ab.AbService;
import fr.medislot.application.BookingService;
import fr.medislot.repository.SlotRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import java.time.*;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest @Testcontainers
class AbIntegrationTest {
 @Container static PostgreSQLContainer db=new PostgreSQLContainer("postgres:18");
 @DynamicPropertySource static void database(DynamicPropertyRegistry r){r.add("spring.datasource.url",db::getJdbcUrl);r.add("spring.datasource.username",db::getUsername);r.add("spring.datasource.password",db::getPassword);}
 @Autowired AbService ab; @Autowired BookingService booking; @Autowired SlotRepository slots; @Autowired JdbcTemplate jdbc;
 Long freeSlot(long professional,int index){return slots.available(professional,Instant.now(),Instant.now().plus(Duration.ofDays(14))).get(index).id;}
 AbService.VariantMetrics of(String variant){return ab.metrics().variants().stream().filter(v->v.variant().equals(variant)).findFirst().orElseThrow();}

 @Test void affectationStableEtExpositionUnique(){
  UUID u=UUID.randomUUID();var first=ab.assign(u);
  assertEquals(first,ab.assign(u));assertEquals(AbService.variantFor(AbService.EXP,u.toString()),first.variant());
  assertEquals(AbService.Exposure.FIRST,ab.expose(u));
  Instant exposedAt=jdbc.queryForObject("SELECT exposed_at FROM ab_assignment WHERE subject_id=?",Instant.class,u);
  assertEquals(AbService.Exposure.ALREADY,ab.expose(u));
  assertEquals(exposedAt,jdbc.queryForObject("SELECT exposed_at FROM ab_assignment WHERE subject_id=?",Instant.class,u),"la première date est conservée");
  assertEquals(AbService.Exposure.UNKNOWN,ab.expose(UUID.randomUUID()));
 }

 @Test void conversionsAttribueesAuxSeulsExposesEtDedupliquees(){
  UUID u=UUID.randomUUID();String v=ab.assign(u).variant();ab.expose(u);var before=of(v);
  booking.book("patient@medislot.test",freeSlot(3,0),u);
  booking.book("patient@medislot.test",freeSlot(3,0),u);
  var after=of(v);
  assertEquals(before.converted()+1,after.converted(),"un sujet converti une seule fois");
  assertEquals(before.bookings()+2,after.bookings(),"mais ses deux réservations sont comptées");
 }

 @Test void refus409EtSujetNonExposeNeConvertissentPas(){
  UUID exposed=UUID.randomUUID();String v=ab.assign(exposed).variant();ab.expose(exposed);
  Long slot=freeSlot(4,0);booking.book("autre@medislot.test",slot,null);
  var before=of(v);
  assertEquals(409,assertThrows(ResponseStatusException.class,()->booking.book("patient@medislot.test",slot,exposed)).getStatusCode().value());
  assertEquals(before,of(v),"une tentative refusée ne laisse aucune conversion");

  UUID notExposed=UUID.randomUUID();String w=ab.assign(notExposed).variant();var beforeW=of(w);
  booking.book("patient@medislot.test",freeSlot(4,0),notExposed);
  assertEquals(beforeW.converted(),of(w).converted(),"réservation possible, mais non attribuée");
 }

 @Test void expositionDePlusDe24hNAttribuePas(){
  UUID u=UUID.randomUUID();String v=ab.assign(u).variant();ab.expose(u);
  jdbc.update("UPDATE ab_assignment SET exposed_at=now()-interval '25 hours' WHERE subject_id=?",u);
  var before=of(v);booking.book("patient@medislot.test",freeSlot(5,0),u);
  assertEquals(before.converted(),of(v).converted());
 }

 @Test void tauxNullSansExposition(){
  for(var v:ab.metrics().variants())if(v.exposed()==0)assertNull(v.rate());else assertEquals((double)v.converted()/v.exposed(),v.rate(),1e-12);
 }
}
