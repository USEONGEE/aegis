/**
 * verify.ts — type-dep-graph 검증 + 순환 의존성 검사
 *
 * 실행: npx tsx scripts/type-dep-graph/verify.ts
 *
 * 1) 생성된 JSON 그래프 로드
 * 2) 순환 의존성(circular dependency) 검출
 * 3) 패키지별 통계 출력
 */

import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

// ── Types (index.ts와 동일한 직렬화 구조) ──

interface GraphNodeJSON {
  id: string;
  name: string;
  filePath: string;
  line: number;
  kind: string;
  isExternal: boolean;
  package: string;
}

interface GraphEdgeJSON {
  from: GraphNodeJSON | { name: string; kind: string };
  to: GraphNodeJSON | { name: string; kind: string };
  relation: string;
}

interface GraphJSON {
  stats?: Record<string, unknown>;
  nodes: GraphNodeJSON[];
  edges: GraphEdgeJSON[];
}

// ── Circular Dependency Detection (Tarjan's SCC) ──

function findCircularDeps(nodes: GraphNodeJSON[], edges: GraphEdgeJSON[]): string[][] {
  // Build adjacency list using node IDs
  const nodeById = new Map<string, GraphNodeJSON>();
  for (const n of nodes) nodeById.set(n.id, n);

  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);

  for (const e of edges) {
    const fromId = 'id' in e.from ? e.from.id : undefined;
    const toId = 'id' in e.to ? e.to.id : undefined;
    if (fromId && toId && adj.has(fromId)) {
      adj.get(fromId)!.push(toId);
    }
  }

  // Tarjan's SCC
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongConnect(v: string) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      // Only report cycles (SCC with > 1 node)
      if (scc.length > 1) sccs.push(scc);
    }
  }

  for (const n of nodes) {
    if (!indices.has(n.id)) strongConnect(n.id);
  }

  return sccs;
}

// ── Stats ──

interface PackageStats {
  nodes: number;
  edges: number;
  types: number;
  interfaces: number;
  enums: number;
  consts: number;
  classes: number;
  externals: number;
}

function computeStats(nodes: GraphNodeJSON[], edges: GraphEdgeJSON[]): Record<string, PackageStats> {
  const stats: Record<string, PackageStats> = {};

  function ensure(pkg: string): PackageStats {
    if (!stats[pkg]) {
      stats[pkg] = { nodes: 0, edges: 0, types: 0, interfaces: 0, enums: 0, consts: 0, classes: 0, externals: 0 };
    }
    return stats[pkg];
  }

  for (const n of nodes) {
    const s = ensure(n.package);
    s.nodes++;
    switch (n.kind) {
      case 'type': s.types++; break;
      case 'interface': s.interfaces++; break;
      case 'enum': s.enums++; break;
      case 'const': s.consts++; break;
      case 'class': s.classes++; break;
      case 'external': s.externals++; break;
    }
  }

  for (const e of edges) {
    const fromPkg = 'package' in e.from ? (e.from as GraphNodeJSON).package : 'unknown';
    const s = ensure(fromPkg);
    s.edges++;
  }

  return stats;
}

// ── Main ──

function main() {
  const ROOT = path.resolve(__dirname, '../..');
  const jsonPath = path.join(ROOT, 'docs/type-dep-graph/type-dep-graph.json');

  if (!existsSync(jsonPath)) {
    console.error(`[verify] Graph JSON not found: ${jsonPath}`);
    console.error('  Run first: npx tsx scripts/type-dep-graph/index.ts --json');
    process.exit(1);
  }

  console.log(`[verify] Loading: ${jsonPath}`);
  const graph: GraphJSON = JSON.parse(readFileSync(jsonPath, 'utf-8'));

  const { nodes, edges } = graph;
  console.log(`[verify] Loaded: ${nodes.length} nodes, ${edges.length} edges\n`);

  // ── Stats per package ──

  console.log('=== Package Stats ===');
  const stats = computeStats(nodes, edges);
  for (const [pkg, s] of Object.entries(stats).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${pkg}:`);
    console.log(`    nodes: ${s.nodes} (type=${s.types}, interface=${s.interfaces}, enum=${s.enums}, const=${s.consts}, class=${s.classes}, external=${s.externals})`);
    console.log(`    edges: ${s.edges}`);
  }

  const totalNodes = nodes.length;
  const totalEdges = edges.length;
  const internalNodes = nodes.filter((n) => !n.isExternal).length;
  const externalNodes = nodes.filter((n) => n.isExternal).length;
  const crossPkgEdges = edges.filter((e) => {
    const fromPkg = 'package' in e.from ? (e.from as GraphNodeJSON).package : undefined;
    const toPkg = 'package' in e.to ? (e.to as GraphNodeJSON).package : undefined;
    return fromPkg && toPkg && fromPkg !== toPkg;
  }).length;

  console.log(`\n=== Summary ===`);
  console.log(`  Total nodes: ${totalNodes} (internal=${internalNodes}, external=${externalNodes})`);
  console.log(`  Total edges: ${totalEdges}`);
  console.log(`  Cross-package edges: ${crossPkgEdges}`);

  // ── Circular dependencies ──

  console.log(`\n=== Circular Dependencies ===`);
  const cycles = findCircularDeps(nodes, edges);

  if (cycles.length === 0) {
    console.log('  No circular dependencies found.');
  } else {
    console.error(`  Found ${cycles.length} cycle(s):`);
    const nodeById = new Map<string, GraphNodeJSON>();
    for (const n of nodes) nodeById.set(n.id, n);

    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i];
      const names = cycle.map((id) => {
        const n = nodeById.get(id);
        return n ? `${n.package}/${n.name}` : id;
      });
      console.error(`  Cycle ${i + 1}: ${names.join(' -> ')} -> ${names[0]}`);
    }
    process.exit(1);
  }

  console.log('\n[verify] All checks passed!');
}

main();
