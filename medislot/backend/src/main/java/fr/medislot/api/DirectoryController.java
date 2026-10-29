package fr.medislot.api;
import fr.medislot.domain.*;
import fr.medislot.repository.*;
import java.time.*;
import org.springframework.data.domain.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
@RestController @RequestMapping("/api/professionals")
public class DirectoryController {
 private final ProfessionalRepository professionals; private final SlotRepository slots;
 public DirectoryController(ProfessionalRepository professionals,SlotRepository slots){this.professionals=professionals;this.slots=slots;}
 public record ProfessionalDto(Long id,String name,String specialty,String city,String address,String bio,int fee) {static ProfessionalDto from(Professional p){return new ProfessionalDto(p.id,p.name,p.specialty,p.city,p.address,p.bio,p.fee);}}
 public record PageDto<T>(java.util.List<T> items,int page,int size,long total){}
 public record SlotDto(Long id,Long professionalId,Instant startsAt,Instant endsAt){}
 @GetMapping public PageDto<ProfessionalDto> search(@RequestParam(defaultValue="") String specialty,@RequestParam(defaultValue="") String city,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="6") int size){
  if(page<0||size<1||size>50||city.length()>80||q.length()>120||specialty.length()>60)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Paramètres de recherche invalides.");
  var found=professionals.search(specialty,city,q,PageRequest.of(page,size,Sort.by("name").and(Sort.by("id"))));
  return new PageDto<>(found.getContent().stream().map(ProfessionalDto::from).toList(),page,size,found.getTotalElements());
 }
 @GetMapping("/{id}") public ProfessionalDto one(@PathVariable Long id){return ProfessionalDto.from(professionals.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Professionnel introuvable.")));}
 @GetMapping("/{id}/slots") public java.util.List<SlotDto> slots(@PathVariable Long id){
  if(!professionals.existsById(id))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Professionnel introuvable.");
  Instant now=Instant.now();return slots.available(id,now,now.plus(Duration.ofDays(14))).stream().map(s->new SlotDto(s.id,s.professionalId,s.startsAt,s.endsAt)).toList();
 }
}
