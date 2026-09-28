// ================================================================
// TESTS — EQUIVALENCIA DE REGLAS CON EL MOTOR ANTERIOR (ETAPA E2)
// ================================================================
// La migracion de la tabla de reglas (passthrough) y del ruteo de valvulas al
// ComponentRegistry debe ser EXACTA: estos tests comparan, para todo el catalogo,
// los resultados del registro contra una copia congelada del codigo anterior
// (tests/legacy/*), incluyendo el estado interno que cada regla modifica.
//
// Si un test de este archivo falla, la migracion cambio una regla (no es un
// cambio de fisica intencionado): hay que revisar el spec correspondiente.
// ================================================================

import { describe, it, expect } from '../harness.js';
import { COMP_DEFS, makeComponent } from '../fixtures.js';
import { getComponentPassthrough, getDcvRouting, updateDcvPositions } from '../../js/core/simulation/index.js';
import { getComponentPassthrough as legacyPassthrough } from '../legacy/passthrough-legacy.js';
import { getDcvRouting as legacyRouting } from '../legacy/valve-routing-legacy.js';

const PRESSURES = [0, 5, 50, 100, 150, 210];
const FLOWS = [0, 10, 30];
const PRE_STATES = [
  {},
  { _pilotPressure: 0 },
  { _pilotPressure: 10 },
  { _pilotPressure: 100 },
  { _pilotPressure: 160 },
  { _reliefActive: true },
  { _sequenceOpen: true },
  { _charge: 0.5 }
];

function withState(type, state) {
  return Object.assign(makeComponent(type, 1), state);
}

/* Campos del contrato original: la etapa E2 puede anadir campos nuevos (p. ej.
   `extra` en la valvula de prioridad), pero estos cuatro no pueden cambiar. */
function legacyFields(result) {
  return {
    canFlow: result.canFlow,
    outPort: result.outPort,
    pressureDrop: result.pressureDrop,
    flowLimit: result.flowLimit
  };
}

describe('Equivalencia con el motor anterior — conductividad por componente', function () {

  Object.keys(COMP_DEFS).forEach(function (type) {
    it('reglas de "' + type + '" identicas a la tabla anterior', function () {
      const ports = COMP_DEFS[type].ports.length;
      for (let port = 0; port < ports; port++) {
        for (let s = 0; s < PRE_STATES.length; s++) {
          for (let i = 0; i < PRESSURES.length; i++) {
            for (let j = 0; j < FLOWS.length; j++) {
              const context = 'puerto ' + port + ', estado ' + s + ', P=' + PRESSURES[i] + ', Q=' + FLOWS[j];
              const legacyComp = withState(type, PRE_STATES[s]);
              const newComp = withState(type, PRE_STATES[s]);
              const expected = legacyPassthrough(legacyComp, port, PRESSURES[i], FLOWS[j]);
              const actual = getComponentPassthrough(newComp, port, PRESSURES[i], FLOWS[j]);
              const e = JSON.stringify(legacyFields(expected));
              const a = JSON.stringify(legacyFields(actual));
              if (e !== a) {
                throw new Error('resultado distinto en "' + type + '" (' + context + '): legacy=' + e + ' registro=' + a);
              }
              const es = JSON.stringify(legacyComp);
              const as = JSON.stringify(newComp);
              if (es !== as) {
                throw new Error('estado interno distinto en "' + type + '" (' + context + ')');
              }
            }
          }
        }
      }
    });
  });
});

describe('Equivalencia con el motor anterior — ruteo de valvulas', function () {

  const VALVES = ['dcv43', 'dcv42', 'dcv32', 'dcv32no', 'dcv52', 'dcv53', 'valve22', 'valve22no', 'prop-dcv'];
  const POSITIONS = ['Center', 'Extend', 'Retract', 'Open', 'Closed', 'Normal', 'Shifted', '', 'PosicionInvalida'];
  const CENTERS = ['Closed', 'Tandem', 'Open', 'Float', 'Exhaust', 'Pressure', ''];
  const COMMANDS = [0, 5, 10, 11, -11, 50, -50, 100];

  VALVES.forEach(function (type) {
    it('ruteo de "' + type + '" identico en todas sus posiciones', function () {
      for (let p = 0; p < POSITIONS.length; p++) {
        for (let c = 0; c < CENTERS.length; c++) {
          for (let m = 0; m < COMMANDS.length; m++) {
            const comp = makeComponent(type, 1, {
              position: POSITIONS[p],
              centerType: CENTERS[c],
              command: COMMANDS[m]
            });
            const expected = JSON.stringify(legacyRouting(comp));
            const actual = JSON.stringify(getDcvRouting(comp));
            if (expected !== actual) {
              throw new Error('ruteo distinto en "' + type + '" (position=' + POSITIONS[p] +
                ', centerType=' + CENTERS[c] + ', command=' + COMMANDS[m] + '): legacy=' +
                expected + ' registro=' + actual);
            }
          }
        }
      }
    });
  });

  it('los tipos que no son valvulas direccionales devuelven null', function () {
    ['cylinder-da', 'relief', 'check', 'tee', 'motor', 'filter'].forEach(function (type) {
      expect(getDcvRouting(makeComponent(type, 1))).toBeNull();
    });
  });
});

describe('Equivalencia con el motor anterior — posiciones por comando externo', function () {
  it('updateDcvPositions no cambio de comportamiento', function () {
    const cases = [
      ['dcv43', 30, 'Extend'], ['dcv43', -30, 'Retract'], ['dcv43', 0, 'Center'],
      ['dcv42', 1, 'Extend'], ['dcv42', -1, 'Retract'],
      ['dcv32', 5, 'Open'], ['dcv32', -5, 'Closed'],
      ['dcv32no', 5, 'Shifted'], ['dcv32no', -5, 'Normal'],
      ['valve22', 5, 'Open'], ['valve22no', 5, 'Shifted'], ['valve22no', -5, 'Normal'],
      ['dcv52', 5, 'Extend'], ['dcv53', -5, 'Center'], ['dcv53', -30, 'Retract']
    ];
    cases.forEach(function (c) {
      const v = makeComponent(c[0], 1, { _externalCommand: c[1] });
      updateDcvPositions([v]);
      expect(v.values.position).toBe(c[2]);
    });
  });
});
