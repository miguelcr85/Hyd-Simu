// ================================================================
// VALVULAS DE CAUDAL Y ANTIRRETORNO (9 tipos)
// ================================================================
// `physics.conduct(comp, portIdx, pressure, flow)` responde:
//   { canFlow, outPort, pressureDrop, flowLimit }
// Reglas migradas 1:1 desde js/core/simulation/passthrough.js (etapa E1).
//
//   outPort:  indice del puerto de salida (0/1/2), o -1 si no conduce
//   pressureDrop: bar que se restan a la presion (negativo = multiplicar)
//   flowLimit: caudal que sale, en L/min
// ================================================================

import { ROLES } from '../core/registry.js';

/* Objeto nuevo en cada llamada: evita compartir estado entre invocaciones. */
function blocked() { return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 }; }
const base = { type: '', label: '', role: ROLES.VALVE_FLOW, physics: {} };

/* Antirretorno simple: solo In(0)->Out(1) */
function check(comp, port, pressure, flow) {
  if (port === 0) return { canFlow: true, outPort: 1, pressureDrop: 0.5, flowLimit: flow };
  return blocked();
}

/* Antirretorno pilotado: Out(1)->In(0) solo con pilotaje > 5 bar */
function pilotCheck(comp, port, pressure, flow) {
  if (port === 0) return { canFlow: true, outPort: 1, pressureDrop: 0.5, flowLimit: flow };
  if (port === 1) {
    const hasPilot = comp._pilotPressure > 5;
    return { canFlow: hasPilot, outPort: 0, pressureDrop: hasPilot ? 0.5 : 0, flowLimit: hasPilot ? flow : 0 };
  }
  return blocked();
}

/* Antirretorno con muelle: abre al superar la presion de tarado */
function checkSpring(comp, port, pressure, flow) {
  const cracking = comp.values.cracking || 5;
  if (port === 0) {
    if (pressure >= cracking) return { canFlow: true, outPort: 1, pressureDrop: cracking * 0.1, flowLimit: flow };
    return blocked();
  }
  return blocked();
}

/* Control de caudal unidireccional: A->B limitado, B->A libre */
function flowCheck(comp, port, pressure, flow) {
  const setting = comp.values.flow || 10;
  if (port === 0) {
    const limited = Math.min(flow, setting);
    return { canFlow: true, outPort: 1, pressureDrop: (flow - limited) * 0.4, flowLimit: limited };
  }
  return { canFlow: true, outPort: 0, pressureDrop: 0.5, flowLimit: flow };
}

/* Orificio fijo: dP = Q^2 / (d^2 * 2) */
function orifice(comp, port, pressure, flow) {
  const diameter = comp.values.diameter || 1.5;
  const drop = (flow * flow) / (diameter * diameter * 2);
  return { canFlow: true, outPort: port === 0 ? 1 : 0, pressureDrop: drop, flowLimit: flow };
}

/* Estrangulador: caudal proporcional a la apertura */
function throttle(comp, port, pressure, flow) {
  const opening = (comp.values.opening || 50) / 100;
  return {
    canFlow: true,
    outPort: port === 0 ? 1 : 0,
    pressureDrop: pressure * (1 - opening) * 0.3,
    flowLimit: flow * opening
  };
}

/* Control de caudal: limita al valor ajustado */
function flowControl(comp, port, pressure, flow) {
  const max = comp.values.flow || 15;
  const limited = Math.min(flow, max);
  return { canFlow: true, outPort: port === 0 ? 1 : 0, pressureDrop: (flow - limited) * 0.5, flowLimit: limited };
}

/* Control de caudal compensado por presion: igual que el anterior */
function flowComp(comp, port, pressure, flow) {
  const max = comp.values.flow || 15;
  const limited = Math.min(flow, max);
  return { canFlow: true, outPort: port === 0 ? 1 : 0, pressureDrop: (flow - limited) * 0.5, flowLimit: limited };
}

/* Control de caudal proporcional: caudal segun comando */
function propFlow(comp, port, pressure, flow) {
  const cmd = Math.max(0, (comp.values && comp.values.command) || 50) / 100;
  const max = comp.values.maxFlow || 40;
  const limited = Math.min(flow, max * cmd);
  return {
    canFlow: cmd > 0.01,
    outPort: port === 0 ? 1 : 0,
    pressureDrop: (flow - limited) * 0.5,
    flowLimit: limited
  };
}

/* ── Documentacion y formulas (panel educativo) ─────────────────────────── */

const FLOW_VARS = [
  { symbol: 'Q', name: 'Flow through the valve', unit: 'flow' },
  { symbol: 'ΔP', name: 'Pressure drop across the valve', unit: 'pressure' },
  { symbol: 'Cd', name: 'Discharge coefficient (≈ 0.6–0.8)', unit: 'ratio' }
];

function flowValveDocs(cfg) {
  return {
    summary: cfg.summary,
    how: cfg.how,
    standard: cfg.standard,
    inputs: cfg.inputs || ['A — inlet'],
    outputs: cfg.outputs || ['B — outlet'],
    variables: cfg.variables || FLOW_VARS,
    tips: cfg.tips || []
  };
}

/** Ecuaciones de una restriccion: caudal limitado, caida de presion y calor. */
function dropEquations(vm, opts) {
  const o = opts || {};
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;
  const setFlow = o.setFlow;
  const through = (setFlow !== undefined) ? Math.min(Q, setFlow) : Q;
  const dropBar = (setFlow !== undefined) ? Math.max(0, Q - setFlow) * 0.5 : 0;

  const out = [{
    title: o.title || 'Flow through the restriction',
    formula: o.formula || 'Q_out = min(Q_in, Q_set)',
    where: o.where || 'Q_set is the valve adjustment (L/min); the surplus flow is throttled away',
    notes: o.notes
  }];

  if (setFlow !== undefined) {
    out[0].substitution = 'Q_out = min(' + vm.fmt('flow', Q) + ', ' + vm.fmtU('flow', setFlow) + ')';
    out[0].result = vm.fmtU('flow', through);
    out.push({
      title: 'Pressure drop created by the restriction',
      formula: 'ΔP = (Q_in − Q_set) × 0.5',
      where: 'Model used by the simulator for throttling valves (in bar)',
      substitution: 'ΔP = (' + vm.fmt('flow', Q) + ' − ' + vm.fmt('flow', setFlow) + ') × 0.5',
      result: vm.fmtU('pressure', dropBar)
    });
    out.push({
      title: 'Power turned into heat',
      formula: 'P_loss = ΔP × Q / 600',
      where: 'ΔP in bar · Q in L/min · P in kW',
      notes: 'This is why meter-out and bleed-off circuits heat the oil.',
      substitution: 'P_loss = ' + vm.fmt('pressure', dropBar) + ' × ' + vm.fmt('flow', through) + ' / 600',
      result: vm.fmtU('power', dropBar * through / 600)
    });
  } else if (P > 0) {
    out.push({
      title: 'Flow through the restriction',
      formula: 'Q = Cd × A × √(2ΔP/ρ)',
      where: 'Cd ≈ 0.7 · A in mm² · ΔP in bar · ρ ≈ 870 kg/m³',
      notes: 'Solved for ΔP this is the model the simulator applies.'
    });
  }
  return out;
}

/** Formula del orificio resuelta para la caida de presion (modelo del simulador). */
function orificeEquations(vm) {
  const diameter = vm.comp.values.diameter || 1.5;
  const area = Math.PI / 4 * diameter * diameter;
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;
  const dropBar = (Q * Q) / (diameter * diameter * 2);
  const outPressure = Math.max(0, P - dropBar);

  const out = [{
    title: 'Orifice equation',
    formula: 'Q = Cd × A × √(2ΔP/ρ)',
    where: 'A = π/4 · d² = ' + area.toFixed(2) + ' mm² for d = ' + diameter + ' mm',
    notes: 'Flow through an orifice grows with the square root of the pressure drop.'
  }, {
    title: 'Pressure drop (model in this simulator)',
    formula: 'ΔP = Q² / (d² × 2)',
    where: 'ΔP in bar · Q in L/min · d in mm'
  }, {
    title: 'Pressure after the orifice',
    formula: 'P_out = P_in − ΔP',
    where: 'P_in in bar'
  }];

  if (Q > 0) {
    out[1].substitution = 'ΔP = ' + vm.fmt('flow', Q) + '² / (' + diameter + '² × 2)';
    out[1].result = vm.fmtU('pressure', dropBar);
    out[2].substitution = 'P_out = ' + vm.fmt('pressure', P) + ' − ' + vm.fmt('pressure', dropBar);
    out[2].result = vm.fmtU('pressure', outPressure);
  }
  return out;
}

/** Valvulas de tarado (antirretornos con muelle, pilotadas): presion de apertura. */
function crackEquations(vm, opts) {
  const o = opts || {};
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;
  const crack = (o.crack !== undefined) ? o.crack : 0.5;   /* bar */
  const open = P >= crack;

  const out = [{
    title: 'Cracking pressure',
    formula: 'P_crack = F_spring / A_seat × 10',
    where: 'F in N · A in mm² · result in bar (because 1 N/mm² = 10 bar)',
    notes: o.notes || 'Below the cracking pressure the valve stays shut and no flow passes.'
  }, {
    title: 'State at the current pressure',
    formula: open ? 'P ≥ P_crack → valve open' : 'P < P_crack → valve closed',
    where: 'P = ' + vm.fmtU('pressure', P) + ' · P_crack = ' + vm.fmtU('pressure', crack)
  }, {
    title: 'Pressure drop once open',
    formula: 'ΔP = 0.5 bar',
    where: 'The simulator uses a fixed 0.5 bar drop; real valves drop 0.5–3 bar'
  }];

  if (Q > 0 && open) {
    out[1].result = 'Passing ' + vm.fmtU('flow', Q);
  }
  return out;
}

/** Valvulas proporcionales de caudal: el caudal sigue al comando. */
function propFlowEquations(vm, maxFlowDefault) {
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;
  const command = Math.max(0, (vm.comp.values.command !== undefined ? vm.comp.values.command : 50));
  const maxFlow = vm.comp.values.maxFlow || maxFlowDefault || 40;
  const setFlow = maxFlow * command / 100;
  const through = Math.min(Q, setFlow);

  const out = [{
    title: 'Flow set by the command',
    formula: 'Q_set = Q_max × command / 100',
    where: 'Q_max in L/min · command in % · Q_set in L/min',
    substitution: 'Q_set = ' + vm.fmt('flow', maxFlow) + ' × ' + command + ' %',
    result: vm.fmtU('flow', setFlow)
  }, {
    title: 'Flow actually delivered',
    formula: 'Q_out = min(Q_in, Q_set)',
    where: 'A proportional valve cannot deliver more than the pump supplies',
    substitution: 'Q_out = min(' + vm.fmt('flow', Q) + ', ' + vm.fmt('flow', setFlow) + ')',
    result: vm.fmtU('flow', through)
  }, {
    title: 'Power loss in the valve',
    formula: 'P_loss = ΔP × Q / 600',
    where: 'The lower the command, the higher the throttling loss'
  }];

  if (P > 0) {
    const dropBar = Math.max(0, Q - setFlow) * 0.5;
    out[2].substitution = 'P_loss = ' + vm.fmt('pressure', dropBar) + ' × ' + vm.fmt('flow', through) + ' / 600';
    out[2].result = vm.fmtU('power', dropBar * through / 600);
  }
  return out;
}

export const flowValves = [
  {
    type: 'check', label: 'Check Valve', role: ROLES.VALVE_FLOW,
    docs: flowValveDocs({
      summary: 'One-way valve: free flow in one direction, blocked in the other.',
      how: 'A poppet (or ball) is pressed onto its seat by a light spring. Flow in the allowed direction lifts it; reverse flow pushes it shut, so oil cannot return. It protects the pump and stops a load from running back through the circuit.',
      standard: 'Two triangles showing the flow direction with the seat bar and the spring behind the poppet.',
      tips: ['A plain check valve cannot hold a suspended load (it leaks): use a pilot-operated check valve.', 'Its cracking pressure adds to the circuit pressure — keep it between 0.5 and 3 bar unless a preload is wanted.']
    }),
    equations: function (vm) { return crackEquations(vm, { crack: 0.5 }); },
    physics: { conduct: check }
  },
  {
    type: 'pilot-check', label: 'Pilot Check', role: ROLES.VALVE_FLOW,
    docs: flowValveDocs({
      summary: 'Pilot-operated check valve: blocks reverse flow until an external pilot signal unlocks it.',
      how: 'Forward flow is free. In the reverse direction the poppet stays closed — holding a load in position — until pilot pressure acts on a small piston that pushes the poppet off its seat. This is the standard way to hold a vertical cylinder without creep.',
      standard: 'Check valve symbol with a dashed pilot line acting on the seat, drawn as a piston with a ratio.',
      inputs: ['A — inlet', 'B — outlet', 'Pilot — unlocking signal'],
      variables: [
        { symbol: 'P_pilot', name: 'Pilot pressure needed to unlock', unit: 'pressure' },
        { symbol: 'ratio', name: 'Pilot area ratio', unit: 'ratio' }
      ],
      tips: ['Pilot ratio 1:3 means the pilot needs one third of the load pressure to open.', 'Always connect the pilot to the pressurised line of the opposite movement.']
    }),
    equations: function (vm) {
      const load = vm.pressure || 0;
      const ratio = 3;
      const needed = load / ratio;
      return [{
        title: 'Pilot pressure needed to unlock',
        formula: 'P_pilot = P_load / ratio',
        where: 'P_load in bar · ratio = pilot area / seat area',
        substitution: 'P_pilot = ' + vm.fmt('pressure', load) + ' / ' + ratio,
        result: vm.fmtU('pressure', needed),
        notes: 'The simulator unlocks the valve as soon as the pilot port sees more than 5 bar.'
      }];
    },
    physics: { conduct: pilotCheck }
  },
  {
    type: 'check-spring', label: 'Spring Check', role: ROLES.VALVE_FLOW,
    docs: flowValveDocs({
      summary: 'Check valve with an adjustable spring: it only opens above a set cracking pressure.',
      how: 'The spring preload sets the pressure that must be reached before any flow passes. Used to create a deliberate back-pressure (sequence functions) or to prevent creeping of a load until enough pressure is built up.',
      standard: 'Check valve symbol with an adjustable spring drawn behind the seat.',
      tips: ['Typical cracking pressures are 1–10 bar.', 'A high cracking pressure wastes energy: it must be overcome on every stroke.']
    }),
    equations: function (vm) { return crackEquations(vm, { crack: vm.comp.values.cracking || 5 }); },
    physics: { conduct: checkSpring }
  },
  {
    type: 'flow-check', label: 'Flow Ctrl + Check', role: ROLES.VALVE_FLOW,
    docs: flowValveDocs({
      summary: 'One-way flow control valve (meter-in / meter-out): throttles one direction and lets the other pass freely.',
      how: 'A needle valve throttles the controlled direction while a parallel check valve bypasses it in the free direction. Installed in the pressure line it is meter-in; in the return line, meter-out. Meter-out gives the most stable control of an overrunning load.',
      standard: 'Variable orifice in parallel with a check valve, both between the two ports.',
      tips: ['Meter-out is preferred for vertical loads (the return line stays under pressure).', 'Meter-in heats the oil less but cannot control a load that runs away.']
    }),
    equations: function (vm) { return dropEquations(vm, { setFlow: vm.comp.values.flow || 10, title: 'Controlled direction (throttled)', formula: 'Q_set = needle setting', where: 'The free direction passes the full flow with only 0.5 bar drop' }); },
    physics: { conduct: flowCheck }
  },
  {
    type: 'orifice', label: 'Fixed Orifice', role: ROLES.VALVE_FLOW,
    docs: flowValveDocs({
      summary: 'Fixed restriction: creates a pressure drop proportional to the square of the flow.',
      how: 'A calibrated hole. Because the drop grows with the square of the flow, an orifice can be used as a simple flow meter (measure ΔP to know Q) or to create a deliberate pressure difference (bleed-off, damping, pilot resistance).',
      standard: 'Two arcs forming a restriction with fixed (non-adjustable) lines.',
      tips: ['ΔP grows with Q²: doubling the flow quadruples the pressure drop.', 'Small diameters can cause noise, heat and cavitation — check the drop at full flow.']
    }),
    equations: orificeEquations,
    physics: { conduct: orifice }
  },
  {
    type: 'throttle', label: 'Throttle Valve', role: ROLES.VALVE_FLOW,
    docs: flowValveDocs({
      summary: 'Adjustable restriction (throttle): the opening percentage sets how much flow passes.',
      how: 'A needle is screwed in or out of a seat, changing the open area. The flow through it depends on the opening AND on the pressure difference, so the speed of the actuator changes when the load changes. Its main use is simple speed adjustment where accuracy is not critical.',
      standard: 'Two curved lines forming an adjustable restriction with a diagonal arrow.',
      variables: [
        { symbol: 'O', name: 'Opening', unit: 'percent' },
        { symbol: 'Q', name: 'Flow through the valve', unit: 'flow' },
        { symbol: 'ΔP', name: 'Pressure drop', unit: 'pressure' }
      ],
      tips: ['A simple throttle is load-dependent: use a pressure-compensated valve when the speed must stay constant.', 'Throttling always turns hydraulic power into heat.']
    }),
    equations: function (vm) {
      const opening = (vm.comp.values.opening || 50) / 100;
      const P = vm.pressure || 0;
      const Q = vm.flow || 0;
      const through = Q * opening;
      const dropBar = P * (1 - opening) * 0.3;
      return [{
        title: 'Flow set by the opening',
        formula: 'Q_out = Q_in × O',
        where: 'O = opening / 100 (0…1)',
        substitution: 'Q_out = ' + vm.fmt('flow', Q) + ' × ' + opening.toFixed(2),
        result: vm.fmtU('flow', through)
      }, {
        title: 'Pressure drop (model in this simulator)',
        formula: 'ΔP = P × (1 − O) × 0.3',
        where: 'A practical approximation of the throttling loss',
        substitution: 'ΔP = ' + vm.fmt('pressure', P) + ' × (1 − ' + opening.toFixed(2) + ') × 0.3',
        result: vm.fmtU('pressure', dropBar)
      }, {
        title: 'Heat generated',
        formula: 'P_loss = ΔP × Q_out / 600',
        where: 'ΔP in bar · Q in L/min · P in kW',
        result: vm.fmtU('power', dropBar * through / 600)
      }];
    },
    physics: { conduct: throttle }
  },
  {
    type: 'flow-control', label: 'Flow Control', role: ROLES.VALVE_FLOW,
    docs: flowValveDocs({
      summary: 'Flow control valve: keeps the flow (and therefore the actuator speed) at the set value.',
      how: 'A needle valve sets the desired flow. Depending on where it is installed the circuit is meter-in (pressure line), meter-out (return line) or bleed-off (parallel to the pressure line). Meter-out is the usual choice for overrunning loads; bleed-off is the most efficient with a fixed pump.',
      standard: 'Variable restriction between the two ports with an adjustment arrow.',
      tips: ['Meter-out controls the load best; meter-in is the most efficient.', 'Fit a check valve in parallel if the return stroke must be fast (see "Flow Ctrl + Check").']
    }),
    equations: function (vm) { return dropEquations(vm, { setFlow: vm.comp.values.flow || 15 }); },
    physics: { conduct: flowControl }
  },
  {
    type: 'flow-comp', label: 'Pressure-Compensated FC', role: ROLES.VALVE_FLOW,
    docs: flowValveDocs({
      summary: 'Pressure-compensated flow control: the set flow stays constant even when the load changes.',
      how: 'A small pressure compensator keeps a constant pressure difference across the needle, so the flow does not depend on the load. It needs a minimum pressure difference to regulate (typically 7–15 bar) and it heats the oil with the surplus power.',
      standard: 'Variable restriction with a compensating spool and spring drawn above it.',
      tips: ['Use it when the speed must not change with the load (harvester heads, feeders).', 'It needs a relief valve: the surplus flow must go somewhere.']
    }),
    equations: function (vm) { return dropEquations(vm, { setFlow: vm.comp.values.flow || 15, notes: 'The compensator holds this flow regardless of the load pressure.' }); },
    physics: { conduct: flowComp }
  },
  {
    type: 'prop-flow', label: 'Proportional Flow Control', role: ROLES.VALVE_FLOW,
    docs: flowValveDocs({
      summary: 'Proportional flow control: the flow is set by an electrical command instead of a hand knob.',
      how: 'A proportional solenoid moves the spool according to the command (0–100 %), which allows the machine controller to vary the actuator speed continuously. Combined with a compensator the flow is also independent of the load.',
      standard: 'Variable restriction with a proportional (diagonal arrow with solenoid) actuator.',
      inputs: ['A — inlet', 'Command — electrical signal 0…100 %'],
      outputs: ['B — metered outlet'],
      tips: ['The command is normally a PWM current: keep the ramp slow to avoid pressure peaks.', 'Below about 5 % the valve may not open at all (dead band).']
    }),
    equations: function (vm) { return propFlowEquations(vm, 40); },
    physics: { conduct: propFlow }
  }
];

