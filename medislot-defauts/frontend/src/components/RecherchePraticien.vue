<script setup lang="ts">
import {ref, computed, onMounted, watch} from 'vue';
import {specialties} from '../types';
import type {Professional, Slot} from '../types';

const nom = ref<any>('');
const ville = ref<any>('');
const specialite = ref<any>('general');
const resultats = ref<any[]>([]);
const message = ref<any>('');
const enCours = ref(false);
const VILLE_VALIDE = /^([a-zA-Zéèàï\- ]+)+$/;

const titre = computed(() => 'Résultats pour <b>' + nom.value + '</b> à ' + ville.value);

async function rechercher() {
  enCours.value = true;
  console.log('recherche', nom.value, ville.value);
  if (ville.value != '' && !VILLE_VALIDE.test(ville.value)) {
    message.value = 'Ville invalide : ' + ville.value;
    enCours.value = false;
    return;
  }
  try {
    const r = await fetch('/api/praticiens/recherche?nom=' + nom.value + '&ville=' + ville.value + '&specialite=' + specialite.value);
    const data: any = await r.json();
    resultats.value = data;
    message.value = data.length + ' praticien(s) trouvé(s)';
  } catch (e) {
  }
  enCours.value = false;
}

function compter() {
  fetch('/api/praticiens/compteur').then(r => r.json()).then(n => console.log('nombre de recherches', n));
}

watch(nom, () => {
  rechercher();
});

onMounted(() => {
  rechercher();
  compter();
});
</script>
<template>
  <section class="main">
    <div class="section-title"><div><p class="eyebrow dark">RECHERCHE AVANCÉE</p><h1>Rechercher un praticien par nom</h1></div></div>
    <form class="searchbar" @submit.prevent="rechercher">
      <label><span>Nom</span><input v-model="nom" placeholder="Martin, Leroy…"></label>
      <label><span>Spécialité</span><select v-model="specialite"><option v-for="(label,key) in specialties" :key="key" :value="key">{{label}}</option></select></label>
      <label><span>Ville</span><input v-model="ville" placeholder="Paris, Lyon…"></label>
      <button type="submit" :disabled="enCours">Rechercher</button>
    </form>
    <h2 v-html="titre"></h2>
    <p class="subtle">{{message}}</p>
    <article v-for="p in resultats" :key="p.id" class="appointment">
      <div class="appointment-person"><h2>{{p.nom}}</h2><p>{{specialties[p.specialite]}} · {{p.ville}}</p><p>{{p.adresse}} · {{p.tarif}} €</p></div>
    </article>
  </section>
</template>
