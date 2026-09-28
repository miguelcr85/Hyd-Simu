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
import { getComponentPassthrough } from './passthrough.js';
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
    // PASO 7: BFS - Inicializar cola con TODAS las bombas
    // ============================================================
    var visited = {};
    var queue = [];
    
    // Obtener TODAS las bombas (estándar y variables)
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
    
    // Inicializar BFS con TODAS las bombas
    allPumps.forEach(function(pump) {
        // Asegurar que la bomba tiene valores
        if (pump._pressure === undefined) pump._pressure = 150;
        if (pump._actualFlow === undefined) pump._actualFlow = 30;
        
        pump._localPressure = pump._pressure;
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
    // PASO 8: BFS - Propagar presión y flujo
    // ============================================================
    var pumpPressure = 0;
    var pumpFlow = 0;
    allPumps.forEach(function(p) {
        pumpPressure = Math.max(pumpPressure, p._pressure || 0);
        pumpFlow += p._actualFlow || 0;
    });
    
    // Sistema de presión base
    var reliefSetting = 999;
    components.forEach(function (c) {
        if (c.type === 'relief' && adj[c.id + ':0'] && c.values.setting < reliefSetting) {
            reliefSetting = c.values.setting;
        }
    });
    var sysPressure = (activeFault === 'relief-stuck')
        ? pumpPressure
        : Math.min(pumpPressure, reliefSetting);
    
    // ============================================================
    // PASO 9: BFS - Procesar cola
    // ============================================================
    var maxIter = connections.length * 4 + 50;
    var iter = 0;
    
    while (queue.length > 0 && iter < maxIter) {
        iter++;
        var node = queue.shift();
        var nodeKey = node.compId + ':' + node.portIdx;
        
        // Verificar si ya fue visitado con mayor presión
        if (visited[nodeKey] && findComp(node.compId)._localPressure >= node.pressure) continue;
        visited[nodeKey] = true;
        
        var comp = findComp(node.compId);
        if (!comp) continue;
        
        // Actualizar conexión
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
        // PASO 10: PROCESAR COMPONENTES ESPECIALES (DCV)
        // ============================================================
        
        // --- VÁLVULAS DIRECCIONALES (DCV) ---
        var isDCV = comp.type === 'dcv43' || comp.type === 'dcv42' || comp.type === 'dcv32' || 
                    comp.type === 'dcv32no' || comp.type === 'dcv52' || comp.type === 'dcv53' ||
                    comp.type === 'valve22' || comp.type === 'valve22no';
        
        if (isDCV) {
            // Obtener el routing interno según la posición
            var routing = getDcvRouting(comp);
            
            // Si no hay routing o está vacío (posición centro/cerrada)
            if (!routing || routing.length === 0) {
                // Válvula en centro/cerrada - no propaga flujo
                // Pero permitimos que los puertos T drenen a tanque
                continue;
            }
            
            // Verificar si el puerto actual está conectado internamente
            var hasMatch = false;
            var outPorts = [];
            for (var r = 0; r < routing.length; r++) {
                if (routing[r].from === node.portIdx) {
                    outPorts.push(routing[r].to);
                    hasMatch = true;
                }
            }
            
            if (!hasMatch) {
                // Este puerto no está conectado internamente en esta posición
                continue;
            }
            
            // Propagar a los puertos de salida
            for (var o = 0; o < outPorts.length; o++) {
                var outPort = outPorts[o];
                var outKey = comp.id + ':' + outPort;
                
                if (adj[outKey]) {
                    for (var a = 0; a < adj[outKey].length; a++) {
                        var connInfo = adj[outKey][a];
                        var nextConn = connections[connInfo.connIdx];
                        if (!nextConn) continue;
                        
                        // Determinar la dirección del flujo
                        var isFrom = (nextConn.from.compId === comp.id && nextConn.from.portIdx === outPort);
                        var nextCompId = isFrom ? nextConn.to.compId : nextConn.from.compId;
                        var nextPortIdx = isFrom ? nextConn.to.portIdx : nextConn.from.portIdx;
                        
                        var targetKey = nextCompId + ':' + nextPortIdx;
                        var targetComp = findComp(nextCompId);
                        if (!targetComp) continue;
                        
                        // Verificar si ya visitado con presión mayor
                        if (!visited[targetKey] || node.pressure > targetComp._localPressure) {
                            var nextPressure = node.pressure * 0.97; // Pérdida del 3% en la válvula
                            var nextFlow = node.flow * 0.99;
                            
                            visited[targetKey] = true;
                            queue.push({
                                compId: nextCompId,
                                portIdx: nextPortIdx,
                                pressure: Math.max(0, nextPressure),
                                flow: Math.max(0, nextFlow),
                                connIdx: connInfo.connIdx,
                                fromCompId: comp.id,
                                fromPortIdx: outPort
                            });
                        }
                    }
                }
            }
            continue; // Ya procesamos este componente
        }
        
        // --- VÁLVULA DE SECUENCIA ---
        if (comp.type === 'sequence-valve') {
            var seqSet = comp.values.setting || 100;
            var seqReset = seqSet * 0.85;
            
            if (comp._sequenceOpen) {
                if (node.pressure < seqReset) comp._sequenceOpen = false;
            } else {
                if (node.pressure >= seqSet) comp._sequenceOpen = true;
            }
            
            if (comp._sequenceOpen && node.portIdx === 0) {
                var seqOutKey = comp.id + ':1';
                if (adj[seqOutKey]) {
                    adj[seqOutKey].forEach(function (a) {
                        var cn = connections[a.connIdx];
                        if (cn) {
                            var isFrom = (cn.from.compId === comp.id && cn.from.portIdx === 1);
                            var nextCompId = isFrom ? cn.to.compId : cn.from.compId;
                            var nextPortIdx = isFrom ? cn.to.portIdx : cn.from.portIdx;
                            var targetKey = nextCompId + ':' + nextPortIdx;
                            var targetComp = findComp(nextCompId);
                            if (targetComp && (!visited[targetKey] || node.pressure * 0.98 > targetComp._localPressure)) {
                                visited[targetKey] = true;
                                queue.push({
                                    compId: nextCompId,
                                    portIdx: nextPortIdx,
                                    pressure: node.pressure * 0.98,
                                    flow: node.flow * 0.99,
                                    connIdx: a.connIdx,
                                    fromCompId: comp.id,
                                    fromPortIdx: 1
                                });
                            }
                        }
                    });
                }
            }
            continue;
        }
        // ============================================================
// MOTOR POCLAIN MS35 (LSHT) - Usando getComponentPassthrough
// ============================================================
if (comp.type === 'poclain-ms35') {
    // Verificar si el puerto actual permite flujo
    var passthrough = getComponentPassthrough(comp, node.portIdx, node.pressure, node.flow);
    
    if (passthrough && passthrough.canFlow && passthrough.outPort >= 0) {
        var outPort = passthrough.outPort;
        var outKey = comp.id + ':' + outPort;
        
        // Calcular presión de salida (con pérdidas)
        var outPressure = node.pressure - passthrough.pressureDrop;
        var outFlow = passthrough.flowLimit;
        
        // Propagar al puerto de salida
        if (adj[outKey]) {
            adj[outKey].forEach(function (a) {
                var cn = connections[a.connIdx];
                if (cn) {
                    var isFrom = (cn.from.compId === comp.id && cn.from.portIdx === outPort);
                    var nextCompId = isFrom ? cn.to.compId : cn.from.compId;
                    var nextPortIdx = isFrom ? cn.to.portIdx : cn.from.portIdx;
                    var targetKey = nextCompId + ':' + nextPortIdx;
                    var targetComp = findComp(nextCompId);
                    
                    if (targetComp && (!visited[targetKey] || outPressure > targetComp._localPressure)) {
                        visited[targetKey] = true;
                        queue.push({
                            compId: nextCompId,
                            portIdx: nextPortIdx,
                            pressure: Math.max(0, outPressure),
                            flow: Math.max(0, outFlow),
                            connIdx: a.connIdx,
                            fromCompId: comp.id,
                            fromPortIdx: outPort
                        });
                    }
                }
            });
        }
    }
    
    // Calcular datos de rendimiento del motor
    var disp = comp.values.displacement || 380;
    var maxPressure = comp.values.maxPressure || 350;
    var maxRPM = comp.values.speedMax || 300;
    var effVol = (comp.values.efficiencyVol || 92) / 100;
    var effMech = (comp.values.efficiencyMech || 90) / 100;
    var torqueMax = comp.values.torqueMax || 1800;
    
    // Solo calcular si hay presión y flujo
    if (node.pressure > 0 && node.flow > 0) {
        var theoreticalTorque = (node.pressure * disp) / (20 * Math.PI);
        var torque = Math.min(theoreticalTorque, torqueMax) * effMech;
        comp._torque = torque;
        comp._localPressure = node.pressure;
        comp._localFlow = node.flow;
        
        if (disp > 0) {
            var theoreticalRPM = (node.flow * 1000) / disp;
            var rpm = Math.min(theoreticalRPM * effVol, maxRPM);
            comp._rpm = rpm;
            comp._speedFactor = rpm / maxRPM;
            comp._power = (torque * rpm) / 9550;
            
            // Actualizar conexión con datos de rendimiento
            var motorKey = comp.id + ':' + node.portIdx;
            if (adj[motorKey]) {
                adj[motorKey].forEach(function (a) {
                    var cn = connections[a.connIdx];
                    if (cn) {
                        cn.rpm = rpm;
                        cn.power = comp._power;
                        cn.torque = torque;
                    }
                });
            }
            
            comp._atMaxSpeed = (rpm >= maxRPM * 0.95);
            comp._atMaxTorque = (torque >= torqueMax * 0.95);
        }
    } else {
        comp._rpm = 0;
        comp._speedFactor = 0;
        comp._power = 0;
        comp._atMaxSpeed = false;
        comp._atMaxTorque = false;
    }
    
    continue;
}
        
        // --- VÁLVULA DE ALIVIO ---
        if (comp.type === 'relief' || comp.type === 'prop-relief') {
            var relSet = comp.values.setting || (comp.values.maxSetting || 250) * ((comp.values.command || 80) / 100);
            var relReset = relSet * 0.92;
            
            if (comp._reliefActive) {
                if (node.pressure < relReset) comp._reliefActive = false;
            } else {
                if (node.pressure >= relSet) comp._reliefActive = true;
            }
            
            if (node.portIdx === 0 && comp._reliefActive) {
                var relOutKey = comp.id + ':1';
                if (adj[relOutKey]) {
                    adj[relOutKey].forEach(function (a) {
                        var cn = connections[a.connIdx];
                        if (cn) {
                            var isFrom = (cn.from.compId === comp.id && cn.from.portIdx === 1);
                            var nextCompId = isFrom ? cn.to.compId : cn.from.compId;
                            var nextPortIdx = isFrom ? cn.to.portIdx : cn.from.portIdx;
                            var targetKey = nextCompId + ':' + nextPortIdx;
                            var targetComp = findComp(nextCompId);
                            if (targetComp && (!visited[targetKey] || node.pressure * 0.95 > targetComp._localPressure)) {
                                visited[targetKey] = true;
                                queue.push({
                                    compId: nextCompId,
                                    portIdx: nextPortIdx,
                                    pressure: node.pressure * 0.95,
                                    flow: node.flow * 0.95,
                                    connIdx: a.connIdx,
                                    fromCompId: comp.id,
                                    fromPortIdx: 1
                                });
                            }
                        }
                    });
                }
            }
            continue;
        }
        
        // --- VÁLVULA DE DESCARGA (UNLOADING) ---
        if (comp.type === 'unloading') {
            var ulSet = comp.values.setting || 150;
            var ulPilot = comp._pilotPressure || 0;
            
            if (node.portIdx === 0 && ulPilot >= ulSet) {
                var ulOutKey = comp.id + ':1';
                if (adj[ulOutKey]) {
                    adj[ulOutKey].forEach(function (a) {
                        var cn = connections[a.connIdx];
                        if (cn) {
                            var isFrom = (cn.from.compId === comp.id && cn.from.portIdx === 1);
                            var nextCompId = isFrom ? cn.to.compId : cn.from.compId;
                            var nextPortIdx = isFrom ? cn.to.portIdx : cn.from.portIdx;
                            var targetKey = nextCompId + ':' + nextPortIdx;
                            var targetComp = findComp(nextCompId);
                            if (targetComp && (!visited[targetKey] || node.pressure * 0.98 > targetComp._localPressure)) {
                                visited[targetKey] = true;
                                queue.push({
                                    compId: nextCompId,
                                    portIdx: nextPortIdx,
                                    pressure: node.pressure * 0.98,
                                    flow: node.flow * 0.99,
                                    connIdx: a.connIdx,
                                    fromCompId: comp.id,
                                    fromPortIdx: 1
                                });
                            }
                        }
                    });
                }
            }
            continue;
        }
        
        // ============================================================
        // PASO 11: COMPONENTES DE MEDICIÓN Y PASSTHROUGH
        // ============================================================
        
        // Componentes de medición
        if (comp.type === 'gauge' || comp.type === 'pressure-transducer') {
            comp.reading = node.pressure;
            continue;
        }
        if (comp.type === 'pressure-switch') {
            comp._localPressure = Math.max(comp._localPressure || 0, node.pressure);
            continue;
        }
        if (comp.type === 'temp-gauge') {
            var power_kW = node.pressure * node.flow / 600;
            comp.reading = Math.min(90, 40 + power_kW * 0.5);
            continue;
        }
        if (comp.type === 'flow-meter') {
            comp.reading = node.flow;
            continue;
        }
        
        // ============================================================
        // PASO 12: CILINDROS - actualizar extensiones
        // ============================================================
        if (comp.type === 'cylinder-da' || comp.type === 'cylinder-sa') {
            var extForce = comp._localPressure * 0.1 * (Math.PI / 4 * (comp.values.bore || 80) * (comp.values.bore || 80)) / 1000;
            var retForce = comp._localPressure * 0.1 * (Math.PI / 4 * ((comp.values.bore || 80) * (comp.values.bore || 80) - (comp.values.rod || 45) * (comp.values.rod || 45))) / 1000;
            comp._speedFactor = node.flow / 30 * 0.8;
            comp._extending = (node.portIdx === 0 && node.pressure > 10);
            
            // Determinar si está extendiendo o retrayendo
            if (comp._extending) {
                // Comprobar si hay presión en el puerto B (retorno)
                var bKey = comp.id + ':1';
                var bPressure = 0;
                if (adj[bKey]) {
                    adj[bKey].forEach(function (a) {
                        var cn = connections[a.connIdx];
                        if (cn) bPressure = Math.max(bPressure, cn.pressure || 0);
                    });
                }
                if (bPressure > 5) {
                    // Hay contrapresión - puede estar bloqueado o en secuencia
                    comp._stalled = true;
                } else {
                    comp._stalled = false;
                }
            } else if (node.portIdx === 1 && node.pressure > 10) {
                comp._extending = false;
                comp._stalled = false;
            }
            continue;
        }
        
        // ============================================================
        // PASO 13: MOTORES
        // ============================================================
        if (comp.type === 'motor' || comp.type === 'motor-bidir') {
            var disp = comp.values.displacement || 25;
            var torque = (node.pressure * disp) / (20 * Math.PI);
            var rpm = (node.flow * 1000) / disp;
            comp._torque = torque;
            comp._rpm = rpm;
            comp._localPressure = node.pressure;
            continue;
        }
        
        // ============================================================
        // PASO 14: COMPONENTES DE PASSTHROUGH GENÉRICOS
        // ============================================================
        // Para el resto de componentes: filter, cooler, heater, etc.
        // Propagar al otro puerto si existe
        if (def && def.ports.length === 2) {
            var otherPortIdx = node.portIdx === 0 ? 1 : 0;
            var otherKey = comp.id + ':' + otherPortIdx;
            
            if (adj[otherKey]) {
                adj[otherKey].forEach(function (a) {
                    var cn = connections[a.connIdx];
                    if (cn) {
                        var isFrom = (cn.from.compId === comp.id && cn.from.portIdx === otherPortIdx);
                        var nextCompId = isFrom ? cn.to.compId : cn.from.compId;
                        var nextPortIdx = isFrom ? cn.to.portIdx : cn.from.portIdx;
                        var targetKey = nextCompId + ':' + nextPortIdx;
                        var targetComp = findComp(nextCompId);
                        
                        if (targetComp && (!visited[targetKey] || node.pressure * 0.99 > targetComp._localPressure)) {
                            var nextPressure = node.pressure * 0.99;
                            if (comp.type === 'filter') nextPressure = node.pressure * 0.98;
                            if (comp.type === 'cooler') nextPressure = node.pressure * 0.97;
                            
                            visited[targetKey] = true;
                            queue.push({
                                compId: nextCompId,
                                portIdx: nextPortIdx,
                                pressure: Math.max(0, nextPressure),
                                flow: node.flow * 0.99,
                                connIdx: a.connIdx,
                                fromCompId: comp.id,
                                fromPortIdx: otherPortIdx
                            });
                        }
                    }
                });
            }
        }
    }
    
    // ============================================================
    // PASO 15: Actualizar posiciones de valvulas direccionales
    // ============================================================
    var finalStatus = 'Running';
    updateDcvPositions(components);
    
    // ============================================================
    // PASO 16: Devolver el resultado a la capa de interfaz
    // ============================================================
    return {
        systemPressure: sysPressure,
        pumpFlow: pumpFlow,
        force: 0,
        speed: 0,
        status: finalStatus,
        completed: true
    };
}
