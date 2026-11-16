package fr.medislot.api;
import fr.medislot.application.BookingService;
import fr.medislot.domain.*;
import fr.medislot.repository.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.Instant;
import java.security.Principal;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.web.server.ResponseStatusException;
@RestController @RequestMapping("/api")
public class AppointmentController {
 private final BookingService service; private final AppointmentRepository appointments; private final SlotRepository slots; private final ProfessionalRepository professionals; private final AuditRepository audit; private final NotificationRepository notifications;
 public AppointmentController(BookingService s,AppointmentRepository a,SlotRepository t,ProfessionalRepository p,AuditRepository h,NotificationRepository n){service=s;appointments=a;slots=t;professionals=p;audit=h;notifications=n;}
 public record BookingRequest(@NotNull @Positive Long slotId){}
 public record AppointmentDto(Long id,Long slotId,Long professionalId,String professionalName,String specialty,String address,String city,Instant startsAt,String status){}
 public record HistoryDto(String action,Instant createdAt){}
 public record NotificationDto(Long id,String message,Instant createdAt){}
 private AppointmentDto dto(Appointment a){Slot s=slots.findById(a.slotId).orElseThrow();Professional p=professionals.findById(s.professionalId).orElseThrow();return new AppointmentDto(a.id,s.id,p.id,p.name,p.specialty,p.address,p.city,s.startsAt,a.status);}
 @GetMapping("/appointments") public java.util.List<AppointmentDto> list(Principal p){return appointments.findByPatientIdOrderByCreatedAtDesc(service.patient(p.getName())).stream().map(this::dto).toList();}
 @PostMapping("/appointments") public ResponseEntity<AppointmentDto> book(Principal p,@Valid @RequestBody BookingRequest r){var a=service.book(p.getName(),r.slotId());return ResponseEntity.created(java.net.URI.create("/api/appointments/"+a.id)).body(dto(a));}
 @GetMapping("/appointments/{id}") public AppointmentDto one(Principal p,@PathVariable Long id){return dto(owned(p,id));}
 private Appointment owned(Principal p,Long id){return appointments.findById(id).filter(a->a.patientId.equals(service.patient(p.getName()))).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Rendez-vous introuvable."));}
 @PostMapping("/appointments/{id}/cancel") public AppointmentDto cancel(Principal p,@PathVariable Long id){return dto(service.cancel(p.getName(),id));}
 @PatchMapping("/appointments/{id}") public AppointmentDto move(Principal p,@PathVariable Long id,@Valid @RequestBody BookingRequest r){return dto(service.reschedule(p.getName(),id,r.slotId()));}
 @GetMapping("/appointments/{id}/history") public java.util.List<HistoryDto> history(Principal p,@PathVariable Long id){owned(p,id);return audit.findByAppointmentIdOrderByCreatedAtAsc(id).stream().map(h->new HistoryDto(h.action,h.createdAt)).toList();}
 @GetMapping("/notifications") public java.util.List<NotificationDto> notifications(Principal p){return notifications.findTop30ByPatientIdOrderByCreatedAtDesc(service.patient(p.getName())).stream().map(n->new NotificationDto(n.id,n.message,n.createdAt)).toList();}
}
