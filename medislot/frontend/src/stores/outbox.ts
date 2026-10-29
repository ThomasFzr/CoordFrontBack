import {defineStore} from 'pinia';import {ref} from 'vue';import {api,ApiError,unreachable} from '../api';import type {Appointment} from '../types';
// File d'envoi : une réservation demandée sans réseau est gardée sur l'appareil puis envoyée au retour de la connexion.
// Elle n'est jamais présentée comme confirmée : seule la réponse du serveur confirme (201).
export interface PendingBooking {key:string;userId:number;slotId:number;professionalName:string;startsAt:string;measured:boolean;queuedAt:string}
export type FlushResult={item:PendingBooking;outcome:'confirmed'|'taken'|'login'|'rejected';message?:string};
const STORAGE='medislot-outbox-v1';
const read=():PendingBooking[]=>{try{return JSON.parse(localStorage.getItem(STORAGE)||'[]')}catch{return []}};
export const useOutbox=defineStore('outbox',()=>{
 const items=ref<PendingBooking[]>(read());
 const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(items.value))}catch{/* stockage indisponible : la file reste en mémoire */}};
 function enqueue(item:Omit<PendingBooking,'key'|'queuedAt'>){
  if(items.value.some(i=>i.userId===item.userId&&i.slotId===item.slotId))return;
  items.value.push({...item,key:crypto.randomUUID(),queuedAt:new Date().toISOString()});save();
 }
 function remove(key:string){items.value=items.value.filter(i=>i.key!==key);save();}
 // Déconnexion : les demandes d'une personne ne restent pas sur un appareil partagé.
 function clear(){items.value=[];save();}
 let flushing=false;
 /** Envoie les demandes de cette personne, une par une. Une panne réseau arrête l'envoi sans rien perdre. */
 async function flush(userId:number):Promise<FlushResult[]>{
  if(flushing)return [];flushing=true;const results:FlushResult[]=[];
  try{
   for(const item of items.value.filter(i=>i.userId===userId)){
    try{
     await api('/appointments',{method:'POST',headers:item.measured?{'X-AB-Measure':'1'}:{},body:JSON.stringify({slotId:item.slotId})});
     remove(item.key);results.push({item,outcome:'confirmed'});
    }catch(e){
     if(unreachable(e))break;// toujours hors ligne ou serveur injoignable : on réessaiera
     if(e instanceof ApiError&&e.status===401){results.push({item,outcome:'login'});break;}
     if(e instanceof ApiError&&e.status===409){
      // Réponse d'un premier envoi perdue ? Si le rendez-vous existe déjà pour cette personne, il est confirmé.
      const mine=await api<Appointment[]>('/appointments').catch(()=>[] as Appointment[]);
      remove(item.key);results.push({item,outcome:mine.some(a=>a.slotId===item.slotId&&a.status==='CONFIRMED')?'confirmed':'taken'});continue;
     }
     remove(item.key);results.push({item,outcome:'rejected',message:e instanceof Error?e.message:undefined});
    }
   }
  }finally{flushing=false}
  return results;
 }
 return {items,enqueue,remove,clear,flush};
});
