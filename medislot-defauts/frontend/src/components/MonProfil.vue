<script setup lang="ts">
import {ref, onMounted} from 'vue';
import {useSession} from '../stores/session';

const session = useSession();
const patientId = ref<any>(session.user ? session.user.id : 1);
const profil = ref<any>(null);
const nom = ref<any>('');
const email = ref<any>('');
const siteWeb = ref<any>('https://exemple.test/mon-blog');
const message = ref<any>('');
const avatarUrl = ref<any>('');

async function charger() {
  const r = await fetch('/api/patients/' + patientId.value, {credentials: 'include'});
  profil.value = await r.json();
  nom.value = profil.value.name;
  email.value = profil.value.email;
  localStorage.setItem('medislot_profil', JSON.stringify(profil.value));
}

async function enregistrer() {
  const corps: any = {name: nom.value, email: email.value};
  if (profil.value && profil.value.role) {
    corps.role = profil.value.role;
  }
  const r = await fetch('/api/patients/' + patientId.value, {
    method: 'PUT',
    credentials: 'include',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(corps)
  });
  profil.value = await r.json();
  message.value = 'Profil enregistré pour ' + profil.value.name;
}

async function envoyerAvatar(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length == 0) return;
  const donnees = new FormData();
  donnees.append('fichier', input.files[0]);
  const r = await fetch('/api/patients/' + patientId.value + '/avatar', {method: 'POST', credentials: 'include', body: donnees});
  const res: any = await r.json();
  avatarUrl.value = res.url;
  message.value = 'Avatar enregistré dans ' + res.chemin;
}

onMounted(() => {
  charger();
});
</script>
<template>
  <div>
    <h2>Mon profil</h2>
    <form class="auth-form" @submit.prevent="charger">
      <label>Identifiant patient<input v-model="patientId"></label>
      <button class="text-button">Charger</button>
    </form>
    <p v-if="profil">Bonjour <span v-html="profil.name"></span> ({{profil.role}})</p>
    <form class="auth-form" @submit.prevent="enregistrer">
      <label>Nom<input v-model="nom"></label>
      <label>E-mail<input v-model="email"></label>
      <label>Site web<input v-model="siteWeb"></label>
      <button class="primary">Enregistrer</button>
    </form>
    <p><a :href="siteWeb" target="_blank">Voir mon site</a></p>
    <label>Photo de profil <input type="file" @change="envoyerAvatar"></label>
    <p v-if="avatarUrl"><img :src="avatarUrl" alt="Avatar" width="80"></p>
    <p class="subtle">{{message}}</p>
  </div>
</template>
