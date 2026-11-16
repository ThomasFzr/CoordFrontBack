<script setup lang="ts">
// Carte en plus de la liste, jamais à sa place. Tuiles OpenStreetMap : attribution visible, aucun préchargement,
// seulement les tuiles affichées (politique d'usage de l'OSMF). Leaflet attend [lat, lng] : l'inverse de GeoJSON.
import {onMounted, onBeforeUnmount, ref, watch} from 'vue';
import type {Map as LeafletMap, LayerGroup} from 'leaflet';
import type {Professional} from '../types';
import {RADIUS_KM, formatDistance, type Position} from '../geo';
const props = defineProps<{center: Position; items: Professional[]}>();
const el = ref<HTMLElement | null>(null);
let L: typeof import('leaflet') | null = null, map: LeafletMap | null = null, layer: LayerGroup | null = null;

function draw() {
  if (!L || !map || !layer) return;
  layer.clearLayers();
  const c: [number, number] = [props.center.lat, props.center.lon];
  // Cadrer d'abord : la carte n'a pas de vue avant, et un cercle hors vue ne sait pas calculer ses bornes.
  map.fitBounds(L.latLng(c).toBounds(RADIUS_KM * 2000), {padding: [12, 12]});
  L.circle(c, {radius: RADIUS_KM * 1000, color: '#0873b9', weight: 2, fillOpacity: 0.06}).addTo(layer);
  L.circleMarker(c, {radius: 5, color: '#12334b', fillOpacity: 1}).bindTooltip('Centre de la recherche').addTo(layer);
  for (const p of props.items) {
    if (p.latitude == null || p.longitude == null) continue;
    const distance = p.distanceKm == null ? '' : ` · ${formatDistance(p.distanceKm)}`;
    L.circleMarker([p.latitude, p.longitude], {radius: 8, color: '#34b8b1', weight: 2, fillOpacity: 0.85})
      .bindTooltip(p.name + distance).addTo(layer);
  }
}

onMounted(async () => {
  L = await import('leaflet'); // chargée seulement si la carte s'affiche
  await import('leaflet/dist/leaflet.css');
  if (!el.value) return;
  map = L.map(el.value, {scrollWheelZoom: false});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', // visible
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
  draw();
});
watch(() => [props.center, props.items], draw);
onBeforeUnmount(() => { map?.remove(); map = null; });
</script>
<template>
 <figure class="nearby-map">
  <div ref="el" class="nearby-map-canvas" role="img"
       :aria-label="`Carte : ${items.length} praticien${items.length > 1 ? 's' : ''} dans un cercle de ${RADIUS_KM} km. La liste ci-dessous donne les mêmes informations.`"></div>
  <figcaption>Cercle de {{ RADIUS_KM }} km autour du centre de la recherche · distances à vol d’oiseau</figcaption>
 </figure>
</template>
