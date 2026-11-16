<script setup lang="ts">
import {ref, onMounted} from 'vue';
import {useSession} from '../stores/session';
import {api} from '../api';

const session = useSession();
const patientId = ref<any>(session.user ? session.user.id : 1);
const profil = ref<any>(null);
const nom = ref<any>('');
const email = ref<any>('');
const siteWeb = ref<any>('https://exemple.test/mon-blog');
const message = ref<any>('');
const avatarUrl = ref<any>('');

async function charger() {
  profil.value = await api('/patients/' + patientId.value);
  nom.value = profil.value.name;
  email.value = profil.value.email;
  localStorage.setItem('medislot_profil', JSON.stringify(profil.value));
}

async function enregistrer() {
  // Le serveur n'accepte que le nom et l'e-mail, avec le jeton CSRF (envoyé par api()).
  profil.value = await api('/patients/' + patientId.value, {method: 'PUT', body: JSON.stringify({name: nom.value, email: email.value})});
  message.value = 'Profil enregistré pour ' + profil.value.name;
}

async function envoyerAvatar(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length == 0) return;
  const donnees = new FormData();
  donnees.append('fichier', input.files[0]);
  const res: any = await api('/patients/' + patientId.value + '/avatar', {method: 'POST', body: donnees});
  avatarUrl.value = res.url;
  message.value = 'Avatar enregistré.';
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
    <p v-if="profil">Bonjour <span>{{profil.name}}</span> ({{profil.role}})</p>
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
