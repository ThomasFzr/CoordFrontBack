import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',workers:1,use:{channel:process.env.PW_CHANNEL,baseURL:process.env.APP_URL||'http://localhost:8088',trace:'retain-on-failure'},reporter:[['list'],['html',{open:'never'}]]});
