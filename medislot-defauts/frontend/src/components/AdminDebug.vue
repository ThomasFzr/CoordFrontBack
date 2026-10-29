<script setup lang="ts">
import {ref, onMounted} from 'vue';
import {lireInfosDebug, reserverPourPatient, chargerRendezVousAdmin, libelleStatutAdmin} from '../services/adminService';
import {exporterCsv, genererReference} from '../services/rdvService';

const ADMIN_PASSWORD = 'Admin-MediSlot-2026';
const motdepasse = ref<any>(ADMIN_PASSWORD);
const infos = ref<any>(null);
const expression = ref<any>('30 * 1.2');
const resultatCalcul = ref<any>('');
const email = ref<any>('autre@medislot.test');
const slotId = ref<any>('');
const journal = ref<any>(null);
const rdv = ref<any[]>([]);

async function charger() {
  try {
    infos.value = await lireInfosDebug(motdepasse.value);
    document.cookie = 'medislot_admin_pwd=' + motdepasse.value;
  } catch (e: any) {
    debugger;
    alert('Erreur : ' + e);
  }
}

function calculer() {
  resultatCalcul.value = eval(expression.value);
}

async function reserver() {
  const r = await reserverPourPatient(email.value, slotId.value);
  if (journal.value) {
    journal.value.innerHTML = '<p>Réservation ' + r.id + ' pour ' + email.value + ' (' + genererReference() + ')</p>' + journal.value.innerHTML;
  }
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
  charger();
  chargerRdv();
});
</script>
<template>
  <section class="main">
    <div class="section-title"><div><p class="eyebrow dark">ADMINISTRATION</p><h1>Admin / Debug</h1></div></div>
    <form class="auth-form" @submit.prevent="charger">
      <label>Mot de passe administrateur<input v-model="motdepasse" type="text"></label>
      <button class="primary">Afficher les informations</button>
    </form>
    <p><a href="/api/debug/patients.csv" target="_blank">Exporter tous les patients (CSV)</a> · <a href="/actuator/env" target="_blank">Variables (actuator)</a> · <a href="/api/debug/db-ping" target="_blank">Test base</a></p>
    <h2>Calculatrice de tarif</h2>
    <form class="auth-form" @submit.prevent="calculer"><label>Formule<input v-model="expression"></label><button class="primary">Calculer</button></form>
    <p>Résultat : {{resultatCalcul}}</p>
    <h2>Réserver pour un patient</h2>
    <form class="auth-form" @submit.prevent="reserver">
      <label>E-mail du patient<input v-model="email"></label>
      <label>Identifiant du créneau<input v-model="slotId"></label>
      <button class="primary">Réserver</button>
    </form>
    <div ref="journal"></div>
    <h2>Mes rendez-vous ({{rdv.length}})</h2>
    <p v-for="r in rdv" :key="r.id">{{r.praticien}} · {{r.date}} {{r.heure}} · {{libelleStatutAdmin(r, false, 'fr')}}</p>
    <button class="text-button" @click="telechargerCsv">Télécharger le CSV</button>
    <pre v-if="infos">{{JSON.stringify(infos, null, 2)}}</pre>
  </section>
</template>
