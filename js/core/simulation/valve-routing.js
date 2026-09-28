// ================================================================
// RUTEO INTERNO DE VALVULAS DIRECCIONALES (delegacion al registro)
// ================================================================
//
// Etapa E2: la logica ya no vive aqui, sino en cada ComponentSpec
// (js/components/valves-directional.js -> physics.internalRouting).
//
// Este modulo se mantiene porque es la puerta de entrada que usa el solver y
// porque su convenio es util: devuelve los pares de puertos conectados
// internamente, `[]` si la posicion bloquea todo, o `null` si el componente no
// actua como valvula direccional.
// ================================================================

import { getComponent } from '../registry.js';

export function getDcvRouting(comp) {
  const spec = getComponent(comp.type);
  if (!spec || typeof spec.physics.internalRouting !== 'function') return null;
  return spec.physics.internalRouting(comp);
}
