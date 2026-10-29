// S1523 : la formule saisie n'est plus exécutée par eval(). On n'accepte que « nombre opérateur nombre »
// (ex. « 30 * 1.2 ») ; toute autre saisie est refusée au lieu d'être interprétée comme du JavaScript.
const FORMULE = /^\s*(\d{1,9}(?:[.,]\d{1,4})?)\s*([+\-*/])\s*(\d{1,9}(?:[.,]\d{1,4})?)\s*$/;

export function calculerTarif(formule: string): number | null {
  const m = FORMULE.exec(formule);
  if (!m) return null;
  const a = Number(m[1].replace(',', '.'));
  const b = Number(m[3].replace(',', '.'));
  switch (m[2]) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    default: return b === 0 ? null : a / b;
  }
}
