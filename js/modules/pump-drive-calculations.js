// ================================================================
// CÁLCULOS ESPECÍFICOS DE PUMP DRIVE
// ================================================================

export function getPumpDrivePerformanceValues(comp) {
    const values = {};
    const numOutputs = parseInt(comp.values?.numOutputs || '2');
    
    values.inputRPM = comp._inputRPM || 0;
    values.inputPower = comp._inputPower || 0;
    values.inputTorque = comp._inputTorque || 0;
    values.efficiency = comp.values?.efficiency || 92;
    values.maxInputSpeed = comp.values?.maxInputSpeed || 3000;
    values.maxOutputSpeed = comp.values?.maxOutputSpeed || 6000;
    values.maxTorque = comp.values?.maxTorque || 1500;
    
    // Salidas
    values.outputCount = numOutputs;
    for (let i = 1; i <= 3; i++) {
        values['output' + i + 'RPM'] = comp['_outputRPM' + i] || 0;
        values['output' + i + 'Power'] = comp['_outputPower' + i] || 0;
        values['output' + i + 'Torque'] = comp['_outputTorque' + i] || 0;
        values['output' + i + 'Ratio'] = comp['_outputRatio' + i] || 0;
    }
    
    values.totalDerating = comp._totalDerating || 1;
    values.totalRatio = 0;
    for (let i = 1; i <= numOutputs; i++) {
        values.totalRatio += comp['_outputRatio' + i] || 0;
    }
    
    return values;
}

export function getPumpDriveMetrics(comp) {
    const numOutputs = parseInt(comp.values?.numOutputs || '2');
    const metrics = {
        metrics: ['inputRPM', 'inputPower', 'inputTorque', 'efficiency', 'totalDerating'],
        labels: {
            inputRPM: 'RPM de entrada',
            inputPower: 'Potencia de entrada',
            inputTorque: 'Par de entrada',
            efficiency: 'Eficiencia',
            totalDerating: 'Factor de derating'
        },
        units: {
            inputRPM: 'RPM',
            inputPower: 'kW',
            inputTorque: 'Nm',
            efficiency: '%',
            totalDerating: ''
        }
    };
    
    // Añadir métricas para cada salida
    for (let i = 1; i <= numOutputs; i++) {
        metrics.metrics.push('output' + i + 'RPM', 'output' + i + 'Power', 'output' + i + 'Torque', 'output' + i + 'Ratio');
        metrics.labels['output' + i + 'RPM'] = 'Salida ' + i + ' RPM';
        metrics.labels['output' + i + 'Power'] = 'Salida ' + i + ' Potencia';
        metrics.labels['output' + i + 'Torque'] = 'Salida ' + i + ' Par';
        metrics.labels['output' + i + 'Ratio'] = 'Salida ' + i + ' Relación';
        metrics.units['output' + i + 'RPM'] = 'RPM';
        metrics.units['output' + i + 'Power'] = 'kW';
        metrics.units['output' + i + 'Torque'] = 'Nm';
        metrics.units['output' + i + 'Ratio'] = '';
    }
    
    return metrics;
}

export function getPumpDriveWarnings(comp) {
    const warnings = [];
    const numOutputs = parseInt(comp.values?.numOutputs || '2');
    const maxInputSpeed = comp.values?.maxInputSpeed || 3000;
    const maxOutputSpeed = comp.values?.maxOutputSpeed || 6000;
    const maxTorque = comp.values?.maxTorque || 1500;
    
    const inputRPM = comp._inputRPM || 0;
    const inputTorque = comp._inputTorque || 0;
    
    // Verificar RPM de entrada
    if (inputRPM > maxInputSpeed * 0.9) {
        warnings.push('⚠️ RPM de entrada alta (' + inputRPM.toFixed(0) + ' RPM) — cerca del límite');
    }
    
    // Verificar torque de entrada
    if (inputTorque > maxTorque * 0.9) {
        warnings.push('⚠️ Par de entrada alto (' + inputTorque.toFixed(0) + ' Nm) — cerca del límite');
    }
    
    // Verificar cada salida
    for (let i = 1; i <= numOutputs; i++) {
        const outputRPM = comp['_outputRPM' + i] || 0;
        const outputTorque = comp['_outputTorque' + i] || 0;
        const ratio = comp['_outputRatio' + i] || 0;
        
        if (outputRPM > maxOutputSpeed * 0.9) {
            warnings.push('⚠️ Salida ' + i + ' RPM alta (' + outputRPM.toFixed(0) + ' RPM)');
        }
        if (outputTorque > maxTorque * 0.9) {
            warnings.push('⚠️ Salida ' + i + ' par alto (' + outputTorque.toFixed(0) + ' Nm)');
        }
        if (ratio === 0 && numOutputs > 0) {
            warnings.push('⚠️ Salida ' + i + ' relación cero — verificar configuración');
        }
    }
    
    // Verificar derating
    const derating = comp._totalDerating || 1;
    if (derating < 0.8) {
        warnings.push('⚠️ Factor de derating bajo (' + (derating * 100).toFixed(0) + '%) — posible sobrecarga');
    }
    
    // Verificar eficiencia
    const efficiency = comp.values?.efficiency || 92;
    if (efficiency < 80) {
        warnings.push('⚠️ Eficiencia baja (' + efficiency + '%) — posibles pérdidas');
    }
    
    return warnings;
}