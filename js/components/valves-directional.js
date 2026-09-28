// ================================================================
// VALVULAS DIRECCIONALES (9 tipos)
// ================================================================
// `physics.internalRouting(comp)` devuelve los pares de puertos conectados
// internamente para la posicion actual, o `null` si el componente no actua como
// valvula direccional (mismo convenio que el motor anterior: un `null` hace que
// el solver trate el componente por la via generica).
//
// Reglas migradas 1:1 desde js/core/simulation/valve-routing.js (etapa E1).
// ================================================================

import { ROLES } from '../core/registry.js';

const drop = { pressure: 0.97, flow: 0.99 };  /* perdida que aplica el BFS al atravesarla */

/* dcv52: 5/2 — puertos 0=P, 1=T1, 2=A, 3=T2, 4=B */
function routingDcv52(comp) {
  switch (comp.values.position) {
    case 'Extend':  return [{ from: 0, to: 2 }, { from: 4, to: 3 }];
    case 'Retract': return [{ from: 0, to: 4 }, { from: 2, to: 1 }];
  }
  return null;
}

/* dcv53: 5/3 — Extend/Retract como la 5/2; el centro depende de centerType */
function routingDcv53(comp) {
  switch (comp.values.position) {
    case 'Extend':  return [{ from: 0, to: 2 }, { from: 4, to: 3 }];
    case 'Retract': return [{ from: 0, to: 4 }, { from: 2, to: 1 }];
    default:
      switch (comp.values.centerType || 'Closed') {
        case 'Exhaust':  return [{ from: 2, to: 1 }, { from: 4, to: 3 }];
        case 'Pressure': return [{ from: 0, to: 2 }, { from: 0, to: 4 }];
        default:         return [];
      }
  }
}

/* dcv42: 4/2 — no tiene centro, siempre hay una posicion activa */
function routingDcv42(comp) {
  switch (comp.values.position) {
    case 'Extend':  return [{ from: 0, to: 2 }, { from: 3, to: 1 }];
    case 'Retract': return [{ from: 0, to: 3 }, { from: 2, to: 1 }];
  }
  return null;
}

/* dcv43: 4/3 */
function routingDcv43(comp) {
  switch (comp.values.position) {
    case 'Extend':  return [{ from: 0, to: 2 }, { from: 3, to: 1 }];
    case 'Retract': return [{ from: 0, to: 3 }, { from: 2, to: 1 }];
    default:
      switch (comp.values.centerType || 'Closed') {
        case 'Tandem': return [{ from: 0, to: 1 }];
        case 'Open':   return [{ from: 0, to: 1 }, { from: 2, to: 1 }, { from: 3, to: 1 }];
        case 'Float':  return [{ from: 2, to: 1 }, { from: 3, to: 1 }];
        default:       return [];
      }
  }
}

/* prop-dcv: 4/3 proporcional con banda muerta de +-10 % */
function routingPropDcv(comp) {
  const cmd = (comp.values && comp.values.command) || 0;
  if (cmd > 10)  return [{ from: 0, to: 2 }, { from: 3, to: 1 }];
  if (cmd < -10) return [{ from: 0, to: 3 }, { from: 2, to: 1 }];
  return [];
}

/* dcv32 / valve22: 3/2 y 2/2 */
function routingDcv32(comp) {
  return comp.values.position === 'Open' ? [{ from: 0, to: 2 }] : [];
}
function routingValve22(comp) {
  return comp.values.position === 'Open' ? [{ from: 0, to: 1 }] : [];
}

/* Versiones normalmente abiertas */
function routingDcv32No(comp) {
  return comp.values.position === 'Normal' ? [{ from: 0, to: 2 }] : [{ from: 2, to: 1 }];
}
function routingValve22No(comp) {
  return comp.values.position === 'Normal' ? [{ from: 0, to: 1 }] : [];
}

/* ── Documentacion y formulas (panel educativo) ─────────────────────────── */

/** Bloque de documentacion comun a las valvulas direccionales. */
function dcvDocs(cfg) {
  return {
    summary: cfg.summary,
    how: cfg.how,
    standard: cfg.standard,
    inputs: cfg.inputs || ['P — pressure from the pump', 'Pilot — optional external signal'],
    outputs: cfg.outputs || ['T — return to tank (or T1/T2 in 5-port valves)'],
    variables: [
      { symbol: 'ΔP', name: 'Pressure drop across the open spool', unit: 'pressure' },
      { symbol: 'Q', name: 'Flow through the valve', unit: 'flow' },
      { symbol: 'A', name: 'Area fed through the valve (cylinder or motor)', unit: 'length' }
    ],
    tips: cfg.tips || [
      'Centre type decides what happens when the valve is neutral: closed holds the load, tandem unloads the pump, float lets the load move.',
      'Sizing rule of thumb: keep the valve pressure drop below 3–5 % of the working pressure.'
    ]
  };
}

/** Formulas comunes: caida de presion, velocidad del actuador y potencia perdida. */
function dcvEquations(vm) {
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;
  const dropBar = P * 0.03;              /* el modelo aplica un 3 % de perdida */
  const loss = (P * 0.03) * Q / 600;     /* kW disipados por la valvula */

  const out = [{
    title: 'Pressure drop across the valve',
    formula: 'ΔP = ΔP_rated × (Q / Q_rated)²',
    where: 'The drop grows with the square of the flow: a valve that is too small overheats the oil',
    notes: 'This simulator applies a simplified 3 % pressure loss and 1 % flow loss while the spool is open.'
  }, {
    title: 'Actuator speed set by the valve',
    formula: 'v = Q / A',
    where: 'Q in L/min through the valve · A in mm² · v in mm/s',
    notes: 'Throttling the spool reduces Q and therefore the speed.'
  }, {
    title: 'Power dissipated in the valve',
    formula: 'P_loss = ΔP × Q / 600',
    where: 'ΔP in bar · Q in L/min · P in kW'
  }];

  if (P > 0 && Q > 0) {
    out[0].substitution = 'ΔP ≈ 3 % × ' + vm.fmt('pressure', P) + ' = ' + vm.fmtU('pressure', dropBar);
    out[2].substitution = 'P_loss = ' + vm.fmtU('pressure', dropBar) + ' × ' + vm.fmt('flow', Q) + ' / 600';
    out[2].result = vm.fmtU('power', loss);
  }
  return out;
}

export const directionalValves = [
  {
    type: 'dcv43', label: 'DCV 4/3', role: ROLES.VALVE_DIRECTIONAL, drop: drop,
    docs: dcvDocs({
      summary: 'Four-way three-position directional valve: the standard control for a double-acting cylinder or a reversible motor.',
      how: 'Three positions are drawn side by side and the spool slides left or right of the centre. In the centre the ports are blocked (closed), connected to tank (tandem/open) or floated, depending on the centre type chosen in the parameters. Feeding P to A extends the actuator while B returns to T; feeding P to B reverses the motion.',
      standard: 'Three connected squares, each showing the P, T, A and B connections of that position, with solenoid, lever or pilot actuators at both ends.'
    }),
    equations: dcvEquations, physics: { internalRouting: routingDcv43 }
  },
  {
    type: 'dcv42', label: 'DCV 4/2', role: ROLES.VALVE_DIRECTIONAL, drop: drop,
    docs: dcvDocs({
      summary: 'Four-way two-position directional valve: switches between two fixed directions, with no centre position.',
      how: 'There is no neutral position, so one of the two work lines is always connected. It is used where the actuator must always be driven (winches, feed rollers) or when a separate centre valve provides the neutral function.',
      standard: 'Two connected squares with an actuator symbol at each end.'
    }),
    equations: dcvEquations, physics: { internalRouting: routingDcv42 }
  },
  {
    type: 'dcv32', label: 'DCV 3/2', role: ROLES.VALVE_DIRECTIONAL, drop: drop,
    docs: dcvDocs({
      summary: 'Three-way two-position valve: feeds a single-acting cylinder or a pilot line and vents it to tank.',
      how: 'In the open position P is connected to A, so the actuator is pressurised; in the closed position A is cut from P and usually connected to T, letting a spring or the load return it. Typical of single-acting cylinders, grippers and brake-release circuits.',
      standard: 'Two squares with ports P, T and A; the spring is drawn on the return end.'
    }),
    equations: dcvEquations, physics: { internalRouting: routingDcv32 }
  },
  {
    type: 'dcv32no', label: 'DCV 3/2 NA', role: ROLES.VALVE_DIRECTIONAL, drop: drop,
    docs: dcvDocs({
      summary: 'Three-way two-position valve, normally open: without a signal the actuator stays pressurised.',
      how: 'The rest position is P→A. Applying the signal moves the spool so A is connected to tank and the actuator is released. Used for fail-safe clamping: a power failure releases the clamp.',
      standard: 'Two squares with the spring drawn on the "P to A" (rest) side.'
    }),
    equations: dcvEquations, physics: { internalRouting: routingDcv32No }
  },
  {
    type: 'dcv52', label: 'DCV 5/2', role: ROLES.VALVE_DIRECTIONAL, drop: drop,
    docs: dcvDocs({
      summary: 'Five-port two-position valve: two separate tank returns (T1, T2), common in pilot-operated spools.',
      how: 'With separate exhaust ports each work line has its own return, which avoids back-pressure coupling when both sides of a cylinder work at the same time. For the work ports it behaves like a 4/2 valve.',
      standard: 'Two squares with five ports (P, T1, A, T2, B) and both actuator symbols.',
      outputs: ['T1, T2 — separate returns to tank']
    }),
    equations: dcvEquations, physics: { internalRouting: routingDcv52 }
  },
  {
    type: 'dcv53', label: 'DCV 5/3', role: ROLES.VALVE_DIRECTIONAL, drop: drop,
    docs: dcvDocs({
      summary: 'Five-port three-position valve: adds a centre position with two independent returns.',
      how: 'The centre behaviour can be closed, exhaust (A and B to tank) or pressure (P feeding both work ports, useful to hold or pre-load). With separate T1/T2 returns each side can be exhausted independently.',
      standard: 'Three squares with five ports; the centre square shows the selected centre type.',
      outputs: ['T1, T2 — separate returns to tank']
    }),
    equations: dcvEquations, physics: { internalRouting: routingDcv53 }
  },
  {
    type: 'valve22', label: '2/2 Valve', role: ROLES.VALVE_DIRECTIONAL, drop: drop,
    docs: dcvDocs({
      summary: 'Two-way two-position valve: simply opens or closes a line (on/off).',
      how: 'It has no work ports: it only blocks or passes the flow of the line it is installed in. Used as a shut-off valve, a bypass or the pilot stage of a bigger valve.',
      standard: 'Two squares with two ports (In, Out) showing the open and blocked connections.',
      inputs: ['In — pressure inlet'],
      outputs: ['Out — pressure outlet (or blocked)']
    }),
    equations: dcvEquations, physics: { internalRouting: routingValve22 }
  },
  {
    type: 'valve22no', label: '2/2 NA', role: ROLES.VALVE_DIRECTIONAL, drop: drop,
    docs: dcvDocs({
      summary: 'Two-way two-position valve, normally open: the line stays passable until the valve is actuated.',
      how: 'The rest position is open (In→Out); with the signal applied the line is blocked. Typical of fail-safe circuits where flow must continue if the signal is lost.',
      standard: 'Two squares with the open connection drawn on the spring (rest) side.',
      inputs: ['In — pressure inlet'],
      outputs: ['Out — pressure outlet (or blocked)']
    }),
    equations: dcvEquations, physics: { internalRouting: routingValve22No }
  },
  {
    type: 'prop-dcv', label: 'Proportional DCV 4/3', role: ROLES.VALVE_DIRECTIONAL, drop: drop,
    docs: dcvDocs({
      summary: 'Proportional four-way valve: the spool opening — and therefore the speed — is set by an analogue command.',
      how: 'Instead of only two shifted positions, the command (−100 % … +100 %) moves the spool progressively, controlling direction and flow at the same time. A ±10 % dead band keeps the centre closed. Standard in joystick-controlled forest machinery for smooth movement.',
      standard: '4/3 envelope with two parallel arrows through the spool (proportional actuation).',
      inputs: ['P — pressure inlet', 'Command — analogue signal (−100 % … +100 %)'],
      outputs: ['T — return to tank', 'A / B — work lines with progressive opening']
    }),
    equations: dcvEquations, physics: { internalRouting: routingPropDcv }
  }
];
