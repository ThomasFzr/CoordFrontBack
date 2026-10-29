let csrf:{token:string;headerName:string}|null=null;
// fields : message du serveur par champ (errors[] du ProblemDetail 400), pour l'afficher sous le bon champ.
export class ApiError extends Error {constructor(message:string,public status:number,public fields:Record<string,string>={}){super(message)}}
// Réseau coupé ou serveur derrière le proxy injoignable : la demande n'a pas pu être traitée.
export const unreachable=(e:unknown)=>e instanceof TypeError||(e instanceof ApiError&&e.status>=502&&e.status<=504);
export async function refreshCsrf(){const r=await fetch('/api/csrf',{credentials:'same-origin'});if(!r.ok)throw new ApiError('Impossible de sécuriser la session.',r.status);csrf=await r.json();}
export async function api<T>(path:string,init:RequestInit={}):Promise<T>{
 const method=(init.method||'GET').toUpperCase();const headers=new Headers(init.headers);
 if(!['GET','HEAD','OPTIONS'].includes(method)){if(!csrf)await refreshCsrf();headers.set(csrf!.headerName,csrf!.token);}
 if(init.body&&!(init.body instanceof URLSearchParams))headers.set('Content-Type','application/json');
 const response=await fetch('/api'+path,{...init,headers,credentials:'same-origin'});
 // Réponse servie par le service worker depuis le cache (serveur injoignable) : la page l'indique.
 if(typeof window!=='undefined')window.dispatchEvent(new Event(response.headers.get('X-MediSlot-Offline')?'medislot:cached-data':'medislot:fresh-data'));
 if(!response.ok){let message='Le service est momentanément indisponible.';const fields:Record<string,string>={};try{const p=await response.json();message=p.detail||p.title||message;for(const e of p.errors??[])if(e?.field)fields[e.field]=fields[e.field]?`${fields[e.field]} ${e.message}`:e.message}catch{}throw new ApiError(message,response.status,fields);}
 if(response.status===204)return undefined as T;
 return response.json();
}
