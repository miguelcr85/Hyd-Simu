// ================================================================
// TESTS — COBERTURA DE LA GUIA DE COMPONENTES (54 tipos)
// ================================================================
// Garantiza que TODOS los componentes del catalogo tienen descripcion y formulas,
// y que el panel se genera sin errores para cualquiera de ellos, tanto en SI
// como en Imperial. Es el test que protege el objetivo "componente nuevo =
// documentado" de la etapa E4.
// ================================================================

import { describe, it, expect } from '../harness.js';
import { componentDocsHtml } from '../../js/ui/componentDocs.js';
import { unitHelpers, SYSTEMS } from '../../js/core/units.js';
import { COMP_DEFS, makeComponent } from '../fixtures.js';
import { getComponent } from '../../js/core/registry.js';

const TYPES = Object.keys(COMP_DEFS);

function viewModel(comp, system) {
  const vm = unitHelpers(system);
  vm.running = true;
  vm.comp = comp;
  vm.pressure = 150;
  vm.flow = 30;
  vm.ports = (COMP_DEFS[comp.type].ports || []).map(function (port, idx) {
    return { idx: idx, label: port.label, portRole: 'fluid', pressure: 150, flow: 30, connCount: 2 };
  });
  return vm;
}

describe('Guia de componentes — documentacion completa', function () {

  it('los 54 componentes tienen resumen y explicacion', function () {
    TYPES.forEach(function (type) {
      const spec = getComponent(type);
      if (!spec.docs) throw new Error('sin documentacion: ' + type);
      if (!spec.docs.summary || spec.docs.summary.length < 20) throw new Error('resumen muy corto: ' + type);
      if (!spec.docs.how || spec.docs.how.length < 40) throw new Error('explicacion muy corta: ' + type);
    });
  });

  it('los 54 componentes tienen formulas de diseno', function () {
    TYPES.forEach(function (type) {
      const spec = getComponent(type);
      if (typeof spec.equations !== 'function') throw new Error('sin formulas: ' + type);
    });
  });

  it('cada formula declara titulo y expresion', function () {
    TYPES.forEach(function (type) {
      const spec = getComponent(type);
      const comp = makeComponent(type, 1);
      const list = spec.equations(viewModel(comp, SYSTEMS.SI)) || [];
      if (!list.length) throw new Error('lista de formulas vacia: ' + type);
      list.forEach(function (eq) {
        if (!eq.title || !eq.formula) {
          throw new Error('formula incompleta en ' + type + ': ' + JSON.stringify(eq));
        }
      });
    });
  });

  it('las formulas funcionan tambien sin valores medidos (presion y caudal a 0)', function () {
    TYPES.forEach(function (type) {
      const spec = getComponent(type);
      const comp = makeComponent(type, 1);
      const vm = viewModel(comp, SYSTEMS.SI);
      vm.pressure = 0;
      vm.flow = 0;
      vm.running = false;
      const list = spec.equations(vm) || [];
      expect(list.length).toBeGreaterThan(0);
    });
  });

  it('el panel se genera para los 54 componentes en SI y en Imperial', function () {
    TYPES.forEach(function (type) {
      [SYSTEMS.SI, SYSTEMS.IMPERIAL].forEach(function (system) {
        const comp = makeComponent(type, 1);
        const html = componentDocsHtml({
          definition: COMP_DEFS[type],
          spec: getComponent(type),
          comp: comp,
          vm: viewModel(comp, system)
        });
        if (!html || html.length < 300) throw new Error('panel demasiado corto en ' + type);
        if (html.indexOf('undefined') >= 0) throw new Error('aparece "undefined" en ' + type + ' (' + system + ')');
        if (html.indexOf('NaN') >= 0) throw new Error('aparece "NaN" en ' + type + ' (' + system + ')');
        if (html.indexOf('[object Object]') >= 0) throw new Error('objeto sin formatear en ' + type);
        if (html.indexOf('Design formulas') < 0) throw new Error('sin seccion de formulas en ' + type);
      });
    });
  });

  it('el sistema imperial usa unidades imperiales en las formulas', function () {
    const comp = makeComponent('cylinder-da', 1, { bore: 80, rod: 45 });
    const html = componentDocsHtml({
      definition: COMP_DEFS['cylinder-da'],
      spec: getComponent('cylinder-da'),
      comp: comp,
      vm: viewModel(comp, SYSTEMS.IMPERIAL)
    });
    expect(html).toContain('lbf');
    expect(html).toContain('psi');
  });
});
