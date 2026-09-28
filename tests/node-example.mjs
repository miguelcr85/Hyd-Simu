// ================================================================
// EJEMPLO — version en Node del mismo enfoque (opcional, requiere Node)
// ================================================================
// El proyecto no depende de Node. Este archivo queda como referencia para
// ejecutar la logica del nucleo en consola/CI si en el futuro se instala Node:
//
//   node tests/node-example.mjs
//
// El nucleo es dominio puro (sin DOM), por lo que se puede importar tal cual.
// ================================================================

import { COMP_DEFS } from '../js/core/component-definitions.js';
import { solveCircuit, getDcvRouting } from '../js/core/simulation/index.js';

const pump = { id: 1, type: 'pump', values: { pressure: 150, flow: 30 }, x: 0, y: 0, orient: 0 };
const dcv = { id: 2, type: 'dcv43', values: { position: 'Extend', centerType: 'Closed' }, x: 0, y: 0, orient: 0 };
const cyl = { id: 3, type: 'cylinder-da', values: { bore: 80, rod: 45, stroke: 300 }, x: 0, y: 0, orient: 0 };
const tank = { id: 4, type: 'reservoir', values: { volume: 100 }, x: 0, y: 0, orient: 0 };

const conn = (a, ap, b, bp) => ({ from: { compId: a, portIdx: ap }, to: { compId: b, portIdx: bp }, pressure: 0, flow: 0, flowDir: 0 });

const circuit = {
  components: [pump, dcv, cyl, tank],
  connections: [conn(1, 0, 2, 0), conn(2, 2, 3, 0), conn(3, 1, 2, 3), conn(2, 1, 4, 0)]
};

const result = solveCircuit({
  components: circuit.components,
  connections: circuit.connections,
  definitions: COMP_DEFS,
  activeFault: 'none'
});

console.log('rutas DCV (Extend):', JSON.stringify(getDcvRouting(dcv)));
console.log('presion de sistema (bar):', result.systemPressure);
console.log('caudal de bomba (L/min):', result.pumpFlow);
console.log('presion en el cilindro (bar):', cyl._localPressure);
console.log('velocidad relativa del cilindro:', cyl._speedFactor);

const A = Math.PI / 4 * 80 * 80;
console.log('fuerza de extension (kN):', (cyl._localPressure * 0.1 * A / 1000).toFixed(1));
