const COLOR_DEFAULT = "#1c1c1e";
const COLOR_EXPLORED = "#3a3a3c";
const COLOR_FRONTIER = "#8e8e93";
const COLOR_PATH = "#f5f5f7";
const PADDING = 50;

// Bidirectional — backward direction accent colours
const COLOR_BWD_EXPLORED = "#3a2518";
const COLOR_BWD_FRONTIER = "#c4956a";
const COLOR_BWD_PATH = "#e8a87c";

function drawCard(ctx, x, y, title, value, accentColor) {
  ctx.save();
  ctx.setLineDash([]);
  ctx.textAlign = "center";

  ctx.font = "700 8.5px 'DM Sans', sans-serif";
  const tw = ctx.measureText(title.toUpperCase()).width;
  ctx.font = "500 10px 'DM Sans', sans-serif";
  const vw = ctx.measureText(value).width;

  const padX = 10;
  const w = Math.max(tw, vw) + padX * 2;
  const h = 32;
  const rx = Math.round(x - w / 2);
  const ry = Math.round(y - h - 16);

  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(rx, ry, w, h, 4);
  else ctx.rect(rx, ry, w, h);
  ctx.fillStyle = "#000";
  ctx.fill();

  ctx.globalAlpha = 0.15;
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(rx, ry, w, h, 4);
  else ctx.rect(rx, ry, w, h);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.textBaseline = "top";
  ctx.font = "700 8.5px 'DM Sans', sans-serif";
  ctx.fillStyle = accentColor;
  ctx.fillText(title.toUpperCase(), x, ry + 6);

  ctx.font = "500 10px 'DM Sans', sans-serif";
  ctx.fillStyle = "#f5f5f7";
  ctx.fillText(value, x, ry + 18);

  ctx.restore();
}

function pathCost(nodeIds, graph) {
  let total = 0;
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const a = nodeIds[i], b = nodeIds[i + 1];
    const edge = graph.edges.find(
      (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a),
    );
    total += edge?.distance || 0;
  }
  return total;
}

function euclidean(a, b) {
  return Math.round(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
}

function buildCanvas(container, graph) {
  const width = container.clientWidth || 800;
  const allNodes = Object.values(graph.nodes);
  const [xMin, xMax] = d3.extent(allNodes, (d) => d.x);
  const [yMin, yMax] = d3.extent(allNodes, (d) => d.y);
  const dataAspect = (xMax - xMin) / (yMax - yMin);
  const height = Math.round((width - 2 * PADDING) / dataAspect + 2 * PADDING);

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.display = "block";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, width, height);

  const xScale = d3.scaleLinear([xMin, xMax], [PADDING, width - PADDING]);
  const yScale = d3.scaleLinear([yMin, yMax], [PADDING, height - PADDING]);

  const nodes = Object.entries(graph.nodes).map(([name, coords]) => ({
    id: name,
    x: xScale(coords.x),
    y: yScale(coords.y),
    rawX: coords.x,
    rawY: coords.y,
  }));

  const links = graph.edges.map((e) => ({
    source: e.from,
    target: e.to,
    distance: e.distance,
  }));

  return { ctx, width, height, nodes, links, nodeById: Object.fromEntries(nodes.map((n) => [n.id, n])) };
}

function drawEdgeLayers(ctx, links, nodeById, layers) {
  for (const layer of layers) {
    ctx.setLineDash(layer.dash);
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = layer.lineWidth;
    for (const link of links) {
      if (!layer.test(link)) continue;
      const src = nodeById[link.source];
      const tgt = nodeById[link.target];
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();
    }
  }
}

/**
 * Renders one step of the A* search into `container` using Canvas 2D.
 *
 * @param {HTMLElement} container     - DOM element to render into
 * @param {object}      graph         - graph JSON (nodes, edges, goal)
 * @param {object[]}    graphSolution - array of step snapshots from the algorithm
 * @param {number}      step          - index into graphSolution
 */
export function renderStep(container, graph, graphSolution, step) {
  container.innerHTML = "";
  const current = graphSolution[step];
  const goal = graph.goal;
  const { ctx, nodes, links, nodeById } = buildCanvas(container, graph);

  const isOnPath = (l) =>
    current.bestPath.includes(l.source) && current.bestPath.includes(l.target);
  const isOnFrontier = (l) =>
    (current.frontier.includes(l.target) && current.explored.includes(l.source)) ||
    (current.frontier.includes(l.source) && current.explored.includes(l.target));
  const isExploredLink = (l) =>
    current.explored.includes(l.source) && current.explored.includes(l.target);

  drawEdgeLayers(ctx, links, nodeById, [
    { test: (l) => !isOnPath(l) && !isExploredLink(l) && !isOnFrontier(l), color: COLOR_DEFAULT,  lineWidth: 1,   dash: [2, 4] },
    { test: (l) => isExploredLink(l) && !isOnPath(l),                       color: COLOR_EXPLORED, lineWidth: 1.5, dash: []     },
    { test: (l) => isOnFrontier(l) && !isOnPath(l),                         color: COLOR_FRONTIER, lineWidth: 2,   dash: [2, 2] },
    { test: isOnPath,                                                         color: COLOR_PATH,     lineWidth: 2,   dash: []     },
  ]);

  // ── Nodes ──────────────────────────────────────────────────────────────────
  const nodeLayer = (n) => {
    if (current.bestPath.includes(n.id)) return 3;
    if (current.frontier.includes(n.id)) return 2;
    if (current.explored.includes(n.id)) return 1;
    return 0;
  };
  const sortedNodes = [...nodes].sort((a, b) => nodeLayer(a) - nodeLayer(b));

  for (const node of sortedNodes) {
    const onPath = current.bestPath.includes(node.id);
    const onFrontier = current.frontier.includes(node.id);
    const explored = current.explored.includes(node.id);

    const radius = onPath ? 6 : onFrontier ? 5 : explored ? 4 : 3;
    const fillColor = onPath ? COLOR_PATH : explored ? COLOR_EXPLORED : onFrontier ? "#1e1e1e" : "#111111";
    const strokeColor = onPath ? "#000" : onFrontier ? COLOR_FRONTIER : explored ? "#161616" : COLOR_DEFAULT;

    ctx.beginPath();
    ctx.setLineDash(onFrontier && !onPath ? [3, 2] : []);
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = onPath ? 1 : onFrontier ? 0.8 : 0.5;
    ctx.stroke();
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  ctx.setLineDash([]);
  ctx.font = "600 11px 'DM Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const bestPathEndId = current.bestPath.length ? current.bestPath[current.bestPath.length - 1] : null;
  const minFrontierCost = current.frontierCost.length ? Math.min(...current.frontierCost) : null;
  const nextBestIdx = minFrontierCost !== null ? current.frontierCost.indexOf(minFrontierCost) : -1;
  const nextBestId = nextBestIdx >= 0 ? current.frontier[nextBestIdx] : null;

  const frontierColorScale = d3.scaleQuantile()
    .domain(current.frontierCost)
    .range(["#d4d4d7", "#a8a8ac", "#7c7c80", "#555558", "#333336"]);

  // Regular +X labels for non-card frontier nodes
  for (const node of nodes) {
    if (!current.frontier.includes(node.id)) continue;
    if (node.id === nextBestId) continue;
    const cost = current.frontierCost[current.frontier.indexOf(node.id)];
    const label = `+${cost - minFrontierCost}`;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0d0d0d";
    ctx.strokeText(label, node.x, node.y - 14);
    ctx.fillStyle = frontierColorScale(cost);
    ctx.fillText(label, node.x, node.y - 14);
  }

  // Cards — drawn last so they sit above all other labels
  if (nextBestId) {
    const n = nodeById[nextBestId];
    if (n) drawCard(ctx, n.x, n.y, "Next best", String(minFrontierCost), COLOR_FRONTIER);
  }
  if (bestPathEndId) {
    const n = nodeById[bestPathEndId];
    if (n) {
      const goalNode = graph.nodes[goal];
      const h = euclidean({ x: n.rawX, y: n.rawY }, goalNode);
      const gCost = pathCost(current.bestPath, graph);
      drawCard(ctx, n.x, n.y, "Best path", `${gCost} + ${h} = ${gCost + h}`, COLOR_PATH);
    }
  }
}

/**
 * Renders one step of the bidirectional A* search into `container`.
 * `step` is an index into `bidirSolution`, where each entry has:
 *   forwardFrontier / forwardFrontierCost / forwardExplored
 *   backwardFrontier / backwardFrontierCost / backwardExplored
 *   bestPath
 */
export function renderBidirStep(container, graph, bidirSolution, step) {
  container.innerHTML = "";
  const cur = bidirSolution[step];
  const { ctx, nodes, links, nodeById } = buildCanvas(container, graph);

  const fwdExp     = new Set(cur.forwardExplored);
  const bwdExp     = new Set(cur.backwardExplored);
  const fwdFrt     = new Set(cur.forwardFrontier);
  const bwdFrt     = new Set(cur.backwardFrontier);
  const fwdPathSet = new Set(cur.forwardBestPath);
  const bwdPathSet = new Set(cur.backwardBestPath);

  const isOnFwdPath = (l) => fwdPathSet.has(l.source) && fwdPathSet.has(l.target);
  const isOnBwdPath = (l) => bwdPathSet.has(l.source) && bwdPathSet.has(l.target);
  const isOnEitherPath = (l) => isOnFwdPath(l) || isOnBwdPath(l);
  const isFwdFrtEdge = (l) =>
    (fwdExp.has(l.source) && fwdFrt.has(l.target)) ||
    (fwdExp.has(l.target) && fwdFrt.has(l.source));
  const isBwdFrtEdge = (l) =>
    (bwdExp.has(l.source) && bwdFrt.has(l.target)) ||
    (bwdExp.has(l.target) && bwdFrt.has(l.source));
  const isFwdExpEdge = (l) => fwdExp.has(l.source) && fwdExp.has(l.target);
  const isBwdExpEdge = (l) => bwdExp.has(l.source) && bwdExp.has(l.target);

  drawEdgeLayers(ctx, links, nodeById, [
    { test: (l) => !isOnEitherPath(l) && !isFwdExpEdge(l) && !isBwdExpEdge(l) && !isFwdFrtEdge(l) && !isBwdFrtEdge(l),
      color: COLOR_DEFAULT,      lineWidth: 1,   dash: [2, 4] },
    { test: (l) => isFwdExpEdge(l) && !isOnEitherPath(l),
      color: COLOR_EXPLORED,     lineWidth: 1.5, dash: []     },
    { test: (l) => isBwdExpEdge(l) && !isOnEitherPath(l),
      color: COLOR_BWD_EXPLORED, lineWidth: 1.5, dash: []     },
    { test: (l) => isFwdFrtEdge(l) && !isOnEitherPath(l),
      color: COLOR_FRONTIER,     lineWidth: 2,   dash: [2, 2] },
    { test: (l) => isBwdFrtEdge(l) && !isOnEitherPath(l),
      color: COLOR_BWD_FRONTIER, lineWidth: 2,   dash: [2, 2] },
    { test: (l) => isOnBwdPath(l) && !isOnFwdPath(l),
      color: COLOR_BWD_PATH,     lineWidth: 2,   dash: []     },
    { test: isOnFwdPath,
      color: COLOR_PATH,         lineWidth: 2,   dash: []     },
  ]);

  // ── Nodes ──────────────────────────────────────────────────────────────────
  const nodeLayer = (n) => {
    if (fwdPathSet.has(n.id)) return 6;
    if (bwdPathSet.has(n.id)) return 5;
    if (fwdFrt.has(n.id))     return 4;
    if (bwdFrt.has(n.id))     return 3;
    if (fwdExp.has(n.id))     return 2;
    if (bwdExp.has(n.id))     return 1;
    return 0;
  };
  const sortedNodes = [...nodes].sort((a, b) => nodeLayer(a) - nodeLayer(b));

  for (const node of sortedNodes) {
    const onFwdPath = fwdPathSet.has(node.id);
    const onBwdPath = bwdPathSet.has(node.id);
    const isFwdFrt  = fwdFrt.has(node.id);
    const isBwdFrt  = bwdFrt.has(node.id);
    const isFwdExp  = fwdExp.has(node.id);
    const isBwdExp  = bwdExp.has(node.id);

    const radius = (onFwdPath || onBwdPath) ? 6 : (isFwdFrt || isBwdFrt) ? 5 : (isFwdExp || isBwdExp) ? 4 : 3;

    let fillColor, strokeColor;
    if (onFwdPath) {
      fillColor = COLOR_PATH; strokeColor = "#000";
    } else if (onBwdPath) {
      fillColor = COLOR_BWD_PATH; strokeColor = "#000";
    } else if (isFwdFrt) {
      fillColor = "#1e1e1e"; strokeColor = COLOR_FRONTIER;
    } else if (isBwdFrt) {
      fillColor = "#1e1510"; strokeColor = COLOR_BWD_FRONTIER;
    } else if (isFwdExp && isBwdExp) {
      fillColor = "#4a3a2a"; strokeColor = "#5a4a3a";
    } else if (isFwdExp) {
      fillColor = COLOR_EXPLORED; strokeColor = "#161616";
    } else if (isBwdExp) {
      fillColor = COLOR_BWD_EXPLORED; strokeColor = "#2a1a10";
    } else {
      fillColor = "#111111"; strokeColor = COLOR_DEFAULT;
    }

    const onAnyPath = onFwdPath || onBwdPath;
    const dash = (isFwdFrt || isBwdFrt) && !onAnyPath ? [3, 2] : [];
    ctx.beginPath();
    ctx.setLineDash(dash);
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = onAnyPath ? 1 : (isFwdFrt || isBwdFrt) ? 0.8 : 0.5;
    ctx.stroke();
  }

  // ── Labels — show f-costs for frontier nodes ───────────────────────────────
  ctx.setLineDash([]);
  ctx.font = "600 11px 'DM Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const fwdTopCost = cur.forwardFrontierCost.length  ? Math.min(...cur.forwardFrontierCost)  : Infinity;
  const bwdTopCost = cur.backwardFrontierCost.length ? Math.min(...cur.backwardFrontierCost) : Infinity;
  // Algorithm expands fwd when fwd_min <= bwd_min
  const nextIsFwd  = fwdTopCost <= bwdTopCost;
  const fwdTopIdx  = isFinite(fwdTopCost) ? cur.forwardFrontierCost.indexOf(fwdTopCost)   : -1;
  const bwdTopIdx  = isFinite(bwdTopCost) ? cur.backwardFrontierCost.indexOf(bwdTopCost) : -1;
  const fwdTopId   = fwdTopIdx >= 0 ? cur.forwardFrontier[fwdTopIdx]   : null;
  const bwdTopId   = bwdTopIdx >= 0 ? cur.backwardFrontier[bwdTopIdx] : null;
  const nextBestId = nextIsFwd ? fwdTopId : bwdTopId;

  const fwdPathEndId = cur.forwardBestPath.length  ? cur.forwardBestPath[cur.forwardBestPath.length - 1]   : null;
  const bwdPathEndId = cur.backwardBestPath.length ? cur.backwardBestPath[cur.backwardBestPath.length - 1] : null;

  // Regular +X labels — skip nodes that will get cards
  const cardIds = new Set([nextBestId, fwdPathEndId, bwdPathEndId].filter(Boolean));

  const fwdColorScale = d3.scaleQuantile()
    .domain(cur.forwardFrontierCost)
    .range(["#d4d4d7", "#a8a8ac", "#7c7c80", "#555558", "#333336"]);
  const bwdColorScale = d3.scaleQuantile()
    .domain(cur.backwardFrontierCost)
    .range(["#e8c4a0", "#c4956a", "#9a6a44", "#704428", "#4a2810"]);

  for (const node of nodes) {
    const isFwdFrt = fwdFrt.has(node.id);
    const isBwdFrt = bwdFrt.has(node.id);
    if (!isFwdFrt && !isBwdFrt) continue;
    if (cardIds.has(node.id)) continue;

    let label = "", color = COLOR_FRONTIER;
    if (isFwdFrt) {
      const cost = cur.forwardFrontierCost[cur.forwardFrontier.indexOf(node.id)];
      label = `+${cost - fwdTopCost}`;
      color = fwdColorScale(cost);
    } else {
      const cost = cur.backwardFrontierCost[cur.backwardFrontier.indexOf(node.id)];
      label = `+${cost - bwdTopCost}`;
      color = bwdColorScale(cost);
    }

    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0d0d0d";
    ctx.strokeText(label, node.x, node.y - 14);
    ctx.fillStyle = color;
    ctx.fillText(label, node.x, node.y - 14);
  }

  // Cards — drawn last so they sit above all other labels
  if (nextBestId) {
    const n = nodeById[nextBestId];
    const cost = nextIsFwd ? fwdTopCost : bwdTopCost;
    const color = nextIsFwd ? COLOR_FRONTIER : COLOR_BWD_FRONTIER;
    if (n) drawCard(ctx, n.x, n.y, "Next best", String(cost), color);
  }
  if (fwdPathEndId) {
    const n = nodeById[fwdPathEndId];
    if (n) {
      const goalNode = graph.nodes[graph.goal];
      const h = euclidean({ x: n.rawX, y: n.rawY }, goalNode);
      const gCost = pathCost(cur.forwardBestPath, graph);
      drawCard(ctx, n.x, n.y, "Fwd path", `${gCost} + ${h} = ${gCost + h}`, COLOR_PATH);
    }
  }
  if (bwdPathEndId && bwdPathEndId !== fwdPathEndId) {
    const n = nodeById[bwdPathEndId];
    if (n) {
      const startNode = graph.nodes[graph.start];
      const h = euclidean({ x: n.rawX, y: n.rawY }, startNode);
      const gCost = pathCost(cur.backwardBestPath, graph);
      drawCard(ctx, n.x, n.y, "Bwd path", `${gCost} + ${h} = ${gCost + h}`, COLOR_BWD_PATH);
    }
  }
}
