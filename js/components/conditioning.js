// ================================================================
// ACONDICIONAMIENTO E INSTRUMENTOS (11 tipos)
// ================================================================
// - Condicionadores: filtro, enfriador, calentador, acumulador, deposito.
// - Instrumentos: manometro, caudalimetro, termometro, transductor y presostato,
//   final de carrera hidraulico.
//
// Reglas de conduccion migradas 1:1 desde passthrough.js (etapa E1). Los
// instrumentos que no tienen regla en la tabla heredan el fallback transparente
// del solver y su lectura se calcula en la fase de instrumentacion.
// ================================================================

import { ROLES } from '../core/registry.js';

function blocked() { return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 }; }

/* Filtro: paso con 1 bar de perdida */
function filter(comp, port, pressure, flow) {
  return { canFlow: true, outPort: port === 0 ? 1 : 0, pressureDrop: 1, flowLimit: flow };
}

/* Enfriador: paso con 2 bar de perdida */
function cooler(comp, port, pressure, flow) {
  return { canFlow: true, outPort: port === 0 ? 1 : 0, pressureDrop: 2, flowLimit: flow };
}

/* Calentador: paso con 1 bar de perdida */
function heater(comp, port, pressure, flow) {
  return { canFlow: true, outPort: port === 0 ? 1 : 0, pressureDrop: 1, flowLimit: flow };
}

/* Caudalimetro: transparencia total (su lectura la calcula el solver) */
function flowMeter(comp, port, pressure, flow) {
  return { canFlow: true, outPort: port === 0 ? 1 : 0, pressureDrop: 0, flowLimit: flow };
}

/* Manometro: ramal ciego */
function gauge(comp, port, pressure, flow) {
  return blocked();
}

/* Acumulador: se carga por encima de la precarga y no conduce */
function accumulator(comp, port, pressure, flow) {
  const precharge = comp.values.precharge || 90;
  if (!comp._charge) comp._charge = 0;
  if (pressure > precharge && comp._charge < 1) {
    comp._charge = Math.min(1, comp._charge + 0.002);
  }
  return blocked();
}

/* ── Lecturas: se calculan cuando el solver visita el puerto (ctx) ────────── */

/** Manometro y transductor de presion: muestran la presion del puerto. */
function readPressure(comp, ctx) {
  comp.reading = ctx.pressure;
}

/** Presostato: registra la presion de disparo mas alta vista. */
function readPressureSwitch(comp, ctx) {
  comp._localPressure = Math.max(comp._localPressure || 0, ctx.pressure);
}

/** Termometro: estima la temperatura a partir de la potencia hidraulica. */
function readTemperature(comp, ctx) {
  const powerKW = ctx.pressure * ctx.flow / 600;
  comp.reading = Math.min(90, 40 + powerKW * 0.5);
}

/** Caudalimetro: muestra el caudal del puerto. */
function readFlow(comp, ctx) {
  comp.reading = ctx.flow;
}

/* ── Documentacion y formulas (panel educativo) ─────────────────────────── */

function condDocs(cfg) {
  return {
    summary: cfg.summary,
    how: cfg.how,
    standard: cfg.standard,
    inputs: cfg.inputs || ['A — inlet'],
    outputs: cfg.outputs || ['B — outlet'],
    variables: cfg.variables || [],
    tips: cfg.tips || [],
    instrument: cfg.instrument
  };
}

/** Filtro: caida de presion y potencia perdida. */
function filterEquations(vm) {
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;
  const drop = 1;                       /* bar que aplica el modelo */
  return [{
    title: 'Pressure drop across the element',
    formula: 'ΔP = k × Q²  (ΔP ∝ flow²)',
    where: 'The drop grows with the square of the flow and with clogging',
    notes: 'This simulator applies a fixed 1 bar drop once the element is dirty.',
    substitution: 'ΔP = ' + vm.fmtU('pressure', drop)
  }, {
    title: 'Heat generated in the filter',
    formula: 'P_loss = ΔP × Q / 600',
    where: 'ΔP in bar · Q in L/min · P in kW',
    substitution: 'P_loss = ' + vm.fmt('pressure', drop) + ' × ' + vm.fmt('flow', Q) + ' / 600',
    result: vm.fmtU('power', drop * Q / 600)
  }, {
    title: 'Recommended drops (reference)',
    formula: 'Suction: 0.1–0.2 bar · Pressure line: 1–3 bar · Return: 0.5–1.5 bar',
    where: 'Replace the element when the indicator shows the limit',
    notes: 'A clogged return filter raises the back-pressure and can damage seals and coolers.'
  }];
}

/** Enfriador / calentador: balance de calor del circuito. */
function thermalEquations(vm, heating) {
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;
  const lossKW = (heating ? 1 : 2) * Q / 600;   /* perdida de 1-2 bar en el intercambiador */
  const deltaT = Q > 0 ? (heating ? 0.6 : 0.3) : 0;
  return [{
    title: 'Heat that must be removed (or added)',
    formula: 'P_heat = P_loss of the circuit = ΔP × Q / 600',
    where: 'ΔP in bar · Q in L/min · P in kW',
    notes: 'Throttling losses, relief dumping and friction all end up as heat in the oil.'
  }, {
    title: 'Oil temperature rise',
    formula: 'ΔT = P_heat × 60 / (ρ × c × Q)',
    where: 'ρ ≈ 870 kg/m³ · c ≈ 1.9 kJ/kg·K · Q in L/min · ΔT in °C',
    substitution: 'ΔT ≈ ' + deltaT.toFixed(2) + ' °C for this flow',
    notes: heating ? 'The heater raises the temperature until the oil is at working viscosity.'
                  : 'The cooler keeps the temperature inside the optimal 40–60 °C range.'
  }, {
    title: 'Pressure drop across the exchanger',
    formula: 'ΔP = ' + (heating ? '1' : '2') + ' bar (model)',
    where: 'Typical values: 0.5–3 bar for a cooler, less for a heater',
    substitution: 'ΔP = ' + vm.fmtU('pressure', heating ? 1 : 2)
  }];
}

/** Acumulador: ley de gases y volumen util. */
function accumulatorEquations(vm) {
  const precharge = vm.comp.values.precharge || 90;
  const volume = vm.comp.values.volume || 10;
  const P = vm.pressure || 0;
  const pMax = P > 0 ? P : precharge;
  const usable = volume * (1 - precharge / Math.max(pMax, 1)) * 0.9;
  return [{
    title: 'Gas law (isothermal, slow discharge)',
    formula: 'P₁ × V₁ = P₂ × V₂',
    where: 'The accumulator stores energy by compressing nitrogen',
    notes: 'For a fast discharge use the adiabatic form P·V^1.4 = constant.'
  }, {
    title: 'Usable volume',
    formula: 'ΔV ≈ V × (1 − P₀ / P_max)',
    where: 'V = nominal volume (' + volume + ' L) · P₀ = precharge (' + precharge + ' bar) · P_max = working pressure',
    substitution: 'ΔV ≈ ' + volume + ' × (1 − ' + precharge + ' / ' + pMax.toFixed(0) + ')',
    result: (usable > 0 ? usable.toFixed(2) : '0.00') + ' L'
  }, {
    title: 'Rule for the precharge',
    formula: 'P₀ ≈ 0.9 × P_min  (and ≤ 0.25 × P_max for bladder types)',
    where: 'Too low a precharge wastes volume, too high damages the bladder'
  }];
}

/** Deposito: dimensionado basico y disipacion de calor. */
function reservoirEquations(vm) {
  const volume = vm.comp.values.volume || 100;
  const Q = vm.flow || 0;
  const rule = 2.5 * Q;
  return [{
    title: 'Sizing rule',
    formula: 'V_tank ≈ 2 … 3 × Q_pump',
    where: 'Q in L/min · V in litres',
    substitution: 'V ≈ 2.5 × ' + vm.fmt('flow', Q),
    result: vm.fmt('volume', rule) + ' L recommended',
    notes: 'The tank must also hold the oil of the cylinders and let the air and contaminants settle.'
  }, {
    title: 'Heat dissipation',
    formula: 'P_cool = k × A × ΔT',
    where: 'A = tank surface (m²) · k ≈ 6–10 W/m²·K for a steel tank in still air',
    notes: 'If the oil gets hotter than 60 °C the tank is either too small or the losses are too high.'
  }];
}

export const conditioners = [
  {
    type: 'filter', label: 'Return Filter', role: ROLES.CONDITIONER,
    docs: condDocs({
      summary: 'Filter: removes particles from the oil so that pumps, valves and motors last longer.',
      how: 'The oil is forced through a porous element (paper, glass fibre, wire mesh). The pressure drop grows as the element traps dirt; when it reaches the limit the bypass valve opens to protect the element, letting dirty oil through. Typical circuits use a suction strainer, a pressure filter and a return filter.',
      standard: 'Square with a dashed line crossing it diagonally (filter element) between the two lines.',
      tips: ['Most hydraulic failures start with contaminated oil: the return filter is the cheapest protection.', 'A bypass valve opening silently is the classic cause of mysterious failures — fit a clogging indicator.']
    }),
    equations: filterEquations, physics: { conduct: filter }
  },
  {
    type: 'cooler', label: 'Oil Cooler', role: ROLES.CONDITIONER,
    docs: condDocs({
      summary: 'Oil cooler: removes the heat generated by the losses so the oil stays in its working range (40–60 °C).',
      how: 'A radiator with air or water on the secondary side. The oil passes through it on its way back to the tank. Sizing must cover the total losses: throttling, relief dumping, internal leakage and friction.',
      standard: 'Square with a diagonal arrow (heat exchanger) on the return line.',
      tips: ['Size the cooler for the worst case (relief valve dumping), not for the average.', 'Keep the oil between 40 and 60 °C: above 70 °C the life of seals and oil collapses.']
    }),
    equations: function (vm) { return thermalEquations(vm, false); },
    physics: { conduct: cooler }
  },
  {
    type: 'heater', label: 'Oil Heater', role: ROLES.CONDITIONER,
    docs: condDocs({
      summary: 'Oil heater: raises the oil temperature quickly so the machine can start working in cold weather.',
      how: 'An electrical element warms the oil until it reaches its working viscosity. Cold oil is thick: it cannot be drawn by the pump (cavitation) and the pressure losses are much higher, so heating shortens the warm-up time and avoids damage.',
      standard: 'Square with an upward diagonal arrow (heat input) on the tank line.',
      tips: ['Never start a cold machine at full load: warm up at low pressure first.', 'A heater with a thermostat avoids overheating the oil locally.']
    }),
    equations: function (vm) { return thermalEquations(vm, true); },
    physics: { conduct: heater }
  },
  {
    type: 'accumulator', label: 'Accumulator', role: ROLES.CONDITIONER,
    docs: condDocs({
      summary: 'Accumulator: stores hydraulic energy in a compressed gas and gives it back when needed.',
      how: 'A bladder or piston separates the oil from the nitrogen precharge. When the circuit pressure rises above the precharge, oil enters and compresses the gas; when the pressure falls, the gas pushes the oil out. Uses: emergency braking, holding a pressure with the pump off, absorbing shocks and supplementing pump flow.',
      standard: 'Bulb shape with the gas side marked "N₂" and the oil connection.',
      inputs: ['P — oil connection'],
      variables: [
        { symbol: 'P₀', name: 'Gas precharge', unit: 'pressure' },
        { symbol: 'V', name: 'Nominal volume', unit: 'volume' },
        { symbol: 'ΔV', name: 'Usable volume', unit: 'volume' }
      ],
      tips: ['Check the precharge regularly: it leaks away slowly and the accumulator stops working.', 'Never use oxygen or air: only dry nitrogen.']
    }),
    equations: accumulatorEquations, physics: { conduct: accumulator }
  },
  {
    type: 'reservoir', label: 'Reservoir', role: ROLES.CONDITIONER,
    docs: condDocs({
      summary: 'Reservoir (tank): holds the oil, lets it settle, separates air and dissipates heat.',
      how: 'Return oil enters below the oil level to avoid foaming; baffles give the dirt and the air time to separate; the suction line is at the opposite end. The tank volume also covers the oil needed by the cylinders and the thermal expansion.',
      standard: 'Half-open rectangle with the return line above it and the suction line reaching the bottom.',
      inputs: ['T — return line and suction line'],
      variables: [
        { symbol: 'V', name: 'Tank volume', unit: 'volume' }
      ],
      tips: ['Rule of thumb: 2–3 times the pump flow per minute.', 'A magnetic plug and a breather filter cost almost nothing and save a lot of oil.']
    }),
    equations: reservoirEquations, physics: {}
  }
];

export const instruments = [
  {
    type: 'gauge', label: 'Pressure Gauge', role: ROLES.INSTRUMENT,
    docs: condDocs({
      summary: 'Pressure gauge: shows the pressure at one point of the circuit (reference instrument).',
      how: 'A Bourdon tube or a piston gauge converts pressure into the movement of a needle. It is connected through a restrictor (snubber) so that pressure peaks do not destroy the mechanism. Accuracy classes are typically 1.6 % or 2.5 % of full scale.',
      standard: 'Circle with a needle and a line to the measuring point (dead-end tap).',
      inputs: ['P — measuring point'],
      variables: [
        { symbol: 'P', name: 'Measured pressure', unit: 'pressure' },
        { symbol: 'class', name: 'Accuracy class', unit: 'percent' }
      ],
      tips: ['Choose a gauge whose scale is about twice the working pressure: it lasts much longer.', 'A gauge is a dead-end connection: it does not consume flow.'],
      instrument: { label: 'Measured pressure', kind: 'pressure' }
    }),
    equations: function (vm) {
      const P = vm.pressure || 0;
      return [{
        title: 'Reading',
        formula: 'P_reading = P_measured',
        where: 'Direct pressure measurement (bar or psi depending on the display units)',
        substitution: 'P_reading = ' + vm.fmtU('pressure', P)
      }, {
        title: 'Accuracy of the reading',
        formula: 'error = class × P_full_scale / 100',
        where: 'A 1.6 % gauge on a 250 bar scale can be wrong by ±4 bar anywhere on the dial',
        substitution: 'error = 1.6 % × full scale'
      }];
    },
    physics: { conduct: gauge, solve: readPressure }
  },
  {
    type: 'flow-meter', label: 'Flow Meter', role: ROLES.INSTRUMENT,
    docs: condDocs({
      summary: 'Flow meter: measures the flow passing through the line.',
      how: 'Turbine, gear or orifice meters are the usual types. Turbine and gear meters count the revolutions of a rotor, which is proportional to the volume passing; orifice meters derive the flow from the pressure drop. Useful to check pump delivery, internal leakage and cylinder speed.',
      standard: 'Square with a diagonal arrow and the flow value inside the line.',
      inputs: ['A — inlet'],
      outputs: ['B — outlet (the flow continues)'],
      tips: ['Install it in the return line if you want the total system flow.', 'A sudden drop in measured flow usually means internal leakage or a clogged suction strainer.'],
      instrument: { label: 'Measured flow', kind: 'flow' }
    }),
    equations: function (vm) {
      const Q = vm.flow || 0;
      return [{
        title: 'Reading',
        formula: 'Q_reading = Q_line',
        substitution: 'Q_reading = ' + vm.fmtU('flow', Q)
      }, {
        title: 'Flow from the pressure drop (orifice type)',
        formula: 'Q = Cd × A × √(2ΔP/ρ)',
        where: 'The meter measures ΔP and computes the flow'
      }, {
        title: 'Checking an actuator speed',
        formula: 'v = Q / A_cylinder',
        where: 'This is how a flow meter is used to check that a cylinder moves at the expected speed'
      }];
    },
    physics: { conduct: flowMeter, solve: readFlow }
  },
  {
    type: 'temp-gauge', label: 'Temperature Gauge', role: ROLES.INSTRUMENT,
    docs: condDocs({
      summary: 'Temperature gauge: shows the oil temperature in the tank or in a line.',
      how: 'A bimetallic strip or a resistance sensor gives a direct reading. The working range is 40–60 °C: below that the oil is too thick, above 70 °C its life and the life of the seals fall quickly. The simulator estimates the temperature from the hydraulic power dissipated in the circuit.',
      standard: 'Thermometer symbol (bulb with a column) connected to the tank or line.',
      inputs: ['T — oil line or tank connection'],
      tips: ['Watch the temperature together with the pressure: a high reading usually means high losses.', 'A cooler always working at full capacity is a sign of an oversized restriction.'],
      instrument: { label: 'Oil temperature', kind: 'temperature' }
    }),
    equations: function (vm) {
      const P = vm.pressure || 0;
      const Q = vm.flow || 0;
      const powerKW = P * Q / 600;
      const estimated = Math.min(90, 40 + powerKW * 0.5);
      return [{
        title: 'Estimated temperature (model)',
        formula: 'T = 40 °C + 0.5 × P_hyd',
        where: 'P_hyd = p × Q / 600 in kW · result in °C',
        substitution: 'T = 40 + 0.5 × ' + powerKW.toFixed(2),
        result: vm.fmtU('temperature', estimated),
        notes: 'The tank starts at 40 °C and heats up with the power lost in the circuit.'
      }, {
        title: 'Heat balance of the tank',
        formula: 'T_steady = T_ambient + P_loss / (k × A)',
        where: 'The temperature stabilises where the losses equal the heat the tank can dissipate'
      }];
    },
    physics: { solve: readTemperature }
  },
  {
    type: 'pressure-transducer', label: 'Pressure Transducer', role: ROLES.INSTRUMENT,
    docs: condDocs({
      summary: 'Pressure transducer: converts pressure into an electrical signal for the controller or the display.',
      how: 'A strain-gauge or piezo-resistive sensor gives an output proportional to the pressure (usually 0–10 V or 4–20 mA). It is the sensor used by the machine ECU to control load-sensing pumps, protect the structure and log the work of the machine.',
      standard: 'Circle with the measuring line plus an electrical output lead.',
      inputs: ['P — measuring point'],
      variables: [
        { symbol: 'P', name: 'Measured pressure', unit: 'pressure' },
        { symbol: 'V_out', name: 'Output signal', unit: 'ratio' }
      ],
      tips: ['4–20 mA signals are immune to interference and a broken wire is detected as 0 mA.', 'Keep it below its rated pressure: it is a precision part, not a bumper.'],
      instrument: { label: 'Measured pressure', kind: 'pressure' }
    }),
    equations: function (vm) {
      const P = vm.pressure || 0;
      const fullScale = 400;
      const volts = Math.max(0, Math.min(10, P / fullScale * 10));
      const mA = 4 + Math.max(0, Math.min(1, P / fullScale)) * 16;
      return [{
        title: 'Reading',
        formula: 'P_reading = P_measured',
        substitution: 'P_reading = ' + vm.fmtU('pressure', P)
      }, {
        title: 'Output signal (0–10 V, 400 bar range)',
        formula: 'V_out = 10 × P / P_max',
        substitution: 'V_out = 10 × ' + vm.fmt('pressure', P) + ' / ' + fullScale,
        result: volts.toFixed(2) + ' V'
      }, {
        title: 'Output signal (4–20 mA)',
        formula: 'I_out = 4 + 16 × P / P_max',
        substitution: 'I_out = 4 + 16 × ' + vm.fmt('pressure', P) + ' / ' + fullScale,
        result: mA.toFixed(1) + ' mA'
      }];
    },
    physics: { solve: readPressure, noConduction: true }
  },
  {
    type: 'pressure-switch', label: 'Pressure Switch', role: ROLES.INSTRUMENT,
    docs: condDocs({
      summary: 'Pressure switch: closes or opens an electrical contact when a pressure threshold is reached.',
      how: 'A piston or diaphragm moves against a spring; at the set pressure it operates a micro-switch. It switches off a pump, lights a warning lamp, starts a fan or prevents a movement until enough pressure is available.',
      standard: 'Circle with a pressure line and an electrical contact drawn with the set point.',
      inputs: ['P — measuring point'],
      variables: [
        { symbol: 'P_set', name: 'Switching point', unit: 'pressure' },
        { symbol: 'hysteresis', name: 'Reset difference', unit: 'pressure' }
      ],
      tips: ['Keep a clear margin between the switching point and the working pressure, otherwise it will chatter.', 'Check the contact rating: most switches only handle small currents directly.'],
      instrument: { label: 'Switching pressure', kind: 'pressure' }
    }),
    equations: function (vm) {
      const P = vm.pressure || 0;
      const setpoint = 150;
      const tripped = P >= setpoint;
      return [{
        title: 'Switching condition',
        formula: 'contact closes when P ≥ P_set',
        where: 'P_set is the spring adjustment of the switch',
        substitution: vm.fmtU('pressure', P) + (tripped ? ' ≥ ' : ' < ') + vm.fmtU('pressure', setpoint),
        result: tripped ? 'Contact closed (signal on)' : 'Contact open'
      }, {
        title: 'Design margin',
        formula: 'P_set ≥ 1.2 × P_working',
        where: 'A 20 % margin stops normal pressure peaks from tripping the switch'
      }];
    },
    physics: { solve: readPressureSwitch }
  },
  {
    type: 'limit-switch-hyd', label: 'Hydraulic Limit Switch', role: ROLES.INSTRUMENT,
    docs: condDocs({
      summary: 'Hydraulic limit switch: detects that a cylinder has reached a position (end of stroke or an intermediate point).',
      how: 'A small pilot line taps the cylinder line: when the piston passes the port the pressure signal changes and the switch trips. Used to sequence movements — stop the feed as soon as the clamp is closed — and far more robust than an electrical switch in a forest machine.',
      standard: 'Small line from the cylinder with a pressure-operated contact.',
      inputs: ['P — pilot line from the cylinder'],
      variables: [
        { symbol: 'trigger', name: 'Trigger position (% of stroke)', unit: 'percent' }
      ],
      tips: ['Works under water, mud and vibration where an electrical switch would fail.', 'Set the linked cylinder and the trigger percentage in the component parameters.'],
      instrument: { label: 'Detected pressure', kind: 'pressure' }
    }),
    equations: function (vm) {
      const trigger = (vm.comp.values && vm.comp.values.triggerAt) || 95;
      const P = vm.pressure || 0;
      return [{
        title: 'Tripping condition',
        formula: 'tripped when extension ≥ trigger % of the stroke',
        where: 'The position of the linked cylinder is compared with the trigger percentage',
        substitution: 'trigger = ' + trigger + ' %',
        notes: 'The simulator trips the switch from the linked cylinder, not from the pressure alone.'
      }, {
        title: 'Pressure seen by the switch',
        formula: 'P_switch ≈ P_cylinder',
        substitution: 'P = ' + vm.fmtU('pressure', P)
      }];
    },
    physics: {}
  }
];
