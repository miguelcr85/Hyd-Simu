// ================================================================
// CÁLCULOS ESPECÍFICOS DE BOMBAS
// ================================================================

import { formatNumber } from './utils.js';

export function getPumpPerformanceValues(comp) {
    const values = {};
    
    // Bomba de desplazamiento variable
    if (comp.type === 'pump-var-displacement') {
        values.pressure = comp._pressure || comp.values?.pressure || 0;
        values.flow = comp._actualFlow || 0;
        values.power = comp._hydraulicPower || comp._power || 0;
        values.torque = comp._torque || 0;
        values.rpm = comp._inputRPM || 0;
        
        const effVol = comp.values?.efficiencyVol || 92;
        const effMech = comp.values?.efficiencyMech || 90;
        values.efficiency = (effVol * effMech / 100);
        values.displacement = comp.values?.displacement || 28;
        values.displacementPct = comp.values?.displacementPct || 100;
        values.theoreticalFlow = comp._theoreticalFlow || 0;
        values.requiredTorque = comp._requiredTorque || 0;
        values.torqueRatio = comp._torqueRatio || 1;
        values.actualDisplacement = (values.displacement * values.displacementPct / 100);
    }
    // Bomba estándar
    else if (comp.type === 'pump') {
        values.pressure = comp.values?.pressure || 0;
        values.flow = comp.values?.flow || 0;
        values.power = (values.pressure * values.flow) / 600;
        values.rpm = 1500;
        values.efficiency = 85;
        values.displacement = 28;
        values.torque = (values.power * 9550) / (values.rpm || 1);
    }
    
    return values;
}

export function getPumpMetrics() {
    return {
        metrics: ['pressure', 'flow', 'power', 'torque', 'efficiency', 'rpm', 'displacement', 'displacementPct'],
        labels: {
            pressure: 'Presión de salida',
            flow: 'Caudal actual',
            power: 'Potencia hidráulica',
            torque: 'Par de salida',
            efficiency: 'Eficiencia total',
            rpm: 'RPM de entrada',
            displacement: 'Cilindrada',
            displacementPct: 'Desplazamiento'
        },
        units: {
            pressure: 'bar',
            flow: 'L/min',
            power: 'kW',
            torque: 'Nm',
            efficiency: '%',
            rpm: 'RPM',
            displacement: 'cm³/rev',
            displacementPct: '%'
        }
    };
}

export function getPumpWarnings(comp) {
    const warnings = [];
    
    // Verificar presión excesiva
    const pressure = comp._pressure || comp.values?.pressure || 0;
    const maxPressure = comp.values?.maxPressure || 350;
    if (pressure > maxPressure * 0.9) {
        warnings.push('⚠️ Presión cercana al límite máximo (' + pressure.toFixed(0) + ' bar)');
    }
    
    // Verificar eficiencia baja
    const torqueRatio = comp._torqueRatio || 1;
    if (torqueRatio < 0.5 && torqueRatio > 0) {
        warnings.push('⚠️ Eficiencia baja (' + (torqueRatio * 100).toFixed(0) + '%) — verificar carga');
    }
    
    // Verificar flujo
    const flow = comp._actualFlow || 0;
    const theoreticalFlow = comp._theoreticalFlow || 0;
    if (theoreticalFlow > 0 && flow < theoreticalFlow * 0.3) {
        warnings.push('⚠️ Caudal significativamente menor al teórico — posible cavitación');
    }
    
    // Verificar RPM
    const rpm = comp._inputRPM || 0;
    const maxRPM = comp.values?.maxInputSpeed || 3000;
    if (rpm > maxRPM * 0.9) {
        warnings.push('⚠️ RPM alta (' + rpm.toFixed(0) + ') — posible desgaste prematuro');
    }
    
    // Verificar si hay flujo pero sin presión
    if (flow > 5 && pressure < 10) {
        warnings.push('⚠️ Flujo sin presión — posible fuga en el sistema');
    }
    
    return warnings;
}