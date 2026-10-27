// ================================================================
// FUENTES DE ENERGIA (6 tipos)
// ================================================================
// Las bombas y el motor termico son fuentes: el solver los procesa en su fase de
// fuentes (semilla del BFS). La bomba manual, ademas, tiene regla en la tabla de
// conduccion (es transparente como passthrough: solo actua como fuente).
// ================================================================

import { ROLES } from '../core/registry.js';

/* Bomba manual: como passthrough es transparente (no conduce) */
function handPump(comp, port, pressure, flow) {
  return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
}

/* ── Documentacion y formulas (panel educativo) ─────────────────────────── */

function sourceDocs(cfg) {
  return {
    summary: cfg.summary,
    how: cfg.how,
    standard: cfg.standard,
    inputs: cfg.inputs || ['T — suction line from the tank'],
    outputs: cfg.outputs || ['P — pressure line to the circuit'],
    variables: cfg.variables || [
      { symbol: 'V', name: 'Displacement per revolution', unit: 'displacement' },
      { symbol: 'n', name: 'Drive speed', unit: 'rpm' },
      { symbol: 'Q', name: 'Flow delivered', unit: 'flow' },
      { symbol: 'p', name: 'Working pressure', unit: 'pressure' }
    ],
    tips: cfg.tips || []
  };
}

/** Bombas: caudal, potencia hidraulica y par de accionamiento. */
function pumpEquations(vm, opts) {
  const o = opts || {};
  const comp = vm.comp;
  const displacement = comp.values.displacement || 28;
  const pressure = (o.pressure !== undefined) ? o.pressure : (comp.values.pressure || 150);
  const flow = (o.flow !== undefined) ? o.flow : (comp.values.flow || 30);
  const rpm = (o.rpm !== undefined) ? o.rpm : (comp._inputRPM || comp.values.rpm || 1500);
  const effVol = ((o.effVol !== undefined) ? o.effVol : (comp.values.efficiencyVol || 92)) / 100;
  const power = pressure * flow / 600;                 /* kW */
  const torque = rpm > 0 ? power * 9550 / rpm : 0;     /* Nm */
  const theoretical = displacement * rpm / 1000;       /* L/min */
  const actual = theoretical * effVol;

  const out = [{
    title: 'Flow delivered',
    formula: 'Q = V × n × η_vol / 1000',
    where: 'V in cm³/rev · n in rpm · Q in L/min',
    substitution: 'Q = ' + vm.fmt('displacement', displacement) + ' × ' + vm.fmt('rpm', rpm) + ' × ' + effVol,
    result: vm.fmtU('flow', actual),
    notes: 'The theoretical flow (without losses) would be ' + vm.fmtU('flow', theoretical) + '.'
  }, {
    title: 'Hydraulic power — P = p × Q / 600',
    formula: 'P = p × Q / 600',
    where: 'p in bar · Q in L/min · P in kW',
    substitution: 'P = ' + vm.fmt('pressure', pressure) + ' × ' + vm.fmt('flow', flow) + ' / 600',
    result: vm.fmtU('power', power)
  }, {
    title: 'Drive torque — T = 9550 × P / n',
    formula: 'T = 9550 × P / n',
    where: 'P in kW · n in rpm · T in Nm',
    substitution: 'T = 9550 × ' + vm.fmt('power', power) + ' / ' + vm.fmt('rpm', rpm),
    result: vm.fmtU('torque', torque),
    notes: 'This is the torque the engine or the PTO must supply to the pump.'
  }];

  /* La bomba aspira del tanque (puerto T) el mismo caudal que entrega por P */
  out.push({
    title: 'Suction line (port T)',
    formula: 'Q_suction = Q_delivered',
    where: 'The pump takes from the tank exactly the flow it delivers to the circuit',
    substitution: 'Q_suction = ' + vm.fmtU('flow', actual),
    notes: 'The oil moves FROM the tank INTO the pump through port T, so the particles enter the pump.'
  });

  if (o.dissipated) {
    out.push({
      title: 'Power turned into heat when the relief valve dumps',
      formula: 'P_loss = p × Q / 600',
      where: 'All the pump power becomes heat in the oil',
      result: vm.fmtU('power', power),
      notes: 'This is why a pump left dumping heats the oil so quickly.'
    });
  }

  /* Diagnostico: una bomba de desplazamiento variable debe estar enchufada a un
     pump-drive (puerto IN). Si no lo esta, el modelo usa la entrada por defecto. */
  if (comp.type === 'pump-var-displacement') {
    const source = String(comp._sourceType || '');
    if (source.indexOf('pump-drive') !== 0) {
      out.push({
        title: 'Mechanical input — not connected',
        formula: 'P_in = 46 kW · n_in = 1500 rpm (default)',
        where: 'This pump is not fed by a pump drive in the circuit',
        notes: 'Connect the pump IN port (left side) to an output of the pump drive (OUT1…OUT3) so that the real speed and power are used.'
      });
    } else {
      out.push({
        title: 'Mechanical input received',
        formula: 'P_in = output power of the pump drive · n_in = output speed',
        where: 'Origin: ' + source,
        result: vm.fmtU('power', comp._inputPower || 0) + ' at ' + vm.fmtU('rpm', comp._inputRPM || 0)
      });
    }
  }

  return out;
}

/** Motor termico: par y potencia disponible en el eje. */
function engineEquations(vm) {
  const comp = vm.comp;
  const power = comp.values.power || 50;
  const rpm = comp.values.rpm || 1500;
  const torque = rpm > 0 ? power * 9550 / rpm : 0;
  return [{
    title: 'Output torque — T = 9550 × P / n',
    formula: 'T = 9550 × P / n',
    where: 'P in kW · n in rpm · T in Nm',
    substitution: 'T = 9550 × ' + vm.fmt('power', power) + ' / ' + vm.fmt('rpm', rpm),
    result: vm.fmtU('torque', torque)
  }, {
    title: 'Power available at the pump shaft',
    formula: 'P_hyd = P_engine × η_transmission',
    where: 'About 90–95 % of the engine power reaches the pump',
    substitution: 'P_hyd ≈ ' + vm.fmtU('power', power * 0.92)
  }];
}

/** Transmision: reparto de velocidad, par y potencia entre salidas. */
function driveEquations(vm) {
  const comp = vm.comp;
  const numOutputs = parseInt(comp.values.numOutputs || '2', 10);
  const ratio = parseFloat(comp.values.ratio1) || 1;
  const eff = (comp.values.efficiency || 92) / 100;
  const inputPower = comp._inputPower || 0;
  const inputRPM = comp._inputRPM || 0;
  const outRPM = comp._outputRPM1 || 0;
  const outTorque = comp._outputTorque1 || 0;

  return [{
    title: 'Output speed — n_out = n_in × i',
    formula: 'n_out = n_in × i',
    where: 'i = transmission ratio of that output',
    substitution: 'n_out = ' + vm.fmt('rpm', inputRPM) + ' × ' + ratio,
    result: vm.fmtU('rpm', outRPM)
  }, {
    title: 'Torque multiplication',
    formula: 'T_out = T_in / i × η',
    where: 'More speed means less torque (and the other way round)',
    substitution: 'T_out ≈ ' + vm.fmtU('torque', outTorque) + ' with η = ' + (eff * 100).toFixed(0) + ' %'
  }, {
    title: 'Power sharing between the outputs',
    formula: 'Σ P_out = P_in × η',
    where: 'Each output takes its share according to its ratio; ' + numOutputs + ' output(s) configured',
    substitution: 'Σ P_out = ' + vm.fmtU('power', inputPower * eff),
    notes: 'Power is never created: the outputs total the input minus the losses.'
  }];
}

export const sources = [
  {
    type: 'pump', label: 'Power Unit', role: ROLES.SOURCE,
    docs: sourceDocs({
      summary: 'Fixed-displacement pump: delivers a constant flow per revolution, so the flow depends only on the drive speed.',
      how: 'A gear, vane or piston pump moves a fixed volume of oil per revolution. If the circuit needs less flow, the surplus goes over the relief valve and becomes heat. Simple, cheap and the standard solution for constant-flow circuits.',
      standard: 'Circle with a filled triangle pointing outwards towards the pressure line and the suction line from the tank.',
      tips: ['A fixed pump without a relief valve is destroyed in seconds if a line is blocked.', 'The flow is set by the pump speed; the pressure is set by the load.']
    }),
    equations: function (vm) { return pumpEquations(vm, { dissipated: true }); },
    physics: {}
  },
  {
    type: 'pump-var', label: 'Variable Pump', role: ROLES.SOURCE,
    docs: sourceDocs({
      summary: 'Variable-displacement pump: keeps the pressure at the set value by changing its displacement.',
      how: 'The swash plate or the eccentric ring moves so the displacement falls when the pressure reaches the setting; the pump then delivers only what the circuit needs. Far less energy is wasted than with a fixed pump, and the oil stays cooler.',
      standard: 'Circle with an outward triangle plus a diagonal arrow through it (variable displacement).',
      tips: ['Ideal for systems with varying demand (harvester heads, cranes).', 'Set the stand-by pressure low: it is the pressure kept when nothing moves.']
    }),
    equations: function (vm) { return pumpEquations(vm, {}); },
    physics: {}
  },
  {
    type: 'pump-var-displacement', label: 'Variable Displacement Pump', role: ROLES.SOURCE,
    docs: sourceDocs({
      summary: 'Variable-displacement pump driven by a pump drive or an engine, with a settable displacement percentage.',
      how: 'The displacement can be set between 0 and 100 % by the controller, so the flow delivered follows the request. Volumetric efficiency reduces the real flow and mechanical efficiency increases the torque needed; the measured values appear when the circuit runs.',
      standard: 'Circle with an outward triangle, the displacement arrow and the drain line.',
      variables: [
        { symbol: 'V', name: 'Maximum displacement', unit: 'displacement' },
        { symbol: 'x', name: 'Displacement setting', unit: 'percent' },
        { symbol: 'η_vol', name: 'Volumetric efficiency', unit: 'percent' }
      ],
      tips: ['At 0 % displacement the pump delivers nothing: the actuator stops without heating the oil.', 'Check the maximum drive speed of the pump before raising the engine speed.']
    }),
    equations: function (vm) {
      const comp = vm.comp;
      const pct = (comp.values.displacementPct || 100) / 100;
      const maxDisplacement = comp.values.displacement || 28;
      const rpm = comp._inputRPM || 1500;
      const effVol = (comp.values.efficiencyVol || 92) / 100;
      return pumpEquations(vm, { flow: maxDisplacement * pct * rpm / 1000 * effVol, rpm: rpm });
    },
    physics: {}
  },
  {
    type: 'pump-hand', label: 'Hand Pump', role: ROLES.SOURCE,
    docs: sourceDocs({
      summary: 'Hand pump: a manually operated piston pump for small volumes and high pressure (jacks, manual clamps).',
      how: 'Every stroke of the handle displaces a small volume of oil. Because the plunger area is small and the lever gives mechanical advantage, a modest force produces a very high pressure. Slow, but independent of any power source.',
      standard: 'Circle with an outward triangle and a lever (T-bar actuator) on top.',
      outputs: ['P — pressure line to the circuit'],
      variables: [
        { symbol: 'V', name: 'Displacement per stroke', unit: 'displacement' },
        { symbol: 'F', name: 'Force on the handle', unit: 'force' }
      ],
      tips: ['Ideal for emergency circuits and for holding a load with the engine off.', 'It needs a check valve and a release valve to control the return of the load.']
    }),
    equations: function (vm) {
      const comp = vm.comp;
      const pressure = comp.values.pressure || 50;
      const flow = comp.values.flow || 2;
      return [{
        title: 'Pressure from the handle force',
        formula: 'p = F × lever_ratio / A_plunger',
        where: 'F in N · A in mm² · lever_ratio = mechanical advantage of the handle',
        notes: 'This is why a small hand pump can reach 300–700 bar.'
      }, {
        title: 'Flow for a given pumping rate',
        formula: 'Q = V × strokes_per_minute / 1000',
        where: 'V in cm³/stroke · Q in L/min',
        substitution: 'Q configured = ' + vm.fmtU('flow', flow)
      }, {
        title: 'Hydraulic power',
        formula: 'P = p × Q / 600',
        where: 'p in bar · Q in L/min · P in kW',
        substitution: 'P = ' + vm.fmt('pressure', pressure) + ' × ' + vm.fmt('flow', flow) + ' / 600',
        result: vm.fmtU('power', pressure * flow / 600)
      }];
    },
    physics: { conduct: handPump }
  },
  {
    type: 'engine', label: 'Combustion Engine', role: ROLES.SOURCE,
    docs: sourceDocs({
      summary: 'Combustion engine (or electric motor): the prime mover that turns the pump.',
      how: 'The engine delivers mechanical power (torque at a given speed) and the pump converts it into hydraulic power. Its rated power limits the total hydraulic power available: when the demand exceeds it the engine stalls or loses speed.',
      standard: 'Circle with the letter M (motor) connected to the pump shaft.',
      inputs: ['Fuel / electrical supply'],
      outputs: ['Mechanical power at the shaft (n, T, P)'],
      variables: [
        { symbol: 'P', name: 'Engine power', unit: 'power' },
        { symbol: 'n', name: 'Engine speed', unit: 'rpm' },
        { symbol: 'T', name: 'Engine torque', unit: 'torque' }
      ],
      tips: ['Check the power balance: pump power plus cooling and drive losses must fit inside the engine power.', 'If the engine stalls, the demanded torque is above what it can deliver.']
    }),
    equations: engineEquations,
    physics: {}
  },
  {
    type: 'pump-drive', label: 'Pump Drive', role: ROLES.SOURCE,
    docs: sourceDocs({
      summary: 'Pump drive (gearbox or distribution box): takes the engine power and feeds several pumps at different speeds.',
      how: 'A gear train splits the engine output between several pump pads, each with its own ratio, so every pump turns at the speed that suits its displacement. The sum of the output powers cannot exceed the input power times the efficiency; maximum speeds and torques limit each output.',
      standard: 'Two gear circles with arrows for the input and the outputs.',
      inputs: ['Input — engine or PTO coupling'],
      outputs: ['Out 1…3 — pump pads'],
      variables: [
        { symbol: 'i', name: 'Ratio of each output', unit: 'ratio' },
        { symbol: 'η', name: 'Mechanical efficiency', unit: 'percent' },
        { symbol: 'T_max', name: 'Maximum torque per output', unit: 'torque' }
      ],
      tips: ['Derating: if one output goes above its maximum speed or torque, the drive reduces all of them.', 'Add the pump powers and compare them with the engine: that is the real check.']
    }),
    equations: driveEquations,
    physics: {}
  }
];
