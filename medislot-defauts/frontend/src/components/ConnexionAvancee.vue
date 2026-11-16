<script setup lang="ts">
import {ref, onMounted} from 'vue';
import {useSession} from '../stores/session';
import {api} from '../api';

const session = useSession();
const email = ref<any>('');
const motDePasse = ref<any>('');
const jeton = ref<any>('');
const nouveau = ref<any>('');
const message = ref<any>('');
// S5852 : forme sans répétition ambiguë ; les parties sont séparées par un point, donc lues en temps linéaire.
const EMAIL_VALIDE = /^[\w.-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/;

// Redirection ouverte : on ne suit que les chemins internes (« /… », jamais « //autre-site » ni une URL complète).
function suivant(): string {
  const next = new URLSearchParams(window.location.search).get('next') || '/';
  return next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/';
}

async function seConnecter() {
  try {
    await session.login(email.value, motDePasse.value);
    window.location.href = suivant();
  } catch (e: any) {
    message.value = e.message;
  }
}

async function oublie() {
  if (!EMAIL_VALIDE.test(email.value)) {
    message.value = 'Adresse invalide';
    return;
  }
  try {
    const res: any = await api('/compte/oubli', {method: 'POST', body: JSON.stringify({email: email.value})});
    message.value = res.message;
  } catch (e: any) {
    message.value = e.message;
  }
}

async function reinitialiser() {
  try {
    const res: any = await api('/compte/reinitialiser', {method: 'POST', body: JSON.stringify({jeton: jeton.value, nouveauMotDePasse: nouveau.value})});
    message.value = res.message;
  } catch (e: any) {
    message.value = e.message;
  }
}

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  jeton.value = params.get('jeton') || '';
});
</script>
<template>
  <div>
    <h2>Connexion avancée</h2>
    <form class="auth-form" @submit.prevent="seConnecter">
      <label>Adresse e-mail<input v-model="email" type="email"></label>
      <label>Mot de passe<input v-model="motDePasse" type="password"></label>
      <button class="primary">Se connecter puis continuer</button>
    </form>
    <h3>Mot de passe oublié</h3>
    <button class="text-button" @click="oublie">Recevoir un lien de réinitialisation</button>
    <form class="auth-form" @submit.prevent="reinitialiser">
      <label>Jeton<input v-model="jeton"></label>
      <label>Nouveau mot de passe (12 caractères minimum)<input v-model="nouveau" type="password" autocomplete="new-password" minlength="12"></label>
      <button class="primary">Changer le mot de passe</button>
    </form>
    <p class="subtle" role="status">{{message}}</p>
  </div>
</template>
