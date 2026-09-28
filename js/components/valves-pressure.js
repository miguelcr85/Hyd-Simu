// ================================================================
// VALVULAS DE PRESION (6 tipos)
// ================================================================
// Reglas migradas 1:1 desde js/core/simulation/passthrough.js (etapa E1),
// incluida la histeresis de cada valvula y el ORDEN de evaluacion (que importa
// para el comportamiento de una sola pasada).
// ================================================================

import { ROLES } from '../core/registry.js';

function blocked() { return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 }; }

/* Reductora de presion: limita la presion aguas abajo al ajuste */
function pressureReducing(comp, port, pressure, flow) {
  const setting = comp.values.setting || 80;
  const outPressure = Math.min(pressure, setting);
  return {
    canFlow: true,
    outPort: port === 0 ? 1 : 0,
    pressureDrop: pressure - outPressure,
    flowLimit: flow
  };
}

/* Valvula de secuencia: abre al alcanzar el ajuste, cierra al 85 % */
function sequenceValve(comp, port, pressure, flow) {
  const setting = comp.values.setting || 100;
  const reset = setting * 0.85;
  if (comp._sequenceOpen) {
    if (pressure < reset) comp._sequenceOpen = false;
  } else {
    if (pressure >= setting) comp._sequenceOpen = true;
  }
  if (comp._sequenceOpen) {
    return { canFlow: true, outPort: port === 0 ? 1 : 0, pressureDrop: 2, flowLimit: flow };
  }
  return blocked();
}

/* Valvula de contrabalanceo: abre con pilotaje + carga; el retorno es libre */
function counterbalance(comp, port, pressure, flow) {
  if (port === 1) return { canFlow: true, outPort: 0, pressureDrop: 0.5, flowLimit: flow };
  const setting = comp.values.setting || 150;
  const pilot = comp._pilotPressure || 0;
  const canOpen = (pilot + pressure * 0.3) >= setting * 0.5 || pressure >= setting;
  return {
    canFlow: canOpen,
    outPort: 1,
    pressureDrop: canOpen ? 2 : 0,
    flowLimit: canOpen ? flow : 0
  };
}

/* Valvula de alivio: abre al alcanzar el ajuste y cierra al 92 % */
function relief(comp, port, pressure, flow) {
  const setting = comp.values.setting || 200;
  const reset = setting * 0.92;
  if (comp._reliefActive) {
    if (pressure < reset) comp._reliefActive = false;
  } else {
    if (pressure >= setting) comp._reliefActive = true;
  }
  if (port === 0 && comp._reliefActive) {
    return { canFlow: true, outPort: 1, pressureDrop: pressure, flowLimit: flow };
  }
  return blocked();
}

/* Alivio proporcional: el ajuste se escala con el comando (histeresis al 92 %).
   OJO: el orden de evaluacion es el inverso al del alivio simple. */
function propRelief(comp, port, pressure, flow) {
  const command = ((comp.values && comp.values.command) || 80) / 100;
  const maxSetting = (comp.values && comp.values.maxSetting) || 250;
  const setting = maxSetting * command;
  if (!comp._reliefActive) {
    if (pressure >= setting) comp._reliefActive = true;
  } else {
    if (pressure < setting * 0.92) comp._reliefActive = false;
  }
  if (port === 0 && comp._reliefActive) {
    return { canFlow: true, outPort: 1, pressureDrop: pressure, flowLimit: flow };
  }
  return blocked();
}

/* Valvula de descarga: abre P->T cuando el pilotaje supera el ajuste */
function unloading(comp, port, pressure, flow) {
  const setting = (comp.values && comp.values.setting) || 150;
  const pilot = comp._pilotPressure || 0;
  if (port === 0) {
    const open = pilot >= setting;
    return {
      canFlow: open,
      outPort: 1,
      pressureDrop: open ? 1 : 0,
      flowLimit: open ? flow : 0
    };
  }
  return blocked();
}

/* ── Documentacion y formulas (panel educativo) ─────────────────────────── */

function pressureValveDocs(cfg) {
  return {
    summary: cfg.summary,
    how: cfg.how,
    standard: cfg.standard,
    inputs: cfg.inputs || ['P — pressure inlet'],
    outputs: cfg.outputs || ['T — discharge to tank'],
    variables: cfg.variables || [
      { symbol: 'P_set', name: 'Spring setting', unit: 'pressure' },
      { symbol: 'Q', name: 'Flow through the valve', unit: 'flow' }
    ],
    tips: cfg.tips || []
  };
}

/** Valvula tarada por muelle: ajuste, estado y potencia disipada. */
function settingEquations(vm, opts) {
  const o = opts || {};
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;
  const setting = o.setting;
  const open = o.open;
  const dissipated = o.dissipatedFlow !== undefined ? o.dissipatedFlow : 0;

  const out = [{
    title: 'Setting of the valve',
    formula: 'P_set = F_spring / A_seat × 10',
    where: 'F in N · A in mm² · result in bar (1 N/mm² = 10 bar)',
    notes: o.settingNotes
  }, {
    title: 'State at the current pressure',
    formula: open ? 'P ≥ P_set → valve open' : 'P < P_set → valve closed',
    where: 'P = ' + vm.fmtU('pressure', P) +
      (setting !== undefined ? ' · P_set = ' + vm.fmtU('pressure', setting) : ''),
    notes: o.stateNotes
  }];

  if (dissipated > 0 && P > 0) {
    out.push({
      title: 'Power turned into heat',
      formula: 'P_loss = ΔP × Q / 600',
      where: 'ΔP in bar · Q in L/min · P in kW',
      substitution: 'P_loss = ' + vm.fmt('pressure', P) + ' × ' + vm.fmt('flow', dissipated) + ' / 600',
      result: vm.fmtU('power', P * dissipated / 600),
      notes: 'Every litre that goes over the relief valve is energy turned into heat.'
    });
  }
  if (Q > 0 && open) {
    out[1].result = 'Relieving ' + vm.fmtU('flow', Q);
  }
  return out;
}

/** Reductora: presion de salida limitada al ajuste. */
function reducingEquations(vm) {
  const setting = vm.comp.values.setting || 80;
  const P = vm.pressure || 0;
  const outPressure = Math.min(P, setting);
  const drop = P - outPressure;
  return [{
    title: 'Outlet pressure',
    formula: 'P_out = min(P_in, P_set)',
    where: 'The valve only reduces: it cannot raise the pressure above the setting',
    substitution: 'P_out = min(' + vm.fmt('pressure', P) + ', ' + vm.fmtU('pressure', setting) + ')',
    result: vm.fmtU('pressure', outPressure)
  }, {
    title: 'Pressure drop',
    formula: 'ΔP = P_in − P_out',
    substitution: 'ΔP = ' + vm.fmt('pressure', P) + ' − ' + vm.fmt('pressure', outPressure),
    result: vm.fmtU('pressure', drop)
  }, {
    title: 'Heat generated',
    formula: 'P_loss = ΔP × Q / 600',
    where: 'ΔP in bar · Q in L/min · P in kW',
    result: vm.fmtU('power', drop * (vm.flow || 0) / 600)
  }];
}

/** Contrabalanceo: relacion de pilotaje. */
function counterbalanceEquations(vm) {
  const setting = vm.comp.values.setting || 150;
  const pilot = vm.comp._pilotPressure || 0;
  const load = vm.pressure || 0;
  const ratio = 0.3;                       /* fraccion de la carga que ayuda a abrir */
  const needed = Math.max(0, setting * 0.5 - load * ratio);
  return [{
    title: 'Opening condition',
    formula: 'P_pilot + 0.3 × P_load ≥ 0.5 × P_set',
    where: 'The pilot pressure plus 30 % of the load pressure must overcome half the setting',
    substitution: 'P_pilot (' + vm.fmt('pressure', pilot) + ') + 0.3 × ' + vm.fmt('pressure', load) +
      ' ≥ 0.5 × ' + vm.fmtU('pressure', setting),
    notes: 'The 3:1 pilot ratio is the usual design: the pilot needs one third of the load pressure.'
  }, {
    title: 'Pilot pressure still needed',
    formula: 'P_pilot,min = 0.5 × P_set − 0.3 × P_load',
    result: vm.fmtU('pressure', needed)
  }];
}

export const pressureValves = [
  {
    type: 'relief', label: 'Relief Valve', role: ROLES.VALVE_PRESSURE,
    docs: pressureValveDocs({
      summary: 'Relief valve: caps the system pressure by dumping the surplus flow to tank. It is the main safety element of every circuit.',
      how: 'A spring holds a poppet on its seat. When the pressure reaches the setting the poppet lifts and the pump flow goes back to tank, so the pressure cannot rise any further. The lowest relief setting connected to the circuit defines the working pressure of the whole system. It cracks at the setting and reseats at 92 % of it (blowdown).',
      standard: 'Normally-closed valve symbol with an arrow from P to T, a spring and a pilot line to the inlet.',
      tips: ['Never leave a fixed pump without a relief valve.', 'A relief that is constantly dumping turns all the pump power into heat: check the tank temperature.', 'Set it 10–15 % above the working pressure, below the weakest component rating.']
    }),
    equations: function (vm) {
      const setting = vm.comp.values.setting || 200;
      const P = vm.pressure || 0;
      const open = P >= setting;
      return settingEquations(vm, {
        setting: setting,
        open: open,
        dissipatedFlow: open ? (vm.flow || 0) : 0,
        settingNotes: 'The spring preload divided by the seat area gives the cracking pressure.',
        stateNotes: 'Blowdown: the valve reseats at 92 % of the setting, which avoids chattering.'
      });
    },
    physics: { conduct: relief }
  },
  {
    type: 'prop-relief', label: 'Proportional Relief', role: ROLES.VALVE_PRESSURE,
    docs: pressureValveDocs({
      summary: 'Proportional relief valve: the pressure setting follows an electrical command, so the controller can change the system pressure while working.',
      how: 'A proportional solenoid varies the spring force; the command (0–100 %) therefore scales the maximum pressure between 0 and the valve maximum. Used for load-sensing, for soft starts and to limit the force of a function depending on the job.',
      standard: 'Relief symbol with a proportional (diagonal arrow plus solenoid) actuator and a command lead.',
      inputs: ['P — pressure inlet', 'Command — electrical signal 0…100 %'],
      variables: [
        { symbol: 'P_max', name: 'Valve maximum pressure', unit: 'pressure' },
        { symbol: 'command', name: 'Electrical command', unit: 'percent' }
      ],
      tips: ['Set the stand-by pressure low: it saves power and keeps the oil cooler.', 'A rising ramp avoids pressure peaks when the function is switched on.']
    }),
    equations: function (vm) {
      const command = (vm.comp.values.command !== undefined ? vm.comp.values.command : 80);
      const maxSetting = vm.comp.values.maxSetting || 250;
      const setting = maxSetting * command / 100;
      const P = vm.pressure || 0;
      const open = P >= setting;
      const base = settingEquations(vm, { setting: setting, open: open, dissipatedFlow: open ? (vm.flow || 0) : 0 });
      base.unshift({
        title: 'Setting from the command',
        formula: 'P_set = P_max × command / 100',
        where: 'P_max in bar · command in %',
        substitution: 'P_set = ' + vm.fmt('pressure', maxSetting) + ' × ' + command + ' %',
        result: vm.fmtU('pressure', setting)
      });
      return base;
    },
    physics: { conduct: propRelief }
  },
  {
    type: 'sequence-valve', label: 'Sequence Valve', role: ROLES.VALVE_PRESSURE,
    docs: pressureValveDocs({
      summary: 'Sequence valve: keeps a line blocked until the pressure reaches the setting, then opens to feed a second movement.',
      how: 'The pump feeds the first function; when that function reaches the end of its stroke the pressure rises, the sequence valve opens and the oil is diverted to the second function. It is an economical alternative to electrical sequencing (clamps that close before a drill advances, outriggers before lifting).',
      standard: 'Relief-like symbol with an external drain and the secondary outlet (A) fed through the valve.',
      outputs: ['A — flow to the second function once the setting is reached'],
      tips: ['It cracks at the setting and closes again at 85 % (hysteresis), so it will not chatter.', 'Remember the extra pressure needed: the pump must reach the setting before anything happens.']
    }),
    equations: function (vm) {
      const setting = vm.comp.values.setting || 100;
      const P = vm.pressure || 0;
      const open = (P >= setting) || !!(vm.comp._sequenceOpen);
      return settingEquations(vm, {
        setting: setting,
        open: open,
        dissipatedFlow: 0,
        settingNotes: 'The secondary movement starts when the primary one has built the setting pressure.',
        stateNotes: 'Hysteresis: opens at the setting, closes at 85 % of it.'
      });
    },
    physics: { conduct: sequenceValve }
  },
  {
    type: 'counterbalance', label: 'Counterbalance', role: ROLES.VALVE_PRESSURE,
    docs: pressureValveDocs({
      summary: 'Counterbalance valve: holds a load on the return line and lets it down under control.',
      how: 'Installed on the rod side of a cylinder it stays closed and traps the oil, so the load cannot run away. It opens when the pilot pressure coming from the pressure line (plus part of the load pressure) overcomes the spring. The 3:1 pilot ratio means the pilot needs about one third of the load pressure to open, which keeps the safe margin of the load.',
      standard: 'Relief symbol on the return line with a dashed pilot line from the opposite work port.',
      outputs: ['A — controlled outlet to the cylinder'],
      tips: ['Essential for boom or grapple cylinders that must not drift down.', 'Too high a setting wastes energy; too low a setting lets the load creep.']
    }),
    equations: counterbalanceEquations, physics: { conduct: counterbalance }
  },
  {
    type: 'pressure-reducing', label: 'Pressure Reducing', role: ROLES.VALVE_PRESSURE,
    docs: pressureValveDocs({
      summary: 'Pressure reducing valve: keeps a constant, lower pressure downstream of it.',
      how: 'A normally-open spool closes progressively to hold the outlet pressure at the setting, independently of the inlet pressure. It is used to feed secondary circuits (grippers, clamping, pilot lines) at a safe pressure lower than the main system pressure.',
      standard: 'Normally-open valve symbol with a spring that closes the spool and a pilot line from the outlet.',
      outputs: ['A — reduced pressure outlet'],
      tips: ['It only reduces: if the inlet drops below the setting, the outlet follows it.', 'Set it above the pilot pressure your valves need, otherwise they will not move.']
    }),
    equations: reducingEquations, physics: { conduct: pressureReducing }
  },
  {
    type: 'unloading', label: 'Unloading Valve', role: ROLES.VALVE_PRESSURE,
    docs: pressureValveDocs({
      summary: 'Unloading valve: dumps the pump to tank when a pilot signal tells it to, so the pump works unloaded.',
      how: 'Normally closed, it opens P→T as soon as the pilot port (X) sees the set pressure. Typical use: when an accumulator is full or a function has parked, the pump is unloaded to avoid heating the oil at the relief pressure.',
      standard: 'Normally-closed valve from P to T with a dashed pilot line from the external signal.',
      inputs: ['P — pressure inlet', 'X — external pilot signal'],
      tips: ['Unloading saves energy and keeps the oil cooler than a relief valve.', 'Check that the pilot signal really disappears, otherwise the pump stays unloaded.']
    }),
    equations: function (vm) {
      const setting = (vm.comp.values && vm.comp.values.setting) || 150;
      const pilot = vm.comp._pilotPressure || 0;
      const open = pilot >= setting;
      const base = settingEquations(vm, {
        setting: setting,
        open: open,
        dissipatedFlow: open ? (vm.flow || 0) : 0
      });
      base.unshift({
        title: 'Unloading condition',
        formula: 'P_pilot ≥ P_set → pump to tank',
        where: 'P_pilot measured in the pilot port, P_set the adjustment',
        substitution: vm.fmtU('pressure', pilot) + (open ? ' ≥ ' : ' < ') + vm.fmtU('pressure', setting),
        result: open ? 'Unloading' : 'Closed',
        notes: 'While unloaded the pump only overcomes the line losses.'
      });
      return base;
    },
    physics: { conduct: unloading }
  }
];
