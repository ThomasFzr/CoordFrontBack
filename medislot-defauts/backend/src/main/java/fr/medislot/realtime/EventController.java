package fr.medislot.realtime;
import fr.medislot.application.*;
import java.util.*;
import java.util.concurrent.*;
import java.security.Principal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.transaction.event.*;
import org.springframework.scheduling.annotation.Scheduled;
@RestController
public class EventController {
 private record Subscriber(SseEmitter emitter,Long patient){}
 private final Set<Subscriber> clients=ConcurrentHashMap.newKeySet();
 private final BookingService booking;
 public EventController(BookingService booking){this.booking=booking;}
 @GetMapping(value="/api/events",produces="text/event-stream") public SseEmitter publicEvents(){return connect(null);}
 @GetMapping(value="/api/notifications/events",produces="text/event-stream") public SseEmitter privateEvents(Principal p){return connect(booking.patient(p.getName()));}
 private SseEmitter connect(Long patient){SseEmitter emitter=new SseEmitter(120000L);Subscriber s=new Subscriber(emitter,patient);clients.add(s);emitter.onCompletion(()->clients.remove(s));emitter.onTimeout(()->{clients.remove(s);emitter.complete();});emitter.onError(e->clients.remove(s));send(s,"ready",Map.of("resync",true));return emitter;}
 private void send(Subscriber s,String name,Object data){try{s.emitter.send(SseEmitter.event().name(name).data(data));}catch(Exception ex){clients.remove(s);s.emitter.complete();}}
 @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
 public void committed(BookingChanged event){for(Subscriber s:clients){if(s.patient==null)send(s,"slots-changed",Map.of("professionalIds",event.professionalIds()));else if(s.patient.equals(event.patientId()))send(s,"notifications-changed",Map.of("refresh",true));}}
 @Scheduled(fixedDelay=20000) public void heartbeat(){for(Subscriber s:clients)send(s,"heartbeat",Map.of("alive",true));}
}
