// ================================================================
// TESTS — REGLAS DE CONDUCTIVIDAD: ANTIRRETORNO Y VALVULAS DE PRESION
// ================================================================
// `getComponentPassthrough()` es la tabla de reglas hidraulicas por tipo:
//   { canFlow, outPort, pressureDrop, flowLimit }
// Se prueba como funcion pura (dominio, sin DOM ni tablero).
// ================================================================

import { describe, it, expect } from '../harness.js';
import { getComponentPassthrough } from '../../js/core/simulation/index.js';
import { makeComponent } from '../fixtures.js';

describe('Passthrough — valvulas antirretorno', function () {

  it('check: circula In(0)→Out(1) con 0,5 bar y bloquea el retorno', function () {
    const v = makeComponent('check', 1);
    const fwd = getComponentPassthrough(v, 0, 100, 20);
    expect(fwd.canFlow).toBeTruthy();
    expect(fwd.outPort).toBe(1);
    expect(fwd.pressureDrop).toBeCloseTo(0.5);
    expect(fwd.flowLimit).toBeCloseTo(20);
    expect(getComponentPassthrough(v, 1, 100, 20).canFlow).toBeFalsy();
  });

  it('pilot-check: el retorno solo abre con presion de pilotaje mayor que 5 bar', function () {
    const v = makeComponent('pilot-check', 1);
    v._pilotPressure = 0;
    expect(getComponentPassthrough(v, 1, 100, 20).canFlow).toBeFalsy();
    v._pilotPressure = 10;
    const open = getComponentPassthrough(v, 1, 100, 20);
    expect(open.canFlow).toBeTruthy();
    expect(open.outPort).toBe(0);
  });

  it('check-spring: abre al superar la presion de tarado', function () {
    const v = makeComponent('check-spring', 1, { cracking: 5 });
    expect(getComponentPassthrough(v, 0, 4, 20).canFlow).toBeFalsy();
    const open = getComponentPassthrough(v, 0, 5, 20);
    expect(open.canFlow).toBeTruthy();
    expect(open.outPort).toBe(1);
    expect(open.pressureDrop).toBeCloseTo(0.5);
  });

  it('flow-check: A→B limitado al caudal ajustado, B→A libre', function () {
    const v = makeComponent('flow-check', 1, { flow: 10 });
    const fwd = getComponentPassthrough(v, 0, 100, 30);
    expect(fwd.flowLimit).toBeCloseTo(10);
    expect(fwd.pressureDrop).toBeCloseTo(8);        // (30 - 10) * 0,4
    const rev = getComponentPassthrough(v, 1, 100, 30);
    expect(rev.flowLimit).toBeCloseTo(30);
    expect(rev.pressureDrop).toBeCloseTo(0.5);
  });

  it('poclain-ms35: A→B con perdida de 2 bar y rendimiento volumetrico', function () {
    const v = makeComponent('poclain-ms35', 1, { efficiencyVol: 92 });
    const fwd = getComponentPassthrough(v, 0, 200, 50);
    expect(fwd.outPort).toBe(1);
    expect(fwd.pressureDrop).toBeCloseTo(2);
    expect(fwd.flowLimit).toBeCloseTo(46);          // 50 * 0,92
    expect(getComponentPassthrough(v, 2, 200, 50).canFlow).toBeFalsy();
  });
});

describe('Passthrough — valvulas de presion', function () {

  it('relief: abre al alcanzar el ajuste y cierra con histeresis al 92 %', function () {
    const v = makeComponent('relief', 1, { setting: 200 });
    expect(getComponentPassthrough(v, 0, 100, 30).canFlow).toBeFalsy();
    const open = getComponentPassthrough(v, 0, 200, 30);
    expect(open.canFlow).toBeTruthy();
    expect(open.outPort).toBe(1);
    expect(open.pressureDrop).toBeCloseTo(200);     // descarga a tanque
    v._reliefActive = true;
    expect(getComponentPassthrough(v, 0, 185, 30).canFlow).toBeTruthy();  // > 92 %
    expect(getComponentPassthrough(v, 0, 180, 30).canFlow).toBeFalsy();   // cierra
  });

  it('prop-relief: el ajuste se escala con el comando', function () {
    const v = makeComponent('prop-relief', 1, { command: 50, maxSetting: 250 });
    expect(getComponentPassthrough(v, 0, 100, 30).canFlow).toBeFalsy();   // ajuste = 125
    expect(getComponentPassthrough(v, 0, 130, 30).canFlow).toBeTruthy();
  });

  it('sequence-valve: bloquea bajo el ajuste y abre por encima con 2 bar de perdida', function () {
    const v = makeComponent('sequence-valve', 1, { setting: 100 });
    expect(getComponentPassthrough(v, 0, 99, 30).canFlow).toBeFalsy();
    const open = getComponentPassthrough(v, 0, 100, 30);
    expect(open.canFlow).toBeTruthy();
    expect(open.outPort).toBe(1);
    expect(open.pressureDrop).toBeCloseTo(2);
  });

  it('counterbalance: abre con pilotaje suficiente y el retorno es libre', function () {
    const v = makeComponent('counterbalance', 1, { setting: 150 });
    v._pilotPressure = 0;
    expect(getComponentPassthrough(v, 0, 50, 30).canFlow).toBeFalsy();
    v._pilotPressure = 80;
    expect(getComponentPassthrough(v, 0, 50, 30).canFlow).toBeTruthy();
    expect(getComponentPassthrough(v, 1, 50, 30).canFlow).toBeTruthy();
  });

  it('unloading: descarga P→T cuando el piloto supera el ajuste', function () {
    const v = makeComponent('unloading', 1, { setting: 150 });
    v._pilotPressure = 100;
    expect(getComponentPassthrough(v, 0, 200, 30).canFlow).toBeFalsy();
    v._pilotPressure = 160;
    expect(getComponentPassthrough(v, 0, 200, 30).canFlow).toBeTruthy();
  });

  it('pressure-reducing: limita la presion aguas abajo al ajuste', function () {
    const v = makeComponent('pressure-reducing', 1, { setting: 80 });
    const r = getComponentPassthrough(v, 0, 150, 30);
    expect(r.pressureDrop).toBeCloseTo(70);         // 150 - 80
    expect(r.outPort).toBe(1);
  });
});
