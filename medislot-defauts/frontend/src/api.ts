let csrf:{token:string;headerName:string}|null=null;
export class ApiError extends Error {constructor(message:string,public status:number){super(message)}}
export async function refreshCsrf(){const r=await fetch('/api/csrf',{credentials:'same-origin'});if(!r.ok)throw new ApiError('Impossible de sécuriser la session.',r.status);csrf=await r.json();localStorage.setItem('medislot_csrf',JSON.stringify(csrf));}
export async function api<T>(path:string,init:RequestInit={}):Promise<T>{
 const method=(init.method||'GET').toUpperCase();const headers=new Headers(init.headers);
 if(!['GET','HEAD','OPTIONS'].includes(method)){if(!csrf)await refreshCsrf();headers.set(csrf!.headerName,csrf!.token);}
 if(init.body&&!(init.body instanceof URLSearchParams))headers.set('Content-Type','application/json');
 const response=await fetch('/api'+path,{...init,headers,credentials:'same-origin'});
 if(!response.ok){let message='Le service est momentanément indisponible.';try{const p=await response.json();message=p.detail||p.title||message}catch{}throw new ApiError(message,response.status);}
 if(response.status===204)return undefined as T;
 return response.json();
}
