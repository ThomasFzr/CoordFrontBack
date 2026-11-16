<script setup lang="ts">
import { ref } from 'vue';
import { ConvocationError, FALLBACK, openConvocation, saveConvocation, realBrowser } from '../convocation';

// context : de quel rendez-vous il s'agit (« du mardi 24 novembre à 09:30 »), lu par les lecteurs d'écran
// quand la liste contient plusieurs boutons « Ma convocation (PDF) ».
const props = defineProps<{ appointmentId: number; context?: string }>();
const loading = ref(false);
const error = ref('');

async function run(save: boolean) {
 if (loading.value) return;                          // pas de double clic, pas de double génération
 loading.value = true;
 error.value = '';
 try {
  const go = save ? saveConvocation : openConvocation;
  await go(props.appointmentId, realBrowser);
 } catch (e) {
  error.value = e instanceof ConvocationError ? e.message : FALLBACK;
 } finally {
  loading.value = false;
 }
}
</script>

<template>
 <div class="convocation">
  <button type="button" :disabled="loading" :aria-busy="loading" @click="run(false)">
   {{ loading ? 'Préparation…' : 'Ma convocation (PDF)' }}<span v-if="context" class="visually-hidden"> {{ context }}</span>
  </button>
  <button type="button" class="text-button" :disabled="loading" :aria-busy="loading" @click="run(true)">
   Enregistrer<span class="visually-hidden"> la convocation (PDF){{ context ? ' ' + context : '' }}</span>
  </button>
  <span v-if="error" role="alert" class="error-text">{{ error }}</span>
 </div>
</template>
