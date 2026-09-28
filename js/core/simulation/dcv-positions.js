// ================================================================
// POSICION DE VALVULAS DIRECCIONALES SEGUN COMANDO EXTERNO
// ================================================================
//
// Extraido 1:1 de js/app.js en la etapa E1. Traduce el parametro
// comp.values._externalCommand (p. ej. pilotaje por presion) en la posicion
// efectiva de la valvula antes de propagar el flujo.
// ================================================================

export function updateDcvPositions(components) {
    components.forEach(function(comp) {
        // Verificar si es una válvula de control direccional
        var isDCV = comp.type === 'dcv43' || comp.type === 'dcv42' || comp.type === 'dcv32' || 
                    comp.type === 'dcv32no' || comp.type === 'valve22' || comp.type === 'valve22no' || 
                    comp.type === 'dcv52' || comp.type === 'dcv53';
        
        if (isDCV && comp.values._externalCommand !== undefined) {
            var cmd = comp.values._externalCommand;
            
            // Actualizar según el tipo de válvula
            if (comp.type === 'dcv43' || comp.type === 'dcv53') {
                if (cmd > 10) {
                    comp.values.position = 'Extend';
                } else if (cmd < -10) {
                    comp.values.position = 'Retract';
                } else {
                    comp.values.position = 'Center';
                }
            } else if (comp.type === 'dcv42' || comp.type === 'dcv52') {
                comp.values.position = cmd > 0 ? 'Extend' : 'Retract';
            } else if (comp.type === 'dcv32' || comp.type === 'valve22') {
                comp.values.position = cmd > 0 ? 'Open' : 'Closed';
            } else if (comp.type === 'dcv32no' || comp.type === 'valve22no') {
                comp.values.position = cmd > 0 ? 'Shifted' : 'Normal';
            }
        }
    });
}
