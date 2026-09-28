// ================================================================
// TESTS — ARQUITECTURA: SEPARACION ENTRE DOMINIO E INTERFAZ
// ================================================================
// Estos tests protegen la decision de diseno mas importante de la etapa E1:
// el nucleo (js/core/**) es dominio puro y no puede depender del DOM, y la
// interfaz (js/app.js) no debe volver a contener el motor de simulacion.
// ================================================================

import { describe, it, expect, expectNot } from '../harness.js';
import { COMP_DEFS } from '../fixtures.js';

const CORE_MODULES = [
  'component-definitions.js',
  'registry.js',
  'units.js',
  'simulation/graph.js',
  'simulation/valve-routing.js',
  'simulation/passthrough.js',
  'simulation/dcv-positions.js',
  'simulation/solver.js',
  'simulation/index.js',
  '../ui/componentDocs.js',
  '../components/index.js',
  '../components/valves-directional.js',
  '../components/valves-flow.js',
  '../components/valves-distribution.js',
  '../components/valves-pressure.js',
  '../components/conditioning.js',
  '../components/actuators.js',
  '../components/sources.js'
];

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo cargar ' + url + ' (HTTP ' + res.status + ')');
  return res.text();
}

describe('Arquitectura — el nucleo no depende del navegador', function () {

  CORE_MODULES.forEach(function (rel) {
    it('js/core/' + rel + ' no usa document, window ni localStorage', async function () {
      const code = await fetchText('../js/core/' + rel);
      expectNot(code).toContain('document.');
      expectNot(code).toContain('window.');
      expectNot(code).toContain('localStorage');
      expectNot(code).toContain('canvas');
    });
  });

  it('el solver recibe el circuito por parametro y devuelve el resultado', async function () {
    const code = await fetchText('../js/core/simulation/solver.js');
    expect(code).toContain('export function solveCircuit(circuit)');
    expect(code).toContain('return {');
    expectNot(code).toContain('updateReadouts');
    expectNot(code).toContain('_hcUpdateDiagnostics');
  });
});

describe('Arquitectura — la interfaz delega en el nucleo', function () {

  it('js/app.js importa el nucleo y ya no contiene el motor', async function () {
    const code = await fetchText('../js/app.js');
    expect(code).toContain("import { COMP_DEFS } from './core/component-definitions.js';");
    expect(code).toContain("import { solveCircuit } from './core/simulation/index.js';");
    expectNot(code).toContain('function getComponentPassthrough');
    expectNot(code).toContain('function getDcvRouting');
    expectNot(code).toContain('function buildAdjacency');
    expectNot(code).toContain('var COMP_DEFS = {');
  });

  it('js/app.js mantiene el adaptador computeCircuit() para la interfaz', async function () {
    const code = await fetchText('../js/app.js');
    expect(code).toContain('function computeCircuit() {');
    expect(code).toContain('var result = solveCircuit({');
  });
});

describe('Arquitectura — coherencia entre catalogo y paleta', function () {

  it('el catalogo define exactamente 54 componentes', function () {
    expect(Object.keys(COMP_DEFS)).lengthOf(54);
  });

  it('todas las definiciones tienen nombre, tamano, puertos y parametros validos', function () {
    const dirs = ['up', 'down', 'left', 'right'];
    Object.keys(COMP_DEFS).forEach(function (type) {
      const def = COMP_DEFS[type];
      expect(typeof def.name).toBe('string');
      expect(def.w).toBeGreaterThan(0);
      expect(def.h).toBeGreaterThan(0);
      expect(Array.isArray(def.ports)).toBeTruthy();
      def.ports.forEach(function (p) {
        expect(typeof p.label).toBe('string');
        expect(dirs.indexOf(p.dir) >= 0).toBeTruthy();
      });
      Object.keys(def.params).forEach(function (key) {
        const p = def.params[key];
        expect(typeof p.label).toBe('string');
        if (p.type === 'select') {
          expect(Array.isArray(p.options)).toBeTruthy();
          expect(p.options.length).toBeGreaterThan(0);
        } else {
          expect(p.def).toBeDefined();
        }
      });
    });
  });

  it('cada componente de la paleta de index.html existe en el catalogo', async function () {
    const html = await fetchText('../index.html');
    const matches = html.match(/data-type="([a-z0-9-]+)"/g) || [];
    const paletteTypes = matches
      .map(function (m) { return m.replace('data-type="', '').replace('"', ''); })
      .sort();
    const unique = paletteTypes.filter(function (t, i) { return paletteTypes.indexOf(t) === i; });
    expect(unique.length).toBeGreaterThan(0);
    unique.forEach(function (type) {
      if (!COMP_DEFS[type]) throw new Error('La paleta ofrece "' + type + '" pero no esta en el catalogo');
    });
  });

  it('cada componente del catalogo aparece en la paleta', function () {
    return fetchText('../index.html').then(function (html) {
      Object.keys(COMP_DEFS).forEach(function (type) {
        if (html.indexOf('data-type="' + type + '"') < 0) {
          throw new Error('El catalogo define "' + type + '" pero no esta en la paleta');
        }
      });
    });
  });
});
