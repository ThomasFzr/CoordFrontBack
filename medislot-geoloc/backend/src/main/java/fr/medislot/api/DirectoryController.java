package fr.medislot.api;
import com.fasterxml.jackson.annotation.JsonInclude;
import fr.medislot.domain.*;
import fr.medislot.geo.*;
import fr.medislot.repository.*;
import java.time.*;
import org.springframework.data.domain.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
@RestController @RequestMapping("/api/professionals")
public class DirectoryController {
 private final ProfessionalRepository professionals; private final SlotRepository slots; private final NearbyService nearby;
 public DirectoryController(ProfessionalRepository professionals,SlotRepository slots,NearbyService nearby){this.professionals=professionals;this.slots=slots;this.nearby=nearby;}
 /** latitude/longitude : position du CABINET (publique). distanceKm : seulement en recherche par position, arrondie à 0,1 km. */
 public record ProfessionalDto(Long id,String name,String specialty,String city,String address,String bio,int fee,Double latitude,Double longitude,@JsonInclude(JsonInclude.Include.NON_NULL) Double distanceKm) {
  static ProfessionalDto from(Professional p){return new ProfessionalDto(p.id,p.name,p.specialty,p.city,p.address,p.bio,p.fee,p.latitude,p.longitude,null);}
  static ProfessionalDto from(Nearby n){Professional p=n.professional();return new ProfessionalDto(p.id,p.name,p.specialty,p.city,p.address,p.bio,p.fee,p.latitude,p.longitude,GeoDistance.roundKm(n.distanceKm()));}
 }
 public record PageDto<T>(java.util.List<T> items,int page,int size,long total){}
 public record SlotDto(Long id,Long professionalId,Instant startsAt,Instant endsAt){}
 @GetMapping public PageDto<ProfessionalDto> search(@RequestParam(defaultValue="") String specialty,@RequestParam(defaultValue="") String city,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="6") int size,
   @RequestParam(required=false) Double lat,@RequestParam(required=false) Double lon,@RequestParam(required=false) Double radiusKm){
  // Recherche par position dès qu'un des trois paramètres est présent ; sinon, recherche d'origine (ville, nom).
  if(lat!=null||lon!=null||radiusKm!=null){
   if(!city.isEmpty()||!q.isEmpty())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Recherche par position : city et q ne s'appliquent pas.");
   var found=nearby.search(NearbyQuery.of(lat,lon,radiusKm,specialty,page,size));
   return new PageDto<>(found.items().stream().map(ProfessionalDto::from).toList(),found.page(),found.size(),found.total());
  }
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
