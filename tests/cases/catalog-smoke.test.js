// ================================================================
// TESTS — SMOKE TEST DEL CATALOGO COMPLETO (54 COMPONENTES)
// ================================================================
// Para cada tipo del catalogo se montan dos circuitos y se ejecuta el solver:
//   1) bomba -> componente -> deposito (por el puerto 0)
//   2) todos los puertos del componente conectados a depositos
// El objetivo es que ningun tipo provoque excepciones ni resultados invalidos
// (red de seguridad al anadir componentes nuevos).
// ================================================================

import { describe, it, expect } from '../harness.js';
import { COMP_DEFS, buildCircuit, comp, portCount, solve } from '../fixtures.js';

// Valores que ponen las valvulas direccionales en una posicion conductora.
const CONDUCTING = {
  'dcv43': { position: 'Extend' },
  'dcv42': { position: 'Extend' },
  'dcv52': { position: 'Extend' },
  'dcv53': { position: 'Extend' },
  'dcv32': { position: 'Open' },
  'dcv32no': { position: 'Normal' },
  'valve22': { position: 'Open' },
  'valve22no': { position: 'Normal' },
  'prop-dcv': { command: 60 }
};

function check(u) {
  expect(u).toBeDefined();
  expect(typeof u.systemPressure).toBe('number');
  expect(typeof u.pumpFlow).toBe('number');
  expect(typeof u.completed).toBe('boolean');
  expect(typeof u.status).toBe('string');
}

describe('Smoke test — el solver procesa los 54 tipos del catalogo', function () {

  Object.keys(COMP_DEFS).forEach(function (type) {

    it('bomba -> ' + type + ' -> deposito', function () {
      const links = [[1, 0, 2, 0]];
      if (portCount(type) >= 2) links.push([2, 1, 3, 0]);
      const c = buildCircuit({
        comps: [
          ['pump', 1, { pressure: 150, flow: 30 }],
          [type, 2, CONDUCTING[type]],
          ['reservoir', 3]
        ],
        links: links
      });
      const r = solve(c);
      check(r);
      expect(comp(c, 2)).toBeDefined();
      expect(r.status).toBe('Running');
    });

    it('todos los puertos de ' + type + ' conectados a depositos', function () {
      const comps = [
        ['pump', 1, { pressure: 150, flow: 30 }],
        [type, 2, CONDUCTING[type]]
      ];
      const links = [[1, 0, 2, 0]];
      for (let p = 1; p < portCount(type); p++) {
        comps.push(['reservoir', 100 + p]);
        links.push([2, p, 100 + p, 0]);
      }
      const c = buildCircuit({ comps: comps, links: links });
      const r = solve(c);
      check(r);
      // Ninguna conexion puede quedar con valores no numericos
      c.connections.forEach(function (cn) {
        expect(typeof cn.pressure).toBe('number');
        expect(typeof cn.flow).toBe('number');
        expect(isFinite(cn.pressure)).toBeTruthy();
        expect(isFinite(cn.flow)).toBeTruthy();
      });
    });
  });
});
