// ================================================================
// TESTS — RESTRICCIONES, REPARTO DE CAUDAL Y MEDICION
// ================================================================
// Continuacion de la tabla de `getComponentPassthrough()` (dominio puro).
// ================================================================

import { describe, it, expect } from '../harness.js';
import { getComponentPassthrough } from '../../js/core/simulation/index.js';
import { makeComponent } from '../fixtures.js';

describe('Passthrough — restricciones y control de caudal', function () {

  it('flow-control: limita el caudal al valor ajustado y genera caida de presion', function () {
    const v = makeComponent('flow-control', 1, { flow: 15 });
    const r = getComponentPassthrough(v, 0, 150, 30);
    expect(r.flowLimit).toBeCloseTo(15);
    expect(r.pressureDrop).toBeCloseTo(7.5);        // (30 - 15) * 0,5
    expect(r.outPort).toBe(1);
  });

  it('throttle: caudal proporcional a la apertura y el resto se pierde en presion', function () {
    const v = makeComponent('throttle', 1, { opening: 50 });
    const r = getComponentPassthrough(v, 0, 100, 30);
    expect(r.flowLimit).toBeCloseTo(15);            // 30 * 0,5
    expect(r.pressureDrop).toBeCloseTo(15);         // 100 * (1 - 0,5) * 0,3
  });

  it('orifice: dP = Q^2 / (d^2 * 2)  ->  1,5 mm y 30 L/min dan 200 bar', function () {
    const v = makeComponent('orifice', 1, { diameter: 1.5 });
    const r = getComponentPassthrough(v, 0, 150, 30);
    expect(r.canFlow).toBeTruthy();
    expect(r.pressureDrop).toBeCloseTo(200);        // 900 / 4,5
    expect(r.flowLimit).toBeCloseTo(30);
  });

  it('prop-flow: caudal proporcional al comando', function () {
    const v = makeComponent('prop-flow', 1, { command: 50, maxFlow: 40 });
    const r = getComponentPassthrough(v, 0, 150, 30);
    expect(r.flowLimit).toBeCloseTo(20);
  });

  it('flow-comp: limita el caudal al ajuste', function () {
    const v = makeComponent('flow-comp', 1, { flow: 12 });
    const r = getComponentPassthrough(v, 0, 150, 30);
    expect(r.flowLimit).toBeCloseTo(12);
    expect(r.outPort).toBe(1);
  });

  it('intensifier: multiplica la presion y divide el caudal por la relacion', function () {
    const v = makeComponent('intensifier', 1, { ratio: 4 });
    const r = getComponentPassthrough(v, 0, 100, 20);
    expect(r.outPort).toBe(2);
    expect(r.pressureDrop).toBeCloseTo(-300);       // dP negativo = multiplicar
    expect(r.flowLimit).toBeCloseTo(5);             // 20 / 4
  });
});

describe('Passthrough — reparto, prioridad y medicion', function () {

  it('flow-divider: P entra y sale por dos puertos (outPort -2) guardando el reparto', function () {
    const v = makeComponent('flow-divider', 1, { ratio: 60 });
    const r = getComponentPassthrough(v, 0, 150, 30);
    expect(r.outPort).toBe(-2);
    expect(v._dividerRatioA).toBeCloseTo(0.6);
  });

  it('priority: limita el caudal de CF al ajuste y recuerda el caudal total', function () {
    const v = makeComponent('priority', 1, { setting: 15 });
    const r = getComponentPassthrough(v, 0, 150, 30);
    expect(r.flowLimit).toBeCloseTo(15);
    expect(r.outPort).toBe(1);
    expect(v._priorityFlow).toBeCloseTo(30);
  });

  it('shuttle: deja pasar la presion mayor y bloquea la menor', function () {
    const v = makeComponent('shuttle', 1);
    getComponentPassthrough(v, 0, 120, 30);
    expect(getComponentPassthrough(v, 1, 80, 30).canFlow).toBeFalsy();
    const higher = getComponentPassthrough(v, 1, 140, 30);
    expect(higher.canFlow).toBeTruthy();
    expect(higher.outPort).toBe(2);
  });

  it('and-valve: exige presion en ambos pilotos', function () {
    const v = makeComponent('and-valve', 1);
    expect(getComponentPassthrough(v, 0, 100, 30).canFlow).toBeFalsy();
    getComponentPassthrough(v, 1, 90, 30);
    expect(getComponentPassthrough(v, 0, 100, 30).canFlow).toBeTruthy();
  });

  it('tee: cualquier puerto reparte a los otros dos (outPort -2)', function () {
    const v = makeComponent('tee', 1);
    expect(getComponentPassthrough(v, 0, 100, 30).outPort).toBe(-2);
    expect(getComponentPassthrough(v, 1, 100, 30).outPort).toBe(-2);
    expect(getComponentPassthrough(v, 2, 100, 30).outPort).toBe(-2);
  });

  it('accumulator: se carga por encima de la precarga y no conduce', function () {
    const v = makeComponent('accumulator', 1, { precharge: 90 });
    const r = getComponentPassthrough(v, 0, 100, 30);
    expect(r.canFlow).toBeFalsy();
    expect(v._charge).toBeCloseTo(0.002);
  });

  it('pump-hand: no participa como passthrough (es una fuente)', function () {
    const v = makeComponent('pump-hand', 1);
    expect(getComponentPassthrough(v, 1, 50, 2).canFlow).toBeFalsy();
  });

  it('filter: passthrough con 1 bar de perdida segun la tabla', function () {
    const v = makeComponent('filter', 1);
    const r = getComponentPassthrough(v, 0, 150, 30);
    expect(r.canFlow).toBeTruthy();
    expect(r.outPort).toBe(1);
    expect(r.pressureDrop).toBeCloseTo(1);          // la tabla dice 1 bar...
    expect(r.flowLimit).toBeCloseTo(30);
  });

  it('gauge: ramal ciego, no conduce', function () {
    const v = makeComponent('gauge', 1);
    expect(getComponentPassthrough(v, 0, 150, 30).canFlow).toBeFalsy();
  });

  it('flow-meter y heater: passthrough transparente por la tabla', function () {
    expect(getComponentPassthrough(makeComponent('flow-meter', 1), 0, 150, 30).outPort).toBe(1);
    expect(getComponentPassthrough(makeComponent('heater', 1), 0, 150, 30).pressureDrop).toBeCloseTo(1);
  });

  it('tipo sin regla en la tabla: fallback transparente (outPort -1)', function () {
    // Los cilindros no tienen regla en esta tabla porque el solver los trata con
    // su propia fase (PASO 12); el fallback los declara conductivos y sin perdida.
    const v = makeComponent('cylinder-da', 1);
    const r = getComponentPassthrough(v, 0, 150, 30);
    expect(r.canFlow).toBeTruthy();
    expect(r.outPort).toBe(-1);
    expect(r.pressureDrop).toBeCloseTo(0);
    expect(r.flowLimit).toBeCloseTo(30);
  });
});
