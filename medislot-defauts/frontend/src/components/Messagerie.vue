<script setup lang="ts">
import {ref, onMounted} from 'vue';
import {api} from '../api';

const messages = ref<any[]>([]);
const contenu = ref<any>('');
const apercu = ref<HTMLElement | null>(null);

async function charger() {
  messages.value = await api<any[]>('/messages');
}

async function envoyer() {
  if (contenu.value == '') return;
  await api('/messages', {method: 'POST', body: JSON.stringify({contenu: contenu.value})});
  if (apercu.value) apercu.value.innerHTML = 'Dernier message envoyé : ' + contenu.value;
  contenu.value = '';
  charger();
}

function ouvrir(id: any) {
  window.open('/api/messages/' + id + '/apercu', '_blank');
}

onMounted(() => {
  charger();
});
</script>
<template>
  <div>
    <h2>Messagerie avec le cabinet</h2>
    <form class="auth-form" @submit.prevent="envoyer">
      <label>Votre message<textarea v-model="contenu" rows="3"></textarea></label>
      <button class="primary">Envoyer</button>
    </form>
    <div ref="apercu" class="subtle"></div>
    <article v-for="m in messages" :key="m.id" class="appointment">
      <div class="appointment-person"><strong>{{m.auteur}}</strong><p v-html="m.contenu"></p></div>
      <div class="appointment-actions"><button class="text-button" @click="ouvrir(m.id)">Aperçu</button><a :href="'/api/messages/' + m.id + '/apercu'" target="_blank">Ouvrir</a></div>
    </article>
  </div>
</template>
