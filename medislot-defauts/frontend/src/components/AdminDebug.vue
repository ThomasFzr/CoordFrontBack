<script setup lang="ts">
import {ref, onMounted} from 'vue';
import {chargerRendezVousAdmin, libelleStatutAdmin} from '../services/adminService';
import {exporterCsv} from '../services/rdvService';
import {calculerTarif} from '../services/tarif';

// Les outils de debug (/api/debug : variables d'environnement, export des patients, test de base, réservation
// pour un tiers, mot de passe administrateur écrit ici) ont été retirés : ils n'ont pas leur place dans
// une application livrée (SonarQube java:S4507, S6437, S5122…).
const expression = ref<any>('30 * 1.2');
const resultatCalcul = ref<any>('');
const rdv = ref<any[]>([]);

function calculer() {
  resultatCalcul.value = calculerTarif(String(expression.value)) ?? 'Formule non reconnue : nombre, opérateur (+ - * /), nombre.';
}

async function chargerRdv() {
  try {
    rdv.value = await chargerRendezVousAdmin();
  } catch (e) {
    console.log(e);
  }
}

function telechargerCsv() {
  const blob = new Blob([exporterCsv(rdv.value)], {type: 'text/csv'});
  window.open(URL.createObjectURL(blob));
}

onMounted(() => {
  chargerRdv();
});
</script>
<template>
  <section class="main">
    <div class="section-title"><div><p class="eyebrow dark">ADMINISTRATION</p><h1>Administration</h1></div></div>
    <h2>Calculatrice de tarif</h2>
    <form class="auth-form" @submit.prevent="calculer"><label>Formule<input v-model="expression"></label><button type="submit" class="primary">Calculer</button></form>
    <p>Résultat : {{resultatCalcul}}</p>
    <h2>Mes rendez-vous ({{rdv.length}})</h2>
    <p v-for="r in rdv" :key="r.id">{{r.praticien}} · {{r.date}} {{r.heure}} · {{libelleStatutAdmin(r, false, 'fr')}}</p>
    <button type="button" class="text-button" @click="telechargerCsv">Télécharger le CSV</button>
  </section>
</template>
