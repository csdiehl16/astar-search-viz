#!/usr/bin/env python3
"""
fetch_graph.py

Pull a neighborhood road network from OpenStreetMap via osmnx and write it as
a JSON graph compatible with the A* visualizer.

Usage:
    python fetch_graph.py "Marais" "Paris, France"
    python fetch_graph.py "Capitol Hill" "Seattle, Washington"
    python fetch_graph.py "Fitzrovia" "London, UK" --network drive

Output:
    data/<neighborhood>_<city>.json

Load in the visualizer:
    http://localhost:5173?graph=<neighborhood>_<city>
"""

import sys
import json
import random
import argparse
import os

try:
    import osmnx as ox
    import networkx as nx
except ImportError:
    print("Missing dependencies. Install with:")
    print("  pip install osmnx networkx")
    sys.exit(1)


def fetch_and_export(neighborhood, city, network_type="walk", seed=42):
    place = f"{neighborhood}, {city}"
    print(f"Fetching '{place}' ({network_type} network)…")

    G = ox.graph_from_place(place, network_type=network_type, simplify=True)
    G_proj = ox.project_graph(G)

    # Collapse MultiDiGraph → undirected simple graph, keeping minimum edge length
    G_simple = nx.Graph()
    for u, v, data in G_proj.edges(data=True):
        length = data.get("length", 1.0)
        if G_simple.has_edge(u, v):
            if length < G_simple[u][v]["length"]:
                G_simple[u][v]["length"] = length
        else:
            G_simple.add_edge(u, v, length=length)

    for node_id, data in G_proj.nodes(data=True):
        if node_id in G_simple.nodes:
            G_simple.nodes[node_id]["x"] = data["x"]
            G_simple.nodes[node_id]["y"] = data["y"]

    # Keep only the largest connected component
    largest_cc = max(nx.connected_components(G_simple), key=len)
    G_cc = G_simple.subgraph(largest_cc).copy()
    print(f"  {G_cc.number_of_nodes()} nodes, {G_cc.number_of_edges()} edges")

    # Pick start/goal as the two most-separated nodes from a random sample.
    # Sampling avoids an O(n²) search on large graphs.
    rng = random.Random(seed)
    candidates = rng.sample(list(G_cc.nodes()), min(60, G_cc.number_of_nodes()))
    max_dist, start_id, goal_id = 0.0, candidates[0], candidates[-1]
    for i, a in enumerate(candidates):
        for b in candidates[i + 1:]:
            ax, ay = G_cc.nodes[a]["x"], G_cc.nodes[a]["y"]
            bx, by = G_cc.nodes[b]["x"], G_cc.nodes[b]["y"]
            d = ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5
            if d > max_dist:
                max_dist, start_id, goal_id = d, a, b

    # Negate y so that north is up on the canvas (projected CRS has y increasing
    # northward, but canvas y increases downward).
    nodes = {
        str(nid): {"x": data["x"], "y": -data["y"]}
        for nid, data in G_cc.nodes(data=True)
    }
    edges = [
        {"from": str(u), "to": str(v), "distance": round(data["length"])}
        for u, v, data in G_cc.edges(data=True)
    ]

    return {
        "start": str(start_id),
        "goal":  str(goal_id),
        "nodes": nodes,
        "edges": edges,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Fetch an OSM neighborhood road network for the A* visualizer."
    )
    parser.add_argument("neighborhood", help='Neighborhood name, e.g. "Marais"')
    parser.add_argument("city",         help='City and country, e.g. "Paris, France"')
    parser.add_argument(
        "--network", default="walk", choices=["walk", "drive", "bike"],
        help="Road network type (default: walk)",
    )
    parser.add_argument(
        "--seed", type=int, default=42,
        help="Random seed for start/goal selection (default: 42)",
    )
    args = parser.parse_args()

    graph_data = fetch_and_export(
        args.neighborhood, args.city,
        network_type=args.network,
        seed=args.seed,
    )

    slug = (
        f"{args.neighborhood}_{args.city}"
        .lower()
        .replace(",", "")
        .replace(" ", "_")
    )
    out_dir  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "data")
    out_path = os.path.join(out_dir, f"{slug}.json")

    os.makedirs(out_dir, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(graph_data, f)

    stem = os.path.splitext(os.path.basename(out_path))[0]
    print(f"\n  Written → {out_path}")
    print(f"  Start:   {graph_data['start']}")
    print(f"  Goal:    {graph_data['goal']}")
    print(f"\nOpen in the visualizer:")
    print(f"  http://localhost:5173?graph={stem}")


if __name__ == "__main__":
    main()
