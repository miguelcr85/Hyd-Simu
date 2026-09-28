// ================================================================
// TESTS — SOLVER: FUENTES, PRESION DE SISTEMA Y PASSTHROUGH GENERICO
// ================================================================
// Fijan el comportamiento numerico del motor sobre circuitos completos.
// Cualquier refactor posterior (E2: ComponentRegistry) debe mantener estos
// valores; si un test falla, primero se revisa si el cambio era intencional.
// ================================================================

import { describe, it, expect } from '../harness.js';
import { buildCircuit, comp, linkBetween, solve } from '../fixtures.js';

describe('Solver — fuente de presion y alivio', function () {

  it('la bomba propaga su presion y su caudal a la linea', function () {
    const c = buildCircuit({
      comps: [['pump', 1, { pressure: 150, flow: 30 }], ['reservoir', 2]],
      links: [[1, 0, 2, 0]]
    });
    const r = solve(c);
    expect(r.completed).toBeTruthy();
    expect(r.status).toBe('Running');
    expect(r.systemPressure).toBeCloseTo(150);
    expect(r.pumpFlow).toBeCloseTo(30);
    const linea = linkBetween(c, 1, 0, 2, 0);
    expect(linea.pressure).toBeCloseTo(150);
    expect(linea.flow).toBeCloseTo(30);
    expect(linea.flowDir).toBe(1);
    expect(comp(c, 1)._localPressure).toBeCloseTo(150);
  });

  it('[D1 corregida] el alivio limita la presion de la linea y la de sistema', function () {
    // Etapa E2: la propagacion parte de la presion de sistema (min(pump, alivio)).
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['relief', 2, { setting: 120 }],
        ['reservoir', 3]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0]]
    });
    const r = solve(c);
    expect(r.systemPressure).toBeCloseTo(120);
    expect(linkBetween(c, 1, 0, 2, 0).pressure).toBeCloseTo(120);
  });

  it('sin alivio conectado no hay tope: la linea trabaja a la presion de la bomba', function () {
    const c = buildCircuit({
      comps: [['pump', 1, { pressure: 150, flow: 30 }], ['reservoir', 2]],
      links: [[1, 0, 2, 0]]
    });
    expect(solve(c).systemPressure).toBeCloseTo(150);
  });

  it('la falla relief-stuck desactiva el tope de presion de sistema', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['relief', 2, { setting: 120 }],
        ['reservoir', 3]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0]]
    });
    expect(solve(c, { activeFault: 'relief-stuck' }).systemPressure).toBeCloseTo(150);
  });

  it('sin bomba devuelve completed=false y status "No pump"', function () {
    const c = buildCircuit({ comps: [['cylinder-da', 1]], links: [] });
    const r = solve(c);
    expect(r.completed).toBeFalsy();
    expect(r.status).toBe('No pump');
    expect(r.systemPressure).toBe(0);
    expect(r.pumpFlow).toBe(0);
  });

  it('robustez: un circuito vacio no lanza excepciones', function () {
    const r = solve({ components: [], connections: [] });
    expect(r.status).toBe('No pump');
    expect(r.completed).toBeFalsy();
  });

  it('robustez: una conexion a un componente inexistente no rompe el motor', function () {
    const c = buildCircuit({ comps: [['pump', 1, { pressure: 150, flow: 30 }]], links: [] });
    c.connections.push({ from: { compId: 1, portIdx: 0 }, to: { compId: 99, portIdx: 0 }, pressure: 0, flow: 0, flowDir: 0 });
    expect(solve(c).completed).toBeTruthy();
  });

  it('es determinista: dos ejecuciones dan el mismo resultado', function () {
    const c = buildCircuit({
      comps: [['pump', 1, { pressure: 200, flow: 40 }], ['reservoir', 2]],
      links: [[1, 0, 2, 0]]
    });
    const a = solve(c);
    const b = solve(c);
    expect(a.systemPressure).toBeCloseTo(b.systemPressure);
    expect(a.status).toBe(b.status);
    expect(linkBetween(c, 1, 0, 2, 0).pressure).toBeCloseTo(200);
  });
});

describe('Solver — perdidas unificadas y componentes mult Puerto (etapa E2)', function () {

  it('[D4 corregida] filtro: 1 bar de perdida segun la tabla de reglas', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['filter', 2],
        ['reservoir', 3]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0]]
    });
    solve(c);
    const salida = linkBetween(c, 2, 1, 3, 0);
    expect(salida.pressure).toBeCloseTo(149);      // 150 - 1 bar
    expect(salida.flow).toBeCloseTo(30);           // la tabla no limita el caudal
  });

  it('[D4 corregida] enfriador: 2 bar de perdida', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['cooler', 2],
        ['reservoir', 3]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0]]
    });
    solve(c);
    expect(linkBetween(c, 2, 1, 3, 0).pressure).toBeCloseTo(148);   // 150 - 2 bar
  });

  it('[D2/D3 corregidas] el tee reparte caudal y presion entre sus dos ramas', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['tee', 2],
        ['reservoir', 3],
        ['reservoir', 4]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0], [2, 2, 4, 0]]
    });
    solve(c);
    const ramaA = linkBetween(c, 2, 1, 3, 0);
    const ramaB = linkBetween(c, 2, 2, 4, 0);
    expect(ramaA.pressure).toBeCloseTo(150);       // el tee no tiene perdida
    expect(ramaB.pressure).toBeCloseTo(150);
    expect(ramaA.flow).toBeCloseTo(15);            // reparto a partes iguales
    expect(ramaB.flow).toBeCloseTo(15);
  });

  it('[D2/D3 corregidas] el divisor de caudal reparte 60/40', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['flow-divider', 2, { ratio: 60 }],
        ['reservoir', 3],
        ['reservoir', 4]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0], [2, 2, 4, 0]]
    });
    solve(c);
    expect(linkBetween(c, 2, 1, 3, 0).flow).toBeCloseTo(18);   // 60 %
    expect(linkBetween(c, 2, 2, 4, 0).flow).toBeCloseTo(12);   // 40 %
  });

  it('[D3 corregida] el control de caudal limita el caudal que llega al cilindro', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['flow-control', 2, { flow: 15 }],
        ['cylinder-da', 3, { bore: 80, rod: 45 }],
        ['reservoir', 4]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0], [3, 1, 4, 0]]
    });
    solve(c);
    const linea = linkBetween(c, 2, 1, 3, 0);
    expect(linea.flow).toBeCloseTo(15);                          // limitado al ajuste
    expect(linea.pressure).toBeCloseTo(142.5);                   // 150 - (30-15)x0,5
    expect(comp(c, 3)._speedFactor).toBeCloseTo(15 / 30 * 0.8);
  });

  it('[D3 corregida] el orificio aplica su caida de presion (dP = Q² / d² x 2)', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['orifice', 2, { diameter: 5 }],
        ['reservoir', 3]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0]]
    });
    solve(c);
    expect(linkBetween(c, 2, 1, 3, 0).pressure).toBeCloseTo(132);   // 150 - 900/50
  });

  it('[D3 corregida] la valvula de secuencia solo abre al superar su ajuste', function () {
    const cerrado = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 100, flow: 30 }],
        ['sequence-valve', 2, { setting: 150 }],
        ['reservoir', 3]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0]]
    });
    solve(cerrado);
    expect(linkBetween(cerrado, 2, 1, 3, 0).pressure).toBe(0);

    const abierto = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['sequence-valve', 2, { setting: 100 }],
        ['reservoir', 3]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0]]
    });
    solve(abierto);
    expect(linkBetween(abierto, 2, 1, 3, 0).pressure).toBeCloseTo(148);   // 150 - 2 bar
  });

  it('[D3 corregida] el antirretorno bloquea el sentido inverso', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['check', 2],
        ['reservoir', 3]
      ],
      // La bomba alimenta el lado de SALIDA del antirretorno: debe quedar bloqueado
      links: [[1, 0, 2, 1], [2, 0, 3, 0]]
    });
    solve(c);
    expect(linkBetween(c, 2, 0, 3, 0).pressure).toBe(0);
  });

  it('[D3 corregida] la valvula de prioridad alimenta CF y EF', function () {
    const c = buildCircuit({
      comps: [
        ['pump', 1, { pressure: 150, flow: 30 }],
        ['priority', 2, { setting: 15 }],
        ['reservoir', 3],
        ['reservoir', 4]
      ],
      links: [[1, 0, 2, 0], [2, 1, 3, 0], [2, 2, 4, 0]]
    });
    solve(c);
    expect(linkBetween(c, 2, 1, 3, 0).flow).toBeCloseTo(15);   // CF: caudal prioritario
    expect(linkBetween(c, 2, 2, 4, 0).flow).toBeCloseTo(15);   // EF: el excedente
  });
});
