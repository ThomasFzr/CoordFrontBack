export interface Professional {id:number;name:string;specialty:string;city:string;address:string;bio:string;fee:number}
export interface Slot {id:number;professionalId:number;startsAt:string;endsAt:string}
export interface Appointment {id:number;slotId:number;professionalId:number;professionalName:string;specialty:string;address:string;city:string;startsAt:string;status:'CONFIRMED'|'CANCELLED'}
export interface Identity {id:number;name:string;email:string;role:string}
export interface Page<T> {items:T[];page:number;size:number;total:number}
export type Variant='A'|'B';
export interface Notice {id:number;message:string;createdAt:string}
export const specialties:Record<string,string>={general:'Médecine générale',cardiology:'Cardiologie',dermatology:'Dermatologie',dentistry:'Chirurgie dentaire'};
export const dateLabel=(date:string)=>new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Paris'}).format(new Date(date));
export const timeLabel=(date:string)=>new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}).format(new Date(date));
