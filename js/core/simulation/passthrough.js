// ================================================================
// CONDUCTIVIDAD / RESTRICCIONES (delegacion al registro)
// ================================================================
//
// Etapa E2: la tabla de reglas por tipo se migro a cada ComponentSpec
// (js/components/*.js -> physics.conduct). Aqui queda unicamente el orden de
// evaluacion y el fallback, que es exactamente el del motor anterior:
//
//   1) valvula direccional -> manda su ruteo interno;
//   2) componente con regla propia -> physics.conduct();
//   3) resto -> passthrough transparente (outPort -1).
//
// Respuesta: { canFlow, outPort, pressureDrop, flowLimit }
//   outPort === -2 significa "multi-salida" (tee, divisor de caudal): el solver
//   reparte el caudal entre los demas puertos.
// ================================================================

import { getComponent } from '../registry.js';
import { getDcvRouting } from './valve-routing.js';

export function getComponentPassthrough(comp, inPortIdx, pressure, flow) {
  /* 1) Valvulas direccionales */
  const routing = getDcvRouting(comp);
  if (routing !== null) {
    for (let r = 0; r < routing.length; r++) {
      if (routing[r].from === inPortIdx) {
        return { canFlow: true, outPort: routing[r].to, pressureDrop: 0, flowLimit: flow };
      }
    }
    return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
  }

  /* 2) Regla propia del componente */
  const spec = getComponent(comp.type);
  if (spec && typeof spec.physics.conduct === 'function') {
    return spec.physics.conduct(comp, inPortIdx, pressure, flow);
  }

  /* 3) Fallback transparente */
  return { canFlow: true, outPort: -1, pressureDrop: 0, flowLimit: flow };
}
