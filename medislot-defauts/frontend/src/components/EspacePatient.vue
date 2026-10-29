<script setup lang="ts">
import {ref} from 'vue';
import MonProfil from './MonProfil.vue';
import Messagerie from './Messagerie.vue';
import ConnexionAvancee from './ConnexionAvancee.vue';
import {useSession} from '../stores/session';

const props = defineProps<{onglet?: string}>();
const session = useSession();
const courant = ref<string>(props.onglet || (session.user ? 'profil' : 'compte'));
</script>
<template>
  <section class="main">
    <div class="section-title"><div><p class="eyebrow dark">ESPACE PATIENT</p><h1>Mon espace</h1></div></div>
    <nav class="pagination" aria-label="Espace patient">
      <button :disabled="courant==='profil'" @click="courant='profil'">Mon profil</button>
      <button :disabled="courant==='messagerie'" @click="courant='messagerie'">Messagerie</button>
      <button :disabled="courant==='compte'" @click="courant='compte'">Connexion avancée</button>
    </nav>
    <p v-if="!session.user && courant!=='compte'" class="alert error">Connectez-vous pour accéder à cette page.</p>
    <MonProfil v-else-if="courant==='profil'"/>
    <Messagerie v-else-if="courant==='messagerie'"/>
    <ConnexionAvancee v-else/>
  </section>
</template>
