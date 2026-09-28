// ================================================================
// TESTS — SOLVER: MOTORES (INCLUIDO EL LSHT POCLAIN MS35)
// ================================================================
// Formulas didacticas:
//   motor:   T = P x V / 20pi [Nm]      n = Q x 1000 / V [rpm]
//   poclain: T = min(P x V / 20pi, Tmax) x etaMec
//            n = min(Q x 1000 / V x etaVol, nMax)
// ================================================================

import { describe, it, expect } from '../harness.js';
import { buildCircuit, comp, linkBetween, solve } from '../fixtures.js';

describe('Solver — motores', function () {

  it('motor: par = P x cilindrada / 20pi  y  rpm = Q x 1000 / cilindrada', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['motor', 2, { displacement: 25 }],
        ['reservoir', 3]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0]]
    });
    solve(c);
    const motor = comp(c, 2);
    expect(motor._torque).toBeCloseTo(150 * 25 / (20 * Math.PI), 0.001);
    expect(motor._rpm).toBeCloseTo(1200, 0.001);
    expect(motor._localPressure).toBeCloseTo(150);
  });

  it('motor bidireccional: usa la misma formulacion', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 200, flow: 20 }],
        ['motor-bidir', 2, { displacement: 40 }],
        ['reservoir', 3]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0]]
    });
    solve(c);
    expect(comp(c, 2)._torque).toBeCloseTo(200 * 40 / (20 * Math.PI), 0.001);
  });

  it('poclain-ms35: -2 bar y caudal reducido por el rendimiento volumetrico', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['poclain-ms35', 2, { displacement: 250, efficiencyVol: 92, efficiencyMech: 90 }],
        ['reservoir', 3]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0]]
    });
    solve(c);
    const salida = linkBetween(c, 2, 1, 3, 0);
    expect(salida.pressure).toBeCloseTo(148);        // 150 - 2 bar
    expect(salida.flow).toBeCloseTo(27.6);           // 30 x 0,92
  });

  it('poclain-ms35: par = min(P x V / 20pi, Tmax) x etaMec y velocidad con derating', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['poclain-ms35', 2, { displacement: 250, efficiencyVol: 92, efficiencyMech: 90 }],
        ['reservoir', 3]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0]]
    });
    solve(c);
    const poclain = comp(c, 2);
    const parTeorico = 150 * 250 / (20 * Math.PI);   // 596,8 Nm (menor que Tmax 1800)
    expect(poclain._torque).toBeCloseTo(parTeorico * 0.9, 0.01);
    const rpmEsperada = Math.min((30 * 1000 / 250) * 0.92, 300);   // 110,4 rpm
    expect(poclain._rpm).toBeCloseTo(rpmEsperada, 0.01);
    expect(poclain._speedFactor).toBeCloseTo(rpmEsperada / 300, 1e-9);
  });
});
