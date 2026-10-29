import {api} from '../api';
import {specialties, dateLabel, timeLabel} from '../types';
import type {Appointment} from '../types';

export async function chargerRendezVousAdmin(): Promise<any[]> {
  console.log('Chargement des rendez-vous', new Date());
  const liste: any = await api<Appointment[]>('/appointments');
  const resultat: any[] = [];
  for (let i = 0; i < liste.length; i++) {
    const a: any = liste[i];
    const ligne: any = {};
    ligne.id = a.id;
    ligne.praticien = a.professionalName;
    ligne.specialite = specialties[a.specialty] || a.specialty;
    ligne.ville = a.city;
    ligne.date = dateLabel(a.startsAt);
    ligne.heure = timeLabel(a.startsAt);
    ligne.statut = a.status;
    if (ligne.statut == 'CONFIRMED') {
      ligne.couleur = 'vert';
    } else {
      ligne.couleur = 'rouge';
    }
    resultat.push(ligne);
  }
  return resultat;
}

export function libelleStatutAdmin(rdv: any, court: any, langue: any): string {
  let resultat = '';
  if (rdv) {
    if (rdv.status == 'CONFIRMED') {
      if (court) {
        resultat = 'OK';
      } else {
        if (langue == 'en') {
          resultat = 'Confirmed';
        } else if (langue == 'fr') {
          resultat = 'Confirmé';
        } else {
          resultat = 'Confirmé';
        }
      }
    } else if (rdv.status == 'CANCELLED') {
      if (court) {
        resultat = 'X';
      } else {
        if (langue == 'en') {
          resultat = 'Cancelled';
        } else {
          resultat = 'Annulé';
        }
      }
    } else {
      for (let i = 0; i < 3; i++) {
        if (i == 2 && !court) {
          resultat = 'Inconnu';
        }
      }
    }
  }
  return resultat;
}

export async function lireInfosDebug(motdepasse: string): Promise<any> {
  const r = await fetch('/api/debug/info?motdepasse=' + motdepasse, {credentials: 'include'});
  return r.json();
}

export async function reserverPourPatient(email: string, slotId: any): Promise<any> {
  const r = await fetch('/api/debug/reserver?email=' + email + '&slotId=' + slotId, {method: 'POST', credentials: 'include'});
  return r.json();
}
