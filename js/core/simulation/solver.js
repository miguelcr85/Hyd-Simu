// ================================================================
// SOLVER DE CIRCUITOS HIDRAULICOS (dominio puro, sin DOM)
// ================================================================
//
// Extraido 1:1 de computeCircuit() de js/app.js en la etapa E1: mismas
// constantes, mismas formulas y mismo orden de fases (PASO 1..16). Recibe el
// circuito como parametro y DEVUELVE el resultado; no escribe en el DOM.
//
// Entrada: { components, connections, definitions, activeFault }
// Salida:  { systemPressure, pumpFlow, force, speed, status, completed }
//
// NOTA (etapa E2): los casos especiales por tipo (PASO 10..14) se convertiran
// en llamadas al ComponentSpec (physics.internalRouting / conduct / solve).
// ================================================================

import { buildAdjacency } from './graph.js';
import { getDcvRouting } from './valve-routing.js';
import { getComponent, ROLES } from '../registry.js';
import { updateDcvPositions } from './dcv-positions.js';

export function solveCircuit(circuit) {
    var components = (circuit && circuit.components) || [];
    var connections = (circuit && circuit.connections) || [];
    var COMP_DEFS = (circuit && circuit.definitions) || {};
    var activeFault = (circuit && circuit.activeFault) || 'none';

    /* Localizador local: equivalente 1:1 al findComp() del monolito */
    function findComp(id) {
        for (var i = 0; i < components.length; i++) {
            if (components[i].id === id) return components[i];
        }
        return null;
    }
    // ============================================================
    // PASO 1: Construir adyacencia (siempre primero)
    // ============================================================
    var adj = buildAdjacency(connections);
    
    // ============================================================
    // PASO 2: Resetear TODOS los estados de componentes y conexiones
    // ============================================================
    connections.forEach(function (conn) {
        conn.pressure = 0;
        conn.flow = 0;
        conn.flowDir = 0;
        conn.rpm = 0;
        conn.power = 0;
        conn.torque = 0;
        conn.ratio = 0;
    });
    
    components.forEach(function (c) {
        c._localPressure = 0;
        c._localFlow = 0;
        c._pilotPressure = 0;
        c._shuttleA = 0;
        c._shuttleB = 0;
        c._andPortX = 0;
        c._andPortY = 0;
        c.reading = 0;
        c._inputRPM = 0;
        c._inputPower = 0;
        c._inputFlow = 0;
        c._inputPressure = 0;
        c._inputTorque = 0;
        c._actualFlow = 0;
        c._pressure = 0;
        c._power = 0;
        c._sourceType = 'none';
        c._torqueRatio = 1.0;
        c._requiredTorque = 0;
        c._extending = false;
        c._speedFactor = 0;
        c._stalled = false;
        
        // Resetear específicamente para bombas variables
        if (c.type === 'pump-var-displacement') {
            c._outputFlow = 0;
            c._outputPressure = 0;
            c._outputPower = 0;
            c._outputTorque = 0;
        }
        
        // Resetear estados de válvulas de secuencia
        if (c.type === 'sequence-valve') {
            c._sequenceOpen = false;
        }
        
        // Resetear estados de alivio
        if (c.type === 'relief' || c.type === 'prop-relief') {
            c._reliefActive = false;
        }
    });
    
    // ============================================================
    // PASO 3: Procesar motores (Engine)
    // ============================================================
    components.forEach(function (c) {
        if (c.type !== 'engine') return;
        
        var power = c.values.power || 50;
        var rpm = c.values.rpm || 1500;
        var efficiency = 0.92;
        var equivPressure = 150;
        var equivFlow = (power * efficiency * 600) / equivPressure;
        
        var outKey = c.id + ':0';
        if (adj[outKey]) {
            adj[outKey].forEach(function (a) {
                var cn = connections[a.connIdx];
                if (cn) {
                    cn.pressure = equivPressure;
                    cn.flow = equivFlow;
                    cn.flowDir = (cn.from.compId === c.id && cn.from.portIdx === 0) ? 1 : -1;
                    
                    var target = findComp(a.otherCompId);
                    if (target) {
                        target._localPressure = Math.max(target._localPressure || 0, equivPressure);
                        target._localFlow = (target._localFlow || 0) + equivFlow;
                    }
                }
            });
        }
        c._rpm = rpm;
        c._power = power;
    });
    
    // ============================================================
    // PASO 4: Procesar Pump Drive (distribuye potencia y RPM)
    // ============================================================
    components.forEach(function (c) {
        if (c.type !== 'pump-drive') return;
        
        var numOutputs = parseInt(c.values.numOutputs || '2');
        var ratios = [
            parseFloat(c.values.ratio1) || 1.0,
            parseFloat(c.values.ratio2) || 1.0,
            parseFloat(c.values.ratio3) || 1.0
        ];
        
        var efficiency = (c.values.efficiency || 92) / 100;
        var maxInputSpeed = c.values.maxInputSpeed || 3000;
        var maxOutputSpeed = c.values.maxOutputSpeed || 6000;
        var maxTorqueLimit = c.values.maxTorque || 1500;
        
        var inKey = c.id + ':0';
        var inputPower = 0;
        var inputRPM = 0;
        var inputTorque = 0;
        var sourceType = 'none';
        
        // Leer entrada
        if (adj[inKey]) {
            adj[inKey].forEach(function (a) {
                var source = findComp(a.otherCompId);
                var cn = connections[a.connIdx];
                
                if (source && source.type === 'engine') {
                    inputRPM = source.values.rpm || 1500;
                    var power = source.values.power || 50;
                    inputPower = power * 0.92;
                    sourceType = 'engine';
                } else if (source && source.type === 'pump-var-displacement') {
                    inputRPM = source._inputRPM || 1500;
                    inputPower = source._hydraulicPower || source._power || 50;
                    sourceType = 'pump-var';
                } else if (source && source.type === 'pump-drive') {
                    inputRPM = source._outputRPM1 || 1500;
                    inputPower = source._outputPower1 || 50;
                    sourceType = 'pump-drive';
                } else if (cn && cn.power !== undefined) {
                    inputPower = cn.power || 50;
                    inputRPM = cn.rpm || 1500;
                    sourceType = 'connection';
                }
            });
        }
        
        if (inputPower === 0) {
            inputPower = 46;
            inputRPM = 1500;
            sourceType = 'default';
        }
        
        inputTorque = (inputPower * 9550) / inputRPM;
        
        // Verificar límites
        var speedDerating = 1.0;
        if (inputRPM > maxInputSpeed) {
            speedDerating = maxInputSpeed / inputRPM;
        }
        
        var torqueDerating = 1.0;
        if (inputTorque > maxTorqueLimit) {
            torqueDerating = maxTorqueLimit / inputTorque;
        }
        
        var totalDerating = Math.min(speedDerating, torqueDerating);
        var effectiveInputPower = inputPower * totalDerating;
        var effectiveInputRPM = inputRPM * totalDerating;
        var effectiveInputTorque = (effectiveInputPower * 9550) / effectiveInputRPM;
        
        // Calcular la relación total
        var totalRatio = 0;
        for (var i = 0; i < numOutputs; i++) {
            totalRatio += ratios[i];
        }
        if (totalRatio === 0) totalRatio = 1;
        
        // Inicializar arrays
        c._outputRPMs = [0, 0, 0];
        c._outputPowers = [0, 0, 0];
        c._outputTorques = [0, 0, 0];
        c._outputRatios = [0, 0, 0];
        
        // Distribuir a cada salida
        for (var i = 0; i < numOutputs; i++) {
            var normalizedRatio = ratios[i] / totalRatio;
            
            var outPower = effectiveInputPower * normalizedRatio * efficiency;
            var outputRPM = effectiveInputRPM * ratios[i];
            var outputTorque = (outPower * 9550) / outputRPM;
            
            if (outputRPM > maxOutputSpeed) {
                outputRPM = maxOutputSpeed;
                outPower = (outputTorque * outputRPM) / 9550;
            }
            
            if (outputTorque > maxTorqueLimit * 2) {
                outputTorque = maxTorqueLimit * 2;
                outPower = (outputTorque * outputRPM) / 9550;
            }
            
            c._outputRPMs[i] = outputRPM;
            c._outputPowers[i] = outPower;
            c._outputTorques[i] = outputTorque;
            c._outputRatios[i] = ratios[i];
            
            c['_outputRPM' + (i + 1)] = outputRPM;
            c['_outputPower' + (i + 1)] = outPower;
            c['_outputTorque' + (i + 1)] = outputTorque;
            c['_outputRatio' + (i + 1)] = ratios[i];
            
            // Propagar a los componentes conectados
            var outKey = c.id + ':' + (i + 1);
            if (adj[outKey]) {
                adj[outKey].forEach(function (a) {
                    var cn = connections[a.connIdx];
                    if (cn) {
                        cn.rpm = outputRPM;
                        cn.power = outPower;
                        cn.torque = outputTorque;
                        cn.ratio = ratios[i];
                        cn.flowDir = (cn.from.compId === c.id && cn.from.portIdx === (i + 1)) ? 1 : -1;
                        
                        var target = findComp(a.otherCompId);
                        if (target) {
                            if (target.type === 'pump-var-displacement') {
                                target._inputRPM = outputRPM;
                                target._inputPower = outPower;
                                target._inputTorque = outputTorque;
                                target._inputRatio = ratios[i];
                                target._sourceType = 'pump-drive-out' + (i + 1);
                                target._pumpDriveOutput = i + 1;
                                
                                // Calcular la bomba variable con los valores de entrada
                                calculateVariablePump(target, adj);
                            } else {
                                target._localPressure = Math.max(target._localPressure || 0, outPower);
                                target._localFlow = (target._localFlow || 0) + outPower;
                            }
                        }
                    }
                });
            }
        }
        
        // Limpiar salidas no utilizadas
        for (var i = numOutputs; i < 3; i++) {
            var outKey = c.id + ':' + (i + 1);
            if (adj[outKey]) {
                adj[outKey].forEach(function (a) {
                    var cn = connections[a.connIdx];
                    if (cn) {
                        cn.rpm = 0;
                        cn.power = 0;
                        cn.torque = 0;
                        cn.ratio = 0;
                        cn.flowDir = 0;
                    }
                });
            }
            c._outputRPMs[i] = 0;
            c._outputPowers[i] = 0;
            c._outputTorques[i] = 0;
            c._outputRatios[i] = 0;
            c['_outputRPM' + (i + 1)] = 0;
            c['_outputPower' + (i + 1)] = 0;
            c['_outputTorque' + (i + 1)] = 0;
            c['_outputRatio' + (i + 1)] = 0;
        }
        
        c._inputPower = inputPower;
        c._inputRPM = inputRPM;
        c._inputTorque = inputTorque;
        c._effectiveInputPower = effectiveInputPower;
        c._effectiveInputRPM = effectiveInputRPM;
        c._effectiveInputTorque = effectiveInputTorque;
        c._totalDerating = totalDerating;
        c._sourceType = sourceType;
        c._numOutputs = numOutputs;
    });
    
    // ============================================================
    // PASO 4.5: Calcular TODAS las bombas de desplazamiento variable
    // ============================================================
    // Las que cuelgan de un pump-drive ya se calcularon en el PASO 4 con su RPM
    // y su potencia reales; al recorrerlas de nuevo se recalculan con esos mismos
    // valores (resultado identico). Las que NO tienen pump-drive reciben la
    // entrada por defecto (46 kW · 1500 rpm) en lugar de quedarse a 0, que era lo
    // que dejaba el circuito sin presion, sin caudal y sin calculos.
    components.forEach(function (c) {
        if (c.type !== 'pump-var-displacement') return;
        calculateVariablePump(c, adj);
    });

    // ============================================================
    // PASO 4.6: Bombas variables de dos puertos ('pump-var')
    // ============================================================
    // Modelo simple y coherente con sus parametros (presion maxima y caudal
    // maximo escalado por el % de desplazamiento). Este tipo no se calculaba en
    // ninguna fase, por lo que siempre entregaba 0 bar / 0 L/min.
    components.forEach(function (c) {
        if (c.type !== 'pump-var') return;
        var varMaxP = c.values.maxPressure || 250;
        var varMaxQ = c.values.maxFlow || 60;
        var varPct = (c.values.displacement !== undefined ? c.values.displacement : 100) / 100;
        c._theoreticalFlow = varMaxQ;
        c._actualFlow = varMaxQ * varPct;
        c._pressure = varMaxP;
        c._localPressure = varMaxP;
        c._localFlow = c._actualFlow;
        c._hydraulicPower = varMaxP * c._actualFlow / 600;
    });
    
    // ============================================================
    // PASO 5: Función para calcular bomba variable
    // ============================================================
    function calculateVariablePump(c, adj) {
        if (c.type !== 'pump-var-displacement') return;
        
        var displacement = c.values.displacement || 28;
        var dispPct = (c.values.displacementPct || 100) / 100;
        var maxPressure = c.values.maxPressure || 250;
        var effVol = (c.values.efficiencyVol || 92) / 100;
        var effMech = (c.values.efficiencyMech || 90) / 100;
        
        // Leer valores de entrada
        var inputPower = c._inputPower || 0;
        var inputRPM = c._inputRPM || 0;
        var inputTorque = c._inputTorque || 0;
        
        // Si no hay entrada, usar valores por defecto
        if (inputPower === 0) {
            inputPower = 46;
            inputRPM = 1500;
            inputTorque = (inputPower * 9550) / inputRPM;
        }
        
        var effectiveDisplacement = displacement * dispPct;
        
        // Calcular torque requerido
        var requiredTorque = (maxPressure * effectiveDisplacement) / (20 * Math.PI);
        var torqueRatio = 1.0;
        if (inputTorque > 0) {
            torqueRatio = Math.min(1.0, inputTorque / requiredTorque);
        }
        
        var effectivePressure = maxPressure * torqueRatio;
        var theoreticalFlow = (effectiveDisplacement * inputRPM) / 1000;
        var actualFlow = theoreticalFlow * effVol;
        var hydraulicPower = inputPower * effMech * torqueRatio;
        
        //var pressure = (actualFlow > 0.1) ? (hydraulicPower * 600) / actualFlow : 0;
        //pressure = Math.min(pressure, effectivePressure);
        var pressure = maxPressure;
        if (actualFlow < 0.1) pressure = 0;
        
        var torque = (pressure * effectiveDisplacement) / (20 * Math.PI);
        
        // Guardar valores
        c._theoreticalFlow = theoreticalFlow;
        c._actualFlow = actualFlow;
        c._pressure = pressure;
        c._hydraulicPower = hydraulicPower;
        c._torque = torque;
        c._effectiveDisplacement = effectiveDisplacement;
        c._torqueRatio = torqueRatio;
        c._requiredTorque = requiredTorque;
        c._localFlow = actualFlow;
        c._localPressure = pressure;
        c._power = hydraulicPower;
        
        // Propagar al puerto P (salida)
        var outKey = c.id + ':0';
        if (adj && adj[outKey]) {
            adj[outKey].forEach(function (a) {
                var cn = connections[a.connIdx];
                if (cn) {
                    cn.pressure = pressure;
                    cn.flow = actualFlow;
                    cn.rpm = inputRPM;
                    cn.power = hydraulicPower;
                    cn.torque = torque;
                    cn.flowDir = (cn.from.compId === c.id && cn.from.portIdx === 0) ? 1 : -1;
                    
                    var target = findComp(a.otherCompId);
                    if (target) {
                        target._localPressure = Math.max(target._localPressure || 0, pressure);
                        target._localFlow = actualFlow;
                        target._inputRPM = inputRPM;
                        target._inputPower = hydraulicPower;
                        target._inputTorque = torque;
                    }
                }
            });
        }
        
        // Propagar al puerto T (retorno)
        var tankKey = c.id + ':1';
        if (adj && adj[tankKey]) {
            adj[tankKey].forEach(function (a) {
                var cn = connections[a.connIdx];
                if (cn) {
                    cn.pressure = 2;
                    cn.flow = actualFlow * (1 - effVol);
                    cn.rpm = 0;
                    cn.power = 0;
                    cn.torque = 0;
                    cn.flowDir = -1;
                }
            });
        }
    }
    
    // ============================================================
    // PASO 6: Calcular bombas estándar
    // ============================================================
    var standardPumps = components.filter(function (c) { 
        return c.type === 'pump' && c.type !== 'pump-var-displacement'; 
    });
    
    standardPumps.forEach(function(p) {
        p._pressure = p.values.pressure || 150;
        p._actualFlow = p.values.flow || 30;
        p._localPressure = p._pressure;
        p._localFlow = p._actualFlow;
    });
    
    // ============================================================
    // PASO 7: BFS - Inicializar la cola con TODAS las bombas
    // ============================================================
    // ETAPA E2 — desviacion D1 corregida: la propagacion parte de la PRESION DE
    // SISTEMA (ya limitada por el alivio), no de la presion bruta de la bomba.
    // Antes el ajuste del alivio solo se reflejaba en el readout.
    var visited = {};
    var queue = [];

    // Obtener TODAS las bombas (estandar y variables)
    var allPumps = components.filter(function (c) {
        return c.type === 'pump' || c.type === 'pump-var' || c.type === 'pump-var-displacement';
    });

    // Si no hay bombas, salir
    if (allPumps.length === 0) {
        return {
            systemPressure: 0,
            pumpFlow: 0,
            force: 0,
            speed: 0,
            status: 'No pump',
            completed: false
        };
    }

    // ============================================================
    // PASO 8: Presion y caudal de sistema (alivio)
    // ============================================================
    var pumpPressure = 0;
    var pumpFlow = 0;
    allPumps.forEach(function (p) {
        pumpPressure = Math.max(pumpPressure, p._pressure || 0);
        pumpFlow += p._actualFlow || 0;
    });

    // El ajuste de alivio mas bajo conectado al circuito limita el sistema
    var reliefSetting = 999;
    components.forEach(function (c) {
        if (c.type === 'relief' && adj[c.id + ':0'] && c.values.setting < reliefSetting) {
            reliefSetting = c.values.setting;
        }
    });
    var sysPressure = (activeFault === 'relief-stuck')
        ? pumpPressure
        : Math.min(pumpPressure, reliefSetting);

    // Semilla del BFS: presion de sistema + caudal total de las bombas
    allPumps.forEach(function (pump) {
        // Asegurar que la bomba tiene valores
        if (pump._pressure === undefined) pump._pressure = 150;
        if (pump._actualFlow === undefined) pump._actualFlow = 30;

        pump._localPressure = sysPressure;
        pump._localFlow = pump._actualFlow;

        var pumpKey = pump.id + ':0';
        if (adj && adj[pumpKey] !== undefined) {
            visited[pumpKey] = true;

            adj[pumpKey].forEach(function (a) {
                queue.push({
                    compId: a.otherCompId,
                    portIdx: a.otherPortIdx,
                    pressure: pump._localPressure,
                    flow: pump._localFlow,
                    connIdx: a.connIdx,
                    fromCompId: pump.id,
                    fromPortIdx: 0
                });
            });
        }

        // Marcar puerto T como visitado (tanque)
        var tankKey2 = pump.id + ':1';
        if (adj && adj[tankKey2] !== undefined) {
            visited[tankKey2] = true;
        }
    });

    // ============================================================
    // PASO 9: BFS - Procesar la cola
    // ============================================================
    // ETAPA E2: el presupuesto de iteraciones sube porque los componentes de
    // 3+ puertos (tee, divisor, prioridad...) ahora tambien reparten caudal.
    var maxIter = connections.length * 6 + 100;
    var iter = 0;
    /**
     * Propaga un valor por un puerto de salida hacia el vecino conectado.
     * `comparePressure` es la presion que se compara con la del destino para
     * decidir si merece la pena revisitar el nodo (cada fase del motor anterior
     * usaba un valor ligeramente distinto; se conserva la semantica).
     */
    function propagate(comp, outPort, edge, outPressure, outFlow, comparePressure) {
        var cn = connections[edge.connIdx];
        if (!cn) return;
        var isFrom = (cn.from.compId === comp.id && cn.from.portIdx === outPort);
        var nextCompId = isFrom ? cn.to.compId : cn.from.compId;
        var nextPortIdx = isFrom ? cn.to.portIdx : cn.from.portIdx;
        var targetKey = nextCompId + ':' + nextPortIdx;
        var targetComp = findComp(nextCompId);
        if (!targetComp) return;
        if (visited[targetKey] && !(comparePressure > targetComp._localPressure)) return;
        visited[targetKey] = true;
        queue.push({
            compId: nextCompId,
            portIdx: nextPortIdx,
            pressure: Math.max(0, outPressure),
            flow: Math.max(0, outFlow),
            connIdx: edge.connIdx,
            fromCompId: comp.id,
            fromPortIdx: outPort
        });
    }

    /** Propaga por todos los vecinos conectados al puerto indicado. */
    function propagatePort(comp, outPort, outPressure, outFlow, comparePressure) {
        var outKey = comp.id + ':' + outPort;
        if (!adj[outKey]) return;
        for (var a = 0; a < adj[outKey].length; a++) {
            propagate(comp, outPort, adj[outKey][a], outPressure, outFlow, comparePressure);
        }
    }

    /**
     * Aplica el resultado de physics.conduct():
     *   outPort >= 0   -> propaga a ese puerto
     *   outPort === -2 -> reparte entre los DEMAS puertos (tee: a partes iguales;
     *                     divisor de caudal: segun comp._dividerRatioA)
     *   result.extra   -> salidas adicionales declaradas por el spec (EF de la
     *                     valvula de prioridad)
     */
    function applyConduction(comp, def, node, result) {
        var outPressure = Math.max(0, node.pressure - (result.pressureDrop || 0));
        var outFlow = (typeof result.flowLimit === 'number') ? result.flowLimit : node.flow;
        var compare = outPressure;

        if (result.outPort === -2) {
            var others = [];
            var portCount = def ? def.ports.length : 0;
            for (var p = 0; p < portCount; p++) {
                if (p !== node.portIdx) others.push(p);
            }
            if (others.length === 0) return;
            var ratioA = (typeof comp._dividerRatioA === 'number') ? comp._dividerRatioA : null;
            for (var k = 0; k < others.length; k++) {
                var fraction = 1 / others.length;
                if (ratioA !== null && others.length === 2) {
                    fraction = (k === 0) ? ratioA : (1 - ratioA);
                }
                propagatePort(comp, others[k], outPressure, outFlow * fraction, compare);
            }
        } else if (result.outPort >= 0) {
            propagatePort(comp, result.outPort, outPressure, outFlow, compare);
        }

        if (result.extra && result.extra.length) {
            for (var e = 0; e < result.extra.length; e++) {
                var ex = result.extra[e];
                var exPressure = Math.max(0, node.pressure - (ex.pressureDrop || 0));
                var exFlow = (typeof ex.flowLimit === 'number') ? ex.flowLimit : node.flow;
                propagatePort(comp, ex.outPort, exPressure, exFlow, compare);
            }
        }
    }
    while (queue.length > 0 && iter < maxIter) {
        iter++;
        var node = queue.shift();
        var nodeKey = node.compId + ':' + node.portIdx;

        // Verificar si ya fue visitado con mayor presion
        if (visited[nodeKey] && findComp(node.compId)._localPressure >= node.pressure) continue;
        visited[nodeKey] = true;

        var comp = findComp(node.compId);
        if (!comp) continue;

        // Actualizar conexion
        var conn = connections[node.connIdx];
        if (conn) {
            conn.pressure = node.pressure;
            conn.flow = node.flow;
            if (conn.from.compId === node.fromCompId && conn.from.portIdx === node.fromPortIdx) {
                conn.flowDir = 1;
            } else {
                conn.flowDir = -1;
            }
        }

        // Actualizar componente
        if (node.pressure > comp._localPressure) comp._localPressure = node.pressure;
        comp._localFlow = node.flow;

        // Verificar si es un puerto piloto
        var def = COMP_DEFS[comp.type];
        if (def && def.ports[node.portIdx] && def.ports[node.portIdx].label === 'Pilot') {
            comp._pilotPressure = node.pressure;
            continue;
        }

        // ============================================================
        // PASO 10: DESPACHO POR ROL (ComponentRegistry — etapa E2)
        // ============================================================
        // El solver ya no consulta `comp.type`: pregunta al ComponentSpec
        // registrado (js/components/*.js) por su rol y por su fisica.
        var spec = getComponent(comp.type);
        if (!spec) {
            // Tipo no registrado: se conserva el comportamiento anterior para no
            // romper circuitos guardados (los componentes de 2 puertos propagan).
            if (def && def.ports.length === 2) {
                var legacyOther = node.portIdx === 0 ? 1 : 0;
                propagatePort(comp, legacyOther, node.pressure * 0.99, node.flow * 0.99, node.pressure * 0.99);
            }
            continue;
        }

        var ctx = {
            portIdx: node.portIdx,
            pressure: node.pressure,
            flow: node.flow,
            adj: adj,
            connections: connections,
            propagatePort: propagatePort
        };

        // --- 10.1 Valvulas direccionales: ruteo interno + perdidas del spec ---
        if (spec.role === ROLES.VALVE_DIRECTIONAL) {
            var routing = getDcvRouting(comp);
            if (!routing || routing.length === 0) continue;   // centro / posicion cerrada
            var dropP = (spec.drop && spec.drop.pressure) || 0.97;
            var dropQ = (spec.drop && spec.drop.flow) || 0.99;
            for (var r = 0; r < routing.length; r++) {
                if (routing[r].from !== node.portIdx) continue;
                propagatePort(comp, routing[r].to, node.pressure * dropP, node.flow * dropQ, node.pressure);
            }
            continue;
        }
        // --- 10.2 Comportamiento propio del componente (cargas y lecturas) ---
        // Cilindros (fuerza y velocidad), motores (par y rpm) e instrumentos.
        if (typeof spec.physics.solve === 'function') {
            spec.physics.solve(comp, ctx);
        }

        // Componentes que no propagan por decision de modelado (p. ej. los
        // motores hidraulicos: desviacion D7, ver docs/BASELINE.md).
        if (spec.physics.noConduction) continue;

        // --- 10.3 Propagacion mediante la tabla unificada del registro ---
        if (typeof spec.physics.conduct === 'function') {
            var result = spec.physics.conduct(comp, node.portIdx, node.pressure, node.flow);
            if (result && result.canFlow) applyConduction(comp, def, node, result);
            continue;
        }

        // --- 10.4 Sin regla propia: los componentes de 2 puertos propagan con
        //          las perdidas declaradas por el spec (1 % por defecto) ---
        if (def && def.ports.length === 2) {
            var losses = spec.physics.losses || { pressure: 0.99, flow: 0.99 };
            var otherPortIdx = node.portIdx === 0 ? 1 : 0;
            var nextP = node.pressure * losses.pressure;
            propagatePort(comp, otherPortIdx, nextP, node.flow * losses.flow, nextP);
        }
    }

    // ============================================================
    // PASO 15: Posiciones de valvulas y resumen de cargas
    // ============================================================
    updateDcvPositions(components);

    /* ETAPA E2 — desviacion D5 corregida: se informa la fuerza y la velocidad del
       cilindro mas cargado para los readouts (antes se pasaban 0, 0). */
    var maxForce = 0;
    var speedAtMaxForce = 0;
    components.forEach(function (c) {
        if (typeof c._forceKN !== 'number') return;
        if (c._forceKN > maxForce) {
            maxForce = c._forceKN;
            speedAtMaxForce = c._speedMMS || 0;
        }
    });

    // ============================================================
    // PASO 16: Devolver el resultado a la capa de interfaz
    // ============================================================
    return {
        systemPressure: sysPressure,
        pumpFlow: pumpFlow,
        force: maxForce,
        speed: speedAtMaxForce,
        status: 'Running',
        completed: true
    };
}