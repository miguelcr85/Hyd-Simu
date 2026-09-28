// ================================================================
// FIXTURES DE TESTS — construccion de circuitos sin DOM
// ================================================================
// Reutiliza el catalogo real (js/core/component-definitions.js) y el solver real
// (js/core/simulation), de modo que los tests ejercitan exactamente el mismo
// codigo que ejecuta la aplicacion.
// ================================================================

import { COMP_DEFS } from '../js/core/component-definitions.js';
import { solveCircuit } from '../js/core/simulation/index.js';
import { registerAllComponents } from '../js/components/index.js';

/* El solver necesita el registro de componentes (etapa E2). */
registerAllComponents();

/**
 * Crea un componente igual que lo hace la interfaz al anadirlo al tablero:
 * los valores se inicializan con el `def` de cada parametro del catalogo.
 */
export function makeComponent(type, id, values) {
  const def = COMP_DEFS[type];
  if (!def) throw new Error('Tipo desconocido en el catalogo: ' + type);
  const comp = {
    id: id,
    type: type,
    x: 80 * id,
    y: 80,
    values: {},
    orient: 0,
    extension: 0,
    rotation: 0,
    reading: 0,
    _localPressure: 0
  };
  for (const key in def.params) comp.values[key] = def.params[key].def;
  if (values) { for (const key in values) comp.values[key] = values[key]; }
  return comp;
}

/** Conexion puerto→puerto, con los mismos campos que crea la interfaz. */
export function link(fromComp, fromPort, toComp, toPort) {
  return {
    from: { compId: fromComp.id, portIdx: fromPort },
    to: { compId: toComp.id, portIdx: toPort },
    pressure: 0,
    flow: 0,
    flowDir: 0
  };
}

/**
 * Construye un circuito de prueba.
 *   buildCircuit({ comps: [['pump', 1, { pressure: 150 }], ['reservoir', 2]],
 *                  links: [[1, 0, 2, 0]] })
 */
export function buildCircuit(spec) {
  const components = [], connections = [];
  (spec.comps || []).forEach(function (entry) {
    components.push(makeComponent(entry[0], entry[1], entry[2]));
  });
  (spec.links || []).forEach(function (l) {
    const from = components.filter(function (c) { return c.id === l[0]; })[0];
    const to = components.filter(function (c) { return c.id === l[2]; })[0];
    if (!from || !to) throw new Error('Conexion a componente inexistente: ' + l.join(','));
    connections.push(link(from, l[1], to, l[3]));
  });
  return { components: components, connections: connections };
}

/** Ejecuta el solver real sobre el circuito. */
export function solve(circuit, extras) {
  const input = {
    components: circuit.components,
    connections: circuit.connections,
    definitions: COMP_DEFS,
    activeFault: 'none'
  };
  if (extras) { for (const key in extras) input[key] = extras[key]; }
  return solveCircuit(input);
}

/** Busca un componente por id. */
export function comp(circuit, id) {
  return circuit.components.filter(function (c) { return c.id === id; })[0] || null;
}

/** Busca la conexion entre dos puertos (en cualquier sentido). */
export function linkBetween(circuit, compA, portA, compB, portB) {
  return circuit.connections.filter(function (c) {
    return (c.from.compId === compA && c.from.portIdx === portA &&
            c.to.compId === compB && c.to.portIdx === portB) ||
           (c.from.compId === compB && c.from.portIdx === portB &&
            c.to.compId === compA && c.to.portIdx === portA);
  })[0] || null;
}

/** Numero de puertos de un tipo (atalo corto). */
export function portCount(type) {
  return COMP_DEFS[type].ports.length;
}

export { COMP_DEFS };
