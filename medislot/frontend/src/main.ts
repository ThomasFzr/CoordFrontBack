import {createApp} from 'vue';import {createPinia} from 'pinia';import App from './App.vue';import './style.css';createApp(App).use(createPinia()).mount('#app');
// Hors ligne : seulement l'application construite (en développement, Vite sert des fichiers changeants).
if(import.meta.env.PROD&&'serviceWorker' in navigator)window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{})});
