// ================================================================
// TESTS — SOLVER: CILINDROS (ACTUADOR LINEAL)
// ================================================================
// Valores de referencia ("golden") del circuito completo y de la formula
// didactica F = P x A x 0,1 / 1000 [kN].
// ================================================================

import { describe, it, expect } from '../harness.js';
import { buildCircuit, comp, linkBetween, solve } from '../fixtures.js';

const DPI_4 = Math.PI / 4;

describe('Solver — valvula direccional + cilindro de doble efecto', function () {

  // Bomba 150 bar / 30 L/min -> DCV 4/3 -> cilindro de 80 mm con vastago de 45 mm.
  // Perdida de la valvula: 3 % de presion y 1 % de caudal.
  const P_LINEA = 150 * 0.97;                 // 145,5 bar
  const Q_LINEA = 30 * 0.99;                  // 29,70 L/min
  const A_BORE = DPI_4 * 80 * 80;             // 5.026,55 mm2
  const A_ANN = DPI_4 * (80 * 80 - 45 * 45);  // 3.436,12 mm2

  function circuitoCilindro(position) {
    return buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['dcv43', 2, { position: position, centerType: 'Closed' }],
        ['cylinder-da', 3, { bore: 80, rod: 45 }],
        ['reservoir', 4]
      ],
      links: position === 'Extend'
        ? [[1, 0, 2, 0], [2, 2, 3, 0], [3, 1, 2, 3], [2, 1, 4, 0]]
        : [[1, 0, 2, 0], [2, 3, 3, 1], [3, 0, 2, 2], [2, 1, 4, 0]]
    });
  }

  it('en Extend el cilindro recibe 145,5 bar y 29,7 L/min (3 % y 1 % de perdida)', function () {
    const c = circuitoCilindro('Extend');
    solve(c);
    const lineaA = linkBetween(c, 2, 2, 3, 0);
    expect(lineaA.pressure).toBeCloseTo(P_LINEA);
    expect(lineaA.flow).toBeCloseTo(Q_LINEA);
    expect(comp(c, 3)._localPressure).toBeCloseTo(P_LINEA);
    expect(comp(c, 3)._extending).toBeTruthy();
  });

  it('la velocidad animada es proporcional al caudal: factor = Q / 30 x 0,8', function () {
    const c = circuitoCilindro('Extend');
    solve(c);
    expect(comp(c, 3)._speedFactor).toBeCloseTo(Q_LINEA / 30 * 0.8);
  });

  it('en Retract el cilindro se marca como no extendido', function () {
    const c = circuitoCilindro('Retract');
    solve(c);
    expect(linkBetween(c, 2, 3, 3, 1).pressure).toBeCloseTo(P_LINEA);
    expect(comp(c, 3)._extending).toBeFalsy();
  });

  it('con la valvula en centro cerrado el cilindro no recibe presion', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['dcv43', 2, { position: 'Center', centerType: 'Closed' }],
        ['cylinder-da', 3, { bore: 80, rod: 45 }],
        ['reservoir', 4]
      ],
      links: [[1, 0, 2, 0], [2, 2, 3, 0], [3, 1, 2, 3], [2, 1, 4, 0]]
    });
    solve(c);
    expect(comp(c, 3)._localPressure).toBe(0);
    expect(comp(c, 3)._speedFactor).toBe(0);
  });

  it('el centro tandem desvia P a tanque y deja el cilindro sin presion', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['dcv43', 2, { position: 'Center', centerType: 'Tandem' }],
        ['cylinder-da', 3, { bore: 80, rod: 45 }],
        ['reservoir', 4]
      ],
      links: [[1, 0, 2, 0], [2, 2, 3, 0], [3, 1, 2, 3], [2, 1, 4, 0]]
    });
    solve(c);
    expect(comp(c, 3)._localPressure).toBe(0);
    expect(linkBetween(c, 2, 1, 4, 0).pressure).toBeGreaterThan(100);
  });

  it('formula didactica F = P x A x 0,1 / 1000 -> 73,1 kN en extension', function () {
    const fExtend = P_LINEA * 0.1 * A_BORE / 1000;
    const fRetract = P_LINEA * 0.1 * A_ANN / 1000;
    expect(fExtend).toBeCloseTo(73.136, 0.01);
    expect(fRetract).toBeCloseTo(50.0, 0.1);
    expect(fRetract).toBeLessThan(fExtend);
  });

  it('el solver aplica exactamente esa misma formula con la presion real', function () {
    const c = circuitoCilindro('Extend');
    solve(c);
    const p = comp(c, 3)._localPressure;
    const bore = comp(c, 3).values.bore;
    const fuerza = p * 0.1 * (DPI_4 * bore * bore) / 1000;
    expect(fuerza).toBeCloseTo(73.136, 0.01);
  });
});
