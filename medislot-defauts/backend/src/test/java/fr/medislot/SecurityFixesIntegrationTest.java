package fr.medislot;
import fr.medislot.api.*;
import fr.medislot.application.BookingService;
import fr.medislot.config.DemoData;
import fr.medislot.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.time.*;
import java.time.Clock;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

// Corrections des problèmes de sécurité relevés par SonarQube sur le back : chaque correction est vérifiée ici.
@SpringBootTest @Testcontainers
class SecurityFixesIntegrationTest {
 @Container static PostgreSQLContainer db=new PostgreSQLContainer("postgres:18");
 @DynamicPropertySource static void database(DynamicPropertyRegistry r){r.add("spring.datasource.url",db::getJdbcUrl);r.add("spring.datasource.username",db::getUsername);r.add("spring.datasource.password",db::getPassword);r.add("medislot.demo-seed",()->"true");r.add("medislot.demo-password",()->"mot-de-passe-de-test");}
 @Autowired PractitionerSearchController search; @Autowired ProfileController profiles; @Autowired AccountRecoveryController recovery;
 @Autowired AppointmentExportController export; @Autowired PasswordEncoder encoder; @Autowired BookingService booking; @Autowired SlotRepository slots; @Autowired UserRepository users;
 static Principal as(String email){return ()->email;}

 @Test void searchUsesParametersNotConcatenatedSql(){ // java:S2077
  assertEquals("Dr Hugo Petit",search.rechercher("petit",null,null).getFirst().get("nom"));
  assertEquals(1,search.rechercher("petit","Lyon","general").size());
  assertTrue(search.rechercher("petit","lyon' OR '1'='1",null).isEmpty(),"la ville piégée est une simple valeur");
  assertTrue(search.rechercher("","Paris","x' OR 'a'='a").isEmpty(),"la spécialité piégée est une simple valeur");
  assertTrue(search.rechercher("x' OR '1'='1",null,null).isEmpty(),"un nom avec apostrophe est refusé");
 }

 @Test void profileIsADtoAndOnlyForItsOwner() throws Exception { // java:S4684 (+ contrôle du propriétaire)
  Long me=users.findByEmail("patient@medislot.test").orElseThrow().id, other=users.findByEmail("autre@medislot.test").orElseThrow().id;
  var p=profiles.profil(me,as("patient@medislot.test"));
  assertEquals("PATIENT",p.role());
  assertTrue(java.util.Arrays.stream(ProfileController.Profil.class.getRecordComponents()).noneMatch(c->c.getName().equals("password")));
  assertEquals(403,assertThrows(ResponseStatusException.class,()->profiles.profil(other,as("patient@medislot.test"))).getStatusCode().value());
  var after=profiles.modifier(me,new ProfileController.ModificationProfil("Camille D.",null),as("patient@medislot.test"));
  assertEquals("Camille D.",after.name());assertEquals("PATIENT",after.role());
  var sent=profiles.envoyerAvatar(me,new MockMultipartFile("fichier","../../evasion.png","image/png",new byte[]{1,2,3}),as("patient@medislot.test"));
  assertEquals("/api/patients/"+me+"/avatar?fichier="+me+"-evasion.png",sent.get("url"),"le chemin est réduit au nom du fichier");
  assertArrayEquals(new byte[]{1,2,3},profiles.lireAvatar(me,"../"+me+"-evasion.png",as("patient@medislot.test")).getBody());
 }

 @Test void resetTokenIsUnpredictableSingleUseAndNeverReturned(){ // java:S2245 + fuite du jeton
  var known=recovery.motDePasseOublie(Map.of("email","autre@medislot.test")).getBody();
  var unknown=recovery.motDePasseOublie(Map.of("email","personne@medislot.test")).getBody();
  assertEquals(known,unknown,"même réponse pour un compte connu ou inconnu");
  assertEquals(Map.of("message",AccountRecoveryController.MESSAGE_OUBLI),known,"ni jeton ni lien dans la réponse");
  var a=new AccountRecoveryController(users,encoder);
  String t1=a.emettreJeton("autre@medislot.test"),t2=a.emettreJeton("autre@medislot.test");
  assertNotEquals(t1,t2);assertTrue(t1.matches("[A-Za-z0-9_-]{43}"),t1);
  assertEquals(400,a.reinitialiser(Map.of("jeton",t1,"nouveauMotDePasse","court")).getStatusCode().value());
  var ok=a.reinitialiser(Map.of("jeton",t1,"nouveauMotDePasse","un-mot-de-passe-solide"));
  assertEquals(200,ok.getStatusCode().value());assertFalse(ok.getBody().toString().contains("solide"),"le mot de passe n'est jamais renvoyé");
  assertTrue(encoder.matches("un-mot-de-passe-solide",users.findByEmail("autre@medislot.test").orElseThrow().password));
  assertEquals(400,a.reinitialiser(Map.of("jeton",t1,"nouveauMotDePasse","un-mot-de-passe-solide")).getStatusCode().value(),"usage unique");
  var maintenant=new java.util.concurrent.atomic.AtomicReference<>(Instant.now());
  Clock horloge=new Clock(){public ZoneId getZone(){return ZoneOffset.UTC;} public Clock withZone(ZoneId z){return this;} public Instant instant(){return maintenant.get();}};
  var later=new AccountRecoveryController(users,encoder,horloge);
  String old=later.emettreJeton("autre@medislot.test");
  maintenant.set(maintenant.get().plus(Duration.ofMinutes(16))); // validité : 15 minutes
  assertEquals(400,later.reinitialiser(Map.of("jeton",old,"nouveauMotDePasse","un-mot-de-passe-solide")).getStatusCode().value(),"jeton expiré");
 }

 @Test void redirectAfterLoginStaysInTheApp(){ // redirection ouverte
  assertEquals("/?page=compte",AccountRecoveryController.cheminInterne("/?page=compte"));
  for(String piege:new String[]{"https://evil.example","//evil.example","/\\evil.example","javascript:alert(1)",null})
   assertEquals("/",AccountRecoveryController.cheminInterne(piege),String.valueOf(piege));
 }

 @Test void exportIsBuiltInMemoryForItsPatientOnly(){ // java:S5443
  Long slot=slots.available(3L,Instant.now(),Instant.now().plus(Duration.ofDays(14))).getFirst().id;
  var a=booking.book("autre@medislot.test",slot);
  var mine=new String(export.exporter(as("autre@medislot.test")).getBody(),StandardCharsets.UTF_8);
  assertTrue(mine.startsWith("id;praticien;"));assertTrue(mine.contains("\n"+a.id+";Dr Amel Benali;Dermatologie;Lyon;"),mine);assertTrue(mine.contains(";72.0\n"),mine);
  assertFalse(new String(export.exporter(as("patient@medislot.test")).getBody(),StandardCharsets.UTF_8).contains("\n"+a.id+";"));
  assertEquals(a.id,export.fiche(a.id,as("autre@medislot.test")).id());
  assertEquals(404,assertThrows(ResponseStatusException.class,()->export.fiche(a.id,as("patient@medislot.test"))).getStatusCode().value(),"la fiche d'un autre patient est introuvable");
 }

 @Test void demoDataRequiresAConfiguredPassword(){ // java:S6437
  var seed=new DemoData(mock(UserRepository.class),mock(ProfessionalRepository.class),mock(SlotRepository.class),mock(PasswordEncoder.class),"");
  assertThrows(IllegalStateException.class,seed::run);
 }
}
