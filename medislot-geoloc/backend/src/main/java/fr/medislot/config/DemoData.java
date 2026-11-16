package fr.medislot.config;
import fr.medislot.domain.*;
import fr.medislot.repository.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
@Component @ConditionalOnProperty(name="medislot.demo-seed",havingValue="true")
public class DemoData implements CommandLineRunner {
 private final UserRepository users;private final ProfessionalRepository professionals;private final SlotRepository slots;private final PasswordEncoder encoder;
 public DemoData(UserRepository u,ProfessionalRepository p,SlotRepository s,PasswordEncoder e){users=u;professionals=p;slots=s;encoder=e;}
 /**
  * Praticiens fictifs. Positions des cabinets géocodées avec la Géoplateforme (IGN, données BAN) le 16/11/2026,
  * écrites ici dans l'ordre latitude, longitude. Autour de la place Bellecour (45.7576, 4.8317) : six cabinets à moins
  * de 5 km, et Oullins à 5,2 km, dans la boîte englobante mais hors du cercle (le « coin » que Java écarte).
  */
 static final Object[][] ROWS={
  {"Dr Sarah Martin","general","Paris","18 avenue de la République",48.866270,2.368460},
  {"Dr Thomas Leroy","cardiology","Paris","42 rue de Rennes",48.848741,2.328502},
  {"Dr Amel Benali","dermatology","Lyon","6 rue de la Charité",45.755824,4.832967},
  {"Dr Hugo Petit","general","Lyon","21 cours Lafayette",45.763688,4.844596},
  {"Dr Léa Moreau","dentistry","Paris","12 boulevard Saint-Germain",48.849573,2.354712},
  {"Dr Inès Diallo","general","Bordeaux","8 cours de Verdun",44.845538,-0.577462},
  {"Dr Julie Fabre","dentistry","Lyon","4 place de la Croix-Rousse",45.775336,4.832017},
  {"Dr Marc Roussel","cardiology","Lyon","2 place Jean Jaurès",45.740085,4.839350},
  {"Dr Nicolas Garnier","general","Lyon","17 boulevard Vivier-Merle",45.762307,4.859023},
  {"Dr Claire Vidal","cardiology","Villeurbanne","1 place Lazare Goujon",45.766420,4.879353},
  {"Dr Sophie Lambert","general","Oullins","place Anatole France",45.714313,4.805346}};
 @Override @Transactional public void run(String...args){
  if(!users.existsByEmail("patient@medislot.test")){for(String email:new String[]{"patient@medislot.test","autre@medislot.test"}){AppUser u=new AppUser();u.email=email;u.name=email.startsWith("patient")?"Camille Dupont":"Alex Martin";u.role="PATIENT";u.password=encoder.encode("MediSlot-demo-2026!");users.save(u);}}
  // Ajoute les praticiens manquants : une base créée avant la géolocalisation reçoit aussi les cabinets lyonnais.
  for(Object[] row:ROWS){if(professionals.existsByName((String)row[0]))continue;Professional p=new Professional();p.name=(String)row[0];p.specialty=(String)row[1];p.city=(String)row[2];p.address=(String)row[3];p.latitude=(Double)row[4];p.longitude=(Double)row[5];p.bio="Un accompagnement attentif, dans un cabinet accessible. Les informations de ce profil sont fictives et servent à la formation MediSlot.";p.fee=row[1].equals("general")?30:60;professionals.save(p);
   for(int day=1;day<=10;day++)for(int hour:new int[]{9,10,11,14,15,16}){Slot s=new Slot();s.professionalId=p.id;s.startsAt=LocalDate.now(ZoneId.of("Europe/Paris")).plusDays(day).atTime(hour,0).atZone(ZoneId.of("Europe/Paris")).toInstant();s.endsAt=s.startsAt.plusSeconds(1800);slots.save(s);}
  }
 }
}
