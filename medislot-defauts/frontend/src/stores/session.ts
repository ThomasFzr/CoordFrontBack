import {defineStore} from 'pinia';import {ref} from 'vue';import {api,refreshCsrf,ApiError} from '../api';import type {Identity} from '../types';
export const useSession=defineStore('session',()=>{
 const user=ref<Identity|null>(null);
 async function load(){try{user.value=await api<Identity>('/me');localStorage.setItem('medislot_user',JSON.stringify(user.value))}catch(e){if(e instanceof ApiError&&e.status===401)user.value=null;else throw e}}
 async function login(email:string,password:string){await refreshCsrf();await api('/login',{method:'POST',body:new URLSearchParams({username:email,password})});await refreshCsrf();await load();}
 async function logout(){await api('/logout',{method:'POST'});user.value=null;await refreshCsrf();}
 return {user,load,login,logout};
});
