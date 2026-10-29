package fr.medislot.application;
import fr.medislot.ab.AbService;
import fr.medislot.domain.*;
import fr.medislot.repository.*;
import java.time.Instant;
import java.util.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Service
public class BookingService {
 private final UserRepository users; private final SlotRepository slots; private final AppointmentRepository appointments;
 private final AuditRepository audit; private final NotificationRepository notifications; private final ApplicationEventPublisher events; private final AbService ab;
 public BookingService(UserRepository u,SlotRepository s,AppointmentRepository a,AuditRepository h,NotificationRepository n,ApplicationEventPublisher e,AbService ab){users=u;slots=s;appointments=a;audit=h;notifications=n;events=e;this.ab=ab;}
 public Long patient(String email){return users.findByEmail(email).orElseThrow().id;}
 private ResponseStatusException conflict(){return new ResponseStatusException(HttpStatus.CONFLICT,"Ce créneau n’est plus disponible. Choisissez-en un autre.");}
 private Slot lock(Long id){return slots.lockById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Créneau introuvable."));}
 private void check(Slot s){if(!s.startsAt.isAfter(Instant.now())||appointments.existsBySlotIdAndStatus(s.id,"CONFIRMED"))throw conflict();}
 private Appointment owned(Long id,Long patient){var a=appointments.lockById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Rendez-vous introuvable."));if(!a.patientId.equals(patient))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Rendez-vous introuvable.");return a;}
 @Transactional public Appointment book(String email,Long slotId){return book(email,slotId,null);}
 /** abSubject : identifiant du test A/B, seulement si le front mesure. La conversion est écrite dans la même
  *  transaction que le rendez-vous : un 409 ou une erreur n'en laisse aucune. */
 @Transactional public Appointment book(String email,Long slotId,UUID abSubject){
  Long patient=patient(email); Slot s=lock(slotId);check(s);
  Appointment a=new Appointment();a.patientId=patient;a.slotId=s.id;a.status="CONFIRMED";a.createdAt=Instant.now();appointments.saveAndFlush(a);
  ab.attribute(abSubject,a.id);
  record(a,"CREATED","Votre rendez-vous est confirmé.");events.publishEvent(new BookingChanged(patient,List.of(s.professionalId)));return a;
 }
 @Transactional public Appointment cancel(String email,Long id){
  Appointment a=owned(id,patient(email));Slot s=lock(a.slotId);
  if(a.status.equals("CANCELLED"))return a;
  a.status="CANCELLED";appointments.saveAndFlush(a);record(a,"CANCELLED","Votre rendez-vous a été annulé.");events.publishEvent(new BookingChanged(a.patientId,List.of(s.professionalId)));return a;
 }
 @Transactional public Appointment reschedule(String email,Long id,Long slotId){
  Appointment a=owned(id,patient(email));if(!a.status.equals("CONFIRMED"))throw conflict();
  if(a.slotId.equals(slotId))return a;
  Long oldId=a.slotId; Slot first=lock(Math.min(oldId,slotId)),second=lock(Math.max(oldId,slotId));
  Slot target=first.id.equals(slotId)?first:second;Slot old=first.id.equals(oldId)?first:second;check(target);
  a.slotId=target.id;appointments.saveAndFlush(a);record(a,"RESCHEDULED","Votre rendez-vous a été déplacé.");
  events.publishEvent(new BookingChanged(a.patientId,List.of(old.professionalId,target.professionalId)));return a;
 }
 private void record(Appointment a,String action,String message){AuditEvent h=new AuditEvent();h.appointmentId=a.id;h.actorId=a.patientId;h.action=action;h.createdAt=Instant.now();audit.save(h);Notification n=new Notification();n.patientId=a.patientId;n.message=message;n.createdAt=h.createdAt;notifications.save(n);}
}
