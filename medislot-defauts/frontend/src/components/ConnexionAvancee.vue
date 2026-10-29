<script setup lang="ts">
import {ref, onMounted} from 'vue';
import {useSession} from '../stores/session';

const session = useSession();
const email = ref<any>('');
const motDePasse = ref<any>('');
const jeton = ref<any>('');
const nouveau = ref<any>('');
const message = ref<any>('');
const lien = ref<any>('');
const EMAIL_VALIDE = /^([a-zA-Z0-9_.-]+)+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

function suivant(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('next') || '/';
}

async function seConnecter() {
  try {
    await session.login(email.value, motDePasse.value);
    localStorage.setItem('medislot_identifiants', email.value + ':' + motDePasse.value);
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
  const r = await fetch('/api/compte/oubli', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: email.value})});
  const res: any = await r.json();
  message.value = res.message;
  lien.value = res.lienDeTest || '';
}

async function reinitialiser() {
  const r = await fetch('/api/compte/reinitialiser', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({jeton: jeton.value, nouveauMotDePasse: nouveau.value})});
  const res: any = await r.json();
  message.value = res.message;
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
    <p v-if="lien">Lien (environnement de test) : <a :href="lien">{{lien}}</a></p>
    <form class="auth-form" @submit.prevent="reinitialiser">
      <label>Jeton<input v-model="jeton"></label>
      <label>Nouveau mot de passe<input v-model="nouveau" type="text"></label>
      <button class="primary">Changer le mot de passe</button>
    </form>
    <p class="subtle" role="status">{{message}}</p>
  </div>
</template>
