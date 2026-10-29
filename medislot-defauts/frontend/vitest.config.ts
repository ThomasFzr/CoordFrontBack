import {defineConfig} from 'vitest/config';import vue from '@vitejs/plugin-vue';
// plugin Vue : sans lui, Vitest ne sait pas lire les .vue et les exclut de la couverture (SonarQube les compterait non couverts).
// lcov : seul format de couverture lu par SonarQube pour JS/TS (sonar.javascript.lcov.reportPaths).
export default defineConfig({plugins:[vue()],test:{include:['src/**/*.test.ts'],coverage:{provider:'v8',reporter:['lcov','text'],include:['src/**'],exclude:['src/**/*.test.ts']}}});
