import {onBeforeUnmount,ref} from 'vue';
export function useLive(){
 const connected=ref(false);let stream:EventSource|null=null;
 function connect(path:string,onChange:()=>void,event='slots-changed'){
  stream?.close();stream=new EventSource(path);
  stream.addEventListener('ready',()=>{connected.value=true;onChange()});
  stream.addEventListener(event,onChange);
  stream.onerror=()=>{connected.value=false};
 }
 function close(){stream?.close();stream=null;connected.value=false;}
 onBeforeUnmount(close);return {connected,connect,close};
}
