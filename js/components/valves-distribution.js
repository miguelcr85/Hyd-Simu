// ================================================================
// VALVULAS DE REPARTO, PRIORIDAD Y MULTIPLICADOR (6 tipos)
// ================================================================
// Reglas migradas 1:1 desde js/core/simulation/passthrough.js (etapa E1).
// `outPort: -2` significa "multi-salida": el solver reparte el caudal entre los
// demas puertos del componente (es el caso del tee y del divisor de caudal).
// ================================================================

import { ROLES } from '../core/registry.js';

/* Objeto nuevo en cada llamada: evita compartir estado entre invocaciones. */
function blocked() { return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 }; }

/* Te: cualquier puerto reparte a los otros dos */
function tee(comp, port, pressure, flow) {
  if (port === 0 || port === 1 || port === 2) {
    return { canFlow: true, outPort: -2, pressureDrop: 0, flowLimit: flow };
  }
  return blocked();
}

/* Valvula selectora (shuttle): pasa la presion mayor; A(0)/B(1) -> out(2) */
function shuttle(comp, port, pressure, flow) {
  if (port === 0) comp._shuttleA = pressure;
  if (port === 1) comp._shuttleB = pressure;
  if (port === 0 || port === 1) {
    const other = port === 0 ? (comp._shuttleB || 0) : (comp._shuttleA || 0);
    if (pressure >= other) return { canFlow: true, outPort: 2, pressureDrop: 0.5, flowLimit: flow };
    return blocked();
  }
  return blocked();
}

/* Valvula Y (AND): X(0) e Y(1) con presion -> salida A(2) */
function andValve(comp, port, pressure, flow) {
  if (port === 0) comp._andPortX = pressure;
  if (port === 1) comp._andPortY = pressure;
  if (port === 0 || port === 1) {
    const other = port === 0 ? (comp._andPortY || 0) : (comp._andPortX || 0);
    const canFlow = pressure > 5 && other > 5;
    return {
      canFlow: canFlow,
      outPort: 2,
      pressureDrop: 0.5,
      flowLimit: canFlow ? Math.min(pressure, other) : 0
    };
  }
  return blocked();
}

/* Multiplicador de presion: P_HP = P_LP x relacion; Q_HP = Q_LP / relacion
   Se implementa con pressureDrop negativo (boost). */
function intensifier(comp, port, pressure, flow) {
  const ratio = comp.values.ratio || 4;
  if (port === 0) {
    const boost = -(ratio - 1) * pressure;
    return { canFlow: true, outPort: 2, pressureDrop: boost, flowLimit: flow / ratio };
  }
  return blocked();
}

/* Valvula de prioridad: CF(1) recibe el caudal ajustado; EF(2) el resto.
   ETAPA E2: se declara la salida adicional EF (antes el caudal excedente se
   perdia y la valvula no alimentaba ninguna rama). */
function priority(comp, port, pressure, flow) {
  if (port === 0) {
    const setting = comp.values.setting || 15;
    const cfFlow = Math.min(flow, setting);
    comp._priorityFlow = flow;                     /* caudal total de entrada */
    return {
      canFlow: true,
      outPort: 1,
      pressureDrop: 0,
      flowLimit: cfFlow,
      extra: [{ outPort: 2, flowLimit: Math.max(0, flow - cfFlow) }]
    };
  }
  return blocked();
}

/* Divisor de caudal: P(0) -> A(1) + B(2) segun el reparto ajustado */
function flowDivider(comp, port, pressure, flow) {
  if (port === 0) {
    comp._dividerRatioA = (comp.values.ratio || 50) / 100;
    return { canFlow: true, outPort: -2, pressureDrop: 0, flowLimit: flow };
  }
  return blocked();
}

/* ── Documentacion y formulas (panel educativo) ─────────────────────────── */

function distDocs(cfg) {
  return {
    summary: cfg.summary,
    how: cfg.how,
    standard: cfg.standard,
    inputs: cfg.inputs,
    outputs: cfg.outputs,
    variables: cfg.variables,
    tips: cfg.tips || []
  };
}

/** Continuidad de caudal en un punto de reparto (tee). */
function teeEquations(vm) {
  const Q = vm.flow || 0;
  return [{
    title: 'Continuity of flow',
    formula: 'Q_in = Q_A + Q_B',
    where: 'What goes in must come out: the flow divides between the two branches',
    notes: 'The simulator splits the incoming flow equally between the other two ports.',
    substitution: 'Q_A = Q_B = ' + vm.fmtU('flow', Q / 2)
  }, {
    title: 'Pressure at the junction',
    formula: 'P_A = P_B = P_in − ΔP_junction',
    where: 'All the ports of a tee see the same pressure (the model uses no loss)',
    substitution: 'P = ' + vm.fmtU('pressure', vm.pressure || 0)
  }];
}

/** Valvula selectora: deja pasar la presion mayor. */
function shuttleEquations(vm) {
  return [{
    title: 'Pressure selected',
    formula: 'P_out = max(P_A, P_B)',
    where: 'Only the higher of the two inlet pressures reaches the outlet',
    notes: 'The two inputs are isolated from each other: the lower one cannot leak into the higher one.'
  }, {
    title: 'Flow to the outlet',
    formula: 'Q_out = Q of the winning branch',
    where: 'All the flow of the active line goes to the outlet (minus the 0.5 bar drop)',
    substitution: 'Q = ' + vm.fmtU('flow', vm.flow || 0)
  }];
}

/** Valvula Y (AND): solo pasa si ambas entradas tienen presion. */
function andValveEquations(vm) {
  const P = vm.pressure || 0;
  return [{
    title: 'Logic condition',
    formula: 'Q_out > 0 only if P_X > 5 bar AND P_Y > 5 bar',
    where: 'Both signals must be present (hydraulic AND)',
    substitution: 'Highest inlet pressure = ' + vm.fmtU('pressure', P),
    notes: 'Used as a safety condition: the movement only happens when both lines are pressurised.'
  }];
}

/** Multiplicador de presion: P2 = ratio x P1, Q2 = Q1 / ratio. */
function intensifierEquations(vm) {
  const ratio = vm.comp.values.ratio || 4;
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;
  const P2 = P * ratio;
  const Q2 = Q / ratio;
  return [{
    title: 'Pressure boost',
    formula: 'P₂ = P₁ × ratio',
    where: 'P₁ in bar · ratio = area ratio of the two pistons',
    substitution: 'P₂ = ' + vm.fmt('pressure', P) + ' × ' + ratio,
    result: vm.fmtU('pressure', P2)
  }, {
    title: 'Flow reduction',
    formula: 'Q₂ = Q₁ / ratio',
    where: 'The volume that leaves the high-pressure side is smaller',
    substitution: 'Q₂ = ' + vm.fmt('flow', Q) + ' / ' + ratio,
    result: vm.fmtU('flow', Q2)
  }, {
    title: 'Power balance',
    formula: 'P₁ × Q₁ ≈ P₂ × Q₂',
    where: 'You never get more power than you put in: the pressure is raised by reducing the flow',
    notes: 'In practice the difference is lost as heat inside the intensifier.'
  }];
}

/** Valvula de prioridad: garantiza un caudal a la rama CF. */
function priorityEquations(vm) {
  const setting = vm.comp.values.setting || 15;
  const Q = vm.flow || 0;
  const cf = Math.min(Q, setting);
  return [{
    title: 'Priority flow (CF)',
    formula: 'Q_CF = min(Q_in, Q_set)',
    where: 'Q_set = CF flow in L/min',
    substitution: 'Q_CF = min(' + vm.fmt('flow', Q) + ', ' + vm.fmtU('flow', setting) + ')',
    result: vm.fmtU('flow', cf)
  }, {
    title: 'Excess flow (EF)',
    formula: 'Q_EF = Q_in − Q_CF',
    where: 'The rest goes to the secondary circuit (or to tank)',
    substitution: 'Q_EF = ' + vm.fmt('flow', Q) + ' − ' + vm.fmt('flow', cf),
    result: vm.fmtU('flow', Math.max(0, Q - cf))
  }];
}

/** Divisor de caudal: reparte en una proporcion fija. */
function dividerEquations(vm) {
  const ratio = vm.comp.values.ratio || 50;
  const Q = vm.flow || 0;
  const qa = Q * ratio / 100;
  return [{
    title: 'Split by ratio',
    formula: 'Q_A = Q_in × ratio / 100',
    where: 'ratio = split A (%) · the rest goes to B',
    substitution: 'Q_A = ' + vm.fmt('flow', Q) + ' × ' + ratio + ' %',
    result: vm.fmtU('flow', qa)
  }, {
    title: 'Second branch',
    formula: 'Q_B = Q_in − Q_A',
    substitution: 'Q_B = ' + vm.fmt('flow', Q) + ' − ' + vm.fmt('flow', qa),
    result: vm.fmtU('flow', Math.max(0, Q - qa))
  }, {
    title: 'Synchronising two actuators',
    formula: 'v = Q_branch / A',
    where: 'Two identical cylinders fed from the two branches move at the same speed',
    notes: 'A flow divider keeps them synchronised even under different loads.'
  }];
}

export const distributionValves = [
  {
    type: 'tee', label: 'T-Connector', role: ROLES.VALVE_FLOW,
    docs: distDocs({
      summary: 'T-connector: divides one line into two (or joins two lines into one).',
      how: 'A plain junction with no moving parts. The flow divides according to the resistance of each branch, so it is not a way to synchronise actuators — use a flow divider for that. The pressure is the same at all three ports.',
      standard: 'Three lines meeting at a point, drawn with a connection dot.',
      inputs: ['In — incoming line'],
      outputs: ['A, B — the two branches'],
      variables: [
        { symbol: 'Q_in', name: 'Incoming flow', unit: 'flow' },
        { symbol: 'Q_A, Q_B', name: 'Flow in each branch', unit: 'flow' },
        { symbol: 'P', name: 'Pressure at the junction', unit: 'pressure' }
      ],
      tips: ['The branch with less resistance takes more flow — tees do not balance cylinders.', 'Keep the junction clean: a sharp tee creates turbulence and pressure losses.']
    }),
    equations: teeEquations, physics: { conduct: tee }
  },
  {
    type: 'shuttle', label: 'Shuttle Valve', role: ROLES.VALVE_FLOW,
    docs: distDocs({
      summary: 'Shuttle valve (OR valve): lets the higher of two pressures through to the outlet.',
      how: 'A free-moving ball or spool is pushed by the higher inlet pressure against the opposite seat, so that side feeds the outlet while the lower one is isolated. Used to combine two command signals (either one starts the movement) or as an emergency steering backup.',
      standard: 'Ball inside a chamber with two inlets (A, B) and one outlet, with a seat at each end.',
      inputs: ['A, B — two pressure signals'],
      outputs: ['Out — the higher of the two'],
      variables: [
        { symbol: 'P_A, P_B', name: 'Inlet pressures', unit: 'pressure' },
        { symbol: 'P_out', name: 'Selected pressure', unit: 'pressure' }
      ],
      tips: ['Ideal to combine a manual and an automatic command on the same pilot line.', 'Do not use it to add flows: it only selects one side.']
    }),
    equations: shuttleEquations, physics: { conduct: shuttle }
  },
  {
    type: 'and-valve', label: 'AND Valve', role: ROLES.VALVE_FLOW,
    docs: distDocs({
      summary: 'AND valve: only passes flow when both inlet pressures are present.',
      how: 'Both signals must be pressurised at the same time before the outlet is connected. Used as a hydraulic safety interlock: for example, allow a movement only when a support leg is down and the operator is holding both controls.',
      standard: 'Two inlet lines (X, Y) with check-valve symbols meeting at a common outlet (A).',
      inputs: ['X, Y — the two conditions'],
      outputs: ['A — output only when X and Y are pressurised'],
      variables: [
        { symbol: 'P_X, P_Y', name: 'Inlet pressures', unit: 'pressure' },
        { symbol: 'P_th', name: 'Threshold (5 bar in this simulator)', unit: 'pressure' }
      ],
      tips: ['Use it as a safety interlock, never as the only protective measure.', 'The outlet flow is limited by the weaker of the two inputs.']
    }),
    equations: andValveEquations, physics: { conduct: andValve }
  },
  {
    type: 'intensifier', label: 'Intensifier', role: ROLES.VALVE_FLOW,
    docs: distDocs({
      summary: 'Pressure intensifier: raises the pressure by the area ratio, reducing the flow in the same proportion.',
      how: 'A large piston driven by the low-pressure oil pushes a smaller piston that generates a much higher pressure on a small volume of oil. Used for short high-force strokes: press tools, clamping, shear blades.',
      standard: 'Two pistons of different size on a common rod with the P (low pressure), T (drain) and HP (high pressure) ports.',
      inputs: ['P — low-pressure supply', 'T — drain to tank'],
      outputs: ['HP — intensified pressure'],
      variables: [
        { symbol: 'P₁, Q₁', name: 'Low-pressure side', unit: 'pressure' },
        { symbol: 'P₂, Q₂', name: 'High-pressure side', unit: 'pressure' },
        { symbol: 'ratio', name: 'Area ratio', unit: 'ratio' }
      ],
      tips: ['The intensified volume is small, so the useful stroke of the tool is short.', 'Power is the same on both sides (minus losses): flow is traded for pressure.']
    }),
    equations: intensifierEquations, physics: { conduct: intensifier }
  },
  {
    type: 'priority', label: 'Priority Valve', role: ROLES.VALVE_FLOW,
    docs: distDocs({
      summary: 'Priority valve: guarantees a fixed flow to one circuit (CF) and sends the rest to a second circuit (EF).',
      how: 'A compensator keeps the priority flow (CF) constant whatever happens downstream, while the excess (EF) feeds steering, brakes or a secondary function. This is how the steering of a forest machine is protected when the working circuit loads up.',
      standard: 'Valve with P (inlet), CF (controlled flow) and EF (excess flow) ports.',
      inputs: ['P — pump supply'],
      outputs: ['CF — priority flow (constant)', 'EF — excess flow'],
      variables: [
        { symbol: 'Q_CF', name: 'Priority flow', unit: 'flow' },
        { symbol: 'Q_EF', name: 'Excess flow', unit: 'flow' }
      ],
      tips: ['Size it from the priority consumer: the steering always gets its flow first.', 'The excess line needs its own return or a downstream function.']
    }),
    equations: priorityEquations, physics: { conduct: priority }
  },
  {
    type: 'flow-divider', label: 'Flow Divider', role: ROLES.VALVE_FLOW,
    docs: distDocs({
      summary: 'Flow divider: splits the incoming flow in a fixed proportion, whatever the load on each branch.',
      how: 'A compensating spool keeps the set proportion between the two outlets, so two cylinders move together even when one carries more load. Used to synchronise the lift cylinders of a loader or the clamping arms of a harvester head.',
      standard: 'Valve with P (inlet) and A, B (outlets) plus the split ratio drawn inside.',
      inputs: ['P — pump supply'],
      outputs: ['A — first branch (ratio %)', 'B — second branch (the rest)'],
      variables: [
        { symbol: 'ratio', name: 'Split to branch A', unit: 'percent' },
        { symbol: 'Q_A, Q_B', name: 'Flow in each branch', unit: 'flow' }
      ],
      tips: ['Synchronisation accuracy is typically 2–5 %: not enough for some positioning tasks.', 'Fit a relief valve if one branch can be blocked.']
    }),
    equations: dividerEquations, physics: { conduct: flowDivider }
  }
];
