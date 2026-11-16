<script setup lang="ts">
// « Autour de moi » : la position n'est demandée qu'après ce clic, jamais au montage du composant.
// Chaque issue mène à une liste : position autorisée, ou adresse / code postal géocodé.
import {ref} from 'vue';
import {getPosition, geocode, GeoError, RADIUS_KM, type Position} from '../geo';
const emit = defineEmits<{center: [position: Position]}>();
const address = ref(''), locating = ref(false), geocoding = ref(false), problem = ref('');

function explain(e: unknown) {
  return e instanceof GeoError ? e.message : 'Une erreur est survenue. Saisissez une adresse ou un code postal.';
}
async function aroundMe() {
  problem.value = ''; locating.value = true;
  try { emit('center', await getPosition()); }
  catch (e) { problem.value = explain(e); }
  finally { locating.value = false; }
}
async function aroundAddress() {
  problem.value = ''; geocoding.value = true;
  try { emit('center', await geocode(address.value)); }
  catch (e) { problem.value = explain(e); }
  finally { geocoding.value = false; }
}
</script>
<template>
 <div class="nearby-bar">
  <button type="button" class="nearby-me" :disabled="locating" @click="aroundMe">
   <span aria-hidden="true">◎</span> {{ locating ? 'Localisation…' : `Autour de moi (${RADIUS_KM} km)` }}
  </button>
  <form class="nearby-address" @submit.prevent="aroundAddress">
   <label for="nearby-address">ou une adresse, un code postal</label>
   <input id="nearby-address" v-model="address" placeholder="69002 Lyon" autocomplete="postal-code" maxlength="200" required minlength="3">
   <button type="submit" :disabled="geocoding">{{ geocoding ? 'Recherche…' : 'Chercher autour' }}</button>
  </form>
  <p v-if="problem" role="alert" class="nearby-problem">{{ problem }}</p>
  <p class="nearby-privacy">Votre position sert à cette recherche seulement : arrondie à environ 100 m, elle n’est pas enregistrée.</p>
 </div>
</template>
