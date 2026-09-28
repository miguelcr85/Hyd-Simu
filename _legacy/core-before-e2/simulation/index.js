// ================================================================
// NUCLEO DE SIMULACION (dominio puro, sin DOM)
// ================================================================
//
// Punto de entrada del motor. La interfaz (js/app.js) solo necesita
// solveCircuit(); el resto de modulos queda expuesto para los tests y para
// las siguientes etapas (E2: ComponentRegistry).
// ================================================================

export { buildAdjacency } from './graph.js';
export { getDcvRouting } from './valve-routing.js';
export { getComponentPassthrough } from './passthrough.js';
export { updateDcvPositions } from './dcv-positions.js';
export { solveCircuit } from './solver.js';
