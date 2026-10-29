package fr.medislot.ab;
/** Calculs du chapitre 4 du cours : khi-deux de répartition (SRM), écart, intervalle de confiance, p-value. */
public final class AbStats {
 private AbStats(){}
 public record Srm(double chi2,double pValue,boolean alert){}
 public record Comparison(double diffPoints,double ciLowPoints,double ciHighPoints,double relativePercent,double pValue){}
 /** Répartition 50/50 attendue ; alerte sous p = 0,001 (seuil usuel). */
 public static Srm srm(long a,long b){
  long n=a+b;if(n==0)return new Srm(0,1,false);
  double expected=n/2.0,chi2=Math.pow(a-expected,2)/expected+Math.pow(b-expected,2)/expected;
  double p=erfc(Math.sqrt(chi2/2));return new Srm(chi2,p,p<0.001);
 }
 /** Différence de deux proportions (B − A), approximation normale ; null si un groupe n'a aucun exposé. */
 public static Comparison compare(long exposedA,long convertedA,long exposedB,long convertedB){
  if(exposedA==0||exposedB==0)return null;
  double pa=(double)convertedA/exposedA,pb=(double)convertedB/exposedB,diff=pb-pa;
  double se=Math.sqrt(pa*(1-pa)/exposedA+pb*(1-pb)/exposedB);
  double pooled=(double)(convertedA+convertedB)/(exposedA+exposedB);
  double sePooled=Math.sqrt(pooled*(1-pooled)*(1.0/exposedA+1.0/exposedB));
  double p=sePooled==0?1:erfc(Math.abs(diff)/sePooled/Math.sqrt(2));
  return new Comparison(diff*100,(diff-1.96*se)*100,(diff+1.96*se)*100,pa==0?Double.NaN:diff/pa*100,p);
 }
 /** Fonction d'erreur complémentaire (Abramowitz et Stegun 7.1.26, erreur < 1,5·10⁻⁷). */
 static double erfc(double x){
  double t=1/(1+0.3275911*Math.abs(x));
  double y=t*(0.254829592+t*(-0.284496736+t*(1.421413741+t*(-1.453152027+t*1.061405429))))*Math.exp(-x*x);
  return x>=0?y:2-y;
 }
}
