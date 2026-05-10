const COLOR_DEFAULT = "#1c1c1e";
const COLOR_EXPLORED = "#3a3a3c";
const COLOR_FRONTIER = "#8e8e93";
const COLOR_PATH = "#f5f5f7";
const PADDING = 50;

function pathCost(nodeIds, graph) {
  let total = 0;
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const edge = graph.edges.find(
      (e) => e.from === nodeIds[i] && e.to === nodeIds[i + 1],
    );
    total += edge?.distance || 0;
  }
  return total;
}

function euclidean(a, b) {
  return Math.round(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
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

  const width = container.clientWidth || 800;
  const current = graphSolution[step];
  const goal = graph.goal;

  // Derive height from the data's natural aspect ratio so the neighbourhood
  // shape is preserved at every container width.
  const allNodes = Object.values(graph.nodes);
  const [xMin, xMax] = d3.extent(allNodes, (d) => d.x);
  const [yMin, yMax] = d3.extent(allNodes, (d) => d.y);
  const dataAspect = (xMax - xMin) / (yMax - yMin);
  const height = Math.round((width - 2 * PADDING) / dataAspect + 2 * PADDING);

  // Retina-sharp canvas
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

  // Background
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, width, height);

  // Scales
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
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const isOnPath = (link) =>
    current.bestPath.includes(link.source) &&
    current.bestPath.includes(link.target);

  const isOnFrontier = (link) =>
    (current.frontier.includes(link.target) &&
      current.explored.includes(link.source)) ||
    (current.frontier.includes(link.source) &&
      current.explored.includes(link.target));

  const isExploredLink = (link) =>
    current.explored.includes(link.source) &&
    current.explored.includes(link.target);

  // ── Edges — drawn in layer order so path always renders on top ─────────────

  const edgeLayers = [
    {
      test: (l) => !isOnPath(l) && !isExploredLink(l) && !isOnFrontier(l),
      color: COLOR_DEFAULT,
      lineWidth: 1,
      dash: [2, 4],
    },
    {
      test: (l) => isExploredLink(l) && !isOnPath(l),
      color: COLOR_EXPLORED,
      lineWidth: 1.5,
      dash: [],
    },
    {
      test: (l) => isOnFrontier(l) && !isOnPath(l),
      color: COLOR_FRONTIER,
      lineWidth: 2,
      dash: [2, 2],
    },
    { test: isOnPath, color: COLOR_PATH, lineWidth: 2, dash: [] },
  ];

  for (const layer of edgeLayers) {
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

  // ── Nodes — same layer order ────────────────────────────────────────────────

  const nodeLayer = (node) => {
    if (current.bestPath.includes(node.id)) return 3;
    if (current.frontier.includes(node.id)) return 2;
    if (current.explored.includes(node.id)) return 1;
    return 0;
  };

  const sortedNodes = [...nodes].sort((a, b) => nodeLayer(a) - nodeLayer(b));

  for (const node of sortedNodes) {
    const onPath = current.bestPath.includes(node.id);
    const onFrontier = current.frontier.includes(node.id);
    const explored = current.explored.includes(node.id);

    const radius = onPath ? 6 : onFrontier ? 5 : explored ? 4 : 3;
    const fillColor = onPath
      ? COLOR_PATH
      : explored
        ? COLOR_EXPLORED
        : onFrontier
          ? "#1e1e1e"
          : "#111111";
    const strokeColor = onPath
      ? "#000"
      : onFrontier
        ? COLOR_FRONTIER
        : explored
          ? "#161616"
          : COLOR_DEFAULT;
    const strokeWidth = onPath ? 1 : onFrontier ? 0.8 : 0.5;

    ctx.beginPath();
    ctx.setLineDash(onFrontier && !onPath ? [3, 2] : []);
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  ctx.setLineDash([]);
  ctx.font = "600 11px 'DM Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const lastNodeId = current.bestPath[current.bestPath.length - 1];

  for (const node of nodes) {
    const onPath = current.bestPath.includes(node.id);
    const onFrontier = current.frontier.includes(node.id);
    const isGoal = node.id === goal;

    if (!onPath && !onFrontier && !isGoal) continue;

    let label;
    if (node.id === lastNodeId) {
      const g = graph.nodes[goal];
      const h = euclidean({ x: node.rawX, y: node.rawY }, g);
      const gCost = pathCost(current.bestPath, graph);
      label = `(${gCost} + ${h} = ${gCost + h})`;
    } else if (onFrontier) {
      const idx = current.frontier.indexOf(node.id);
      label = `${current.frontierCost[idx]}`;
    } else {
      label = "";
    }

    const textColor = onPath
      ? COLOR_PATH
      : onFrontier
        ? COLOR_FRONTIER
        : "#4a4a4a";
    const labelY = node.y - 14;

    // Stroke first for legibility (replicates SVG paint-order: stroke fill)
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0d0d0d";
    ctx.strokeText(label, node.x, labelY);
    ctx.fillStyle = textColor;
    ctx.fillText(label, node.x, labelY);
  }
}
