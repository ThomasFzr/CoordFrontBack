<script setup lang="ts">
import {computed} from 'vue';import {specialties,timeLabel,dateLabel,type Professional,type Slot} from '../types';
const props=defineProps<{professional:Professional;slots:Slot[];ctaLabel:string;ctaReady:boolean}>();
defineEmits<{choose:[professional:Professional,slot:Slot];profile:[professional:Professional]}>();
const days=computed(()=>{const m=new Map<string,Slot[]>();for(const s of props.slots){const day=dateLabel(s.startsAt);if(!m.has(day))m.set(day,[]);m.get(day)!.push(s);}return [...m.entries()].slice(0,3)});
const first=computed(()=>props.slots[0]);
const initials=computed(()=>props.professional.name.replace('Dr ','').split(' ').map(s=>s[0]).join(''));
</script>
<template>
 <article class="doctor-card">
  <div class="doctor-info"><div class="identity-row"><div class="avatar" aria-hidden="true">{{initials}}</div><div><h3 class="doctor-name"><button class="name-link" @click="$emit('profile',professional)">{{professional.name}}</button></h3><p class="specialty">{{specialties[professional.specialty]}}</p></div></div>
   <p class="address">{{professional.address}}<br>{{professional.city}}</p><p class="price">Consultation au cabinet · {{professional.fee}} €</p><button class="text-button" @click="$emit('profile',professional)">Voir la fiche du praticien<span class="sr-only"> {{professional.name}}</span> <span aria-hidden="true">↗</span></button></div>
  <div class="availability"><p class="availability-title">Prochaines disponibilités</p><div v-if="days.length" class="days"><div v-for="[day,slotsOfDay] in days" :key="day" class="day"><h4>{{day}}</h4><button v-for="slot in slotsOfDay.slice(0,4)" :key="slot.id" class="slot" :aria-label="`Réserver avec ${professional.name} le ${day} à ${timeLabel(slot.startsAt)}`" @click="$emit('choose',professional,slot)">{{timeLabel(slot.startsAt)}}</button></div></div><p v-else class="empty-small">Aucun créneau disponible dans les 14 prochains jours.</p>
   <template v-if="first"><button v-if="ctaReady" class="cta" data-ab-cta :aria-label="`${ctaLabel} avec ${professional.name}, premier créneau le ${dateLabel(first.startsAt)} à ${timeLabel(first.startsAt)}`" @click="$emit('choose',professional,first)">{{ctaLabel}}</button><div v-else class="cta cta-skeleton" aria-hidden="true"></div></template></div>
 </article>
</template>
