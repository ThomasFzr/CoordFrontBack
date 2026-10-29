import {describe,it,expect} from 'vitest';
import {calculerTarif} from './tarif';

describe('calculerTarif',()=>{
 it('calcule une formule simple',()=>{expect(calculerTarif('30 * 1.2')).toBeCloseTo(36);expect(calculerTarif('30,5 + 2')).toBe(32.5);expect(calculerTarif('10 - 4')).toBe(6);expect(calculerTarif('9 / 3')).toBe(3);});
 it('refuse tout ce qui n’est pas « nombre opérateur nombre »',()=>{expect(calculerTarif('alert(1)')).toBeNull();expect(calculerTarif('1 + 2 + 3')).toBeNull();expect(calculerTarif('')).toBeNull();});
 it('refuse la division par zéro',()=>{expect(calculerTarif('5 / 0')).toBeNull();});
});
