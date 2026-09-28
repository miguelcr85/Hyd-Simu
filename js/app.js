import { PropertiesPanel, getPumpPerformanceValues, getCylinderPerformanceValues } from './modules/index.js';
import { COMP_DEFS } from './core/component-definitions.js';
import { solveCircuit } from './core/simulation/index.js';
import { registerAllComponents } from './components/index.js';
import { getComponent } from './core/registry.js';
import {
  SYSTEMS, unitHelpers, convert, unitLabel, formatValue, formatWithUnit, kindFromUnit
} from './core/units.js';
import { componentDocsHtml } from './ui/componentDocs.js';
(function () {
  'use strict';

  /* Etapa E2: el dominio se describe en js/components/* (ComponentRegistry).
     La interfaz solo registra los componentes y delega el calculo en el solver. */
  registerAllComponents();

  /* ================================================================
     WEB AUDIO — tick sound for cylinder end-of-stroke
     ================================================================ */

  var audioCtx = null;
  var showLabels = true;
  function playTick() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.08);
  }
  

  /* ================================================================
     EXPLORE DATA — 16 concept cards across 4 categories
     ================================================================ */

  var CONCEPTS = [
    /* ── Fundamentals ─────────────────────────────────────────────── */
    {
      id: 'pascals-law', name: "Pascal's Law", symbol: 'P',
      formula: 'P = F / A', unit: 'Pa',
      cat: 'fundamentals',
      desc: "Pascal's law states that pressure applied to a confined fluid is transmitted undiminished in every direction. This principle is the foundation of all hydraulic systems — a small force on a small piston creates a large force on a large piston, providing mechanical advantage.",
      example: { problem: 'A pump piston has area 5 cm\u00B2 and force 500 N. What is the system pressure?', steps: ['Given: F = 500 N, A = 5 cm\u00B2 = 5\u00D710\u207B\u2074 m\u00B2', 'P = F / A', 'P = 500 / 5\u00D710\u207B\u2074', 'P = 1,000,000 Pa = 1 MPa'], answer: 1, unit: 'MPa' }
    },
    {
      id: 'flow-pressure-power', name: 'Flow, Pressure & Power', symbol: 'P_hyd',
      formula: 'P = p \u00D7 Q / 600', unit: 'kW',
      cat: 'fundamentals',
      desc: 'Hydraulic power is the product of pressure and flow rate. P(kW) = p(bar) \u00D7 Q(L/min) / 600. Flow determines actuator speed, pressure determines force. A system with high flow and low pressure moves fast with little force; high pressure and low flow gives great force but slow motion.',
      example: { problem: 'System pressure = 200 bar, flow = 30 L/min. Find hydraulic power.', steps: ['P = p \u00D7 Q / 600', 'P = 200 \u00D7 30 / 600', 'P = 6000 / 600', 'P = 10 kW'], answer: 10, unit: 'kW' }
    },
    {
      id: 'hydraulic-advantage', name: 'Hydraulic Advantage', symbol: 'MA',
      formula: 'MA = A\u2082 / A\u2081', unit: '\u2014',
      cat: 'fundamentals',
      desc: 'Hydraulic mechanical advantage equals the ratio of output piston area to input piston area. A ratio of 10:1 means a 100 N input force produces a 1000 N output force. The trade-off is distance — the input piston must move 10 times farther than the output piston.',
      example: { problem: 'Input piston diameter = 20 mm, output piston diameter = 80 mm. Find the mechanical advantage.', steps: ['A\u2081 = \u03C0/4 \u00D7 20\u00B2 = 314.2 mm\u00B2', 'A\u2082 = \u03C0/4 \u00D7 80\u00B2 = 5026.5 mm\u00B2', 'MA = A\u2082 / A\u2081 = 5026.5 / 314.2', 'MA = 16'], answer: 16, unit: '' }
    },
    {
      id: 'continuity', name: 'Continuity Equation', symbol: 'Q',
      formula: 'Q = A \u00D7 v', unit: 'L/min',
      cat: 'fundamentals',
      desc: 'The continuity equation states that flow rate is constant throughout a hydraulic circuit (assuming no leaks). Q = A \u00D7 v, where A is the cross-sectional area and v is fluid velocity. When fluid passes through a restriction, velocity increases and pressure drops (Bernoulli effect).',
      example: { problem: 'Hose inner diameter = 12 mm, flow rate = 20 L/min. Find fluid velocity.', steps: ['A = \u03C0/4 \u00D7 12\u00B2 = 113.1 mm\u00B2 = 1.131\u00D710\u207B\u2074 m\u00B2', 'Q = 20 L/min = 3.33\u00D710\u207B\u2074 m\u00B3/s', 'v = Q / A = 3.33\u00D710\u207B\u2074 / 1.131\u00D710\u207B\u2074', 'v = 2.95 m/s'], answer: 2.95, unit: 'm/s' }
    },

    /* ── Components (10 detailed cards) ────────────────────── */
    {
      id: 'hydraulic-pump', name: 'Hydraulic Pump', symbol: 'Pump',
      formula: 'Q = D × n × η_v / 1000', unit: 'L/min',
      cat: 'components',
      desc: 'A hydraulic pump converts mechanical rotation into fluid flow. It creates flow (not pressure) — pressure is a result of resistance to flow in the circuit. The pump draws oil from a reservoir and pushes it into the system. Pump displacement determines how much oil is moved per revolution, while speed (RPM) and volumetric efficiency determine actual output flow.',
      symbol_desc: 'ISO 1219: Circle with a filled triangle inside pointing in the flow direction. Variable-displacement pumps add a diagonal arrow through the circle.',
      types: ['Gear pump (external gear, internal gear/gerotor) — simple, inexpensive, fixed displacement, up to 200 bar', 'Vane pump — low noise, good efficiency, up to 175 bar, some are variable displacement', 'Axial piston pump (swashplate or bent-axis) — highest pressure (up to 400 bar), variable displacement, most efficient', 'Radial piston pump — very high pressure capability, used in heavy-duty applications'],
      params: ['Displacement (cm³/rev): volume of oil per shaft revolution', 'Maximum pressure (bar): highest continuous working pressure', 'Speed range (RPM): min/max shaft speed', 'Volumetric efficiency (85–95%): ratio of actual to theoretical flow'],
      useCases: ['Machine tools (axial piston for precision control)', 'Mobile equipment like excavators (variable piston pumps)', 'Industrial presses (high-pressure piston pumps)', 'Log splitters, power steering (gear pumps for simplicity)'],
      tips: ['Always ensure pump inlet is flooded or use a charge pump to avoid cavitation', 'Match pump displacement to required flow — oversizing wastes energy', 'Variable-displacement pumps save energy by reducing flow when demand is low'],
      example: { problem: 'Axial piston pump: displacement D = 28 cm³/rev, speed n = 1500 rpm, volumetric efficiency 92%. Find actual flow rate.', steps: ['Q = D × n × η_v / 1000', 'Q = 28 × 1500 × 0.92 / 1000', 'Q = 38,640 / 1000', 'Q = 38.6 L/min'], answer: 38.6, unit: 'L/min' }
    },
    {
      id: 'relief-valve', name: 'Relief Valve', symbol: 'RV',
      formula: 'P_relief = P_crack + ΔP_override', unit: 'bar',
      cat: 'components',
      desc: 'A relief valve is the primary safety device in any hydraulic system. It is normally closed and opens when system pressure exceeds its spring setting (cracking pressure), diverting excess flow back to the tank. This protects components from overpressure damage. The valve closes again when pressure drops below the setting. Every hydraulic circuit must have at least one relief valve.',
      symbol_desc: 'ISO 1219: Square envelope with a diagonal arrow (flow path) and a spring symbol on one side. The arrow shows flow from pressure port to tank when the valve opens.',
      types: ['Direct-acting: simple spring-loaded poppet, suitable for low flows (up to ~60 L/min), has higher pressure override', 'Pilot-operated: two-stage design with a small pilot valve controlling a larger main stage, handles large flows with minimal pressure override, better pressure stability'],
      params: ['Cracking pressure (bar): pressure at which valve begins to open', 'Full-flow pressure (bar): pressure at which valve passes maximum rated flow', 'Pressure override: difference between cracking and full-flow pressure (lower is better)', 'Rated flow (L/min): maximum flow the valve can handle'],
      useCases: ['System overpressure protection (mandatory in every circuit)', 'Maximum pressure limiting for component safety', 'Clamping pressure control', 'Back-pressure valve in return lines'],
      tips: ['Set relief valve 15–25 bar above maximum working pressure', 'Pilot-operated valves are preferred for flows above 40 L/min', 'A chattering relief valve indicates it is set too close to working pressure', 'Heat generated when relief valve is open continuously wastes energy'],
      example: { problem: 'System works at 180 bar. Recommended margin is 20 bar. What relief valve setting?', steps: ['Relief setting = working pressure + safety margin', 'Setting = 180 + 20', 'Setting = 200 bar'], answer: 200, unit: 'bar' }
    },
    {
      id: 'dcv-valve', name: 'Directional Control Valve', symbol: 'DCV',
      formula: '4/3 = 4 ports, 3 positions', unit: '—',
      cat: 'components',
      desc: 'Directional control valves (DCVs) route hydraulic fluid to and from actuators, controlling the direction of motion. A spool slides inside the valve body to connect or block ports. The designation "4/3" means 4 ports (P, T, A, B) and 3 spool positions. The center condition determines what happens when the valve is in neutral — this is critical for circuit behavior.',
      symbol_desc: 'ISO 1219: Rectangles (envelopes) side by side, one per position. Internal arrows show flow paths. Actuation symbols (solenoid coils, lever, spring) shown at each end.',
      types: ['4/3 Tandem center: P and T connected, A and B blocked — pump unloads, loads held', '4/3 Closed center: all ports blocked — pump deadheads against relief, loads held', '4/3 Open center: all ports connected — pump unloads, loads may drift', '4/3 Float center: A and B connected to T, P blocked — actuator floats freely', '3/2 valve: 3 ports (P, T, A), 2 positions — for single-acting cylinders', '2/2 valve: 2 ports, 2 positions — simple on/off flow control'],
      params: ['Number of ports (ways): 2, 3, or 4', 'Number of positions: 2 or 3', 'Center condition: tandem, closed, open, float', 'Actuation method: manual lever, solenoid, pilot-operated, mechanical cam', 'Flow rating (L/min) and pressure rating (bar)'],
      useCases: ['Cylinder direction control (extend/retract/stop)', 'Motor direction and start/stop', 'Multi-actuator sequencing', 'Emergency stop circuits (spring-return to center)'],
      tips: ['Choose center condition based on what must happen when the valve is neutral', 'Solenoid valves allow remote/automated control', 'Pilot-operated DCVs are used for high-flow applications where direct solenoid force is insufficient', 'Spring-centered valves return to neutral on power loss — important for safety'],
      example: { problem: 'Name the three main valve categories in a hydraulic system.', steps: ['1. Directional control valves (DCVs) — route fluid to actuators', '2. Pressure control valves — limit, reduce, or sequence pressure', '3. Flow control valves — regulate flow rate for speed control'], answer: 3, unit: 'categories' }
    },
    {
      id: 'check-valve', name: 'Check Valve', symbol: 'CV',
      formula: 'Flow: A→B only (blocks B→A)', unit: '—',
      cat: 'components',
      desc: 'A check valve allows hydraulic fluid to flow in one direction only. A spring-loaded poppet or ball seats against a seal, blocking reverse flow. When forward pressure exceeds the spring force (cracking pressure, typically 0.5–5 bar), the valve opens. Pilot-operated check valves can be opened in the reverse direction by an external pilot signal — essential for holding loads safely.',
      symbol_desc: 'ISO 1219: A triangle (flow direction) with a perpendicular bar (seat). The triangle points in the allowed flow direction. Pilot-operated versions add a dashed pilot line to the bar.',
      types: ['Poppet type: cone or ball seats on a machined seat, very low leakage', 'Ball type: simple, inexpensive, used in low-pressure applications', 'Swing type: hinged disc, used in large-diameter lines', 'Pilot-operated check valve (POCV): can be opened in reverse by pilot pressure — used for load holding'],
      params: ['Cracking pressure (bar): minimum forward pressure to open (typically 0.5–5 bar)', 'Rated flow (L/min): maximum flow capacity', 'Pilot ratio (for POCV): area ratio determining required pilot pressure'],
      useCases: ['Prevent backflow through pump when system is off', 'Load holding on vertical cylinders (pilot-operated)', 'Thermal relief protection', 'Isolating circuit branches'],
      tips: ['Use pilot-operated check valves whenever a cylinder must hold a load', 'A standard check valve cannot hold a suspended load — it only blocks flow', 'High cracking pressure creates back-pressure that can affect circuit performance'],
      example: { problem: 'A pilot-operated check valve has pilot ratio 3:1. Load-induced pressure is 120 bar. What pilot pressure is needed?', steps: ['Pilot pressure = Load pressure / Pilot ratio', 'P_pilot = 120 / 3', 'P_pilot = 40 bar'], answer: 40, unit: 'bar' }
    },
    {
      id: 'flow-control-valve', name: 'Flow Control Valve', symbol: 'FCV',
      formula: 'Q = Cd × A × √(2ΔP/ρ)', unit: 'L/min',
      cat: 'components',
      desc: 'Flow control valves regulate the flow rate in a hydraulic circuit, thereby controlling actuator speed. A simple needle valve uses a variable orifice, but flow through it changes with pressure drop. Pressure-compensated flow control valves maintain a constant flow regardless of load pressure changes, providing consistent actuator speed under varying loads.',
      symbol_desc: 'ISO 1219: A variable orifice symbol (two curved lines forming a restriction) with a diagonal arrow through it indicating adjustability. Pressure-compensated types add a horizontal arrow with spring.',
      types: ['Needle valve: simple variable orifice, flow varies with load pressure', 'Pressure-compensated flow control: maintains set flow rate regardless of load changes', 'Temperature-compensated: corrects for viscosity changes due to temperature', 'Priority flow control: ensures one branch gets flow before excess goes to another'],
      params: ['Flow range (L/min): adjustable minimum to maximum flow', 'Pressure compensation range (bar): operating range for constant flow', 'Minimum controllable flow: smallest stable flow setting'],
      useCases: ['Cylinder speed control (extend and retract independently)', 'Motor speed regulation', 'Synchronizing multiple actuators', 'Feed rate control in machine tools'],
      tips: ['Meter-in: flow control in pressure line — best for resistive loads', 'Meter-out: flow control in return line — best for overrunning loads', 'Bleed-off: flow control bypasses excess to tank — most energy-efficient for fixed pumps', 'Always use pressure-compensated valves when consistent speed is critical'],
      example: { problem: 'Flow control set to 15 L/min. Cylinder bore = 80 mm. Find extend speed.', steps: ['A = π/4 × 80² = 5026.5 mm²', 'Q = 15 L/min = 250,000 mm³/s', 'v = Q / A = 250000 / 5026.5', 'v = 49.7 mm/s'], answer: 49.7, unit: 'mm/s' }
    },
    {
      id: 'hydraulic-cylinder', name: 'Hydraulic Cylinder', symbol: 'Cyl',
      formula: 'F = P × A', unit: 'N',
      cat: 'components',
      desc: 'A hydraulic cylinder converts fluid pressure into linear mechanical force and motion. Pressurized oil pushes against a piston, which moves the rod. In a double-acting cylinder, oil can be applied to both sides, allowing powered extension and retraction. The bore area determines extend force, while the annular area (bore minus rod) determines retract force. The area ratio causes retract speed to be faster than extend speed for the same flow rate.',
      symbol_desc: 'ISO 1219: A rectangle (barrel) with a smaller rectangle inside (piston) and a line extending out (rod). Single-acting adds a spring symbol. Double-acting shows connections on both ends.',
      types: ['Single-acting (spring return): pressurized one side only, spring retracts — clamping, lifting', 'Double-acting: pressurized both sides — most common, powered extend and retract', 'Telescopic: multiple stages for long stroke in compact length — dump trucks, cranes', 'Differential cylinder: unequal areas create speed difference between extend/retract'],
      params: ['Bore diameter (mm): determines piston area and extend force', 'Rod diameter (mm): determines annular area and retract force', 'Stroke (mm): maximum piston travel distance', 'Cushioning: deceleration at end of stroke to prevent impact damage', 'Mounting style: flange, trunnion, clevis, foot — affects load alignment'],
      useCases: ['Hydraulic presses (large bore, high force)', 'Excavator boom, stick, and bucket', 'Steering cylinders on mobile equipment', 'Injection molding machine clamping'],
      tips: ['Area ratio = A_bore / A_annular — determines speed ratio between extend and retract', 'Retract force is always less than extend force (reduced by rod area)', 'Cushioning is essential for high-speed or heavy-load applications', 'Rod buckling must be checked for long-stroke cylinders under compression'],
      example: { problem: 'Double-acting cylinder: bore 100 mm, rod 70 mm, pressure 150 bar. Find extend and retract forces.', steps: ['A_bore = π/4 × 100² = 7854 mm²', 'A_ann = π/4 × (100² − 70²) = 4006 mm²', 'F_extend = 15 × 7854 = 117,810 N = 117.8 kN', 'F_retract = 15 × 4006 = 60,090 N = 60.1 kN'], answer: 117.8, unit: 'kN' }
    },
    {
      id: 'hydraulic-motor', name: 'Hydraulic Motor', symbol: 'Mot',
      formula: 'T = D × ΔP / (20π)', unit: 'Nm',
      cat: 'components',
      desc: 'A hydraulic motor converts fluid energy into continuous rotary motion — the reverse of a pump. Pressurized oil enters the motor, acts on internal gears, vanes, or pistons, and produces torque on the output shaft. Unlike electric motors, hydraulic motors can produce full torque at zero speed and are easily reversible by switching flow direction.',
      symbol_desc: 'ISO 1219: Circle with a filled triangle inside pointing inward (toward the center), opposite of a pump symbol where the triangle points outward.',
      types: ['Gear motor: simple, inexpensive, moderate efficiency — conveyors, fans', 'Vane motor: smooth operation, moderate speed range', 'Axial piston motor: high efficiency, wide speed range, variable displacement available', 'Radial piston motor (cam-ring type): very high torque at low speed — wheel motors, winches'],
      params: ['Displacement (cm³/rev): volume of oil per output shaft revolution', 'Torque (Nm): T = D × ΔP / (20π) where D in cm³ and ΔP in bar', 'Maximum speed (RPM): limited by internal leakage and mechanical wear', 'Mechanical and volumetric efficiency: typically 85–95% overall'],
      useCases: ['Conveyor belt drives', 'Wheel motors on skid-steer loaders and excavators', 'Winch and crane rotation drives', 'Mixer and auger drives', 'Fan drives for cooling systems'],
      tips: ['High-speed motors (gear, piston) suit applications above 500 RPM', 'Low-speed high-torque (LSHT) motors suit direct-drive wheel applications', 'Case drain line is mandatory for piston motors to prevent seal damage', 'Stall torque is typically 60–80% of theoretical torque due to friction'],
      example: { problem: 'Hydraulic motor: displacement 25 cm³/rev, pressure drop 150 bar. Find output torque.', steps: ['T = D × ΔP / (20π)', 'T = 25 × 150 / (20 × 3.14159)', 'T = 3750 / 62.83', 'T = 59.7 Nm'], answer: 59.7, unit: 'Nm' }
    },
    {
    id: 'poclain-ms35', 
    name: 'Motor Poclain MS35', 
    symbol: 'LSHT',
    formula: 'T = D × ΔP / (20π)', 
    unit: 'Nm',
    cat: 'components',
    desc: 'El motor Poclain MS35 es un motor hidráulico de baja velocidad y alta torsión (LSHT). Utiliza un diseño de pistones radiales con leva que permite generar un par muy elevado a bajas RPM, ideal para tracción de vehículos, winches y accionamiento de tambores. Su diseño compacto y robusto lo hace perfecto para aplicaciones móviles e industriales exigentes.',
    symbol_desc: 'ISO 1219: Círculo con triángulo apuntando hacia el centro (motor). Incluye indicadores de rotación y puertos A, B y D (drenaje).',
    types: [
        'MS35-380: 380 cm³/rev, 350 bar, 300 RPM, 1800 Nm',
        'MS35-500: 500 cm³/rev, 350 bar, 250 RPM, 2400 Nm',
        'MS35-650: 650 cm³/rev, 350 bar, 200 RPM, 3100 Nm'
    ],
    params: [
        'Cilindrada (cm³/rev): volumen de aceite por revolución',
        'Presión máxima (bar): 350 bar continua, 450 bar pico',
        'Velocidad máxima (RPM): limitada por la cilindrada',
        'Par máximo (Nm): depende de la presión y cilindrada',
        'Eficiencia volumétrica: típicamente 90-95%',
        'Eficiencia mecánica: típicamente 88-92%'
    ],
    useCases: [
        'Tracción de vehículos (mini-excavadoras, cargadoras)',
        'Winches y cabrestantes',
        'Accionamiento de tambores y mezcladores',
        'Sistemas de posicionamiento de precisión'
    ],
    tips: [
        'Utilizar siempre el puerto de drenaje D conectado a tanque',
        'No exceder la velocidad máxima para evitar daños por cavitación',
        'El par de arranque puede ser mayor que el par continuo',
        'Verificar el nivel de aceite para evitar cavitación'
    ],
    example: { 
        problem: 'Motor Poclain MS35: cilindrada 380 cm³/rev, ΔP = 280 bar. Calcular el par de salida.', 
        steps: [
            'D = 380 cm³/rev, ΔP = 280 bar',
            'T = D × ΔP / (20π)',
            'T = 380 × 280 / (20 × 3.14159)',
            'T = 106400 / 62.83',
            'T = 1693 Nm'
        ], 
        answer: 1693, 
        unit: 'Nm' 
    }
},
    {
      id: 'accumulator', name: 'Accumulator', symbol: 'Acc',
      formula: 'p₁V₁ⁿ = p₂V₂ⁿ', unit: '—',
      cat: 'components',
      desc: 'A hydraulic accumulator stores energy in the form of pressurized fluid. A gas (nitrogen — never oxygen due to explosion risk) is pre-charged on one side; when system pressure exceeds the pre-charge, hydraulic oil compresses the gas and enters the accumulator. When system pressure drops, the stored oil is pushed back out. This stored energy can supplement pump flow during peak demand, absorb pressure spikes, or provide emergency power.',
      symbol_desc: 'ISO 1219: An oval (capsule shape) divided horizontally — upper section represents the gas charge (N₂), lower section the hydraulic fluid.',
      types: ['Bladder accumulator: rubber bladder separates gas and oil, fast response, most common', 'Piston accumulator: piston separates gas and oil, handles higher flow rates, longer life', 'Diaphragm accumulator: small volume, fast response, used for pulsation dampening'],
      params: ['Pre-charge pressure: typically 90% of minimum system pressure (using nitrogen)', 'Total volume (litres): size of the accumulator shell', 'Usable oil volume: depends on pressure ratio (p1/p2) and gas law', 'Gas law exponent n: isothermal (n=1) for slow cycles, adiabatic (n=1.4) for fast cycles'],
      useCases: ['Shock/pulsation absorption in pump discharge lines', 'Emergency power for safety functions (brakes, clamps) on power failure', 'Supplementing pump flow during peak demand (press fast-approach)', 'Leakage compensation to maintain pressure during holding phases'],
      tips: ['NEVER pre-charge with oxygen or air — explosion hazard', 'Check pre-charge pressure regularly; gas permeates through bladder over time', 'Install a safety block (manual dump valve + gauge + relief) on every accumulator', 'Accumulators are pressure vessels — must comply with local safety regulations'],
      example: { problem: 'Accumulator: V₁ = 10 L at p₁ = 100 bar. System pressure p₂ = 200 bar (isothermal). Find V₂.', steps: ['Isothermal: n = 1, so p₁V₁ = p₂V₂', 'V₂ = p₁V₁ / p₂', 'V₂ = 100 × 10 / 200', 'V₂ = 5 L (gas volume shrinks by half)'], answer: 5, unit: 'L' }
    },
    {
      id: 'hydraulic-filter', name: 'Filter', symbol: 'Filter',
      formula: 'β_x = upstream count / downstream count', unit: '—',
      cat: 'components',
      desc: 'Hydraulic filters remove solid contaminants (metal particles, dirt, rubber fragments) from the fluid. Contamination is the number one cause of hydraulic system failure — over 75% of all hydraulic failures are contamination-related. Filters use a porous media element to trap particles above a certain size, measured by the beta ratio (β). A higher beta ratio means better filtration efficiency.',
      symbol_desc: 'ISO 1219: A diamond (rhombus) shape with a dashed horizontal line inside representing the filter element.',
      types: ['Suction strainer: coarse mesh (100–150 µm) on pump inlet, prevents large debris', 'Pressure filter: fine filtration (3–25 µm) in pressure line, protects sensitive valves', 'Return filter: medium filtration (10–40 µm) on return line, most common location', 'Offline/kidney-loop filter: separate pump circulates and filters oil continuously'],
      params: ['Micron rating (µm): particle size the filter captures', 'Beta ratio (β_x): filtration efficiency — β_10 ≥ 200 means 99.5% of 10µm particles removed', 'Flow capacity (L/min): maximum flow without excessive pressure drop', 'Bypass valve cracking pressure: opens if filter clogs, preventing pump starvation'],
      useCases: ['Pressure line filtration for servo and proportional valve protection', 'Return line filtration for general contamination control', 'Offline filtration for maintaining target cleanliness in storage tanks', 'Kidney-loop systems for large-volume reservoirs'],
      tips: ['Change filters on schedule or when the clogging indicator shows', 'ISO 4406 cleanliness codes specify target contamination levels', 'Servo valves require ISO 16/14/11 or better; gear pumps tolerate ISO 20/18/15', 'Always check the bypass valve — if it is open, the filter is not filtering'],
      example: { problem: 'A filter has β₁₀ = 200. 10,000 particles ≥10µm enter. How many pass through?', steps: ['β₁₀ = upstream / downstream', '200 = 10000 / downstream', 'downstream = 10000 / 200', 'downstream = 50 particles pass through'], answer: 50, unit: 'particles' }
    },
    {
      id: 'pressure-gauge', name: 'Pressure Gauge', symbol: 'PG',
      formula: 'Reading = system pressure', unit: 'bar',
      cat: 'components',
      desc: 'A pressure gauge measures and displays hydraulic system pressure. The most common type uses a Bourdon tube — a curved, flattened metal tube that straightens proportionally as pressure increases, moving a pointer on a calibrated dial. Pressure gauges are essential for commissioning, troubleshooting, and monitoring hydraulic systems.',
      symbol_desc: 'ISO 1219: A circle with a short connection line to the circuit.',
      types: ['Bourdon tube (analog): most common, robust, inexpensive, available 0–600 bar+', 'Digital pressure gauge: electronic sensor with LCD display, can log data', 'Differential pressure gauge: measures pressure difference across a component (e.g., filter)'],
      params: ['Range (bar): should be rated for 1.5–2× maximum expected pressure', 'Accuracy class: typically 1.0% or 1.6% of full scale', 'Connection size: G1/4 BSP most common in hydraulics'],
      useCases: ['System commissioning and pressure setting verification', 'Troubleshooting — comparing pressures at different circuit points', 'Filter clogging indication (differential pressure across filter)', 'Continuous monitoring in critical systems'],
      tips: ['Use a snubber (flow restrictor) for pulsating pressure to protect the gauge', 'Use a diaphragm seal for corrosive or high-temperature fluids', 'Select gauge range so normal working pressure reads in the middle third of the scale', 'Gauge isolation valves allow replacement without depressurizing the system'],
      example: { problem: 'Gauge range should be 1.5× max working pressure. Working pressure = 200 bar. Select gauge range.', steps: ['Minimum range = 1.5 × working pressure', 'Range = 1.5 × 200', 'Range = 300 bar', 'Select a standard 400 bar gauge (next standard size up)'], answer: 300, unit: 'bar' }
    },
    /* ── Circuits ─────────────────────────────────────────────────── */
    {
      id: 'meter-in', name: 'Meter-In Circuit', symbol: 'M-In',
      formula: 'v = Q_restricted / A_bore', unit: 'mm/s',
      cat: 'circuits',
      desc: 'In a meter-in circuit, the flow control valve is placed in the pressure line (between DCV and cylinder cap end). It restricts flow entering the cylinder, controlling extend speed. Best for resistive loads (load opposes motion). Not suitable for overrunning loads — the cylinder can accelerate uncontrollably.',
      example: { problem: 'Flow control set to 15 L/min. Cylinder bore = 80 mm. Find extend speed.', steps: ['A = \u03C0/4 \u00D7 80\u00B2 = 5026.5 mm\u00B2', 'Q = 15 L/min = 250,000 mm\u00B3/s', 'v = Q / A = 250000 / 5026.5', 'v = 49.7 mm/s'], answer: 49.7, unit: 'mm/s' }
    },
    {
      id: 'meter-out', name: 'Meter-Out Circuit', symbol: 'M-Out',
      formula: 'v = Q_restricted / A_ann', unit: 'mm/s',
      cat: 'circuits',
      desc: 'In a meter-out circuit, the flow control valve is placed in the return line (between cylinder rod end and DCV). It restricts oil leaving the cylinder, creating back-pressure that controls speed. Suitable for overrunning loads (e.g., gravity-assisted lowering). Creates higher rod-side pressure.',
      example: { problem: 'Flow control allows 10 L/min return. Bore 80 mm, rod 45 mm. Find extend speed.', steps: ['A_ann = \u03C0/4 \u00D7 (80\u00B2 \u2212 45\u00B2) = 3436 mm\u00B2', 'Q_return = Q_cap \u00D7 A_ann/A_bore', 'Since meter-out restricts return: Q_return = 10 L/min', 'v = 166667 / 3436 ... but actually we need to account for area ratio', 'v = Q_restricted / A_ann = 166667 / 3436 = 48.5 mm/s'], answer: 48.5, unit: 'mm/s' }
    },
    {
      id: 'regenerative', name: 'Regenerative Circuit', symbol: 'Regen',
      formula: 'v_regen = Q / A_rod', unit: 'mm/s',
      cat: 'circuits',
      desc: 'A regenerative circuit connects the rod-side exhaust back to the cap-side inlet during extension. Since the rod displaces less volume than the bore accepts, pump flow is supplemented by rod-side return flow. Speed doubles (approximately) but force drops to F = P \u00D7 A_rod. Used for rapid traverse in presses.',
      example: { problem: 'Pump flow 30 L/min. Bore 100 mm, rod 70 mm. Find regenerative speed vs normal.', steps: ['A_bore = 7854 mm\u00B2, A_rod = 3848 mm\u00B2', 'A_ann = 7854 \u2212 3848 = 4006 mm\u00B2', 'Normal: v = 500000/7854 = 63.7 mm/s', 'Regen: v = 500000/3848 = 129.9 mm/s', 'Speed ratio \u2248 2.04\u00D7'], answer: 129.9, unit: 'mm/s' }
    },
    {
      id: 'sequence', name: 'Sequence Circuit', symbol: 'Seq',
      formula: 'p_seq > p_load1', unit: 'bar',
      cat: 'circuits',
      desc: 'A sequence circuit uses a sequence valve to ensure one actuator completes its stroke before the next begins. The sequence valve opens when upstream pressure reaches its setting (indicating the first actuator has stalled). Used in clamp-then-drill, lift-then-push, and multi-stage pressing operations.',
      example: { problem: 'Clamp cylinder needs 80 bar. What should the sequence valve be set to for the drill?', steps: ['Sequence valve setting must exceed clamp pressure', 'Set sequence valve = clamp pressure + margin', 'p_seq = 80 + 20 = 100 bar', 'The drill circuit activates when pressure reaches 100 bar'], answer: 100, unit: 'bar' }
    },

    /* ── Applications ─────────────────────────────────────────────── */
    {
      id: 'hydraulic-press', name: 'Hydraulic Press', symbol: 'Press',
      formula: 'F = P \u00D7 A_bore', unit: 'kN',
      cat: 'applications',
      desc: 'Hydraulic presses use a large-bore cylinder to deliver enormous compressive force for stamping, forming, bending, and compacting operations. The press circuit typically includes a regenerative fast-approach, pressure-holding, and controlled return. Press forces can range from 10 kN to over 100 MN.',
      example: { problem: 'Press cylinder bore 200 mm, system pressure 250 bar. Find maximum press force.', steps: ['A = \u03C0/4 \u00D7 200\u00B2 = 31,416 mm\u00B2', 'P = 250 bar = 25 MPa = 25 N/mm\u00B2', 'F = 25 \u00D7 31416', 'F = 785,398 N \u2248 785.4 kN'], answer: 785.4, unit: 'kN' }
    },
    {
      id: 'crane', name: 'Mobile Crane', symbol: 'Crane',
      formula: 'Multiple actuator coordination', unit: '\u2014',
      cat: 'applications',
      desc: 'Mobile cranes use multiple hydraulic cylinders for boom lift, boom extension (telescopic), and outrigger stabilization, plus hydraulic motors for slewing (rotation) and winch operation. Load-holding valves prevent the boom from dropping if a hose bursts. Counterbalance valves control lowering speed.',
      example: { problem: 'Crane boom lift cylinder: bore 150 mm, pressure 280 bar. Find lift force.', steps: ['A = \u03C0/4 \u00D7 150\u00B2 = 17,671 mm\u00B2', 'P = 280 bar = 28 N/mm\u00B2', 'F = 28 \u00D7 17671', 'F = 494,801 N \u2248 494.8 kN'], answer: 494.8, unit: 'kN' }
    },
    {
      id: 'excavator', name: 'Excavator', symbol: 'Exc',
      formula: 'Load-sensing pump control', unit: '\u2014',
      cat: 'applications',
      desc: 'Excavators use three main hydraulic cylinders (boom, stick, bucket) plus two hydraulic motors (tracks) and one slew motor. Modern excavators use load-sensing pumps that adjust displacement to match demand, reducing energy waste. Regeneration circuits speed up boom lowering by recycling oil from the rod side.',
      example: { problem: 'Excavator bucket cylinder: bore 120 mm, rod 85 mm, pressure 320 bar. Find dig force.', steps: ['A_bore = \u03C0/4 \u00D7 120\u00B2 = 11,310 mm\u00B2', 'P = 320 bar = 32 N/mm\u00B2', 'F = 32 \u00D7 11310', 'F = 361,911 N \u2248 361.9 kN'], answer: 361.9, unit: 'kN' }
    },
    {
      id: 'injection-molding', name: 'Injection Molding', symbol: 'IM',
      formula: 'Clamp force + Injection pressure', unit: '\u2014',
      cat: 'applications',
      desc: 'Injection molding machines use hydraulic systems for clamping the mold halves together (up to 10,000 kN), injecting molten plastic at high pressure, and ejecting the finished part. The clamp circuit must hold enormous force while the injection circuit requires precise velocity and pressure control.',
      example: { problem: 'Injection: bore 80 mm, 180 bar. Clamp: bore 250 mm, 160 bar. Find both forces.', steps: ['Injection: A = \u03C0/4 \u00D7 80\u00B2 = 5027 mm\u00B2', 'F_inj = 18 \u00D7 5027 = 90.5 kN', 'Clamp: A = \u03C0/4 \u00D7 250\u00B2 = 49,087 mm\u00B2', 'F_clamp = 16 \u00D7 49087 = 785.4 kN'], answer: 785.4, unit: 'kN' }
    }
  ];

  /* ================================================================
     PRACTICE — 12 problem generators (actual count verified)
     ================================================================ */

  function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  var PRACTICE = [
    function () {
      var bore = randChoice([40, 50, 63, 80, 100, 125]);
      var pBar = randInt(80, 250);
      var a = Math.PI / 4 * bore * bore;
      var ans = +(pBar * 0.1 * a / 1000).toFixed(1);
      return { prompt: 'A double-acting cylinder has bore diameter ' + bore + ' mm. System pressure is ' + pBar + ' bar. Calculate the extend force in kN.', unit: 'kN', answer: ans, tol: 0.5, steps: ['A_bore = \u03C0/4 \u00D7 ' + bore + '\u00B2 = ' + (a).toFixed(1) + ' mm\u00B2', 'P = ' + pBar + ' bar = ' + (pBar * 0.1).toFixed(1) + ' N/mm\u00B2', 'F = P \u00D7 A = ' + (pBar * 0.1).toFixed(1) + ' \u00D7 ' + a.toFixed(1), 'F = ' + (pBar * 0.1 * a).toFixed(0) + ' N = ' + ans + ' kN'] };
    },
    function () {
      var bore = randChoice([63, 80, 100, 125]);
      var rod = Math.round(bore * 0.7);
      var pBar = randInt(100, 250);
      var aAnn = Math.PI / 4 * (bore * bore - rod * rod);
      var ans = +(pBar * 0.1 * aAnn / 1000).toFixed(1);
      return { prompt: 'Cylinder bore = ' + bore + ' mm, rod = ' + rod + ' mm, pressure = ' + pBar + ' bar. Calculate retract force (kN).', unit: 'kN', answer: ans, tol: 0.5, steps: ['A_ann = \u03C0/4 \u00D7 (' + bore + '\u00B2 \u2212 ' + rod + '\u00B2) = ' + aAnn.toFixed(1) + ' mm\u00B2', 'F = ' + (pBar * 0.1).toFixed(1) + ' \u00D7 ' + aAnn.toFixed(1), 'F = ' + ans + ' kN'] };
    },
    function () {
      var bore = randChoice([50, 63, 80, 100]);
      var q = randChoice([20, 30, 40, 50, 60]);
      var a = Math.PI / 4 * bore * bore;
      var ans = +(q * 1e6 / 60 / a).toFixed(1);
      return { prompt: 'Flow rate = ' + q + ' L/min, bore = ' + bore + ' mm. Calculate cylinder extend speed (mm/s).', unit: 'mm/s', answer: ans, tol: 1, steps: ['A = \u03C0/4 \u00D7 ' + bore + '\u00B2 = ' + a.toFixed(1) + ' mm\u00B2', 'Q = ' + q + ' L/min = ' + (q * 1e6 / 60).toFixed(0) + ' mm\u00B3/s', 'v = Q / A = ' + ans + ' mm/s'] };
    },
    function () {
      var bore = randChoice([63, 80, 100, 125]);
      var rod = Math.round(bore * 0.7);
      var q = randChoice([20, 30, 40, 60]);
      var aAnn = Math.PI / 4 * (bore * bore - rod * rod);
      var ans = +(q * 1e6 / 60 / aAnn).toFixed(1);
      return { prompt: 'Flow rate = ' + q + ' L/min. Bore = ' + bore + ' mm, rod = ' + rod + ' mm. Calculate retract speed (mm/s).', unit: 'mm/s', answer: ans, tol: 1, steps: ['A_ann = \u03C0/4 \u00D7 (' + bore + '\u00B2 \u2212 ' + rod + '\u00B2) = ' + aAnn.toFixed(1) + ' mm\u00B2', 'Q = ' + (q * 1e6 / 60).toFixed(0) + ' mm\u00B3/s', 'v = Q / A_ann = ' + ans + ' mm/s'] };
    },
    function () {
      var pBar = randChoice([100, 150, 200, 250]);
      var q = randChoice([20, 30, 40, 50, 60]);
      var ans = +(pBar * q / 600).toFixed(2);
      return { prompt: 'System pressure = ' + pBar + ' bar, pump flow = ' + q + ' L/min. Calculate hydraulic power (kW).', unit: 'kW', answer: ans, tol: 0.1, steps: ['P = p \u00D7 Q / 600', 'P = ' + pBar + ' \u00D7 ' + q + ' / 600', 'P = ' + ans + ' kW'] };
    },
    function () {
      var disp = randChoice([16, 20, 28, 36, 45, 63]);
      var rpm = randChoice([1000, 1200, 1500, 1800]);
      var eff = randChoice([85, 88, 90, 92]);
      var ans = +(disp * rpm * eff / 100 / 1000).toFixed(1);
      return { prompt: 'Pump displacement = ' + disp + ' cm\u00B3/rev, speed = ' + rpm + ' rpm, volumetric efficiency = ' + eff + '%. Calculate actual flow rate (L/min).', unit: 'L/min', answer: ans, tol: 0.3, steps: ['Q = D \u00D7 n \u00D7 \u03B7 / 1000', 'Q = ' + disp + ' \u00D7 ' + rpm + ' \u00D7 ' + (eff / 100) + ' / 1000', 'Q = ' + ans + ' L/min'] };
    },
    function () {
      var bore = randChoice([50, 63, 80, 100]);
      var rod = Math.round(bore * 0.7);
      var aB = Math.PI / 4 * bore * bore;
      var aA = Math.PI / 4 * (bore * bore - rod * rod);
      var ans = +(aB / aA).toFixed(2);
      return { prompt: 'Cylinder bore = ' + bore + ' mm, rod = ' + rod + ' mm. Calculate the area ratio (bore area / annular area).', unit: '', answer: ans, tol: 0.05, steps: ['A_bore = \u03C0/4 \u00D7 ' + bore + '\u00B2 = ' + aB.toFixed(1) + ' mm\u00B2', 'A_ann = \u03C0/4 \u00D7 (' + bore + '\u00B2 \u2212 ' + rod + '\u00B2) = ' + aA.toFixed(1) + ' mm\u00B2', 'Ratio = ' + aB.toFixed(1) + ' / ' + aA.toFixed(1) + ' = ' + ans] };
    },
    function () {
      var bore = randChoice([80, 100, 125, 150]);
      var stroke = randChoice([200, 300, 400, 500, 600]);
      var a = Math.PI / 4 * bore * bore;
      var ans = +(a * stroke / 1e6).toFixed(2);
      return { prompt: 'Cylinder bore = ' + bore + ' mm, stroke = ' + stroke + ' mm. Calculate the volume per extend stroke (litres).', unit: 'L', answer: ans, tol: 0.05, steps: ['A = \u03C0/4 \u00D7 ' + bore + '\u00B2 = ' + a.toFixed(1) + ' mm\u00B2', 'V = A \u00D7 L = ' + a.toFixed(1) + ' \u00D7 ' + stroke, 'V = ' + (a * stroke).toFixed(0) + ' mm\u00B3 = ' + ans + ' L'] };
    },
    function () {
      var pBar = randChoice([100, 150, 180, 200, 250]);
      var margin = randChoice([15, 20, 25, 30]);
      var ans = pBar + margin;
      return { prompt: 'A relief valve protects a circuit operating at ' + pBar + ' bar. The recommended margin is ' + margin + ' bar above working pressure. What should the relief valve setting be (bar)?', unit: 'bar', answer: ans, tol: 0, steps: ['Relief setting = working pressure + margin', 'Setting = ' + pBar + ' + ' + margin, 'Setting = ' + ans + ' bar'] };
    },
    function () {
      var bore = randChoice([80, 100, 125]);
      var rod = Math.round(bore * 0.7);
      var q = randChoice([30, 40, 50, 60]);
      var aRod = Math.PI / 4 * rod * rod;
      var ans = +(q * 1e6 / 60 / aRod).toFixed(1);
      return { prompt: 'Regenerative circuit: bore = ' + bore + ' mm, rod = ' + rod + ' mm, pump flow = ' + q + ' L/min. Calculate regenerative extend speed (mm/s).', unit: 'mm/s', answer: ans, tol: 1, steps: ['In regen mode: v = Q / A_rod', 'A_rod = \u03C0/4 \u00D7 ' + rod + '\u00B2 = ' + aRod.toFixed(1) + ' mm\u00B2', 'Q = ' + (q * 1e6 / 60).toFixed(0) + ' mm\u00B3/s', 'v = ' + ans + ' mm/s'] };
    },
    function () {
      var bore = randChoice([63, 80, 100]);
      var rod = Math.round(bore * 0.7);
      var pBar = randChoice([150, 200, 250]);
      var aRod = Math.PI / 4 * rod * rod;
      var ans = +(pBar * 0.1 * aRod / 1000).toFixed(1);
      return { prompt: 'Regenerative circuit: bore = ' + bore + ' mm, rod = ' + rod + ' mm, pressure = ' + pBar + ' bar. Calculate regenerative extend force (kN).', unit: 'kN', answer: ans, tol: 0.5, steps: ['In regen mode: F = P \u00D7 A_rod', 'A_rod = \u03C0/4 \u00D7 ' + rod + '\u00B2 = ' + aRod.toFixed(1) + ' mm\u00B2', 'F = ' + (pBar * 0.1).toFixed(1) + ' \u00D7 ' + aRod.toFixed(1), 'F = ' + ans + ' kN'] };
    },
    function () {
      var bore = randChoice([63, 80, 100, 125]);
      var speed = randChoice([50, 80, 100, 120, 150]);
      var a = Math.PI / 4 * bore * bore;
      var ans = +(a * speed * 60 / 1e6).toFixed(1);
      return { prompt: 'Required extend speed = ' + speed + ' mm/s, bore = ' + bore + ' mm. Calculate required pump flow (L/min).', unit: 'L/min', answer: ans, tol: 0.5, steps: ['Q = A \u00D7 v', 'A = \u03C0/4 \u00D7 ' + bore + '\u00B2 = ' + a.toFixed(1) + ' mm\u00B2', 'Q = ' + a.toFixed(1) + ' \u00D7 ' + speed + ' = ' + (a * speed).toFixed(0) + ' mm\u00B3/s', 'Q = ' + ans + ' L/min'] };
    }
  ];

  /* ================================================================
     QUIZ — 15 questions (8 MCQ + 7 numeric)
     ================================================================ */

  var QUIZ_POOL = [
    { type: 'mcq', q: 'Which valve type is used to limit maximum system pressure?', opts: ['Directional control valve', 'Flow control valve', 'Relief valve', 'Check valve'], ans: 2 },
    { type: 'mcq', q: 'In a meter-in circuit, where is the flow control valve placed?', opts: ['In the return line', 'In the pressure line to the actuator', 'Parallel to the pump', 'In the drain line'], ans: 1 },
    { type: 'mcq', q: 'What does "4/3" mean in a 4/3 DCV?', opts: ['4 liters per 3 seconds', '4 ports and 3 spool positions', '4 bar at 3 positions', '3 ports and 4 positions'], ans: 1 },
    { type: 'mcq', q: 'Which circuit type is best for controlling speed of overrunning loads?', opts: ['Meter-in', 'Meter-out', 'Regenerative', 'Bleed-off'], ans: 1 },
    { type: 'mcq', q: 'In a regenerative circuit, rod-side exhaust oil is directed to:', opts: ['Tank', 'Cap side of same cylinder', 'A second cylinder', 'The filter'], ans: 1 },
    { type: 'mcq', q: 'A check valve allows flow in:', opts: ['Both directions equally', 'One direction only', 'Neither direction', 'One direction when pressure exceeds spring force'], ans: 3 },
    { type: 'mcq', q: 'What is the standard symbol system for hydraulic schematics?', opts: ['ANSI Y32', 'ISO 1219', 'DIN 5008', 'IEEE 315'], ans: 1 },
    { type: 'mcq', q: 'Which pump type handles the highest pressures (up to 400 bar)?', opts: ['Gear pump', 'Vane pump', 'Piston pump', 'Centrifugal pump'], ans: 2 },
    { type: 'num', q: 'Cylinder bore = 80 mm, pressure = 200 bar. Calculate extend force in kN.', ans: +(200 * 0.1 * Math.PI / 4 * 6400 / 1000).toFixed(1), tol: 0.5, unit: 'kN' },
    { type: 'num', q: 'Pump displacement = 28 cm\u00B3/rev at 1500 rpm, 90% vol. efficiency. Flow rate in L/min?', ans: +(28 * 1500 * 0.9 / 1000).toFixed(1), tol: 0.5, unit: 'L/min' },
    { type: 'num', q: 'System pressure = 180 bar, flow = 40 L/min. Hydraulic power in kW?', ans: +(180 * 40 / 600).toFixed(1), tol: 0.3, unit: 'kW' },
    { type: 'num', q: 'Flow rate = 30 L/min, bore = 63 mm. Calculate extend speed in mm/s.', ans: +(30e6 / 60 / (Math.PI / 4 * 3969)).toFixed(1), tol: 1, unit: 'mm/s' },
    { type: 'num', q: 'Bore 100 mm, rod 70 mm. What is the area ratio (bore/annular)?', ans: +(Math.PI / 4 * 10000 / (Math.PI / 4 * (10000 - 4900))).toFixed(2), tol: 0.05, unit: '' },
    { type: 'num', q: 'Relief valve setting must be 25 bar above working pressure of 175 bar. Setting = ?', ans: 200, tol: 0, unit: 'bar' },
    { type: 'num', q: 'Regen circuit: bore 100 mm, rod 70 mm, flow 40 L/min. Regen extend speed in mm/s?', ans: +(40e6 / 60 / (Math.PI / 4 * 4900)).toFixed(1), tol: 1, unit: 'mm/s' }
  ];

  /* ================================================================
     DOM REFS
     ================================================================ */

  var canvas = document.getElementById('sim-canvas');
  var ctx = canvas.getContext('2d');
  var simPanel = document.getElementById('sim-panel');
  var prebuiltTabs = document.getElementById('prebuilt-tabs');
  var circuitDesc = document.getElementById('circuit-desc');
  var btnRun = document.getElementById('btn-run');
  var btnStop = document.getElementById('btn-stop');
  var btnClear = document.getElementById('btn-clear');
  var btnDelete = document.getElementById('btn-delete');
  var toolbarHint = document.getElementById('toolbar-hint');
  var _fontFamily = 'system-ui, sans-serif'; /* cached once */
  var propsPanel = document.getElementById('props-panel');
  var propsBody = document.getElementById('props-body');
  var simReadouts = document.getElementById('sim-readouts');
  var warningBar = document.getElementById('warning-bar');

  /* ================================================================
     DISPLAY UNITS — SI / IMPERIAL (solo presentacion)
     ================================================================
     El solver trabaja siempre en SI (bar, L/min, mm…). Aqui se convierte lo que
     se muestra: readouts, etiquetas del canvas, panel de propiedades y la guia
     del componente. La preferencia se recuerda en localStorage. */
  var displayUnits = SYSTEMS.SI;
  try {
    var _savedUnits = localStorage.getItem('hydsim.units');
    if (_savedUnits === SYSTEMS.IMPERIAL || _savedUnits === SYSTEMS.SI) displayUnits = _savedUnits;
  } catch (_unitsReadErr) { /* almacenamiento no disponible */ }

  function convDisp(kind, value) { return convert(kind, value, displayUnits); }
  function unitLabelDisp(kind) { return unitLabel(kind, displayUnits); }
  function fmtDisp(kind, value, decimals) { return formatValue(kind, value, displayUnits, decimals); }
  function fmtUnitDisp(kind, value, decimals) { return formatWithUnit(kind, value, displayUnits, decimals); }

  var unitTabs = document.getElementById('unit-tabs');
  var eduPanel = document.getElementById('edu-panel');
  var eduBody = document.getElementById('edu-body');
  var eduClose = document.getElementById('edu-close');
  var _unitLabelIds = {
    'u-pressure': 'pressure', 'u-flow': 'flow', 'u-power': 'power',
    'u-force': 'force', 'u-speed': 'speed'
  };

  /** Actualiza las etiquetas de unidad de las tarjetas de readout. */
  function updateUnitLabels() {
    for (var id in _unitLabelIds) {
      var el = document.getElementById(id);
      if (el) el.textContent = unitLabelDisp(_unitLabelIds[id]);
    }
  }

  var catRow = document.getElementById('cat-row');
  var catTabs = document.getElementById('cat-tabs');
  var itemSelector = document.getElementById('item-selector');
  var conceptGrid = document.getElementById('concept-grid');
  var itemInfo = document.getElementById('item-info');

  var practicePanel = document.getElementById('practice-panel');
  var practiceBar = document.getElementById('practice-bar');
  var ppPrompt = document.getElementById('pp-prompt');
  var ppInput = document.getElementById('pp-input');
  var ppUnit = document.getElementById('pp-unit');
  var ppCheck = document.getElementById('pp-check');
  var ppNext = document.getElementById('pp-next');
  var ppFeedback = document.getElementById('pp-feedback');
  var ppSolution = document.getElementById('pp-solution');
  var pbarScoreVal = document.getElementById('pbar-score-val');

  var quizPanel = document.getElementById('quiz-panel');
  var quizBar = document.getElementById('quiz-bar');
  var qbarNum = document.getElementById('qbar-num');
  var quizResult = document.getElementById('quiz-result');

  /* ================================================================
     STATE
     ================================================================ */

  var mode = 'simulate';
  var running = false;
  var animFrame = null;
  var W = 800, H = 500;
  var dpr = window.devicePixelRatio || 1;

  /* Circuit builder state */
  var components = [];
  var connections = [];
  var nextId = 1;
  var selectedComp = null;
  var draggingComp = null;
  var dragOffX = 0, dragOffY = 0;
  var dragStartX = 0, dragStartY = 0, dragMoved = false;
  var connectingFrom = null; /* { compId, portIdx } */
  var hoveredPort = null;
  var hoveredPortSX = 0, hoveredPortSY = 0; /* raw canvas screen px for tooltip */
  var hoveredCompId = null;
  var hoveredDcv = null; /* component hovered for DCV click-toggle */
  var selectedConn = -1; /* index into connections[], -1 = none */
  var hoveredConn = -1;  /* index into connections[], -1 = none */
  var draggingSegInfo = null; /* { connIdx, axis, startVal, wpIdxA, wpIdxB, origA, origB } */
  var pendingSegDrag = null;        /* candidate seg drag awaiting movement past threshold */
  var DRAG_THRESHOLD_PX = 6;        /* pointer must move this far (CSS px) to commit drag */
  var _pathCache = []; /* cached paths for all connections, rebuilt each draw() */
  var _crossingsCache = []; /* cached crossing points, rebuilt in recomputePaths() */
  var prevExtensions = {}; /* track previous cylinder extensions for tick sound */
  var particles = [];
  var simTime = 0;

  /* Advanced instrumentation state (oscilloscope / faults / diagnostics) */
  var activeFault = 'none';
  var scopeBuffer = []; /* [{t, ch1, ch2, ch3, ch4}] rolling window */
  var SCOPE_MAX_SAMPLES = 1800; /* ~30 s at 60 fps */
  var scopeChannels = ['', '', '', '']; /* compId strings per channel */
  var scopePaused = false;
  var lastDiagnosticsKey = '';

  /* Explore state */
  var exploreCat = 'fundamentals';
  var selectedConcept = null;

  /* Practice state */
  var practiceCorrect = 0, practiceTotal = 0;
  var currentProblem = null;
  var practiceAnswered = false;

  /* Quiz state */
  var QUIZ_SIZE = 5;
  var quizSet = [], quizIdx = 0, quizScore = 0;
  var quizAnswered = false;
  var quizAnswers = [];


  /* ================================================================
     COMPONENT DEFINITIONS -> importadas desde js/core/component-definitions.js
     (etapa E1: dominio puro, sin DOM; en E2 pasaran al ComponentRegistry)
     ================================================================ */
PropertiesPanel.init({
    definitions: COMP_DEFS,
    connections: connections,
    running: running
});

// Sobrescribir showProperties para usar el panel avanzado
const originalShowProperties = showProperties;
showProperties = function(comp) {
    originalShowProperties(comp);
    if (comp) {
        PropertiesPanel.show(comp);
    } else {
        PropertiesPanel.hide();
    }
};

// Actualizar panel periódicamente
setInterval(function() {
    if (selectedComp) {
        var advancedPanel = document.getElementById('props-panel-advanced');
        if (advancedPanel && advancedPanel.style.display !== 'none') {
            if (typeof PropertiesPanel !== 'undefined') {
                PropertiesPanel.update(selectedComp);
            }
        }
    }
}, 500);
  /* ================================================================
     PORT DESCRIPTIONS — shown in hover tooltip
     ================================================================ */
  var PORT_DESC = {
    /* Hydraulic port labels per ISO 1219 */
    'P':   'Pressure supply (from pump)',
    'T':   'Tank return (to reservoir)',
    'A':   'Output A / work port',
    'B':   'Output B / work port',
    'X':   'Pilot signal / remote pilot',
    'M':   'Measurement / gauge tap',
    '1':   'Port 1',
    '2':   'Port 2',
    '3':   'Port 3',
    '4':   'Port 4'
  };

  /* True if a (component, port-label) returns oil to the reservoir/tank.
     Rendered in tank-brown to visually distinguish from pressure-blue ports.
     In hydraulic, return ports are never capped — oil is incompressible so
     there must always be a path to tank. */
  function isTankPort(compType, portLabel) {
    if (!portLabel) return false;
    /* pump / variable-displacement pump: T is return-side feed FROM tank */
    if (compType === 'pump' || compType === 'pump-var') return portLabel === 'T';
    /* Reservoir itself: its single port IS the tank connection */
    if (compType === 'reservoir') return true;
    /* Relief-style valves drain to tank */
    if (compType === 'relief' || compType === 'unloading' || compType === 'prop-relief') return portLabel === 'T';
    /* DCVs (all variants) have a T return port */
    if (compType === 'dcv43' || compType === 'dcv42' || compType === 'dcv32' || compType === 'dcv32no' || compType === 'prop-dcv') return portLabel === 'T';
    /* Intensifier drain port */
    if (compType === 'intensifier') return portLabel === 'T';
    /* Hand pump suction/tank side */
    if (compType === 'pump-hand') return portLabel === 'T';
    /* 5-port DCVs have two exhaust ports T1 and T2 */
    if (compType === 'dcv52' || compType === 'dcv53') return portLabel === 'T1' || portLabel === 'T2';
    /* Pressure/sequence/counterbalance external drain */
    if (compType === 'sequence-valve' || compType === 'pressure-reducing' || compType === 'counterbalance') {
      return portLabel === 'T';
    }
    /* Filter typically on return line but can be pressure-line; treat as neutral */
    return false;
  }

  /* ================================================================
     PORT HOVER TOOLTIP
     ================================================================ */
  function drawPortTooltip(label, desc, cssx, cssy, tip) {
    var _cRect = canvas.getBoundingClientRect();
    var scX = canvas.width  / _cRect.width;
    var scY = canvas.height / _cRect.height;
    var sc  = scX;
    var sx = cssx * scX, sy = cssy * scY;

    var PORT_R_CSS = 4, ARROW_H_CSS = 9, PAD_X_CSS = 14, PAD_Y_CSS = 9;
    var GAP_CSS = 5, F1_CSS = 14, F2_CSS = 13, RADIUS_CSS = 6;

    var PORT_R = PORT_R_CSS * scY;
    var ARROW_H = ARROW_H_CSS * sc;
    var PAD_X = PAD_X_CSS * sc, PAD_Y = PAD_Y_CSS * sc;
    var GAP = GAP_CSS * sc;
    var F1 = Math.round(F1_CSS * sc);
    var F2 = Math.round(F2_CSS * sc);
    var BRAD = RADIUS_CSS * sc;

    var line1 = 'Port ' + label;
    var line2 = desc || '';
    var line3 = tip || '';

    /* Tank-return ports use a brown/amber tint; pressure ports use yellow */
    var isTank = !!tip;
    var borderCol = isTank ? '#cd7f32' : '#f5c518';
    var labelCol  = isTank ? '#ffb86c' : '#ffd700';
    var descCol   = isTank ? '#ffd8b5' : '#ffe98a';
    var tipCol    = '#ffb74d';

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.font = 'bold ' + F1 + 'px ' + _fontFamily;
    var w1 = ctx.measureText(line1).width;
    ctx.font = F2 + 'px ' + _fontFamily;
    var w2 = line2 ? ctx.measureText(line2).width : 0;
    var w3 = line3 ? ctx.measureText(line3).width : 0;

    var bw = Math.max(w1, w2, w3) + PAD_X * 2;
    var bh = PAD_Y + F1 + (line2 ? GAP + F2 : 0) + (line3 ? GAP + F2 : 0) + PAD_Y;

    var arrowTipY = sy - PORT_R;
    var by = arrowTipY - ARROW_H - bh;
    var bx = sx - bw / 2;

    if (bx < 4) bx = 4;
    if (bx + bw > canvas.width - 4) bx = canvas.width - bw - 4;

    var flipped = by < 4;
    if (flipped) by = sy + PORT_R + ARROW_H;

    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 8 * sc;
    ctx.shadowOffsetY = 3 * sc;

    ctx.fillStyle = '#0d1625';
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 1.5 * sc;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, BRAD);
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.stroke();

    var arrowBaseY = flipped ? by : by + bh;
    var arrowTipY2 = flipped ? by - ARROW_H : by + bh + ARROW_H;
    var arrowX = Math.max(bx + 10 * sc, Math.min(bx + bw - 10 * sc, sx));
    ctx.beginPath();
    ctx.moveTo(arrowX - 7 * sc, arrowBaseY);
    ctx.lineTo(arrowX + 7 * sc, arrowBaseY);
    ctx.lineTo(arrowX, arrowTipY2);
    ctx.closePath();
    ctx.fillStyle = '#0d1625';
    ctx.fill();
    ctx.strokeStyle = borderCol;
    ctx.stroke();

    ctx.font = 'bold ' + F1 + 'px ' + _fontFamily;
    ctx.fillStyle = labelCol;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(line1, bx + bw / 2, by + PAD_Y);
    if (line2) {
      ctx.font = F2 + 'px ' + _fontFamily;
      ctx.fillStyle = descCol;
      ctx.fillText(line2, bx + bw / 2, by + PAD_Y + F1 + GAP);
    }
    if (line3) {
      ctx.font = F2 + 'px ' + _fontFamily;
      ctx.fillStyle = tipCol;
      ctx.fillText(line3, bx + bw / 2, by + PAD_Y + F1 + (line2 ? GAP + F2 : 0) + GAP);
    }
    ctx.restore();
  }

  /* ================================================================
     ROUTING CONSTANTS & TOUCH DETECTION
     ================================================================ */
  var ROUTE_GRID = 10;
  var ROUTE_BUNDLE_GAP = 4;
  var ROUTE_OBSTACLE_PAD = 8;

  function snapToGrid(v) { return Math.round(v / ROUTE_GRID) * ROUTE_GRID; }
  function snapPt(pt)    { return { x: snapToGrid(pt.x), y: snapToGrid(pt.y) }; }

  /* Coarse pointer (touch) detection — used to enlarge hit-targets on iPad */
  var IS_COARSE_POINTER = (function () {
    try { return window.matchMedia && window.matchMedia('(pointer: coarse)').matches; }
    catch (_e) { return false; }
  })();
  try {
    var _coarseMQ = window.matchMedia('(pointer: coarse)');
    if (_coarseMQ.addEventListener) _coarseMQ.addEventListener('change', function (e) { IS_COARSE_POINTER = e.matches; });
    else if (_coarseMQ.addListener) _coarseMQ.addListener(function (e) { IS_COARSE_POINTER = e.matches; });
  } catch (_e2) { /* no-op */ }

  function _touchScale() { return IS_COARSE_POINTER ? 1.6 : 1; }

  /* Component bounding box (world coords) with optional padding. */
  function compBBox(comp, pad) {
    var def = COMP_DEFS[comp.type];
    if (!def) return null;
    pad = pad || 0;
    var rotated = (comp.orient === 90 || comp.orient === 270);
    var w = rotated ? def.h : def.w;
    var h = rotated ? def.w : def.h;
    return { x1: comp.x - pad, y1: comp.y - pad, x2: comp.x + w + pad, y2: comp.y + h + pad };
  }

  function segmentHitsObstacle(x1, y1, x2, y2, excludeIds) {
    excludeIds = excludeIds || [];
    var sxMin = Math.min(x1, x2), sxMax = Math.max(x1, x2);
    var syMin = Math.min(y1, y2), syMax = Math.max(y1, y2);
    for (var i = 0; i < components.length; i++) {
      var c = components[i];
      if (excludeIds.indexOf(c.id) !== -1) continue;
      var bb = compBBox(c, ROUTE_OBSTACLE_PAD);
      if (!bb) continue;
      if (sxMax < bb.x1 || sxMin > bb.x2) continue;
      if (syMax < bb.y1 || syMin > bb.y2) continue;
      return c;
    }
    return null;
  }

  function findClearMidY(fpS, tpS, naturalMid, excludeIds) {
    var attempts = [naturalMid];
    for (var k = 1; k <= 8; k++) {
      attempts.push(naturalMid + k * ROUTE_GRID);
      attempts.push(naturalMid - k * ROUTE_GRID);
    }
    for (var a = 0; a < attempts.length; a++) {
      var y = snapToGrid(attempts[a]);
      if (segmentHitsObstacle(fpS.x, fpS.y, fpS.x, y, excludeIds)) continue;
      if (segmentHitsObstacle(tpS.x, y, tpS.x, tpS.y, excludeIds)) continue;
      if (segmentHitsObstacle(fpS.x, y, tpS.x, y, excludeIds)) continue;
      return y;
    }
    return snapToGrid(naturalMid);
  }
  function findClearMidX(fpS, tpS, naturalMid, excludeIds) {
    var attempts = [naturalMid];
    for (var k = 1; k <= 8; k++) {
      attempts.push(naturalMid + k * ROUTE_GRID);
      attempts.push(naturalMid - k * ROUTE_GRID);
    }
    for (var a = 0; a < attempts.length; a++) {
      var x = snapToGrid(attempts[a]);
      if (segmentHitsObstacle(fpS.x, fpS.y, x, fpS.y, excludeIds)) continue;
      if (segmentHitsObstacle(x, tpS.y, tpS.x, tpS.y, excludeIds)) continue;
      if (segmentHitsObstacle(x, fpS.y, x, tpS.y, excludeIds)) continue;
      return x;
    }
    return snapToGrid(naturalMid);
  }

  /* ================================================================
     CANVAS SIZING
     ================================================================ */

  function resizeCanvas() {
    var rect = canvas.parentElement.getBoundingClientRect();
    var isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
    W = Math.max(400, Math.floor(rect.width));
    if (isFS && rect.height > 100) {
      /* Fullscreen: use the full available height of the canvas card */
      H = Math.max(300, Math.floor(rect.height));
    } else {
      H = Math.max(300, Math.min(540, Math.floor(W * 0.6)));
    }
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  window.addEventListener('resize', resizeCanvas);

  /* ================================================================
     DRAWING — ISO 1219 STYLE SYMBOLS
     ================================================================ */

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    /* Dark canvas background with grid */
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, W, H);

    /* Apply view transform (zoom/pan) */
    ctx.save();
    ctx.translate(viewOffX, viewOffY);
    ctx.scale(viewScale, viewScale);

    /* Grid — compute visible bounds from view transform */
    ctx.strokeStyle = '#151a24';
    ctx.lineWidth = 0.5;
    var gMinX = Math.floor(-viewOffX / viewScale / 20) * 20;
    var gMaxX = Math.ceil((W - viewOffX) / viewScale / 20) * 20;
    var gMinY = Math.floor(-viewOffY / viewScale / 20) * 20;
    var gMaxY = Math.ceil((H - viewOffY) / viewScale / 20) * 20;
    for (var gx = gMinX; gx <= gMaxX; gx += 20) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, (H - viewOffY) / viewScale); ctx.stroke();
    }
    for (var gy = gMinY; gy <= gMaxY; gy += 20) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo((W - viewOffX) / viewScale, gy); ctx.stroke();
    }

    /* Recompute paths with overlap nudging */
    recomputePaths();

    /* Draw connections */
    for (var i = 0; i < connections.length; i++) {
      drawConnection(connections[i], i, hoveredConn === i, selectedConn === i);
    }

    /* Draw crossing indicators */
    drawCrossings();

    /* Draw connecting line preview — with waypoint support */
    if (connectingFrom) {
      var fpPreview = getPortWorldPos2(connectingFrom);
      var wpList = connectingFrom._waypoints || [];
      /* Compute stub position for preview */
      var fpStub = fpPreview;
      var cfComp = findComp(connectingFrom.compId);
      if (cfComp) {
        var cfDef = COMP_DEFS[cfComp.type];
        var cfPort = cfDef.ports[connectingFrom.portIdx];
        fpStub = applyStub(fpPreview, cfPort.dir, 20);
      }

      if (hoveredPort) {
        /* Hovering over a target port — show full routed preview */
        var tempConn = {
          from: { compId: connectingFrom.compId, portIdx: connectingFrom.portIdx },
          to: { compId: hoveredPort.compId, portIdx: hoveredPort.portIdx }
        };
        if (wpList.length > 0) tempConn.waypoints = wpList;
        var previewPath = getConnectionPath(tempConn);
        if (previewPath) {
          ctx.strokeStyle = '#00bcd4';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(previewPath[0].x, previewPath[0].y);
          for (var pp = 1; pp < previewPath.length; pp++) {
            ctx.lineTo(previewPath[pp].x, previewPath[pp].y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (connectingFrom._lastMouse) {
        /* Show confirmed waypoint segments (solid) + lead line to cursor (dashed) */
        var mouse = connectingFrom._lastMouse;
        /* Draw confirmed segments: port → stub → waypoints (all orthogonal) */
        var previewSegs = [fpPreview, fpStub];
        for (var wi = 0; wi < wpList.length; wi++) {
          previewSegs.push(wpList[wi]);
        }
        previewSegs = enforceOrthogonal(previewSegs);
        if (previewSegs.length >= 2) {
          ctx.strokeStyle = '#00bcd4';
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(previewSegs[0].x, previewSegs[0].y);
          for (var si = 1; si < previewSegs.length; si++) {
            ctx.lineTo(previewSegs[si].x, previewSegs[si].y);
          }
          ctx.stroke();
          /* Draw waypoint dots */
          ctx.fillStyle = '#00e5ff';
          for (var wd = 0; wd < wpList.length; wd++) {
            ctx.beginPath();
            ctx.arc(wpList[wd].x, wpList[wd].y, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        /* Dashed lead line from last point to snapped cursor position */
        var lastPt = previewSegs[previewSegs.length - 1];
        var dxm = Math.abs(mouse.x - lastPt.x);
        var dym = Math.abs(mouse.y - lastPt.y);
        var snapTarget;
        if (dxm <= dym) {
          snapTarget = { x: lastPt.x, y: mouse.y };
        } else {
          snapTarget = { x: mouse.x, y: lastPt.y };
        }
        ctx.strokeStyle = '#00bcd4';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(lastPt.x, lastPt.y);
        ctx.lineTo(snapTarget.x, snapTarget.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    /* Draw components */
    for (var c = 0; c < components.length; c++) {
      drawComponent(components[c]);
    }

    /* Draw particles if running */
    if (running) {
      drawParticles();
    }

    /* Empty state hint */
    if (components.length === 0 && !running) {
      ctx.fillStyle = '#2a3050';
      ctx.font = '14px ' + _fontFamily;
      ctx.textAlign = 'center';
      ctx.fillText('Drag or click components from the palette to add them', W / 2, H / 2 - 10);
      ctx.fillText('Then click ports (circles) to connect them with lines', W / 2, H / 2 + 14);
      ctx.textAlign = 'left';
    }

    /* Restore from view transform — annotations draw in screen space */
    ctx.restore();
    drawAnnotations();

    /* Port tooltip — drawn last so it floats above all layers.
       Suppressed while drawing a connection or dragging a component. */
    if (hoveredPort && !draggingComp && !connectingFrom) {
      var _hpComp = null;
      for (var _tpi = 0; _tpi < components.length; _tpi++) {
        if (components[_tpi].id === hoveredPort.compId) { _hpComp = components[_tpi]; break; }
      }
      if (_hpComp) {
        var _hpDef = COMP_DEFS[_hpComp.type];
        if (_hpDef && _hpDef.ports[hoveredPort.portIdx]) {
          var _hpPort = _hpDef.ports[hoveredPort.portIdx];
          var _hpLbl = _hpPort.label || '';
          var _hpDesc = PORT_DESC[_hpLbl] || '';
          var _hpTank = isTankPort(_hpComp.type, _hpLbl);
          var _hpTip = _hpTank ? 'Returns to reservoir (tank)' : '';
          drawPortTooltip(_hpLbl, _hpDesc, hoveredPortSX, hoveredPortSY, _hpTip);
        }
      }
    }
  }

  /* ── Smart orthogonal routing ── */

  function applyStub(pos, dir, len) {
    switch (dir) {
      case 'up':    return { x: pos.x, y: pos.y - len };
      case 'down':  return { x: pos.x, y: pos.y + len };
      case 'left':  return { x: pos.x - len, y: pos.y };
      case 'right': return { x: pos.x + len, y: pos.y };
      default:      return { x: pos.x, y: pos.y - len };
    }
  }

  /**
   * Ensure every consecutive pair of points shares X or Y.
   * If two adjacent points are diagonal, insert an L-bend corner
   * (prefer matching the axis of the previous segment direction).
   */
  function enforceOrthogonal(pts) {
    if (!pts || pts.length < 2) return pts;
    var result = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var prev = result[result.length - 1];
      var cur = pts[i];
      if (Math.abs(prev.x - cur.x) > 1 && Math.abs(prev.y - cur.y) > 1) {
        /* Diagonal — decide bend direction based on preceding segment */
        if (result.length >= 2) {
          var pp = result[result.length - 2];
          if (Math.abs(pp.x - prev.x) < 1) {
            /* Previous segment was vertical → continue vertical first */
            result.push({ x: prev.x, y: cur.y });
          } else {
            /* Previous segment was horizontal → continue horizontal first */
            result.push({ x: cur.x, y: prev.y });
          }
        } else {
          /* No prior segment context — default horizontal-first */
          result.push({ x: cur.x, y: prev.y });
        }
      }
      result.push(cur);
    }
    return result;
  }

  function getConnectionPath(conn) {
    var fromComp = findComp(conn.from.compId);
    var toComp = findComp(conn.to.compId);
    if (!fromComp || !toComp) return null;

    var fromDef = COMP_DEFS[fromComp.type];
    var toDef = COMP_DEFS[toComp.type];
    var fromPort = getRotatedPort(fromDef, conn.from.portIdx, fromComp.orient);
    var toPort = getRotatedPort(toDef, conn.to.portIdx, toComp.orient);
    if (!fromPort || !toPort) return null;

    var fp = { x: fromComp.x + fromPort.x, y: fromComp.y + fromPort.y };
    var tp = { x: toComp.x + toPort.x, y: toComp.y + toPort.y };

    var STUB = 20;
    var fpS = applyStub(fp, fromPort.dir, STUB);
    var tpS = applyStub(tp, toPort.dir, STUB);

    /* Manual waypoint routing — user-clicked corner points */
    if (conn.waypoints && conn.waypoints.length > 0) {
      var wpts = [fp, fpS];
      for (var wi = 0; wi < conn.waypoints.length; wi++) {
        wpts.push(conn.waypoints[wi]);
      }
      /* Connect last waypoint to target stub */
      var lastWp = wpts[wpts.length - 1];
      if (Math.abs(lastWp.x - tpS.x) > 1 && Math.abs(lastWp.y - tpS.y) > 1) {
        if (toPort.dir === 'up' || toPort.dir === 'down') {
          wpts.push({ x: tpS.x, y: lastWp.y });
        } else {
          wpts.push({ x: lastWp.x, y: tpS.y });
        }
      }
      wpts.push(tpS);
      wpts.push(tp);
      return enforceOrthogonal(wpts);
    }

    var points = [fp, fpS];

    var isFromVert = (fromPort.dir === 'up' || fromPort.dir === 'down');
    var isToVert = (toPort.dir === 'up' || toPort.dir === 'down');

    if (Math.abs(fpS.x - tpS.x) < 1 && Math.abs(fpS.y - tpS.y) < 1) {
      /* Stubs meet at same point — direct */
    } else if (Math.abs(fpS.x - tpS.x) < 1) {
      /* Vertically aligned — direct vertical */
      points.push(tpS);
    } else if (Math.abs(fpS.y - tpS.y) < 1) {
      /* Horizontally aligned — direct horizontal */
      points.push(tpS);
    } else if (isFromVert && isToVert) {
      /* Both vertical stubs → horizontal crossbar at midY */
      var midY = (fpS.y + tpS.y) / 2 + (conn._dragOffset || 0) + (conn._autoNudge || 0);
      points.push({ x: fpS.x, y: midY });
      points.push({ x: tpS.x, y: midY });
      points.push(tpS);
    } else if (!isFromVert && !isToVert) {
      /* Both horizontal stubs → vertical crossbar at midX */
      var midX = (fpS.x + tpS.x) / 2 + (conn._dragOffset || 0) + (conn._autoNudge || 0);
      points.push({ x: midX, y: fpS.y });
      points.push({ x: midX, y: tpS.y });
      points.push(tpS);
    } else {
      /* Mixed: one vertical, one horizontal.
         Try single L-bend first (cleaner look). If its long leg would pass
         THROUGH the target component's body (which avoidComponents excludes
         since the wire must touch the port), fall back to a U-bend at the
         (fpS+tpS)/2 midpoint with obstacle search. */
      var nudge = (conn._dragOffset || 0) + (conn._autoNudge || 0);
      var excludeIds = [conn.from.compId, conn.to.compId];
      if (isFromVert) {
        var bendY = snapToGrid(tpS.y + nudge);
        var crossesT = false;
        var tBox = compBBox(toComp, ROUTE_OBSTACLE_PAD);
        if (tBox && fpS.x > tBox.x1 && fpS.x < tBox.x2) {
          var lMinY = Math.min(fpS.y, bendY), lMaxY = Math.max(fpS.y, bendY);
          if (lMaxY > tBox.y1 && lMinY < tBox.y2) crossesT = true;
        }
        if (!crossesT && segmentHitsObstacle(fpS.x, fpS.y, fpS.x, bendY, excludeIds)) crossesT = true;
        if (crossesT) {
          var midUY = findClearMidY(fpS, tpS, snapToGrid((fpS.y + tpS.y) / 2 + nudge), excludeIds);
          points.push({ x: fpS.x, y: midUY });
          points.push({ x: tpS.x, y: midUY });
        } else {
          points.push({ x: fpS.x, y: bendY });
          points.push({ x: tpS.x, y: bendY });
        }
      } else {
        var bendX = snapToGrid(tpS.x + nudge);
        var crossesH = false;
        var tBoxH = compBBox(toComp, ROUTE_OBSTACLE_PAD);
        if (tBoxH && fpS.y > tBoxH.y1 && fpS.y < tBoxH.y2) {
          var lMinX = Math.min(fpS.x, bendX), lMaxX = Math.max(fpS.x, bendX);
          if (lMaxX > tBoxH.x1 && lMinX < tBoxH.x2) crossesH = true;
        }
        if (!crossesH && segmentHitsObstacle(fpS.x, fpS.y, bendX, fpS.y, excludeIds)) crossesH = true;
        if (crossesH) {
          var midUX = findClearMidX(fpS, tpS, snapToGrid((fpS.x + tpS.x) / 2 + nudge), excludeIds);
          points.push({ x: midUX, y: fpS.y });
          points.push({ x: midUX, y: tpS.y });
        } else {
          points.push({ x: bendX, y: fpS.y });
          points.push({ x: bendX, y: tpS.y });
        }
      }
      points.push(tpS);
    }

    points.push(tp);
    return avoidComponents(points, conn.from.compId, conn.to.compId);
  }

  /* ── Obstacle avoidance — route around component bodies ── */

  /** Check if an orthogonal segment intersects a rectangle */
  function segCrossesRect(x1, y1, x2, y2, rx, ry, rw, rh) {
    var minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    var minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    /* No overlap at all */
    if (maxX <= rx || minX >= rx + rw || maxY <= ry || minY >= ry + rh) return false;
    /* Vertical segment: x must be within rect X range */
    if (Math.abs(x1 - x2) < 1) {
      return x1 > rx && x1 < rx + rw && maxY > ry && minY < ry + rh;
    }
    /* Horizontal segment: y must be within rect Y range */
    if (Math.abs(y1 - y2) < 1) {
      return y1 > ry && y1 < ry + rh && maxX > rx && minX < rx + rw;
    }
    return false;
  }

  /** Find the first component whose bounding box blocks a segment.
   *  skipIds (optional array) — component IDs to exclude from check. */
  function findBlocker(ax, ay, bx, by, skipIds) {
    var MARGIN = 12;
    for (var i = 0; i < components.length; i++) {
      var comp = components[i];
      if (skipIds) {
        var skip = false;
        for (var s = 0; s < skipIds.length; s++) {
          if (comp.id === skipIds[s]) { skip = true; break; }
        }
        if (skip) continue;
      }
      var def = COMP_DEFS[comp.type];
      if (!def) continue;
      var ed = getEffectiveDims(comp);
      if (segCrossesRect(ax, ay, bx, by,
            comp.x - MARGIN, comp.y - MARGIN,
            ed.w + 2 * MARGIN, ed.h + 2 * MARGIN)) {
        return {
          x: comp.x - MARGIN,
          y: comp.y - MARGIN,
          w: ed.w + 2 * MARGIN,
          h: ed.h + 2 * MARGIN
        };
      }
    }
    return null;
  }

  /**
   * Post-process a path to route around any component bodies it passes through.
   * Keeps first segment (port→stub) and last segment (stub→port) untouched.
   *
   * Key rule: middle segments are checked against ALL components including
   * the connection’s own endpoints.  Only stub-adjacent segments get a
   * limited exclusion for their adjacent endpoint component.
   */
  function avoidComponents(path, fromCompId, toCompId) {
    if (!path || path.length < 3) return path;
    var MAX_ITER = 6;

    for (var iter = 0; iter < MAX_ITER; iter++) {
      var changed = false;
      var newPath = [path[0], path[1]]; /* keep port + stub fixed */

      for (var i = 2; i < path.length - 1; i++) {
        var a = newPath[newPath.length - 1];
        var b = path[i];

        /* Skip zero-length segments */
        if (Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1) {
          newPath.push(b);
          continue;
        }

        /* Determine which components to skip for this segment:
           - Segment right after from-stub (first middle seg): skip fromComp
           - Segment right before to-stub  (last middle seg):  skip toComp
           - All other segments: no exclusions — check ALL components */
        var skipIds = null;
        if (i === 2) skipIds = [fromCompId];
        else if (i === path.length - 2) skipIds = [toCompId];

        var blocker = findBlocker(a.x, a.y, b.x, b.y, skipIds);
        if (!blocker) {
          newPath.push(b);
          continue;
        }

        changed = true;
        var isVert  = Math.abs(a.x - b.x) < 1;
        var isHoriz = Math.abs(a.y - b.y) < 1;

        if (isVert) {
          /* Vertical segment blocked — detour left or right.
             Choose the side that is farther from the blocker centre
             (pushes line outward for cleaner routing). */
          var cx = blocker.x + blocker.w / 2;
          var detourX = (a.x <= cx) ? blocker.x : blocker.x + blocker.w;
          newPath.push({ x: detourX, y: a.y });
          newPath.push({ x: detourX, y: b.y });
        } else if (isHoriz) {
          /* Horizontal segment blocked — detour above or below */
          var cy = blocker.y + blocker.h / 2;
          var detourY = (a.y <= cy) ? blocker.y : blocker.y + blocker.h;
          newPath.push({ x: a.x, y: detourY });
          newPath.push({ x: b.x, y: detourY });
        }
        newPath.push(b);
      }

      /* Keep last two points (to-stub + port) */
      newPath.push(path[path.length - 1]);
      path = newPath;
      if (!changed) break;
    }

    return cleanPath(path);
  }

  /**
   * Comprehensive path cleanup:
   *  1. Remove duplicate consecutive points (zero-length segments)
   *  2. Fix diagonals — insert corner to ensure strict 90° turns
   *  3. Merge collinear consecutive segments (3 points on same line)
   *  4. Remove backtracks (segment goes forward then reverses on same axis)
   *  5. Remove zero-area U-turns (rect loops that end near where they started)
   *
   * Runs multiple passes until stable.
   */
  function cleanPath(path) {
    if (!path || path.length < 2) return path;

    /* Pass A: fix diagonals first */
    var fixed = [path[0]];
    for (var i = 1; i < path.length; i++) {
      var prev = fixed[fixed.length - 1];
      var cur  = path[i];
      if (Math.abs(cur.x - prev.x) > 1 && Math.abs(cur.y - prev.y) > 1) {
        fixed.push({ x: cur.x, y: prev.y });
      }
      fixed.push(cur);
    }
    path = fixed;

    /* Pass B: iterative cleanup (merge + backtrack removal) */
    var MAX = 8;
    for (var pass = 0; pass < MAX; pass++) {
      var before = path.length;
      path = mergeCollinear(path);
      path = removeBacktracks(path);
      path = removeUturn(path);
      if (path.length === before) break; /* stable */
    }

    return path;
  }

  /** Merge three consecutive collinear points into two */
  function mergeCollinear(path) {
    if (path.length < 3) return path;
    var res = [path[0]];
    for (var i = 1; i < path.length; i++) {
      if (res.length >= 2) {
        var pp = res[res.length - 2];
        var p  = res[res.length - 1];
        var c  = path[i];
        var sameX = Math.abs(pp.x - p.x) < 1 && Math.abs(p.x - c.x) < 1;
        var sameY = Math.abs(pp.y - p.y) < 1 && Math.abs(p.y - c.y) < 1;
        if (sameX || sameY) {
          /* Middle point is redundant — replace with current */
          res[res.length - 1] = c;
          continue;
        }
      }
      /* Skip zero-length segments */
      var prev = res[res.length - 1];
      if (Math.abs(path[i].x - prev.x) < 1 && Math.abs(path[i].y - prev.y) < 1) continue;
      res.push(path[i]);
    }
    return res;
  }

  /** Remove backtracks: A→B→C where all three share an axis and C is
   *  between A and B (the path went past C then came back). Replace A→B→C
   *  with A→C. */
  function removeBacktracks(path) {
    if (path.length < 3) return path;
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < path.length - 2; i++) {
        var a = path[i], b = path[i + 1], c = path[i + 2];
        /* Same vertical line */
        if (Math.abs(a.x - b.x) < 1 && Math.abs(b.x - c.x) < 1) {
          var minAB = Math.min(a.y, b.y), maxAB = Math.max(a.y, b.y);
          if (c.y >= minAB - 1 && c.y <= maxAB + 1) {
            /* C is between A and B on Y — backtrack; remove B */
            path.splice(i + 1, 1);
            changed = true;
            break;
          }
        }
        /* Same horizontal line */
        if (Math.abs(a.y - b.y) < 1 && Math.abs(b.y - c.y) < 1) {
          var minABx = Math.min(a.x, b.x), maxABx = Math.max(a.x, b.x);
          if (c.x >= minABx - 1 && c.x <= maxABx + 1) {
            path.splice(i + 1, 1);
            changed = true;
            break;
          }
        }
      }
    }
    return path;
  }

  /** Remove zero-area U-turns: 4 consecutive points forming a rectangle
   *  where the 4th point has the same axis coordinate as the 1st.
   *  Pattern: A→B→C→D  where A.x==D.x or A.y==D.y and the
   *  detour B→C is unnecessary. Replace with A→D. */
  function removeUturn(path) {
    if (path.length < 4) return path;
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < path.length - 3; i++) {
        var a = path[i], b = path[i + 1], c = path[i + 2], d = path[i + 3];
        /* Check for vertical U-turn: A and D on same X, B and C form the detour */
        if (Math.abs(a.x - d.x) < 1 && Math.abs(b.x - c.x) < 1) {
          /* A goes right/left to B, then B goes up/down to C, then C goes back to D.x
             This is only a U-turn if D.y is between A.y and the far end, i.e.
             the detour doesn’t actually progress past A toward the destination. */
          var minAD = Math.min(a.y, d.y), maxAD = Math.max(a.y, d.y);
          var detourOutside = (b.y < minAD - 1 || b.y > maxAD + 1 ||
                               c.y < minAD - 1 || c.y > maxAD + 1);
          if (!detourOutside) {
            /* The detour stays within the A→D range — it’s unnecessary */
            path.splice(i + 1, 2); /* remove B and C */
            changed = true;
            break;
          }
        }
        /* Check for horizontal U-turn */
        if (Math.abs(a.y - d.y) < 1 && Math.abs(b.y - c.y) < 1) {
          var minADx = Math.min(a.x, d.x), maxADx = Math.max(a.x, d.x);
          var detourOutsideX = (b.x < minADx - 1 || b.x > maxADx + 1 ||
                                c.x < minADx - 1 || c.x > maxADx + 1);
          if (!detourOutsideX) {
            path.splice(i + 1, 2);
            changed = true;
            break;
          }
        }
      }
    }
    return path;
  }

  function polylineLength(pts) {
    var len = 0;
    for (var i = 1; i < pts.length; i++) {
      len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
    }
    return len;
  }

  function interpolatePolyline(pts, dist) {
    var remaining = dist;
    for (var i = 1; i < pts.length; i++) {
      var segLen = Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
      if (segLen < 0.001) continue;
      if (remaining <= segLen) {
        var frac = remaining / segLen;
        return {
          x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * frac,
          y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * frac
        };
      }
      remaining -= segLen;
    }
    return pts[pts.length - 1];
  }

  /* ── Point-to-segment distance for hit-testing ── */

  function pointToSegmentDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    var projX = ax + t * dx, projY = ay + t * dy;
    return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
  }

  function hitTestConnection(mx, my, threshold) {
    threshold = (threshold || 6) * _touchScale();
    for (var i = connections.length - 1; i >= 0; i--) {
      var path = _pathCache[i] || getConnectionPath(connections[i]);
      if (!path) continue;
      var hit = false;
      for (var s = 1; s < path.length; s++) {
        if (pointToSegmentDist(mx, my, path[s - 1].x, path[s - 1].y, path[s].x, path[s].y) < threshold) {
          hit = true;
          break;
        }
      }
      if (hit) return i;
    }
    return -1;
  }

  /* ── Path cache, overlap nudging & crossing detection ── */

  function recomputePaths() {
    /* 1. Clear auto-nudge offsets from previous frame */
    for (var i = 0; i < connections.length; i++) {
      connections[i]._autoNudge = 0;
    }
    /* 2. Compute base paths */
    _pathCache = [];
    for (var i = 0; i < connections.length; i++) {
      _pathCache[i] = getConnectionPath(connections[i]);
    }
    /* 3. Detect overlaps and assign nudge offsets */
    nudgeOverlaps();
    /* 4. Cache crossing points (avoids O(n²) recomputation in drawCrossings) */
    _crossingsCache = findCrossings();
  }

  /**
   * Detect connections with prolonged collinear segment overlaps (>20px).
   *
   * Strategy:
   * - For VV/HH paths (6+ points with a crossbar): shift the crossbar via
   *   _autoNudge and recompute the path.  This naturally separates the
   *   vertical/horizontal connecting segments too.
   * - For L-bend / short paths (< 6 points): apply a direct perpendicular
   *   offset to the overlapping segments in _pathCache.
   *
   * Two-pass approach avoids cascading recomputation issues.
   */
  function nudgeOverlaps() {
    /* Bundle parallel wires with tight 4-px spacing — FluidSIM-like harness look. */
    var THRESHOLD = 12;                /* min overlap px before nudging */
    var OFFSET = ROUTE_BUNDLE_GAP;     /* px to offset each connection in group */

    /* ── Pass 1: crossbar-based nudge for VV/HH connections ── */
    var nudged = {};
    for (var i = 0; i < _pathCache.length; i++) {
      if (nudged[i]) continue;
      var pathA = _pathCache[i];
      if (!pathA || pathA.length < 6) continue; /* only VV/HH */

      var group = [i];
      for (var j = i + 1; j < _pathCache.length; j++) {
        if (nudged[j]) continue;
        var pathB = _pathCache[j];
        if (!pathB || pathB.length < 6) continue;
        if (pathsOverlap(pathA, pathB, THRESHOLD)) {
          group.push(j);
        }
      }
      if (group.length > 1) {
        for (var g = 0; g < group.length; g++) {
          var ci = group[g];
          var nudgeVal = (g - (group.length - 1) / 2) * OFFSET;
          connections[ci]._autoNudge = nudgeVal;
          _pathCache[ci] = getConnectionPath(connections[ci]);
          nudged[ci] = true;
        }
      }
    }

    /* ── Pass 2: handle overlaps for ALL connections (including short/L-bend paths) ── */
    /* Now that Pass 1 handled VV/HH groups, do a second scan for any remaining
       overlaps involving short paths. Use _autoNudge + recompute (not direct
       segment shifts which break orthogonality). */
    for (var i = 0; i < _pathCache.length; i++) {
      if (nudged[i]) continue;
      var pathA = _pathCache[i];
      if (!pathA || pathA.length < 2) continue;

      var group = [i];
      for (var j = i + 1; j < _pathCache.length; j++) {
        var pathB = _pathCache[j];
        if (!pathB || pathB.length < 2) continue;
        if (pathsOverlap(pathA, pathB, THRESHOLD)) {
          group.push(j);
        }
      }
      if (group.length > 1) {
        for (var g = 0; g < group.length; g++) {
          var ci = group[g];
          if (nudged[ci]) continue;
          var nudgeVal = (g - (group.length - 1) / 2) * OFFSET;
          connections[ci]._autoNudge = nudgeVal;
          _pathCache[ci] = getConnectionPath(connections[ci]);
          nudged[ci] = true;
        }
      }
    }
  }

  /** Check if two paths have any collinear segments overlapping for > threshold px */
  function pathsOverlap(pathA, pathB, threshold) {
    for (var si = 1; si < pathA.length; si++) {
      var a1 = pathA[si - 1], a2 = pathA[si];
      var aH = Math.abs(a1.y - a2.y) < 1;
      var aV = Math.abs(a1.x - a2.x) < 1;
      if (!aH && !aV) continue; /* diagonal/zero-length — skip */

      for (var sj = 1; sj < pathB.length; sj++) {
        var b1 = pathB[sj - 1], b2 = pathB[sj];
        var bH = Math.abs(b1.y - b2.y) < 1;
        var bV = Math.abs(b1.x - b2.x) < 1;
        if (!bH && !bV) continue;

        if (aH && bH && Math.abs(a1.y - b1.y) < 4) {
          /* Both horizontal at same Y — check X overlap */
          var ov = Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x))
                 - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x));
          if (ov > threshold) return true;
        } else if (aV && bV && Math.abs(a1.x - b1.x) < 4) {
          /* Both vertical at same X — check Y overlap */
          var ov2 = Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y))
                  - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y));
          if (ov2 > threshold) return true;
        }
      }
    }
    return false;
  }

  /**
   * Find all crossing points between connections for visual indicators.
   * Returns array of {x, y, isHorizontalOnTop} for each crossing.
   */
  function findCrossings() {
    var crossings = [];
    /* Collect all segments from all cached paths */
    var allSegs = [];
    for (var ci = 0; ci < _pathCache.length; ci++) {
      var path = _pathCache[ci];
      if (!path || path.length < 2) continue;
      for (var si = 1; si < path.length; si++) {
        allSegs.push({
          ci: ci,
          x1: path[si - 1].x, y1: path[si - 1].y,
          x2: path[si].x, y2: path[si].y
        });
      }
    }
    /* Check all pairs for perpendicular crossings */
    for (var i = 0; i < allSegs.length; i++) {
      for (var j = i + 1; j < allSegs.length; j++) {
        var a = allSegs[i], b = allSegs[j];
        if (a.ci === b.ci) continue; /* same connection */
        var aH = Math.abs(a.y1 - a.y2) < 1;
        var aV = Math.abs(a.x1 - a.x2) < 1;
        var bH = Math.abs(b.y1 - b.y2) < 1;
        var bV = Math.abs(b.x1 - b.x2) < 1;

        if (aH && bV) {
          /* a is horizontal, b is vertical */
          var ix = b.x1, iy = a.y1;
          if (ix > Math.min(a.x1, a.x2) + 2 && ix < Math.max(a.x1, a.x2) - 2 &&
              iy > Math.min(b.y1, b.y2) + 2 && iy < Math.max(b.y1, b.y2) - 2) {
            crossings.push({ x: ix, y: iy });
          }
        } else if (aV && bH) {
          /* a is vertical, b is horizontal */
          var ix2 = a.x1, iy2 = b.y1;
          if (ix2 > Math.min(b.x1, b.x2) + 2 && ix2 < Math.max(b.x1, b.x2) - 2 &&
              iy2 > Math.min(a.y1, a.y2) + 2 && iy2 < Math.max(a.y1, a.y2) - 2) {
            crossings.push({ x: ix2, y: iy2 });
          }
        }
      }
    }
    return crossings;
  }

  /** Draw crossing arc bridges — small bump where one line hops over the other */
  function drawCrossings() {
    var crossings = _crossingsCache;
    if (!crossings || crossings.length === 0) return;
    ctx.save();
    var R = 5; /* bridge radius */
    for (var i = 0; i < crossings.length; i++) {
      var cr = crossings[i];
      /* Erase crossing area with background colour */
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(cr.x - R, cr.y - R, R * 2, R * 2);
      /* Draw a small semi-circle bridge (hop) over the crossing */
      ctx.strokeStyle = '#6a7a9a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cr.x, cr.y, R, Math.PI, 0, false); /* top half arc */
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Identify which crossbar segment of a connection path is draggable.
   *  Returns { segIdx, axis } or null.
   *  crossbar = middle segment(s) between stub segments */
  /**
   * Hit-test ANY draggable segment of ANY connection.
   * Returns { connIdx, segIdx, axis } or null.
   * Skips the first segment (port→stub) and last segment (stub→port).
   */
  function hitTestSegment(mx, my, threshold) {
    threshold = (threshold || 8) * _touchScale();
    for (var i = connections.length - 1; i >= 0; i--) {
      var path = _pathCache[i];
      if (!path || path.length < 4) continue;
      /* Test segments from index 2 to path.length-3 (skip port↔stub at both ends) */
      for (var s = 2; s < path.length - 1; s++) {
        var a = path[s - 1], b = path[s];
        var isH = Math.abs(a.y - b.y) < 1;
        var isV = Math.abs(a.x - b.x) < 1;
        if (!isH && !isV) continue;
        var segLen = Math.abs(isH ? (b.x - a.x) : (b.y - a.y));
        if (segLen < 5) continue; /* skip tiny segments */
        var d = pointToSegmentDist(mx, my, a.x, a.y, b.x, b.y);
        if (d < threshold) {
          return { connIdx: i, segIdx: s, axis: isH ? 'y' : 'x' };
        }
      }
    }
    return null;
  }

  /**
   * Convert an auto-routed connection to waypoint-based by capturing its current path.
   * This allows per-segment dragging to modify individual waypoints.
   */
  function convertToWaypoints(connIdx) {
    var conn = connections[connIdx];
    if (conn.waypoints && conn.waypoints.length > 0) return;
    var path = _pathCache[connIdx];
    if (!path || path.length < 4) return;
    /* Extract middle points: skip [0]=port, [1]=stub, [last-1]=stub, [last]=port */
    conn.waypoints = [];
    for (var i = 2; i < path.length - 2; i++) {
      conn.waypoints.push({ x: path[i].x, y: path[i].y });
    }
    delete conn._dragOffset;
    delete conn._autoNudge;
  }

    /* ── Draw connection with smart routing ── */

 function drawConnection(conn, connIdx, isHovered, isSelected) {
  var path = _pathCache[connIdx] || getConnectionPath(conn);
  if (!path) return;

  var pressure = conn.pressure || 0;
  var flow = conn.flow || 0;
  var flowDir = conn.flowDir || 0;
  
  // ── Color según presión ──
  if (running && pressure > 10) {
    ctx.strokeStyle = '#ff4444';
  } else if (running && pressure > 0) {
    ctx.strokeStyle = '#4488ff';
  } else {
    ctx.strokeStyle = '#3a4a6a';
  }
  var baseWidth = running ? 3 : 2;

  if (isSelected) {
    ctx.strokeStyle = '#00e5ff';
    baseWidth = 4;
  } else if (isHovered && !running) {
    ctx.strokeStyle = '#5599cc';
    baseWidth = 3;
  }

  // ── Dibujar la línea ──
  ctx.lineWidth = baseWidth;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (var i = 1; i < path.length; i++) {
    ctx.lineTo(path[i].x, path[i].y);
  }
  ctx.stroke();

  if (isSelected) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,229,255,0.2)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (var j = 1; j < path.length; j++) {
      ctx.lineTo(path[j].x, path[j].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════
  // ║  MOSTRAR ETIQUETAS DE PRESIÓN Y FLUJO                  ║
  // ║  SOLO si showLabels es true                           ║
  // ════════════════════════════════════════════════════════════
  
  // ← USAR showLabels GLOBAL
  if (running && showLabels && (pressure > 0.5 || flow > 0.1)) {
    // Encontrar el punto medio del camino
    var totalLen = 0;
    var segLengths = [];
    for (var i = 1; i < path.length; i++) {
      var dx = path[i].x - path[i-1].x;
      var dy = path[i].y - path[i-1].y;
      var len = Math.sqrt(dx*dx + dy*dy);
      segLengths.push(len);
      totalLen += len;
    }
    
    if (totalLen > 0) {
      var targetDist = totalLen / 2;
      var accumulated = 0;
      var midX = path[0].x, midY = path[0].y;
      
      for (var i = 0; i < segLengths.length; i++) {
        if (accumulated + segLengths[i] >= targetDist) {
          var t = (targetDist - accumulated) / (segLengths[i] || 1);
          midX = path[i].x + (path[i+1].x - path[i].x) * t;
          midY = path[i].y + (path[i+1].y - path[i].y) * t;
          break;
        }
        accumulated += segLengths[i];
      }
      
      var angle = 0;
      if (path.length > 1) {
        var last = path.length - 1;
        angle = Math.atan2(path[last].y - path[0].y, path[last].x - path[0].x);
      }
      
      var labelText = fmtUnitDisp('pressure', pressure);
      var flowText = fmtUnitDisp('flow', flow);
      
      ctx.save();
      
      ctx.font = 'bold 9px ' + _fontFamily;
      var labelWidth = ctx.measureText(labelText).width;
      var flowWidth = ctx.measureText(flowText).width;
      var maxWidth = Math.max(labelWidth, flowWidth) + 16;
      var totalHeight = 28;
      
      var perpAngle = angle + Math.PI / 2;
      var offset = 18;
      
      var labelX = midX + Math.cos(perpAngle) * offset;
      var labelY = midY + Math.sin(perpAngle) * offset;
      
      var margin = 10;
      var halfW = maxWidth / 2;
      if (labelX - halfW < margin) labelX = margin + halfW;
      if (labelX + halfW > W - margin) labelX = W - margin - halfW;
      if (labelY - totalHeight/2 < margin) labelY = margin + totalHeight/2;
      if (labelY + totalHeight/2 > H - margin) labelY = H - margin - totalHeight/2;
      
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      ctx.fillStyle = 'rgba(10,14,20,0.88)';
      ctx.strokeStyle = pressure > 10 ? 'rgba(255,68,68,0.4)' : 'rgba(68,136,255,0.4)';
      ctx.lineWidth = 1;
      
      var bx = labelX - maxWidth/2;
      var by = labelY - totalHeight/2;
      var borderRadius = 4;
      
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(bx, by, maxWidth, totalHeight, borderRadius);
      } else {
        ctx.rect(bx, by, maxWidth, totalHeight);
      }
      ctx.fill();
      ctx.stroke();
      
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      var pressureColor;
      if (pressure > 100) pressureColor = '#ff4444';
      else if (pressure > 50) pressureColor = '#ff8844';
      else if (pressure > 10) pressureColor = '#ffbb33';
      else pressureColor = '#4488ff';
      
      ctx.font = 'bold 8px ' + _fontFamily;
      ctx.fillStyle = pressureColor;
      ctx.fillText(labelText, labelX, labelY - 5);
      
      ctx.font = '7px ' + _fontFamily;
      ctx.fillStyle = '#88aacc';
      ctx.fillText(flowText, labelX, labelY + 7);
      
      if (flow > 0.5 && Math.abs(flowDir) > 0) {
        var arrowAngle = angle + (flowDir > 0 ? 0 : Math.PI);
        var ax = midX + Math.cos(perpAngle) * (offset + totalHeight/2 + 4);
        var ay = midY + Math.sin(perpAngle) * (offset + totalHeight/2 + 4);
        
        ctx.strokeStyle = 'rgba(100,180,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax - 4, ay - 3);
        ctx.lineTo(ax, ay + 1);
        ctx.lineTo(ax + 4, ay - 3);
        ctx.stroke();
      }
      
      ctx.restore();
    }
  }
}

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      /* Skip particles on dead (unpressurised) connections */
      var conn = connections[p.connIdx];
      if (!conn || conn.pressure <= 0) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = p.pressure > 10 ? '#ff6666' : '#6699ff';
      ctx.fill();
    }
  }

  function drawComponent(comp) {
  var def = COMP_DEFS[comp.type];
  if (!def) return;
  var x = comp.x, y = comp.y;
  var isSelected = (selectedComp && selectedComp.id === comp.id);
  var ed = getEffectiveDims(comp);

  ctx.save();
  ctx.translate(x, y);

  /* Selection highlight — drawn in effective (rotated) space */
  if (isSelected) {
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(-4, -4, ed.w + 8, ed.h + 8);
    ctx.setLineDash([]);
  }

  /* ============================================================
     NUEVA ROTACIÓN: soporta 0°, 90°, 180°, 270°
     ============================================================ */
  if (comp.orient) {
    var angle = comp.orient * Math.PI / 2; // 0, π/2, π, 3π/2
    ctx.save();
    // Rotar alrededor del centro del componente
    ctx.translate(def.w / 2, def.h / 2);
    ctx.rotate(angle);
    ctx.translate(-def.w / 2, -def.h / 2);
  }

  /* Draw the ISO-style symbol based on type (always in original w×h space) */
  switch (comp.type) {
    case 'pump': drawPumpSymbol(def.w, def.h, comp); break;
    case 'relief': drawReliefSymbol(def.w, def.h, comp); break;
    case 'dcv43': drawDCV43Symbol(def.w, def.h, comp); break;
    case 'poclain-ms35': drawPoclainMS35Symbol(def.w, def.h, comp); break;
    case 'dcv32': drawDCV32Symbol(def.w, def.h, comp); break;
    case 'check': drawCheckSymbol(def.w, def.h); break;
    case 'flow-control': drawFlowControlSymbol(def.w, def.h); break;
    case 'cylinder-sa': drawCylinderSASymbol(def.w, def.h, comp); break;
    case 'cylinder-da': drawCylinderDASymbol(def.w, def.h, comp); break;
    case 'motor': drawMotorSymbol(def.w, def.h, comp); break;
    case 'gauge': drawGaugeSymbol(def.w, def.h, comp); break;
    case 'filter': drawFilterSymbol(def.w, def.h); break;
    case 'tee': drawTeeSymbol(def.w, def.h); break;
    case 'shuttle': drawShuttleSymbol(def.w, def.h); break;
    case 'valve22': drawValve22Symbol(def.w, def.h, comp); break;
    case 'pressure-reducing': drawPressureReducingSymbol(def.w, def.h, comp); break;
    case 'sequence-valve': drawSequenceValveSymbol(def.w, def.h, comp); break;
    case 'counterbalance': drawCounterbalanceSymbol(def.w, def.h, comp); break;
    case 'accumulator': drawAccumulatorSymbol(def.w, def.h, comp); break;
    case 'throttle': drawThrottleSymbol(def.w, def.h); break;
    case 'flow-meter': drawFlowMeterSymbol(def.w, def.h, comp); break;
    case 'pilot-check': drawPilotCheckSymbol(def.w, def.h); break;
    case 'engine': drawEngineSymbol(def.w, def.h, comp); break;
    case 'pump-drive': drawPumpDriveSymbol(def.w, def.h, comp); break;
    case 'pump-var-displacement': drawPumpVarDisplacementSymbol(def.w, def.h, comp); break;
    /* Tier 1 */
    case 'reservoir': drawReservoirSymbol(def.w, def.h, comp); break;
    case 'cooler': drawCoolerSymbol(def.w, def.h, comp); break;
    case 'flow-comp': drawFlowCompSymbol(def.w, def.h, comp); break;
    case 'pressure-switch': drawPressureSwitchSymbol(def.w, def.h, comp); break;
    case 'and-valve': drawANDValveSymbol(def.w, def.h); break;
    case 'unloading': drawUnloadingSymbol(def.w, def.h, comp); break;
    case 'dcv42': drawDCV42Symbol(def.w, def.h, comp); break;
    case 'dcv52': drawDCV52Symbol(def.w, def.h, comp); break;
    case 'dcv53': drawDCV53Symbol(def.w, def.h, comp); break;
    /* Sprint 3 */
    case 'dcv32no':   drawDCV32NOSymbol(def.w, def.h, comp); break;
    case 'valve22no': drawValve22NOSymbol(def.w, def.h, comp); break;
    case 'intensifier': drawIntensifierSymbol(def.w, def.h, comp); break;
    /* Tier 2 */
    case 'rotary-act': drawRotaryActSymbol(def.w, def.h, comp); break;
    case 'prop-dcv': drawPropDCVSymbol(def.w, def.h, comp); break;
    case 'prop-relief': drawPropReliefSymbol(def.w, def.h, comp); break;
    case 'prop-flow': drawPropFlowSymbol(def.w, def.h, comp); break;
    case 'pump-var': drawPumpVarSymbol(def.w, def.h, comp); break;
    case 'motor-bidir': drawMotorBidirSymbol(def.w, def.h, comp); break;
    /* Tier 3 */
    case 'temp-gauge': drawTempGaugeSymbol(def.w, def.h, comp); break;
    case 'heater': drawHeaterSymbol(def.w, def.h, comp); break;
    case 'pressure-transducer': drawPressureTransducerSymbol(def.w, def.h, comp); break;
    case 'cylinder-telescopic': drawTelescopicCylSymbol(def.w, def.h, comp); break;
    case 'limit-switch-hyd': drawLimitSwitchHydSymbol(def.w, def.h, comp); break;
    /* Tier 4 */
    case 'orifice':      drawOrificeSymbol(def.w, def.h, comp); break;
    case 'flow-check':   drawFlowCheckSymbol(def.w, def.h, comp); break;
    case 'check-spring': drawSpringCheckSymbol(def.w, def.h, comp); break;
    /* Tier 5 */
    case 'priority':     drawPriorityValveSymbol(def.w, def.h, comp); break;
    case 'flow-divider': drawFlowDividerSymbol(def.w, def.h, comp); break;
    case 'pump-hand':    drawHandPumpSymbol(def.w, def.h, comp); break;
  }

  /* Undo rotation before drawing ports and label */
  if (comp.orient) {
    ctx.restore();
  }

  /* Draw ports at rotated positions */
  var showPortLabels = isSelected || (hoveredCompId === comp.id) || (connectingFrom != null);
  for (var p = 0; p < def.ports.length; p++) {
    var port = getRotatedPort(def, p, comp.orient); // ← AHORA SOPORTA 0-3
    var portDef = def.ports[p];
    var isHovered = (hoveredPort && hoveredPort.compId === comp.id && hoveredPort.portIdx === p);
    var isConnecting = (connectingFrom && connectingFrom.compId === comp.id && connectingFrom.portIdx === p);
    var isTank = isTankPort(comp.type, portDef && portDef.label);
    ctx.beginPath();
    ctx.arc(port.x, port.y, isHovered ? 6 : 4, 0, Math.PI * 2);
    if (isConnecting) {
      ctx.fillStyle = '#ff9900';
    } else if (isTank) {
      ctx.fillStyle = isHovered ? '#ffb86c' : '#cd7f32';
    } else {
      ctx.fillStyle = isHovered ? '#00e5ff' : '#00bcd4';
    }
    ctx.fill();
    ctx.strokeStyle = '#0a0e14';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* Port label */
    if (showPortLabels && port.label) {
      ctx.save();
      ctx.font = 'bold 8px ' + _fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var lx = port.x, ly = port.y;
      var lDir = port.dir;
      if (lDir === 'up') { ly -= 10; }
      else if (lDir === 'down') { ly += 10; }
      else if (lDir === 'left') { lx -= 12; }
      else if (lDir === 'right') { lx += 12; }
      var tw = ctx.measureText(port.label).width + 6;
      ctx.fillStyle = 'rgba(10,14,20,0.85)';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(lx - tw / 2, ly - 6, tw, 12, 3);
      } else {
        ctx.rect(lx - tw / 2, ly - 6, tw, 12);
      }
      ctx.fill();
      ctx.fillStyle = isHovered ? '#00e5ff' : '#00bcd4';
      ctx.fillText(port.label, lx, ly);
      ctx.restore();
    }
  }

  /* Label — always upright, centered under effective bounding box */
  ctx.fillStyle = '#8899bb';
  ctx.font = '9px ' + _fontFamily;
  ctx.textAlign = 'center';
  ctx.fillText(def.name, ed.w / 2, ed.h + 14);

  ctx.restore();
}

  function drawPumpSymbol(w, h, comp) {
    /* Power Unit: Motor (left) + Pump (center-top) + Tank/Reservoir (right) */
    var pumpCX = w / 2, pumpCY = 18;

    /* ── Motor (electric) — left side circle with "M" ── */
    var motCX = 14, motCY = 18;
    ctx.beginPath();
    ctx.arc(motCX, motCY, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2535';
    ctx.fill();
    ctx.strokeStyle = running ? '#66bb6a' : '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = running ? '#66bb6a' : '#aabbdd';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', motCX, motCY);

    /* ── Coupling line from motor to pump ── */
    ctx.strokeStyle = '#4a6a8a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(motCX + 12, motCY);
    ctx.lineTo(pumpCX - 14, pumpCY);
    ctx.stroke();

    /* ── Pump circle with triangle ── */
    ctx.beginPath();
    ctx.arc(pumpCX, pumpCY, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2535';
    ctx.fill();
    ctx.strokeStyle = running ? '#ff6666' : '#5a8ab5';
    ctx.lineWidth = 2;
    ctx.stroke();
    /* Triangle (flow direction — pointing up) */
    ctx.beginPath();
    ctx.moveTo(pumpCX, pumpCY - 9);
    ctx.lineTo(pumpCX - 7, pumpCY + 5);
    ctx.lineTo(pumpCX + 7, pumpCY + 5);
    ctx.closePath();
    ctx.fillStyle = running ? '#ff4444' : '#5a8ab5';
    ctx.fill();

    /* ── Tank / Reservoir — right side (ISO symbol: open-top trapezoid) ── */
    var tkCX = w - 14, tkTop = 8, tkBot = 28;
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#4a6a8a';
    ctx.lineWidth = 1.5;
    /* Trapezoid reservoir shape */
    ctx.beginPath();
    ctx.moveTo(tkCX - 12, tkTop);
    ctx.lineTo(tkCX + 12, tkTop);
    ctx.lineTo(tkCX + 10, tkBot);
    ctx.lineTo(tkCX - 10, tkBot);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    /* Oil level line inside tank */
    ctx.strokeStyle = '#3388cc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tkCX - 8, tkTop + 7);
    ctx.lineTo(tkCX + 8, tkTop + 7);
    ctx.stroke();
    /* "T" label */
    ctx.fillStyle = '#3388cc';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', tkCX, tkTop + 16);

    /* ── Return line from tank to pump suction ── */
    ctx.strokeStyle = '#4a6a8a';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(tkCX - 10, tkBot);
    ctx.lineTo(pumpCX + 14, pumpCY + 4);
    ctx.stroke();
    ctx.setLineDash([]);

    /* ── Labels below ── */
    ctx.fillStyle = '#667799';
    ctx.font = '7px sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText('Motor', motCX, h - 16);
    ctx.fillText('Pump', pumpCX, h - 16);
    ctx.fillText('Tank', tkCX, h - 16);
    ctx.textBaseline = 'alphabetic';
  }

  function drawReliefSymbol(w, h, comp) {
    var cx = w / 2;
    /* Active glow when relief is dumping flow */
    if (running && comp._reliefActive) {
      ctx.save();
      ctx.shadowColor = '#ff6600';
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(255,102,0,0.15)';
      ctx.fillRect(2, 6, w - 4, h - 12);
      ctx.restore();
    }
    /* Rectangle body */
    ctx.fillStyle = comp._reliefActive ? '#2a1a10' : '#1a2535';
    ctx.strokeStyle = comp._reliefActive ? '#ff8833' : '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.fillRect(4, 8, w - 8, h - 16);
    ctx.strokeRect(4, 8, w - 8, h - 16);
    /* Arrow (pressure direction) */
    ctx.beginPath();
    ctx.moveTo(cx, h - 12);
    ctx.lineTo(cx, 14);
    ctx.strokeStyle = '#ff6666';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 5, 20);
    ctx.lineTo(cx, 12);
    ctx.lineTo(cx + 5, 20);
    ctx.fillStyle = '#ff6666';
    ctx.fill();
    /* Spring zigzag */
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 8, 14);
    for (var zz = 0; zz < 3; zz++) {
      ctx.lineTo(cx + 14, 17 + zz * 8);
      ctx.lineTo(cx + 8, 21 + zz * 8);
    }
    ctx.stroke();
  }

  /*
   * drawDcvEndActuation — draw ISO 1219 actuation end symbols outside a DCV box.
   *   edgeX  : x coordinate of the nearest box edge
   *   side   : 'L' (draws leftward from edgeX) | 'R' (rightward)
   *   type   : 'Solenoid' | 'Pilot' | 'Lever' | 'Manual' | 'None'
   *   hasSpring : draw spring-return zigzag first (before the actuator)
   *   h      : component height (used for vertical centering)
   */
  function drawDcvEndActuation(edgeX, side, type, hasSpring, h) {
    var cy = h / 2;
    var dir = (side === 'L') ? -1 : 1;   /* -1 = grow left, +1 = grow right */
    var cur = edgeX;                       /* current drawing cursor (x) */

    ctx.save();
    ctx.lineWidth = 1.2;

    /* ── Spring zigzag (spring-return / spring-centred) ────────────── */
    if (hasSpring) {
      var spLen = 14, amp = 3.5, peaks = 5;
      var stepX = spLen / (peaks * 2);
      ctx.strokeStyle = '#7a9ab5';
      ctx.beginPath();
      ctx.moveTo(cur, cy);
      for (var i = 0; i < peaks * 2; i++) {
        cur += dir * stepX;
        ctx.lineTo(cur, cy + (i % 2 === 0 ? amp : -amp));
      }
      ctx.lineTo(cur + dir * stepX * 0.5, cy);
      cur += dir * stepX * 0.5;
      ctx.stroke();
      /* End bar of spring */
      ctx.beginPath();
      ctx.moveTo(cur, cy - amp - 1);
      ctx.lineTo(cur, cy + amp + 1);
      ctx.stroke();
      cur += dir * 2;
    }

    /* ── Actuator symbol ────────────────────────────────────────────── */
    if (type === 'Solenoid') {
      /* Rectangle with diagonal slash */
      var sw = 12, sh = h * 0.62;
      var rx = (side === 'L') ? cur - sw : cur;
      var ry = cy - sh / 2;
      ctx.fillStyle = 'rgba(0,188,212,0.18)';
      ctx.strokeStyle = '#00bcd4';
      ctx.lineWidth = 1.2;
      ctx.fillRect(rx, ry, sw, sh);
      ctx.strokeRect(rx, ry, sw, sh);
      /* Diagonal slash */
      ctx.beginPath();
      ctx.moveTo(rx + 2, ry + sh - 2);
      ctx.lineTo(rx + sw - 2, ry + 2);
      ctx.stroke();

    } else if (type === 'Pilot') {
      /* Filled triangle pointing INTO the box + dashed pilot line */
      var tSize = 9;
      var tipX = edgeX;   /* tip of triangle touches box edge */
      var baseX = tipX + dir * tSize;
      ctx.fillStyle = '#5ab0e0';
      ctx.strokeStyle = '#5ab0e0';
      ctx.beginPath();
      ctx.moveTo(tipX, cy);
      ctx.lineTo(baseX, cy - tSize / 2);
      ctx.lineTo(baseX, cy + tSize / 2);
      ctx.closePath();
      ctx.fill();
      /* Dashed pilot line extending outward */
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = '#5ab0e0';
      ctx.beginPath();
      ctx.moveTo(baseX, cy);
      ctx.lineTo(baseX + dir * 10, cy);
      ctx.stroke();
      ctx.setLineDash([]);

    } else if (type === 'Lever') {
      /* Pivot circle + angled arm */
      var pivR = 3.5;
      var pivX = cur + dir * pivR;
      ctx.strokeStyle = '#a0b8d0';
      ctx.fillStyle = '#1a2535';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(pivX, cy, pivR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      /* Arm from top of pivot outward-and-up */
      var armEndX = pivX + dir * 10;
      var armEndY = cy - 10;
      ctx.strokeStyle = '#a0b8d0';
      ctx.beginPath();
      ctx.moveTo(pivX, cy - pivR);
      ctx.lineTo(armEndX, armEndY);
      ctx.stroke();
      /* Small crossbar at arm end */
      ctx.beginPath();
      ctx.moveTo(armEndX - 3, armEndY);
      ctx.lineTo(armEndX + 3, armEndY);
      ctx.stroke();

    } else if (type === 'Manual') {
      /* T-stem: vertical bar + horizontal cap */
      var stemH = 10, capW = 8;
      var stemX = cur + dir * 3;
      ctx.strokeStyle = '#a0b8d0';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(stemX, cy);
      ctx.lineTo(stemX, cy - stemH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(stemX - capW / 2, cy - stemH);
      ctx.lineTo(stemX + capW / 2, cy - stemH);
      ctx.stroke();

    } else if (type === 'Detent') {
      /* Two short parallel vertical lines with V-notch pawl — ISO 1219 detent */
      var dW = 7, dHalf = h * 0.22;
      var d1X = cur + dir * 3;
      var d2X = d1X + dir * dW;
      ctx.strokeStyle = '#a0b8d0'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(d1X, cy - dHalf); ctx.lineTo(d1X, cy + dHalf);
      ctx.moveTo(d2X, cy - dHalf); ctx.lineTo(d2X, cy + dHalf);
      ctx.stroke();
      /* V-notch pawl between the two lines */
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(d1X + dir * 1.5, cy - 4);
      ctx.lineTo((d1X + d2X) / 2, cy + 3);
      ctx.lineTo(d2X - dir * 1.5, cy - 4);
      ctx.stroke();

    } else if (type === 'Roller') {
      /* Pivot circle + arm + open roller circle at tip */
      var rolPivR = 3.5;
      var rolPivX = cur + dir * rolPivR;
      ctx.strokeStyle = '#a0b8d0';
      ctx.fillStyle = '#1a2535';
      ctx.lineWidth = 1.2;
      /* Pivot circle */
      ctx.beginPath();
      ctx.arc(rolPivX, cy, rolPivR, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      /* Arm extending diagonally outward-and-up */
      var rolArmX = rolPivX + dir * 9;
      var rolArmY = cy - 8;
      ctx.strokeStyle = '#a0b8d0';
      ctx.beginPath();
      ctx.moveTo(rolPivX, cy - rolPivR);
      ctx.lineTo(rolArmX, rolArmY);
      ctx.stroke();
      /* Roller = open circle at tip */
      var rolR = 4;
      ctx.fillStyle = '#1a2535';
      ctx.beginPath();
      ctx.arc(rolArmX, rolArmY - rolR, rolR, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    /* type === 'None': spring only (already drawn above) */

    ctx.restore();
  }

  function drawDCV43Symbol(w, h, comp) {
    var pos  = (comp.values && comp.values.position)   || 'Center';
    var ct   = (comp.values && comp.values.centerType) || 'Closed';
    /* Backward-compat: if old 'actuation' param still present use it for both sides */
    var _actOld = (comp.values && comp.values.actuation) || 'Solenoid';
    var actL = (comp.values && comp.values.actuationL) || _actOld;
    var actR = (comp.values && comp.values.actuationR) || _actOld;
    var isHov = (hoveredDcv && hoveredDcv.id === comp.id);
    var bw = w / 3;
    /* Hover glow */
    if (isHov) { ctx.shadowColor = '#00bcd4'; ctx.shadowBlur = 10; }
    for (var b = 0; b < 3; b++) {
      var bx = b * bw;
      var isActive = (pos === 'Extend' && b === 0) || (pos === 'Center' && b === 1) || (pos === 'Retract' && b === 2);
      ctx.fillStyle = isActive ? 'rgba(0,188,212,0.15)' : '#1a2535';
      ctx.strokeStyle = isActive ? '#00bcd4' : '#4a6a8a';
      ctx.lineWidth = isActive ? 2 : 1.5;
      ctx.fillRect(bx + 1, 1, bw - 2, h - 2);
      ctx.strokeRect(bx + 1, 1, bw - 2, h - 2);
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1;
    /* ── Center box: varies with center type ── */
    var cmx = bw + bw / 2;
    if (ct === 'Tandem') {
      /* P→T straight through (vertical center) */
      drawSmallArrow(cmx, h - 10, cmx, 10, '#5a8ab5');
    } else if (ct === 'Open') {
      /* All→T: P up + A/B down to center horizontal bar */
      ctx.beginPath();
      ctx.moveTo(cmx, h - 10); ctx.lineTo(cmx, h / 2);
      ctx.moveTo(cmx - 7, 10); ctx.lineTo(cmx - 7, h / 2);
      ctx.moveTo(cmx + 7, 10); ctx.lineTo(cmx + 7, h / 2);
      ctx.moveTo(cmx - 7, h / 2); ctx.lineTo(cmx + 7, h / 2);
      ctx.stroke();
    } else if (ct === 'Float') {
      /* A,B→T; P blocked: horizontal bar + down arrows on A/B sides */
      ctx.beginPath();
      ctx.moveTo(cmx - 7, 10); ctx.lineTo(cmx - 7, h / 2);
      ctx.moveTo(cmx + 7, 10); ctx.lineTo(cmx + 7, h / 2);
      ctx.moveTo(cmx - 7, h / 2); ctx.lineTo(cmx + 7, h / 2);
      ctx.stroke();
      /* P stub blocked */
      ctx.beginPath();
      ctx.moveTo(cmx - 3, h - 8); ctx.lineTo(cmx + 3, h - 8);
      ctx.stroke();
    } else {
      /* Closed: X */
      ctx.beginPath();
      ctx.moveTo(cmx - 7, 10); ctx.lineTo(cmx + 7, h - 10);
      ctx.moveTo(cmx + 7, 10); ctx.lineTo(cmx - 7, h - 10);
      ctx.stroke();
    }
    /* Port labels */
    ctx.fillStyle = '#6b7a99'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('P', 20, h + 10); ctx.fillText('T', 60, h + 10);
    ctx.fillText('A', 20, -3);    ctx.fillText('B', 60, -3);
    /* Extend box: P→A (up) and B→T (down) */
    drawSmallArrow(bw * 0.33, h - 10, bw * 0.33, 10, '#5a8ab5');  /* P→A */
    drawSmallArrow(bw * 0.67, 10, bw * 0.67, h - 10, '#5a8ab5');  /* B→T */
    /* Retract box: crossing arrows (P→B and A→T) */
    drawSmallArrow(2 * bw + bw * 0.33, h - 10, 2 * bw + bw * 0.67, 10, '#5a8ab5'); /* P→B */
    drawSmallArrow(2 * bw + bw * 0.67, 10, 2 * bw + bw * 0.33, h - 10, '#5a8ab5'); /* A→T */
    /* ── ISO 1219 Actuation end symbols (spring-centred: springs always on both sides) ── */
    drawDcvEndActuation(1, 'L', actL, true, h);
    drawDcvEndActuation(w - 1, 'R', actR, true, h);
    /* ── Lever indicator bar ── */
    var leverY = -10;
    var leverW = w - 4;
    var leverH = 5;
    ctx.fillStyle = '#101828';
    ctx.fillRect(2, leverY, leverW, leverH);
    ctx.strokeStyle = '#3a4a6a'; ctx.lineWidth = 1;
    ctx.strokeRect(2, leverY, leverW, leverH);
    ctx.fillStyle = '#4a6080'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('E', bw / 2, leverY - 2);
    ctx.fillText('C', w / 2, leverY - 2);
    ctx.fillText('R', w - bw / 2, leverY - 2);
    var leverX, leverCol;
    if (pos === 'Extend')       { leverX = bw / 2;       leverCol = '#3ddc84'; }
    else if (pos === 'Retract') { leverX = w - bw / 2;   leverCol = '#ff6666'; }
    else                        { leverX = w / 2;         leverCol = '#ffbb33'; }
    ctx.fillStyle = leverCol;
    ctx.fillRect(leverX - 8, leverY - 1, 16, leverH + 2);
    ctx.fillStyle = '#0a0e14'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    if (pos === 'Extend')       ctx.fillText('\u25C0', leverX, leverY + 4);
    else if (pos === 'Retract') ctx.fillText('\u25B6', leverX, leverY + 4);
    else                        ctx.fillText('\u25CF', leverX, leverY + 4);
  }

  function drawDCV32Symbol(w, h, comp) {
    var pos  = (comp.values && comp.values.position) || 'Closed';
    var _actOld32 = (comp.values && comp.values.actuation) || 'Solenoid';
    var actL = (comp.values && comp.values.actuationL) || _actOld32;
    var actR = (comp.values && comp.values.actuationR) || 'Spring';
    var isHov = (hoveredDcv && hoveredDcv.id === comp.id);
    var bw = w / 2;
    if (isHov) { ctx.shadowColor = '#00bcd4'; ctx.shadowBlur = 10; }
    for (var b = 0; b < 2; b++) {
      var bx = b * bw;
      var isActive = (pos === 'Open' && b === 0) || (pos === 'Closed' && b === 1);
      ctx.fillStyle = isActive ? 'rgba(0,188,212,0.15)' : '#1a2535';
      ctx.strokeStyle = isActive ? '#00bcd4' : '#4a6a8a';
      ctx.lineWidth = isActive ? 2 : 1.5;
      ctx.fillRect(bx + 1, 1, bw - 2, h - 2);
      ctx.strokeRect(bx + 1, 1, bw - 2, h - 2);
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    /* Open box: P→A (arrow up from centre) */
    drawSmallArrow(bw / 2, h - 10, bw / 2, 10, '#5a8ab5');
    /* Closed box: blocked (X) */
    var cx2 = bw + bw / 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx2 - 7, 10); ctx.lineTo(cx2 + 7, h - 10);
    ctx.moveTo(cx2 + 7, 10); ctx.lineTo(cx2 - 7, h - 10);
    ctx.stroke();
    ctx.fillStyle = '#6b7a99'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('P', 15, h + 10); ctx.fillText('T', 45, h + 10); ctx.fillText('A', 30, -3);
    /* ── ISO 1219 Actuation (left=actuator; right = spring / detent / another actuator) ── */
    drawDcvEndActuation(1,     'L', actL, false, h);
    var rSpr32 = (actR === 'Spring'), rDet32 = (actR === 'Detent');
    drawDcvEndActuation(w - 1, 'R', rSpr32 ? 'None' : actR, rSpr32, h);
    /* ── Lever indicator bar (DCV 3/2) ── */
    var leverY = -10; var leverW = w - 4; var leverH = 5;
    ctx.fillStyle = '#101828';
    ctx.fillRect(2, leverY, leverW, leverH);
    ctx.strokeStyle = '#3a4a6a'; ctx.lineWidth = 1;
    ctx.strokeRect(2, leverY, leverW, leverH);
    ctx.fillStyle = '#4a6080'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('O', bw / 2, leverY - 2);
    ctx.fillText('C', w - bw / 2, leverY - 2);
    var leverX = pos === 'Open' ? bw / 2 : w - bw / 2;
    var leverCol = pos === 'Open' ? '#3ddc84' : '#ff6666';
    ctx.fillStyle = leverCol;
    ctx.fillRect(leverX - 8, leverY - 1, 16, leverH + 2);
    ctx.fillStyle = '#0a0e14'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(pos === 'Open' ? '\u25C0' : '\u25B6', leverX, leverY + 4);
  }

  function drawSmallArrow(x1, y1, x2, y2, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    var angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 5 * Math.cos(angle - 0.4), y2 - 5 * Math.sin(angle - 0.4));
    ctx.lineTo(x2 - 5 * Math.cos(angle + 0.4), y2 - 5 * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawCheckSymbol(w, h) {
    var cx = w / 2;
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    /* Vertical line */
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    /* Triangle */
    ctx.beginPath();
    ctx.moveTo(cx - 8, h / 2 + 5);
    ctx.lineTo(cx, h / 2 - 8);
    ctx.lineTo(cx + 8, h / 2 + 5);
    ctx.closePath();
    ctx.fillStyle = '#2a4060';
    ctx.fill();
    ctx.stroke();
    /* Horizontal bar */
    ctx.beginPath();
    ctx.moveTo(cx - 8, h / 2 - 8);
    ctx.lineTo(cx + 8, h / 2 - 8);
    ctx.stroke();
  }

  function drawFlowControlSymbol(w, h) {
    var cx = w / 2;
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    /* Vertical line */
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    /* Variable orifice */
    ctx.beginPath();
    ctx.moveTo(cx - 10, h / 2 - 8);
    ctx.lineTo(cx + 10, h / 2 + 8);
    ctx.moveTo(cx - 10, h / 2 + 8);
    ctx.lineTo(cx + 10, h / 2 - 8);
    ctx.stroke();
    /* Diagonal arrow through */
    ctx.beginPath();
    ctx.moveTo(cx - 12, h / 2 + 12);
    ctx.lineTo(cx + 12, h / 2 - 12);
    ctx.stroke();
    drawSmallArrow(cx + 6, h / 2 - 6, cx + 12, h / 2 - 12, '#5a8ab5');
  }

  function drawCylinderSASymbol(w, h, comp) {
    /* ── FluidSIM style: rod protrudes out of right end as piston extends ── */
    var bodyH = 36, barrelW = 62, capW = 18;
    var rodH = 12, rodY = Math.floor((bodyH - rodH) / 2); /* = 12 */
    var pistonMin = capW + 3, pistonMax = barrelW - 5;
    var ext = comp.extension || 0;
    var px = Math.round(pistonMin + (pistonMax - pistonMin) * ext);
    var portAX = Math.floor(capW / 2); /* = 9 */

    /* Rod tip: tiny stub when retracted, reaches w when fully extended */
    var rodTip = Math.round((barrelW + 3) + (w - 4 - (barrelW + 3)) * ext);

    /* ── 1. Dark barrel background ── */
    ctx.fillStyle = '#0d1625';
    ctx.fillRect(1, 1, barrelW - 2, bodyH - 2);

    /* ── 2. Oil fill (cap side) ── */
    if (running && ext > 0.02) {
      ctx.fillStyle = 'rgba(255,68,68,0.25)';
      ctx.fillRect(2, 1, px - 2, bodyH - 2);
    }

    /* ── 3. Spring on rod-side of piston (inside barrel only) ── */
    var spLeft = px + 3, spRight = barrelW - 3;
    if (spRight > spLeft + 10) {
      var spMidY = bodyH / 2, spAmp = 5, spSegs = 5;
      ctx.beginPath();
      ctx.strokeStyle = '#5577aa';
      ctx.lineWidth = 1;
      ctx.moveTo(spLeft, spMidY);
      for (var ss = 0; ss < spSegs; ss++) {
        var sx1 = spLeft + (spRight - spLeft) * (ss + 0.5) / spSegs;
        var sx2 = spLeft + (spRight - spLeft) * (ss + 1) / spSegs;
        ctx.lineTo(sx1, spMidY + (ss % 2 === 0 ? spAmp : -spAmp));
        ctx.lineTo(sx2, spMidY);
      }
      ctx.stroke();
    }

    /* ── 4. Rod rectangle: piston to dynamic tip (protrudes outside barrel) ── */
    ctx.fillStyle = '#2a3a50';
    ctx.fillRect(px, rodY, rodTip - px, rodH);
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px, rodY, rodTip - px, rodH);

    /* ── 5. Barrel outline drawn OVER oil fill and inner rod section ── */
    ctx.beginPath();
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, 0);      ctx.lineTo(barrelW, 0);      /* top */
    ctx.moveTo(0, 0);      ctx.lineTo(0, bodyH);         /* left */
    ctx.moveTo(0, bodyH);  ctx.lineTo(barrelW, bodyH);   /* bottom */
    ctx.moveTo(barrelW, 0); ctx.lineTo(barrelW, rodY - 1);              /* right wall top */
    ctx.moveTo(barrelW, rodY + rodH + 1); ctx.lineTo(barrelW, bodyH);   /* right wall bottom */
    ctx.stroke();

    /* ── 6. Thick cap-end wall ── */
    ctx.beginPath();
    ctx.strokeStyle = '#7a9ac5';
    ctx.lineWidth = 3;
    ctx.moveTo(1.5, 0); ctx.lineTo(1.5, bodyH);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#5a8ab5';

    /* ── 7. Cap section divider ── */
    ctx.beginPath();
    ctx.moveTo(capW, 0); ctx.lineTo(capW, bodyH);
    ctx.stroke();

    /* ── 8. Piston (cyan vertical bar) ── */
    ctx.beginPath();
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2.5;
    ctx.moveTo(px, 2); ctx.lineTo(px, bodyH - 2);
    ctx.stroke();

    /* ── 9. Port A stub ── */
    ctx.beginPath();
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.moveTo(portAX, bodyH); ctx.lineTo(portAX, h);
    ctx.stroke();
  }

  function drawCylinderDASymbol(w, h, comp) {
    /* ── FluidSIM style: rod protrudes out of right end as piston extends ── */
    var bodyH = 36, barrelW = 64, capW = 19;
    var rodH = 13, rodY = Math.floor((bodyH - rodH) / 2); /* = 11 */
    var pistonMin = capW + 3, pistonMax = barrelW - 5;
    var ext = comp.extension || 0;
    var px = Math.round(pistonMin + (pistonMax - pistonMin) * ext);
    var portAX = Math.floor(capW / 2);                        /* =  9 */
    var portBX = capW + Math.floor((barrelW - capW) * 0.78); /* = 54 */

    /* Rod tip: fully retracted = tiny stub beyond barrel; fully extended = reaches w */
    var rodTip = Math.round((barrelW + 3) + (w - 4 - (barrelW + 3)) * ext);

    /* ── 1. Dark barrel background ── */
    ctx.fillStyle = '#0d1625';
    ctx.fillRect(1, 1, barrelW - 2, bodyH - 2);

    /* ── 2. Oil fill (cap side red, rod side blue) inside barrel ── */
    if (running) {
      ctx.fillStyle = 'rgba(255,68,68,0.28)';
      ctx.fillRect(2, 1, px - 2, bodyH - 2);
      ctx.fillStyle = 'rgba(68,136,255,0.22)';
      ctx.fillRect(px, 1, barrelW - px - 1, bodyH - 2);
    }

    /* ── 3. Rod rectangle: from piston to dynamic tip (protrudes outside barrel) ── */
    ctx.fillStyle = '#2a3a50';
    ctx.fillRect(px, rodY, rodTip - px, rodH);
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px, rodY, rodTip - px, rodH);

    /* ── 4. Barrel outline drawn OVER oil fill and inner rod section ── */
    ctx.beginPath();
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, 0);       ctx.lineTo(barrelW, 0);      /* top */
    ctx.moveTo(0, 0);       ctx.lineTo(0, bodyH);         /* left */
    ctx.moveTo(0, bodyH);   ctx.lineTo(barrelW, bodyH);   /* bottom */
    ctx.moveTo(barrelW, 0); ctx.lineTo(barrelW, rodY - 1);              /* right wall top */
    ctx.moveTo(barrelW, rodY + rodH + 1); ctx.lineTo(barrelW, bodyH);   /* right wall bottom */
    ctx.stroke();

    /* ── 5. Thick cap-end wall ── */
    ctx.beginPath();
    ctx.strokeStyle = '#7a9ac5';
    ctx.lineWidth = 3;
    ctx.moveTo(1.5, 0); ctx.lineTo(1.5, bodyH);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#5a8ab5';

    /* ── 6. Cap section divider ── */
    ctx.beginPath();
    ctx.moveTo(capW, 0); ctx.lineTo(capW, bodyH);
    ctx.stroke();

    /* ── 7. Piston (cyan vertical bar) ── */
    ctx.beginPath();
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2.5;
    ctx.moveTo(px, 2); ctx.lineTo(px, bodyH - 2);
    ctx.stroke();

    /* ── 8. Port stubs ── */
    ctx.beginPath();
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.moveTo(portAX, bodyH); ctx.lineTo(portAX, h);
    ctx.moveTo(portBX, bodyH); ctx.lineTo(portBX, h);
    ctx.stroke();
  }

  function drawMotorSymbol(w, h, comp) {
    var cx = w / 2, cy = h / 2;
    /* Circle */
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2535';
    ctx.fill();
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 2;
    ctx.stroke();
    /* Triangle (motor) */
    ctx.beginPath();
    ctx.moveTo(cx + 10, cy);
    ctx.lineTo(cx - 6, cy - 10);
    ctx.lineTo(cx - 6, cy + 10);
    ctx.closePath();
    ctx.fillStyle = running ? '#ff6666' : '#5a8ab5';
    ctx.fill();
    /* Rotation indicator */
    if (running && comp.rotation) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(comp.rotation);
      ctx.strokeStyle = '#00bcd4';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 1.5);
      ctx.stroke();
      drawSmallArrow(12 * Math.cos(Math.PI * 1.5), 12 * Math.sin(Math.PI * 1.5), 12 * Math.cos(Math.PI * 1.6), 12 * Math.sin(Math.PI * 1.6), '#00bcd4');
      ctx.restore();
    }
    /* M label */
    ctx.fillStyle = '#8899bb';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('M', cx, cy + 4);
  }

  function drawGaugeSymbol(w, h, comp) {
    var cx = w / 2;
    var dialCY = 16;
    var radius = 13;
    /* Dial face */
    ctx.beginPath();
    ctx.arc(cx, dialCY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1625';
    ctx.fill();
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    /* Tick marks — 7 major ticks spanning 270° (0 / 50 / 100 / 175 / 250 / 300 / 350 bar) */
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 0.8;
    var tickAngles = [-Math.PI * 0.75, -Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75];
    for (var ti = 0; ti < tickAngles.length; ti++) {
      var ax = cx + Math.cos(tickAngles[ti] - Math.PI / 2) * (radius - 2);
      var ay = dialCY + Math.sin(tickAngles[ti] - Math.PI / 2) * (radius - 2);
      var bx = cx + Math.cos(tickAngles[ti] - Math.PI / 2) * (radius - 5);
      var by = dialCY + Math.sin(tickAngles[ti] - Math.PI / 2) * (radius - 5);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    /* Needle — 0 to 350 bar (hydraulic scale), 270° sweep */
    var reading = comp ? (comp.reading || 0) : 0;
    var clamped = Math.max(0, Math.min(350, reading));
    var needleAngle = -Math.PI * 0.75 + (clamped / 350) * Math.PI * 1.5;
    ctx.save();
    ctx.translate(cx, dialCY);
    ctx.rotate(needleAngle);
    ctx.strokeStyle = running ? '#ff6644' : '#5a6a80';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, -(radius - 2));
    ctx.stroke();
    ctx.restore();
    /* Hub */
    ctx.beginPath();
    ctx.arc(cx, dialCY, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#5a8ab5';
    ctx.fill();
    /* Numeric reading + unit beneath dial */
    ctx.fillStyle = running && reading > 0.1 ? '#aed581' : '#667799';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(reading.toFixed(0), cx, h - 13);
    ctx.font = '7px sans-serif';
    ctx.fillStyle = '#667799';
    ctx.fillText('bar', cx, h - 4);
    ctx.textBaseline = 'alphabetic';
  }

  function drawFilterSymbol(w, h) {
    var cx = w / 2;
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    /* Diamond shape */
    ctx.beginPath();
    ctx.moveTo(cx, 5);
    ctx.lineTo(cx + 12, h / 2);
    ctx.lineTo(cx, h - 5);
    ctx.lineTo(cx - 12, h / 2);
    ctx.closePath();
    ctx.fillStyle = '#1a2535';
    ctx.fill();
    ctx.stroke();
    /* Dashed line (filter element) */
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(cx - 8, h / 2);
    ctx.lineTo(cx + 8, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    /* Vertical lines top/bottom */
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, 5);
    ctx.moveTo(cx, h - 5); ctx.lineTo(cx, h);
    ctx.stroke();
  }

  function drawTeeSymbol(w, h) {
    var cx = w / 2, cy = h / 2;
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, cy);
    ctx.lineTo(0, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();
    /* Dot at junction */
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#5a8ab5';
    ctx.fill();
  }

  function drawShuttleSymbol(w, h) {
    var cx = w / 2, cy = h / 2;
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    /* Two angled check valves pointing up into output */
    ctx.beginPath();
    ctx.moveTo(4, cy + 8); ctx.lineTo(cx, cy - 8); ctx.lineTo(w - 4, cy + 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    /* Horizontal bar at top */
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 8); ctx.lineTo(cx + 10, cy - 8);
    ctx.stroke();
    /* Ball in center */
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#5a8ab5';
    ctx.fill();
  }

  function drawValve22Symbol(w, h, comp) {
    var pos = (comp.values && comp.values.position) || 'Closed';
    var bw = w / 2;
    for (var b = 0; b < 2; b++) {
      var bx = b * bw;
      var isActive = (pos === 'Open' && b === 0) || (pos === 'Closed' && b === 1);
      ctx.fillStyle = isActive ? 'rgba(0,188,212,0.15)' : '#1a2535';
      ctx.strokeStyle = isActive ? '#00bcd4' : '#4a6a8a';
      ctx.lineWidth = isActive ? 2 : 1.5;
      ctx.fillRect(bx + 1, 1, bw - 2, h - 2);
      ctx.strokeRect(bx + 1, 1, bw - 2, h - 2);
    }
    /* Open box: arrow through */
    drawSmallArrow(bw / 2, h - 8, bw / 2, 8, '#5a8ab5');
    /* Closed box: X blocked */
    var cx2 = bw + bw / 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx2 - 6, 10); ctx.lineTo(cx2 + 6, h - 10);
    ctx.moveTo(cx2 + 6, 10); ctx.lineTo(cx2 - 6, h - 10);
    ctx.stroke();
    /* Port labels */
    ctx.fillStyle = '#6b7a99'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('In', w / 2, h + 10);
    ctx.fillText('Out', w / 2, -3);
  }

  function drawPressureReducingSymbol(w, h, comp) {
    var cx = w / 2;
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.fillRect(4, 8, w - 8, h - 16);
    ctx.strokeRect(4, 8, w - 8, h - 16);
    /* Arrow pointing down (reducing) */
    ctx.beginPath();
    ctx.moveTo(cx, 14); ctx.lineTo(cx, h - 12);
    ctx.strokeStyle = '#66bb6a'; ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 5, h - 18); ctx.lineTo(cx, h - 10); ctx.lineTo(cx + 5, h - 18);
    ctx.fillStyle = '#66bb6a'; ctx.fill();
    /* Spring */
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx + 8, h - 14);
    for (var zz = 0; zz < 3; zz++) {
      ctx.lineTo(cx + 14, h - 11 - zz * 8);
      ctx.lineTo(cx + 8, h - 7 - zz * 8);
    }
    ctx.stroke();
    /* "PRV" label */
    ctx.fillStyle = '#66bb6a'; ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('PRV', cx, h / 2 + 2);
  }

  function drawSequenceValveSymbol(w, h, comp) {
    var cx = w / 2;
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.fillRect(4, 8, w - 8, h - 16);
    ctx.strokeRect(4, 8, w - 8, h - 16);
    /* Arrow (flow direction) */
    drawSmallArrow(cx, h - 12, cx, 14, '#ffbb33');
    /* Spring */
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx + 8, 14);
    for (var zz = 0; zz < 3; zz++) {
      ctx.lineTo(cx + 14, 17 + zz * 8);
      ctx.lineTo(cx + 8, 21 + zz * 8);
    }
    ctx.stroke();
    /* Pilot line (dashed) */
    ctx.strokeStyle = '#ffbb33'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.moveTo(4, h - 12); ctx.lineTo(-4, h - 12); ctx.lineTo(-4, 14); ctx.lineTo(4, 14);
    ctx.stroke(); ctx.setLineDash([]);
    /* "SEQ" label */
    ctx.fillStyle = '#ffbb33'; ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('SEQ', cx - 2, h / 2 + 2);
  }

  function drawCounterbalanceSymbol(w, h, comp) {
    var cx = w / 2 - 2;
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.fillRect(2, 8, w - 8, h - 16);
    ctx.strokeRect(2, 8, w - 8, h - 16);
    /* Arrow */
    drawSmallArrow(cx, h - 12, cx, 14, '#e57373');
    /* Spring */
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx + 10, 14);
    for (var zz = 0; zz < 3; zz++) {
      ctx.lineTo(cx + 16, 17 + zz * 8);
      ctx.lineTo(cx + 10, 21 + zz * 8);
    }
    ctx.stroke();
    /* Pilot port arrow */
    ctx.strokeStyle = '#e57373'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.moveTo(w - 4, h / 2); ctx.lineTo(w + 4, h / 2);
    ctx.stroke(); ctx.setLineDash([]);
    /* "CB" label */
    ctx.fillStyle = '#e57373'; ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('CB', cx, h / 2 + 2);
  }

  function drawAccumulatorSymbol(w, h, comp) {
    var cx = w / 2;
    /* Oval/capsule shape */
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, h / 2, 14, 22, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    /* Divider line */
    ctx.beginPath();
    ctx.moveTo(cx - 12, h / 2 - 4);
    ctx.quadraticCurveTo(cx, h / 2 + 2, cx + 12, h / 2 - 4);
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1.5;
    ctx.stroke();
    /* N2 label on top (gas) */
    ctx.fillStyle = '#ffbb33'; ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('N\u2082', cx, h / 2 - 10);
    /* Oil label on bottom */
    ctx.fillStyle = '#4488ff'; ctx.font = '7px sans-serif';
    ctx.fillText('Oil', cx, h / 2 + 12);
  }

  function drawThrottleSymbol(w, h) {
    var cx = w / 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1.5;
    /* Vertical line */
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    /* Two arcs forming restriction */
    ctx.beginPath();
    ctx.arc(cx - 4, h / 2, 10, -0.5, 0.5); ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 4, h / 2, 10, Math.PI - 0.5, Math.PI + 0.5); ctx.stroke();
  }

  function drawFlowMeterSymbol(w, h, comp) {
    var cx = w / 2;
    var dialCY = 18;
    var radius = 14;
    /* Dial face */
    ctx.beginPath();
    ctx.arc(cx, dialCY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1625';
    ctx.fill();
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    /* Q label at top */
    ctx.fillStyle = '#667799';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Q', cx, dialCY - 4);
    /* Numeric reading inside dial */
    var reading = comp ? (comp.reading || 0) : 0;
    var active = running && reading > 0.1;
    ctx.fillStyle = active ? '#aed581' : '#5a8ab5';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText(reading.toFixed(1), cx, dialCY + 5);
    /* Unit label */
    ctx.fillStyle = '#667799';
    ctx.font = '7px sans-serif';
    ctx.fillText('L/min', cx, h - 14);
    /* Flow-direction arrow when active */
    if (active) {
      ctx.strokeStyle = '#aed581';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, h - 4);
      ctx.lineTo(cx, h - 9);
      ctx.stroke();
      ctx.fillStyle = '#aed581';
      ctx.beginPath();
      ctx.moveTo(cx, h - 12);
      ctx.lineTo(cx - 3, h - 7);
      ctx.lineTo(cx + 3, h - 7);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = '#5a8ab5';
      ctx.font = '7px sans-serif';
      ctx.fillText('\u2014', cx, h - 5);
    }
    ctx.textBaseline = 'alphabetic';
  }

  function drawPilotCheckSymbol(w, h) {
    var cx = w / 2 - 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1.5;
    /* Vertical line */
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    /* Triangle (check direction) */
    ctx.beginPath();
    ctx.moveTo(cx - 8, h / 2 + 6);
    ctx.lineTo(cx, h / 2 - 8);
    ctx.lineTo(cx + 8, h / 2 + 6);
    ctx.closePath();
    ctx.fillStyle = '#2a4060'; ctx.fill(); ctx.stroke();
    /* Bar */
    ctx.beginPath();
    ctx.moveTo(cx - 8, h / 2 - 8); ctx.lineTo(cx + 8, h / 2 - 8); ctx.stroke();
    /* Pilot line (dashed) coming from right */
    ctx.strokeStyle = '#ffbb33'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(w, h / 2); ctx.lineTo(cx + 10, h / 2 - 8);
    ctx.stroke(); ctx.setLineDash([]);
    /* "P" pilot label */
    ctx.fillStyle = '#ffbb33'; ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'left'; ctx.fillText('P', w - 6, h / 2 - 4);
    ctx.textAlign = 'center';
  }

  /* ================================================================
     PALETTE ICON DRAWING
     ================================================================ */

  function drawPaletteIcons() {
    var items = document.querySelectorAll('.palette-item');
    items.forEach(function (item) {
      var type = item.dataset.type;
      var pCanvas = item.querySelector('.palette-icon');
      if (!pCanvas) return;
      var pCtx = pCanvas.getContext('2d');
      pCtx.clearRect(0, 0, 40, 40);
      pCtx.save();
      pCtx.scale(0.5, 0.5);
      pCtx.translate(10, 10);
      /* Draw mini version */
      switch (type) {
        case 'pump':
          /* Motor circle with M */
          pCtx.beginPath(); pCtx.arc(12, 25, 9, 0, Math.PI * 2);
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5; pCtx.stroke();
          pCtx.fillStyle = '#aabbdd'; pCtx.font = 'bold 8px sans-serif'; pCtx.textAlign = 'center'; pCtx.textBaseline = 'middle';
          pCtx.fillText('M', 12, 25);
          /* Pump circle with triangle */
          pCtx.beginPath(); pCtx.arc(33, 25, 10, 0, Math.PI * 2);
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5; pCtx.stroke();
          pCtx.beginPath(); pCtx.moveTo(33, 17); pCtx.lineTo(27, 30); pCtx.lineTo(39, 30); pCtx.closePath();
          pCtx.fillStyle = '#5a8ab5'; pCtx.fill();
          /* Tank */
          pCtx.strokeStyle = '#4a6a8a'; pCtx.lineWidth = 1;
          pCtx.strokeRect(48, 18, 14, 14);
          pCtx.fillStyle = '#3388cc'; pCtx.font = 'bold 7px sans-serif';
          pCtx.fillText('T', 55, 28);
          break;
          // Dentro de drawPaletteIcons, en el switch (type), agregar:
          case 'pump-var-displacement':
            // Círculo de la bomba
            pCtx.strokeStyle = '#5a8ab5';
            pCtx.lineWidth = 1.5;
            pCtx.beginPath();
            pCtx.arc(22, 18, 10, 0, Math.PI * 2);
            pCtx.stroke();
            
            // Triángulo
            pCtx.beginPath();
            pCtx.moveTo(22, 10);
            pCtx.lineTo(17, 22);
            pCtx.lineTo(27, 22);
            pCtx.closePath();
            pCtx.fillStyle = '#5a8ab5';
            pCtx.fill();
            
            // Flecha variable (diagonal)
            pCtx.strokeStyle = '#ffb74d';
            pCtx.lineWidth = 2;
            pCtx.beginPath();
            pCtx.moveTo(14, 24);
            pCtx.lineTo(30, 12);
            pCtx.stroke();
            
            // Flecha de ajuste
            pCtx.fillStyle = '#ffb74d';
            pCtx.beginPath();
            pCtx.moveTo(30, 12);
            pCtx.lineTo(26, 10);
            pCtx.lineTo(28, 14);
            pCtx.closePath();
            pCtx.fill();
            
            // Motor pequeño
            pCtx.strokeStyle = '#5a8ab5';
            pCtx.beginPath();
            pCtx.arc(10, 18, 6, 0, Math.PI * 2);
            pCtx.stroke();
            pCtx.fillStyle = '#aabbdd';
            pCtx.font = 'bold 5px sans-serif';
            pCtx.textAlign = 'center';
            pCtx.textBaseline = 'middle';
            pCtx.fillText('M', 10, 18);
            
            // Tanque
            pCtx.strokeStyle = '#4a6a8a';
            pCtx.lineWidth = 1;
            pCtx.strokeRect(30, 12, 8, 12);
            pCtx.fillStyle = '#3388cc';
            pCtx.font = 'bold 5px sans-serif';
            pCtx.fillText('T', 34, 20);
  break;
          case 'pump-drive':
          // Caja de engranajes
          pCtx.strokeStyle = '#5a8ab5';
          pCtx.lineWidth = 1.5;
          pCtx.strokeRect(8, 6, 24, 28);
          
          // Engranaje central
          pCtx.strokeStyle = '#00bcd4';
          pCtx.beginPath();
          pCtx.arc(20, 16, 6, 0, Math.PI * 2);
          pCtx.stroke();
          
          // Dientes centrales
          for (var i = 0; i < 6; i++) {
            var angle = (i / 6) * Math.PI * 2;
            pCtx.beginPath();
            pCtx.moveTo(20 + Math.cos(angle) * 8, 16 + Math.sin(angle) * 8);
            pCtx.lineTo(20 + Math.cos(angle) * 10, 16 + Math.sin(angle) * 10);
            pCtx.stroke();
          }
          
          // Engranajes de salida
          for (var j = 0; j < 2; j++) {
            var ox = 13 + j * 14;
            var oy = 28;
            pCtx.strokeStyle = '#42a5f5';
            pCtx.beginPath();
            pCtx.arc(ox, oy, 5, 0, Math.PI * 2);
            pCtx.stroke();
            
            // Conexión
            pCtx.strokeStyle = '#4a6a8a';
            pCtx.setLineDash([2, 2]);
            pCtx.beginPath();
            pCtx.moveTo(20, 22);
            pCtx.lineTo(ox, oy - 5);
            pCtx.stroke();
            pCtx.setLineDash([]);
            
            // Flecha de salida
            pCtx.strokeStyle = '#42a5f5';
            pCtx.beginPath();
            pCtx.moveTo(ox, oy + 5);
            pCtx.lineTo(ox, 36);
            pCtx.stroke();
          }
          
          // Etiquetas
          pCtx.fillStyle = '#667799';
          pCtx.font = '5px sans-serif';
          pCtx.textAlign = 'center';
          pCtx.fillText('50%', 13, 36);
          pCtx.fillText('50%', 27, 36);
          break;

        case 'engine':
          // Bloque motor en V
          pCtx.strokeStyle = '#5a8ab5';
          pCtx.lineWidth = 1.5;
          pCtx.strokeRect(6, 8, 28, 30);
          // Cilindros izquierdos
          for (var i = 0; i < 3; i++) {
            pCtx.beginPath();
            pCtx.arc(10 + i * 8, 16, 3.5, 0, Math.PI * 2);
            pCtx.stroke();
            pCtx.fillStyle = '#00bcd4';
            pCtx.fillRect(9 + i * 8, 15, 2, 2);
            pCtx.fillStyle = '#1a2535';
          }
          // Cilindros derechos
          for (var i = 0; i < 3; i++) {
            pCtx.beginPath();
            pCtx.arc(10 + i * 8, 30, 3.5, 0, Math.PI * 2);
            pCtx.stroke();
            pCtx.fillStyle = '#00bcd4';
            pCtx.fillRect(9 + i * 8, 29, 2, 2);
            pCtx.fillStyle = '#1a2535';
          }
          // Flecha de salida
          pCtx.strokeStyle = '#ff6666';
          pCtx.lineWidth = 1.5;
          pCtx.beginPath();
          pCtx.moveTo(20, 38);
          pCtx.lineTo(20, 8);
          pCtx.stroke();
          pCtx.fillStyle = '#ff6666';
          pCtx.beginPath();
          pCtx.moveTo(20, 10);
          pCtx.lineTo(17, 14);
          pCtx.lineTo(23, 14);
          pCtx.closePath();
          pCtx.fill();
          break;
        case 'relief':
          pCtx.strokeStyle = '#ff6666'; pCtx.lineWidth = 2;
          pCtx.strokeRect(12, 8, 36, 44);
          drawSmallArrow(30, 44, 30, 14, '#ff6666');
          break;
        case 'dcv43':
          for (var b = 0; b < 3; b++) {
            pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
            pCtx.strokeRect(b * 20 + 2, 10, 18, 40);
          }
          break;
        case 'dcv42':
          for (var b42p = 0; b42p < 2; b42p++) {
            pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
            pCtx.strokeRect(b42p * 28 + 4, 10, 26, 40);
          }
          /* Crossed arrows in right box (Retract position) */
          pCtx.strokeStyle = '#42a5f5'; pCtx.lineWidth = 1;
          pCtx.beginPath();
          pCtx.moveTo(34, 44); pCtx.lineTo(56, 16);
          pCtx.moveTo(56, 44); pCtx.lineTo(34, 16);
          pCtx.stroke();
          break;
        case 'dcv32':
          for (var b2 = 0; b2 < 2; b2++) {
            pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
            pCtx.strokeRect(b2 * 28 + 4, 10, 26, 40);
          }
          break;
        case 'dcv52':
          for (var b52p = 0; b52p < 2; b52p++) {
            pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
            pCtx.strokeRect(b52p * 28 + 4, 10, 26, 40);
          }
          pCtx.fillStyle = '#667799'; pCtx.font = 'bold 9px sans-serif'; pCtx.textAlign = 'center';
          pCtx.fillText('5/2', 30, 35);
          break;
        case 'dcv53':
          for (var b53p = 0; b53p < 3; b53p++) {
            pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
            pCtx.strokeRect(b53p * 20 + 2, 10, 18, 40);
          }
          pCtx.fillStyle = '#667799'; pCtx.font = 'bold 9px sans-serif'; pCtx.textAlign = 'center';
          pCtx.fillText('5/3', 30, 35);
          break;
        case 'dcv32no':
          for (var b32no = 0; b32no < 2; b32no++) {
            pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
            pCtx.strokeRect(b32no * 28 + 4, 10, 26, 40);
          }
          pCtx.fillStyle = '#ffbb33'; pCtx.font = 'bold 9px sans-serif'; pCtx.textAlign = 'center';
          pCtx.fillText('NO', 30, 35);
          break;
        case 'valve22no':
          for (var v22no = 0; v22no < 2; v22no++) {
            pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
            pCtx.strokeRect(v22no * 28 + 4, 10, 26, 40);
          }
          pCtx.fillStyle = '#ffbb33'; pCtx.font = 'bold 9px sans-serif'; pCtx.textAlign = 'center';
          pCtx.fillText('NO', 30, 35);
          break;
        case 'intensifier':
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.strokeRect(4, 14, 30, 32);   /* LP barrel */
          pCtx.strokeRect(38, 18, 18, 24);  /* HP barrel */
          pCtx.strokeStyle = '#4a6a8a'; pCtx.lineWidth = 2;
          pCtx.beginPath(); pCtx.moveTo(34, 30); pCtx.lineTo(38, 30); pCtx.stroke();
          pCtx.fillStyle = '#ffbb33'; pCtx.font = 'bold 8px sans-serif'; pCtx.textAlign = 'center';
          pCtx.fillText('×', 30, 38);
          break;
        case 'check':
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 2;
          pCtx.beginPath(); pCtx.moveTo(22, 50); pCtx.lineTo(30, 10); pCtx.lineTo(38, 50); pCtx.closePath(); pCtx.stroke();
          pCtx.beginPath(); pCtx.moveTo(18, 10); pCtx.lineTo(42, 10); pCtx.stroke();
          break;
        case 'flow-control':
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 2;
          pCtx.beginPath(); pCtx.moveTo(15, 45); pCtx.lineTo(45, 15); pCtx.moveTo(15, 15); pCtx.lineTo(45, 45); pCtx.stroke();
          break;
        case 'cylinder-sa':
          /* FESTO-style SA: barrel + rod-right + spring + one bottom port stub */
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.beginPath();
          pCtx.moveTo(2, 6);  pCtx.lineTo(40, 6);   /* top */
          pCtx.moveTo(2, 6);  pCtx.lineTo(2, 28);   /* left */
          pCtx.moveTo(2, 28); pCtx.lineTo(40, 28);  /* bottom */
          pCtx.moveTo(40, 6); pCtx.lineTo(40, 14);  /* right wall top */
          pCtx.moveTo(40, 22);pCtx.lineTo(40, 28);  /* right wall bottom */
          pCtx.stroke();
          /* Cap divider */
          pCtx.beginPath(); pCtx.moveTo(14, 6); pCtx.lineTo(14, 28); pCtx.stroke();
          /* Spring zigzag */
          pCtx.beginPath(); pCtx.strokeStyle = '#5577aa'; pCtx.lineWidth = 1;
          pCtx.moveTo(26, 17); pCtx.lineTo(29, 12); pCtx.lineTo(33, 22);
          pCtx.lineTo(37, 12); pCtx.lineTo(40, 17); pCtx.stroke();
          /* Piston */
          pCtx.beginPath(); pCtx.strokeStyle = '#00bcd4'; pCtx.lineWidth = 2;
          pCtx.moveTo(22, 7); pCtx.lineTo(22, 27); pCtx.stroke();
          /* Rod rectangle */
          pCtx.fillStyle = '#243040'; pCtx.fillRect(22, 14, 42, 8);
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5; pCtx.strokeRect(22, 14, 42, 8);
          /* Port A stub */
          pCtx.beginPath(); pCtx.moveTo(8, 28); pCtx.lineTo(8, 44); pCtx.stroke();
          break;
        case 'cylinder-da':
          /* FESTO-style DA: barrel + rod-right + two bottom port stubs */
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.beginPath();
          pCtx.moveTo(2, 6);  pCtx.lineTo(44, 6);   /* top */
          pCtx.moveTo(2, 6);  pCtx.lineTo(2, 28);   /* left */
          pCtx.moveTo(2, 28); pCtx.lineTo(44, 28);  /* bottom */
          pCtx.moveTo(44, 6); pCtx.lineTo(44, 14);  /* right wall top */
          pCtx.moveTo(44, 22);pCtx.lineTo(44, 28);  /* right wall bottom */
          pCtx.stroke();
          /* Cap divider */
          pCtx.beginPath(); pCtx.moveTo(14, 6); pCtx.lineTo(14, 28); pCtx.stroke();
          /* Piston */
          pCtx.beginPath(); pCtx.strokeStyle = '#00bcd4'; pCtx.lineWidth = 2;
          pCtx.moveTo(28, 7); pCtx.lineTo(28, 27); pCtx.stroke();
          /* Rod rectangle */
          pCtx.fillStyle = '#243040'; pCtx.fillRect(28, 14, 36, 8);
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5; pCtx.strokeRect(28, 14, 36, 8);
          /* Port stubs A and B */
          pCtx.beginPath();
          pCtx.moveTo(8, 28);  pCtx.lineTo(8, 44);  /* port A */
          pCtx.moveTo(34, 28); pCtx.lineTo(34, 44); /* port B */
          pCtx.stroke();
          break;
        case 'motor':
          pCtx.beginPath(); pCtx.arc(30, 30, 18, 0, Math.PI * 2);
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 2; pCtx.stroke();
          pCtx.beginPath(); pCtx.moveTo(38, 30); pCtx.lineTo(22, 20); pCtx.lineTo(22, 40); pCtx.closePath();
          pCtx.fillStyle = '#5a8ab5'; pCtx.fill();
          break;
        case 'gauge':
          pCtx.beginPath(); pCtx.arc(30, 26, 16, 0, Math.PI * 2);
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 2; pCtx.stroke();
          pCtx.beginPath(); pCtx.moveTo(30, 26); pCtx.lineTo(40, 18);
          pCtx.strokeStyle = '#ff4444'; pCtx.lineWidth = 1.5; pCtx.stroke();
          break;
        case 'filter':
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 2;
          pCtx.beginPath(); pCtx.moveTo(30, 8); pCtx.lineTo(46, 30); pCtx.lineTo(30, 52); pCtx.lineTo(14, 30); pCtx.closePath(); pCtx.stroke();
          break;
        case 'tee':
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 3;
          pCtx.beginPath(); pCtx.moveTo(30, 8); pCtx.lineTo(30, 30); pCtx.lineTo(8, 30); pCtx.moveTo(30, 30); pCtx.lineTo(52, 30); pCtx.stroke();
          break;
        case 'shuttle':
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.beginPath(); pCtx.moveTo(10, 38); pCtx.lineTo(30, 12); pCtx.lineTo(50, 38);
          pCtx.closePath(); pCtx.stroke();
          pCtx.beginPath(); pCtx.arc(30, 28, 4, 0, Math.PI * 2);
          pCtx.fillStyle = '#5a8ab5'; pCtx.fill();
          break;
        case 'valve22':
          for (var v2 = 0; v2 < 2; v2++) {
            pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
            pCtx.strokeRect(v2 * 28 + 4, 10, 26, 40);
          }
          break;
        case 'pressure-reducing':
          pCtx.fillStyle = '#1a2535'; pCtx.strokeStyle = '#66bb6a'; pCtx.lineWidth = 1.5;
          pCtx.strokeRect(12, 8, 36, 44);
          pCtx.fillStyle = '#66bb6a'; pCtx.font = 'bold 10px sans-serif'; pCtx.textAlign = 'center';
          pCtx.fillText('PRV', 30, 35);
          break;
        case 'sequence-valve':
          pCtx.fillStyle = '#1a2535'; pCtx.strokeStyle = '#ffbb33'; pCtx.lineWidth = 1.5;
          pCtx.strokeRect(12, 8, 36, 44);
          pCtx.fillStyle = '#ffbb33'; pCtx.font = 'bold 10px sans-serif'; pCtx.textAlign = 'center';
          pCtx.fillText('SEQ', 30, 35);
          break;
        case 'counterbalance':
          pCtx.fillStyle = '#1a2535'; pCtx.strokeStyle = '#e57373'; pCtx.lineWidth = 1.5;
          pCtx.strokeRect(12, 8, 36, 44);
          pCtx.fillStyle = '#e57373'; pCtx.font = 'bold 10px sans-serif'; pCtx.textAlign = 'center';
          pCtx.fillText('CB', 30, 35);
          break;
        case 'accumulator':
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.beginPath(); pCtx.ellipse(30, 30, 12, 18, 0, 0, Math.PI * 2); pCtx.stroke();
          pCtx.beginPath(); pCtx.moveTo(20, 28); pCtx.quadraticCurveTo(30, 34, 40, 28); pCtx.stroke();
          pCtx.fillStyle = '#ffbb33'; pCtx.font = 'bold 8px sans-serif'; pCtx.textAlign = 'center';
          pCtx.fillText('N\u2082', 30, 22);
          break;
        case 'throttle':
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 2;
          pCtx.beginPath(); pCtx.moveTo(30, 8); pCtx.lineTo(30, 52); pCtx.stroke();
          pCtx.beginPath(); pCtx.arc(26, 30, 10, -0.5, 0.5); pCtx.stroke();
          pCtx.beginPath(); pCtx.arc(34, 30, 10, Math.PI - 0.5, Math.PI + 0.5); pCtx.stroke();
          break;
        case 'flow-meter':
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.beginPath(); pCtx.moveTo(30, 8); pCtx.lineTo(50, 30); pCtx.lineTo(30, 52); pCtx.lineTo(10, 30); pCtx.closePath(); pCtx.stroke();
          pCtx.fillStyle = '#4488ff'; pCtx.font = 'bold 12px sans-serif'; pCtx.textAlign = 'center';
          pCtx.fillText('Q', 30, 35);
          break;
        case 'pilot-check':
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.beginPath(); pCtx.moveTo(22, 50); pCtx.lineTo(30, 10); pCtx.lineTo(38, 50); pCtx.closePath(); pCtx.stroke();
          pCtx.beginPath(); pCtx.moveTo(18, 10); pCtx.lineTo(42, 10); pCtx.stroke();
          /* Pilot dashed line */
          pCtx.strokeStyle = '#ffbb33'; pCtx.lineWidth = 1;
          pCtx.setLineDash([2, 2]);
          pCtx.beginPath(); pCtx.moveTo(50, 30); pCtx.lineTo(38, 14); pCtx.stroke();
          pCtx.setLineDash([]);
          break;

        /* ── Tier 4 palette icons ── */
        case 'orifice':
          /* Fixed orifice: circle with restriction arcs */
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.beginPath(); pCtx.arc(30, 30, 12, 0, Math.PI * 2);
          pCtx.fillStyle = '#1a2535'; pCtx.fill(); pCtx.stroke();
          pCtx.beginPath(); pCtx.arc(26, 30, 9, -0.5, 0.5); pCtx.stroke();
          pCtx.beginPath(); pCtx.arc(34, 30, 9, Math.PI - 0.5, Math.PI + 0.5); pCtx.stroke();
          /* Port stubs */
          pCtx.beginPath(); pCtx.moveTo(30, 8); pCtx.lineTo(30, 18); pCtx.stroke();
          pCtx.beginPath(); pCtx.moveTo(30, 42); pCtx.lineTo(30, 52); pCtx.stroke();
          break;
        case 'flow-check':
          /* Flow control + check: rectangle with X and triangle */
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.fillStyle = '#1a2535'; pCtx.fillRect(12, 6, 36, 48); pCtx.strokeRect(12, 6, 36, 48);
          /* Check triangle (top half) */
          pCtx.beginPath();
          pCtx.moveTo(30, 18); pCtx.lineTo(20, 32); pCtx.lineTo(40, 32); pCtx.closePath();
          pCtx.fillStyle = '#2a4060'; pCtx.fill(); pCtx.stroke();
          pCtx.beginPath(); pCtx.moveTo(20, 32); pCtx.lineTo(40, 32); pCtx.stroke();
          /* Throttle X (bottom half) */
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1;
          pCtx.beginPath();
          pCtx.moveTo(20, 38); pCtx.lineTo(40, 50);
          pCtx.moveTo(20, 50); pCtx.lineTo(40, 38);
          pCtx.stroke();
          break;
        case 'check-spring':
          /* Spring check: triangle + zigzag spring */
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.beginPath(); pCtx.moveTo(30, 8); pCtx.lineTo(30, 52); pCtx.stroke();
          pCtx.beginPath();
          pCtx.moveTo(22, 34); pCtx.lineTo(30, 18); pCtx.lineTo(38, 34); pCtx.closePath();
          pCtx.fillStyle = '#2a4060'; pCtx.fill(); pCtx.stroke();
          pCtx.beginPath(); pCtx.moveTo(22, 18); pCtx.lineTo(38, 18); pCtx.stroke();
          /* Spring zigzag below */
          pCtx.strokeStyle = '#5577aa'; pCtx.lineWidth = 1;
          pCtx.beginPath(); pCtx.moveTo(30, 36);
          pCtx.lineTo(25, 40); pCtx.lineTo(35, 44); pCtx.lineTo(25, 48); pCtx.lineTo(30, 52);
          pCtx.stroke();
          break;

        /* ── Tier 5 palette icons ── */
        case 'priority':
          /* Priority valve: rectangle, P in bottom, CF and EF out top */
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.fillStyle = '#1a2535'; pCtx.fillRect(8, 12, 44, 30); pCtx.strokeRect(8, 12, 44, 30);
          pCtx.strokeStyle = '#42a5f5'; pCtx.lineWidth = 1.5;
          pCtx.beginPath(); pCtx.moveTo(30, 42); pCtx.lineTo(16, 12); pCtx.stroke();  /* P→CF */
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1; pCtx.setLineDash([3, 2]);
          pCtx.beginPath(); pCtx.moveTo(30, 42); pCtx.lineTo(44, 12); pCtx.stroke();  /* P→EF dashed */
          pCtx.setLineDash([]);
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.beginPath();
          pCtx.moveTo(30, 52); pCtx.lineTo(30, 42); /* P stub */
          pCtx.moveTo(16, 12); pCtx.lineTo(16, 2);  /* CF stub */
          pCtx.moveTo(44, 12); pCtx.lineTo(44, 2);  /* EF stub */
          pCtx.stroke();
          pCtx.fillStyle = '#42a5f5'; pCtx.font = 'bold 7px sans-serif'; pCtx.textAlign = 'center';
          pCtx.fillText('CF', 16, 58);
          pCtx.fillStyle = '#667799'; pCtx.fillText('EF', 44, 58);
          break;
        case 'flow-divider':
          /* Flow divider: rectangle, P in bottom, A and B out top, gear circles */
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.fillStyle = '#1a2535'; pCtx.fillRect(8, 12, 44, 30); pCtx.strokeRect(8, 12, 44, 30);
          pCtx.strokeStyle = '#5577aa'; pCtx.lineWidth = 1;
          pCtx.beginPath(); pCtx.arc(24, 28, 8, 0, Math.PI * 2); pCtx.stroke();
          pCtx.beginPath(); pCtx.arc(36, 28, 8, 0, Math.PI * 2); pCtx.stroke();
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.beginPath();
          pCtx.moveTo(30, 52); pCtx.lineTo(30, 42); /* P stub */
          pCtx.moveTo(16, 12); pCtx.lineTo(16, 2);  /* A stub */
          pCtx.moveTo(44, 12); pCtx.lineTo(44, 2);  /* B stub */
          pCtx.stroke();
          pCtx.fillStyle = '#42a5f5'; pCtx.font = 'bold 7px sans-serif'; pCtx.textAlign = 'center';
          pCtx.fillText('A', 16, 58); pCtx.fillText('B', 44, 58);
          break;
        case 'pump-hand':
          /* Hand pump: circle with triangle + T-bar handle */
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.beginPath(); pCtx.arc(36, 32, 13, 0, Math.PI * 2);
          pCtx.fillStyle = '#1a2535'; pCtx.fill(); pCtx.stroke();
          pCtx.beginPath();
          pCtx.moveTo(28, 36); pCtx.lineTo(28, 26); pCtx.lineTo(44, 32); pCtx.closePath();
          pCtx.fillStyle = '#5a8ab5'; pCtx.fill();
          /* T-bar handle */
          pCtx.strokeStyle = '#7a9ac5'; pCtx.lineWidth = 2;
          pCtx.beginPath(); pCtx.moveTo(20, 22); pCtx.lineTo(20, 14); pCtx.stroke();
          pCtx.beginPath(); pCtx.moveTo(12, 14); pCtx.lineTo(28, 14); pCtx.stroke();
          /* Port stubs */
          pCtx.strokeStyle = '#5a8ab5'; pCtx.lineWidth = 1.5;
          pCtx.beginPath(); pCtx.moveTo(36, 19); pCtx.lineTo(36, 8); pCtx.stroke();  /* P top */
          pCtx.beginPath(); pCtx.moveTo(20, 45); pCtx.lineTo(20, 56); pCtx.stroke(); /* T bottom */
          break;
          case 'poclain-ms35':
    // Círculo exterior
    pCtx.beginPath();
    pCtx.arc(30, 28, 16, 0, Math.PI * 2);
    pCtx.strokeStyle = '#5a8ab5';
    pCtx.lineWidth = 2;
    pCtx.stroke();
    
    // Triángulo (motor)
    pCtx.beginPath();
    pCtx.moveTo(30, 28);
    pCtx.lineTo(22, 18);
    pCtx.lineTo(22, 38);
    pCtx.closePath();
    pCtx.fillStyle = '#5a8ab5';
    pCtx.fill();
    
    // Segundo triángulo (bidireccional)
    pCtx.beginPath();
    pCtx.moveTo(30, 28);
    pCtx.lineTo(38, 18);
    pCtx.lineTo(38, 38);
    pCtx.closePath();
    pCtx.fillStyle = 'rgba(90, 138, 181, 0.3)';
    pCtx.fill();
    
    // Engranaje interior
    pCtx.strokeStyle = '#4a6a8a';
    pCtx.lineWidth = 1;
    pCtx.beginPath();
    pCtx.arc(30, 28, 8, 0, Math.PI * 2);
    pCtx.stroke();
    
    // Dientes
    for (var i = 0; i < 6; i++) {
        var angle = (i / 6) * Math.PI * 2;
        pCtx.beginPath();
        pCtx.moveTo(30 + Math.cos(angle) * 8, 28 + Math.sin(angle) * 8);
        pCtx.lineTo(30 + Math.cos(angle) * 10, 28 + Math.sin(angle) * 10);
        pCtx.stroke();
    }
    
    // Etiqueta
    pCtx.fillStyle = '#667799';
    pCtx.font = 'bold 5px sans-serif';
    pCtx.textAlign = 'center';
    pCtx.textBaseline = 'bottom';
    pCtx.fillText('LSHT', 30, 44);
    break;
      }
            pCtx.restore();
    });
  }

  /* ================================================================
     UTILITY
     ================================================================ */

  function findComp(id) {
    for (var i = 0; i < components.length; i++) {
      if (components[i].id === id) return components[i];
    }
    return null;
  }

  /* ── Rotation helpers ── */
  var DIR_CW = { up: 'right', right: 'down', down: 'left', left: 'up' };

  /** Get port with rotated position and direction when orient === 1 */
  function getRotatedPort(def, portIdx, orient) {
  var p = def.ports[portIdx];
  if (!orient) return p;
  
  // orient: 0=0°, 1=90°, 2=180°, 3=270°
  var angle = orient * Math.PI / 2;
  
  // Coordenadas relativas al centro del componente
  var cx = def.w / 2;
  var cy = def.h / 2;
  
  // Rotar el punto alrededor del centro
  var dx = p.x - cx;
  var dy = p.y - cy;
  
  var cos = Math.cos(angle);
  var sin = Math.sin(angle);
  
  var rx = dx * cos - dy * sin + cx;
  var ry = dx * sin + dy * cos + cy;
  
  // Rotar la dirección
  var dirMap = {
    'up': ['up', 'right', 'down', 'left'],
    'down': ['down', 'left', 'up', 'right'],
    'left': ['left', 'up', 'right', 'down'],
    'right': ['right', 'down', 'left', 'up']
  };
  
  var dir = dirMap[p.dir] ? dirMap[p.dir][orient % 4] : p.dir;
  
  return { x: rx, y: ry, dir: dir, label: p.label };
}

  /** Get effective bounding dimensions (w/h swap when rotated) */
  function getEffectiveDims(comp) {
  var def = COMP_DEFS[comp.type];
  var orient = comp.orient || 0;
  
  // Si orient es par (0 o 2): usar dimensiones originales
  // Si orient es impar (1 o 3): intercambiar w y h
  if (orient % 2 === 0) {
    return { w: def.w, h: def.h };
  } else {
    return { w: def.h, h: def.w };
  }
}

  function getPortWorldPos(comp, portIdx) {
    var def = COMP_DEFS[comp.type];
    var port = getRotatedPort(def, portIdx, comp.orient);
    return { x: comp.x + port.x, y: comp.y + port.y };
  }

  /** Like getPortWorldPos but takes a {compId, portIdx} ref */
  function getPortWorldPos2(ref) {
    var c = findComp(ref.compId);
    if (!c) return { x: 0, y: 0 };
    var def = COMP_DEFS[c.type];
    var p = getRotatedPort(def, ref.portIdx, c.orient);
    return { x: c.x + p.x, y: c.y + p.y };
  }

  /* ================================================================
     NEW COMPONENT SYMBOLS (Tier 1 / 2 / 3 — FluidSIM parity additions)
     ================================================================ */

  /* ── Tier 1 ────────────────────────────────────────────────── */

  function drawReservoirSymbol(w, h, comp) {
    /* Open-top tank: three sides drawn (left, bottom, right) */
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, 4);
    ctx.lineTo(6, h - 4);
    ctx.lineTo(w - 6, h - 4);
    ctx.lineTo(w - 6, 4);
    ctx.stroke();
    /* Oil level line (wavy) */
    ctx.strokeStyle = running ? '#4488ff' : '#3b5a80';
    ctx.lineWidth = 1;
    var oilY = h * 0.55;
    ctx.beginPath();
    ctx.moveTo(8, oilY);
    for (var wx = 8; wx < w - 8; wx += 4) {
      ctx.lineTo(wx + 2, oilY - 2);
      ctx.lineTo(wx + 4, oilY);
    }
    ctx.stroke();
    /* Volume label */
    ctx.fillStyle = '#667799';
    ctx.font = '7px sans-serif';
    ctx.textAlign = 'center';
    var vol = comp && comp.values ? (comp.values.volume || 100) : 100;
    ctx.fillText(vol + 'L', w / 2, h - 8);
  }

  function drawCoolerSymbol(w, h, comp) {
    /* Rectangle with diagonal cooling-fluid lines */
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.fillRect(4, 4, w - 8, h - 8);
    ctx.strokeRect(4, 4, w - 8, h - 8);
    /* Diagonal slashes = heat exchanger */
    ctx.strokeStyle = '#66bbee';
    ctx.lineWidth = 1;
    for (var dx = 8; dx < w - 8; dx += 6) {
      ctx.beginPath();
      ctx.moveTo(dx, h - 6);
      ctx.lineTo(dx + 5, 6);
      ctx.stroke();
    }
    /* Label */
    ctx.fillStyle = '#66bbee';
    ctx.font = 'bold 6px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('COOL', w / 2, h + 10);
  }

  function drawFlowCompSymbol(w, h, comp) {
    var cx = w / 2;
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    /* Diamond body */
    ctx.beginPath();
    ctx.moveTo(cx, 4);
    ctx.lineTo(w - 4, h / 2);
    ctx.lineTo(cx, h - 4);
    ctx.lineTo(4, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    /* Throttle restriction indicator */
    ctx.strokeStyle = '#42a5f5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, h - 4);
    ctx.lineTo(cx, 4);
    ctx.stroke();
    /* Pressure-compensator stem at side */
    ctx.beginPath();
    ctx.moveTo(w - 4, h / 2);
    ctx.lineTo(w + 3, h / 2);
    ctx.stroke();
    /* Label */
    ctx.fillStyle = '#667799';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PFC', cx, h / 2 + 2);
    ctx.font = '6px sans-serif';
    var flow = comp && comp.values ? (comp.values.flow || 15) : 15;
    ctx.fillText(fmtUnitDisp('flow', flow, 1), cx, h + 8);
  }

  function drawPressureSwitchSymbol(w, h, comp) {
    var reading = comp ? (comp._localPressure || 0) : 0;
    var threshold = (comp && comp.values && comp.values.threshold) || 100;
    var tripped = running && reading >= threshold;
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = tripped ? '#66bb6a' : '#5a8ab5';
    ctx.lineWidth = tripped ? 2 : 1.5;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillRect(4, 4, w - 8, h - 8);
    /* Switch glyph: circle-contact + pressure arrow */
    var cx = w / 2;
    ctx.strokeStyle = tripped ? '#66bb6a' : '#5a8ab5';
    ctx.beginPath();
    ctx.arc(cx - 6, h / 2, 2, 0, Math.PI * 2);
    ctx.arc(cx + 6, h / 2, 2, 0, Math.PI * 2);
    ctx.stroke();
    /* Contact arm */
    ctx.beginPath();
    ctx.moveTo(cx - 6, h / 2);
    if (tripped) ctx.lineTo(cx + 6, h / 2);
    else         ctx.lineTo(cx + 4, h / 2 - 6);
    ctx.stroke();
    /* Pressure port arrow */
    ctx.strokeStyle = '#42a5f5';
    ctx.beginPath();
    ctx.moveTo(cx, h - 6);
    ctx.lineTo(cx, h / 2 + 4);
    ctx.stroke();
    /* State label */
    ctx.fillStyle = tripped ? '#aed581' : '#667799';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tripped ? 'ON' : 'OFF', cx, h - 10);
  }

  function drawANDValveSymbol(w, h) {
    /* Circle with downward-slash indicating AND-of-pressures */
    var cx = w / 2, cy = h / 2;
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, h / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    /* Internal shuttle: partial circle with side flat */
    ctx.fillStyle = '#5a8ab5';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    /* AND label */
    ctx.fillStyle = '#667799';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AND', cx, h + 8);
  }

  function drawUnloadingSymbol(w, h, comp) {
    /* Relief-like symbol + remote pilot arrow */
    var active = !!(running && comp && comp._unloadActive);
    ctx.fillStyle = active ? '#2a1a10' : '#1a2535';
    ctx.strokeStyle = active ? '#ff8833' : '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.fillRect(4, 8, w - 8, h - 16);
    ctx.strokeRect(4, 8, w - 8, h - 16);
    /* Valve arrow */
    var cx = w / 2;
    ctx.strokeStyle = active ? '#ff9944' : '#42a5f5';
    ctx.beginPath();
    ctx.moveTo(cx, h - 10);
    ctx.lineTo(cx, 10);
    ctx.stroke();
    ctx.fillStyle = active ? '#ff9944' : '#42a5f5';
    ctx.beginPath();
    ctx.moveTo(cx, 10);
    ctx.lineTo(cx - 3, 14);
    ctx.lineTo(cx + 3, 14);
    ctx.closePath();
    ctx.fill();
    /* Remote pilot port (right) indicator */
    ctx.strokeStyle = '#667799';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(w - 4, h / 2);
    ctx.lineTo(cx, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    /* Spring */
    ctx.strokeStyle = '#5a8ab5';
    ctx.beginPath();
    ctx.moveTo(4, h / 2 - 6);
    ctx.lineTo(8, h / 2 - 3);
    ctx.lineTo(4, h / 2);
    ctx.lineTo(8, h / 2 + 3);
    ctx.lineTo(4, h / 2 + 6);
    ctx.stroke();
    /* Label */
    ctx.fillStyle = '#667799';
    ctx.font = '6px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('UNL', cx, h + 8);
  }

  function drawDCV42Symbol(w, h, comp) {
    var pos  = (comp && comp.values && comp.values.position) || 'Extend';
    var _actOld42 = (comp && comp.values && comp.values.actuation) || 'Solenoid';
    var actL = (comp && comp.values && comp.values.actuationL) || _actOld42;
    var actR = (comp && comp.values && comp.values.actuationR) || 'Spring';
    var isHov = (hoveredDcv && hoveredDcv.id === comp.id);
    var isRetract = (pos === 'Retract');
    if (isHov) { ctx.shadowColor = '#00bcd4'; ctx.shadowBlur = 10; }
    ctx.lineWidth = 1.5;
    var bw = w / 2;
    /* Both envelope boxes */
    for (var b42 = 0; b42 < 2; b42++) {
      var isActive42 = (pos === 'Extend' && b42 === 0) || (pos === 'Retract' && b42 === 1);
      ctx.fillStyle = isActive42 ? 'rgba(0,188,212,0.15)' : '#1a2535';
      ctx.strokeStyle = isActive42 ? '#00bcd4' : '#4a6a8a';
      ctx.fillRect(b42 * bw + 1, 1, bw - 2, h - 2);
      ctx.strokeRect(b42 * bw + 1, 1, bw - 2, h - 2);
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    /* Left envelope = Extend: P→A (up left), B→T (down right) */
    var lc = bw / 2;
    drawSmallArrow(lc - 6, h - 10, lc - 6, 10, '#5a8ab5');   /* P→A */
    drawSmallArrow(lc + 6, 10, lc + 6, h - 10, '#5a8ab5');   /* B→T */
    /* Right envelope = Retract: P→B (crossed up right), A→T (crossed down left) */
    var rc = bw + bw / 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rc - 6, h - 10); ctx.lineTo(rc + 6, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rc + 6, h - 10); ctx.lineTo(rc - 6, 10); ctx.stroke();
    /* Port labels */
    ctx.fillStyle = '#6b7a99'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('P', bw * 0.35, h + 10); ctx.fillText('T', bw * 0.65, h + 10);
    ctx.fillText('A', bw * 0.35, -3);    ctx.fillText('B', bw * 0.65, -3);
    /* ── ISO 1219 Actuation (left=actuator; right = spring / detent / another actuator) ── */
    drawDcvEndActuation(1,     'L', actL, false, h);
    var rSpr42 = (actR === 'Spring');
    drawDcvEndActuation(w - 1, 'R', rSpr42 ? 'None' : actR, rSpr42, h);
    /* ── Lever indicator bar ── */
    var leverY = -10; var leverH = 5;
    ctx.fillStyle = '#101828';
    ctx.fillRect(2, leverY, w - 4, leverH);
    ctx.strokeStyle = '#3a4a6a'; ctx.lineWidth = 1;
    ctx.strokeRect(2, leverY, w - 4, leverH);
    ctx.fillStyle = '#4a6080'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('E', bw / 2, leverY - 2);
    ctx.fillText('R', w - bw / 2, leverY - 2);
    var leverX = isRetract ? w - bw / 2 : bw / 2;
    var leverCol = isRetract ? '#ff6666' : '#3ddc84';
    ctx.fillStyle = leverCol;
    ctx.fillRect(leverX - 8, leverY - 1, 16, leverH + 2);
    ctx.fillStyle = '#0a0e14'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(isRetract ? '\u25B6' : '\u25C0', leverX, leverY + 4);
  }

  function drawDCV52Symbol(w, h, comp) {
    /* 5/2 DCV — 2 envelopes, 5 ports: P(mid-bot), T1(left-bot), T2(right-bot), A(left-top), B(right-top) */
    var pos  = (comp && comp.values && comp.values.position) || 'Extend';
    var _actOld52 = (comp && comp.values && comp.values.actuation) || 'Solenoid';
    var actL = (comp && comp.values && comp.values.actuationL) || _actOld52;
    var actR = (comp && comp.values && comp.values.actuationR) || 'Spring';
    var isHov = (hoveredDcv && hoveredDcv.id === comp.id);
    var bw = w / 2;   /* each envelope width */
    if (isHov) { ctx.shadowColor = '#00bcd4'; ctx.shadowBlur = 10; }
    for (var b52 = 0; b52 < 2; b52++) {
      var isAct52 = (pos === 'Extend' && b52 === 0) || (pos === 'Retract' && b52 === 1);
      ctx.fillStyle = isAct52 ? 'rgba(0,188,212,0.15)' : '#1a2535';
      ctx.strokeStyle = isAct52 ? '#00bcd4' : '#4a6a8a';
      ctx.lineWidth = isAct52 ? 2 : 1.5;
      ctx.fillRect(b52 * bw + 1, 1, bw - 2, h - 2);
      ctx.strokeRect(b52 * bw + 1, 1, bw - 2, h - 2);
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    /* Extend envelope (left): P→A (up-left), T2/B-side blocked, T1 drain */
    var lc52 = bw / 2;
    drawSmallArrow(lc52 - 6, h - 10, lc52 - 6, 10, '#5a8ab5');  /* P→A */
    drawSmallArrow(lc52 + 6, 10, lc52 + 6, h - 10, '#5a8ab5');  /* B→T1 */
    /* Retract envelope (right): P→B crossed, A→T2 crossed */
    var rc52 = bw + bw / 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rc52 - 6, h - 10); ctx.lineTo(rc52 + 6, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rc52 + 6, h - 10); ctx.lineTo(rc52 - 6, 10); ctx.stroke();
    /* Port labels */
    ctx.fillStyle = '#6b7a99'; ctx.font = '7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('A', 26, -3); ctx.fillText('B', 74, -3);
    ctx.fillText('T1', 22, h + 10); ctx.fillText('P', 50, h + 10); ctx.fillText('T2', 78, h + 10);
    /* ── ISO 1219 Actuation (left=actuator; right = spring / detent / another actuator) ── */
    drawDcvEndActuation(1,     'L', actL, false, h);
    var rSpr52 = (actR === 'Spring');
    drawDcvEndActuation(w - 1, 'R', rSpr52 ? 'None' : actR, rSpr52, h);
    /* ── Lever indicator bar ── */
    var leverY52 = -10; var leverH52 = 5;
    ctx.fillStyle = '#101828'; ctx.fillRect(2, leverY52, w - 4, leverH52);
    ctx.strokeStyle = '#3a4a6a'; ctx.lineWidth = 1; ctx.strokeRect(2, leverY52, w - 4, leverH52);
    ctx.fillStyle = '#4a6080'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('E', bw / 2, leverY52 - 2); ctx.fillText('R', w - bw / 2, leverY52 - 2);
    var lx52 = (pos === 'Retract') ? w - bw / 2 : bw / 2;
    var lc52col = (pos === 'Retract') ? '#ff6666' : '#3ddc84';
    ctx.fillStyle = lc52col; ctx.fillRect(lx52 - 8, leverY52 - 1, 16, leverH52 + 2);
    ctx.fillStyle = '#0a0e14'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText((pos === 'Retract') ? '\u25B6' : '\u25C0', lx52, leverY52 + 4);
  }

  function drawDCV53Symbol(w, h, comp) {
    /* 5/3 DCV — 3 envelopes, 5 ports: P(mid-bot), T1(left-bot), T2(right-bot), A(left-top), B(right-top) */
    var pos  = (comp && comp.values && comp.values.position)   || 'Center';
    var ct53 = (comp && comp.values && comp.values.centerType) || 'Closed';
    var _actOld53 = (comp && comp.values && comp.values.actuation) || 'Solenoid';
    var actL = (comp && comp.values && comp.values.actuationL) || _actOld53;
    var actR = (comp && comp.values && comp.values.actuationR) || _actOld53;
    var isHov = (hoveredDcv && hoveredDcv.id === comp.id);
    var bw53 = w / 3;
    if (isHov) { ctx.shadowColor = '#00bcd4'; ctx.shadowBlur = 10; }
    for (var b53 = 0; b53 < 3; b53++) {
      var isAct53 = (pos === 'Extend' && b53 === 0) || (pos === 'Center' && b53 === 1) || (pos === 'Retract' && b53 === 2);
      ctx.fillStyle = isAct53 ? 'rgba(0,188,212,0.15)' : '#1a2535';
      ctx.strokeStyle = isAct53 ? '#00bcd4' : '#4a6a8a';
      ctx.lineWidth = isAct53 ? 2 : 1.5;
      ctx.fillRect(b53 * bw53 + 1, 1, bw53 - 2, h - 2);
      ctx.strokeRect(b53 * bw53 + 1, 1, bw53 - 2, h - 2);
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    /* ── Center envelope ── */
    var cmx53 = bw53 + bw53 / 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1;
    if (ct53 === 'Exhaust') {
      /* A→T1 and B→T2 */
      ctx.beginPath();
      ctx.moveTo(cmx53 - 7, 10); ctx.lineTo(cmx53 - 7, h - 10);
      ctx.moveTo(cmx53 + 7, 10); ctx.lineTo(cmx53 + 7, h - 10);
      ctx.stroke();
      /* P blocked */
      ctx.beginPath(); ctx.moveTo(cmx53 - 4, h - 8); ctx.lineTo(cmx53 + 4, h - 8); ctx.stroke();
    } else if (ct53 === 'Pressure') {
      /* P→A and P→B */
      ctx.beginPath();
      ctx.moveTo(cmx53, h - 10); ctx.lineTo(cmx53, h / 2);
      ctx.moveTo(cmx53 - 7, h / 2); ctx.lineTo(cmx53 + 7, h / 2);
      ctx.moveTo(cmx53 - 7, h / 2); ctx.lineTo(cmx53 - 7, 10);
      ctx.moveTo(cmx53 + 7, h / 2); ctx.lineTo(cmx53 + 7, 10);
      ctx.stroke();
    } else {
      /* Closed: X */
      ctx.beginPath();
      ctx.moveTo(cmx53 - 7, 10); ctx.lineTo(cmx53 + 7, h - 10);
      ctx.moveTo(cmx53 + 7, 10); ctx.lineTo(cmx53 - 7, h - 10);
      ctx.stroke();
    }
    /* Extend envelope (left): P→A up, B→T1 down */
    drawSmallArrow(bw53 * 0.35, h - 10, bw53 * 0.35, 10, '#5a8ab5');
    drawSmallArrow(bw53 * 0.65, 10, bw53 * 0.65, h - 10, '#5a8ab5');
    /* Retract envelope (right): P→B crossed, A→T2 crossed */
    var rc53 = 2 * bw53 + bw53 / 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rc53 - 6, h - 10); ctx.lineTo(rc53 + 6, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rc53 + 6, h - 10); ctx.lineTo(rc53 - 6, 10); ctx.stroke();
    /* Port labels */
    ctx.fillStyle = '#6b7a99'; ctx.font = '7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('A', 30, -3); ctx.fillText('B', 90, -3);
    ctx.fillText('T1', 24, h + 10); ctx.fillText('P', 60, h + 10); ctx.fillText('T2', 96, h + 10);
    /* ── ISO 1219 Actuation (spring-centred: springs always on both sides + actuator) ── */
    drawDcvEndActuation(1,     'L', actL, true, h);
    drawDcvEndActuation(w - 1, 'R', actR, true, h);
    /* ── Lever indicator bar ── */
    var leverY53 = -10; var leverH53 = 5;
    ctx.fillStyle = '#101828'; ctx.fillRect(2, leverY53, w - 4, leverH53);
    ctx.strokeStyle = '#3a4a6a'; ctx.lineWidth = 1; ctx.strokeRect(2, leverY53, w - 4, leverH53);
    ctx.fillStyle = '#4a6080'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('E', bw53 / 2, leverY53 - 2);
    ctx.fillText('C', w / 2, leverY53 - 2);
    ctx.fillText('R', w - bw53 / 2, leverY53 - 2);
    var lx53, lc53col;
    if (pos === 'Extend')       { lx53 = bw53 / 2;      lc53col = '#3ddc84'; }
    else if (pos === 'Retract') { lx53 = w - bw53 / 2;  lc53col = '#ff6666'; }
    else                        { lx53 = w / 2;           lc53col = '#ffbb33'; }
    ctx.fillStyle = lc53col; ctx.fillRect(lx53 - 8, leverY53 - 1, 16, leverH53 + 2);
    ctx.fillStyle = '#0a0e14'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    if (pos === 'Extend')       ctx.fillText('\u25C0', lx53, leverY53 + 4);
    else if (pos === 'Retract') ctx.fillText('\u25B6', lx53, leverY53 + 4);
    else                        ctx.fillText('\u25CF', lx53, leverY53 + 4);
  }

  /* ── Sprint 3 draw functions ──────────────────────────────── */

  function drawDCV32NOSymbol(w, h, comp) {
    /* 3/2 Normally-Open: right box = normal (P→A open), left box = shifted (P blocked, A→T) */
    var pos  = (comp && comp.values && comp.values.position) || 'Normal';
    var _actOld32no = (comp && comp.values && comp.values.actuation) || 'Solenoid';
    var actL = (comp && comp.values && comp.values.actuationL) || _actOld32no;
    var actR = (comp && comp.values && comp.values.actuationR) || 'Spring';
    var isHov = (hoveredDcv && hoveredDcv.id === comp.id);
    var bw = w / 2;
    if (isHov) { ctx.shadowColor = '#00bcd4'; ctx.shadowBlur = 10; }
    for (var b = 0; b < 2; b++) {
      /* b=0 = left box = shifted (actuated), b=1 = right box = normal (rest) */
      var isActive = (pos === 'Shifted' && b === 0) || (pos === 'Normal' && b === 1);
      ctx.fillStyle = isActive ? 'rgba(0,188,212,0.15)' : '#1a2535';
      ctx.strokeStyle = isActive ? '#00bcd4' : '#4a6a8a';
      ctx.lineWidth = isActive ? 2 : 1.5;
      ctx.fillRect(b * bw + 1, 1, bw - 2, h - 2);
      ctx.strokeRect(b * bw + 1, 1, bw - 2, h - 2);
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    /* Left box (shifted): A→T (down) — P blocked */
    drawSmallArrow(bw * 0.5, 10, bw * 0.5, h - 10, '#5a8ab5'); /* A→T */
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bw * 0.25, h - 8); ctx.lineTo(bw * 0.75, h - 8); ctx.stroke(); /* P blocked stub */
    /* Right box (normal/open): P→A (up) */
    drawSmallArrow(bw + bw / 2, h - 10, bw + bw / 2, 10, '#5a8ab5');
    /* Port labels */
    ctx.fillStyle = '#6b7a99'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('P', 15, h + 10); ctx.fillText('T', 45, h + 10); ctx.fillText('A', 30, -3);
    /* "NO" badge */
    ctx.fillStyle = '#ffbb33'; ctx.font = 'bold 7px sans-serif';
    ctx.fillText('NO', w / 2, h / 2 + 3);
    /* Actuation */
    drawDcvEndActuation(1,     'L', actL, false, h);
    var rSpr32no = (actR === 'Spring');
    drawDcvEndActuation(w - 1, 'R', rSpr32no ? 'None' : actR, rSpr32no, h);
    /* Lever bar */
    var leverY = -10; var leverH = 5;
    ctx.fillStyle = '#101828'; ctx.fillRect(2, leverY, w - 4, leverH);
    ctx.strokeStyle = '#3a4a6a'; ctx.lineWidth = 1; ctx.strokeRect(2, leverY, w - 4, leverH);
    ctx.fillStyle = '#4a6080'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('S', bw / 2, leverY - 2); ctx.fillText('N', w - bw / 2, leverY - 2);
    var leverX = pos === 'Shifted' ? bw / 2 : w - bw / 2;
    var leverCol = pos === 'Shifted' ? '#ff6666' : '#3ddc84';
    ctx.fillStyle = leverCol; ctx.fillRect(leverX - 8, leverY - 1, 16, leverH + 2);
    ctx.fillStyle = '#0a0e14'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(pos === 'Shifted' ? '\u25B6' : '\u25C0', leverX, leverY + 4);
  }

  function drawValve22NOSymbol(w, h, comp) {
    /* 2/2 Normally-Open: left box = normal (P→A open), right box = shifted (closed) */
    var pos  = (comp && comp.values && comp.values.position) || 'Normal';
    var actL = (comp && comp.values && comp.values.actuationL) || 'Solenoid';
    var actR = (comp && comp.values && comp.values.actuationR) || 'Spring';
    var isHov = (hoveredDcv && hoveredDcv.id === comp.id);
    var bw = w / 2;
    if (isHov) { ctx.shadowColor = '#00bcd4'; ctx.shadowBlur = 10; }
    for (var b = 0; b < 2; b++) {
      var isActive = (pos === 'Normal' && b === 0) || (pos === 'Shifted' && b === 1);
      ctx.fillStyle = isActive ? 'rgba(0,188,212,0.15)' : '#1a2535';
      ctx.strokeStyle = isActive ? '#00bcd4' : '#4a6a8a';
      ctx.lineWidth = isActive ? 2 : 1.5;
      ctx.fillRect(b * bw + 1, 1, bw - 2, h - 2);
      ctx.strokeRect(b * bw + 1, 1, bw - 2, h - 2);
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    /* Left box (normal): P→A arrow up */
    drawSmallArrow(bw / 2, h - 10, bw / 2, 10, '#5a8ab5');
    /* Right box (shifted): blocked X */
    var cx2 = bw + bw / 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx2 - 7, 10); ctx.lineTo(cx2 + 7, h - 10);
    ctx.moveTo(cx2 + 7, 10); ctx.lineTo(cx2 - 7, h - 10);
    ctx.stroke();
    /* Port labels */
    ctx.fillStyle = '#6b7a99'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('P', w / 4, h + 10); ctx.fillText('A', w / 4, -3);
    ctx.fillStyle = '#ffbb33'; ctx.font = 'bold 7px sans-serif';
    ctx.fillText('NO', w / 2, h / 2 + 3);
    /* Actuation */
    drawDcvEndActuation(1,     'L', actL, false, h);
    var rSpr22no = (actR === 'Spring');
    drawDcvEndActuation(w - 1, 'R', rSpr22no ? 'None' : actR, rSpr22no, h);
  }

  function drawIntensifierSymbol(w, h, comp) {
    /* Hydraulic intensifier: large LP piston (left) + small HP piston (right), rod-connected */
    var ratio = (comp && comp.values && comp.values.ratio) || 4;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1.5;
    var midY = h / 2;
    /* Left (LP) barrel — wider */
    var lpW = 26, lpH = 30, lpX = 4, lpY = midY - lpH / 2;
    ctx.fillStyle = '#1a2535'; ctx.fillRect(lpX, lpY, lpW, lpH); ctx.strokeRect(lpX, lpY, lpW, lpH);
    /* Right (HP) barrel — narrower */
    var hpW = 16, hpH = 22, hpX = w - 4 - hpW, hpY = midY - hpH / 2;
    ctx.fillStyle = '#1a2535'; ctx.fillRect(hpX, hpY, hpW, hpH); ctx.strokeRect(hpX, hpY, hpW, hpH);
    /* Connecting rod between pistons */
    ctx.strokeStyle = '#4a6a8a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(lpX + lpW, midY); ctx.lineTo(hpX, midY); ctx.stroke();
    /* LP piston */
    ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(lpX + lpW / 2, lpY + 2); ctx.lineTo(lpX + lpW / 2, lpY + lpH - 2); ctx.stroke();
    /* HP piston */
    ctx.beginPath(); ctx.moveTo(hpX + hpW / 2, hpY + 2); ctx.lineTo(hpX + hpW / 2, hpY + hpH - 2); ctx.stroke();
    /* Oil fill (LP = blue, running) */
    if (running) {
      ctx.fillStyle = 'rgba(0,120,212,0.25)';
      ctx.fillRect(lpX + 1, lpY + 1, lpW / 2 - 1, lpH - 2);
      ctx.fillStyle = 'rgba(255,50,50,0.25)';
      ctx.fillRect(hpX + hpW / 2, hpY + 1, hpW / 2 - 1, hpH - 2);
    }
    /* Port stubs: P (bottom-left), T (bottom-right of LP), HP (top-right) */
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lpX + lpW * 0.3, lpY + lpH); ctx.lineTo(lpX + lpW * 0.3, h); /* P stub down */
    ctx.moveTo(lpX + lpW * 0.7, lpY + lpH); ctx.lineTo(lpX + lpW * 0.7, h); /* T stub down */
    ctx.moveTo(hpX + hpW / 2,   hpY);       ctx.lineTo(hpX + hpW / 2,   0); /* HP stub up */
    ctx.stroke();
    /* Ratio label */
    ctx.fillStyle = '#ffbb33'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(ratio + ':1', w / 2, midY + 3);
    /* Port labels */
    ctx.fillStyle = '#6b7a99'; ctx.font = '7px sans-serif';
    ctx.fillText('P', 15, h + 10); ctx.fillText('T', 45, h + 10); ctx.fillText('HP', 45, -3);
  }

  /* ── Tier 4 ────────────────────────────────────────────────── */

  function drawOrificeSymbol(w, h, comp) {
    /* ISO 1219: fixed orifice — circle with restriction (two opposing arcs), bidirectional */
    var diam = (comp && comp.values && comp.values.diameter) || 1.5;
    var cx = w / 2, cy = h / 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1.5;
    /* Port connection lines */
    ctx.beginPath(); ctx.moveTo(cx, 0);    ctx.lineTo(cx, cy - 11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + 11); ctx.lineTo(cx, h); ctx.stroke();
    /* Outer circle (fixed orifice body) */
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2535'; ctx.fill(); ctx.stroke();
    /* Inner restriction: two opposing arcs forming a venturi */
    ctx.beginPath(); ctx.arc(cx - 4, cy, 8, -0.45, 0.45); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 4, cy, 8, Math.PI - 0.45, Math.PI + 0.45); ctx.stroke();
    /* Diameter annotation */
    ctx.fillStyle = '#ffbb33'; ctx.font = '7px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('\u00D8' + diam, cx, h + 9);
  }

  function drawFlowCheckSymbol(w, h, comp) {
    /* One-way flow control + free-return check (in parallel).
       A→B: throttled by setting; B→A: free check (no restriction). */
    var flowSet = (comp && comp.values && comp.values.flow) || 10;
    var cx = w / 2, cy = h / 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1.5;
    /* Body rectangle */
    ctx.fillStyle = '#1a2535'; ctx.fillRect(4, 5, w - 8, h - 10); ctx.strokeRect(4, 5, w - 8, h - 10);
    /* Port stubs */
    ctx.beginPath(); ctx.moveTo(cx, 0);    ctx.lineTo(cx, 5);     ctx.stroke(); /* B top */
    ctx.beginPath(); ctx.moveTo(cx, h - 5); ctx.lineTo(cx, h);   ctx.stroke(); /* A bottom */
    /* Top half — check valve (free B→A direction, triangle points up / toward B) */
    ctx.beginPath();
    ctx.moveTo(cx,     cy - 4);   /* tip upward */
    ctx.lineTo(cx - 7, cy - 14);
    ctx.lineTo(cx + 7, cy - 14);
    ctx.closePath();
    ctx.fillStyle = '#2a4060'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 7, cy - 14); ctx.lineTo(cx + 7, cy - 14); ctx.stroke();
    /* Bottom half — throttle restriction (A→B controlled direction) */
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy + 4); ctx.lineTo(cx + 7, cy + 12);
    ctx.moveTo(cx - 7, cy + 12); ctx.lineTo(cx + 7, cy + 4);
    ctx.stroke();
    /* Adjustment arrow through the X (indicates adjustable throttle) */
    ctx.beginPath(); ctx.moveTo(cx - 11, cy + 16); ctx.lineTo(cx + 9, cy - 1); ctx.stroke();
    drawSmallArrow(cx + 9, cy - 1, cx + 9, cy - 1, '#5a8ab5');
    /* Flow label */
    ctx.fillStyle = '#5a7a99'; ctx.font = '7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(flowSet + 'L', cx, h + 8);
  }

  function drawSpringCheckSymbol(w, h, comp) {
    /* Spring-loaded check valve: blocks until pressure > cracking pressure.
       ISO 1219: check triangle + spring on sealed side. */
    var crack = (comp && comp.values && comp.values.cracking) || 5;
    var cx = w / 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1.5;
    /* Vertical flow line */
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    /* Check triangle (A→B direction, tip at top) */
    ctx.beginPath();
    ctx.moveTo(cx - 8, h / 2 + 4);
    ctx.lineTo(cx, h / 2 - 9);
    ctx.lineTo(cx + 8, h / 2 + 4);
    ctx.closePath();
    ctx.fillStyle = '#2a4060'; ctx.fill(); ctx.stroke();
    /* Seating bar */
    ctx.beginPath(); ctx.moveTo(cx - 8, h / 2 - 9); ctx.lineTo(cx + 8, h / 2 - 9); ctx.stroke();
    /* Spring below (on the A/inlet side): 4-peak zigzag */
    var spY = h / 2 + 6, spLen = 14, peaks = 4, amp = 3;
    ctx.beginPath(); ctx.moveTo(cx, spY);
    for (var si = 0; si <= peaks; si++) {
      var sy = spY + (si / peaks) * spLen;
      var sx = cx + (si % 2 === 0 ? -amp : amp);
      ctx.lineTo(sx, sy);
    }
    ctx.lineTo(cx, spY + spLen);
    ctx.stroke();
    /* Cracking pressure label */
    ctx.fillStyle = '#ffbb33'; ctx.font = '7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(crack + 'b', cx, h + 9);
  }

  /* ── Tier 5 ────────────────────────────────────────────────── */

  function drawPriorityValveSymbol(w, h, comp) {
    /* Priority flow-control valve: P enters, CF always gets set flow first, EF gets excess.
       ISO-style: spool body rectangle, CF port left, EF port right, P port bottom. */
    var setting = (comp && comp.values && comp.values.setting) || 15;
    var cx = w / 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1.5;
    /* Main body */
    ctx.fillStyle = '#1a2535'; ctx.fillRect(4, 10, w - 8, h - 20); ctx.strokeRect(4, 10, w - 8, h - 20);
    /* Port stubs */
    ctx.beginPath();
    ctx.moveTo(cx, h);     ctx.lineTo(cx, h - 10);    /* P bottom center */
    ctx.moveTo(10, 10);    ctx.lineTo(10, 0);           /* CF top left */
    ctx.moveTo(w - 10, 10); ctx.lineTo(w - 10, 0);     /* EF top right */
    ctx.stroke();
    /* Internal spool: P → CF arrow (priority path) */
    ctx.strokeStyle = '#42a5f5'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, h - 10); ctx.lineTo(10, 10); ctx.stroke();
    drawSmallArrow(10, 10, 10, 10, '#42a5f5');
    /* Internal: P → EF arrow (excess path, dashed) */
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.moveTo(cx, h - 10); ctx.lineTo(w - 10, 10); ctx.stroke();
    ctx.setLineDash([]);
    /* Pressure-sensing spring symbol on CF side */
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1;
    for (var pi = 0; pi < 3; pi++) {
      ctx.beginPath();
      ctx.moveTo(15 + pi * 4, 25); ctx.lineTo(17 + pi * 4, 20);
      ctx.lineTo(19 + pi * 4, 30); ctx.stroke();
    }
    /* CF / EF labels inside */
    ctx.fillStyle = '#42a5f5'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CF', 10, -2);
    ctx.fillStyle = '#5a8ab5';
    ctx.fillText('EF', w - 10, -2);
    /* Setting label */
    ctx.fillStyle = '#ffbb33'; ctx.font = '7px sans-serif';
    ctx.fillText(setting + 'L', cx, h + 9);
  }

  function drawFlowDividerSymbol(w, h, comp) {
    /* 2-way gear-type flow divider: P enters, split to A and B proportionally.
       ISO-style: gear mesh circle + two output arrows. */
    var ratio = (comp && comp.values && comp.values.ratio) || 50;
    var cx = w / 2;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1.5;
    /* Main body */
    ctx.fillStyle = '#1a2535'; ctx.fillRect(4, 10, w - 8, h - 20); ctx.strokeRect(4, 10, w - 8, h - 20);
    /* Port stubs */
    ctx.beginPath();
    ctx.moveTo(cx, h);      ctx.lineTo(cx, h - 10);   /* P bottom */
    ctx.moveTo(10, 10);     ctx.lineTo(10, 0);          /* A top left */
    ctx.moveTo(w - 10, 10);  ctx.lineTo(w - 10, 0);    /* B top right */
    ctx.stroke();
    /* Gear mesh: two overlapping circles */
    ctx.strokeStyle = '#5577aa'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx - 6, h / 2, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 6, h / 2, 7, 0, Math.PI * 2); ctx.stroke();
    /* Internal distribution arrows */
    ctx.strokeStyle = '#42a5f5'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, h - 10); ctx.lineTo(10, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, h - 10); ctx.lineTo(w - 10, 10); ctx.stroke();
    /* A/B split label */
    ctx.fillStyle = '#42a5f5'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('A', 10, -2); ctx.fillText('B', w - 10, -2);
    /* Ratio label */
    ctx.fillStyle = '#ffbb33'; ctx.font = '7px sans-serif';
    ctx.fillText(ratio + '/' + (100 - ratio), cx, h + 9);
  }

  function drawHandPumpSymbol(w, h, comp) {
    /* Manual hand pump: hand lever + pump circle with output arrow.
       ISO 1219: Circle with filled triangle (pump) + T-bar actuator (manual).
       Ports: T (suction from tank) bottom-left, P (pressure out) top-right. */
    var pset = (comp && comp.values && comp.values.pressure) || 50;
    /* Pump circle */
    var pcx = w * 0.62, pcy = h * 0.42, pr = 13;
    ctx.strokeStyle = '#5a8ab5'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2535'; ctx.fill(); ctx.stroke();
    /* Pump triangle (output direction) */
    ctx.beginPath();
    ctx.moveTo(pcx - 7, pcy + 6); ctx.lineTo(pcx - 7, pcy - 6); ctx.lineTo(pcx + 7, pcy);
    ctx.closePath();
    ctx.fillStyle = '#5a8ab5'; ctx.fill();
    /* Port stubs: T (bottom-left), P (top-right from circle) */
    ctx.beginPath();
    ctx.moveTo(pcx - pr, pcy); ctx.lineTo(15, pcy); ctx.lineTo(15, h);   /* T → bottom */
    ctx.moveTo(pcx, pcy - pr); ctx.lineTo(pcx, 0);                         /* P → top */
    ctx.stroke();
    /* Hand lever / T-bar actuator */
    ctx.strokeStyle = '#7a9ac5'; ctx.lineWidth = 2;
    ctx.beginPath();
    /* Pivot point on pump */
    ctx.moveTo(pcx - pr * 0.6, pcy - pr * 0.8);
    ctx.lineTo(pcx - pr * 0.6, pcy - pr * 0.8 - 8);  /* vertical stem up */
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pcx - pr * 0.6 - 8, pcy - pr * 0.8 - 8);
    ctx.lineTo(pcx - pr * 0.6 + 8, pcy - pr * 0.8 - 8); /* horizontal T-bar */
    ctx.stroke();
    /* Pressure label */
    ctx.fillStyle = '#ffbb33'; ctx.font = '7px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 1;
    ctx.fillText(pset + 'b', pcx, h + 9);
  }
 function drawEngineSymbol(w, h, comp) {
    var power = (comp.values && comp.values.power) || 50;
    var rpm = (comp.values && comp.values.rpm) || 1500;
    var cx = w / 2, cy = h / 2;
    
    // ============================================================
    // SÍMBOLO ISO 1219 - MOTOR DE COMBUSTIÓN INTERNA
    // ============================================================
    
    // ── Círculo exterior (carcasa del motor) ──
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2535';
    ctx.fill();
    ctx.strokeStyle = running ? '#66bb6a' : '#5a8ab5';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // ── Letra "M" (Motor) en el centro ──
    ctx.fillStyle = running ? '#66bb6a' : '#aabbdd';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', cx, cy - 2);
    
    // ── Detalles internos (pistones / cilindros) ──
    // Pequeños rectángulos que simulan cilindros en V
    ctx.strokeStyle = '#4a6a8a';
    ctx.lineWidth = 1;
    
    // Cilindro izquierdo (arriba)
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy - 8);
    ctx.lineTo(cx - 8, cy - 14);
    ctx.stroke();
    
    // Cilindro derecho (arriba)
    ctx.beginPath();
    ctx.moveTo(cx + 14, cy - 8);
    ctx.lineTo(cx + 8, cy - 14);
    ctx.stroke();
    
    // Cilindro izquierdo (abajo)
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy + 8);
    ctx.lineTo(cx - 8, cy + 14);
    ctx.stroke();
    
    // Cilindro derecho (abajo)
    ctx.beginPath();
    ctx.moveTo(cx + 14, cy + 8);
    ctx.lineTo(cx + 8, cy + 14);
    ctx.stroke();
    
    // ── Flecha de salida de potencia (hacia arriba) ──
    ctx.strokeStyle = '#ff6666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, 0);
    ctx.stroke();
    
    // Punta de flecha
    ctx.fillStyle = '#ff6666';
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx - 4, 5);
    ctx.lineTo(cx + 4, 5);
    ctx.closePath();
    ctx.fill();
    
    // ── Línea de tierra (símbolo de conexión a masa) ──
    // Pequeño triángulo invertido en la parte inferior
    ctx.fillStyle = '#4a6a8a';
    ctx.beginPath();
    ctx.moveTo(cx - 6, h - 4);
    ctx.lineTo(cx, h);
    ctx.lineTo(cx + 6, h - 4);
    ctx.closePath();
    ctx.fill();
    
    // ── Información de parámetros ──
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    
    // Potencia y RPM (debajo del símbolo)
    ctx.fillStyle = '#aed581';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText(fmtUnitDisp('power', power, 2), cx, h + 6);
    
    ctx.fillStyle = '#667799';
    ctx.font = '7px sans-serif';
    ctx.fillText(rpm + ' RPM', cx, h + 18);
    
    // ── Mostrar estado de funcionamiento ──
    if (running) {
        ctx.fillStyle = '#66bb6a';
        ctx.font = 'bold 6px sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText('● RUNNING', cx, h + 28);
    }
    
    ctx.textBaseline = 'alphabetic';
}
function drawPumpDriveSymbol(w, h, comp) {
  const ctx = window.ctx || document.getElementById('sim-canvas')?.getContext('2d');
  if (!ctx) {
    console.warn('drawPumpDriveSymbol: contexto de canvas no disponible');
    return;
  }

  const numOutputs = Math.min(3, Math.max(1, parseInt(comp?.values?.numOutputs || '2')));
  const ratios = [
    parseFloat(comp?.values?.ratio1) || 1.0,
    parseFloat(comp?.values?.ratio2) || 1.0,
    parseFloat(comp?.values?.ratio3) || 1.0
  ];
  const efficiency = parseFloat(comp?.values?.efficiency) || 92;
  const maxTorque = comp?.values?.maxTorque || 1500;
  const maxInputSpeed = comp?.values?.maxInputSpeed || 3000;
  const maxOutputSpeed = comp?.values?.maxOutputSpeed || 6000;
  
  const cx = w / 2, cy = h / 2;
  
  ctx.save();
  
  /* ── Cuerpo principal ── */
  ctx.fillStyle = '#1a2535';
  ctx.strokeStyle = '#5a8ab5';
  ctx.lineWidth = 1.5;
  
  const rx = 10, ry = 8, rw = w - 20, rh = h - 16, radius = 6;
  ctx.beginPath();
  ctx.moveTo(rx + radius, ry);
  ctx.lineTo(rx + rw - radius, ry);
  ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
  ctx.lineTo(rx + rw, ry + rh - radius);
  ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
  ctx.lineTo(rx + radius, ry + rh);
  ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
  ctx.lineTo(rx, ry + radius);
  ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // ════════════════════════════════════════════════════════
  // ║  MOSTRAR INFORMACIÓN DEL PUMP DRIVE                 ║
  // ║  USAR LOS ARRAYS PARA OBTENER LOS VALORES          ║
  // ════════════════════════════════════════════════════════

  // Datos de entrada
  const inputRPM = comp._inputRPM || 0;
  const inputPower = comp._inputPower || 0;
  const inputTorque = comp._inputTorque || 0;
  
  // Mostrar datos de entrada
  ctx.fillStyle = '#ff6666';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('IN: ' + Math.round(inputRPM) + ' RPM', cx, 7);
  
  ctx.fillStyle = '#667799';
  ctx.font = '6px sans-serif';
  ctx.fillText(fmtUnitDisp('power', inputPower, 1) + '  /  ' + fmtUnitDisp('torque', inputTorque, 1), cx, 16);
  
  /* ── Engranaje central (entrada) ── */
  const gearX = cx, gearY = 28, gearR = 12;
  ctx.strokeStyle = '#00bcd4';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(gearX, gearY, gearR, 0, Math.PI * 2);
  ctx.stroke();
  
  // Dientes del engranaje central
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const x1 = gearX + Math.cos(angle) * (gearR + 2);
    const y1 = gearY + Math.sin(angle) * (gearR + 2);
    const x2 = gearX + Math.cos(angle) * (gearR + 5);
    const y2 = gearY + Math.sin(angle) * (gearR + 5);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  
  // Flecha de entrada
  ctx.strokeStyle = '#ff6666';
  ctx.lineWidth = 1.5;
  const arrowStartY = gearY - gearR - 5;
  ctx.beginPath();
  ctx.moveTo(cx, 22);
  ctx.lineTo(cx, arrowStartY);
  ctx.stroke();
  
  ctx.fillStyle = '#ff6666';
  ctx.beginPath();
  ctx.moveTo(cx, arrowStartY);
  ctx.lineTo(cx - 4, arrowStartY + 5);
  ctx.lineTo(cx + 4, arrowStartY + 5);
  ctx.closePath();
  ctx.fill();
  
  /* ── Engranajes de salida ── */
  const spacing = (w - 30) / (numOutputs + 1);
  const outPositions = [];
  
  for (let j = 0; j < numOutputs; j++) {
    const outX = 15 + spacing * (j + 1);
    const outY = h - 24;
    const outR = 9;
    const ratio = ratios[j] || 1.0;
    
    // ════════════════════════════════════════════════════════
    // ║  OBTENER VALORES DEL ARRAY O DE LAS VARIABLES      ║
    // ║  INDIVIDUALES (para compatibilidad)                ║
    // ════════════════════════════════════════════════════════
    const outputRPM = (comp._outputRPMs && comp._outputRPMs[j] !== undefined) 
                      ? comp._outputRPMs[j] 
                      : (comp['_outputRPM' + (j + 1)] || 0);
    const outputPower = (comp._outputPowers && comp._outputPowers[j] !== undefined) 
                        ? comp._outputPowers[j] 
                        : (comp['_outputPower' + (j + 1)] || 0);
    const outputTorque = (comp._outputTorques && comp._outputTorques[j] !== undefined) 
                         ? comp._outputTorques[j] 
                         : (comp['_outputTorque' + (j + 1)] || 0);
    
    // Engranaje de salida
    ctx.strokeStyle = '#42a5f5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(outX, outY, outR, 0, Math.PI * 2);
    ctx.stroke();
    
    // Dientes del engranaje de salida
    for (let k = 0; k < 6; k++) {
      const angle = (k / 6) * Math.PI * 2;
      const x1 = outX + Math.cos(angle) * (outR + 1.5);
      const y1 = outY + Math.sin(angle) * (outR + 1.5);
      const x2 = outX + Math.cos(angle) * (outR + 4);
      const y2 = outY + Math.sin(angle) * (outR + 4);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    
    // Línea de conexión entre engranajes
    ctx.strokeStyle = '#4a6a8a';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(gearX, gearY + gearR);
    ctx.lineTo(outX, outY - outR);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Flecha de salida
    ctx.strokeStyle = '#42a5f5';
    ctx.lineWidth = 1.5;
    const arrowEndY = outY + outR + 2;
    ctx.beginPath();
    ctx.moveTo(outX, arrowEndY);
    ctx.lineTo(outX, h);
    ctx.stroke();
    
    ctx.fillStyle = '#42a5f5';
    ctx.beginPath();
    ctx.moveTo(outX, h - 1);
    ctx.lineTo(outX - 3, h - 5);
    ctx.lineTo(outX + 3, h - 5);
    ctx.closePath();
    ctx.fill();
    
    outPositions.push(outX);
    
    // ════════════════════════════════════════════════════════
    // ║  MOSTRAR DATOS DE SALIDA                           ║
    // ════════════════════════════════════════════════════════
    
    // Relación de transmisión
    ctx.fillStyle = '#ffbb33';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ratio.toFixed(2) + ':1', outX, outY - outR - 4);
    
    // RPM de salida
    ctx.fillStyle = '#aed581';
    ctx.font = 'bold 7px sans-serif';
    ctx.fillText(Math.round(outputRPM) + ' RPM', outX, h + 8);
    
    // Potencia y torque
    ctx.fillStyle = '#667799';
    ctx.font = '6px sans-serif';
    ctx.fillText(fmtUnitDisp('power', outputPower, 1), outX, h + 16);
    ctx.fillText(fmtUnitDisp('torque', outputTorque, 1), outX, h + 22);
  }
  
  /* ── Información de límites ── */
  ctx.fillStyle = '#667799';
  ctx.font = '5px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Vel.In: ' + maxInputSpeed + ' RPM', 4, h + 6);
  ctx.fillText('Vel.Out: ' + maxOutputSpeed + ' RPM', 4, h + 12);
  ctx.fillText('Torque: ' + fmtUnitDisp('torque', maxTorque, 0), 4, h + 18);
  
  // Eficiencia
  ctx.textAlign = 'right';
  ctx.fillStyle = '#aed581';
  ctx.fillText('η=' + efficiency + '%', w - 4, h + 6);
  
  // Estado del derating
  const derating = comp._totalDerating || 1.0;
  if (derating < 1.0) {
    ctx.fillStyle = '#ff8844';
    ctx.fillText('⚠️ ' + (derating * 100).toFixed(0) + '%', w - 4, h + 12);
  }
  
  /* ── Etiquetas de puertos ── */
  ctx.fillStyle = '#ff6666';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('IN', cx, 22);
  
  ctx.fillStyle = '#42a5f5';
  for (let j = 0; j < numOutputs; j++) {
    const lX = outPositions[j];
    ctx.fillText('OUT' + (j + 1), lX, h + 10);
  }
  
  ctx.restore();
}

  /* ── Tier 2 ────────────────────────────────────────────────── */

  function drawRotaryActSymbol(w, h, comp) {
    var cx = w / 2, cy = h / 2;
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, h / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    /* Rotation indicator */
    var rot = comp ? (comp.rotation || 0) : 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.strokeStyle = running ? '#66bb6a' : '#5a8ab5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(h / 2 - 6, 0);
    ctx.stroke();
    ctx.restore();
    /* Pinion teeth marks */
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 0.8;
    for (var a = 0; a < 2 * Math.PI; a += Math.PI / 6) {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (h / 2 - 4), cy + Math.sin(a) * (h / 2 - 4));
      ctx.lineTo(cx + Math.cos(a) * (h / 2 - 1), cy + Math.sin(a) * (h / 2 - 1));
      ctx.stroke();
    }
    /* Swing angle label */
    ctx.fillStyle = '#667799';
    ctx.font = '6px sans-serif';
    ctx.textAlign = 'center';
    var ang = comp && comp.values ? (comp.values.angle || 180) : 180;
    ctx.fillText(ang + '\u00B0', cx, h + 8);
  }

  function drawPropDCVSymbol(w, h, comp) {
    /* 4/3 envelope with proportional control indicator (angled lines) */
    var cmd = (comp && comp.values && comp.values.command) || 0;
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    var envW = (w - 4) / 3;
    for (var e = 0; e < 3; e++) {
      ctx.fillRect(2 + e * envW, 8, envW, h - 16);
      ctx.strokeRect(2 + e * envW, 8, envW, h - 16);
    }
    /* Highlight active envelope based on command sign */
    var activeIdx = 1; /* center by default */
    if (cmd > 10) activeIdx = 0;
    else if (cmd < -10) activeIdx = 2;
    ctx.fillStyle = 'rgba(102,187,106,0.18)';
    ctx.fillRect(2 + activeIdx * envW, 8, envW, h - 16);
    /* Two parallel envelope lines = proportional symbol */
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(2, 10); ctx.lineTo(w - 2, 10); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(2, h - 10); ctx.lineTo(w - 2, h - 10); ctx.stroke();
    /* Command label */
    ctx.fillStyle = running && Math.abs(cmd) > 0.1 ? '#aed581' : '#667799';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((cmd > 0 ? '+' : '') + cmd + '%', w / 2, h / 2 + 3);
    /* Label */
    ctx.fillStyle = '#667799';
    ctx.font = '6px sans-serif';
    ctx.fillText('PROP 4/3', w / 2, h + 8);
  }

  function drawPropReliefSymbol(w, h, comp) {
    var cmd = (comp && comp.values && comp.values.command) || 80;
    var maxP = (comp && comp.values && comp.values.maxSetting) || 250;
    var eff = Math.round(maxP * cmd / 100);
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.fillRect(4, 8, w - 8, h - 16);
    ctx.strokeRect(4, 8, w - 8, h - 16);
    /* Arrow */
    var cx = w / 2;
    ctx.strokeStyle = '#42a5f5';
    ctx.beginPath();
    ctx.moveTo(cx, h - 10);
    ctx.lineTo(cx, 10);
    ctx.stroke();
    /* Proportional adjustment arrow (angled, electrical control) */
    ctx.strokeStyle = '#ffb74d';
    ctx.beginPath();
    ctx.moveTo(w - 6, h - 6);
    ctx.lineTo(6, 6);
    ctx.stroke();
    /* Effective setting label */
    ctx.fillStyle = '#aed581';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fmtUnitDisp('pressure', eff, 0), cx, h - 4);
  }

  function drawPropFlowSymbol(w, h, comp) {
    var cmd = (comp && comp.values && comp.values.command) || 50;
    var maxF = (comp && comp.values && comp.values.maxFlow) || 40;
    var eff = Math.round(maxF * cmd / 100);
    var cx = w / 2;
    /* Diamond body */
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, 4);
    ctx.lineTo(w - 4, h / 2);
    ctx.lineTo(cx, h - 4);
    ctx.lineTo(4, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    /* Electrical coil indicator */
    ctx.strokeStyle = '#ffb74d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w - 4, h / 2);
    ctx.lineTo(w + 4, h / 2);
    ctx.stroke();
    /* Proportional arrow through body */
    ctx.strokeStyle = '#ffb74d';
    ctx.beginPath();
    ctx.moveTo(4, h - 4);
    ctx.lineTo(w - 4, 4);
    ctx.stroke();
    /* Effective flow */
    ctx.fillStyle = '#aed581';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fmtUnitDisp('flow', eff, 1), cx, h - 10);
  }

  function drawPumpVarSymbol(w, h, comp) {
    /* Base pump symbol + displacement arrow through it (variable disp) */
    drawPumpSymbol(w, h, comp);
    /* Diagonal arrow overlay = variable displacement */
    ctx.strokeStyle = '#ffb74d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(10, h - 6);
    ctx.lineTo(w - 10, 6);
    ctx.stroke();
    /* Arrowhead */
    ctx.fillStyle = '#ffb74d';
    ctx.beginPath();
    ctx.moveTo(w - 10, 6);
    ctx.lineTo(w - 14, 8);
    ctx.lineTo(w - 12, 12);
    ctx.closePath();
    ctx.fill();
    /* Displacement % */
    var disp = comp && comp.values ? (comp.values.displacement || 100) : 100;
    ctx.fillStyle = running ? '#aed581' : '#667799';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(disp + '%', w / 2, h + 8);
  }

  
function drawPumpVarDisplacementSymbol(w, h, comp) {
    var cx = w / 2;
    var cy = h / 2;
    
    // ============================================================
    // SÍMBOLO ISO 1219 - BOMBA DE DESPLAZAMIENTO VARIABLE
    // ============================================================
    
    // ── Círculo principal ──
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2535';
    ctx.fill();
    ctx.strokeStyle = running ? '#ff6666' : '#5a8ab5';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // ── Triángulo (dirección de flujo) ──
    // El triángulo apunta hacia la dirección del flujo (hacia arriba/salida)
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);           // Vértice superior
    ctx.lineTo(cx - 8, cy + 6);         // Base izquierda
    ctx.lineTo(cx + 8, cy + 6);         // Base derecha
    ctx.closePath();
    ctx.fillStyle = running ? '#ff4444' : '#5a8ab5';
    ctx.fill();
    ctx.strokeStyle = running ? '#ff4444' : '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // ── Flecha diagonal (desplazamiento variable) ──
    // Esta flecha diagonal indica que la cilindrada es ajustable
    ctx.strokeStyle = '#ffb74d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy + 12);
    ctx.lineTo(cx + 12, cy - 12);
    ctx.stroke();
    
    // Punta de flecha en el extremo superior derecho
    ctx.fillStyle = '#ffb74d';
    ctx.beginPath();
    ctx.moveTo(cx + 12, cy - 12);
    ctx.lineTo(cx + 6, cy - 14);
    ctx.lineTo(cx + 8, cy - 8);
    ctx.closePath();
    ctx.fill();
    
    // ── Puerto de entrada (IN / eje de entrada) ──
    // Línea horizontal que entra por el lado izquierdo
    ctx.strokeStyle = '#42a5f5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(cx - 18, cy);
    ctx.stroke();
    
    // Marcador "IN" en el puerto de entrada
    ctx.fillStyle = '#42a5f5';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('IN', 8, cy);
    
    // ── Puerto de salida (P / presión) ──
    // Línea vertical que sale por la parte superior
    ctx.strokeStyle = '#ff6666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 18);
    ctx.lineTo(cx, 0);
    ctx.stroke();
    
    // Marcador "P" en el puerto de salida
    ctx.fillStyle = '#ff6666';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('P', cx, 4);
    
    // ── Puerto de retorno (T / tanque) ──
    // Línea diagonal que sale por la parte inferior derecha
    ctx.strokeStyle = '#cd7f32';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 16, cy + 12);
    ctx.lineTo(w, h);
    ctx.stroke();
    
    // Marcador "T" en el puerto de retorno
    ctx.fillStyle = '#cd7f32';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('T', w - 14, h - 2);
    
    // ── Información de parámetros (debajo del símbolo) ──
    var dispPct = (comp.values && comp.values.displacementPct) || 100;
    var displacement = (comp.values && comp.values.displacement) || 28;
    var actualDisp = displacement * (dispPct / 100);
    
    // Mostrar la cilindrada actual
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aed581';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText(fmtUnitDisp('displacement', actualDisp, 1), cx, h + 6);
    
    // Mostrar el porcentaje de desplazamiento
    ctx.fillStyle = '#ffb74d';
    ctx.font = '7px sans-serif';
    ctx.fillText(dispPct + '%', cx, h + 18);
    
    // ── Mostrar valores dinámicos (si está corriendo) ──
    if (running) {
        var pressure = comp._pressure || 0;
        var flow = comp._actualFlow || 0;
        var power = comp._hydraulicPower || 0;
        
        // Presión
        ctx.fillStyle = pressure > 100 ? '#ff4444' : '#ff8844';
        ctx.font = 'bold 7px sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.fillText(fmtUnitDisp('pressure', pressure, 0), cx, cy - 20);
        
        // Flujo
        ctx.fillStyle = '#4488ff';
        ctx.font = '7px sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(fmtUnitDisp('flow', flow, 1), cx, cy + 20);
        
        // Potencia (abajo, en una línea separada)
        ctx.fillStyle = '#667799';
        ctx.font = '6px sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(fmtUnitDisp('power', power, 1), cx, h + 26);
        
        // Torque ratio (si está limitado)
        if (comp._torqueRatio && comp._torqueRatio < 1.0) {
            ctx.fillStyle = '#ff8844';
            ctx.font = '6px sans-serif';
            ctx.fillText('⚠ ' + (comp._torqueRatio * 100).toFixed(0) + '%', cx, h + 34);
        }
    }
    
    ctx.textBaseline = 'alphabetic';
}
function drawPoclainMS35Symbol(w, h, comp) {
    var cx = w / 2, cy = h / 2;
    var active = running && comp._rpm > 0;
    var torque = comp._torque || 0;
    var rpm = comp._rpm || 0;
    var pressure = comp._localPressure || 0;
    
    // ============================================================
    // SÍMBOLO ISO 1219 - MOTOR HIDRÁULICO LSHT
    // ============================================================
    
    // ── Círculo exterior (carcasa) ──
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2535';
    ctx.fill();
    ctx.strokeStyle = active ? '#3ddc84' : '#5a8ab5';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    
    // ── Triángulo (motor - flujo entra) ──
    // El triángulo apunta hacia el centro (el flujo entra al motor)
    ctx.beginPath();
    ctx.moveTo(cx, cy);                  // Vértice en el centro
    ctx.lineTo(cx - 8, cy - 12);         // Esquina superior izquierda
    ctx.lineTo(cx - 8, cy + 12);         // Esquina inferior izquierda
    ctx.closePath();
    ctx.fillStyle = active ? '#66bb6a' : '#5a8ab5';
    ctx.fill();
    ctx.strokeStyle = active ? '#3ddc84' : '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // ── Segundotriángulo (motor bidireccional) ──
    ctx.beginPath();
    ctx.moveTo(cx, cy);                  // Vértice en el centro
    ctx.lineTo(cx + 8, cy - 12);         // Esquina superior derecha
    ctx.lineTo(cx + 8, cy + 12);         // Esquina inferior derecha
    ctx.closePath();
    ctx.fillStyle = 'rgba(90, 138, 181, 0.3)';
    ctx.fill();
    ctx.strokeStyle = active ? '#66bb6a' : '#5a8ab5';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // ── Indicador de giro (rotación) ──
    if (active) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(comp.rotation || 0);
        
        // Flecha de rotación
        ctx.strokeStyle = '#ffbb33';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0.2, Math.PI * 1.2);
        ctx.stroke();
        
        // Punta de flecha
        var angle = Math.PI * 1.2;
        ctx.fillStyle = '#ffbb33';
        ctx.beginPath();
        ctx.moveTo(18 * Math.cos(angle), 18 * Math.sin(angle));
        ctx.lineTo(16 * Math.cos(angle - 0.3), 16 * Math.sin(angle - 0.3));
        ctx.lineTo(16 * Math.cos(angle + 0.3), 16 * Math.sin(angle + 0.3));
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }
    
    // ── Detalles internos (engranaje LSHT) ──
    // Círculo interior con dientes
    ctx.strokeStyle = '#4a6a8a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.stroke();
    
    // Dientes del engranaje
    for (var i = 0; i < 8; i++) {
        var angle = (i / 8) * Math.PI * 2;
        var r1 = 12;
        var r2 = active ? 15 : 14;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
        ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
        ctx.strokeStyle = active ? '#66bb6a' : '#4a6a8a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
    
    // ── Punto central (eje de salida) ──
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#ffbb33' : '#4a6a8a';
    ctx.fill();
    ctx.strokeStyle = '#1a2535';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // ── Puerto de drenaje (D) ──
    ctx.fillStyle = '#cd7f32';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('D', cx, cy + 28);
    
    // ── Datos de rendimiento ──
    if (active) {
        // RPM
        ctx.fillStyle = '#aed581';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(Math.round(rpm) + ' RPM', cx, cy - 28);
        
        // Torque (abajo)
        ctx.fillStyle = '#ff8844';
        ctx.font = 'bold 7px sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(fmtUnitDisp('torque', torque, 0), cx, cy + 32);
        
        // Presión
        ctx.fillStyle = pressure > 200 ? '#ff4444' : '#4488ff';
        ctx.font = '6px sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(fmtUnitDisp('pressure', pressure, 0), cx, cy + 40);
    } else {
        // Etiqueta "LSHT" cuando está parado
        ctx.fillStyle = '#667799';
        ctx.font = 'bold 6px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('LSHT', cx, cy + 28);
    }
    
    // ── Etiquetas de puertos ──
    ctx.fillStyle = '#4488ff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', -6, cy);
    ctx.fillText('B', w + 6, cy);
    
    ctx.textBaseline = 'alphabetic';
}
  function drawMotorBidirSymbol(w, h, comp) {
    var cx = w / 2, cy = h / 2;
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, h / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    /* Two triangles pointing OPPOSITE ways = bi-directional */
    ctx.fillStyle = running ? '#66bb6a' : '#5a8ab5';
    ctx.beginPath();
    ctx.moveTo(cx + 8, cy);
    ctx.lineTo(cx - 2, cy - 7);
    ctx.lineTo(cx - 2, cy + 7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    ctx.lineTo(cx + 2, cy - 7);
    ctx.lineTo(cx + 2, cy + 7);
    ctx.closePath();
    ctx.fill();
    /* M label */
    ctx.fillStyle = '#aed581';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('M', cx, h + 8);
  }

  /* ── Tier 3 ────────────────────────────────────────────────── */

  function drawTempGaugeSymbol(w, h, comp) {
    var cx = w / 2;
    /* Thermometer bulb */
    ctx.fillStyle = '#0d1625';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, 30, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    /* Stem */
    ctx.beginPath();
    ctx.moveTo(cx - 2, 30);
    ctx.lineTo(cx - 2, 8);
    ctx.lineTo(cx + 2, 8);
    ctx.lineTo(cx + 2, 30);
    ctx.stroke();
    /* Mercury fill */
    var temp = comp ? (comp.reading || 40) : 40;
    var fillY = 30 - ((temp - 0) / 100) * 22;
    ctx.fillStyle = '#ff6644';
    ctx.fillRect(cx - 1, Math.max(8, fillY), 2, 30 - Math.max(8, fillY));
    /* Bulb fill */
    ctx.beginPath();
    ctx.arc(cx, 30, 5, 0, Math.PI * 2);
    ctx.fill();
    /* Reading */
    ctx.fillStyle = '#aed581';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(temp.toFixed(0) + '\u00B0', cx, h - 4);
  }

  function drawHeaterSymbol(w, h, comp) {
    var active = !!(running && comp);
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = active ? '#ff6644' : '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.fillRect(4, 4, w - 8, h - 8);
    ctx.strokeRect(4, 4, w - 8, h - 8);
    /* Heating element = wavy line */
    ctx.strokeStyle = active ? '#ff6644' : '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(8, h / 2);
    for (var wx = 8; wx < w - 8; wx += 6) {
      ctx.quadraticCurveTo(wx + 3, h / 2 - 4, wx + 6, h / 2);
    }
    ctx.stroke();
    /* Power label */
    ctx.fillStyle = active ? '#ff9944' : '#667799';
    ctx.font = '6px sans-serif';
    ctx.textAlign = 'center';
    var pw = comp && comp.values ? (comp.values.power || 3) : 3;
    ctx.fillText(pw + 'kW', w / 2, h + 8);
  }

  function drawPressureTransducerSymbol(w, h, comp) {
    /* Circle with PT label + electrical output lead */
    var cx = w / 2;
    var dialCY = 16, radius = 13;
    ctx.fillStyle = '#0d1625';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, dialCY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    /* Electrical output lead (arrow to right) */
    ctx.strokeStyle = '#ffb74d';
    ctx.beginPath();
    ctx.moveTo(cx + radius, dialCY);
    ctx.lineTo(cx + radius + 4, dialCY);
    ctx.stroke();
    /* PT label */
    ctx.fillStyle = '#667799';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PT', cx, dialCY);
    /* Reading */
    var reading = comp ? (comp.reading || 0) : 0;
    ctx.fillStyle = running && reading > 0.1 ? '#aed581' : '#667799';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText(fmtUnitDisp('pressure', reading, 0), cx, h - 10);
    ctx.textBaseline = 'alphabetic';
  }

  function drawTelescopicCylSymbol(w, h, comp) {
    /* Multi-stage telescopic cylinder */
    var stages = (comp && comp.values && comp.values.stages) || 3;
    var ext = comp ? (comp.extension || 0) : 0;
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = '#5a8ab5';
    ctx.lineWidth = 1.5;
    /* Outer barrel */
    ctx.fillRect(4, 4, w - 8, h - 8);
    ctx.strokeRect(4, 4, w - 8, h - 8);
    /* Stages (nested) */
    var stageW = (w - 8) / stages;
    for (var s = 1; s < stages; s++) {
      var stageExt = stageW * s * ext;
      ctx.strokeStyle = '#5a8ab5';
      ctx.lineWidth = 1;
      ctx.strokeRect(4 + stageExt, 4 + s * 2, stageW * (stages - s) - stageExt, h - 8 - s * 4);
    }
    /* Label */
    ctx.fillStyle = '#667799';
    ctx.font = '6px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TEL \u00D7' + stages, w / 2, h + 8);
  }

  function drawLimitSwitchHydSymbol(w, h, comp) {
    var tripped = !!(running && comp && comp._limitTripped);
    ctx.fillStyle = '#1a2535';
    ctx.strokeStyle = tripped ? '#66bb6a' : '#5a8ab5';
    ctx.lineWidth = tripped ? 2 : 1.5;
    ctx.fillRect(4, 4, w - 8, h - 8);
    ctx.strokeRect(4, 4, w - 8, h - 8);
    /* Lever arm */
    var cx = w / 2, cy = h / 2;
    ctx.strokeStyle = tripped ? '#66bb6a' : '#5a8ab5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    if (tripped) ctx.lineTo(cx + 8, cy);
    else         ctx.lineTo(cx + 6, cy - 6);
    ctx.stroke();
    /* Contact dots */
    ctx.fillStyle = tripped ? '#66bb6a' : '#5a8ab5';
    ctx.beginPath();
    ctx.arc(cx - 8, cy, 1.5, 0, Math.PI * 2);
    ctx.arc(cx + 8, cy, 1.5, 0, Math.PI * 2);
    ctx.fill();
    /* Label */
    ctx.fillStyle = tripped ? '#aed581' : '#667799';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tripped ? 'TRIP' : 'LS', cx, h - 6);
    /* Linked cyl id */
    var linkId = comp && comp.values ? (comp.values.linkedCylinder || 0) : 0;
    if (linkId > 0) {
      ctx.fillStyle = '#5a8ab5';
      ctx.font = '6px sans-serif';
      ctx.fillText('\u2192#' + linkId, cx, h + 8);
    }
  }

  function markPathsDirty() { /* no-op: recomputePaths runs every draw */ }

  function hitTestComponent(mx, my) {
    var margin = 4 * _touchScale();
    for (var i = components.length - 1; i >= 0; i--) {
      var c = components[i];
      var ed = getEffectiveDims(c);
      if (mx >= c.x - margin && mx <= c.x + ed.w + margin && my >= c.y - margin && my <= c.y + ed.h + margin) {
        return c;
      }
    }
    return null;
  }

  function hitTestPort(mx, my) {
    /* Enlarged to 12px base (19px on touch devices) for easier port targeting */
    var r = 12 * _touchScale();
    var rSq = r * r;
    for (var i = 0; i < components.length; i++) {
      var c = components[i];
      var def = COMP_DEFS[c.type];
      for (var p = 0; p < def.ports.length; p++) {
        var wp = getPortWorldPos(c, p);
        var dx = mx - wp.x, dy = my - wp.y;
        if (dx * dx + dy * dy < rSq) {
          return { compId: c.id, portIdx: p };
        }
      }
    }
    return null;
  }

  function canvasCoords(e) {
    var rect = canvas.getBoundingClientRect();
    var sx = (e.clientX - rect.left) * (W / rect.width);
    var sy = (e.clientY - rect.top) * (H / rect.height);
    return { x: (sx - viewOffX) / viewScale, y: (sy - viewOffY) / viewScale };
  }

  /* Raw screen-space coordinates (used by annotation system) */
  function getCanvasPosSafe(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
  }

  /* ================================================================
     INTERACTION — CANVAS EVENTS
     ================================================================ */

  /* ── DCV click-to-set helper ──────────────────────────────── */
  function setDcvPositionByClick(comp, mx, my) {
    saveUndoState();
    var def = COMP_DEFS[comp.type];
    var orient = comp.orient || 0;
    var localX, localY;
    
    // Convertir coordenadas del canvas a coordenadas locales del componente
    // considerando la rotación (0°, 90°, 180°, 270°)
    switch(orient) {
        case 0: // 0° - sin rotación
            localX = mx - comp.x;
            localY = my - comp.y;
            break;
        case 1: // 90° - rotación horaria
            localX = my - comp.y;
            localY = comp.x + def.w - mx;
            break;
        case 2: // 180° - rotación completa
            localX = comp.x + def.w - mx;
            localY = comp.y + def.h - my;
            break;
        case 3: // 270° - rotación antihoraria
            localX = comp.y + def.h - my;
            localY = mx - comp.x;
            break;
        default:
            localX = mx - comp.x;
            localY = my - comp.y;
    }
    
    // Determinar la posición según el tipo de válvula y la coordenada X local
    if (comp.type === 'dcv43') {
        var bw = def.w / 3;
        if (localX < bw) {
            comp.values.position = 'Extend';
        } else if (localX < 2 * bw) {
            comp.values.position = 'Center';
        } else {
            comp.values.position = 'Retract';
        }
    } else if (comp.type === 'dcv42') {
        var bw42 = def.w / 2;
        if (localX < bw42) {
            comp.values.position = 'Extend';
        } else {
            comp.values.position = 'Retract';
        }
    } else if (comp.type === 'dcv32') {
        var bw2 = def.w / 2;
        if (localX < bw2) {
            comp.values.position = 'Open';
        } else {
            comp.values.position = 'Closed';
        }
    } else if (comp.type === 'valve22') {
        var bw3 = def.w / 2;
        if (localX < bw3) {
            comp.values.position = 'Open';
        } else {
            comp.values.position = 'Closed';
        }
    } else if (comp.type === 'dcv52') {
        var bw52c = def.w / 2;
        if (localX < bw52c) {
            comp.values.position = 'Extend';
        } else {
            comp.values.position = 'Retract';
        }
    } else if (comp.type === 'dcv32no') {
        var bw32noc = def.w / 2;
        if (localX < bw32noc) {
            comp.values.position = 'Shifted';
        } else {
            comp.values.position = 'Normal';
        }
    } else if (comp.type === 'valve22no') {
        var bw22noc = def.w / 2;
        if (localX < bw22noc) {
            comp.values.position = 'Normal';
        } else {
            comp.values.position = 'Shifted';
        }
    } else if (comp.type === 'dcv53') {
        var bw53c = def.w / 3;
        if (localX < bw53c) {
            comp.values.position = 'Extend';
        } else if (localX < 2 * bw53c) {
            comp.values.position = 'Center';
        } else {
            comp.values.position = 'Retract';
        }
    }
    
    /* Actualizar el panel de propiedades si está mostrando este componente */
    if (selectedComp && selectedComp.id === comp.id) {
        showProperties(comp);
    }
    
    /* Recalcular el circuito inmediatamente */
    if (running) computeCircuit();
    draw();
}

  /* updateDcvPositions() vive ahora en js/core/simulation/dcv-positions.js (etapa E1) */

  /* Annotation event listeners — registered BEFORE circuit handlers so annConsumed flag works */
  canvas.addEventListener('pointerdown', onAnnPointerDown);
  canvas.addEventListener('pointermove', onAnnPointerMove);
  canvas.addEventListener('pointerup', onAnnPointerUp);
  canvas.addEventListener('pointerleave', function () { annCursorPos = null; if (annTool === 'sketch' || annTool === 'shape') draw(); });
  canvas.addEventListener('dblclick', function (e) {
    if (annTool !== 'move') return;
    var dpos = getCanvasPosSafe(e);
    var dhit = findNearestAnnotation(dpos.x, dpos.y);
    if (dhit && dhit.type === 'shape') {
      var ds = annShapes[dhit.idx];
      if (ds && ds.type === 'text') editTextShape(dhit.idx, ds);
    }
  });

  canvas.addEventListener('pointerdown', function (e) {
    if (mode !== 'simulate') return;
    if (annConsumed) return; /* Annotation handler already handled this */
    var pos = canvasCoords(e);

    /* Pre-check: does this touch hit anything interactive? */
    var hitsAnything = connectingFrom || hitTestPort(pos.x, pos.y) || hitTestComponent(pos.x, pos.y) || hitTestConnection(pos.x, pos.y) >= 0;
    if (hitsAnything) e.preventDefault();

    /* Check port click first */
    var port = hitTestPort(pos.x, pos.y);
    if (port) {
      if (connectingFrom) {
        /* Complete connection */
        if (port.compId !== connectingFrom.compId) {
          var isDuplicate = connections.some(function (cn) {
            return (cn.from.compId === connectingFrom.compId && cn.from.portIdx === connectingFrom.portIdx &&
                    cn.to.compId === port.compId && cn.to.portIdx === port.portIdx) ||
                   (cn.from.compId === port.compId && cn.from.portIdx === port.portIdx &&
                    cn.to.compId === connectingFrom.compId && cn.to.portIdx === connectingFrom.portIdx);
          });
          if (!isDuplicate) {
            saveUndoState();
            var newConn = {
              from: { compId: connectingFrom.compId, portIdx: connectingFrom.portIdx },
              to: { compId: port.compId, portIdx: port.portIdx },
              pressure: 0
            };
            /* Attach manual waypoints if user clicked intermediate points */
            if (connectingFrom._waypoints && connectingFrom._waypoints.length > 0) {
              newConn.waypoints = connectingFrom._waypoints.slice();
            }
            connections.push(newConn);
            markPathsDirty();
          }
        }
        connectingFrom = null;
      } else {
        /* Start connection */
        connectingFrom = { compId: port.compId, portIdx: port.portIdx };
      }
      draw();
      return;
    }

    /* Add waypoint when clicking empty space during connection */
    if (connectingFrom) {
      if (!connectingFrom._waypoints) connectingFrom._waypoints = [];
      /* Snap relative to the stub position (not raw port) for the first waypoint,
         so the first segment after the exit stub is orthogonal */
      var prevPt;
      if (connectingFrom._waypoints.length > 0) {
        prevPt = connectingFrom._waypoints[connectingFrom._waypoints.length - 1];
      } else {
        var fromC = findComp(connectingFrom.compId);
        if (fromC) {
          var fromDef = COMP_DEFS[fromC.type];
          var fromP = fromDef.ports[connectingFrom.portIdx];
          var portPos = { x: fromC.x + fromP.x, y: fromC.y + fromP.y };
          prevPt = applyStub(portPos, fromP.dir, 20);
        } else {
          prevPt = getPortWorldPos2(connectingFrom);
        }
      }
      var dx = Math.abs(pos.x - prevPt.x);
      var dy = Math.abs(pos.y - prevPt.y);
      var snapped;
      /* Snap orthogonally relative to previous point AND to the routing grid */
      if (dx <= dy) {
        snapped = { x: prevPt.x, y: snapToGrid(pos.y) };
      } else {
        snapped = { x: snapToGrid(pos.x), y: prevPt.y };
      }
      if (Math.abs(snapped.x - prevPt.x) > 2 || Math.abs(snapped.y - prevPt.y) > 2) {
        connectingFrom._waypoints.push(snapped);
      }
      draw();
      return;
    }

    /* Check component click */
    var comp = hitTestComponent(pos.x, pos.y);
    if (comp) {
      selectedComp = comp;
      selectedConn = -1;
      draggingComp = comp;
      dragOffX = pos.x - comp.x;
      dragOffY = pos.y - comp.y;
      dragStartX = pos.x;
      dragStartY = pos.y;
      dragMoved = false;
      showProperties(comp);
      draw();
      return;
    }

    /* Check connection click — also start segment drag if on a segment.
       Tap-vs-drag: record candidate segment but don't commit to drag until
       pointermove exceeds DRAG_THRESHOLD_PX. Prevents accidental seg moves on touch. */
    var connIdx = hitTestConnection(pos.x, pos.y);
    if (connIdx >= 0) {
      selectedConn = connIdx;
      selectedComp = null;
      propsPanel.style.display = 'none';
    hideComponentGuide();
      var segHit = hitTestSegment(pos.x, pos.y);
      if (segHit && segHit.connIdx === connIdx) {
        pendingSegDrag = {
          segHit: segHit,
          startX: pos.x,
          startY: pos.y,
          startClientX: e.clientX,
          startClientY: e.clientY
        };
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* old browser */ }
      }
      draw();
      return;
    }

    /* Empty canvas click — deselect all */
    selectedComp = null;
    selectedConn = -1;
    propsPanel.style.display = 'none';
    hideComponentGuide();
    draw();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (mode !== 'simulate') return;
    if (annDrag || isPanning || annActiveStroke || annActiveShape) return;
    if (draggingComp || draggingSegInfo || connectingFrom || pendingSegDrag) e.preventDefault();
    var pos = canvasCoords(e);

    /* Tap-vs-drag commit: convert pending → real drag past threshold */
    if (pendingSegDrag && !draggingSegInfo) {
      var pdx = e.clientX - pendingSegDrag.startClientX;
      var pdy = e.clientY - pendingSegDrag.startClientY;
      if ((pdx * pdx + pdy * pdy) >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        var sh = pendingSegDrag.segHit;
        saveUndoState();
        convertToWaypoints(sh.connIdx);
        var wpA0 = sh.segIdx - 3;
        var wpB0 = sh.segIdx - 2;
        var wps0 = connections[sh.connIdx].waypoints;
        draggingSegInfo = {
          connIdx: sh.connIdx,
          axis: sh.axis,
          startVal: (sh.axis === 'y') ? pendingSegDrag.startY : pendingSegDrag.startX,
          wpIdxA: wpA0,
          wpIdxB: wpB0,
          origA: (wpA0 >= 0 && wpA0 < wps0.length) ? { x: wps0[wpA0].x, y: wps0[wpA0].y } : null,
          origB: (wpB0 >= 0 && wpB0 < wps0.length) ? { x: wps0[wpB0].x, y: wps0[wpB0].y } : null
        };
        pendingSegDrag = null;
        canvas.style.cursor = 'grabbing';
      }
    }

    /* Handle segment dragging — grid-quantised delta */
    if (draggingSegInfo) {
      var conn = connections[draggingSegInfo.connIdx];
      if (!conn || !conn.waypoints) { draggingSegInfo = null; return; }
      var rawDelta = (draggingSegInfo.axis === 'y')
        ? (pos.y - draggingSegInfo.startVal)
        : (pos.x - draggingSegInfo.startVal);
      var delta = Math.round(rawDelta / ROUTE_GRID) * ROUTE_GRID;
      var wps = conn.waypoints;
      /* Move waypoint A on the drag axis */
      if (draggingSegInfo.origA && draggingSegInfo.wpIdxA >= 0 && draggingSegInfo.wpIdxA < wps.length) {
        if (draggingSegInfo.axis === 'y') {
          wps[draggingSegInfo.wpIdxA].y = draggingSegInfo.origA.y + delta;
        } else {
          wps[draggingSegInfo.wpIdxA].x = draggingSegInfo.origA.x + delta;
        }
      }
      /* Move waypoint B on the drag axis */
      if (draggingSegInfo.origB && draggingSegInfo.wpIdxB >= 0 && draggingSegInfo.wpIdxB < wps.length) {
        if (draggingSegInfo.axis === 'y') {
          wps[draggingSegInfo.wpIdxB].y = draggingSegInfo.origB.y + delta;
        } else {
          wps[draggingSegInfo.wpIdxB].x = draggingSegInfo.origB.x + delta;
        }
      }
      canvas.style.cursor = 'grabbing';
      draw();
      return;
    }

    if (draggingComp) {
      var dx = pos.x - dragStartX, dy = pos.y - dragStartY;
      if (!dragMoved && dx * dx + dy * dy > 16) { dragMoved = true; saveUndoState(); }
      if (dragMoved) {
        /* Adaptive grid snap: use finer grid when zoomed out so movement stays smooth */
        var snapSize = viewScale < 0.7 ? 10 : 20;
        var nx = Math.round((pos.x - dragOffX) / snapSize) * snapSize;
        var ny = Math.round((pos.y - dragOffY) / snapSize) * snapSize;
        /* Clamp to visible world area (accounting for zoom/pan) */
        var worldMinX = -viewOffX / viewScale;
        var worldMinY = -viewOffY / viewScale;
        var worldMaxX = (W - viewOffX) / viewScale;
        var worldMaxY = (H - viewOffY) / viewScale;
        draggingComp.x = Math.max(worldMinX, Math.min(worldMaxX - 50, nx));
        draggingComp.y = Math.max(worldMinY, Math.min(worldMaxY - 50, ny));
        draw();
      }
      return;
    }

    /* Track mouse for connection preview */
    if (connectingFrom) {
      connectingFrom._lastMouse = { x: pos.x, y: pos.y };
      canvas.style.cursor = 'crosshair';
    }

    /* Hover port detection — also capture screen coords for tooltip positioning */
    var port = hitTestPort(pos.x, pos.y);
    if (port !== hoveredPort) {
      hoveredPort = port;
    }
    if (port) {
      var _tRect = canvas.getBoundingClientRect();
      hoveredPortSX = e.clientX - _tRect.left;
      hoveredPortSY = e.clientY - _tRect.top;
    }

    /* Hover DCV detection for glow effect */
    var comp = hitTestComponent(pos.x, pos.y);
    var newHovDcv = null;
    if (comp && (comp.type === 'dcv43' || comp.type === 'dcv42' || comp.type === 'dcv32' || comp.type === 'dcv32no' || comp.type === 'valve22' || comp.type === 'valve22no' || comp.type === 'dcv52' || comp.type === 'dcv53')) {
      newHovDcv = comp;
    }

    /* Cursor — sketch/shape tools keep their cursor, pan mode keeps grab */
    if (panMode) canvas.style.cursor = 'grab';
    else if (annTool === 'sketch') canvas.style.cursor = PENCIL_CURSOR;
    else if (annTool === 'shape') canvas.style.cursor = 'crosshair';
    else if (port) canvas.style.cursor = 'pointer';
    else if (newHovDcv) canvas.style.cursor = running ? 'pointer' : 'move';
    else if (comp) canvas.style.cursor = 'move';
    else canvas.style.cursor = '';

    /* Hover connection detection */
    var newHovConn = -1;
    if (!comp && !port && !connectingFrom) {
      newHovConn = hitTestConnection(pos.x, pos.y);
      if (newHovConn >= 0) {
        /* Show grab cursor if over a draggable segment, else pointer */
        var segOver = hitTestSegment(pos.x, pos.y, 8);
        if (segOver) {
          canvas.style.cursor = 'grab';
        } else {
          canvas.style.cursor = 'pointer';
        }
      }
    }

    var newHovCompId = comp ? comp.id : null;
    var needRedraw = connectingFrom ? true : false;
    if (newHovDcv !== hoveredDcv) { hoveredDcv = newHovDcv; needRedraw = true; }
    if (port !== hoveredPort) { hoveredPort = port; needRedraw = true; }
    if (newHovCompId !== hoveredCompId) { hoveredCompId = newHovCompId; needRedraw = true; }
    if (newHovConn !== hoveredConn) { hoveredConn = newHovConn; needRedraw = true; }
    if (needRedraw) draw();
  });

  canvas.addEventListener('pointerup', function (e) {
    /* Release captured pointer so subsequent taps target correctly */
    try { if (e && e.pointerId !== undefined) canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    pendingSegDrag = null;
    /* Stop segment drag */
    if (draggingSegInfo) {
      draggingSegInfo = null;
      canvas.style.cursor = '';
      draw();
    }
    if (draggingComp && !dragMoved) {
      /* Click without drag — toggle DCV position */
      var comp = draggingComp;
      if (comp.type === 'dcv43' || comp.type === 'dcv42' || comp.type === 'dcv32' || comp.type === 'dcv32no' || comp.type === 'valve22' || comp.type === 'valve22no' || comp.type === 'dcv52' || comp.type === 'dcv53') {
        var pos = canvasCoords(e);
        setDcvPositionByClick(comp, pos.x, pos.y);
      }
    }
    draggingComp = null;
  });

  canvas.addEventListener('pointerleave', function () {
    draggingComp = null;
    draggingSegInfo = null;
    pendingSegDrag = null;
    hoveredPort = null;
    if (hoveredDcv) {
      hoveredDcv = null;
      canvas.style.cursor = '';
      draw();
    }
  });

  /* ================================================================
     PALETTE — ADD COMPONENT
     ================================================================ */

  /* ── Click to place (fallback) ── */
  /** Find a canvas position that doesn't overlap existing components */
  function findFreeSpot(def) {
    var pad = 30; /* min gap between components */
    var step = 100; /* grid step for scanning */
    var margin = 20; /* canvas edge margin */
    /* Scan left-to-right, top-to-bottom across the canvas */
    for (var sy = margin; sy + def.h < H - margin; sy += step) {
      for (var sx = margin; sx + def.w < W - margin; sx += step) {
        var cx = Math.round(sx / 20) * 20;
        var cy = Math.round(sy / 20) * 20;
        var overlap = false;
        for (var i = 0; i < components.length; i++) {
          var ed = getEffectiveDims(components[i]);
          if (cx < components[i].x + ed.w + pad &&
              cx + def.w + pad > components[i].x &&
              cy < components[i].y + ed.h + pad &&
              cy + def.h + pad > components[i].y) {
            overlap = true; break;
          }
        }
        if (!overlap) return { x: cx, y: cy };
      }
    }
    /* Fallback: stagger from center */
    var n = components.length;
    return { x: Math.round((W / 2 - def.w / 2 + n * 30) / 20) * 20,
             y: Math.round((H / 2 - def.h / 2 + n * 30) / 20) * 20 };
  }

  document.getElementById('palette').addEventListener('click', function (e) {
    var item = e.target.closest('.palette-item');
    if (!item) return;
    /* Ignore click if this was a drag gesture */
    if (item._wasDragged) { item._wasDragged = false; return; }
    var type = item.dataset.type;
    var def = COMP_DEFS[type];
    if (!def) return;
    saveUndoState();
    var spot = findFreeSpot(def);
    addComponent(type, spot.x, spot.y);
  });

  /* ── Collapsible palette categories — accordion style ── */
  (function () {
    var palette = document.getElementById('palette');
    var catHeaders = palette.querySelectorAll('.palette-cat');
    /* Collapse all except first on init */
    catHeaders.forEach(function (h, i) { if (i > 0) h.classList.add('collapsed'); });
    catHeaders.forEach(function (catHeader) {
      catHeader.addEventListener('click', function () {
        var wasCollapsed = catHeader.classList.contains('collapsed');
        catHeaders.forEach(function (h) { h.classList.add('collapsed'); });
        if (wasCollapsed) catHeader.classList.remove('collapsed');
      });
    });
  })();

  /* ── Drag-and-drop from palette to canvas ── */
  document.getElementById('palette').addEventListener('dragstart', function (e) {
    var item = e.target.closest('.palette-item');
    if (!item) return;
    item._wasDragged = true;
    e.dataTransfer.setData('text/plain', item.dataset.type);
    e.dataTransfer.effectAllowed = 'copy';
  });

  canvas.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  canvas.addEventListener('drop', function (e) {
    e.preventDefault();
    var type = e.dataTransfer.getData('text/plain');
    if (!type || !COMP_DEFS[type]) return;
    var pos = canvasCoords(e);
    var def = COMP_DEFS[type];
    saveUndoState();
    addComponent(type, pos.x - def.w / 2, pos.y - def.h / 2);
  });

  function addComponent(type, x, y) {
     var def = COMP_DEFS[type];
    if (!def) return;
    var comp = {
        id: nextId++,
        type: type,
        x: x,
        y: y,
        values: {},  // ← IMPORTANTE: inicializar vacío
        orient: 0,
        extension: 0,
        rotation: 0,
        reading: 0,
        _localPressure: 0  // ← Asegurar que existe
    };
    // Set default param values
    for (var key in def.params) {
        comp.values[key] = def.params[key].def;
    }
    components.push(comp);
    selectedComp = comp;
    showProperties(comp);
    draw();
    return comp;
  }

  /** Rotate a component 90° CW (toggle orient 0↔1), keeping center stable */
  function rotateComponent(comp) {
  if (!comp) return;
  saveUndoState();
  var def = COMP_DEFS[comp.type];
  var oldEd = getEffectiveDims(comp);
  var cx = comp.x + oldEd.w / 2;
  var cy = comp.y + oldEd.h / 2;
  
  // ✅ Esto acumula: 0 → 1 → 2 → 3 → 0 (mod 4)
  // orient ahora puede ser 0, 1, 2 o 3 (0°, 90°, 180°, 270°)
  comp.orient = (comp.orient || 0) + 1;
  if (comp.orient >= 4) comp.orient = 0;
  
  // Determinar la rotación real en radianes para el dibujo
  var angle = comp.orient * Math.PI / 2; // 0, π/2, π, 3π/2
  
  // Reposicionar para mantener el centro
  // Para orient 0: normal
  // Para orient 1: 90° CW (intercambiar w y h)
  // Para orient 2: 180° (w y h iguales)
  // Para orient 3: 270° CW (intercambiar w y h)
  
  var newW, newH;
  if (comp.orient % 2 === 0) {
    // 0° o 180°: usar dimensiones originales
    newW = def.w;
    newH = def.h;
  } else {
    // 90° o 270°: intercambiar w y h
    newW = def.h;
    newH = def.w;
  }
  
  comp.x = cx - newW / 2;
  comp.y = cy - newH / 2;
  
  // Limpiar waypoints en conexiones afectadas
  for (var i = 0; i < connections.length; i++) {
    var conn = connections[i];
    if (conn.from.compId === comp.id || conn.to.compId === comp.id) {
      delete conn.waypoints;
      delete conn._dragOffset;
    }
  }
  
  draw();
}

  /* ================================================================
     COMPONENT GUIDE (panel educativo bajo el tablero)
     ================================================================ */

  /** Funcion del puerto segun su etiqueta ISO 1219 (para la tabla de puertos). */
  function portRole(label) {
    if (label === 'Pilot') return 'pilot signal';
    if (label === 'T' || label === 'T1' || label === 'T2') return 'return to tank';
    if (label === 'P') return 'pressure supply';
    if (label === 'A' || label === 'B' || label === 'CF' || label === 'EF') return 'work port';
    return 'fluid connection';
  }

  /**
   * View-model que reciben las formulas del componente: presion y caudal por
   * puerto, el propio componente (para sus valores medidos) y las utilidades de
   * conversion del sistema de unidades activo.
   */
  function buildDocsViewModel(comp) {
    var vm = unitHelpers(displayUnits);
    vm.running = running;
    vm.comp = comp;
    vm.ports = [];
    var ports = (COMP_DEFS[comp.type] && COMP_DEFS[comp.type].ports) || [];
    var maxPressure = 0, maxFlow = 0;
    ports.forEach(function (port, idx) {
      var pressure = 0, flow = 0, count = 0;
      connections.forEach(function (c) {
        var touches = (c.from.compId === comp.id && c.from.portIdx === idx) ||
                      (c.to.compId === comp.id && c.to.portIdx === idx);
        if (!touches) return;
        pressure = Math.max(pressure, c.pressure || 0);
        flow = Math.max(flow, c.flow || 0);
        count++;
      });
      vm.ports.push({
        idx: idx, label: port.label, portRole: portRole(port.label),
        pressure: pressure, flow: flow, connCount: count
      });
      maxPressure = Math.max(maxPressure, pressure);
      maxFlow = Math.max(maxFlow, flow);
    });
    vm.pressure = maxPressure;
    vm.flow = maxFlow;
    return vm;
  }

  /** Dibuja la guia (descripcion + formulas) del componente seleccionado. */
  function renderComponentGuide(comp) {
    if (!eduPanel || !eduBody || !comp) return;
    var definition = COMP_DEFS[comp.type] || {};
    var spec = null;
    try { spec = getComponent(comp.type); } catch (_specErr) { spec = null; }
    try {
      eduBody.innerHTML = componentDocsHtml({
        definition: definition,
        spec: spec,
        comp: comp,
        vm: buildDocsViewModel(comp)
      });
      eduPanel.style.display = 'block';
    } catch (guideErr) {
      /* La guia es informativa: nunca debe romper la simulacion ni el tablero */
      console.warn('No se pudo construir la guia del componente:', guideErr);
    }
  }

  function hideComponentGuide() {
    if (eduPanel) eduPanel.style.display = 'none';
  }

  /* La guia muestra valores en vivo: se refresca de forma amortiguada mientras
     la simulacion avanza (4 veces por segundo como maximo). */
  var _lastGuideUpdate = 0;
  function refreshComponentGuide(timestamp) {
    if (!selectedComp || !eduPanel || eduPanel.style.display === 'none') return;
    if (timestamp - _lastGuideUpdate < 250) return;
    _lastGuideUpdate = timestamp;
    renderComponentGuide(selectedComp);
  }

  if (eduClose) {
    eduClose.addEventListener('click', function () { hideComponentGuide(); });
  }

  /* ================================================================
     UNIT SYSTEM SWITCH (pills SI / Imperial)
     ================================================================ */

  /** Aplica el sistema de unidades a toda la interfaz. */
  function setDisplayUnits(system) {
    displayUnits = (system === SYSTEMS.IMPERIAL) ? SYSTEMS.IMPERIAL : SYSTEMS.SI;
    try { localStorage.setItem('hydsim.units', displayUnits); } catch (_unitsWriteErr) { /* noop */ }

    if (unitTabs) {
      unitTabs.querySelectorAll('.pill').forEach(function (pill) {
        pill.classList.toggle('active', pill.dataset.units === displayUnits);
      });
    }
    updateUnitLabels();

    if (selectedComp) {
      updatePerformanceInfo(selectedComp);
      renderComponentGuide(selectedComp);
    }
    if (running) computeCircuit();
    draw();
  }

  function syncUnitPills() {
    if (!unitTabs) return;
    unitTabs.querySelectorAll('.pill').forEach(function (pill) {
      pill.classList.toggle('active', pill.dataset.units === displayUnits);
    });
  }

  if (unitTabs) {
    unitTabs.addEventListener('click', function (e) {
      var pill = e.target.closest ? e.target.closest('.pill') : null;
      if (!pill || !pill.dataset.units) return;
      if (pill.dataset.units === displayUnits) return;
      setDisplayUnits(pill.dataset.units);
    });
  }
  syncUnitPills();
  updateUnitLabels();

  /* ================================================================
     PROPERTIES PANEL
     ================================================================ */

 function showProperties(comp) {
    var def = COMP_DEFS[comp.type];
    propsPanel.style.display = 'block';
    var html = '<strong style="color:#00bcd4">' + def.name + '</strong> (ID: ' + comp.id + ')<br><br>';

    // ── Parámetros del componente ──
    for (var key in def.params) {
        var p = def.params[key];
        var val = comp.values[key];
        if (p.type === 'select') {
            html += '<label>' + p.label + ': <select data-param="' + key + '">';
            for (var o = 0; o < p.options.length; o++) {
                html += '<option' + (p.options[o] === val ? ' selected' : '') + '>' + p.options[o] + '</option>';
            }
            html += '</select></label>';
        } else {
            html += '<label>' + p.label + ': <input type="range" min="' + p.min + '" max="' + p.max + '" step="' + p.step + '" value="' + val + '" data-param="' + key + '"> <span class="props-val">' + val + '</span></label>';
        }
    }

    // ── INFORMACIÓN DE RENDIMIENTO (NUEVO) ──
    html += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid #2a4060;">';
    html += '<div style="color:#88aacc;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Datos en Tiempo Real</div>';

    // Obtener valores según el tipo de componente (convertidos al sistema activo)
    var perfValues = displayPerfValues(getPerformanceValues(comp));
    
    if (perfValues && Object.keys(perfValues).length > 0) {
        for (var key in perfValues) {
            var label = perfValues[key].label;
            var value = perfValues[key].value;
            var unit = perfValues[key].unit || '';
            var color = perfValues[key].color || '#c8d8e8';
            
            html += '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.82rem;">';
            html += '<span style="color:#8899bb;">' + label + '</span>';
            html += '<span style="color:' + color + ';font-weight:600;">' + value + ' ' + unit + '</span>';
            html += '</div>';
        }
    } else {
        html += '<div style="color:#5a7a9a;font-size:0.8rem;text-align:center;padding:8px 0;">Ejecute la simulación para ver datos</div>';
    }

    html += '</div>';

    propsBody.innerHTML = html;

    // ── Event listeners ──
    propsBody.querySelectorAll('input[type="range"]').forEach(function (inp) {
        inp.addEventListener('pointerdown', function () { saveUndoState(); });
        inp.addEventListener('input', function () {
            var paramName = this.dataset.param;
            comp.values[paramName] = parseFloat(this.value);
            this.nextElementSibling.textContent = this.value;
            draw();
            // Actualizar la información de rendimiento
            updatePerformanceInfo(comp);
        });
    });
    
    propsBody.querySelectorAll('select').forEach(function (sel) {
        sel.addEventListener('change', function () {
            saveUndoState();
            var paramName = this.dataset.param;
            comp.values[paramName] = this.value;
            draw();
            // Actualizar la información de rendimiento
            updatePerformanceInfo(comp);
        });
    });

    /* Guia del componente: descripcion + formulas de diseno (panel educativo) */
    renderComponentGuide(comp);
}

// ── Función para obtener valores de rendimiento ──
function getPerformanceValues(comp) {
    var values = {};
    
    switch (comp.type) {
        case 'pump':
        case 'pump-var':
        case 'pump-var-displacement':
            var pressure = comp._pressure || comp.values?.pressure || 0;
            var flow = comp._actualFlow || comp.values?.flow || 0;
            var power = (pressure * flow) / 600;
            var rpm = comp._inputRPM || 0;
            var torque = comp._torque || (power * 9550) / (rpm || 1);
            
            values.pressure = { label: 'Presión', value: pressure.toFixed(1), unit: 'bar', color: pressure > 200 ? '#ff4444' : '#4488ff' };
            values.flow = { label: 'Caudal', value: flow.toFixed(1), unit: 'L/min', color: '#3ddc84' };
            values.power = { label: 'Potencia hidráulica', value: power.toFixed(2), unit: 'kW', color: '#ffbb33' };
            values.rpm = { label: 'RPM de entrada', value: rpm.toFixed(0), unit: 'RPM', color: '#88aacc' };
            values.torque = { label: 'Par de salida', value: torque.toFixed(1), unit: 'Nm', color: '#ff8844' };
            
            if (comp.type === 'pump-var-displacement') {
                var dispPct = comp.values?.displacementPct || 100;
                var actualDisp = (comp.values?.displacement || 28) * (dispPct / 100);
                values.displacement = { label: 'Cilindrada actual', value: actualDisp.toFixed(1), unit: 'cm³/rev', color: '#a78bfa' };
            }
            break;
            
        case 'cylinder-da':
        case 'cylinder-sa':
            var bore = comp.values?.bore || 80;
            var rod = comp.values?.rod || 45;
            var pressure = comp._localPressure || 0;
            var aBore = Math.PI / 4 * bore * bore;
            var aAnn = Math.PI / 4 * (bore * bore - rod * rod);
            var forceExtend = pressure * 0.1 * aBore / 1000;
            var forceRetract = pressure * 0.1 * aAnn / 1000;
            var speed = (comp._speedFactor || 0) * 100;
            var ext = (comp.extension || 0) * 100;
            
            values.forceExtend = { label: 'Fuerza de extensión', value: forceExtend.toFixed(1), unit: 'kN', color: '#3ddc84' };
            values.forceRetract = { label: 'Fuerza de retracción', value: forceRetract.toFixed(1), unit: 'kN', color: '#ff8844' };
            values.speed = { label: 'Velocidad', value: speed.toFixed(1), unit: 'mm/s', color: '#4488ff' };
            values.extension = { label: 'Extensión', value: ext.toFixed(0), unit: '%', color: '#ffbb33' };
            values.pressure = { label: 'Presión', value: pressure.toFixed(1), unit: 'bar', color: pressure > 200 ? '#ff4444' : '#4488ff' };
            break;
            
        case 'motor':
        case 'motor-bidir':
            var disp = comp.values?.displacement || 25;
            var pressureMotor = comp._localPressure || 0;
            var rpmMotor = comp._rpm || 0;
            var torqueMotor = (disp * pressureMotor) / (20 * Math.PI);
            var powerMotor = (torqueMotor * rpmMotor) / 9550;
            
            values.torque = { label: 'Par de salida', value: torqueMotor.toFixed(1), unit: 'Nm', color: '#ff8844' };
            values.rpm = { label: 'RPM', value: rpmMotor.toFixed(0), unit: 'RPM', color: '#4488ff' };
            values.power = { label: 'Potencia', value: powerMotor.toFixed(2), unit: 'kW', color: '#3ddc84' };
            values.pressure = { label: 'Presión de entrada', value: pressureMotor.toFixed(1), unit: 'bar', color: pressureMotor > 200 ? '#ff4444' : '#4488ff' };
            values.displacement = { label: 'Cilindrada', value: disp.toFixed(1), unit: 'cm³/rev', color: '#a78bfa' };
            break;
            
        case 'engine':
            var powerEng = comp.values?.power || 0;
            var rpmEng = comp.values?.rpm || 0;
            var torqueEng = (powerEng * 9550) / (rpmEng || 1);
            
            values.power = { label: 'Potencia', value: powerEng.toFixed(1), unit: 'kW', color: '#3ddc84' };
            values.rpm = { label: 'RPM', value: rpmEng.toFixed(0), unit: 'RPM', color: '#4488ff' };
            values.torque = { label: 'Par', value: torqueEng.toFixed(1), unit: 'Nm', color: '#ff8844' };
            break;
            
        case 'pump-drive':
            var inputRPM = comp._inputRPM || 0;
            var inputPower = comp._inputPower || 0;
            var inputTorque = comp._inputTorque || 0;
            var numOutputs = parseInt(comp.values?.numOutputs || '2');
            
            values.inputRPM = { label: 'RPM Entrada', value: inputRPM.toFixed(0), unit: 'RPM', color: '#4488ff' };
            values.inputPower = { label: 'Potencia Entrada', value: inputPower.toFixed(2), unit: 'kW', color: '#3ddc84' };
            values.inputTorque = { label: 'Par Entrada', value: inputTorque.toFixed(1), unit: 'Nm', color: '#ff8844' };
            
            for (var i = 1; i <= numOutputs; i++) {
                var outRPM = comp['_outputRPM' + i] || 0;
                var outPower = comp['_outputPower' + i] || 0;
                var outTorque = comp['_outputTorque' + i] || 0;
                var ratio = comp.values?.['ratio' + i] || 1;
                
                values['out' + i + 'RPM'] = { label: 'Salida ' + i + ' RPM', value: outRPM.toFixed(0), unit: 'RPM', color: '#4488ff' };
                values['out' + i + 'Power'] = { label: 'Salida ' + i + ' Potencia', value: outPower.toFixed(2), unit: 'kW', color: '#3ddc84' };
                values['out' + i + 'Torque'] = { label: 'Salida ' + i + ' Par', value: outTorque.toFixed(1), unit: 'Nm', color: '#ff8844' };
                values['out' + i + 'Ratio'] = { label: 'Salida ' + i + ' Relación', value: ratio.toFixed(2), unit: ':1', color: '#a78bfa' };
            }
            break;
           // En getPerformanceValues, dentro del case 'poclain-ms35', agregar:

case 'poclain-ms35':
    var pressurePoc = comp._localPressure || 0;
    var rpmPoc = comp._rpm || 0;
    var torquePoc = comp._torque || 0;
    var powerPoc = comp._power || 0;
    var dispPoc = comp.values?.displacement || 380;
    var effVolPoc = comp.values?.efficiencyVol || 92;
    var effMechPoc = comp.values?.efficiencyMech || 90;
    var maxRPM = comp.values?.speedMax || 300;
    var maxTorquePoc = comp.values?.torqueMax || 1800;
    
    // NUEVO: Obtener parámetros de velocidad
    var wheelDiameter = comp.values?.wheelDiameter || 500; // mm
    var gearRatio = comp.values?.gearRatio || 1;
    
    // Calcular velocidad lineal (km/h)
    // Velocidad (m/s) = (RPM * π * Diámetro) / (60 * 1000 * Relación)
    // Luego convertir a km/h: * 3.6
    var speedKmh = 0;
    if (rpmPoc > 0 && wheelDiameter > 0) {
        var speedMs = (rpmPoc * Math.PI * wheelDiameter) / (60 * 1000 * gearRatio);
        speedKmh = speedMs * 3.6;
    }
    
    // Calcular la velocidad máxima teórica (a RPM máxima)
    var maxSpeedKmh = 0;
    if (maxRPM > 0 && wheelDiameter > 0) {
        var maxSpeedMs = (maxRPM * Math.PI * wheelDiameter) / (60 * 1000 * gearRatio);
        maxSpeedKmh = maxSpeedMs * 3.6;
    }
    
    values.pressure = { 
        label: 'Presión de entrada', 
        value: pressurePoc.toFixed(1), 
        unit: 'bar', 
        color: pressurePoc > 200 ? '#ff4444' : '#4488ff' 
    };
    values.rpm = { 
        label: 'RPM de salida', 
        value: rpmPoc.toFixed(0), 
        unit: 'RPM', 
        color: rpmPoc > maxRPM * 0.8 ? '#ff8844' : '#aed581' 
    };
    values.torque = { 
        label: 'Par de salida', 
        value: torquePoc.toFixed(1), 
        unit: 'Nm', 
        color: torquePoc > maxTorquePoc * 0.8 ? '#ff8844' : '#ffbb33' 
    };
    values.power = { 
        label: 'Potencia mecánica', 
        value: powerPoc.toFixed(2), 
        unit: 'kW', 
        color: '#3ddc84' 
    };
    values.displacement = { 
        label: 'Cilindrada', 
        value: dispPoc.toFixed(0), 
        unit: 'cm³/rev', 
        color: '#a78bfa' 
    };
    values.efficiency = { 
        label: 'Eficiencia total', 
        value: ((effVolPoc / 100) * (effMechPoc / 100) * 100).toFixed(1), 
        unit: '%', 
        color: '#ffbb33' 
    };
    
    // NUEVO: Mostrar velocidad en km/h
    values.speed = { 
        label: 'Velocidad lineal', 
        value: speedKmh.toFixed(1), 
        unit: 'km/h', 
        color: speedKmh > 0 ? '#3ddc84' : '#667799' 
    };
    
    // Mostrar velocidad máxima teórica
    if (maxSpeedKmh > 0) {
        values.maxSpeed = { 
            label: 'Velocidad Máx (teórica)', 
            value: maxSpeedKmh.toFixed(1), 
            unit: 'km/h', 
            color: '#ffbb33' 
        };
    }
    
    // Mostrar parámetros de la rueda
    values.wheelDiameter = { 
        label: 'Diámetro Rueda', 
        value: wheelDiameter.toFixed(0), 
        unit: 'mm', 
        color: '#88aacc' 
    };
    
    if (gearRatio > 1) {
        values.gearRatio = { 
            label: 'Relación Transmisión', 
            value: gearRatio.toFixed(1), 
            unit: ':1', 
            color: '#88aacc' 
        };
    }
    
    if (comp._atMaxSpeed) {
        values.warning = { 
            label: '⚠️ Velocidad máxima', 
            value: 'limitada', 
            unit: '', 
            color: '#ff8844' 
        };
    }
    if (comp._atMaxTorque) {
        values.warning = { 
            label: '⚠️ Par máximo', 
            value: 'limitado', 
            unit: '', 
            color: '#ff8844' 
        };
    }
    break;
    }
    
    return values;
}

/**
 * Convierte las metricas del panel de propiedades al sistema de unidades activo.
 * No hace falta tocar `getPerformanceValues()`: la magnitud se deduce de la
 * etiqueta de unidad de cada entrada (bar -> pressure, kN -> force, …).
 */
function displayPerfValues(values) {
    if (!values) return values;
    var converted = {};
    for (var key in values) {
        var entry = values[key];
        var kind = kindFromUnit(entry.unit);
        var num = (typeof entry.value === 'number') ? entry.value : parseFloat(entry.value);
        if (!kind || !isFinite(num)) {
            converted[key] = entry;   /* sin magnitud reconocible: se deja igual */
            continue;
        }
        converted[key] = {
            label: entry.label,
            value: formatValue(kind, num, displayUnits),
            unit: unitLabel(kind, displayUnits),
            color: entry.color
        };
    }
    return converted;
}

// ── Función para actualizar solo la información de rendimiento ──
function updatePerformanceInfo(comp) {
    var perfSection = propsBody.querySelector('div[style*="margin-top:16px"]');
    if (!perfSection) return;
    
    var perfValues = displayPerfValues(getPerformanceValues(comp));
    var html = '<div style="color:#88aacc;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Datos en Tiempo Real</div>';
    
    if (perfValues && Object.keys(perfValues).length > 0) {
        for (var key in perfValues) {
            var label = perfValues[key].label;
            var value = perfValues[key].value;
            var unit = perfValues[key].unit || '';
            var color = perfValues[key].color || '#c8d8e8';
            
            html += '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.82rem;">';
            html += '<span style="color:#8899bb;">' + label + '</span>';
            html += '<span style="color:' + color + ';font-weight:600;">' + value + ' ' + unit + '</span>';
            html += '</div>';
        }
    } else {
        html += '<div style="color:#5a7a9a;font-size:0.8rem;text-align:center;padding:8px 0;">Ejecute la simulación para ver datos</div>';
    }
    
    perfSection.innerHTML = html;
}
  /* ================================================================
     PRE-BUILT CIRCUITS
     ================================================================ */

  var PREBUILT_CIRCUITS = {
    'meter-in': {
      desc: '<strong>Meter-In Circuit:</strong> Flow control valve in the pressure line restricts flow entering the cylinder, controlling extend speed. Best for resistive loads (e.g. pressing operations). Excess pump flow goes over the relief valve.',
      build: function () {
        var pump = addComponent('pump', 100, 350);
        var relief = addComponent('relief', 50, 200);
        var fc = addComponent('flow-control', 200, 200);
        var dcv = addComponent('dcv43', 250, 280);
        dcv.values.position = 'Center';
        var cyl = addComponent('cylinder-da', 350, 120);
        var gauge = addComponent('gauge', 160, 120);
        connect(pump, 0, relief, 0);
        connect(relief, 1, pump, 1);
        connect(pump, 0, dcv, 0);
        connect(dcv, 2, fc, 0);
        connect(fc, 1, cyl, 0);
        connect(cyl, 1, dcv, 3);
        connect(dcv, 1, pump, 1);
        connect(gauge, 0, fc, 0);
      }
    },
    'meter-out': {
      desc: '<strong>Meter-Out Circuit:</strong> Flow control valve in the return line restricts oil leaving the cylinder. Creates back-pressure for speed control. Ideal for overrunning loads (e.g. lowering operations) where the load could cause the cylinder to run away.',
      build: function () {
        var pump = addComponent('pump', 100, 350);
        var relief = addComponent('relief', 50, 200);
        var dcv = addComponent('dcv43', 250, 280);
        dcv.values.position = 'Center';
        var cyl = addComponent('cylinder-da', 350, 120);
        var fc = addComponent('flow-control', 480, 220);
        connect(pump, 0, relief, 0);
        connect(relief, 1, pump, 1);
        connect(pump, 0, dcv, 0);
        connect(dcv, 2, cyl, 0);
        connect(cyl, 1, fc, 0);
        connect(fc, 1, dcv, 3);
        connect(dcv, 1, pump, 1);
      }
    },
    'regenerative': {
      desc: '<strong>Regenerative Circuit:</strong> Rod-side exhaust oil is routed back to the cap side, supplementing pump flow. Extension speed roughly doubles (v = Q/A_rod) but force drops (F = P\u00D7A_rod). Used for rapid approach in hydraulic presses before switching to full-force pressing.',
      build: function () {
        var pump = addComponent('pump', 100, 380);
        var relief = addComponent('relief', 50, 230);
        var dcv = addComponent('dcv43', 250, 300);
        dcv.values.position = 'Center';
        var cyl = addComponent('cylinder-da', 350, 130);
        var tee = addComponent('tee', 300, 200);
        connect(pump, 0, relief, 0);
        connect(relief, 1, pump, 1);
        connect(pump, 0, dcv, 0);
        connect(dcv, 2, tee, 0);
        connect(tee, 2, cyl, 0);
        connect(cyl, 1, tee, 1);
        connect(dcv, 3, pump, 1);
        connect(dcv, 1, pump, 1);
      }
    },
    'sequence': {
      desc: '<strong>Sequence Circuit:</strong> A sequence valve ensures Cylinder 1 (clamp) completes its stroke before Cylinder 2 (work) begins. When Cylinder 1 stalls, pressure rises above the sequence valve setting (100 bar), opening flow to Cylinder 2. Used in clamp-then-drill operations.',
      build: function () {
        var pump = addComponent('pump', 80, 400);
        var relief = addComponent('relief', 30, 250);
        var dcv = addComponent('dcv43', 200, 320);
        dcv.values.position = 'Center';
        var cyl1 = addComponent('cylinder-da', 180, 100);
        var cyl2 = addComponent('cylinder-da', 420, 100);
        var sv = addComponent('sequence-valve', 340, 220);
        sv.values.setting = 100;
        var tee = addComponent('tee', 250, 230);
        connect(pump, 0, relief, 0);
        connect(relief, 1, pump, 1);
        connect(pump, 0, dcv, 0);
        connect(dcv, 2, tee, 0);
        connect(tee, 1, cyl1, 0);
        connect(tee, 2, sv, 0);
        connect(sv, 1, cyl2, 0);
        connect(cyl1, 1, dcv, 3);
        connect(cyl2, 1, dcv, 3);
        connect(dcv, 1, pump, 1);
      }
    },
    'bleed-off': {
      desc: '<strong>Bleed-Off Circuit:</strong> A flow control valve bleeds excess pump flow to tank, with only the remaining flow going to the actuator. The pump always operates at load pressure (not relief pressure), making this the most energy-efficient speed control method for fixed-displacement pumps.',
      build: function () {
        var pump = addComponent('pump', 100, 380);
        var relief = addComponent('relief', 50, 230);
        var dcv = addComponent('dcv43', 250, 300);
        dcv.values.position = 'Center';
        var cyl = addComponent('cylinder-da', 350, 130);
        var fc = addComponent('flow-control', 170, 310);
        var tee = addComponent('tee', 200, 250);
        connect(pump, 0, relief, 0);
        connect(relief, 1, pump, 1);
        connect(pump, 0, tee, 0);
        connect(tee, 1, fc, 0);
        connect(fc, 1, pump, 1);
        connect(tee, 2, dcv, 0);
        connect(dcv, 2, cyl, 0);
        connect(cyl, 1, dcv, 3);
        connect(dcv, 1, pump, 1);
      }
    },
    'counterbalance-circuit': {
      desc: '<strong>Counterbalance Circuit:</strong> A counterbalance valve on the cylinder rod port prevents uncontrolled lowering of a suspended load. The valve only opens when pilot pressure from the cap side overcomes its spring setting. The accumulator stores energy and smooths pressure spikes.',
      build: function () {
        var pump = addComponent('pump', 80, 380);
        var relief = addComponent('relief', 30, 230);
        var dcv = addComponent('dcv43', 220, 300);
        dcv.values.position = 'Center';
        var cyl = addComponent('cylinder-da', 320, 100);
        var cb = addComponent('counterbalance', 430, 200);
        cb.values.setting = 130;
        var tee = addComponent('tee', 280, 200);
        var acc = addComponent('accumulator', 140, 160);
        connect(pump, 0, relief, 0);
        connect(relief, 1, pump, 1);
        connect(pump, 0, dcv, 0);
        connect(pump, 0, acc, 0);
        connect(dcv, 2, tee, 0);
        connect(tee, 1, cyl, 0);
        connect(tee, 2, cb, 2);  /* Pilot signal from cap-side pressure */
        connect(cyl, 1, cb, 0);
        connect(cb, 1, dcv, 3);
        connect(dcv, 1, pump, 1);
      }
    },
    'safety-circuit': {
      desc: '<strong>Safety Circuit:</strong> A pilot-operated check valve holds the load when the DCV is centered. The shuttle valve selects the higher pressure from cap or rod lines for pilot signaling. This ensures the cylinder cannot drift or drop even if a hose fails.',
      build: function () {
        var pump = addComponent('pump', 80, 390);
        var relief = addComponent('relief', 30, 240);
        var dcv = addComponent('dcv43', 220, 310);
        dcv.values.position = 'Center';
        var cyl = addComponent('cylinder-da', 340, 100);
        var pc = addComponent('pilot-check', 430, 200);
        var shuttle = addComponent('shuttle', 340, 220);
        connect(pump, 0, relief, 0);
        connect(relief, 1, pump, 1);
        connect(pump, 0, dcv, 0);
        connect(dcv, 2, cyl, 0);
        connect(cyl, 1, pc, 0);
        connect(pc, 1, dcv, 3);
        connect(dcv, 2, shuttle, 0);  /* Cap-side pressure to shuttle A */
        connect(pc, 0, shuttle, 1);   /* Rod-side pressure to shuttle B */
        connect(shuttle, 2, pc, 2);   /* Higher pressure pilots the check valve */
        connect(dcv, 1, pump, 1);
      }
    },

    /* ── New Tier 4 / 5 preset circuits ─────────────────────────── */

    'priority-circuit': {
      desc: '<strong>Priority Flow Circuit:</strong> A priority valve ensures the primary cylinder (clamping) always receives 15 L/min first — regardless of total pump flow. Only when excess flow remains does the secondary cylinder (positioning) receive oil. Extend the DCV and observe: Primary always moves; Secondary only moves when pump delivers more than 15 L/min.',
      build: function () {
        var pump  = addComponent('pump',     60, 390);
        pump.values.pressure = 180; pump.values.flow = 40;
        var relief = addComponent('relief',  10, 240);
        relief.values.setting = 180;
        var dcv   = addComponent('dcv43',   200, 300);
        dcv.values.position = 'Extend';
        var pv    = addComponent('priority', 310, 190);
        pv.values.setting = 15;                          /* CF always gets 15 L/min */
        var cyl1  = addComponent('cylinder-da', 220, 50); /* Primary (CF — clamping) */
        var cyl2  = addComponent('cylinder-da', 420, 50); /* Secondary (EF — positioning) */
        connect(pump,  0, relief, 0);  /* P → relief protection */
        connect(relief, 1, pump, 1);  /* relief → tank */
        connect(pump,  0, dcv,   0);  /* pump P → DCV P */
        connect(dcv,   2, pv,    0);  /* DCV A → Priority P */
        connect(pv,    1, cyl1,  0);  /* CF → Primary cap side */
        connect(pv,    2, cyl2,  0);  /* EF → Secondary cap side */
        connect(cyl1,  1, dcv,   3);  /* Primary rod → DCV B */
        connect(cyl2,  1, dcv,   3);  /* Secondary rod → DCV B */
        connect(dcv,   1, pump,  1);  /* DCV T → tank */
      }
    },

    'sync-cylinders': {
      desc: '<strong>Synchronised Cylinders (Flow Divider):</strong> A gear-type flow divider splits pump flow equally to two cylinders, keeping them perfectly synchronised throughout their stroke — even under unequal loads. Spring-loaded check valves (3 bar cracking) on each output prevent back-flow and cross-contamination between the two branches, ensuring neither cylinder can push oil back through the divider.',
      build: function () {
        var pump  = addComponent('pump',        80, 400);
        pump.values.flow = 30; pump.values.pressure = 180;
        var relief = addComponent('relief',     30, 250);
        relief.values.setting = 180;
        var dcv   = addComponent('dcv43',      210, 320);
        dcv.values.position = 'Extend';
        var fd    = addComponent('flow-divider', 330, 220);
        fd.values.ratio = 50;                             /* equal 50/50 split */
        var cs1   = addComponent('check-spring', 265, 120);
        cs1.values.cracking = 3;                          /* anti-drift check */
        var cs2   = addComponent('check-spring', 460, 120);
        cs2.values.cracking = 3;
        var cyl1  = addComponent('cylinder-da', 215, 40);
        var cyl2  = addComponent('cylinder-da', 450, 40);
        connect(pump,  0, relief, 0);
        connect(relief, 1, pump,  1);
        connect(pump,  0, dcv,   0);
        connect(dcv,   2, fd,    0);  /* DCV A → Flow Divider P */
        connect(fd,    1, cs1,   0);  /* Divider A → Spring Check 1 */
        connect(fd,    2, cs2,   0);  /* Divider B → Spring Check 2 */
        connect(cs1,   1, cyl1,  0);  /* Check 1 → Cyl1 cap */
        connect(cs2,   1, cyl2,  0);  /* Check 2 → Cyl2 cap */
        connect(cyl1,  1, dcv,   3);  /* Cyl1 rod → DCV B */
        connect(cyl2,  1, dcv,   3);  /* Cyl2 rod → DCV B */
        connect(dcv,   1, pump,  1);
      }
    },

    'precision-speed': {
      desc: '<strong>Precision Speed Control with Emergency Backup:</strong> A fixed orifice (Ø 2 mm) on the pump outlet calibrates maximum system flow before the DCV. A one-way flow-control valve (12 L/min) meters the cylinder extend speed, while its built-in check allows unrestricted return. A hand pump (60 bar, 3 L/min) provides emergency backup pressure in parallel — useful for tool release when the main power unit is off.',
      build: function () {
        var pump  = addComponent('pump',      60, 400);
        pump.values.pressure = 150; pump.values.flow = 25;
        var handPump = addComponent('pump-hand', 60, 220);
        handPump.values.pressure = 60; handPump.values.flow = 3;
        var relief = addComponent('relief',   10, 300);
        relief.values.setting = 150;
        var ori   = addComponent('orifice',  175, 340);
        ori.values.diameter = 2;                          /* Ø2 mm calibrated restrictor */
        var dcv   = addComponent('dcv43',    260, 310);
        dcv.values.position = 'Extend';
        var fc    = addComponent('flow-check', 370, 190);
        fc.values.flow = 12;                              /* 12 L/min throttled extend */
        var cyl   = addComponent('cylinder-da', 420, 50);
        /* Safety relief */
        connect(pump,     0, relief,   0);
        connect(relief,   1, pump,     1);
        /* Calibrated pressure line: pump → orifice → DCV */
        connect(pump,     0, ori,      0);
        connect(ori,      1, dcv,      0);
        /* Hand pump backup (parallel path to DCV P) */
        connect(handPump, 1, dcv,      0);  /* hand P → DCV P */
        connect(handPump, 0, pump,     1);  /* hand T → tank */
        /* Metered extend + free return */
        connect(dcv,      2, fc,       0);  /* DCV A → flow-check A (throttled extend) */
        connect(fc,       1, cyl,      0);  /* flow-check B → cylinder cap */
        connect(cyl,      1, dcv,      3);  /* cylinder rod → DCV B */
        connect(dcv,      1, pump,     1);  /* DCV T → tank */
      }
    }
  };

  function connect(comp1, port1, comp2, port2) {
    connections.push({
      from: { compId: comp1.id, portIdx: port1 },
      to: { compId: comp2.id, portIdx: port2 },
      pressure: 0
    });
  }

  prebuiltTabs.addEventListener('click', function (e) {
    if (!e.target.matches('.pill')) return;
    var circuit = e.target.dataset.circuit;
    prebuiltTabs.querySelectorAll('.pill').forEach(function (p) { p.classList.toggle('active', p === e.target); });
    clearCircuit();
    if (PREBUILT_CIRCUITS[circuit]) {
      circuitDesc.style.display = 'block';
      circuitDesc.innerHTML = PREBUILT_CIRCUITS[circuit].desc;
      PREBUILT_CIRCUITS[circuit].build();
      draw();
    }
  });

  /* ================================================================
     TOOLBAR ACTIONS
     ================================================================ */

  btnClear.addEventListener('click', function () {
    clearCircuit();
    circuitDesc.style.display = 'none';
    prebuiltTabs.querySelectorAll('.pill').forEach(function (p) { p.classList.remove('active'); });
  });

  btnDelete.addEventListener('click', function () {
    if (!selectedComp) return;
    saveUndoState();
    if (running) stopSimulation();
    var id = selectedComp.id;
    if (connectingFrom && connectingFrom.compId === id) connectingFrom = null;
    components = components.filter(function (c) { return c.id !== id; });
    connections = connections.filter(function (c) {
      return c.from.compId !== id && c.to.compId !== id;
    });
    selectedComp = null;
    propsPanel.style.display = 'none';
    hideComponentGuide();
    draw();
  });

  document.getElementById('btn-rotate').addEventListener('click', function () {
    if (!selectedComp) return;
    rotateComponent(selectedComp);
  });

  /* ── User Guide modal open/close ── */
  (function () {
    var overlay = document.getElementById('guide-overlay');
    var btnOpen = document.getElementById('btn-guide');
    var btnClose = document.getElementById('guide-close');
    if (!overlay || !btnOpen) return;
    btnOpen.addEventListener('click', function () { overlay.style.display = 'flex'; });
    btnClose.addEventListener('click', function () { overlay.style.display = 'none'; });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.style.display = 'none'; });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.style.display === 'flex') {
        overlay.style.display = 'none';
        e.stopPropagation();
      }
    });
  })();

  function clearCircuit() {
    stopSimulation();
    if (components.length > 0) saveUndoState();
    components = [];
    connections = [];
    particles = [];
    selectedComp = null;
    connectingFrom = null;
    propsPanel.style.display = 'none';
    hideComponentGuide();
    warningBar.style.display = 'none';
    simReadouts.style.display = 'none';
    draw();
  }

  /* ================================================================
     SIMULATION ENGINE
     ================================================================ */

  btnRun.addEventListener('click', function () {
    if (components.length === 0) {
      warningBar.style.display = 'block';
      warningBar.textContent = 'Add components to the canvas before running the simulation.';
      return;
    }

    /* Validate circuit */
    var warnings = validateCircuit();
    if (warnings.length > 0) {
      warningBar.style.display = 'block';
      warningBar.innerHTML = warnings.join('<br>');
    } else {
      warningBar.style.display = 'none';
    }

    startSimulation();
  });

  btnStop.addEventListener('click', function () {
    stopSimulation();
  });

  function validateCircuit() {
    var warns = [];
    var hasPump = components.some(function (c) { return c.type === 'pump' || c.type === 'pump-var-displacement'; });
    if (!hasPump) warns.push('\u26A0 No hydraulic power unit found. Every circuit needs a pump.');

    var hasActuator = components.some(function (c) {
        return c.type === 'cylinder-da' || c.type === 'cylinder-sa' || 
               c.type === 'motor' || c.type === 'poclain-ms35' || 
               c.type === 'motor-bidir' || c.type === 'rotary-act';
    });
    if (!hasActuator) warns.push('\u26A0 No actuator found. Add a cylinder or motor.');

    /* Check for unconnected ports (exclude optional ports) */
    var connectedPorts = {};
    connections.forEach(function (c) {
      connectedPorts[c.from.compId + ':' + c.from.portIdx] = true;
      connectedPorts[c.to.compId + ':' + c.to.portIdx] = true;
    });

    var unconnected = 0;
    components.forEach(function (comp) {
      var def = COMP_DEFS[comp.type];
      /* Skip port validation for certain component types that often have optional ports */
      if (comp.type === 'gauge' || comp.type === 'flow-meter' || comp.type === 'accumulator') return;
      def.ports.forEach(function (port, idx) {
        /* Skip pilot ports (they are optional) */
        if (port.label === 'Pilot') return;
        if (!connectedPorts[comp.id + ':' + idx]) unconnected++;
      });
    });
    if (unconnected > 0) warns.push('\u26A0 ' + unconnected + ' unconnected port(s). Connect all ports for proper flow.');

    return warns;
  }

  function startSimulation() {
    running = true;
    simTime = 0;
    particles = [];
    btnRun.style.display = 'none';
    btnStop.style.display = '';
    simReadouts.style.display = 'flex';
    toolbarHint.textContent = 'Simulation running \u2014 observe flow and pressure...';

    /* Initialize particles along connections */
    connections.forEach(function (conn) {
      for (var p = 0; p < 5; p++) {
        var fromComp = findComp(conn.from.compId);
        var toComp = findComp(conn.to.compId);
        if (!fromComp || !toComp) continue;
        var fp = getPortWorldPos(fromComp, conn.from.portIdx);
        var tp = getPortWorldPos(toComp, conn.to.portIdx);
        particles.push({
          connIdx: connections.indexOf(conn),
          t: p / 5,
          x: fp.x, y: fp.y,
          pressure: 0
        });
      }
    });

    /* Compute circuit values */
    computeCircuit();

    animateSimulation();
  }

  function stopSimulation() {
    running = false;
    if (animFrame) cancelAnimationFrame(animFrame);
    animFrame = null;
    btnRun.style.display = '';
    btnStop.style.display = 'none';
    toolbarHint.textContent = 'Click a component to add it, then drag to position. Click ports to connect.';

    _lastAnimTimestamp = 0;
    /* Reset component states for a clean restart */
    components.forEach(function (c) {
      c.extension = 0;
      c.rotation = 0;
      c.reading = 0;
      c._reliefActive = false;
      c._sequenceOpen = false;
      c._unloadActive = false;
      c._limitTripped = false;
      c._shuttleA = 0;
      c._shuttleB = 0;
    });
    connections.forEach(function (c) { c.pressure = 0; });
    prevExtensions = {};

    draw();
  }

  /* ================================================================
     TOPOLOGY-AWARE SIMULATION ENGINE
     ================================================================ */




  /* ================================================================
     MOTOR DE SIMULACION - delegacion en el nucleo (js/core/simulation)
     ================================================================ */

  /*
   * computeCircuit(): adaptador entre el estado de la interfaz y el nucleo de
   * simulacion. El calculo vive en js/core/simulation/solver.js (dominio puro,
   * testeable sin DOM). Aqui solo se pasan las referencias y se aplican los
   * resultados a la interfaz: readouts e instrumentacion avanzada.
   *
   * Semantica preservada (etapa E1): mismo orden de llamadas y mismos valores
   * que el computeCircuit() original; si no hay bomba el nucleo devuelve
   * completed=false y no se actualiza la instrumentacion (igual que el return
   * anticipado original).
   */
  function computeCircuit() {
    var result = solveCircuit({
      components: components,
      connections: connections,
      definitions: COMP_DEFS,
      activeFault: activeFault
    });
    if (!result) return;

    updateReadouts(result.systemPressure, result.pumpFlow, result.force, result.speed, result.status);

    if (result.completed && typeof _hcUpdateDiagnostics === 'function') {
      _hcUpdateDiagnostics(result.systemPressure, result.pumpFlow, result.force, result.speed);
    }
  }
  function updateReadouts(pressure, flow, force, speed, status) {
    var power = pressure * flow / 600;
    var imperial = (displayUnits === SYSTEMS.IMPERIAL);
    /* Valores y unidades segun el sistema activo (en SI se muestra igual que antes) */
    document.getElementById('r-pressure').textContent = fmtDisp('pressure', pressure, 0);
    document.getElementById('r-flow').textContent = fmtDisp('flow', flow, imperial ? 2 : 1);
    document.getElementById('r-power').textContent = fmtDisp('power', power, 2);
    document.getElementById('r-force').textContent = fmtDisp('force', force, imperial ? 0 : 1);
    document.getElementById('r-speed').textContent = fmtDisp('speed', speed, imperial ? 2 : 1);
    updateUnitLabels();
    var statusEl = document.getElementById('r-status');
    statusEl.textContent = status || 'Running';
    if (status && status.indexOf('Standby') >= 0) {
      statusEl.style.color = '#ffaa00'; /* Orange for standby */
    } else if (status && (status.indexOf('stalled') >= 0 || status.indexOf('Stalled') >= 0)) {
      statusEl.style.color = '#ff6666'; /* Red for stalled */
    } else if (status && status.indexOf('Sequence') >= 0) {
      statusEl.style.color = '#00bcd4'; /* Cyan for sequence triggered */
    } else {
      statusEl.style.color = '#3ddc84'; /* Green for running */
    }
  }

  var _lastAnimTimestamp = 0;
  function animateSimulation(timestamp) {
    if (!running) return;

    var simDelta = _lastAnimTimestamp ? Math.min((timestamp - _lastAnimTimestamp) / 1000, 0.05) : 0.016;
    _lastAnimTimestamp = timestamp;
    simTime += simDelta;

    /* Move particles — direction and speed based on flow */
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var conn = connections[p.connIdx];
      if (!conn) continue;
      if (conn.pressure <= 0) continue; /* Don't move particles on dead connections */

      /* Speed proportional to flow (base speed at 30 L/min) */
      var flowSpeed = (conn.flow || 1) / 30 * 0.008;
      flowSpeed = Math.max(0.003, Math.min(0.02, flowSpeed));

      /* Direction: flowDir +1=from→to, -1=to→from */
      var dir = conn.flowDir || 1;
      p.t += flowSpeed * dir;
      if (p.t > 1) p.t -= 1;
      if (p.t < 0) p.t += 1;

      /* Follow smart-routed polyline path (use cache if available) */
      var path = _pathCache[p.connIdx] || getConnectionPath(conn);
      if (!path || path.length < 2) continue;
      var totalLen = polylineLength(path);
      if (totalLen < 1) continue;
      var pos2 = interpolatePolyline(path, p.t * totalLen);
      p.x = pos2.x;
      p.y = pos2.y;
      p.pressure = conn.pressure;
    }

    /* Animate cylinders — speed based on flow rate and piston area */
    components.forEach(function (c) {
      if (c.type === 'cylinder-da' || c.type === 'cylinder-sa') {
        var prev = prevExtensions[c.id];
        if (prev === undefined) prev = c.extension || 0;

        /* Skip animation if cylinder is stalled */
        if (c._stalled) {
          prevExtensions[c.id] = c.extension;
          return;
        }

        var speedFactor = c._speedFactor || 0;
        var baseSpeed = 0.005 * speedFactor;
        baseSpeed = Math.max(0, Math.min(0.015, baseSpeed)); /* Clamp animation speed */

        /* Cushioning: slow down in the last 10% of stroke at each end */
        var hasCushion = (c.values && c.values.cushion === 'Both ends');
        var cushionFactor = 1;
        if (hasCushion) {
          var ext = c.extension || 0;
          if (ext > 0.9) cushionFactor = Math.max(0.3, (1 - ext) / 0.1); /* decel near full extend */
          else if (ext < 0.1) cushionFactor = Math.max(0.3, ext / 0.1);  /* decel near full retract */
        }

        if (c._extending && baseSpeed > 0) {
          c.extension = Math.min(1, (c.extension || 0) + baseSpeed * cushionFactor);
        } else if (!c._extending && speedFactor > 0) {
          /* Retraction — SA uses spring return (speed scales inversely with bore area),
             DA uses flow-based speed */
          var retractSpeed;
          if (c.type === 'cylinder-sa') {
            var springBore = c.values.bore || 80;
            retractSpeed = Math.max(0.0015, 0.003 * Math.sqrt(50 / springBore));
          } else {
            retractSpeed = baseSpeed;
          }
          c.extension = Math.max(0, (c.extension || 0) - retractSpeed * cushionFactor);
        }

        /* Tick sound at end-of-stroke */
        if ((prev < 1 && c.extension >= 1) || (prev > 0 && c.extension <= 0)) {
          playTick();
        }
        prevExtensions[c.id] = c.extension;
      }

      /* Motor rotation based on flow, displacement, and actual elapsed time */
      if (c.type === 'motor' || c.type === 'motor-bidir' || c.type === 'poclain-ms35') {
    var rpm = c._rpm || 0;
    var radPerSec = rpm * Math.PI * 2 / 60;
    c.rotation = (c.rotation || 0) + radPerSec * simDelta;
}
      /* Rotary actuator — uses same _speedFactor logic, limited to swing angle */
      if (c.type === 'rotary-act') {
        var maxAngle = ((c.values && c.values.angle) || 180) * Math.PI / 180;
        var rsf = c._speedFactor || 0;
        var rate = 0.03 * rsf;
        if (c._extending) {
          c.rotation = Math.min(maxAngle, (c.rotation || 0) + rate);
        } else if (rsf > 0) {
          c.rotation = Math.max(0, (c.rotation || 0) - rate);
        }
      }
      /* Limit switch — trips when linked cylinder extension ≥ triggerAt% */
      if (c.type === 'limit-switch-hyd') {
        var linkId = (c.values && c.values.linkedCylinder) || 0;
        var trig = ((c.values && c.values.triggerAt) || 95) / 100;
        c._limitTripped = false;
        if (linkId > 0) {
          var linked = findComp(linkId);
          if (linked && (linked.type === 'cylinder-da' || linked.type === 'cylinder-sa' || linked.type === 'cylinder-telescopic')) {
            c._limitTripped = (linked.extension || 0) >= trig;
          }
        }
      }
      

    });

    /* Recompute readouts each frame so DCV changes take effect */
    computeCircuit();

    /* Guia del componente seleccionado: valores medidos en vivo (amortiguado) */
    refreshComponentGuide(timestamp);

    /* Sample oscilloscope (throttled to ~60 Hz, respects pause state) */
    if (typeof _hcSampleScope === 'function') _hcSampleScope(simTime);

    draw();
    animFrame = requestAnimationFrame(animateSimulation);
  }

  /* ================================================================
     MODE SWITCHING
     ================================================================ */

  document.getElementById('mode-tabs').addEventListener('click', function (e) {
    if (!e.target.matches('.pill')) return;
    var newMode = e.target.dataset.mode;
    if (newMode === mode) return;
    document.querySelectorAll('#mode-tabs .pill').forEach(function (p) {
      p.classList.toggle('active', p === e.target);
    });
    switchMode(newMode);
  });

  function switchMode(m) {
    mode = m;
    stopSimulation();

    /* Hide all */
    simPanel.style.display = 'none';
    catRow.style.display = 'none';
    itemSelector.style.display = 'none';
    itemInfo.style.display = 'none';
    practicePanel.style.display = 'none';
    practiceBar.style.display = 'none';
    quizPanel.style.display = 'none';
    quizBar.style.display = 'none';
    quizResult.style.display = 'none';

    switch (m) {
      case 'simulate':
        simPanel.style.display = 'block';
        resizeCanvas();
        break;
      case 'explore':
        catRow.style.display = 'flex';
        showExploreCategory(exploreCat);
        break;
      case 'practice':
        practicePanel.style.display = 'block';
        practiceBar.style.display = 'flex';
        newPracticeQuestion();
        break;
      case 'quiz':
        startQuiz();
        break;
    }
  }

  /* ================================================================
     EXPLORE MODE
     ================================================================ */

  catTabs.addEventListener('click', function (e) {
    if (!e.target.matches('.pill')) return;
    exploreCat = e.target.dataset.cat;
    catTabs.querySelectorAll('.pill').forEach(function (p) { p.classList.toggle('active', p.dataset.cat === exploreCat); });
    showExploreCategory(exploreCat);
  });

  function showExploreCategory(cat) {
    itemSelector.style.display = 'block';
    var filtered = CONCEPTS.filter(function (c) { return c.cat === cat; });
    conceptGrid.innerHTML = '';
    filtered.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'is-card' + (selectedConcept && selectedConcept.id === c.id ? ' active' : '');
      card.innerHTML = '<div class="is-card-name">' + c.name + '</div><div class="is-card-formula">' + c.formula + '</div>';
      card.addEventListener('click', function () {
        selectedConcept = c;
        showConceptInfo(c);
        conceptGrid.querySelectorAll('.is-card').forEach(function (el) { el.classList.remove('active'); });
        card.classList.add('active');
      });
      conceptGrid.appendChild(card);
    });

    if (selectedConcept && selectedConcept.cat === cat) {
      showConceptInfo(selectedConcept);
    } else {
      itemInfo.style.display = 'none';
    }
  }

  /* ── Concept-to-simulator symbol mapping ── */
  var CONCEPT_SYMBOL_MAP = {
    'hydraulic-pump': 'pump',
    'relief-valve': 'relief',
    'dcv-valve': 'dcv43',
    'check-valve': 'check',
    'flow-control-valve': 'flow-control',
    'hydraulic-cylinder': 'cylinder-da',
    'hydraulic-motor': 'motor',
    'accumulator': 'accumulator',
    'hydraulic-filter': 'filter',
    'pressure-gauge': 'gauge'
  };

  function drawExploreSymbol(parentEl, conceptId) {
    var compType = CONCEPT_SYMBOL_MAP[conceptId];
    if (!compType) return;
    var def = COMP_DEFS[compType];
    if (!def) return;

    var symCanvas = document.createElement('canvas');
    var scale = 2.2;
    var padX = 30, padY = 24;
    symCanvas.width = Math.max(280, def.w * scale + padX * 2);
    symCanvas.height = (def.h * scale + padY * 2 + 16);
    symCanvas.style.display = 'block';
    symCanvas.style.margin = '10px auto 6px';
    symCanvas.style.borderRadius = '6px';
    symCanvas.style.background = '#0a0e14';
    symCanvas.style.border = '1px solid #1a2535';

    var sCtx = symCanvas.getContext('2d');
    /* Swap global ctx temporarily */
    var origCtx = ctx;
    ctx = sCtx;
    var origRunning = running;
    running = false;

    sCtx.save();
    var offsetX = (symCanvas.width - def.w * scale) / 2;
    sCtx.translate(offsetX, padY);
    sCtx.scale(scale, scale);

    /* Create a dummy comp for drawing */
    var dummyComp = { id: -1, type: compType, x: 0, y: 0, values: {}, extension: 0.4, rotation: 0, reading: 120 };
    for (var key in def.params) dummyComp.values[key] = def.params[key].def;
    if (compType === 'dcv43') dummyComp.values.position = 'Center';
    if (compType === 'dcv53') dummyComp.values.position = 'Center';

    /* Draw the symbol */
    switch (compType) {
      case 'pump': drawPumpSymbol(def.w, def.h, dummyComp); break;
      case 'relief': drawReliefSymbol(def.w, def.h, dummyComp); break;
      case 'dcv43': drawDCV43Symbol(def.w, def.h, dummyComp); break;
      case 'dcv42': drawDCV42Symbol(def.w, def.h, dummyComp); break;
      case 'dcv32': drawDCV32Symbol(def.w, def.h, dummyComp); break;
      case 'dcv52': drawDCV52Symbol(def.w, def.h, dummyComp); break;
      case 'dcv53': drawDCV53Symbol(def.w, def.h, dummyComp); break;
      case 'dcv32no':   drawDCV32NOSymbol(def.w, def.h, dummyComp); break;
      case 'valve22no': drawValve22NOSymbol(def.w, def.h, dummyComp); break;
      case 'intensifier': drawIntensifierSymbol(def.w, def.h, dummyComp); break;
      case 'orifice':      drawOrificeSymbol(def.w, def.h, dummyComp); break;
      case 'flow-check':   drawFlowCheckSymbol(def.w, def.h, dummyComp); break;
      case 'check-spring': drawSpringCheckSymbol(def.w, def.h, dummyComp); break;
      case 'priority':     drawPriorityValveSymbol(def.w, def.h, dummyComp); break;
      case 'flow-divider': drawFlowDividerSymbol(def.w, def.h, dummyComp); break;
      case 'pump-hand':    drawHandPumpSymbol(def.w, def.h, dummyComp); break;
      case 'check': drawCheckSymbol(def.w, def.h); break;
      case 'flow-control': drawFlowControlSymbol(def.w, def.h); break;
      case 'cylinder-da': drawCylinderDASymbol(def.w, def.h, dummyComp); break;
      case 'motor': drawMotorSymbol(def.w, def.h, dummyComp); break;
      case 'accumulator': drawAccumulatorSymbol(def.w, def.h, dummyComp); break;
      case 'filter': drawFilterSymbol(def.w, def.h); break;
      case 'gauge': drawGaugeSymbol(def.w, def.h, dummyComp); break;
    }

    /* Draw port circles */
    for (var p = 0; p < def.ports.length; p++) {
      var port = def.ports[p];
      sCtx.beginPath();
      sCtx.arc(port.x, port.y, 3, 0, Math.PI * 2);
      sCtx.fillStyle = '#00bcd4';
      sCtx.fill();
    }

    sCtx.restore();

    /* Label under symbol */
    sCtx.fillStyle = '#667799';
    sCtx.font = '11px ' + _fontFamily;
    sCtx.textAlign = 'center';
    sCtx.fillText('ISO 1219 Symbol (as used in simulator)', symCanvas.width / 2, symCanvas.height - 6);

    /* Restore global ctx */
    ctx = origCtx;
    running = origRunning;


    parentEl.appendChild(symCanvas);
  }

  function showConceptInfo(concept) {
    itemInfo.style.display = 'block';
    var html = '<div class="ii-title">' + concept.name + ' (' + concept.symbol + ')</div>';
    html += '<div class="ii-formula">' + concept.formula + (concept.unit !== '\u2014' ? ' [' + concept.unit + ']' : '') + '</div>';

    /* Symbol canvas placeholder — will be inserted after innerHTML set */
    if (CONCEPT_SYMBOL_MAP[concept.id]) {
      html += '<div id="explore-symbol-slot"></div>';
    }

    html += '<div class="ii-desc">' + concept.desc + '</div>';

    /* ISO 1219 Symbol description */
    if (concept.symbol_desc) {
      html += '<div style="margin-top:12px;padding:10px 12px;background:rgba(0,188,212,0.08);border-left:3px solid #00bcd4;border-radius:4px;">';
      html += '<div style="font-weight:700;color:#00bcd4;font-size:0.82rem;margin-bottom:4px;">Standard Symbol</div>';
      html += '<div style="font-size:0.82rem;color:#c0c8d8;line-height:1.5;">' + concept.symbol_desc + '</div>';
      html += '</div>';
    }

    /* Types */
    if (concept.types && concept.types.length) {
      html += '<div style="margin-top:12px;">';
      html += '<div style="font-weight:700;color:#a0b0d0;font-size:0.82rem;margin-bottom:6px;">Types &amp; Variants</div>';
      html += '<ul style="margin:0;padding-left:18px;font-size:0.82rem;color:#99a8c0;line-height:1.6;">';
      concept.types.forEach(function (t) { html += '<li>' + t + '</li>'; });
      html += '</ul></div>';
    }

    /* Key parameters */
    if (concept.params && concept.params.length) {
      html += '<div style="margin-top:12px;">';
      html += '<div style="font-weight:700;color:#a0b0d0;font-size:0.82rem;margin-bottom:6px;">Key Parameters</div>';
      html += '<ul style="margin:0;padding-left:18px;font-size:0.82rem;color:#99a8c0;line-height:1.6;">';
      concept.params.forEach(function (p) { html += '<li>' + p + '</li>'; });
      html += '</ul></div>';
    }

    /* Use cases */
    if (concept.useCases && concept.useCases.length) {
      html += '<div style="margin-top:12px;">';
      html += '<div style="font-weight:700;color:#a0b0d0;font-size:0.82rem;margin-bottom:6px;">Use Cases</div>';
      html += '<ul style="margin:0;padding-left:18px;font-size:0.82rem;color:#99a8c0;line-height:1.6;">';
      concept.useCases.forEach(function (u) { html += '<li>' + u + '</li>'; });
      html += '</ul></div>';
    }

    /* Tips */
    if (concept.tips && concept.tips.length) {
      html += '<div style="margin-top:12px;padding:10px 12px;background:rgba(255,187,51,0.06);border-left:3px solid #ffbb33;border-radius:4px;">';
      html += '<div style="font-weight:700;color:#ffbb33;font-size:0.82rem;margin-bottom:6px;">Practical Tips</div>';
      html += '<ul style="margin:0;padding-left:18px;font-size:0.82rem;color:#b8b090;line-height:1.6;">';
      concept.tips.forEach(function (t) { html += '<li>' + t + '</li>'; });
      html += '</ul></div>';
    }

    /* Worked example */
    if (concept.example) {
      html += '<div class="ii-example"><div class="ii-example-title">Worked Example</div>';
      html += '<p style="font-size:0.84rem;margin-bottom:8px;">' + concept.example.problem + '</p>';
      concept.example.steps.forEach(function (s) {
        html += '<div class="ii-step">' + s + '</div>';
      });
      html += '</div>';
    }
    itemInfo.innerHTML = html;

    /* Draw the actual simulator symbol into the slot */
    var slot = document.getElementById('explore-symbol-slot');
    if (slot) drawExploreSymbol(slot, concept.id);
  }

  /* ================================================================
     PRACTICE MODE
     ================================================================ */

  function newPracticeQuestion() {
    var gen = PRACTICE[Math.floor(Math.random() * PRACTICE.length)];
    currentProblem = gen();
    practiceAnswered = false;
    ppPrompt.textContent = currentProblem.prompt;
    ppUnit.textContent = currentProblem.unit;
    ppInput.value = '';
    ppInput.disabled = false;
    ppFeedback.textContent = '';
    ppFeedback.className = 'feedback';
    ppCheck.style.display = '';
    ppNext.style.display = 'none';
    ppSolution.style.display = 'none';
    ppInput.focus();
  }

  ppCheck.addEventListener('click', function () {
    if (practiceAnswered || !currentProblem) return;
    var userAns = parseFloat(ppInput.value);
    if (isNaN(userAns)) { ppFeedback.textContent = 'Enter a numeric answer.'; ppFeedback.className = 'feedback err'; return; }

    practiceAnswered = true;
    practiceTotal++;
    var correct = Math.abs(userAns - currentProblem.answer) <= currentProblem.tol;
    if (correct) {
      practiceCorrect++;
      ppFeedback.textContent = '\u2705 Correct! Answer: ' + currentProblem.answer + ' ' + currentProblem.unit;
      ppFeedback.className = 'feedback ok';
    } else {
      ppFeedback.textContent = '\u274C Incorrect. Correct answer: ' + currentProblem.answer + ' ' + currentProblem.unit;
      ppFeedback.className = 'feedback err';
    }

    pbarScoreVal.textContent = practiceCorrect + ' / ' + practiceTotal;
    ppInput.disabled = true;
    ppCheck.style.display = 'none';
    ppNext.style.display = '';

    /* Show solution */
    ppSolution.style.display = 'block';
    ppSolution.innerHTML = '<div style="font-weight:700;color:#00bcd4;margin-bottom:6px;">Solution</div>' +
      currentProblem.steps.map(function (s) { return '<div class="sol-step">' + s + '</div>'; }).join('');
  });

  ppNext.addEventListener('click', newPracticeQuestion);

  ppInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      if (practiceAnswered) newPracticeQuestion();
      else ppCheck.click();
    }
  });

  /* ================================================================
     QUIZ MODE
     ================================================================ */

  function startQuiz() {
    /* Pick 5 random questions */
    var pool = QUIZ_POOL.slice();
    quizSet = [];
    for (var i = 0; i < QUIZ_SIZE && pool.length > 0; i++) {
      var idx = Math.floor(Math.random() * pool.length);
      quizSet.push(pool.splice(idx, 1)[0]);
    }
    quizIdx = 0;
    quizScore = 0;
    quizAnswered = false;
    quizAnswers = [];
    quizResult.style.display = 'none';
    showQuizQuestion();
  }

  function showQuizQuestion() {
    quizPanel.style.display = 'block';
    quizBar.style.display = 'flex';
    qbarNum.textContent = quizIdx + 1;

    var q = quizSet[quizIdx];
    var html = '<div class="qp-question">' + q.q + '</div>';

    if (q.type === 'mcq') {
      html += '<div class="qp-options">';
      q.opts.forEach(function (opt, i) {
        html += '<div class="qp-option" data-idx="' + i + '"><input type="radio" name="quiz-opt" value="' + i + '"> <span>' + opt + '</span></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="qp-numeric"><input type="number" step="any" id="quiz-num-input" placeholder="Answer">';
      if (q.unit) html += '<span style="color:#6b7a99;font-size:0.84rem;">' + q.unit + '</span>';
      html += '</div>';
    }

    html += '<div class="qp-btn-row"><button class="btn btn-primary" id="quiz-submit">Submit</button>';
    html += '<button class="btn btn-ghost" id="quiz-next" style="display:none;">Next \u2192</button></div>';

    quizPanel.innerHTML = html;
    quizAnswered = false;

    /* MCQ option click */
    quizPanel.querySelectorAll('.qp-option').forEach(function (opt) {
      opt.addEventListener('click', function () {
        if (quizAnswered) return;
        quizPanel.querySelectorAll('.qp-option').forEach(function (o) { o.classList.remove('selected'); });
        opt.classList.add('selected');
        opt.querySelector('input').checked = true;
      });
    });

    document.getElementById('quiz-submit').addEventListener('click', submitQuizAnswer);
    document.getElementById('quiz-next').addEventListener('click', nextQuizQuestion);
  }

  function submitQuizAnswer() {
    if (quizAnswered) return;
    quizAnswered = true;
    var q = quizSet[quizIdx];
    var userAnswer, correct;

    if (q.type === 'mcq') {
      var sel = quizPanel.querySelector('.qp-option.selected');
      if (!sel) return;
      var selIdx = parseInt(sel.dataset.idx);
      userAnswer = q.opts[selIdx];
      correct = (selIdx === q.ans);

      /* Color options */
      quizPanel.querySelectorAll('.qp-option').forEach(function (opt) {
        var idx = parseInt(opt.dataset.idx);
        if (idx === q.ans) opt.classList.add('correct');
        else if (idx === selIdx && !correct) opt.classList.add('wrong');
      });
    } else {
      var numInput = document.getElementById('quiz-num-input');
      var val = parseFloat(numInput.value);
      if (isNaN(val)) return;
      userAnswer = val;
      correct = Math.abs(val - q.ans) <= (q.tol || 0.5);
      numInput.disabled = true;

      var fb = document.createElement('div');
      fb.style.marginTop = '8px';
      fb.style.fontWeight = '600';
      if (correct) {
        fb.style.color = '#3ddc84';
        fb.textContent = '\u2705 Correct!';
      } else {
        fb.style.color = '#ff5555';
        fb.textContent = '\u274C Incorrect. Answer: ' + q.ans + ' ' + (q.unit || '');
      }
      numInput.parentElement.appendChild(fb);
    }

    if (correct) quizScore++;
    quizAnswers.push({ q: q.q, correct: correct, given: userAnswer, expected: q.type === 'mcq' ? q.opts[q.ans] : q.ans });

    document.getElementById('quiz-submit').style.display = 'none';
    document.getElementById('quiz-next').style.display = '';
  }

  function nextQuizQuestion() {
    quizIdx++;
    if (quizIdx >= QUIZ_SIZE) {
      showQuizResult();
    } else {
      showQuizQuestion();
    }
  }

  function showQuizResult() {
    quizPanel.style.display = 'none';
    quizBar.style.display = 'none';
    quizResult.style.display = 'block';

    var pct = quizScore / QUIZ_SIZE;
    var scoreClass = pct >= 1 ? 'perfect' : (pct >= 0.6 ? 'good' : 'poor');
    var stars = pct >= 1 ? '\u2605\u2605\u2605' : (pct >= 0.6 ? '\u2605\u2605\u2606' : '\u2605\u2606\u2606');

    var html = '<div class="qr-title">Quiz Complete</div>';
    html += '<div class="qr-score ' + scoreClass + '">' + quizScore + ' / ' + QUIZ_SIZE + '</div>';
    html += '<div class="qr-stars">' + stars + '</div>';

    quizAnswers.forEach(function (a, i) {
      html += '<div class="qr-row ' + (a.correct ? 'ok' : 'err') + '">';
      html += '<strong>Q' + (i + 1) + ':</strong> ' + a.q + '<br>';
      html += '<span style="color:#6b7a99;">Your answer:</span> ' + a.given;
      if (!a.correct) html += ' <span style="color:#6b7a99;">\u2014 Correct:</span> ' + a.expected;
      html += '</div>';
    });

    html += '<br><button class="btn btn-primary" id="quiz-retry">New Quiz</button>';
    quizResult.innerHTML = html;

    document.getElementById('quiz-retry').addEventListener('click', startQuiz);
  }

  /* ================================================================
     ANNOTATION STATE (F1-F24)
     ================================================================ */

  var annTool = 'move';         /* 'move' | 'sketch' | 'shape' */
  var annStrokes = [];           /* freehand: [{points:[{wx,wy,p}], color, width, rotation}] */
  var annShapes = [];            /* shapes: [{type, wx1, wy1, wx2, wy2, color, width, filled, rotation, text?}] */
  var annActiveStroke = null;
  var annActiveShape = null;
  var sketchColor = '#ffffff';
  var sketchWidth = 2;
  var shapeType = 'rect';
  var shapeColor = '#ffffff';
  var shapeWidth = 2;
  var shapeFilled = false;
  var annSelectedIdx = -1;
  var annSelectedType = '';       /* 'shape' | 'stroke' | '' */
  var annDrag = null;             /* {type, idx, lastX, lastY, corner} */
  var showAnnotations = true;
  var annCursorPos = null;
  var lockIconPositions = false;
  var selectionUI = { box: null, corners: null, deleteBtn: null, dupBtn: null, rotateBtn: null };

  /* Zoom/pan state for canvas (F24) */
  var viewOffX = 0, viewOffY = 0, viewScale = 1;
  var isPanning = false, panStartX = 0, panStartY = 0, panOffX0 = 0, panOffY0 = 0;
  var panMode = false; /* When true, drag-to-pan without Ctrl */
  var annConsumed = false; /* flag: annotation handler consumed this pointer event */
  var PENCIL_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z' fill='%23fff' stroke='%23000' stroke-width='.8'/%3E%3Cpath d='M20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z' fill='%23fff' stroke='%23000' stroke-width='.8'/%3E%3C/svg%3E\") 2 22, crosshair";

  /* ================================================================
     UNDO / REDO SYSTEM
     ================================================================ */

  var undoStack = [];
  var redoStack = [];
  var MAX_UNDO = 30;

  function captureSnapshot() {
    return {
      components: JSON.parse(JSON.stringify(components.map(function (c) {
        return { id: c.id, type: c.type, x: c.x, y: c.y, values: c.values, orient: c.orient, extension: 0, rotation: 0, reading: 0 };
      }))),
      connections: JSON.parse(JSON.stringify(connections.map(function (cn) {
        return { from: cn.from, to: cn.to, waypoints: cn.waypoints, pressure: 0 };
      }))),
      nextId: nextId,
      annStrokes: JSON.parse(JSON.stringify(annStrokes)),
      annShapes: JSON.parse(JSON.stringify(annShapes))
    };
  }

  function saveUndoState() {
    undoStack.push(captureSnapshot());
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
  }

  function restoreSnapshot(snap) {
    components = snap.components;
    connections = snap.connections;
    nextId = snap.nextId;
    if (snap.annStrokes) annStrokes = snap.annStrokes;
    if (snap.annShapes) annShapes = snap.annShapes;
    annActiveStroke = null;
    annActiveShape = null;
    annSelectedIdx = -1;
    annSelectedType = '';
    annDrag = null;
    selectedComp = null;
    selectedConn = -1;
    hoveredConn = -1;
    propsPanel.style.display = 'none';
    hideComponentGuide();
    connectingFrom = null;
    particles = [];
    if (running) computeCircuit();
    draw();
  }

  function performUndo() {
    if (undoStack.length === 0) return;
    redoStack.push(captureSnapshot());
    var snap = undoStack.pop();
    restoreSnapshot(snap);
  }

  function performRedo() {
    if (redoStack.length === 0) return;
    undoStack.push(captureSnapshot());
    var snap = redoStack.pop();
    restoreSnapshot(snap);
  }

  var btnUndo = document.getElementById('btn-undo');
  btnUndo.addEventListener('click', performUndo);
  var btnRedoEl = document.getElementById('btn-redo');
  if (btnRedoEl) btnRedoEl.addEventListener('click', performRedo);

  /* ================================================================
     CUSTOM RIGHT-CLICK CONTEXT MENU
     ================================================================ */

  var ctxMenu = document.getElementById('ctx-menu');
  var ctxConnMenu = document.getElementById('ctx-conn-menu');
  var ctxTarget = null; /* component that was right-clicked */

  canvas.addEventListener('contextmenu', function (e) {
    if (mode !== 'simulate') return;
    e.preventDefault();
    ctxMenu.style.display = 'none';
    ctxConnMenu.style.display = 'none';
    var pos = canvasCoords(e);

    /* Check connection right-click first (but component takes priority) */
    var comp = hitTestComponent(pos.x, pos.y);
    if (!comp) {
      var connIdx = hitTestConnection(pos.x, pos.y);
      if (connIdx >= 0) {
        selectedConn = connIdx;
        selectedComp = null;
        propsPanel.style.display = 'none';
    hideComponentGuide();
        draw();
        ctxConnMenu.style.left = e.clientX + 'px';
        ctxConnMenu.style.top = e.clientY + 'px';
        ctxConnMenu.style.display = 'block';
        requestAnimationFrame(function () {
          var rect = ctxConnMenu.getBoundingClientRect();
          if (rect.right > window.innerWidth) ctxConnMenu.style.left = (e.clientX - rect.width) + 'px';
          if (rect.bottom > window.innerHeight) ctxConnMenu.style.top = (e.clientY - rect.height) + 'px';
        });
        return;
      }
      /* Empty canvas — toggle pan mode */
      setPanMode(!panMode);
      return;
    }
    ctxTarget = comp;
    selectedComp = comp;
    selectedConn = -1;
    showProperties(comp);
    draw();

    /* Position context menu at cursor */
    ctxMenu.style.left = e.clientX + 'px';
    ctxMenu.style.top = e.clientY + 'px';
    ctxMenu.style.display = 'block';

    /* Keep menu in viewport */
    requestAnimationFrame(function () {
      var rect = ctxMenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) ctxMenu.style.left = (e.clientX - rect.width) + 'px';
      if (rect.bottom > window.innerHeight) ctxMenu.style.top = (e.clientY - rect.height) + 'px';
    });
  });

  /* Hide context menus on click anywhere */
  document.addEventListener('click', function () {
    ctxMenu.style.display = 'none';
    ctxConnMenu.style.display = 'none';
  });
  document.addEventListener('contextmenu', function (e) {
    if (!canvas.contains(e.target)) {
      ctxMenu.style.display = 'none';
      ctxConnMenu.style.display = 'none';
    }
  });

  /* ── Context menu: Delete Connection ── */
  document.getElementById('ctx-conn-delete').addEventListener('click', function (e) {
    e.stopPropagation();
    ctxConnMenu.style.display = 'none';
    if (selectedConn < 0) return;
    saveUndoState();
    var delIdx = selectedConn;
    connections.splice(delIdx, 1);
    particles = particles.filter(function (p) { return p.connIdx !== delIdx; });
    particles.forEach(function (p) { if (p.connIdx > delIdx) p.connIdx--; });
    selectedConn = -1;
    if (running) computeCircuit();
    draw();
  });

  document.getElementById('ctx-conn-clear-wp').addEventListener('click', function (e) {
    e.stopPropagation();
    ctxConnMenu.style.display = 'none';
    if (selectedConn < 0) return;
    saveUndoState();
    delete connections[selectedConn].waypoints;
    delete connections[selectedConn]._dragOffset;
    markPathsDirty();
    draw();
  });

  /* ── Context menu: Info ── */
  document.getElementById('ctx-info').addEventListener('click', function (e) {
    e.stopPropagation();
    ctxMenu.style.display = 'none';
    if (!ctxTarget) return;
    var def = COMP_DEFS[ctxTarget.type];

    /* Find matching concept from CONCEPTS array */
    var conceptMap = {
      'pump': 'hydraulic-pump', 'relief': 'relief-valve', 'dcv43': 'dcv-valve', 'dcv32': 'dcv-valve',
      'check': 'check-valve', 'flow-control': 'flow-control-valve', 'cylinder-da': 'hydraulic-cylinder',
      'cylinder-sa': 'hydraulic-cylinder', 'motor': 'hydraulic-motor', 'gauge': 'pressure-gauge',
      'filter': 'hydraulic-filter', 'accumulator': 'accumulator'
    };
    var conceptId = conceptMap[ctxTarget.type];
    var concept = conceptId ? CONCEPTS.find(function (c) { return c.id === conceptId; }) : null;

    var infoHtml = '<strong style="color:#00bcd4;font-size:1rem;">' + def.name + '</strong>';
    infoHtml += ' <span style="color:#667799;">(ID: ' + ctxTarget.id + ')</span><br>';

    if (concept) {
      infoHtml += '<div style="margin-top:8px;font-size:0.84rem;color:#99a8c0;line-height:1.5;">' + concept.desc.substring(0, 300);
      if (concept.desc.length > 300) infoHtml += '...';
      infoHtml += '</div>';
      if (concept.formula) {
        infoHtml += '<div style="margin-top:6px;font-family:monospace;color:#00bcd4;font-size:0.85rem;">' + concept.formula + '</div>';
      }
      infoHtml += '<div style="margin-top:8px;font-size:0.78rem;color:#667799;">Tip: Switch to <strong>Explore → Components</strong> for full details.</div>';
    } else {
      infoHtml += '<div style="margin-top:6px;font-size:0.84rem;color:#99a8c0;">Type: ' + ctxTarget.type + '</div>';
    }

    /* Show in properties panel */
    propsPanel.style.display = 'block';
    propsBody.innerHTML = infoHtml;
  });

  /* ── Context menu: Duplicate ── */
  document.getElementById('ctx-duplicate').addEventListener('click', function (e) {
    e.stopPropagation();
    ctxMenu.style.display = 'none';
    if (!ctxTarget) return;
    saveUndoState();
    var newComp = addComponent(ctxTarget.type, ctxTarget.x + 30, ctxTarget.y + 30);
    if (newComp) {
      newComp.orient = ctxTarget.orient || 0;
      for (var key in ctxTarget.values) {
        newComp.values[key] = ctxTarget.values[key];
      }
      draw();
    }
  });

  /* ── Context menu: Rotate 90° ── */
  document.getElementById('ctx-rotate').addEventListener('click', function (e) {
    e.stopPropagation();
    ctxMenu.style.display = 'none';
    if (!ctxTarget) return;
    rotateComponent(ctxTarget);
  });

  /* ── Context menu: Delete ── */
  document.getElementById('ctx-delete').addEventListener('click', function (e) {
    e.stopPropagation();
    ctxMenu.style.display = 'none';
    if (!ctxTarget) return;
    saveUndoState();
    selectedComp = ctxTarget;
    btnDelete.click();
  });

  /* ================================================================
     KEYBOARD SHORTCUTS
     ================================================================ */

  document.addEventListener('keydown', function (e) {
    if (mode !== 'simulate') return;
    /* Ignore if user is typing in an input/select */
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    /* Ctrl+Z / Cmd+Z → Undo, Ctrl+Shift+Z → Redo */
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); performUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); performRedo(); return; }

    /* Escape: exit pan mode first, then connection, then selection */
    if (e.key === 'Escape') {
      if (panMode) { setPanMode(false); return; }
      if (connectingFrom) { connectingFrom = null; draw(); return; }
      var guideOverlay = document.getElementById('guide-overlay');
      if (guideOverlay && guideOverlay.style.display === 'flex') { guideOverlay.style.display = 'none'; e.stopPropagation(); return; }
      if (selectedConn >= 0) { selectedConn = -1; draw(); return; }
      if (selectedComp) { selectedComp = null; propsPanel.style.display = 'none';
    hideComponentGuide(); draw(); return; }
      return;
    }

    /* Zoom shortcuts: Ctrl+= zoom in, Ctrl+- zoom out, Ctrl+0 reset, Ctrl+1 fit */
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomCentre(1.3); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomCentre(1 / 1.3); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); viewOffX = 0; viewOffY = 0; viewScale = 1; draw(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '1') { e.preventDefault(); var bf = document.getElementById('btn-zoom-fit'); if (bf) bf.click(); return; }

    /* H key toggles pan mode (Figma/Photoshop convention) */
    if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey) { setPanMode(!panMode); return; }

    /* Delete/Backspace: annotation first, then circuit */
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (annSelectedIdx >= 0) { deleteSelectedAnnotation(); e.preventDefault(); return; }
      if (selectedConn >= 0) {
        saveUndoState();
        var delIdx = selectedConn;
        connections.splice(delIdx, 1);
        particles = particles.filter(function (p) { return p.connIdx !== delIdx; });
        particles.forEach(function (p) { if (p.connIdx > delIdx) p.connIdx--; });
        selectedConn = -1;
        e.preventDefault();
        if (running) computeCircuit();
        draw();
      } else if (selectedComp) {
        saveUndoState(); btnDelete.click(); e.preventDefault();
      }
      return;
    }

    /* R key: rotate selected component (only if selectedComp, else DCV shortcut) */
    if (e.key === 'r' || e.key === 'R') {
      if (selectedComp) { saveUndoState(); selectedComp.orient = selectedComp.orient ? 0 : 1; draw(); return; }
      setAllDcvPosition('Retract'); return;
    }

    /* D key: duplicate selected component */
    if (e.key === 'd' || e.key === 'D') {
      if (selectedComp) {
        saveUndoState();
        var orig = selectedComp;
        var vals = {};
        for (var k in orig.values) vals[k] = orig.values[k];
        var newC = { id: nextId++, type: orig.type, x: orig.x + 40, y: orig.y + 40, orient: orig.orient, values: vals, extension: 0, rotation: 0, reading: 0 };
        components.push(newC);
        selectedComp = newC;
        showProperties(newC);
        draw();
      }
      return;
    }

    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (running) btnStop.click(); else btnRun.click();
        break;
      case 'e': case 'E':
        setAllDcvPosition('Extend'); break;
      case 'c': case 'C':
        setAllDcvPosition('Center'); break;
    }
  });

  function setAllDcvPosition(pos) {
    components.forEach(function (c) {
      if (c.type === 'dcv43') {
        c.values.position = pos;
      } else if (c.type === 'dcv32') {
        c.values.position = (pos === 'Extend' || pos === 'Retract') ? 'Open' : 'Closed';
      } else if (c.type === 'valve22') {
        c.values.position = (pos === 'Extend' || pos === 'Retract') ? 'Open' : 'Closed';
      }
    });
    if (selectedComp && (selectedComp.type === 'dcv43' || selectedComp.type === 'dcv32' || selectedComp.type === 'valve22')) {
      showProperties(selectedComp);
    }
    if (running) computeCircuit();
    draw();
  }

  /* ================================================================
     ANNOTATION SYSTEM — F1-F24 Canvas Marking Tools
     ================================================================ */

  /* ── World ↔ Screen coordinate conversion (screen = canvas CSS px) ── */
  function toSX(wx) { return wx * viewScale + viewOffX; }
  function toSY(wy) { return wy * viewScale + viewOffY; }
  function toWX(sx) { return (sx - viewOffX) / viewScale; }
  function toWY(sy) { return (sy - viewOffY) / viewScale; }

  /* ── Geometry helpers ── */
  function rotatePoint(px, py, cx, cy, angle) {
    var cos = Math.cos(angle), sin = Math.sin(angle);
    var dx = px - cx, dy = py - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }
  function unrotatePoint(px, py, cx, cy, angle) {
    if (!angle) return { x: px, y: py };
    return rotatePoint(px, py, cx, cy, -angle);
  }
  function distToSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    var cx2 = ax + t * dx, cy2 = ay + t * dy;
    return Math.sqrt((px - cx2) * (px - cx2) + (py - cy2) * (py - cy2));
  }
  function pointInPolygon(px, py, corners) {
    if (!corners || corners.length < 3) return false;
    var n = corners.length, inside = true;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var cross = (corners[i].x - corners[j].x) * (py - corners[j].y) -
                  (corners[i].y - corners[j].y) * (px - corners[j].x);
      if (i === 0) inside = cross >= 0;
      else if ((cross >= 0) !== inside) return false;
    }
    return true;
  }
  function annRoundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
  }

  /* ── F17-F19: Export functions ── */
  function drawWatermark() {
    ctx.save();
    ctx.font = '11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(139,157,195,0.5)';
    ctx.textAlign = 'right';
    ctx.fillText('mechsimulator.com', W - 12, H - 8);
    ctx.restore();
  }
  function exportPNG() {
    var wasRunning = running;
    if (wasRunning) { running = false; }
    draw();
    drawWatermark();
    var link = document.createElement('a');
    link.download = 'hydraulic-circuit.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    draw();
    if (wasRunning) { running = true; }
  }
  function exportCleanPNG() {
    var wasShow = showAnnotations;
    showAnnotations = false;
    draw();
    drawWatermark();
    var url = canvas.toDataURL('image/png');
    showAnnotations = wasShow;
    draw();
    var a = document.createElement('a');
    a.href = url; a.download = 'hydraulic-circuit-clean.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  /* ── Stroke rendering (F1) ── */
  function renderStroke(stroke) {
    var pts = stroke.points;
    if (pts.length < 2) return;
    var sRot = stroke.rotation || 0;
    if (sRot) {
      var sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
      for (var ri = 0; ri < pts.length; ri++) {
        var rpx = toSX(pts[ri].wx), rpy = toSY(pts[ri].wy);
        if (rpx < sMinX) sMinX = rpx; if (rpy < sMinY) sMinY = rpy;
        if (rpx > sMaxX) sMaxX = rpx; if (rpy > sMaxY) sMaxY = rpy;
      }
      var scx = (sMinX + sMaxX) / 2, scy = (sMinY + sMaxY) / 2;
      ctx.save(); ctx.translate(scx, scy); ctx.rotate(sRot); ctx.translate(-scx, -scy);
    }
    ctx.strokeStyle = stroke.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = 0.9;
    var hasPressure = false;
    for (var k = 0; k < pts.length; k++) {
      if (pts[k].p > 0 && Math.abs(pts[k].p - 0.5) > 0.05) { hasPressure = true; break; }
    }
    if (!hasPressure) {
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      ctx.moveTo(toSX(pts[0].wx), toSY(pts[0].wy));
      for (var i = 1; i < pts.length - 1; i++) {
        var mx = (toSX(pts[i].wx) + toSX(pts[i + 1].wx)) / 2;
        var my = (toSY(pts[i].wy) + toSY(pts[i + 1].wy)) / 2;
        ctx.quadraticCurveTo(toSX(pts[i].wx), toSY(pts[i].wy), mx, my);
      }
      ctx.lineTo(toSX(pts[pts.length - 1].wx), toSY(pts[pts.length - 1].wy));
      ctx.stroke();
    } else {
      for (var j = 1; j < pts.length; j++) {
        var p0 = pts[j - 1], p1 = pts[j];
        ctx.lineWidth = stroke.width * (0.4 + p1.p * 0.8);
        ctx.beginPath();
        ctx.moveTo(toSX(p0.wx), toSY(p0.wy));
        ctx.lineTo(toSX(p1.wx), toSY(p1.wy));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (sRot) ctx.restore();
  }

  /* ── Shape rendering (F2) ── */
  function drawArrowhead(x, y, angle, size, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-size, -size * 0.45); ctx.lineTo(-size, size * 0.45);
    ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore();
  }

  function renderShape(s) {
    var x1 = toSX(s.wx1), y1 = toSY(s.wy1), x2 = toSX(s.wx2), y2 = toSY(s.wy2);
    var rot = s.rotation || 0;
    if (rot) {
      var rcx = (x1 + x2) / 2, rcy = (y1 + y2) / 2;
      ctx.save(); ctx.translate(rcx, rcy); ctx.rotate(rot); ctx.translate(-rcx, -rcy);
    }
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.width;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = 0.9;
    var headSize = Math.max(10, s.width * 3);
    switch (s.type) {
      case 'line':
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); break;
      case 'arrow':
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        drawArrowhead(x2, y2, Math.atan2(y2 - y1, x2 - x1), headSize, s.color); break;
      case 'dblarrow':
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        drawArrowhead(x2, y2, Math.atan2(y2 - y1, x2 - x1), headSize, s.color);
        drawArrowhead(x1, y1, Math.atan2(y1 - y2, x1 - x2), headSize, s.color); break;
      case 'rect':
        var rx = Math.min(x1, x2), ry = Math.min(y1, y2), rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
        if (s.filled) { ctx.globalAlpha = 0.15; ctx.fillRect(rx, ry, rw, rh); ctx.globalAlpha = 0.9; }
        ctx.strokeRect(rx, ry, rw, rh); break;
      case 'circle':
        var cdx = x2 - x1, cdy = y2 - y1, radius = Math.sqrt(cdx * cdx + cdy * cdy);
        ctx.beginPath(); ctx.arc(x1, y1, radius, 0, Math.PI * 2);
        if (s.filled) { ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 0.9; }
        ctx.stroke(); break;
      case 'ellipse':
        var ecx = (x1 + x2) / 2, ecy = (y1 + y2) / 2, erx = Math.abs(x2 - x1) / 2, ery = Math.abs(y2 - y1) / 2;
        if (erx < 1 || ery < 1) break;
        ctx.beginPath(); ctx.ellipse(ecx, ecy, erx, ery, 0, 0, Math.PI * 2);
        if (s.filled) { ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 0.9; }
        ctx.stroke(); break;
      case 'text':
        if (!s.text) break;
        var tbW = Math.abs(x2 - x1), tbH = Math.abs(y2 - y1);
        if (tbW < 4) tbW = 60; if (tbH < 4) tbH = 22;
        var fontSize = Math.max(8, Math.round(tbH * 0.64));
        ctx.font = 'bold ' + fontSize + 'px ' + _fontFamily;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        var tbX = Math.min(x1, x2), tbY = Math.min(y1, y2);
        ctx.fillStyle = 'rgba(13,17,23,0.85)'; ctx.strokeStyle = s.color; ctx.lineWidth = 1;
        annRoundRect(ctx, tbX, tbY, tbW, tbH, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = s.color;
        ctx.fillText(s.text, tbX + 6, tbY + (tbH - fontSize) / 2);
        break;
    }
    ctx.globalAlpha = 1;
    if (rot) ctx.restore();
  }

  /* ── Draw all annotations ── */
  function drawAnnotations() {
    if (!showAnnotations) return;
    for (var i = 0; i < annStrokes.length; i++) renderStroke(annStrokes[i]);
    if (annActiveStroke) renderStroke(annActiveStroke);
    for (var j = 0; j < annShapes.length; j++) renderShape(annShapes[j]);
    if (annActiveShape) renderShape(annActiveShape);
    drawSelectionIndicator();
    drawCursorDot();
  }

  /* ── F21: Cursor dot ── */
  function drawCursorDot() {
    if (!annCursorPos) return;
    if (annTool !== 'sketch' && annTool !== 'shape') return;
    var color = annTool === 'sketch' ? sketchColor : shapeColor;
    var size = annTool === 'sketch' ? sketchWidth : shapeWidth;
    var r = Math.max(3, size);
    ctx.beginPath(); ctx.arc(annCursorPos.x, annCursorPos.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.globalAlpha = 0.7; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.globalAlpha = 0.5; ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ── F7-F9: Selection system ── */
  function findNearestAnnotation(sx, sy) {
    var threshold = 15, best = null, bestDist = threshold;
    /* Shapes (reverse order — topmost wins) */
    for (var i = annShapes.length - 1; i >= 0; i--) {
      var s = annShapes[i];
      var x1 = toSX(s.wx1), y1 = toSY(s.wy1), x2 = toSX(s.wx2), y2 = toSY(s.wy2);
      var d = Infinity, lsx = sx, lsy = sy;
      if (s.rotation) {
        var scx2 = (x1 + x2) / 2, scy2 = (y1 + y2) / 2;
        var lp = unrotatePoint(sx, sy, scx2, scy2, s.rotation);
        lsx = lp.x; lsy = lp.y;
      }
      switch (s.type) {
        case 'line': case 'arrow': case 'dblarrow':
          d = distToSegment(lsx, lsy, x1, y1, x2, y2); break;
        case 'rect':
          var rrx = Math.min(x1, x2), rry = Math.min(y1, y2), rrw = Math.abs(x2 - x1), rrh = Math.abs(y2 - y1);
          if (lsx >= rrx - threshold && lsx <= rrx + rrw + threshold && lsy >= rry - threshold && lsy <= rry + rrh + threshold) {
            d = Math.min(Math.abs(lsx - rrx), Math.abs(lsx - rrx - rrw), Math.abs(lsy - rry), Math.abs(lsy - rry - rrh));
            if (s.filled && lsx >= rrx && lsx <= rrx + rrw && lsy >= rry && lsy <= rry + rrh) d = 0;
          } break;
        case 'circle':
          var cr = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
          var cd = Math.sqrt((lsx - x1) * (lsx - x1) + (lsy - y1) * (lsy - y1));
          d = Math.abs(cd - cr); if (s.filled && cd <= cr) d = 0; break;
        case 'ellipse':
          var eex = (x1 + x2) / 2, eey = (y1 + y2) / 2, eerx = Math.abs(x2 - x1) / 2, eery = Math.abs(y2 - y1) / 2;
          if (eerx > 0 && eery > 0) {
            var enorm = Math.sqrt(((lsx - eex) * (lsx - eex)) / (eerx * eerx) + ((lsy - eey) * (lsy - eey)) / (eery * eery));
            d = Math.abs(enorm - 1) * Math.min(eerx, eery); if (s.filled && enorm <= 1) d = 0;
          } break;
        case 'text':
          var ttx = Math.min(x1, x2), tty = Math.min(y1, y2), ttw = Math.abs(x2 - x1), tth = Math.abs(y2 - y1);
          if (ttw < 4) { ttw = 60; tth = 22; }
          if (lsx >= ttx - 4 && lsx <= ttx + ttw + 4 && lsy >= tty - 4 && lsy <= tty + tth + 4) d = 0; break;
      }
      if (d < bestDist) { bestDist = d; best = { type: 'shape', idx: i }; }
    }
    /* Strokes (reverse order) */
    for (var k = annStrokes.length - 1; k >= 0; k--) {
      var pts = annStrokes[k].points;
      for (var m = 1; m < pts.length; m++) {
        var sd = distToSegment(sx, sy, toSX(pts[m - 1].wx), toSY(pts[m - 1].wy), toSX(pts[m].wx), toSY(pts[m].wy));
        if (sd < bestDist) { bestDist = sd; best = { type: 'stroke', idx: k }; break; }
      }
    }
    return best;
  }

  function getSelectionBounds() {
    if (annSelectedIdx < 0) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var rot = 0, corners = null;
    if (annSelectedType === 'shape') {
      var s = annShapes[annSelectedIdx]; if (!s) return null;
      rot = s.rotation || 0;
      var sx1 = toSX(s.wx1), sy1 = toSY(s.wy1), sx2 = toSX(s.wx2), sy2 = toSY(s.wy2);
      var lMinX, lMinY, lMaxX, lMaxY;
      if (s.type === 'circle') {
        var r = Math.sqrt((sx2 - sx1) * (sx2 - sx1) + (sy2 - sy1) * (sy2 - sy1));
        lMinX = sx1 - r; lMinY = sy1 - r; lMaxX = sx1 + r; lMaxY = sy1 + r;
      } else {
        lMinX = Math.min(sx1, sx2); lMinY = Math.min(sy1, sy2);
        lMaxX = Math.max(sx1, sx2); lMaxY = Math.max(sy1, sy2);
      }
      var pad = 6; lMinX -= pad; lMinY -= pad; lMaxX += pad; lMaxY += pad;
      var cx3 = (lMinX + lMaxX) / 2, cy3 = (lMinY + lMaxY) / 2;
      var c0 = rotatePoint(lMinX, lMinY, cx3, cy3, rot);
      var c1 = rotatePoint(lMaxX, lMinY, cx3, cy3, rot);
      var c2 = rotatePoint(lMaxX, lMaxY, cx3, cy3, rot);
      var c3 = rotatePoint(lMinX, lMaxY, cx3, cy3, rot);
      corners = [c0, c1, c2, c3];
    } else if (annSelectedType === 'stroke') {
      var st = annStrokes[annSelectedIdx]; if (!st) return null;
      rot = st.rotation || 0;
      for (var i = 0; i < st.points.length; i++) {
        var px = toSX(st.points[i].wx), py = toSY(st.points[i].wy);
        if (px < minX) minX = px; if (py < minY) minY = py;
        if (px > maxX) maxX = px; if (py > maxY) maxY = py;
      }
      if (!isFinite(minX)) return null;
      var spad = 6; minX -= spad; minY -= spad; maxX += spad; maxY += spad;
      var scx4 = (minX + maxX) / 2, scy4 = (minY + maxY) / 2;
      if (rot) {
        var sc0 = rotatePoint(minX, minY, scx4, scy4, rot);
        var sc1 = rotatePoint(maxX, minY, scx4, scy4, rot);
        var sc2 = rotatePoint(maxX, maxY, scx4, scy4, rot);
        var sc3 = rotatePoint(minX, maxY, scx4, scy4, rot);
        corners = [sc0, sc1, sc2, sc3];
      } else {
        corners = [{x:minX,y:minY},{x:maxX,y:minY},{x:maxX,y:maxY},{x:minX,y:maxY}];
      }
    }
    if (!corners) return null;
    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
    for (var ci = 0; ci < 4; ci++) {
      if (corners[ci].x < minX) minX = corners[ci].x;
      if (corners[ci].y < minY) minY = corners[ci].y;
      if (corners[ci].x > maxX) maxX = corners[ci].x;
      if (corners[ci].y > maxY) maxY = corners[ci].y;
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, rotation: rot, cx: (minX+maxX)/2, cy: (minY+maxY)/2, corners: corners };
  }

  function hitCorner(sx, sy, b) {
    if (!b || !b.corners) return null;
    var t = 12, labels = ['nw', 'ne', 'se', 'sw'];
    for (var ci = 0; ci < 4; ci++) {
      if (Math.abs(sx - b.corners[ci].x) < t && Math.abs(sy - b.corners[ci].y) < t) return labels[ci];
    }
    return null;
  }
  function hitBtn(sx, sy, btn) {
    if (!btn) return false;
    return sx >= btn.x - 4 && sx <= btn.x + btn.w + 4 && sy >= btn.y - 4 && sy <= btn.y + btn.h + 4;
  }

  /* ── Selection indicator drawing (F13) ── */
  function drawSelectionIndicator() {
    var b = getSelectionBounds();
    if (!b) { selectionUI = { box: null, corners: null, deleteBtn: null, dupBtn: null, rotateBtn: null }; return; }
    selectionUI.box = b;
    var c = b.corners;
    /* Dashed selection polygon */
    ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y);
    ctx.lineTo(c[1].x, c[1].y); ctx.lineTo(c[2].x, c[2].y); ctx.lineTo(c[3].x, c[3].y);
    ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    /* Corner handles */
    var hs = 5; ctx.fillStyle = '#4fc3f7'; ctx.globalAlpha = 1;
    for (var chi = 0; chi < 4; chi++) ctx.fillRect(c[chi].x - hs, c[chi].y - hs, hs * 2, hs * 2);
    /* Action icons above selection */
    var iconSize = 24, gap = 6, totalW = iconSize * 3 + gap * 2;
    var icX, icY;
    if (lockIconPositions && selectionUI.deleteBtn) {
      icX = selectionUI.deleteBtn.x; icY = selectionUI.deleteBtn.y;
    } else {
      icX = (b.minX + b.maxX) / 2 - totalW / 2;
      icY = b.minY - iconSize - 8;
      if (icY < 2) icY = b.maxY + 8;
    }
    ctx.font = '12px ' + _fontFamily; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    /* Delete button */
    var delBtn = { x: icX, y: icY, w: iconSize, h: iconSize };
    ctx.fillStyle = 'rgba(13,17,23,0.9)'; ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 1;
    annRoundRect(ctx, delBtn.x, delBtn.y, delBtn.w, delBtn.h, 5); ctx.fill(); ctx.stroke();
    var ddx = delBtn.x + iconSize / 2, ddy = delBtn.y + iconSize / 2;
    ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ddx - 5, ddy - 4); ctx.lineTo(ddx + 5, ddy - 4);
    ctx.moveTo(ddx - 4, ddy - 3); ctx.lineTo(ddx - 3, ddy + 5); ctx.lineTo(ddx + 3, ddy + 5); ctx.lineTo(ddx + 4, ddy - 3);
    ctx.moveTo(ddx - 1, ddy - 2); ctx.lineTo(ddx - 1, ddy + 3);
    ctx.moveTo(ddx + 1, ddy - 2); ctx.lineTo(ddx + 1, ddy + 3);
    ctx.stroke();
    selectionUI.deleteBtn = delBtn;
    /* Duplicate button */
    var dupBtn = { x: icX + iconSize + gap, y: icY, w: iconSize, h: iconSize };
    ctx.fillStyle = 'rgba(13,17,23,0.9)'; ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 1;
    annRoundRect(ctx, dupBtn.x, dupBtn.y, dupBtn.w, dupBtn.h, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4fc3f7'; ctx.font = '13px ' + _fontFamily;
    ctx.fillText('\u2750', dupBtn.x + iconSize / 2, dupBtn.y + iconSize / 2);
    selectionUI.dupBtn = dupBtn;
    /* Rotate button */
    var rotBtn = { x: icX + (iconSize + gap) * 2, y: icY, w: iconSize, h: iconSize };
    ctx.fillStyle = 'rgba(13,17,23,0.9)'; ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1;
    annRoundRect(ctx, rotBtn.x, rotBtn.y, rotBtn.w, rotBtn.h, 5); ctx.fill(); ctx.stroke();
    var rrbx = rotBtn.x + iconSize / 2, rrby = rotBtn.y + iconSize / 2;
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(rrbx, rrby, 5, -Math.PI * 0.8, Math.PI * 0.5); ctx.stroke();
    ctx.beginPath(); var ax = rrbx + 5 * Math.cos(Math.PI * 0.5), ay = rrby + 5 * Math.sin(Math.PI * 0.5);
    ctx.moveTo(ax - 3, ay - 2); ctx.lineTo(ax, ay + 1); ctx.lineTo(ax + 3, ay - 2); ctx.stroke();
    selectionUI.rotateBtn = rotBtn;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  /* ── F11-F12: Delete, Duplicate, Rotate ── */
  function deleteSelectedAnnotation() {
    if (annSelectedIdx < 0) return;
    saveUndoState();
    if (annSelectedType === 'shape') annShapes.splice(annSelectedIdx, 1);
    else if (annSelectedType === 'stroke') annStrokes.splice(annSelectedIdx, 1);
    annSelectedIdx = -1; annSelectedType = '';
    selectionUI = { box: null, corners: null, deleteBtn: null, dupBtn: null, rotateBtn: null };
    draw();
  }
  function duplicateSelectedAnnotation() {
    if (annSelectedIdx < 0) return;
    saveUndoState();
    var offset = 20 / viewScale;
    if (annSelectedType === 'shape') {
      var orig2 = annShapes[annSelectedIdx]; if (!orig2) return;
      var dup = JSON.parse(JSON.stringify(orig2));
      dup.wx1 += offset; dup.wy1 += offset; dup.wx2 += offset; dup.wy2 += offset;
      annShapes.push(dup); annSelectedIdx = annShapes.length - 1;
    } else if (annSelectedType === 'stroke') {
      var origS = annStrokes[annSelectedIdx]; if (!origS) return;
      var dupS = JSON.parse(JSON.stringify(origS));
      for (var i = 0; i < dupS.points.length; i++) { dupS.points[i].wx += offset; dupS.points[i].wy += offset; }
      annStrokes.push(dupS); annSelectedIdx = annStrokes.length - 1;
    }
    draw();
  }
  function rotateSelectedAnnotation() {
    if (annSelectedIdx < 0) return;
    saveUndoState();
    if (annSelectedType === 'shape') {
      var s = annShapes[annSelectedIdx];
      if (s) s.rotation = ((s.rotation || 0) + Math.PI / 12) % (Math.PI * 2);
    } else if (annSelectedType === 'stroke') {
      var st = annStrokes[annSelectedIdx];
      if (st) st.rotation = ((st.rotation || 0) + Math.PI / 12) % (Math.PI * 2);
    }
    lockIconPositions = true; draw(); lockIconPositions = false;
  }

  /* ── F14: Text label creation ── */
  function createTextLabel(sx, sy) {
    var inp = document.getElementById('shape-text-input');
    if (!inp) return;
    inp.style.display = 'block';
    inp.style.left = sx + 'px'; inp.style.top = sy + 'px';
    inp.value = ''; inp.focus();
    var committed = false;
    function commit() {
      if (committed) return; committed = true;
      var txt = inp.value.trim();
      inp.style.display = 'none';
      inp.removeEventListener('keydown', onKey);
      inp.removeEventListener('blur', commit);
      document.removeEventListener('pointerdown', onOutside, true);
      if (!txt) { setAnnTool('move'); return; }
      saveUndoState();
      var wx = toWX(sx), wy = toWY(sy);
      ctx.font = 'bold 14px ' + _fontFamily;
      var tw = ctx.measureText(txt).width + 16;
      annShapes.push({
        type: 'text', wx1: wx, wy1: wy, wx2: wx + tw / viewScale, wy2: wy + 24 / viewScale,
        color: shapeColor, width: shapeWidth, filled: false, rotation: 0, text: txt
      });
      setAnnTool('move'); draw();
    }
    function onKey(e2) {
      if (e2.key === 'Enter') { e2.preventDefault(); commit(); }
      if (e2.key === 'Escape') { inp.value = ''; commit(); }
    }
    function onOutside(e2) { if (e2.target !== inp) commit(); }
    inp.addEventListener('keydown', onKey);
    inp.addEventListener('blur', commit);
    document.addEventListener('pointerdown', onOutside, true);
  }

  /* ── F14: Edit existing text shape on double-click ── */
  function editTextShape(idx, shape) {
    var sx = toSX(shape.wx1), sy = toSY(shape.wy1);
    var inp = document.getElementById('shape-text-input');
    if (!inp) return;
    inp.style.display = 'block';
    inp.style.left = sx + 'px'; inp.style.top = sy + 'px';
    inp.value = shape.text || ''; inp.focus(); inp.select();
    var committed = false;
    function commit() {
      if (committed) return; committed = true;
      var txt = inp.value.trim();
      inp.style.display = 'none';
      inp.removeEventListener('keydown', onKey);
      inp.removeEventListener('blur', commit);
      document.removeEventListener('pointerdown', onOutside, true);
      if (txt) {
        saveUndoState();
        shape.text = txt;
        ctx.font = 'bold 14px ' + _fontFamily;
        var tw = ctx.measureText(txt).width + 16;
        shape.wx2 = shape.wx1 + tw / viewScale;
      }
      draw();
    }
    function onKey(e2) {
      if (e2.key === 'Enter') { e2.preventDefault(); commit(); }
      if (e2.key === 'Escape') { inp.value = shape.text || ''; commit(); }
    }
    function onOutside(e2) { if (e2.target !== inp) commit(); }
    inp.addEventListener('keydown', onKey);
    inp.addEventListener('blur', commit);
    document.addEventListener('pointerdown', onOutside, true);
  }

  /* ── Tool switching ── */
  function setAnnTool(t) {
    if (panMode) setPanMode(false);
    annTool = t;
    annSelectedIdx = -1; annSelectedType = '';
    annActiveStroke = null; annActiveShape = null;
    var btns = document.querySelectorAll('#mark-bar .tool-btn[data-tool]');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-tool') === t);
    if (t === 'sketch') canvas.style.cursor = PENCIL_CURSOR;
    else if (t === 'shape') canvas.style.cursor = 'crosshair';
    else canvas.style.cursor = '';
  }

  /* ── Wire marking toolbar (dropdowns, swatches, etc.) ── */
  function wireMarkBar() {
    var btns = document.querySelectorAll('#mark-bar .tool-btn[data-tool]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        setAnnTool(this.getAttribute('data-tool'));
        draw();
      });
    }
    var skToggle = document.getElementById('sketch-drop-toggle');
    var skDrop = document.getElementById('sketch-dropdown');
    var skBtn = document.querySelector('[data-tool="sketch"]');
    function positionDropdown(drop, toggle) {
      var r = toggle.getBoundingClientRect();
      drop.style.left = r.left + 'px';
      drop.style.top = (r.bottom + 4) + 'px';
    }
    if (skToggle && skDrop) {
      skToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        var show = skDrop.style.display === 'none';
        skDrop.style.display = show ? '' : 'none';
        if (show) positionDropdown(skDrop, skToggle);
      });
      var skSwatches = skDrop.querySelectorAll('.swatch');
      for (var si = 0; si < skSwatches.length; si++) {
        (function (sw) {
          sw.addEventListener('click', function (e) {
            e.stopPropagation();
            sketchColor = sw.getAttribute('data-color');
            for (var j = 0; j < skSwatches.length; j++) skSwatches[j].classList.remove('active');
            sw.classList.add('active');
            if (skBtn) skBtn.style.setProperty('--sketch-color', sketchColor);
          });
        })(skSwatches[si]);
      }
      var skWidths = skDrop.querySelectorAll('.width-btn');
      for (var swi = 0; swi < skWidths.length; swi++) {
        (function (wb) {
          wb.addEventListener('click', function (e) {
            e.stopPropagation();
            sketchWidth = parseInt(wb.getAttribute('data-width'), 10) || 2;
            for (var k = 0; k < skWidths.length; k++) skWidths[k].classList.remove('active');
            wb.classList.add('active');
          });
        })(skWidths[swi]);
      }
      document.addEventListener('click', function (e) { if (!skDrop.contains(e.target) && e.target !== skToggle) skDrop.style.display = 'none'; });
    }
    var shToggle = document.getElementById('shape-drop-toggle');
    var shDrop = document.getElementById('shape-dropdown');
    var shBtn = document.querySelector('[data-tool="shape"]');
    var shapeIcons = { arrow: '\u27A4', line: '\u2571', rect: '\u25AD', circle: '\u25EF', ellipse: '\u2B2D', dblarrow: '\u27F7', text: 'T' };
    var iconEl = document.getElementById('shape-icon');
    if (shToggle && shDrop) {
      shToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        var show = shDrop.style.display === 'none';
        shDrop.style.display = show ? '' : 'none';
        if (show) positionDropdown(shDrop, shToggle);
        if (skDrop) skDrop.style.display = 'none';
      });
      var picks = shDrop.querySelectorAll('.shape-pick');
      for (var p = 0; p < picks.length; p++) {
        (function (pk) {
          pk.addEventListener('click', function (e) {
            e.stopPropagation();
            shapeType = pk.getAttribute('data-shape');
            for (var q = 0; q < picks.length; q++) picks[q].classList.remove('active');
            pk.classList.add('active');
            if (iconEl) iconEl.textContent = shapeIcons[shapeType] || '\u25AD';
            shDrop.style.display = 'none';
            setAnnTool('shape');
          });
        })(picks[p]);
      }
      var shSwatches = shDrop.querySelectorAll('.shape-colors .swatch');
      for (var sci = 0; sci < shSwatches.length; sci++) {
        (function (sw) {
          sw.addEventListener('click', function (e) {
            e.stopPropagation();
            shapeColor = sw.getAttribute('data-color');
            for (var j = 0; j < shSwatches.length; j++) shSwatches[j].classList.remove('active');
            sw.classList.add('active');
            if (shBtn) shBtn.style.setProperty('--shape-color', shapeColor);
          });
        })(shSwatches[sci]);
      }
      var shWidths = shDrop.querySelectorAll('.shape-widths .width-btn');
      for (var swi2 = 0; swi2 < shWidths.length; swi2++) {
        (function (wb) {
          wb.addEventListener('click', function (e) {
            e.stopPropagation();
            shapeWidth = parseInt(wb.getAttribute('data-width'), 10) || 2;
            for (var k = 0; k < shWidths.length; k++) shWidths[k].classList.remove('active');
            wb.classList.add('active');
          });
        })(shWidths[swi2]);
      }
      var fillBtns = shDrop.querySelectorAll('.fill-btn');
      for (var fi = 0; fi < fillBtns.length; fi++) {
        (function (fb) {
          fb.addEventListener('click', function (e) {
            e.stopPropagation();
            shapeFilled = fb.getAttribute('data-fill') === 'true';
            for (var m = 0; m < fillBtns.length; m++) fillBtns[m].classList.remove('active');
            fb.classList.add('active');
          });
        })(fillBtns[fi]);
      }
      document.addEventListener('click', function (e) { if (!shDrop.contains(e.target) && e.target !== shToggle) shDrop.style.display = 'none'; });
    }
    /* F15: Annotation toggle */
    var btnToggle = document.getElementById('btn-toggle-annotations');
    if (btnToggle) {
      btnToggle.addEventListener('click', function () {
        showAnnotations = !showAnnotations;
        btnToggle.classList.toggle('active', showAnnotations);
        btnToggle.textContent = showAnnotations ? '\uD83D\uDC41' : '\uD83D\uDEAB';
        btnToggle.title = showAnnotations ? 'Hide Annotations' : 'Show Annotations';
        draw();
      });
    }
    /* F16: Clear annotations dialog */
    var btnClearAnn = document.getElementById('btn-clear-annotations');
    var clearOverlay = document.getElementById('clear-ann-confirm');
    var clearSelect = document.getElementById('clear-ann-category');
    var clearHint = document.getElementById('clear-ann-hint');
    var clearNo = document.getElementById('clear-ann-no');
    var clearYes = document.getElementById('clear-ann-yes');
    var hints = {
      all: 'Removes all sketches, shapes, and text annotations.',
      sketches: 'Removes freehand sketch strokes only.',
      shapes: 'Removes geometric shapes and text labels only.'
    };
    if (btnClearAnn && clearOverlay) {
      if (clearSelect && clearHint) {
        clearSelect.addEventListener('change', function () { clearHint.textContent = hints[clearSelect.value] || ''; });
      }
      btnClearAnn.addEventListener('click', function () {
        if (!annStrokes.length && !annShapes.length) return;
        if (clearSelect) clearSelect.value = 'all';
        if (clearHint) clearHint.textContent = hints.all;
        clearOverlay.style.display = '';
      });
      if (clearNo) clearNo.addEventListener('click', function () { clearOverlay.style.display = 'none'; });
      if (clearYes) clearYes.addEventListener('click', function () {
        saveUndoState();
        var cat = clearSelect ? clearSelect.value : 'all';
        if (cat === 'all' || cat === 'sketches') { annStrokes = []; annActiveStroke = null; }
        if (cat === 'all' || cat === 'shapes') { annShapes = []; annActiveShape = null; }
        annSelectedIdx = -1; annSelectedType = '';
        clearOverlay.style.display = 'none'; draw();
      });
      clearOverlay.addEventListener('click', function (e) { if (e.target === clearOverlay) clearOverlay.style.display = 'none'; });
    }
    /* Export PNG button */
    var exportBtn = document.getElementById('canvas-export-btn');
    if (exportBtn) exportBtn.addEventListener('click', function () { exportPNG(); });
  }

  /* ── F20: Fullscreen ── */
  function wireFullscreen() {
    var btn = document.getElementById('btn-fullscreen');
    var card = document.getElementById('sim-panel');
    if (!btn || !card) return;
    function isFS() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
    function enterFS() {
      if (card.requestFullscreen) card.requestFullscreen();
      else if (card.webkitRequestFullscreen) card.webkitRequestFullscreen();
    }
    function exitFS() {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    function onFSChange() {
      if (isFS()) {
        card.classList.add('is-fullscreen');
        btn.textContent = '\u2715'; btn.title = 'Exit Fullscreen';
      } else {
        card.classList.remove('is-fullscreen');
        btn.textContent = '\u26F6'; btn.title = 'Fullscreen';
      }
      /* Double-rAF: first frame applies CSS layout, second reads final dims */
      requestAnimationFrame(function () { requestAnimationFrame(resizeCanvas); });
    }
    btn.addEventListener('click', function () { if (isFS()) exitFS(); else enterFS(); });
    document.addEventListener('fullscreenchange', onFSChange);
    document.addEventListener('webkitfullscreenchange', onFSChange);
  }

  /* ── Zoom/Pan helpers (IIFE scope so keyboard shortcuts can use them) ── */
  function zoomCentre(factor) {
    var cx = W / 2, cy = H / 2;
    var newScale = viewScale * factor;
    if (newScale < 0.3 || newScale > 5) return;
    viewOffX = cx - (cx - viewOffX) * factor;
    viewOffY = cy - (cy - viewOffY) * factor;
    viewScale = newScale;
    draw();
  }

  function setPanMode(on) {
    panMode = on;
    if (on) { annTool = 'move'; annSelectedIdx = -1; annSelectedType = ''; annActiveStroke = null; annActiveShape = null;
      var btns = document.querySelectorAll('#mark-bar .tool-btn[data-tool]');
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-tool') === 'move');
    }
    var btn = document.getElementById('btn-pan-toggle');
    if (btn) btn.classList.toggle('active', panMode);
    canvas.style.cursor = panMode ? 'grab' : '';
  }

  /* ── F24: Zoom/Pan (Ctrl+Wheel = zoom, Ctrl+drag = pan) ── */
  function wireZoomPan() {
    canvas.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var mx = (e.clientX - rect.left) * (W / rect.width), my = (e.clientY - rect.top) * (H / rect.height);
      var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      var newScale = viewScale * factor;
      if (newScale < 0.3 || newScale > 5) return;
      viewOffX = mx - (mx - viewOffX) * factor;
      viewOffY = my - (my - viewOffY) * factor;
      viewScale = newScale;
      draw();
    }, { passive: false });
    /* Touch pinch zoom for canvas (2-finger only) */
    var lastTouchDist = 0, lastTouchMid = null;
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        var dx = e.touches[1].clientX - e.touches[0].clientX;
        var dy = e.touches[1].clientY - e.touches[0].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
        lastTouchMid = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && lastTouchDist > 0) {
        e.preventDefault();
        var dx = e.touches[1].clientX - e.touches[0].clientX;
        var dy = e.touches[1].clientY - e.touches[0].clientY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var mid = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
        var rect = canvas.getBoundingClientRect();
        var mx = (mid.x - rect.left) * (W / rect.width), my = (mid.y - rect.top) * (H / rect.height);
        var factor = dist / lastTouchDist;
        var newScale = viewScale * factor;
        if (newScale >= 0.3 && newScale <= 5) {
          viewOffX = mx - (mx - viewOffX) * factor;
          viewOffY = my - (my - viewOffY) * factor;
          viewScale = newScale;
        }
        if (lastTouchMid) {
          viewOffX += (mid.x - lastTouchMid.x);
          viewOffY += (mid.y - lastTouchMid.y);
        }
        lastTouchDist = dist;
        lastTouchMid = mid;
        draw();
      }
    }, { passive: false });
    canvas.addEventListener('touchend', function () { lastTouchDist = 0; lastTouchMid = null; });
    /* Zoom toolbar buttons */
    var btnZIn = document.getElementById('btn-zoom-in');
    var btnZOut = document.getElementById('btn-zoom-out');
    var btnZReset = document.getElementById('btn-zoom-reset');
    var btnZFit = document.getElementById('btn-zoom-fit');
    var btnPan = document.getElementById('btn-pan-toggle');
    if (btnZIn) btnZIn.addEventListener('click', function () { zoomCentre(1.3); });
    if (btnZOut) btnZOut.addEventListener('click', function () { zoomCentre(1 / 1.3); });
    if (btnZReset) btnZReset.addEventListener('click', function () {
      viewOffX = 0; viewOffY = 0; viewScale = 1; draw();
    });
    if (btnZFit) btnZFit.addEventListener('click', function () {
      if (components.length === 0) { viewOffX = 0; viewOffY = 0; viewScale = 1; draw(); return; }
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var i = 0; i < components.length; i++) {
        var c = components[i], def = COMP_DEFS[c.type];
        if (!def) continue;
        if (c.x < minX) minX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.x + def.w > maxX) maxX = c.x + def.w;
        if (c.y + def.h > maxY) maxY = c.y + def.h;
      }
      var pad2 = 40;
      minX -= pad2; minY -= pad2; maxX += pad2; maxY += pad2;
      var rangeX = maxX - minX, rangeY = maxY - minY;
      var scaleX = W / rangeX, scaleY = H / rangeY;
      var fitScale = Math.min(scaleX, scaleY, 3);
      viewScale = fitScale;
      viewOffX = (W - rangeX * fitScale) / 2 - minX * fitScale;
      viewOffY = (H - rangeY * fitScale) / 2 - minY * fitScale;
      draw();
    });
    if (btnPan) btnPan.addEventListener('click', function () { setPanMode(!panMode); });
  }

  /* ── Annotation pointer events on canvas ── */
  function onAnnPointerDown(e) {
    if (mode !== 'simulate') return;
    annConsumed = false;
    /* Pan mode — intercept before annotation handling */
    if (annTool === 'move' && panMode) {
      var pp = getCanvasPosSafe(e);
      isPanning = true; panStartX = pp.x; panStartY = pp.y; panOffX0 = viewOffX; panOffY0 = viewOffY;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      annConsumed = true; e.preventDefault(); return;
    }
    if (annTool === 'move' && !e.ctrlKey && !e.metaKey) {
      var pos = getCanvasPosSafe(e);
      /* Action icon clicks */
      if (annSelectedIdx >= 0) {
        if (hitBtn(pos.x, pos.y, selectionUI.deleteBtn)) { deleteSelectedAnnotation(); annConsumed = true; e.preventDefault(); return; }
        if (hitBtn(pos.x, pos.y, selectionUI.dupBtn)) { duplicateSelectedAnnotation(); annConsumed = true; e.preventDefault(); return; }
        if (hitBtn(pos.x, pos.y, selectionUI.rotateBtn)) { rotateSelectedAnnotation(); annConsumed = true; e.preventDefault(); return; }
        var bounds = getSelectionBounds();
        var corner = hitCorner(pos.x, pos.y, bounds);
        if (corner) {
          saveUndoState();
          annDrag = { type: annSelectedType, idx: annSelectedIdx, lastX: pos.x, lastY: pos.y, corner: corner };
          canvas.setPointerCapture(e.pointerId);
          annConsumed = true; e.preventDefault(); return;
        }
        if (bounds && bounds.corners && pointInPolygon(pos.x, pos.y, bounds.corners)) {
          saveUndoState();
          annDrag = { type: annSelectedType, idx: annSelectedIdx, lastX: pos.x, lastY: pos.y, corner: null };
          canvas.setPointerCapture(e.pointerId);
          canvas.style.cursor = 'move';
          annConsumed = true; e.preventDefault(); return;
        }
      }
      var hit = findNearestAnnotation(pos.x, pos.y);
      if (hit) {
        annSelectedIdx = hit.idx; annSelectedType = hit.type;
        saveUndoState();
        annDrag = { type: hit.type, idx: hit.idx, lastX: pos.x, lastY: pos.y, corner: null };
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'move';
        draw(); annConsumed = true; e.preventDefault(); return;
      }
      if (annSelectedIdx >= 0) {
        annSelectedIdx = -1; annSelectedType = '';
        draw();
      }
      return;
    }
    /* Ctrl+drag = pan */
    if (annTool === 'move' && (e.ctrlKey || e.metaKey || panMode)) {
      var pp2 = getCanvasPosSafe(e);
      isPanning = true; panStartX = pp2.x; panStartY = pp2.y; panOffX0 = viewOffX; panOffY0 = viewOffY;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      annConsumed = true; e.preventDefault(); return;
    }
    /* Sketch tool */
    if (annTool === 'sketch') {
      var sp = getCanvasPosSafe(e);
      saveUndoState();
      annActiveStroke = {
        points: [{ wx: toWX(sp.x), wy: toWY(sp.y), p: e.pressure || 0.5 }],
        color: sketchColor, width: sketchWidth, rotation: 0
      };
      canvas.setPointerCapture(e.pointerId);
      annConsumed = true; e.preventDefault(); return;
    }
    /* Shape tool */
    if (annTool === 'shape') {
      var shp = getCanvasPosSafe(e);
      if (shapeType === 'text') {
        createTextLabel(shp.x, shp.y);
        annConsumed = true; e.preventDefault(); return;
      }
      saveUndoState();
      var swx = toWX(shp.x), swy = toWY(shp.y);
      annActiveShape = {
        type: shapeType, wx1: swx, wy1: swy, wx2: swx, wy2: swy,
        color: shapeColor, width: shapeWidth, filled: shapeFilled, rotation: 0
      };
      canvas.setPointerCapture(e.pointerId);
      annConsumed = true; e.preventDefault(); return;
    }
  }

  function onAnnPointerMove(e) {
    if (mode !== 'simulate') return;
    var pos = getCanvasPosSafe(e);
    annCursorPos = pos;
    if (isPanning) {
      viewOffX = panOffX0 + (pos.x - panStartX);
      viewOffY = panOffY0 + (pos.y - panStartY);
      draw(); return;
    }
    if (annDrag) {
      var dx2 = pos.x - annDrag.lastX, dy2 = pos.y - annDrag.lastY;
      var dwx = dx2 / viewScale, dwy = dy2 / viewScale;
      if (annDrag.corner) {
        var nowWx = toWX(pos.x), nowWy = toWY(pos.y);
        if (annDrag.type === 'shape') {
          var rsh = annShapes[annDrag.idx];
          if (rsh) {
            var c2 = annDrag.corner;
            if (c2 === 'nw') { rsh.wx1 = nowWx; rsh.wy1 = nowWy; }
            else if (c2 === 'ne') { rsh.wx2 = nowWx; rsh.wy1 = nowWy; }
            else if (c2 === 'sw') { rsh.wx1 = nowWx; rsh.wy2 = nowWy; }
            else if (c2 === 'se') { rsh.wx2 = nowWx; rsh.wy2 = nowWy; }
          }
        }
      } else {
        if (annDrag.type === 'shape') {
          var ms = annShapes[annDrag.idx];
          if (ms) { ms.wx1 += dwx; ms.wy1 += dwy; ms.wx2 += dwx; ms.wy2 += dwy; }
        } else if (annDrag.type === 'stroke') {
          var mst = annStrokes[annDrag.idx];
          if (mst) { for (var i = 0; i < mst.points.length; i++) { mst.points[i].wx += dwx; mst.points[i].wy += dwy; } }
        }
      }
      annDrag.lastX = pos.x; annDrag.lastY = pos.y;
      draw(); return;
    }
    if (annTool === 'sketch' && annActiveStroke) {
      annActiveStroke.points.push({ wx: toWX(pos.x), wy: toWY(pos.y), p: e.pressure || 0.5 });
      draw(); return;
    }
    if (annTool === 'shape' && annActiveShape) {
      annActiveShape.wx2 = toWX(pos.x); annActiveShape.wy2 = toWY(pos.y);
      draw(); return;
    }
    /* Hover cursor feedback in move mode */
    if (annTool === 'move' && !panMode && !e.ctrlKey && !e.metaKey) {
      var hBounds = getSelectionBounds();
      var hCorner = hitCorner(pos.x, pos.y, hBounds);
      if (hCorner) {
        canvas.style.cursor = (hCorner === 'nw' || hCorner === 'se') ? 'nwse-resize' : 'nesw-resize';
      } else if (hitBtn(pos.x, pos.y, selectionUI.deleteBtn) || hitBtn(pos.x, pos.y, selectionUI.dupBtn) || hitBtn(pos.x, pos.y, selectionUI.rotateBtn)) {
        canvas.style.cursor = 'pointer';
      } else if (hBounds && hBounds.corners && pointInPolygon(pos.x, pos.y, hBounds.corners)) {
        canvas.style.cursor = 'move';
      } else if (findNearestAnnotation(pos.x, pos.y)) {
        canvas.style.cursor = 'move';
      }
    }
    if (annTool === 'sketch' || annTool === 'shape') {
      draw();
    }
  }

  function onAnnPointerUp(e) {
    if (isPanning) {
      isPanning = false; canvas.style.cursor = panMode ? 'grab' : ''; return;
    }
    if (annDrag) {
      annDrag = null; canvas.style.cursor = 'crosshair'; draw(); return;
    }
    if (annTool === 'sketch' && annActiveStroke) {
      if (annActiveStroke.points.length > 1) annStrokes.push(annActiveStroke);
      annActiveStroke = null;
      canvas.style.cursor = PENCIL_CURSOR;
      draw(); return;
    }
    if (annTool === 'shape' && annActiveShape) {
      var sdx = toSX(annActiveShape.wx2) - toSX(annActiveShape.wx1);
      var sdy = toSY(annActiveShape.wy2) - toSY(annActiveShape.wy1);
      if (Math.abs(sdx) > 3 || Math.abs(sdy) > 3) annShapes.push(annActiveShape);
      annActiveShape = null;
      setAnnTool('move'); draw(); return;
    }
  }

  /* Init annotations: wire toolbar, fullscreen, zoom/pan */
  function initAnnotations() {
    wireMarkBar();
    wireFullscreen();
    wireZoomPan();
  }
 
(function() {
  var labelToggle = document.getElementById('btn-toggle-labels');
  
  if (labelToggle) {
    // Inicializar estado del botón
    labelToggle.classList.toggle('active', showLabels);
    labelToggle.textContent = showLabels ? '🏷️' : '🚫';
    labelToggle.title = showLabels ? 'Ocultar etiquetas' : 'Mostrar etiquetas';
    
    labelToggle.addEventListener('click', function() {
      // Cambiar estado
      showLabels = !showLabels;
      
      // Actualizar botón
      labelToggle.classList.toggle('active', showLabels);
      labelToggle.textContent = showLabels ? '🏷️' : '🚫';
      labelToggle.title = showLabels ? 'Ocultar etiquetas' : 'Mostrar etiquetas';
      
      // Redibujar el canvas
      draw();
    });
  }
})();

  /* ================================================================
     ADVANCED INSTRUMENTATION — Diagnostics, Faults, Oscilloscope
     ================================================================ */

  /* ───── Fault injection UI ───── */
  var FAULT_DESC = {
    'none':            'Select a fault to simulate real-world failure scenarios. The simulation must be running to see the effect.',
    'pump-fail':       'Pump mechanical failure — no pressure, no flow. System dies. Check readouts and scope traces.',
    'leak':            'External hose leak — system pressure drops 50% while pump still delivers flow. Actuators run slowly, lose force.',
    'blocked-filter':  'Return-line filter clogged — flow reduced to 35%, back-pressure rises. Cylinders extend noticeably slower.',
    'overheat':        'Oil overheating — viscosity drops, volumetric efficiency falls. Flow down 30%.',
    'relief-stuck':    'Relief valve seized shut — no pressure cap. Pump presses against dead-head at full displacement pressure.',
    'cavitation':      'Pump cavitation (suction restriction) — flow down 40%, potential noise and damage. Reduce duty or improve inlet.',
    'air-ingress':     'Air in oil — spongy response, 15% pressure loss, 20% flow loss. Bleed the system.'
  };

  var faultSelect = document.getElementById('hc-fault-select');
  var faultClear = document.getElementById('hc-fault-clear');
  var faultDesc = document.getElementById('hc-fault-desc');
  if (faultSelect) {
    faultSelect.addEventListener('change', function () {
      activeFault = faultSelect.value;
      faultDesc.textContent = FAULT_DESC[activeFault] || '';
      faultDesc.classList.toggle('active', activeFault !== 'none');
      if (running) computeCircuit();
    });
  }
  if (faultClear) {
    faultClear.addEventListener('click', function () {
      activeFault = 'none';
      if (faultSelect) faultSelect.value = 'none';
      faultDesc.textContent = FAULT_DESC.none;
      faultDesc.classList.remove('active');
      if (running) computeCircuit();
    });
  }

  /* ───── Circuit diagnostics ───── */
  function _hcUpdateDiagnostics(sysPressure, flow, force, speed) {
    var body = document.getElementById('hc-diag-body');
    var badge = document.getElementById('hc-diag-badge');
    var sub = document.getElementById('hc-diag-sub');
    if (!body) return;

    var issues = [];
    var pumps = components.filter(function (c) { return c.type === 'pump' || c.type === 'pump-var' || c.type === 'pump-var-displacement'; });
    var reliefs = components.filter(function (c) { return c.type === 'relief'; });
    var actuators = components.filter(function (c) {
      return c.type === 'cylinder-da' || c.type === 'cylinder-sa' || c.type === 'cylinder-telescopic' ||
             c.type === 'motor' || c.type === 'motor-bidir' || c.type === 'rotary-act';
    });

    if (!components.length) {
      body.innerHTML = '<div class="hc-diag-empty">Add components to run circuit checks.</div>';
      if (badge) badge.textContent = '\u24D8'; if (sub) sub.textContent = '— design & safety checks';
      return;
    }

    if (!pumps.length) issues.push({ sev: 'error', msg: '<strong>No pump</strong> in circuit — add a Power Unit to provide flow.' });
    if (!reliefs.length && pumps.length) issues.push({ sev: 'error', msg: '<strong>No relief valve</strong> — every hydraulic circuit must have at least one relief valve for safety.' });
    if (pumps.length > 2) issues.push({ sev: 'warn', msg: pumps.length + ' pumps detected — check each is needed; excess pumps waste energy.' });

    /* Orphan components (no connections) */
    var connectedIds = {};
    connections.forEach(function (c) { connectedIds[c.from.compId] = true; connectedIds[c.to.compId] = true; });
    var orphans = components.filter(function (c) { return !connectedIds[c.id]; });
    if (orphans.length > 0 && components.length > 1) {
      issues.push({ sev: 'warn', msg: orphans.length + ' unconnected component(s) — drag wires between ports to wire them in.' });
    }

    /* Dead-end (only 1 connection on a component that needs 2+) */
    var adjCount = {};
    connections.forEach(function (c) {
      adjCount[c.from.compId] = (adjCount[c.from.compId] || 0) + 1;
      adjCount[c.to.compId] = (adjCount[c.to.compId] || 0) + 1;
    });
    components.forEach(function (c) {
      var def = COMP_DEFS[c.type];
      if (!def || def.ports.length < 2) return;
      if (c.type === 'gauge' || c.type === 'pressure-switch' || c.type === 'pressure-transducer' ||
          c.type === 'temp-gauge' || c.type === 'accumulator' || c.type === 'reservoir') return;
      var n = adjCount[c.id] || 0;
      if (n > 0 && n < 2 && def.ports.length > 1) {
        issues.push({ sev: 'warn', msg: '<strong>' + def.name + '</strong> has an unconnected port — may block flow.' });
      }
    });

    /* Actuator without return path to tank */
    actuators.forEach(function (c) {
      var n = adjCount[c.id] || 0;
      if (n === 0) return; /* orphan already reported */
      var def = COMP_DEFS[c.type];
      if (def && def.ports.length > 1 && n < def.ports.length) {
        issues.push({ sev: 'warn', msg: '<strong>' + def.name + '</strong> — one or more ports are not wired. Double-acting actuators need both ports connected.' });
      }
    });

    /* Overpressure check */
    if (sysPressure > 0 && reliefs.length) {
      var minReliefSet = 999;
      reliefs.forEach(function (r) { if ((r.values.setting || 200) < minReliefSet) minReliefSet = r.values.setting || 200; });
      var maxPump = 0;
      pumps.forEach(function (p) {
        var pp = p.values.pressure || p.values.maxPressure || 0;
        if (pp > maxPump) maxPump = pp;
      });
      if (maxPump > minReliefSet * 1.4 && activeFault !== 'relief-stuck') {
        issues.push({ sev: 'info', msg: 'Pump setting is much higher than relief — circuit runs continuously on relief, wasting energy as heat.' });
      }
    }

    /* Active fault notice */
    if (activeFault !== 'none') {
      issues.unshift({ sev: 'error', msg: '<strong>FAULT ACTIVE:</strong> ' + (FAULT_DESC[activeFault] || activeFault) });
    }

    /* Running-circuit insights */
    if (running && pumps.length && actuators.length) {
      if (sysPressure < 5 && activeFault === 'none') {
        issues.push({ sev: 'info', msg: 'System pressure is near zero — check DCV is actuated (Extend/Retract), not Center.' });
      }
      if (flow < 1 && pumps.length && activeFault === 'none') {
        issues.push({ sev: 'warn', msg: 'Pump is running but no flow delivered — check blocked paths.' });
      }
    }

    /* Severity summary pill */
    var errs = issues.filter(function (i) { return i.sev === 'error'; }).length;
    var warns = issues.filter(function (i) { return i.sev === 'warn'; }).length;
    var pillClass, pillText;
    if (errs > 0) { pillClass = 'error'; pillText = errs + ' error' + (errs > 1 ? 's' : ''); }
    else if (warns > 0) { pillClass = 'warn'; pillText = warns + ' warning' + (warns > 1 ? 's' : ''); }
    else { pillClass = 'ok'; pillText = 'All checks pass'; }

    /* Render (only if changed, to avoid reflow churn each frame) */
    var key = JSON.stringify(issues) + '|' + pillText;
    if (key === lastDiagnosticsKey) return;
    lastDiagnosticsKey = key;

    if (sub) sub.innerHTML = '&mdash; <span class="hc-diag-summary-pill ' + pillClass + '">' + pillText + '</span>';
    if (issues.length === 0) {
      body.innerHTML = '<div class="hc-diag-list"><div class="hc-diag-item sev-ok"><span class="hc-diag-icon">\u2713</span><div class="hc-diag-msg"><strong>All design checks pass.</strong> Pump, relief, and actuators are correctly wired.</div></div></div>';
      return;
    }
    var html = '<div class="hc-diag-list">';
    issues.forEach(function (it) {
      var icon = it.sev === 'error' ? '\u26D4' : it.sev === 'warn' ? '\u26A0' : it.sev === 'ok' ? '\u2713' : '\u2139';
      html += '<div class="hc-diag-item sev-' + it.sev + '">';
      html += '<span class="hc-diag-icon">' + icon + '</span>';
      html += '<div class="hc-diag-msg">' + it.msg + '</div></div>';
    });
    html += '</div>';
    body.innerHTML = html;
  }

  /* Run diagnostics on any structural change (not only during sim) */
  function hcRefreshDiagnostics() {
    if (typeof _hcUpdateDiagnostics === 'function') {
      lastDiagnosticsKey = ''; /* force re-render */
      _hcUpdateDiagnostics(0, 0, 0, 0);
    }
  }
  /* Re-run diagnostics whenever the canvas is clicked or redrawn cheaply:
     expose on user actions. We piggy-back on draw() calls by setting a timer. */
  setInterval(function () {
    if (!running) hcRefreshDiagnostics();
  }, 1500);

  /* ───── Oscilloscope ───── */
  var SCOPE_COLORS = ['#00bcd4', '#ffaa00', '#3ddc84', '#e64980'];
  var scopeCanvas = document.getElementById('hc-scope-canvas');
  var scopeCtx = scopeCanvas ? scopeCanvas.getContext('2d') : null;
  var scopeLegend = document.getElementById('hc-scope-legend');
  var scopePauseBtn = document.getElementById('hc-scope-pause');
  var scopeClearBtn = document.getElementById('hc-scope-clear');
  var scopeCsvBtn = document.getElementById('hc-scope-csv');
  var scopePngBtn = document.getElementById('hc-scope-png');
  var scopeSelects = [
    document.getElementById('hc-scope-ch1'),
    document.getElementById('hc-scope-ch2'),
    document.getElementById('hc-scope-ch3'),
    document.getElementById('hc-scope-ch4')
  ];

  function hcScopeSources() {
    /* Returns available measurement points from the current circuit */
    var sources = [];
    components.forEach(function (c) {
      var def = COMP_DEFS[c.type];
      if (!def) return;
      var label = def.name + ' #' + c.id;
      if (c.type === 'gauge' || c.type === 'pressure-transducer') {
        sources.push({ id: 'P:' + c.id, label: label + ' (bar)', unit: 'bar' });
      } else if (c.type === 'flow-meter') {
        sources.push({ id: 'Q:' + c.id, label: label + ' (L/min)', unit: 'L/min' });
      } else if (c.type === 'temp-gauge') {
        sources.push({ id: 'T:' + c.id, label: label + ' (\u00B0C)', unit: '\u00B0C' });
      } else if (c.type === 'pump' || c.type === 'pump-var') {
        sources.push({ id: 'P:' + c.id, label: label + ' P-port (bar)', unit: 'bar' });
        sources.push({ id: 'Q:' + c.id, label: label + ' flow (L/min)', unit: 'L/min' });
      } else if (c.type === 'cylinder-da' || c.type === 'cylinder-sa' || c.type === 'cylinder-telescopic') {
        sources.push({ id: 'P:' + c.id, label: label + ' head (bar)', unit: 'bar' });
        sources.push({ id: 'X:' + c.id, label: label + ' extension (%)', unit: '%' });
      } else if (c.type === 'motor' || c.type === 'motor-bidir') {
        sources.push({ id: 'P:' + c.id, label: label + ' inlet (bar)', unit: 'bar' });
        sources.push({ id: 'R:' + c.id, label: label + ' rpm', unit: 'rpm' });
      }
    });
    /* Global readouts */
    sources.push({ id: 'SYS_P', label: 'System Pressure (bar)', unit: 'bar' });
    sources.push({ id: 'SYS_Q', label: 'System Flow (L/min)', unit: 'L/min' });
    sources.push({ id: 'SYS_W', label: 'Pump Power (kW)', unit: 'kW' });
    return sources;
  }

  function hcScopeReadValue(chanId) {
    if (!chanId) return null;
    var parts = chanId.split(':');
    var kind = parts[0];
    var compId = parts[1] ? parseInt(parts[1], 10) : null;
    if (kind === 'SYS_P') return parseFloat(document.getElementById('r-pressure').textContent) || 0;
    if (kind === 'SYS_Q') return parseFloat(document.getElementById('r-flow').textContent) || 0;
    if (kind === 'SYS_W') return parseFloat(document.getElementById('r-power').textContent) || 0;
    var c = findComp(compId);
    if (!c) return null;
    if (kind === 'P') return c._localPressure || c.reading || 0;
    if (kind === 'Q') return c._localFlow || c.reading || 0;
    if (kind === 'T') return c.reading || 0;
    if (kind === 'X') return (c.extension || 0) * 100;
    if (kind === 'R') return c._rpm || 0;
    return null;
  }

  function hcPopulateScopeSelects() {
    var sources = hcScopeSources();
    scopeSelects.forEach(function (sel, i) {
      if (!sel) return;
      var prev = scopeChannels[i];
      var html = '<option value="">&mdash; Select source &mdash;</option>';
      sources.forEach(function (s) {
        html += '<option value="' + s.id + '"' + (s.id === prev ? ' selected' : '') + '>' + s.label + '</option>';
      });
      sel.innerHTML = html;
    });
  }

  scopeSelects.forEach(function (sel, i) {
    if (!sel) return;
    sel.addEventListener('change', function () {
      scopeChannels[i] = sel.value;
      hcRenderScopeLegend();
      hcDrawScope();
    });
    sel.addEventListener('mousedown', hcPopulateScopeSelects);
    sel.addEventListener('focus', hcPopulateScopeSelects);
  });

  function hcRenderScopeLegend() {
    if (!scopeLegend) return;
    var sources = hcScopeSources();
    var byId = {};
    sources.forEach(function (s) { byId[s.id] = s; });
    var html = '';
    scopeChannels.forEach(function (cid, i) {
      if (!cid) return;
      var meta = byId[cid];
      html += '<span class="lg-item"><span class="hc-scope-dot" style="background:' + SCOPE_COLORS[i] + ';"></span>CH' + (i + 1) + ' \u2014 ' + (meta ? meta.label : cid) + '</span>';
    });
    scopeLegend.innerHTML = html || '<span class="lg-item" style="color:#667;">Select measurement sources above to start logging.</span>';
  }

  function _hcSampleScope(t) {
    if (scopePaused) return;
    var anyChan = scopeChannels.some(function (c) { return !!c; });
    if (!anyChan) return;
    var sample = { t: t };
    for (var i = 0; i < 4; i++) {
      sample['ch' + (i + 1)] = scopeChannels[i] ? hcScopeReadValue(scopeChannels[i]) : null;
    }
    scopeBuffer.push(sample);
    if (scopeBuffer.length > SCOPE_MAX_SAMPLES) scopeBuffer.shift();
    hcDrawScope();
  }

  function hcResizeScopeCanvas() {
    if (!scopeCanvas) return;
    var rect = scopeCanvas.getBoundingClientRect();
    var cssW = Math.max(200, rect.width);
    var cssH = 220;
    var dprL = window.devicePixelRatio || 1;
    scopeCanvas.width = cssW * dprL;
    scopeCanvas.height = cssH * dprL;
    scopeCanvas.style.height = cssH + 'px';
    scopeCtx.setTransform(dprL, 0, 0, dprL, 0, 0);
  }

  function hcDrawScope() {
    if (!scopeCtx || !scopeCanvas) return;
    hcResizeScopeCanvas();
    var W = scopeCanvas.width / (window.devicePixelRatio || 1);
    var H = scopeCanvas.height / (window.devicePixelRatio || 1);
    scopeCtx.fillStyle = '#060a11';
    scopeCtx.fillRect(0, 0, W, H);

    /* Grid */
    scopeCtx.strokeStyle = '#142033';
    scopeCtx.lineWidth = 1;
    scopeCtx.beginPath();
    for (var gx = 0; gx <= 10; gx++) { var x = gx * W / 10; scopeCtx.moveTo(x, 0); scopeCtx.lineTo(x, H); }
    for (var gy = 0; gy <= 6; gy++) { var y = gy * H / 6; scopeCtx.moveTo(0, y); scopeCtx.lineTo(W, y); }
    scopeCtx.stroke();

    /* Center lines */
    scopeCtx.strokeStyle = '#1e2a44';
    scopeCtx.beginPath(); scopeCtx.moveTo(0, H / 2); scopeCtx.lineTo(W, H / 2); scopeCtx.stroke();

    if (scopeBuffer.length < 2) {
      scopeCtx.fillStyle = '#5a6a80';
      scopeCtx.font = '12px system-ui, sans-serif';
      scopeCtx.textAlign = 'center';
      scopeCtx.fillText('Run the circuit and assign measurement sources to see live traces.', W / 2, H / 2);
      return;
    }

    /* Time window: last 10 seconds, scrolling */
    var tNow = scopeBuffer[scopeBuffer.length - 1].t;
    var tWindow = 10;
    var tMin = Math.max(0, tNow - tWindow);

    /* Compute per-channel min/max and auto-scale */
    for (var ch = 0; ch < 4; ch++) {
      if (!scopeChannels[ch]) continue;
      var k = 'ch' + (ch + 1);
      var min = Infinity, max = -Infinity;
      for (var s = 0; s < scopeBuffer.length; s++) {
        var v = scopeBuffer[s][k];
        if (v == null) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (min === Infinity) continue;
      if (max - min < 1e-6) { max = min + 1; }
      var range = max - min;
      var pad = range * 0.1;
      min -= pad; max += pad;

      /* Axis labels for this channel */
      scopeCtx.fillStyle = SCOPE_COLORS[ch];
      scopeCtx.font = '10px ui-monospace, monospace';
      scopeCtx.textAlign = 'left';
      var labelX = 4 + (ch % 2) * 80;
      var labelY = 10 + Math.floor(ch / 2) * 12;
      scopeCtx.fillText('CH' + (ch + 1) + ' ' + max.toFixed(1) + '\u2192' + min.toFixed(1), labelX, labelY);

      /* Draw trace */
      scopeCtx.strokeStyle = SCOPE_COLORS[ch];
      scopeCtx.lineWidth = 1.8;
      scopeCtx.beginPath();
      var first = true;
      for (var si = 0; si < scopeBuffer.length; si++) {
        var smp = scopeBuffer[si];
        if (smp.t < tMin) continue;
        var v2 = smp[k];
        if (v2 == null) continue;
        var px = ((smp.t - tMin) / tWindow) * W;
        var py = H - ((v2 - min) / (max - min)) * H;
        if (first) { scopeCtx.moveTo(px, py); first = false; }
        else scopeCtx.lineTo(px, py);
      }
      scopeCtx.stroke();
    }

    /* Time axis label */
    scopeCtx.fillStyle = '#5a6a80';
    scopeCtx.font = '10px ui-monospace, monospace';
    scopeCtx.textAlign = 'right';
    scopeCtx.fillText('t = ' + tNow.toFixed(1) + ' s  (10 s window)', W - 6, H - 4);
  }

  if (scopePauseBtn) {
    scopePauseBtn.addEventListener('click', function () {
      scopePaused = !scopePaused;
      scopePauseBtn.innerHTML = scopePaused ? '\u25B6 Resume' : '\u10073\u10073 Pause';
      scopePauseBtn.textContent = scopePaused ? '\u25B6 Resume' : '\u2759\u2759 Pause';
    });
  }
  if (scopeClearBtn) {
    scopeClearBtn.addEventListener('click', function () {
      scopeBuffer = [];
      hcDrawScope();
    });
  }
  if (scopeCsvBtn) {
    scopeCsvBtn.addEventListener('click', function () {
      if (!scopeBuffer.length) { alert('No data to export — run the simulation with sources assigned first.'); return; }
      var sources = hcScopeSources(); var byId = {};
      sources.forEach(function (s) { byId[s.id] = s; });
      var header = ['time_s'];
      for (var h = 0; h < 4; h++) {
        if (scopeChannels[h]) header.push('CH' + (h + 1) + '_' + (byId[scopeChannels[h]] ? byId[scopeChannels[h]].label.replace(/[^\w]+/g, '_') : scopeChannels[h]));
      }
      var rows = [header.join(',')];
      scopeBuffer.forEach(function (s) {
        var row = [s.t.toFixed(3)];
        for (var h = 0; h < 4; h++) {
          if (!scopeChannels[h]) continue;
          var v = s['ch' + (h + 1)];
          row.push(v == null ? '' : v.toFixed(3));
        }
        rows.push(row.join(','));
      });
      var csv = rows.join('\n');
      var blob = new Blob([csv], { type: 'text/csv' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hydraulic-scope-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.csv';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
  }
  if (scopePngBtn) {
    scopePngBtn.addEventListener('click', function () {
      if (!scopeCanvas) return;
      /* Watermark */
      var dprL = window.devicePixelRatio || 1;
      var W = scopeCanvas.width / dprL, H = scopeCanvas.height / dprL;
      scopeCtx.fillStyle = 'rgba(255,255,255,0.25)';
      scopeCtx.font = '10px system-ui, sans-serif';
      scopeCtx.textAlign = 'right';
      scopeCtx.fillText('mechsimulator.com · Hydraulic Circuit Simulator', W - 8, 14);
      var a = document.createElement('a');
      a.href = scopeCanvas.toDataURL('image/png');
      a.download = 'hydraulic-scope-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.png';
      a.click();
      hcDrawScope();
    });
  }

  /* Populate scope selects on init and refresh when components change */
  hcPopulateScopeSelects();
  hcRenderScopeLegend();
  hcDrawScope();
  hcRefreshDiagnostics();
  /* Refresh source list periodically (components may be added/removed) */
  setInterval(function () {
    hcPopulateScopeSelects();
    hcRenderScopeLegend();
  }, 2000);

  /* ───── Proportional valve command clamping (safety) ───── */
  components.forEach || (components.forEach = Array.prototype.forEach);
  /* Hook run button to re-enable fault description */
  if (btnRun) {
    btnRun.addEventListener('click', function () {
      if (faultSelect) {
        activeFault = faultSelect.value || 'none';
      }
      scopeBuffer = []; /* Fresh scope on run */
    });
  }

  /* ================================================================
     SAVE / LOAD / EXPORT / IMPORT  (multi-slot)
     ================================================================ */
  (function () {
    var STORAGE_KEY = 'mechsim.hydraulic.circuits.v2';   /* { name: {savedAt, data} } */
    var SCHEMA = 'mechsim.hydraulic.v1';

    function showToast(msg, kind) {
      var t = document.getElementById('_circuit-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = '_circuit-toast';
        t.className = 'toast';
        t.setAttribute('role', 'status');
        t.setAttribute('aria-live', 'polite');
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.className = 'toast show' + (kind === 'error' ? ' toast-error' : (kind === 'success' ? ' toast-success' : ''));
      clearTimeout(t._tid);
      t._tid = setTimeout(function () { t.className = 'toast'; }, 2200);
    }

    function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

    function serialize() {
      return {
        schema: SCHEMA,
        savedAt: new Date().toISOString(),
        view: { offX: viewOffX, offY: viewOffY, scale: viewScale },
        components: components.map(function (c) {
          return { id: c.id, type: c.type, x: c.x, y: c.y, orient: c.orient || 0, values: deepClone(c.values || {}) };
        }),
        connections: connections.map(function (cn) {
          var out = { from: { compId: cn.from.compId, portIdx: cn.from.portIdx }, to: { compId: cn.to.compId, portIdx: cn.to.portIdx } };
          if (cn.waypoints && cn.waypoints.length) out.waypoints = deepClone(cn.waypoints);
          return out;
        })
      };
    }

    function validate(data) {
      if (!data || typeof data !== 'object') return 'Not a valid circuit file';
      if (data.schema !== SCHEMA) return 'Unrecognised schema (expected ' + SCHEMA + ')';
      if (!Array.isArray(data.components) || !Array.isArray(data.connections)) return 'Missing components or connections';
      for (var i = 0; i < data.components.length; i++) {
        var c = data.components[i];
        if (typeof c.id !== 'number' || typeof c.type !== 'string' || typeof c.x !== 'number' || typeof c.y !== 'number') {
          return 'Component ' + i + ' has invalid fields';
        }
      }
      for (var j = 0; j < data.connections.length; j++) {
        var cn = data.connections[j];
        if (!cn.from || !cn.to || typeof cn.from.compId !== 'number' || typeof cn.to.compId !== 'number') {
          return 'Connection ' + j + ' has invalid endpoints';
        }
      }
      return null;
    }

    function restore(data) {
      if (running) stopSimulation();
      if (typeof saveUndoState === 'function') saveUndoState();
      components = data.components.map(function (c) {
        return {
          id: c.id, type: c.type, x: c.x, y: c.y, orient: c.orient || 0,
          values: deepClone(c.values || {}),
          extension: 0, rotation: 0, reading: 0
        };
      });
      connections = data.connections.map(function (cn) {
        var out = {
          from: { compId: cn.from.compId, portIdx: cn.from.portIdx },
          to:   { compId: cn.to.compId,   portIdx: cn.to.portIdx   },
          pressure: 0, flow: 0, flowDir: 0
        };
        if (cn.waypoints && cn.waypoints.length) out.waypoints = deepClone(cn.waypoints);
        return out;
      });
      var maxId = 0;
      for (var i = 0; i < components.length; i++) if (components[i].id > maxId) maxId = components[i].id;
      nextId = maxId + 1;
      particles = [];
      if (typeof prevExtensions !== 'undefined') prevExtensions = {};
      selectedComp = null;
      if (typeof selectedConn !== 'undefined') selectedConn = -1;
      if (typeof connectingFrom !== 'undefined') connectingFrom = null;
      if (data.view) {
        viewOffX = +data.view.offX || 0;
        viewOffY = +data.view.offY || 0;
        viewScale = +data.view.scale || 1;
      }
      if (typeof updateProperties === 'function') updateProperties();
      draw();
    }

    function readSlots() {
      var slots = {};
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) { var parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object') slots = parsed; }
      } catch (e) { /* ignore */ }
      return slots;
    }
    function writeSlots(slots) { localStorage.setItem(STORAGE_KEY, JSON.stringify(slots)); }

    function defaultSaveName() {
      var d = new Date();
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return 'Circuit ' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
           + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function fmtDate(iso) {
      try { var d = new Date(iso); if (isNaN(d.getTime())) return iso || ''; return d.toLocaleString(); }
      catch (e) { return iso || ''; }
    }

    var btnSave = document.getElementById('btn-save');
    if (btnSave) btnSave.addEventListener('click', function () {
      if (!components.length) { showToast('Nothing to save — canvas is empty', 'error'); return; }
      var slots = readSlots();
      var name = prompt('Save circuit as:', defaultSaveName());
      if (name === null) return;
      name = String(name).trim();
      if (!name) { showToast('Name cannot be empty', 'error'); return; }
      if (name.length > 60) name = name.slice(0, 60);
      if (slots[name] && !confirm('A circuit named "' + name + '" already exists. Overwrite?')) return;
      try {
        slots[name] = { savedAt: new Date().toISOString(), data: serialize() };
        writeSlots(slots);
        showToast('Saved as "' + name + '"', 'success');
      } catch (err) { showToast('Save failed: ' + (err && err.message ? err.message : 'storage error'), 'error'); }
    });

    var btnLoad = document.getElementById('btn-load');
    var pickerOverlay = document.getElementById('load-picker-overlay');
    var pickerList    = document.getElementById('load-picker-list');
    var pickerEmpty   = document.getElementById('load-picker-empty');
    var pickerClose   = document.getElementById('load-picker-close');

    function renderPicker() {
      if (!pickerList) return;
      var slots = readSlots();
      var names = Object.keys(slots).sort(function (a, b) {
        return (slots[b].savedAt || '').localeCompare(slots[a].savedAt || '');
      });
      pickerList.innerHTML = '';
      if (!names.length) {
        pickerList.style.display = 'none';
        if (pickerEmpty) pickerEmpty.style.display = '';
        return;
      }
      pickerList.style.display = '';
      if (pickerEmpty) pickerEmpty.style.display = 'none';
      names.forEach(function (n) {
        var rec = slots[n];
        var compCount = (rec.data && rec.data.components) ? rec.data.components.length : 0;
        var connCount = (rec.data && rec.data.connections) ? rec.data.connections.length : 0;
        var row = document.createElement('div'); row.className = 'saved-item';
        var info = document.createElement('div'); info.className = 'saved-item-info';
        var nameEl = document.createElement('div'); nameEl.className = 'saved-item-name'; nameEl.textContent = n;
        var metaEl = document.createElement('div'); metaEl.className = 'saved-item-meta';
        metaEl.textContent = compCount + ' components · ' + connCount + ' connections · ' + fmtDate(rec.savedAt);
        info.appendChild(nameEl); info.appendChild(metaEl);
        var actions = document.createElement('div'); actions.className = 'saved-item-actions';
        var loadBtn = document.createElement('button'); loadBtn.type = 'button';
        loadBtn.className = 'saved-item-btn'; loadBtn.textContent = 'Load';
        loadBtn.setAttribute('aria-label', 'Load circuit ' + n);
        loadBtn.addEventListener('click', function () {
          var verr = validate(rec.data);
          if (verr) { showToast(verr, 'error'); return; }
          if (components.length && !confirm('Replace current circuit with "' + n + '"?')) return;
          restore(rec.data);
          if (pickerOverlay) pickerOverlay.style.display = 'none';
          showToast('Loaded "' + n + '"', 'success');
        });
        var delBtn = document.createElement('button'); delBtn.type = 'button';
        delBtn.className = 'saved-item-btn saved-item-delete'; delBtn.textContent = 'Delete';
        delBtn.setAttribute('aria-label', 'Delete circuit ' + n);
        delBtn.addEventListener('click', function () {
          if (!confirm('Delete saved circuit "' + n + '"? This cannot be undone.')) return;
          var s = readSlots(); delete s[n]; writeSlots(s);
          renderPicker(); showToast('Deleted "' + n + '"', 'success');
        });
        actions.appendChild(loadBtn); actions.appendChild(delBtn);
        row.appendChild(info); row.appendChild(actions);
        pickerList.appendChild(row);
      });
    }

    if (btnLoad && pickerOverlay) {
      btnLoad.addEventListener('click', function () { renderPicker(); pickerOverlay.style.display = 'flex'; });
      if (pickerClose) pickerClose.addEventListener('click', function () { pickerOverlay.style.display = 'none'; });
      pickerOverlay.addEventListener('click', function (e) { if (e.target === pickerOverlay) pickerOverlay.style.display = 'none'; });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && pickerOverlay.style.display === 'flex') {
          pickerOverlay.style.display = 'none'; e.stopPropagation();
        }
      });
    }

    var btnExport = document.getElementById('btn-export-json');
    if (btnExport) btnExport.addEventListener('click', function () {
      if (!components.length) { showToast('Nothing to export — canvas is empty', 'error'); return; }
      try {
        var json = JSON.stringify(serialize(), null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        var a = document.createElement('a');
        a.href = url; a.download = 'hydraulic-circuit-' + stamp + '.json';
        document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
        showToast('Circuit exported', 'success');
      } catch (e) { showToast('Export failed: ' + e.message, 'error'); }
    });

    var btnImport = document.getElementById('btn-import-json');
    var fileInput = document.getElementById('import-json-input');
    if (btnImport && fileInput) {
      btnImport.addEventListener('click', function () { fileInput.value = ''; fileInput.click(); });
      fileInput.addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          var data;
          try { data = JSON.parse(ev.target.result); }
          catch (er) { showToast('File is not valid JSON', 'error'); return; }
          var verr = validate(data);
          if (verr) { showToast(verr, 'error'); return; }
          if (components.length && !confirm('Replace current circuit with imported one?')) return;
          restore(data);
          showToast('Circuit imported', 'success');
        };
        reader.onerror = function () { showToast('Could not read file', 'error'); };
        reader.readAsText(f);
      });
    }
  })();

  /* ================================================================
     INIT
     ================================================================ */
drawPaletteIcons();
resizeCanvas();
initAnnotations();

// ================================================================
// CONFIGURAR PANEL DE PROPIEDADES AVANZADO
// ================================================================

// Verificar que PropertiesPanel esté disponible
if (typeof PropertiesPanel !== 'undefined') {
    PropertiesPanel.init({
        definitions: COMP_DEFS,
        connections: connections,
        running: running,
        onSave: saveUndoState,
        onDraw: draw,
        onCompute: computeCircuit
    });
}

// Actualizar panel periódicamente
setInterval(function() {
    if (selectedComp) {
        var advancedPanel = document.getElementById('props-panel-advanced');
        if (advancedPanel && advancedPanel.style.display !== 'none') {
            if (typeof PropertiesPanel !== 'undefined') {
                PropertiesPanel.update(selectedComp);
            }
        }
    }
}, 500);


})();

