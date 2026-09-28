// ================================================================
// TESTS — RUTEO INTERNO DE VALVULAS DIRECCIONALES
// ================================================================
// `getDcvRouting()` pertenece al nucleo puro: se prueba directamente, sin
// circuito ni tablero.
// ================================================================

import { describe, it, expect } from '../harness.js';
import { getDcvRouting, updateDcvPositions } from '../../js/core/simulation/index.js';
import { makeComponent } from '../fixtures.js';

describe('Valvulas direccionales (ruteo interno)', function () {

  it('dcv43 en Extend conecta P→A y B→T', function () {
    const v = makeComponent('dcv43', 1, { position: 'Extend' });
    expect(getDcvRouting(v)).toEqual([{ from: 0, to: 2 }, { from: 3, to: 1 }]);
  });

  it('dcv43 en Retract conecta P→B y A→T', function () {
    const v = makeComponent('dcv43', 1, { position: 'Retract' });
    expect(getDcvRouting(v)).toEqual([{ from: 0, to: 3 }, { from: 2, to: 1 }]);
  });

  it('dcv43 en centro cerrado bloquea todos los puertos', function () {
    const v = makeComponent('dcv43', 1, { position: 'Center', centerType: 'Closed' });
    expect(getDcvRouting(v)).lengthOf(0);
  });

  it('dcv43 en centro tandem conecta P→T', function () {
    const v = makeComponent('dcv43', 1, { position: 'Center', centerType: 'Tandem' });
    expect(getDcvRouting(v)).toEqual([{ from: 0, to: 1 }]);
  });

  it('dcv43 en centro abierto descarga P, A y B a tanque', function () {
    const v = makeComponent('dcv43', 1, { position: 'Center', centerType: 'Open' });
    expect(getDcvRouting(v)).toEqual([{ from: 0, to: 1 }, { from: 2, to: 1 }, { from: 3, to: 1 }]);
  });

  it('dcv43 en centro flotante conecta A y B a tanque (P bloqueado)', function () {
    const v = makeComponent('dcv43', 1, { position: 'Center', centerType: 'Float' });
    expect(getDcvRouting(v)).toEqual([{ from: 2, to: 1 }, { from: 3, to: 1 }]);
  });

  it('dcv32 solo abre P→A en la posicion Open', function () {
    expect(getDcvRouting(makeComponent('dcv32', 1, { position: 'Open' }))).toEqual([{ from: 0, to: 2 }]);
    expect(getDcvRouting(makeComponent('dcv32', 2, { position: 'Closed' }))).lengthOf(0);
  });

  it('dcv32no conmuta entre P→A (normal) y A→T (accionada)', function () {
    expect(getDcvRouting(makeComponent('dcv32no', 1, { position: 'Normal' }))).toEqual([{ from: 0, to: 2 }]);
    expect(getDcvRouting(makeComponent('dcv32no', 2, { position: 'Shifted' }))).toEqual([{ from: 2, to: 1 }]);
  });

  it('dcv52 (5/2) replica la distribucion de una 4/3 de dos posiciones', function () {
    expect(getDcvRouting(makeComponent('dcv52', 1, { position: 'Extend' })))
      .toEqual([{ from: 0, to: 2 }, { from: 4, to: 3 }]);
    expect(getDcvRouting(makeComponent('dcv52', 2, { position: 'Retract' })))
      .toEqual([{ from: 0, to: 4 }, { from: 2, to: 1 }]);
  });

  it('dcv53 (5/3) define los centros Exhaust, Pressure y Closed', function () {
    expect(getDcvRouting(makeComponent('dcv53', 1, { position: 'Center', centerType: 'Exhaust' })))
      .toEqual([{ from: 2, to: 1 }, { from: 4, to: 3 }]);
    expect(getDcvRouting(makeComponent('dcv53', 2, { position: 'Center', centerType: 'Pressure' })))
      .toEqual([{ from: 0, to: 2 }, { from: 0, to: 4 }]);
    expect(getDcvRouting(makeComponent('dcv53', 3, { position: 'Center', centerType: 'Closed' })))
      .lengthOf(0);
  });

  it('dcv42 (4/2) siempre tiene una posicion activa', function () {
    expect(getDcvRouting(makeComponent('dcv42', 1, { position: 'Extend' })))
      .toEqual([{ from: 0, to: 2 }, { from: 3, to: 1 }]);
    expect(getDcvRouting(makeComponent('dcv42', 2, { position: 'Retract' })))
      .toEqual([{ from: 0, to: 3 }, { from: 2, to: 1 }]);
  });

  it('prop-dcv usa el comando con banda muerta de mas/menos 10 %', function () {
    expect(getDcvRouting(makeComponent('prop-dcv', 1, { command: 50 })))
      .toEqual([{ from: 0, to: 2 }, { from: 3, to: 1 }]);
    expect(getDcvRouting(makeComponent('prop-dcv', 2, { command: -50 })))
      .toEqual([{ from: 0, to: 3 }, { from: 2, to: 1 }]);
    expect(getDcvRouting(makeComponent('prop-dcv', 3, { command: 5 }))).lengthOf(0);
  });

  it('valve22 y valve22no solo conectan In→Out', function () {
    expect(getDcvRouting(makeComponent('valve22', 1, { position: 'Open' }))).toEqual([{ from: 0, to: 1 }]);
    expect(getDcvRouting(makeComponent('valve22', 2, { position: 'Closed' }))).lengthOf(0);
    expect(getDcvRouting(makeComponent('valve22no', 3, { position: 'Normal' }))).toEqual([{ from: 0, to: 1 }]);
    expect(getDcvRouting(makeComponent('valve22no', 4, { position: 'Shifted' }))).lengthOf(0);
  });

  it('devuelve null para componentes que no son valvulas direccionales', function () {
    expect(getDcvRouting(makeComponent('cylinder-da', 1))).toBeNull();
    expect(getDcvRouting(makeComponent('relief', 2))).toBeNull();
  });
});

describe('Valvulas direccionales (posicion por comando externo)', function () {

  it('dcv43 traduce el comando en Extend / Retract / Center', function () {
    const v = makeComponent('dcv43', 1, { _externalCommand: 30 });
    v.values.position = 'Center';
    updateDcvPositions([v]);
    expect(v.values.position).toBe('Extend');

    v.values._externalCommand = -30;
    updateDcvPositions([v]);
    expect(v.values.position).toBe('Retract');

    v.values._externalCommand = 0;
    updateDcvPositions([v]);
    expect(v.values.position).toBe('Center');
  });

  it('dcv42 elige entre Extend y Retract segun el signo del comando', function () {
    const v = makeComponent('dcv42', 1, { _externalCommand: -1 });
    updateDcvPositions([v]);
    expect(v.values.position).toBe('Retract');
  });

  it('dcv32 abre/cierra y dcv32no invierte la logica (normalmente abierta)', function () {
    const a = makeComponent('dcv32', 1, { _externalCommand: 5 });
    const b = makeComponent('dcv32no', 2, { _externalCommand: 5 });
    updateDcvPositions([a, b]);
    expect(a.values.position).toBe('Open');
    expect(b.values.position).toBe('Shifted');
  });

  it('no modifica valvulas sin comando externo', function () {
    const v = makeComponent('dcv43', 1, { position: 'Extend' });
    updateDcvPositions([v]);
    expect(v.values.position).toBe('Extend');
  });
});
