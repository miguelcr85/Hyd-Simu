// ================================================================
// GRAFO DEL CIRCUITO - adyacencia puerto <-> conexion
// ================================================================
//
// Extraido 1:1 de js/app.js en la etapa E1. Dominio puro: no toca el DOM,
// por lo que puede usarse desde tests o desde cualquier otro consumidor.
// ================================================================

  /*
   * Build adjacency: for each component port, list all connections touching it.
   * Each connection gets: pressure, flow, flowDir (+1 = from→to, -1 = to→from, 0 = no flow)
   */
  export function buildAdjacency(connections) {
    var adj = {}; /* key = "compId:portIdx" → [{ connIdx, otherCompId, otherPortIdx }] */
    connections.forEach(function (conn, idx) {
      var fk = conn.from.compId + ':' + conn.from.portIdx;
      var tk = conn.to.compId + ':' + conn.to.portIdx;
      if (!adj[fk]) adj[fk] = [];
      if (!adj[tk]) adj[tk] = [];
      adj[fk].push({ connIdx: idx, otherCompId: conn.to.compId, otherPortIdx: conn.to.portIdx });
      adj[tk].push({ connIdx: idx, otherCompId: conn.from.compId, otherPortIdx: conn.from.portIdx });
    });
    return adj;
  }
