import { C, arrowAt, box, caption, cellRow, group, link, node, step } from "@/lib/simulation/compose";
import type { CanvasElement, DifficultyLevel, ProblemSet, SimulationStep } from "@/lib/types";

export interface FeaturedSimulation {
  slug: string;
  title: string;
  subject: string;
  difficulty: "Easy" | "Medium" | "Hard";
  blurb: string;
  steps: SimulationStep[];
  problems: Record<DifficultyLevel, Array<{ question: string; choices: string[]; answer: string; explanation: string }>>;
}

/* ───────────────────────── 1. Binary search (DSA · Easy) ───────────────────────── */

const SORTED = [3, 8, 12, 17, 23, 31, 42, 56, 64];

function searchFrame(
  left: number,
  right: number,
  mid: number | null,
  options: { found?: boolean; note: string }
): CanvasElement[] {
  const row = cellRow("c", SORTED, {
    y: 36,
    h: 15,
    colors: (i) =>
      i < left || i > right ? C.muted : i === mid ? (options.found ? C.mint : C.signal) : C.cyan,
    delay: (i) => i * 40
  });
  const pointer = (id: string, index: number, label: string, color: string, delay: number, offset = 0) => {
    const x = row.centers[index] - 3.5 + offset;
    return [box(id, x, 70, 7, 9, label, { color, delay }), link(id, row.ids[index], { color, delay: delay + 100 })];
  };
  const elements: CanvasElement[] = [caption(options.note, { y: 10, w: 80, color: C.slate }), ...row.elements];
  // index numbers under the cells
  row.centers.forEach((cx, i) =>
    elements.push({ type: "text", x: cx - 1.5, y: 54, width: 4, height: 5, label: String(i), color: C.slate, animation: { type: "fade_in", duration: 300, delay: 200 } })
  );
  if (left === right && mid === left) {
    elements.push(...pointer("pm", mid, "L=M=R", options.found ? C.mint : C.signal, 600));
  } else {
    elements.push(...pointer("pl", left, "L", C.violet, 500));
    elements.push(...pointer("pr", right, "R", C.violet, 700));
    if (mid !== null) elements.push(...pointer("pm", mid, "M", options.found ? C.mint : C.signal, 1100));
  }
  return elements;
}

const binarySearch: FeaturedSimulation = {
  slug: "binary-search",
  title: "Binary search",
  subject: "Data structures & algorithms",
  difficulty: "Easy",
  blurb: "Find a value in a sorted list by halving the search range each time.",
  steps: [
    step(
      1,
      "A sorted list",
      "Here are nine numbers in sorted order, and we want to find 56. A simple search would check them one by one. Binary search uses the sorted order to throw away half of the list with every check.",
      searchFrame(0, 8, null, { note: "Goal: find 56 in a sorted list" })
    ),
    step(
      2,
      "Check the middle",
      "We start with the whole list, so left is index 0 and right is index 8. The middle is index 4, which holds 23. Because 56 is bigger than 23, it can only be in the right half.",
      searchFrame(0, 8, 4, { note: "middle = (0 + 8) / 2 = 4  →  23 < 56, go right" })
    ),
    step(
      3,
      "Discard the left half",
      "Everything up to index 4 is now ignored, and left moves to index 5. The new middle is index 6, which holds 42. Since 42 is still smaller than 56, we move right again.",
      searchFrame(5, 8, 6, { note: "middle = (5 + 8) / 2 = 6  →  42 < 56, go right" })
    ),
    step(
      4,
      "Found it",
      "Now left is index 7 and right is index 8, so the middle is index 7. It holds 56, which is our target. We found it after only three checks instead of eight.",
      searchFrame(7, 8, 7, { found: true, note: "middle = (7 + 8) / 2 = 7  →  56 found" })
    ),
    step(
      5,
      "Why it's fast",
      "Each check halves the remaining range, so the number of checks grows with the logarithm of the list size. Nine items need at most four checks. A million items need only about twenty.",
      [
        caption("Checks needed to find 56", { y: 10 }),
        box("lin", 8, 30, 64, 14, "Linear search: 8 checks", { color: C.slate, delay: 200 }),
        box("bin", 8, 54, 24, 14, "Binary: 3 checks", { color: C.mint, delay: 700 }),
        box("big", 8, 78, 40, 12, "1,000,000 items → about 20 checks", { color: C.violet, delay: 1400 })
      ]
    )
  ],
  problems: {
    beginner: [
      { question: "What must be true about a list before binary search can be used?", choices: ["It must be sorted", "It must have an even length", "It must contain no zeros", "It must be stored in a tree"], answer: "It must be sorted", explanation: "Binary search decides which half to keep by comparing with the middle, which only works when the list is in order." },
      { question: "In the list [3, 8, 12, 17, 23], which value is checked first?", choices: ["3", "12", "17", "23"], answer: "12", explanation: "The middle index of 0 to 4 is 2, which holds 12." },
      { question: "If the middle value is smaller than the target, where do we search next?", choices: ["The left half", "The right half", "Both halves", "We stop"], answer: "The right half", explanation: "Everything left of a smaller middle value is also smaller, so the target can only be on the right." }
    ],
    intermediate: [
      { question: "What is the time complexity of binary search on n items?", choices: ["O(n)", "O(log n)", "O(n log n)", "O(1)"], answer: "O(log n)", explanation: "Each step halves the range, so it takes about log₂(n) steps." },
      { question: "About how many checks does binary search need for 1,024 items in the worst case?", choices: ["10 or 11", "32", "512", "1,024"], answer: "10 or 11", explanation: "log₂(1024) = 10, plus at most one final check." },
      { question: "Why is mid = left + (right - left) / 2 preferred over (left + right) / 2 in some languages?", choices: ["It avoids integer overflow", "It is always faster", "It rounds up", "It handles negative numbers"], answer: "It avoids integer overflow", explanation: "left + right can exceed the maximum integer for very large arrays; the subtraction form cannot." }
    ],
    advanced: [
      { question: "To find the first occurrence of a value with duplicates, what should you do when nums[mid] equals the target?", choices: ["Return mid immediately", "Record mid and keep searching the left half", "Search the right half", "Switch to linear search"], answer: "Record mid and keep searching the left half", explanation: "An earlier copy may exist to the left, so narrow right = mid - 1 while remembering the match." },
      { question: "Binary search on a linked list is slow mainly because…", choices: ["Finding the middle node takes O(n)", "Linked lists can't be sorted", "Comparisons are slower", "It needs extra memory"], answer: "Finding the middle node takes O(n)", explanation: "Without random access, reaching the middle means walking the list, which removes the advantage." },
      { question: "'Binary search on the answer' works when…", choices: ["The condition being tested is monotonic", "The input is a binary tree", "Values are powers of two", "The array has no duplicates"], answer: "The condition being tested is monotonic", explanation: "If 'is x feasible?' flips from false to true only once, you can binary search for the boundary." }
    ]
  }
};

/* ──────────────────────── 2. Binary search tree (DSA · Medium) ──────────────────────── */

const R = 5.5;
const BST_POS: Record<number, [number, number]> = {
  50: [50, 24],
  30: [28, 46],
  70: [72, 46],
  20: [17, 68],
  40: [39, 68],
  60: [61, 68],
  80: [83, 68],
  65: [70, 88]
};
const BST_EDGES: Array<[number, number]> = [
  [50, 30],
  [50, 70],
  [30, 20],
  [30, 40],
  [70, 60],
  [70, 80],
  [60, 65]
];

function tree(
  values: number[],
  options: { color?: (v: number) => string; edgeColor?: (a: number, b: number) => string; edges?: Array<[number, number]>; fade?: number[]; pos?: Record<number, [number, number]> } = {}
): CanvasElement[] {
  const pos = options.pos ?? BST_POS;
  const present = new Set(values);
  // Removed nodes stay visible briefly, then fade out together with the edge to their parent.
  const FADE_AT = 1600;
  const fading = (v: number) => options.fade?.includes(v) ?? false;
  const nodes = values.map((v, i) => {
    const element = node(`n${v}`, pos[v][0], pos[v][1], R, String(v), {
      color: options.color?.(v) ?? C.cyan,
      delay: i * 90,
      animation: "scale_up"
    });
    if (fading(v)) element.animation = { type: "fade_out", duration: 700, delay: FADE_AT };
    return element;
  });
  const edges = (options.edges ?? BST_EDGES)
    .filter(([a, b]) => present.has(a) && present.has(b))
    .map(([a, b]) => {
      const edge = link(`n${a}`, `n${b}`, { arrow: false, color: options.edgeColor?.(a, b) ?? C.slate });
      if (fading(a) || fading(b)) edge.animation = { type: "fade_out", duration: 700, delay: FADE_AT };
      return edge;
    });
  return [...edges, ...nodes];
}

const BASE = [50, 30, 70, 20, 40, 60, 80];

const bst: FeaturedSimulation = {
  slug: "binary-search-tree",
  title: "Binary search trees",
  subject: "Data structures & algorithms",
  difficulty: "Medium",
  blurb: "Search, insert and delete in a tree that keeps smaller values left and larger values right.",
  steps: [
    step(
      1,
      "The BST rule",
      "A binary search tree keeps every value in a node's left subtree smaller, and every value in its right subtree larger. Here the root is 50, with 30 on the left and 70 on the right. That single rule makes searching fast.",
      [caption("left < node < right, at every node", { y: 8 }), ...tree(BASE)]
    ),
    step(
      2,
      "Search for 40",
      "To find 40, we start at the root. 40 is less than 50, so we go left to 30. 40 is greater than 30, so we go right and land on 40, after visiting only three nodes.",
      [
        caption("40 < 50 → left,  40 > 30 → right", { y: 8 }),
        ...tree(BASE, {
          color: (v) => (v === 40 ? C.mint : v === 50 || v === 30 ? C.signal : C.cyan),
          edgeColor: (a, b) => ((a === 50 && b === 30) || (a === 30 && b === 40) ? C.signal : C.slate)
        })
      ]
    ),
    step(
      3,
      "Insert 65",
      "Inserting follows the same path a search would. 65 is greater than 50, so go right to 70. It is less than 70, so go left to 60, and greater than 60, so it becomes 60's new right child.",
      [
        caption("65 > 50 → right,  65 < 70 → left,  65 > 60 → right", { y: 8 }),
        ...tree([...BASE, 65], {
          color: (v) => (v === 65 ? C.mint : v === 50 || v === 70 || v === 60 ? C.signal : C.cyan),
          edgeColor: (a, b) => ((a === 50 && b === 70) || (a === 70 && b === 60) || (a === 60 && b === 65) ? C.signal : C.slate)
        })
      ]
    ),
    step(
      4,
      "Delete a leaf",
      "Deleting a leaf is the easy case. 20 has no children, so we simply remove it and nothing else in the tree has to change. The ordering rule still holds everywhere.",
      [caption("20 has no children → just remove it", { y: 8 }), ...tree([...BASE, 65], { color: (v) => (v === 20 ? C.signal : C.cyan), fade: [20] })]
    ),
    step(
      5,
      "Delete a node with two children",
      "Deleting 70 is harder because it has two children. We replace it with its in-order successor, the smallest value in its right subtree, which is 80. Moving 80 up keeps everything on the left smaller and everything on the right larger.",
      [
        caption("successor of 70 = smallest value in its right subtree = 80", { y: 8, w: 85 }),
        ...tree([50, 30, 70, 40, 60, 80, 65], { color: (v) => (v === 70 ? C.signal : v === 80 ? C.mint : C.cyan) }),
        link("n80", "n70", { curved: true, color: C.mint, label: "replaces", delay: 1200 })
      ]
    ),
    step(
      6,
      "Why balance matters",
      "After the swap, 80 sits where 70 was and 60 hangs on its left. Every operation walks one path from the root, so its cost is the tree's height. A balanced tree keeps that near log n, while values inserted in sorted order would make a slow, list-like chain.",
      [
        caption("cost of search, insert and delete = height of the tree", { y: 8, w: 80 }),
        ...tree([50, 30, 80, 40, 60, 65], {
          pos: { 50: [50, 24], 30: [28, 46], 80: [72, 46], 40: [39, 68], 60: [61, 68], 65: [70, 88] },
          edges: [[50, 30], [50, 80], [30, 40], [80, 60], [60, 65]],
          color: (v) => (v === 80 ? C.mint : C.cyan)
        })
      ]
    )
  ],
  problems: {
    beginner: [
      { question: "In a BST, where are values smaller than a node stored?", choices: ["In its left subtree", "In its right subtree", "Anywhere", "Only at the root"], answer: "In its left subtree", explanation: "The BST property puts smaller keys on the left and larger keys on the right." },
      { question: "Searching for 60 in the tree from this lesson visits which nodes?", choices: ["50, 70, 60", "50, 30, 60", "60 only", "50, 60"], answer: "50, 70, 60", explanation: "60 > 50 goes right to 70, then 60 < 70 goes left to 60." },
      { question: "Which node is easiest to delete?", choices: ["A leaf", "The root", "A node with two children", "They are all the same"], answer: "A leaf", explanation: "A leaf has no children, so it can be removed without reconnecting anything." }
    ],
    intermediate: [
      { question: "What is the in-order successor of a node with two children?", choices: ["The smallest value in its right subtree", "Its parent", "The largest value in its left subtree only", "Its left child"], answer: "The smallest value in its right subtree", explanation: "It's the next larger key, found by going right once, then left as far as possible." },
      { question: "An in-order traversal of a BST outputs values…", choices: ["In sorted order", "In insertion order", "Level by level", "In random order"], answer: "In sorted order", explanation: "Left subtree, node, right subtree visits keys from smallest to largest." },
      { question: "Inserting 1, 2, 3, 4, 5 in order into an empty BST produces…", choices: ["A chain of height 5", "A perfectly balanced tree", "A tree of height 2", "An error"], answer: "A chain of height 5", explanation: "Each new key is larger than all others, so it always goes right, forming a linked list." }
    ],
    advanced: [
      { question: "Worst-case search time in an unbalanced BST with n nodes is…", choices: ["O(n)", "O(log n)", "O(1)", "O(n log n)"], answer: "O(n)", explanation: "A degenerate, chain-shaped tree has height n." },
      { question: "AVL and red-black trees guarantee O(log n) operations by…", choices: ["Rotating nodes to keep the height bounded", "Storing values in an array", "Hashing keys", "Limiting the tree to 1,000 nodes"], answer: "Rotating nodes to keep the height bounded", explanation: "Rotations after inserts and deletes keep the height logarithmic." },
      { question: "Deleting a node with one child requires…", choices: ["Linking its parent directly to its child", "Finding the in-order successor", "Rebuilding the whole tree", "Nothing, just remove it"], answer: "Linking its parent directly to its child", explanation: "The child takes the deleted node's place, which preserves the ordering." }
    ]
  }
};

/* ─────────────────────── 3. Dijkstra's shortest path (DSA · Hard) ─────────────────────── */

const G_POS: Record<string, [number, number]> = {
  A: [8, 50],
  B: [26, 22],
  C: [26, 78],
  D: [46, 22],
  E: [46, 78],
  F: [62, 50]
};
const G_EDGES: Array<[string, string, number]> = [
  ["A", "B", 4],
  ["A", "C", 2],
  ["C", "B", 1],
  ["B", "D", 5],
  ["C", "E", 10],
  ["D", "E", 3],
  ["D", "F", 2],
  ["E", "F", 6]
];

function dijkstraFrame(options: {
  dist: Record<string, string>;
  done: string[];
  current?: string;
  hotEdges?: string[];
  pathEdges?: string[];
  note: string;
}): CanvasElement[] {
  const elements: CanvasElement[] = [caption(options.note, { y: 6, w: 66 })];
  for (const [a, b, w] of G_EDGES) {
    const key = `${a}${b}`;
    const color = options.pathEdges?.includes(key) ? C.mint : options.hotEdges?.includes(key) ? C.signal : C.slate;
    elements.push(link(`g${a}`, `g${b}`, { arrow: false, label: String(w), color }));
  }
  Object.entries(G_POS).forEach(([name, [x, y]], i) => {
    const color = name === options.current ? C.signal : options.done.includes(name) ? C.mint : C.cyan;
    elements.push(node(`g${name}`, x, y, 5.5, name, { color, delay: i * 70 }));
  });
  // distance table
  elements.push({ type: "text", x: 74, y: 9, width: 22, height: 5, label: "shortest distance from A", color: C.slate, animation: { type: "fade_in", duration: 400, delay: 0 } });
  Object.keys(G_POS).forEach((name, i) => {
    const value = options.dist[name] ?? "∞";
    const color = name === options.current ? C.signal : options.done.includes(name) ? C.mint : value === "∞" ? C.muted : C.violet;
    elements.push(box(`t${name}`, 76, 18 + i * 12.5, 20, 9.5, `${name}   ${value}`, { color, delay: 300 + i * 60 }));
  });
  return elements;
}

const dijkstra: FeaturedSimulation = {
  slug: "dijkstra",
  title: "Dijkstra's shortest path",
  subject: "Data structures & algorithms",
  difficulty: "Hard",
  blurb: "Find the cheapest route from one node to every other node in a weighted graph.",
  steps: [
    step(
      1,
      "The problem",
      "We want the cheapest route from A to every other node, where each edge has a cost. Dijkstra's algorithm starts by setting A's distance to zero and every other distance to infinity, because we haven't found any routes yet.",
      dijkstraFrame({ dist: { A: "0" }, done: [], note: "start: A = 0, everything else = ∞" })
    ),
    step(
      2,
      "Visit A",
      "We visit the closest unvisited node, which is A. From A we can reach B for 4 and C for 2, so those become their best known distances. A is now finished.",
      dijkstraFrame({ dist: { A: "0", B: "4", C: "2" }, done: [], current: "A", hotEdges: ["AB", "AC"], note: "relax A's edges: B = 4, C = 2" })
    ),
    step(
      3,
      "Visit C, the closest",
      "Next we always pick the unvisited node with the smallest distance, which is C at 2. Going through C reaches B for 2 plus 1, which is 3, cheaper than the 4 we had, so B improves to 3. E gets 2 plus 10, which is 12.",
      dijkstraFrame({ dist: { A: "0", B: "3", C: "2", E: "12" }, done: ["A"], current: "C", hotEdges: ["CB", "CE"], note: "via C: B = min(4, 2+1) = 3,  E = 2+10 = 12" })
    ),
    step(
      4,
      "Visit B",
      "B is now the closest unvisited node at 3. From B we reach D for 3 plus 5, which is 8. Notice that B's distance never changes again once we visit it.",
      dijkstraFrame({ dist: { A: "0", B: "3", C: "2", D: "8", E: "12" }, done: ["A", "C"], current: "B", hotEdges: ["BD"], note: "via B: D = 3+5 = 8" })
    ),
    step(
      5,
      "Visit D",
      "D is next at 8. Through D, E costs 8 plus 3, which is 11, better than 12, and F costs 8 plus 2, which is 10. E and F are visited last, and neither finds a cheaper route.",
      dijkstraFrame({ dist: { A: "0", B: "3", C: "2", D: "8", E: "11", F: "10" }, done: ["A", "C", "B"], current: "D", hotEdges: ["DE", "DF"], note: "via D: E = min(12, 8+3) = 11,  F = 8+2 = 10" })
    ),
    step(
      6,
      "The shortest path",
      "Every node is finished. The cheapest route from A to F is A, C, B, D, F with a total cost of 10. With a priority queue this runs in O of E log V time, but it only works when no edge has a negative cost.",
      dijkstraFrame({ dist: { A: "0", B: "3", C: "2", D: "8", E: "11", F: "10" }, done: ["A", "B", "C", "D", "E", "F"], pathEdges: ["AC", "CB", "BD", "DF"], note: "A → C → B → D → F  =  2 + 1 + 5 + 2 = 10" })
    )
  ],
  problems: {
    beginner: [
      { question: "What does Dijkstra's algorithm find?", choices: ["The cheapest path from one source to every node", "The longest path in a graph", "A minimum spanning tree", "Whether a graph has a cycle"], answer: "The cheapest path from one source to every node", explanation: "It computes single-source shortest paths in a weighted graph." },
      { question: "At the start, what is every node's distance except the source?", choices: ["Infinity", "Zero", "One", "The number of edges"], answer: "Infinity", explanation: "No route is known yet, so distances start at infinity and only decrease." },
      { question: "Which node is visited next?", choices: ["The unvisited node with the smallest distance", "The node with the most edges", "A random neighbour", "The last node added"], answer: "The unvisited node with the smallest distance", explanation: "Choosing the closest node is what makes the algorithm correct." }
    ],
    intermediate: [
      { question: "In this lesson, why did B's distance change from 4 to 3?", choices: ["A → C → B costs 2 + 1 = 3", "B has two edges", "B was visited first", "Edge weights were updated"], answer: "A → C → B costs 2 + 1 = 3", explanation: "Relaxing C's edges found a cheaper route to B." },
      { question: "What is 'relaxing' an edge u → v?", choices: ["Updating dist[v] if dist[u] + w is smaller", "Removing the edge", "Doubling its weight", "Marking v as visited"], answer: "Updating dist[v] if dist[u] + w is smaller", explanation: "Relaxation keeps the best known distance to each node." },
      { question: "Which data structure makes picking the closest node efficient?", choices: ["A min-priority queue (heap)", "A stack", "A FIFO queue", "A hash set"], answer: "A min-priority queue (heap)", explanation: "A heap returns the smallest tentative distance in O(log V)." }
    ],
    advanced: [
      { question: "Why does Dijkstra fail with negative edge weights?", choices: ["A finished node could later get a cheaper route", "It loops forever on every graph", "Heaps can't store negative numbers", "Negative weights make graphs undirected"], answer: "A finished node could later get a cheaper route", explanation: "The greedy choice assumes distances only grow along a path. Bellman-Ford handles negative weights." },
      { question: "With a binary heap, Dijkstra runs in…", choices: ["O((V + E) log V)", "O(V²) always", "O(E)", "O(V · E)"], answer: "O((V + E) log V)", explanation: "Each vertex is extracted once and each edge can trigger one decrease-key or push." },
      { question: "To recover the actual path, you should store…", choices: ["The predecessor of each node when its distance improves", "Only the final distances", "Every visited edge", "The order nodes were visited"], answer: "The predecessor of each node when its distance improves", explanation: "Following predecessors back from the target rebuilds the path." }
    ]
  }
};

/* ───────────────────────── 4. TLS 1.3 handshake (CS · networking) ───────────────────────── */

const LIFE_C = 19;
const LIFE_S = 81;

function tlsFrame(messages: Array<{ y: number; dir: "cs" | "sc"; label: string; color?: string; dashed?: boolean }>, extra: CanvasElement[], note: string): CanvasElement[] {
  const elements: CanvasElement[] = [
    caption(note, { y: 5, w: 80 }),
    box("client", LIFE_C - 9, 12, 18, 10, "Client (browser)", { color: C.cyan }),
    box("server", LIFE_S - 9, 12, 18, 10, "Server", { color: C.violet }),
    arrowAt(LIFE_C, 23, LIFE_C, 96, { dashed: true, color: C.muted }),
    arrowAt(LIFE_S, 23, LIFE_S, 96, { dashed: true, color: C.muted })
  ];
  messages.forEach((message, i) => {
    const [x1, x2] = message.dir === "cs" ? [LIFE_C + 1, LIFE_S - 1] : [LIFE_S - 1, LIFE_C + 1];
    elements.push(arrowAt(x1, message.y, x2, message.y, { label: message.label, color: message.color ?? C.sky, delay: 300 + i * 900 }));
  });
  return [...elements, ...extra];
}

const TLS_HELLO = { y: 34, dir: "cs" as const, label: "ClientHello + key share", color: C.cyan };
const TLS_SERVER = { y: 48, dir: "sc" as const, label: "ServerHello + key share", color: C.violet };
const TLS_CERT = { y: 62, dir: "sc" as const, label: "Certificate, Verify, Finished (encrypted)", color: C.amber };
const TLS_FIN = { y: 76, dir: "cs" as const, label: "Finished (encrypted)", color: C.amber };

const tls: FeaturedSimulation = {
  slug: "tls-handshake",
  title: "The TLS 1.3 handshake",
  subject: "Computer networks & security",
  difficulty: "Medium",
  blurb: "How a browser and server agree on secret keys over a network anyone can watch.",
  steps: [
    step(
      1,
      "Why a handshake",
      "Before a browser sends a password over HTTPS, it must agree on secret keys with the server, even though anyone on the network can watch. TLS 1.3 does this in one round trip. Let's follow the messages between the two sides.",
      tlsFrame([], [box("eve", 40, 52, 20, 10, "Eavesdropper sees everything", { color: C.muted, delay: 500 })], "Goal: shared secret keys over a public network")
    ),
    step(
      2,
      "ClientHello",
      "The client opens with a ClientHello. It lists the cipher suites it supports and, crucially, includes its half of a key exchange: a fresh public key, usually for X25519. Sending the key share up front is what lets TLS 1.3 finish in one round trip.",
      tlsFrame([TLS_HELLO], [box("ckey", LIFE_C - 9, 84, 18, 9, "private key a", { color: C.cyan, delay: 1200 })], "Client sends supported ciphers and its public key share")
    ),
    step(
      3,
      "ServerHello and the shared secret",
      "The server picks a cipher and replies with its own public key share. Now both sides combine their own private key with the other's public key and get the same shared secret. An eavesdropper sees both public keys but cannot compute that secret.",
      tlsFrame(
        [TLS_HELLO, TLS_SERVER],
        [
          box("ckey", LIFE_C - 9, 84, 18, 9, "shared secret", { color: C.mint, delay: 2200 }),
          box("skey", LIFE_S - 9, 84, 18, 9, "shared secret", { color: C.mint, delay: 2200 })
        ],
        "Diffie-Hellman: both sides derive the same secret"
      )
    ),
    step(
      4,
      "Proving the server's identity",
      "Everything after ServerHello is already encrypted. The server sends its certificate, a signature proving it owns the matching private key, and a Finished message. The client checks the certificate chain against the certificate authorities it trusts.",
      tlsFrame(
        [TLS_HELLO, TLS_SERVER, TLS_CERT],
        [box("ca", 40, 84, 20, 9, "client checks CA chain", { color: C.amber, delay: 3200 })],
        "Server proves it is really example.com"
      )
    ),
    step(
      5,
      "Client Finished, then data",
      "The client sends its own Finished message, which confirms nobody tampered with the handshake. From now on, both sides encrypt application data with keys derived from the shared secret. The whole setup took a single round trip.",
      tlsFrame(
        [TLS_HELLO, TLS_SERVER, TLS_CERT, TLS_FIN],
        [
          arrowAt(LIFE_C + 1, 88, LIFE_S - 1, 88, { label: "encrypted HTTP request", color: C.mint, delay: 4200 })
        ],
        "1 round trip, then encrypted application data"
      )
    )
  ],
  problems: {
    beginner: [
      { question: "What is the main job of the TLS handshake?", choices: ["Agree on encryption keys and verify the server", "Compress web pages", "Assign an IP address", "Resolve the domain name"], answer: "Agree on encryption keys and verify the server", explanation: "The handshake sets up keys and authenticates the server before any data is sent." },
      { question: "Which message does the client send first?", choices: ["ClientHello", "ServerHello", "Finished", "Certificate"], answer: "ClientHello", explanation: "The client starts by listing its options and sending its key share." },
      { question: "Why can't an eavesdropper read the traffic?", choices: ["It never learns the shared secret", "The messages are sent too fast", "TLS hides IP addresses", "The server deletes them"], answer: "It never learns the shared secret", explanation: "Public key shares alone are not enough to compute the Diffie-Hellman secret." }
    ],
    intermediate: [
      { question: "How many round trips does a full TLS 1.3 handshake need before data?", choices: ["One", "Two", "Three", "Zero, always"], answer: "One", explanation: "Sending key shares in the first flight removes a round trip compared with TLS 1.2." },
      { question: "What does the server's certificate prove?", choices: ["That a trusted authority vouches for its public key and domain", "That the connection is fast", "That the client is human", "That the data is compressed"], answer: "That a trusted authority vouches for its public key and domain", explanation: "A CA signature links the server's key to its domain name." },
      { question: "What does the Finished message protect against?", choices: ["Tampering with earlier handshake messages", "Packet loss", "Slow servers", "Expired passwords"], answer: "Tampering with earlier handshake messages", explanation: "It contains a MAC over the whole transcript, so any change is detected." }
    ],
    advanced: [
      { question: "Why do ephemeral key shares give forward secrecy?", choices: ["Stealing the server's long-term key later can't recover past session keys", "They are longer than RSA keys", "They are sent twice", "They are stored on disk"], answer: "Stealing the server's long-term key later can't recover past session keys", explanation: "Each session uses fresh keys that are discarded, so old traffic stays safe." },
      { question: "What risk comes with TLS 1.3's 0-RTT early data?", choices: ["Replay attacks", "Weaker encryption", "Certificate expiry", "Larger packets"], answer: "Replay attacks", explanation: "An attacker can resend early data, so it should only carry idempotent requests." },
      { question: "In TLS 1.3, the server's certificate is…", choices: ["Encrypted under handshake keys", "Sent in plaintext like TLS 1.2", "Not sent at all", "Sent before ServerHello"], answer: "Encrypted under handshake keys", explanation: "Everything after ServerHello is encrypted, which hides the certificate from passive observers." }
    ]
  }
};

/* ────────────────────── 5. Virtual memory (CS · operating systems) ────────────────────── */

function vmFrame(options: {
  note: string;
  tlb?: "idle" | "miss" | "hit";
  row?: "page5" | "page6";
  physical?: boolean;
  fault?: boolean;
  links?: CanvasElement[];
}): CanvasElement[] {
  const tlbColor = options.tlb === "miss" ? C.signal : options.tlb === "hit" ? C.mint : C.slate;
  return [
    caption(options.note, { y: 5, w: 85 }),
    box("cpu", 3, 42, 11, 16, "CPU", { color: C.violet }),
    box("vpn", 20, 42, 12, 16, "page 5", { color: C.cyan, delay: 200 }),
    box("off", 32, 42, 12, 16, "offset 0x0A4", { color: C.sky, delay: 300 }),
    box("tlb", 54, 14, 18, 14, options.tlb === "hit" ? "TLB: 5 → frame 2" : "TLB (recent translations)", { color: tlbColor, delay: 400 }),
    box("pt5", 54, 40, 18, 9, "page 5 → frame 2", { color: options.row === "page5" ? C.mint : C.muted, delay: 500 }),
    box("pt4", 54, 51, 18, 9, "page 4 → frame 9", { color: C.muted, delay: 560 }),
    box("pt6", 54, 62, 18, 9, "page 6 → on disk", { color: options.row === "page6" ? C.signal : C.muted, delay: 620 }),
    ...(options.physical
      ? [
          box("frm", 78, 42, 9, 16, "frame 2", { color: C.mint, delay: 900 }),
          box("poff", 87, 42, 10, 16, "0x0A4", { color: C.sky, delay: 1000 })
        ]
      : []),
    ...(options.fault ? [box("disk", 78, 76, 18, 12, "disk (swap)", { color: C.amber, delay: 900 })] : []),
    // The caption sits where step 5's "offset copied" curve passes, so it is left out there.
    ...(options.physical
      ? []
      : [{ type: "text", x: 54, y: 76, width: 18, height: 5, label: "page table (in RAM)", color: C.slate, animation: { type: "fade_in", duration: 400, delay: 700 } }]),
    link("cpu", "vpn", { color: C.slate, delay: 100 }),
    ...(options.links ?? [])
  ];
}

const virtualMemory: FeaturedSimulation = {
  slug: "virtual-memory",
  title: "Virtual memory and address translation",
  subject: "Operating systems",
  difficulty: "Hard",
  blurb: "How the CPU turns a program's virtual address into a real location in RAM, and what a page fault is.",
  steps: [
    step(
      1,
      "Every address is virtual",
      "Programs never use physical RAM addresses directly. Each process sees its own private virtual address space, and the hardware translates every address it uses. That isolation stops one program from reading another's memory.",
      vmFrame({ note: "each process has its own virtual address space" })
    ),
    step(
      2,
      "Split the address",
      "Memory is divided into fixed-size pages, usually 4 kilobytes. So a virtual address splits into two parts: the page number, here page 5, and the offset inside that page, here 0x0A4. Only the page number needs translating.",
      vmFrame({ note: "virtual address = page number + offset (low 12 bits for 4 KB pages)", links: [group(19, 39, 26, 22, { color: C.amber, delay: 600 })] })
    ),
    step(
      3,
      "Ask the TLB first",
      "The CPU first checks the TLB, a tiny, very fast cache of recent translations. A hit takes about one cycle. Here page 5 isn't in the TLB, so it's a miss and we have to look further.",
      vmFrame({ note: "TLB lookup for page 5 → miss", tlb: "miss", links: [arrowAt(26, 41, 53.5, 22, { color: C.signal, delay: 800 })] })
    ),
    step(
      4,
      "Walk the page table",
      "On a miss, the hardware reads the page table in RAM. The entry for page 5 says it lives in physical frame 2. That translation is copied into the TLB, so the next access to page 5 will be a fast hit.",
      vmFrame({
        note: "page table: page 5 → frame 2, then cache it in the TLB",
        tlb: "hit",
        row: "page5",
        links: [link("tlb", "pt5", { color: C.mint, delay: 600 })]
      })
    ),
    step(
      5,
      "Build the physical address",
      "The physical address is frame 2 combined with the unchanged offset 0x0A4. The offset is copied straight across because a page and a frame are the same size. The CPU can now read the right byte in RAM.",
      vmFrame({
        note: "physical address = frame number + same offset",
        tlb: "hit",
        row: "page5",
        physical: true,
        links: [
          link("pt5", "frm", { color: C.mint, delay: 1100 }),
          {
            type: "curved_arrow",
            anchor: false,
            x1: 38,
            y1: 59,
            x2: 92,
            y2: 59,
            cx: 65,
            cy: 96,
            label: "offset copied",
            color: C.sky,
            thickness: 2,
            animation: { type: "draw", duration: 900, delay: 1500 }
          }
        ]
      })
    ),
    step(
      6,
      "A page fault",
      "Now suppose the program touches page 6. Its entry says the page is on disk, not in RAM, so the CPU raises a page fault. The operating system loads the page from disk into a free frame, updates the table, and retries the instruction. That takes millions of cycles, which is why heavy swapping feels slow.",
      vmFrame({ note: "page 6 is not in RAM → page fault → OS loads it from disk", row: "page6", fault: true, links: [link("pt6", "disk", { color: C.signal, delay: 1200 })] })
    )
  ],
  problems: {
    beginner: [
      { question: "Why does each process get its own virtual address space?", choices: ["To isolate processes from each other", "To make RAM larger", "To speed up the disk", "To compress memory"], answer: "To isolate processes from each other", explanation: "Separate address spaces stop one program from reading or corrupting another's memory." },
      { question: "With 4 KB pages, which part of the address is NOT translated?", choices: ["The offset", "The page number", "Both parts", "Neither part"], answer: "The offset", explanation: "The offset is the position inside the page and stays the same in the frame." },
      { question: "What is the TLB?", choices: ["A small, fast cache of recent translations", "A type of hard disk", "The page table itself", "A CPU register for integers"], answer: "A small, fast cache of recent translations", explanation: "It avoids walking the page table on every memory access." }
    ],
    intermediate: [
      { question: "How many offset bits does a 4 KB page need?", choices: ["12", "4", "10", "32"], answer: "12", explanation: "4 KB = 4096 = 2¹² bytes." },
      { question: "What happens right after a TLB miss when the page is in RAM?", choices: ["The page table is read and the TLB is filled", "A page fault is raised", "The program crashes", "The page is loaded from disk"], answer: "The page table is read and the TLB is filled", explanation: "A miss only means the translation wasn't cached; the page table still has it." },
      { question: "A page fault occurs when…", choices: ["The page isn't present in physical memory", "The TLB is full", "The offset is too large", "Two processes share a page"], answer: "The page isn't present in physical memory", explanation: "The OS must bring the page in from disk before the access can complete." }
    ],
    advanced: [
      { question: "Why do 64-bit systems use multi-level page tables?", choices: ["A single flat table would be enormous and mostly empty", "They are faster than a TLB", "They avoid page faults", "They remove the need for offsets"], answer: "A single flat table would be enormous and mostly empty", explanation: "Hierarchical tables only allocate entries for parts of the address space that are used." },
      { question: "What does 'thrashing' mean?", choices: ["The system spends most of its time handling page faults", "The TLB hit rate is 100%", "Pages are too large", "The CPU is idle"], answer: "The system spends most of its time handling page faults", explanation: "When the working set doesn't fit in RAM, pages are constantly swapped in and out." },
      { question: "Why are huge pages (2 MB) sometimes used?", choices: ["One TLB entry covers far more memory, reducing misses", "They use less RAM", "They make page faults impossible", "They remove the need for a page table"], answer: "One TLB entry covers far more memory, reducing misses", explanation: "Larger pages increase TLB reach, which helps memory-hungry workloads." }
    ]
  }
};

export const FEATURED: FeaturedSimulation[] = [binarySearch, bst, dijkstra, tls, virtualMemory];

export function featuredBySlug(slug: string): FeaturedSimulation | undefined {
  return FEATURED.find((item) => item.slug === slug);
}

export function featuredProblemSets(item: FeaturedSimulation): ProblemSet[] {
  const topicId = `featured-${item.slug}`;
  return (Object.keys(item.problems) as DifficultyLevel[]).map((level) => ({
    topicId,
    level,
    passingScore: 66,
    problems: item.problems[level].map((problem, i) => ({ id: `${item.slug}-${level}-${i}`, ...problem }))
  }));
}
