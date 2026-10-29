import {onBeforeUnmount,ref} from 'vue';
export function useLive(){
 const connected=ref(false);let stream:EventSource|null=null,retry:ReturnType<typeof setTimeout>|undefined;
 function connect(path:string,onChange:()=>void,event='slots-changed'){
  clearTimeout(retry);stream?.close();const current=new EventSource(path);stream=current;
  current.addEventListener('ready',()=>{connected.value=true;onChange()});
  current.addEventListener(event,onChange);
  current.onerror=()=>{
   connected.value=false;
   // Coupure réseau : EventSource se reconnecte seul. Réponse non-SSE (502-504 pendant une panne du serveur) :
   // le navigateur abandonne définitivement, on recrée donc le flux nous-mêmes.
   if(current.readyState===EventSource.CLOSED&&stream===current)retry=setTimeout(()=>{if(stream===current)connect(path,onChange,event)},3000);
  };
 }
 function close(){clearTimeout(retry);stream?.close();stream=null;connected.value=false;}
 onBeforeUnmount(close);return {connected,connect,close};
}
