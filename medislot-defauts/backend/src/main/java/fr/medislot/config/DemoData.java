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
 @Override @Transactional public void run(String...args){
  if(!users.existsByEmail("patient@medislot.test")){for(String email:new String[]{"patient@medislot.test","autre@medislot.test"}){AppUser u=new AppUser();u.email=email;u.name=email.startsWith("patient")?"Camille Dupont":"Alex Martin";u.role="PATIENT";u.password=encoder.encode("MediSlot-demo-2026!");users.save(u);}}
  if(professionals.count()>0)return;
  String[][] rows={{"Dr Sarah Martin","general","Paris","18 avenue de la République"},{"Dr Thomas Leroy","cardiology","Paris","42 rue de Rennes"},{"Dr Amel Benali","dermatology","Lyon","6 rue de la Charité"},{"Dr Hugo Petit","general","Lyon","21 cours Lafayette"},{"Dr Léa Moreau","dentistry","Paris","12 boulevard Saint-Germain"},{"Dr Inès Diallo","general","Bordeaux","8 cours de Verdun"}};
  for(String[] row:rows){Professional p=new Professional();p.name=row[0];p.specialty=row[1];p.city=row[2];p.address=row[3];p.bio="Un accompagnement attentif, dans un cabinet accessible. Les informations de ce profil sont fictives et servent à la formation MediSlot.";p.fee=row[1].equals("general")?30:60;professionals.save(p);
   for(int day=1;day<=10;day++)for(int hour:new int[]{9,10,11,14,15,16}){Slot s=new Slot();s.professionalId=p.id;s.startsAt=LocalDate.now(ZoneId.of("Europe/Paris")).plusDays(day).atTime(hour,0).atZone(ZoneId.of("Europe/Paris")).toInstant();s.endsAt=s.startsAt.plusSeconds(1800);slots.save(s);}
  }
 }
}
