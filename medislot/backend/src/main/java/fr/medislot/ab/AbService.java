package fr.medislot.ab;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
@Service
public class AbService {
 public static final String EXP="bouton_reserver_v1";
 static final int SPLIT=128; // seaux 0-127 → A, 128-255 → B
 private final JdbcTemplate jdbc; private final boolean enabled;
 public AbService(JdbcTemplate jdbc,@Value("${medislot.ab.enabled:true}") boolean enabled){this.jdbc=jdbc;this.enabled=enabled;}
 public boolean enabled(){return enabled;}
 public record Assignment(String experiment,String variant,int bucket){}
 public enum Exposure{FIRST,ALREADY,UNKNOWN}
 public record VariantMetrics(String variant,long assigned,long exposed,long converted,long bookings,Double rate){}
 public record Metrics(String experiment,boolean enabled,List<VariantMetrics> variants,AbStats.Srm srm,AbStats.Comparison comparison){}

 /** Seau stable : premier octet (non signé) du SHA-256 de « clé:identifiant ». La clé rend les expériences indépendantes. */
 public static int bucket(String experiment,String subject){
  try{return MessageDigest.getInstance("SHA-256").digest((experiment+":"+subject).getBytes(StandardCharsets.UTF_8))[0]&0xFF;}
  catch(NoSuchAlgorithmException e){throw new IllegalStateException("SHA-256 absent",e);} // toute JVM le fournit : on échoue fort
 }
 public static String variantFor(String experiment,String subject){return bucket(experiment,subject)<SPLIT?"A":"B";}

 /** Crée l'affectation une seule fois ; une affectation existante est relue, jamais recalculée. */
 public Assignment assign(UUID subject){
  int b=bucket(EXP,subject.toString());
  jdbc.update("INSERT INTO ab_assignment(experiment,subject_id,variant,bucket,assigned_at) VALUES (?,?,?,?,now()) ON CONFLICT DO NOTHING",EXP,subject,b<SPLIT?"A":"B",b);
  return jdbc.queryForObject("SELECT variant,bucket FROM ab_assignment WHERE experiment=? AND subject_id=?",(rs,i)->new Assignment(EXP,rs.getString("variant"),rs.getInt("bucket")),EXP,subject);
 }

 /** Première exposition en une seule écriture conditionnelle : exposed_at n'est jamais remplacée. */
 public Exposure expose(UUID subject){
  if(jdbc.update("UPDATE ab_assignment SET exposed_at=now() WHERE experiment=? AND subject_id=? AND exposed_at IS NULL",EXP,subject)==1)return Exposure.FIRST;
  Long known=jdbc.queryForObject("SELECT count(*) FROM ab_assignment WHERE experiment=? AND subject_id=?",Long.class,EXP,subject);
  return known!=null&&known>0?Exposure.ALREADY:Exposure.UNKNOWN;
 }

 /** Appelée dans la transaction de la réservation : rien n'est attribué si la réservation échoue.
  *  Conditions : expérience active, sujet exposé, réservation dans les 24 h qui suivent l'exposition. */
 public boolean attribute(UUID subject,Long appointmentId){
  if(!enabled||subject==null)return false;
  return jdbc.update("""
   INSERT INTO ab_conversion(appointment_id,experiment,subject_id,variant,converted_at)
   SELECT ?,experiment,subject_id,variant,now() FROM ab_assignment
   WHERE experiment=? AND subject_id=? AND exposed_at IS NOT NULL AND exposed_at>now()-interval '24 hours'
   """,appointmentId,EXP,subject)==1;
 }

 /** Unité = navigateur : un sujet qui réserve plusieurs fois compte une seule fois dans converted. */
 public Metrics metrics(){
  Map<String,long[]> rows=new LinkedHashMap<>();rows.put("A",new long[4]);rows.put("B",new long[4]);
  jdbc.query("SELECT variant,count(*),count(exposed_at) FROM ab_assignment WHERE experiment=? GROUP BY variant",rs->{long[] r=rows.get(rs.getString(1));r[0]=rs.getLong(2);r[1]=rs.getLong(3);},EXP);
  jdbc.query("SELECT variant,count(DISTINCT subject_id),count(*) FROM ab_conversion WHERE experiment=? GROUP BY variant",rs->{long[] r=rows.get(rs.getString(1));r[2]=rs.getLong(2);r[3]=rs.getLong(3);},EXP);
  List<VariantMetrics> variants=rows.entrySet().stream().map(e->{long[] r=e.getValue();return new VariantMetrics(e.getKey(),r[0],r[1],r[2],r[3],r[1]==0?null:(double)r[2]/r[1]);}).toList();
  long[] a=rows.get("A"),b=rows.get("B");
  return new Metrics(EXP,enabled,variants,AbStats.srm(a[1],b[1]),AbStats.compare(a[1],a[2],b[1],b[2]));
 }
}
