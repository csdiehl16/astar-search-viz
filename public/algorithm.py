"""
A* Search Algorithm
graph_json_data: JSON string injected by Pyodide before this script runs.
result_json:     JSON string written by this script; read back by JavaScript.
"""

import json
import heapq


class Problem:
    def __init__(self, initial, goal=None):
        self.initial = initial
        self.goal = goal

    def actions(self, state):
        raise NotImplementedError

    def result(self, state, action):
        raise NotImplementedError

    def goal_test(self, state):
        if isinstance(self.goal, list):
            return state in self.goal
        return state == self.goal

    def path_cost(self, c, state1, action, state2):
        return c + 1


def distance(A, B):
    x1, y1 = A
    x2, y2 = B
    return ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5


class GraphProblem(Problem):
    def __init__(self, initial, goal, graph):
        super().__init__(initial, goal)
        self.graph = graph

    def actions(self, A):
        return list(self.graph.get(A).keys())

    def result(self, state, action):
        return action

    def path_cost(self, cost_so_far, A, action, B):
        return cost_so_far + (self.graph.get(A, B) or float("inf"))

    def find_min_edge(self):
        m = float("inf")
        for d in self.graph.graph_dict.values():
            local_min = min(d.values())
            m = min(m, local_min)
        return m

    def h(self, node):
        locs = getattr(self.graph, "locations", None)
        if locs:
            if type(node) is str:
                return int(distance(locs[node], locs[self.goal]))
            return int(distance(locs[node.state], locs[self.goal]))
        return float("inf")


class Graph:
    def __init__(self, graph_dict=None, directed=True):
        self.graph_dict = graph_dict or {}
        self.directed = directed
        if not directed:
            self.make_undirected()

    def make_undirected(self):
        for a in list(self.graph_dict.keys()):
            for b, dist in self.graph_dict[a].items():
                self.connect1(b, a, dist)

    def connect(self, A, B, distance=1):
        self.connect1(A, B, distance)
        if not self.directed:
            self.connect1(B, A, distance)

    def connect1(self, A, B, distance):
        self.graph_dict.setdefault(A, {})[B] = distance

    def get(self, a, b=None):
        links = self.graph_dict.setdefault(a, {})
        if b is None:
            return links
        return links.get(b)

    def nodes(self):
        s1 = set(self.graph_dict.keys())
        s2 = set(k2 for v in self.graph_dict.values() for k2 in v)
        return list(s1.union(s2))


def UndirectedGraph(graph_dict=None):
    return Graph(graph_dict=graph_dict, directed=False)


def load_graph_from_json_data(json_string):
    """Build a GraphProblem from the JSON string injected by JavaScript."""
    data = json.loads(json_string)

    graph_dict = {}
    for edge in data["edges"]:
        src, dst, dist = edge["from"], edge["to"], edge["distance"]
        graph_dict.setdefault(src, {})[dst] = dist

    graph = UndirectedGraph(graph_dict)

    if "nodes" in data:
        graph.locations = {
            name: (coords["x"], coords["y"])
            for name, coords in data["nodes"].items()
        }

    return GraphProblem(data["start"], data["goal"], graph)


class Node:
    def __init__(self, state, parent=None, action=None, path_cost=0):
        self.state = state
        self.parent = parent
        self.action = action
        self.path_cost = path_cost
        self.depth = 0 if parent is None else parent.depth + 1

    def __repr__(self):
        return f"<Node {self.state}>"

    def __lt__(self, node):
        return self.state < node.state

    def expand(self, problem):
        return [self.child_node(problem, action) for action in problem.actions(self.state)]

    def child_node(self, problem, action):
        next_state = problem.result(self.state, action)
        return Node(next_state, self, action,
                    problem.path_cost(self.path_cost, self.state, action, next_state))

    def solution(self):
        return [node.action for node in self.path()[1:]]

    def path(self):
        node, path_back = self, []
        while node:
            path_back.append(node)
            node = node.parent
        return list(reversed(path_back))

    def __eq__(self, other):
        return isinstance(other, Node) and self.state == other.state

    def __hash__(self):
        return hash(self.state)


class PriorityQueue:
    def __init__(self, order="min", f=lambda x: x):
        self._heap = []       # list of (priority, node)
        self._node_map = {}   # node → priority, for O(1) lookup
        self.eval = f
        self._counter = 0     # tiebreaker so Node objects are never compared directly

    def append(self, node):
        priority = self.eval(node)
        heapq.heappush(self._heap, (priority, self._counter, node))
        self._node_map[node] = priority
        self._counter += 1

    def pop(self):
        while self._heap:
            priority, _, node = heapq.heappop(self._heap)
            # Skip stale entries left behind by __delitem__
            if node in self._node_map and self._node_map[node] == priority:
                del self._node_map[node]
                return node
        raise IndexError("pop from empty PriorityQueue")

    def peek(self):
        return self._heap[0][2]

    def is_empty(self):
        return not self._node_map

    def __iter__(self):
        return (node for _, _, node in self._heap if node in self._node_map)

    def __contains__(self, item):
        return item in self._node_map

    def __delitem__(self, key):
        # Lazy deletion: mark as removed by clearing from node_map.
        # The stale heap entry is skipped in pop().
        del self._node_map[key]

    def __getitem__(self, key):
        if key in self._node_map:
            return self._node_map[key]
        raise KeyError(f"{key} is not in the frontier")


iterations = []


def track_progress(frontier, explored, node, f):
    iterations.append({
        "frontier": [s.state for s in frontier],
        "frontierCost": [f(s) for s in frontier],
        "explored": list(explored),
        "bestPath": [s.state for s in node.path()],
    })


def best_first_graph_search(problem, f):
    node = Node(problem.initial)
    frontier = PriorityQueue("min", f)
    frontier.append(node)
    explored = set()

    while frontier:
        node = frontier.pop()

        if problem.goal_test(node.state):
            track_progress(frontier, explored, node, f)
            return node

        explored.add(node.state)

        for child in node.expand(problem):
            if child.state not in explored and child not in frontier:
                frontier.append(child)
            elif child in frontier:
                if f(child) < frontier[child]:
                    del frontier[child]
                    frontier.append(child)

        track_progress(frontier, explored, node, f)

    return None


def astar_search(problem):
    return best_first_graph_search(problem, lambda n: n.path_cost + problem.h(n))


# graph_json_data is set by JavaScript via pyodide.globals.set() before running this script
problem = load_graph_from_json_data(graph_json_data)
astar_search(problem)

result_json = json.dumps(iterations)
