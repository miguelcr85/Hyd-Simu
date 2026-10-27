// ================================================================
// TESTS — INTEGRACION DE LA CADENA DE POTENCIA (motor → transmisión → bombas → motor LSHT)
// ================================================================
// Reproduce el circuito de maquinaria forestal con el que se detecto que la
// simulacion no daba valores: engine + pump-drive + bombas variables + MS35.
//
// Puertos reales (js/core/component-definitions.js):
//   engine                0 = P (salida de potencia)
//   pump-drive            0 = IN · 1 = OUT1 · 2 = OUT2 · 3 = OUT3
//   pump-var-displacement 0 = P · 1 = T · 2 = IN (entrada de RPM)
//   pump-var (Variable Pump) 0 = P · 1 = T
//   poclain-ms35          0 = A · 1 = B · 2 = D (drenaje)
// ================================================================

import { describe, it, expect } from '../harness.js';
import { buildCircuit, comp, linkBetween, solve, COMP_DEFS } from '../fixtures.js';
import { componentDocsHtml } from '../../js/ui/componentDocs.js';
import { unitHelpers, SYSTEMS } from '../../js/core/units.js';
import { getComponent } from '../../js/core/registry.js';

/** Cadena de potencia completa con las dos bombas de desplazamiento variable. */
function powertrain(bombaType) {
  return buildCircuit({
    comps: [
      ['engine', 1, { power: 120, rpm: 2100 }],
      ['pump-drive', 2, { numOutputs: '2', ratio1: 1, ratio2: 1 }],
      [bombaType || 'pump-var-displacement', 3, { displacement: 90, displacementPct: 100 }],
      [bombaType || 'pump-var-displacement', 4, { displacement: 60, displacementPct: 100 }],
      ['poclain-ms35', 5, { displacement: 875, speedMax: 300 }],
      ['reservoir', 6]
    ],
    links: [
      [1, 0, 2, 0],        // engine P -> pump-drive IN
      [2, 1, 3, 2],        // pump-drive OUT1 -> pump1 IN (RPM)
      [2, 2, 4, 2],        // pump-drive OUT2 -> pump2 IN (RPM)
      [3, 0, 5, 0],        // pump1 P -> MS35 A
      [5, 1, 6, 0],        // MS35 B -> tank
      [3, 1, 6, 0],        // pump1 T -> tank
      [4, 1, 6, 0]         // pump2 T -> tank
    ]
  });
}

describe('Cadena de potencia — engine → pump-drive → bombas → MS35', function () {

  it('el pump-drive recibe la potencia del motor y reparte RPM entre sus salidas', function () {
    const c = powertrain();
    solve(c);
    const drive = comp(c, 2);
    expect(drive._inputPower).toBeGreaterThan(0);
    expect(drive._inputRPM).toBeGreaterThan(0);
    expect(drive._outputRPM1).toBeGreaterThan(0);
    expect(drive._outputRPM2).toBeGreaterThan(0);
  });

  it('la bomba variable calcula presion y caudal (no se queda a 0)', function () {
    const c = powertrain();
    solve(c);
    const pump1 = comp(c, 3);
    expect(pump1._inputRPM).toBeGreaterThan(0);
    expect(pump1._pressure).toBeGreaterThan(100);
    expect(pump1._actualFlow).toBeGreaterThan(10);
  });

  it('la linea de presion lleva caudal y presion al MS35', function () {
    const c = powertrain();
    solve(c);
    const linea = linkBetween(c, 3, 0, 5, 0);
    expect(linea.pressure).toBeGreaterThan(100);
    expect(linea.flow).toBeGreaterThan(10);
  });

  it('el MS35 calcula par, rpm y velocidad del vehiculo', function () {
    const c = powertrain();
    solve(c);
    const motor = comp(c, 5);
    expect(motor._torque).toBeGreaterThan(0);
    expect(motor._rpm).toBeGreaterThan(0);
    expect(motor._speedFactor).toBeGreaterThan(0);
  });

  it('los readouts globales informan presion y caudal del sistema', function () {
    const c = powertrain();
    const r = solve(c);
    expect(r.systemPressure).toBeGreaterThan(100);
    expect(r.pumpFlow).toBeGreaterThan(10);
    expect(r.completed).toBeTruthy();
  });
});

describe('Cadena de potencia — la otra bomba variable (pump-var, 2 puertos)', function () {

  it('pump-var tambien entrega presion y caudal al circuito', function () {
    const c = powertrain('pump-var');
    const r = solve(c);
    const pump1 = comp(c, 3);
    expect(pump1._pressure).toBeGreaterThan(100);
    expect(pump1._actualFlow).toBeGreaterThan(10);
    expect(r.systemPressure).toBeGreaterThan(100);
    expect(linkBetween(c, 3, 0, 5, 0).flow).toBeGreaterThan(10);
  });
});

describe('Cadena de potencia — una bomba variable sola (sin pump-drive)', function () {

  it('una pump-var-displacement sin entrada de RPM sigue dando presion y caudal', function () {
    const c = buildCircuit({
      comps: [
        ['pump-var-displacement', 1, { displacement: 90 }],
        ['poclain-ms35', 2, {}],
        ['reservoir', 3]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0], [1, 1, 3, 0]]
    });
    const r = solve(c);
    expect(comp(c, 1)._pressure).toBeGreaterThan(100);
    expect(comp(c, 1)._actualFlow).toBeGreaterThan(10);
    expect(r.systemPressure).toBeGreaterThan(100);
  });

  it('la guia avisa cuando la bomba no esta conectada a la transmision', function () {
    const c = buildCircuit({
      comps: [['pump-var-displacement', 1, {}], ['reservoir', 2]],
      links: [[1, 0, 2, 0]]
    });
    const pump = comp(c, 1);
    solve(c);
    const html = componentDocsHtml({
      definition: COMP_DEFS['pump-var-displacement'],
      spec: getComponent('pump-var-displacement'),
      comp: pump,
      vm: unitHelpers(SYSTEMS.SI)
    });
    expect(html).toContain('Mechanical input — not connected');
  });

  it('la guia muestra la potencia y las RPM recibidas cuando si esta conectada', function () {
    const c = powertrain();
    solve(c);
    const pump = comp(c, 3);
    const vm = unitHelpers(SYSTEMS.SI);
    vm.comp = pump;
    vm.pressure = pump._localPressure;
    vm.flow = pump._localFlow;
    vm.ports = [];
    const html = componentDocsHtml({
      definition: COMP_DEFS['pump-var-displacement'],
      spec: getComponent('pump-var-displacement'),
      comp: pump,
      vm: vm
    });
    expect(html).toContain('Mechanical input received');
    expect(html).toContain('pump-drive-out1');
  });
});
