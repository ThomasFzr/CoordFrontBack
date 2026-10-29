import {defineStore} from 'pinia';import {computed,nextTick,ref} from 'vue';import {api} from '../api';import type {Variant} from '../types';
// Test A/B bouton_reserver_v1 : le serveur affecte, le front affiche et signale l'affichage, le serveur compte.
export const AB_TIMEOUT_MS=800;
export const useExperiment=defineStore('experiment',()=>{
 const variant=ref<Variant|null>(null);// null : pas encore connue → squelette, jamais un A provisoire
 const measured=ref(false);// false : expérience arrêtée ou version A de secours, rien n'est mesuré
 const label=computed(()=>variant.value==='B'?'Choisir ce créneau':'Réserver');
 let loading:Promise<void>|null=null,exposed=false;
 // Une seule demande d'affectation par page ; en cas d'échec, A sans nouvelle demande.
 function load(){return loading??=(async()=>{
  try{
   const response=await fetch('/api/ab/assignment',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(AB_TIMEOUT_MS)});
   if(!response.ok)throw new Error(`HTTP ${response.status}`);
   const body=await response.json() as {enabled:boolean;variant:Variant};
   const valid=body.variant==='A'||body.variant==='B';
   variant.value=body.enabled&&valid?body.variant:'A';measured.value=body.enabled===true&&valid;
  }catch{variant.value='A';measured.value=false}
 })()}
 // Exposition : au moins un bouton de réservation disponible réellement rendu. Même définition pour A et B.
 async function exposeIfAvailable(){
  if(!measured.value||exposed)return;
  await nextTick();
  if(!document.querySelector('[data-ab-cta]'))return;
  exposed=true;
  try{await api('/ab/exposure',{method:'POST'})}catch{exposed=false}// le serveur déduplique : une nouvelle tentative ne compte pas deux fois
 }
 // Seulement si une variante a été reçue : sinon la réservation n'est pas attribuée à l'expérience.
 const measureHeaders=():Record<string,string>=>measured.value?{'X-AB-Measure':'1'}:{};
 return {variant,measured,label,load,exposeIfAvailable,measureHeaders};
});
