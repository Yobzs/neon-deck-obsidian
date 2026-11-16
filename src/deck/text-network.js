/* ------------------------------------------------------------------ */
/* Note network analysis (InfraNodus-style): links, topics, gaps        */
/* ------------------------------------------------------------------ */

function buildNoteNetwork(app, files, maxNodes) {
  const idx = new Map(files.map((f, i) => [f.path, i]));
  const pair = new Map();
  const deg = new Float64Array(files.length);
  const rl = app.metadataCache.resolvedLinks;
  for (const f of files) {
    const out = rl[f.path];
    if (!out) continue;
    const a = idx.get(f.path);
    for (const [dst, c] of Object.entries(out)) {
      const b = idx.get(dst);
      if (b === undefined || b === a) continue;
      const key = Math.min(a, b) * 1e6 + Math.max(a, b);
      pair.set(key, (pair.get(key) || 0) + c);
      deg[a] += c;
      deg[b] += c;
    }
  }
  const order = files.map((_, i) => i).filter((i) => deg[i] > 0).sort((a, b) => deg[b] - deg[a]).slice(0, maxNodes);
  const re = new Map(order.map((old, i) => [old, i]));
  const edges = [];
  for (const [key, w] of pair) {
    const a = re.get(Math.floor(key / 1e6));
    const b = re.get(key % 1e6);
    if (a !== undefined && b !== undefined) edges.push([a, b, w]);
  }
  const picked = order.map((i) => files[i]);
  return {
    keys: picked.map((f) => f.path),
    labels: picked.map((f) => f.basename),
    kinds: picked.map(() => 'note'),
    files: picked,
    edges,
  };
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function louvainLevel(n, edges, rand) {
  const adj = Array.from({ length: n }, () => []);
  const k = new Float64Array(n);
  let m2 = 0;
  for (const [a, b, w] of edges) {
    if (a === b) {
      k[a] += 2 * w;
      m2 += 2 * w;
      continue;
    }
    adj[a].push(b, w);
    adj[b].push(a, w);
    k[a] += w;
    k[b] += w;
    m2 += 2 * w;
  }
  const comm = Int32Array.from({ length: n }, (_, i) => i);
  if (m2 === 0) return { comm, moved: false };
  const tot = Float64Array.from(k);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let movedAny = false;
  const kin = new Map();
  for (let pass = 0; pass < 30; pass++) {
    let moved = 0;
    for (const i of order) {
      const ci = comm[i];
      kin.clear();
      const a = adj[i];
      for (let x = 0; x < a.length; x += 2) {
        const c = comm[a[x]];
        kin.set(c, (kin.get(c) || 0) + a[x + 1]);
      }
      tot[ci] -= k[i];
      let best = ci;
      let bestGain = (kin.get(ci) || 0) - (tot[ci] * k[i]) / m2;
      for (const [c, w] of kin) {
        const g = w - (tot[c] * k[i]) / m2;
        if (g > bestGain + 1e-12) {
          bestGain = g;
          best = c;
        }
      }
      tot[best] += k[i];
      if (best !== ci) {
        comm[i] = best;
        moved++;
      }
    }
    if (!moved) break;
    movedAny = true;
  }
  return { comm, moved: movedAny };
}

function louvain(n, edges, seed = 7) {
  const rand = mulberry32(seed);
  let membership = Array.from({ length: n }, (_, i) => i);
  let curN = n;
  let curEdges = edges;
  for (let level = 0; level < 12; level++) {
    const { comm, moved } = louvainLevel(curN, curEdges, rand);
    if (!moved) break;
    const remap = new Map();
    for (let i = 0; i < curN; i++) if (!remap.has(comm[i])) remap.set(comm[i], remap.size);
    membership = membership.map((c) => remap.get(comm[c]));
    const agg = new Map();
    for (const [a, b, w] of curEdges) {
      let x = remap.get(comm[a]);
      let y = remap.get(comm[b]);
      if (x > y) [x, y] = [y, x];
      const key = x * 1e6 + y;
      agg.set(key, (agg.get(key) || 0) + w);
    }
    curEdges = [...agg].map(([key, w]) => [Math.floor(key / 1e6), key % 1e6, w]);
    curN = remap.size;
  }
  return membership;
}

function modularity(edges, comm) {
  const tot = new Map();
  let m2 = 0;
  let inside = 0;
  for (const [a, b, w] of edges) {
    m2 += 2 * w;
    tot.set(comm[a], (tot.get(comm[a]) || 0) + w);
    tot.set(comm[b], (tot.get(comm[b]) || 0) + w);
    if (comm[a] === comm[b]) inside += 2 * w;
  }
  if (!m2) return 0;
  let q = inside / m2;
  for (const t of tot.values()) q -= (t / m2) ** 2;
  return q;
}

function betweenness(n, adj) {
  const bc = new Float64Array(n);
  const sigma = new Float64Array(n);
  const dist = new Int32Array(n);
  const delta = new Float64Array(n);
  const preds = Array.from({ length: n }, () => []);
  const stack = new Int32Array(n);
  const queue = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    let sp = 0;
    let qh = 0;
    let qt = 0;
    for (let i = 0; i < n; i++) {
      preds[i].length = 0;
      sigma[i] = 0;
      dist[i] = -1;
      delta[i] = 0;
    }
    sigma[s] = 1;
    dist[s] = 0;
    queue[qt++] = s;
    while (qh < qt) {
      const v = queue[qh++];
      stack[sp++] = v;
      for (const w of adj[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          queue[qt++] = w;
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          preds[w].push(v);
        }
      }
    }
    while (sp > 0) {
      const w = stack[--sp];
      for (const v of preds[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      if (w !== s) bc[w] += delta[w];
    }
  }
  return bc;
}

const DIVERSITY_HINT = {
  Biased: 'One idea dominates. Great for depth — try adding a contrasting perspective.',
  Focused: 'A clear core with supporting themes. Healthy balance, room to branch out.',
  Diversified: 'Several distinct topics that still connect. Ideal for creative thinking.',
  Dispersed: 'Many loosely linked islands. Look at the gaps and build bridges.',
};

function analyzeNetwork(n, edges) {
  const comm = louvain(n, edges);
  const adj = Array.from({ length: n }, () => []);
  const deg = new Float64Array(n);
  for (const [a, b, w] of edges) {
    if (a === b) continue;
    adj[a].push(b);
    adj[b].push(a);
    deg[a] += w;
    deg[b] += w;
  }
  const bc = betweenness(n, adj);
  let maxBc = 1e-9;
  let maxDeg = 1e-9;
  for (let i = 0; i < n; i++) {
    maxBc = Math.max(maxBc, bc[i]);
    maxDeg = Math.max(maxDeg, deg[i]);
  }
  const score = Array.from({ length: n }, (_, i) => 0.75 * Math.sqrt(bc[i] / maxBc) + 0.25 * Math.sqrt(deg[i] / maxDeg));

  const groups = new Map();
  comm.forEach((c, i) => {
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(i);
  });
  const topics = [...groups.values()]
    .map((members) => {
      members.sort((a, b) => score[b] - score[a]);
      return { members, weight: members.reduce((s, i) => s + score[i], 0) };
    })
    .sort((a, b) => b.weight - a.weight);
  const cid = new Int32Array(n);
  topics.forEach((t, k) => {
    t.id = k;
    t.share = t.members.length / n;
    for (const i of t.members) cid[i] = k;
  });
  const Q = modularity(edges, cid);

  const cross = new Map();
  for (const [a, b, w] of edges) {
    const x = cid[a];
    const y = cid[b];
    if (x === y) continue;
    const key = Math.min(x, y) * 1000 + Math.max(x, y);
    cross.set(key, (cross.get(key) || 0) + w);
  }
  const big = topics.filter((t) => t.members.length >= 3).slice(0, 6);
  const gaps = [];
  for (let i = 0; i < big.length; i++) {
    for (let j = i + 1; j < big.length; j++) {
      const A = big[i];
      const B = big[j];
      const w = cross.get(Math.min(A.id, B.id) * 1000 + Math.max(A.id, B.id)) || 0;
      gaps.push({ a: A.id, b: B.id, weight: w, density: w / (A.members.length * B.members.length) });
    }
  }
  gaps.sort((x, y) => x.density - y.density || x.a + x.b - (y.a + y.b));

  const topShare = topics[0] ? topics[0].share : 1;
  let diversity;
  if (Q >= 0.65) diversity = 'Dispersed';
  else if (Q >= 0.4) diversity = 'Diversified';
  else if (Q >= 0.2 && topShare < 0.5) diversity = 'Focused';
  else diversity = 'Biased';

  return { comm: cid, bc, deg, score, adj, topics, gaps: gaps.slice(0, 3), Q, diversity };
}

