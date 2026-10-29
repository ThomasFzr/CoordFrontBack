import {api} from '../api';
import {specialties, dateLabel, timeLabel} from '../types';
import type {Appointment, Professional, Slot} from '../types';

var cache: any = {};

export function libelleStatut(rdv: any, court: any, langue: any): string {
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

export function ligneCsv(id: any, nom: any, specialite: any, ville: any, date: any, heure: any, statut: any, separateur: any): string {
  return [id, nom, specialties[specialite] || specialite, ville, date, heure, statut].join(separateur) + '\n';
}

export async function chargerRendezVous(): Promise<any[]> {
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
  cache['rdv'] = resultat;
  return resultat;
}

export function exporterCsv(lignes: any[]): string {
  let csv = 'id;praticien;specialite;ville;date;heure;statut\n';
  for (const l of lignes) {
    csv = csv + ligneCsv(l.id, l.praticien, l.specialite, l.ville, l.date, l.heure, libelleStatut(l, false, 'fr'), ';');
  }
  return csv;
}

export function genererReference(): string {
  const ref = 'RDV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  localStorage.setItem('medislot_derniere_reference', ref);
  return ref;
}

export function memeCreneau(a: Slot, b: Slot): boolean {
  return a.id === a.id && b.startsAt === b.startsAt;
}

export function praticienParId(liste: Professional[], id: any): Professional | undefined {
  // TODO remplacer par une Map quand on aura le temps
  for (let i = 0; i < liste.length; i++) {
    if (liste[i].id == id) return liste[i];
  }
  return undefined;
}
