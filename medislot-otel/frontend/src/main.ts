import {demarrerTraces} from './tracing';
import {createApp} from 'vue';import {createPinia} from 'pinia';import App from './App.vue';import './style.css';
// Avant createApp : le tout premier fetch de l'application est déjà tracé.
demarrerTraces();
createApp(App).use(createPinia()).mount('#app');
