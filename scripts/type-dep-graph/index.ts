/**
 * type-dep-graph — 모노레포 타입 의존성 그래프 생성기
 *
 * 실행: npx tsx scripts/type-dep-graph/index.ts
 * JSON: npx tsx scripts/type-dep-graph/index.ts --json
 * 패키지: npx tsx scripts/type-dep-graph/index.ts --include=guarded-wdk,daemon
 * 전체:  npx tsx scripts/type-dep-graph/index.ts --include=all
 * 검증: npx tsx scripts/type-dep-graph/verify.ts
 * PNG:  dot -Tpng docs/type-dep-graph/type-dep-graph.dot -o docs/type-dep-graph/type-dep-graph.png
 *
 * Pure Declaration/Type Graph:
 *   노드 = exported declaration (interface, type, enum, const, class)
 *   엣지 = 타입 위치에서만 (heritage, 멤버 타입, type alias body, satisfies/as)
 *   제외 = value initializer 내부 식별자 참조
 *
 * --include 플래그 없으면 기본값 전체 4패키지
 * --include=all 이면 동일
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import {
  Project,
  Node,
  SyntaxKind,
  type SourceFile,
  type Identifier,
  type Symbol as TsMorphSymbol,
} from 'ts-morph';

// ── Exported Types ──

export type NodeKind = 'type' | 'interface' | 'enum' | 'const' | 'class' | 'external';
export type Relation = 'extends' | 'references';

export interface GraphNode {
  id: string;
  name: string;
  filePath: string;
  line: number;
  kind: NodeKind;
  isExternal: boolean;
  package: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: Relation;
}

export interface GraphResult {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  fallbackKinds: Set<string>;
}

// ── Package Definitions ──

interface PackageDef {
  name: string;
  root: string;
  tsconfig: string;
}

const ALL_PACKAGES: PackageDef[] = [
  { name: 'guarded-wdk', root: 'packages/guarded-wdk', tsconfig: 'packages/guarded-wdk/tsconfig.json' },
  { name: 'daemon', root: 'packages/daemon', tsconfig: 'packages/daemon/tsconfig.json' },
  { name: 'relay', root: 'packages/relay', tsconfig: 'packages/relay/tsconfig.json' },
  { name: 'manifest', root: 'packages/manifest', tsconfig: 'packages/manifest/tsconfig.json' },
];

// ── Constants ──

const EXCLUDE_PATTERNS = [
  'node_modules', 'dist', '.turbo', 'tests/',
];

// ── buildGraph (순수 함수) ──

/**
 * 단일 tsconfig 기반 그래프 빌드 (하위호환: verify.ts 등에서 사용)
 */
export function buildGraph(tsConfigPath: string): GraphResult {
  const pkgRoot = path.dirname(tsConfigPath);
  const monorepoRoot = findMonorepoRoot(pkgRoot);
  const pkgName = detectPackageName(pkgRoot, monorepoRoot);

  return buildMultiGraph(monorepoRoot, [
    { name: pkgName, root: pkgRoot, tsconfig: tsConfigPath },
  ]);
}

/**
 * 멀티 패키지 그래프 빌드
 */
export function buildMultiGraph(monorepoRoot: string, packages: PackageDef[]): GraphResult {
  // 절대 경로로 변환
  const resolvedPkgs = packages.map((p) => ({
    name: p.name,
    root: path.isAbsolute(p.root) ? p.root : path.join(monorepoRoot, p.root),
    tsconfig: path.isAbsolute(p.tsconfig) ? p.tsconfig : path.join(monorepoRoot, p.tsconfig),
  }));

  // 로컬 state (module-global 아님)
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();
  const declToId = new Map<string, string>();
  const fallbackKinds = new Set<string>();

  // ── Helpers (closure) ──

  function rel(absPath: string): string {
    return path.relative(monorepoRoot, absPath);
  }

  function detectPackage(absPath: string): string | undefined {
    for (const pkg of resolvedPkgs) {
      if (absPath.startsWith(pkg.root)) return pkg.name;
    }
    return undefined;
  }

  function isExcluded(absPath: string): boolean {
    const r = rel(absPath);
    return EXCLUDE_PATTERNS.some((p) => r.includes(p));
  }

  function makeId(filePath: string, kind: NodeKind, name: string): string {
    return `n_${createHash('sha1').update(`${filePath}:${kind}:${name}`).digest('hex').slice(0, 10)}`;
  }

  function declKey(node: Node): string {
    return `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getWidth()}`;
  }

  function addInternal(name: string, line: number, sf: SourceFile, kind: NodeKind, pkg: string): string {
    const filePath = rel(sf.getFilePath());
    const id = makeId(filePath, kind, name);
    if (!nodes.has(id)) {
      nodes.set(id, { id, name, filePath, line, kind, isExternal: false, package: pkg });
    }
    return id;
  }

  function addExternal(moduleName: string, importedName: string): string {
    const id = `ext:${moduleName}#${importedName}`;
    if (!nodes.has(id)) {
      nodes.set(id, { id, name: importedName, filePath: moduleName, line: 0, kind: 'external', isExternal: true, package: 'external' });
    }
    return id;
  }

  function addEdge(from: string, to: string, relation: Relation) {
    const key = `${from}->${to}:${relation}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ from, to, relation });
  }

  // ── Phase 1: getExportedDeclarations 기반 노드 수집 ──

  function collectNodes(sf: SourceFile, pkg: string) {
    for (const [, decls] of sf.getExportedDeclarations()) {
      for (const decl of decls) {
        const defFile = decl.getSourceFile().getFilePath();
        if (!detectPackage(defFile)) continue;
        if (isExcluded(defFile)) continue;

        let kind: NodeKind | undefined;
        let name: string | undefined;
        if (Node.isInterfaceDeclaration(decl)) { kind = 'interface'; name = decl.getName(); }
        else if (Node.isTypeAliasDeclaration(decl)) { kind = 'type'; name = decl.getName(); }
        else if (Node.isEnumDeclaration(decl)) { kind = 'enum'; name = decl.getName(); }
        else if (Node.isClassDeclaration(decl)) { kind = 'class'; name = decl.getName(); }
        else if (Node.isVariableDeclaration(decl)) { kind = 'const'; name = decl.getName(); }
        if (!kind || !name) continue;

        const key = declKey(decl);
        if (declToId.has(key)) continue;

        const declPkg = detectPackage(defFile) ?? pkg;
        const id = addInternal(name, decl.getStartLineNumber(), decl.getSourceFile(), kind, declPkg);
        declToId.set(key, id);
      }
    }
  }

  // ── Resolution: symbol -> aliasedSymbol -> declarations ──

  function getCanonicalDeclarations(nameNode: Identifier): Node[] {
    try {
      const sym = nameNode.getSymbol();
      if (!sym) return safeGetDefs(nameNode);

      let target: TsMorphSymbol = sym;
      try {
        const aliased = sym.getAliasedSymbol();
        if (aliased) target = aliased;
      } catch { /* not an alias */ }

      const decls = target.getDeclarations();
      return decls.length > 0 ? decls : safeGetDefs(nameNode);
    } catch {
      return safeGetDefs(nameNode);
    }
  }

  function safeGetDefs(node: Node): Node[] {
    try {
      if (Node.isIdentifier(node)) return node.getDefinitionNodes();
      return [];
    } catch {
      return [];
    }
  }

  function findIdByDef(def: Node): string | undefined {
    return declToId.get(declKey(def));
  }

  function resolveEntityName(nameNode: Node, fromId: string, relation: Relation, hintModule?: string) {
    if (Node.isQualifiedName(nameNode)) {
      return resolveEntityName(nameNode.getRight(), fromId, relation, hintModule);
    }
    if (!Node.isIdentifier(nameNode)) return;

    const name = nameNode.getText();
    if (isBuiltin(name)) return;

    const defs = getCanonicalDeclarations(nameNode);

    if (defs.length === 0) {
      const extMod = resolveExtModule(nameNode, hintModule);
      if (extMod) addEdge(fromId, addExternal(extMod, name), relation);
      return;
    }

    for (const def of defs) {
      const defFile = def.getSourceFile().getFilePath();
      if (isTsLib(defFile)) continue;

      if (defFile.includes('node_modules')) {
        const extMod = extractModName(defFile, hintModule);
        if (extMod) addEdge(fromId, addExternal(extMod, name), relation);
        continue;
      }

      // 모노레포 내부 -- cross-package 포함
      const pkg = detectPackage(defFile);
      if (pkg) {
        const toId = findIdByDef(def);
        if (toId && toId !== fromId) addEdge(fromId, toId, relation);
      }
    }
  }

  function resolveExtModule(nameNode: Identifier, hint?: string): string | undefined {
    if (hint) return hint;
    const sym = nameNode.getSymbol();
    if (!sym) return undefined;
    for (const decl of sym.getDeclarations()) {
      if (Node.isImportSpecifier(decl)) {
        const spec = decl.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.getModuleSpecifierValue();
        if (spec && !spec.startsWith('.') && !spec.startsWith('@wdk/')) return spec;
      }
      if (Node.isImportClause(decl)) {
        const spec = decl.getParent().getModuleSpecifierValue();
        if (spec && !spec.startsWith('.') && !spec.startsWith('@wdk/')) return spec;
      }
    }
    return undefined;
  }

  // ── Type Parameter Dependencies ──

  function visitTpDeps(tp: Node, fromId: string) {
    const tpAny = tp as Record<string, unknown>;
    if (typeof tpAny.getConstraint === 'function') {
      const c = (tp as { getConstraint(): Node | undefined }).getConstraint();
      if (c) visitTypeNode(c, fromId, 'references');
    }
    if (typeof tpAny.getDefault === 'function') {
      const d = (tp as { getDefault(): Node | undefined }).getDefault();
      if (d) visitTypeNode(d, fromId, 'references');
    }
  }

  // ── Member Visitors ──

  function visitSigLike(node: Node, fromId: string) {
    const n = node as Record<string, unknown>;
    if (typeof n.getTypeParameters === 'function') {
      for (const tp of (node as { getTypeParameters(): Node[] }).getTypeParameters()) visitTpDeps(tp, fromId);
    }
    if (typeof n.getParameters === 'function') {
      for (const p of (node as { getParameters(): Array<{ getTypeNode(): Node | undefined }> }).getParameters()) {
        const pt = p.getTypeNode();
        if (pt) visitTypeNode(pt, fromId, 'references');
      }
    }
    if (typeof n.getReturnTypeNode === 'function') {
      const rt = (node as { getReturnTypeNode(): Node | undefined }).getReturnTypeNode();
      if (rt) visitTypeNode(rt, fromId, 'references');
    }
  }

  function visitObjMember(member: Node, fromId: string) {
    if (Node.isPropertySignature(member)) {
      const tn = member.getTypeNode();
      if (tn) visitTypeNode(tn, fromId, 'references');
      return;
    }
    visitSigLike(member, fromId);
  }

  // ── TypeNode Visitor (universe 완주) ──

  function visitTypeNode(node: Node, fromId: string, relation: Relation) {
    const kind = node.getKind();

    // Parenthesized
    if (Node.isParenthesizedTypeNode(node)) {
      return visitTypeNode(node.getTypeNode(), fromId, relation);
    }

    // TypeQuery: typeof X
    if (Node.isTypeQuery(node)) {
      return resolveEntityName(node.getExprName(), fromId, relation);
    }

    // ImportType: import('...').X
    if (Node.isImportTypeNode(node)) {
      const q = node.getQualifier();
      if (q) {
        const arg = node.getArgument();
        resolveEntityName(q, fromId, relation, arg ? extractLitText(arg) : undefined);
      }
      return;
    }

    // IndexedAccessType: T[K]
    if (Node.isIndexedAccessTypeNode(node)) {
      visitTypeNode(node.getObjectTypeNode(), fromId, relation);
      visitTypeNode(node.getIndexTypeNode(), fromId, relation);
      return;
    }

    // TypeReference: Foo<Bar>
    if (Node.isTypeReference(node)) {
      resolveEntityName(node.getTypeName(), fromId, relation);
      for (const a of node.getTypeArguments()) visitTypeNode(a, fromId, 'references');
      return;
    }

    // ExpressionWithTypeArguments: extends Foo<Bar>
    if (Node.isExpressionWithTypeArguments(node)) {
      const expr = node.getExpression();
      if (Node.isIdentifier(expr) || Node.isQualifiedName(expr)) resolveEntityName(expr, fromId, relation);
      for (const a of node.getTypeArguments()) visitTypeNode(a, fromId, 'references');
      return;
    }

    // ConditionalTypeNode: A extends B ? C : D
    if (Node.isConditionalTypeNode(node)) {
      visitTypeNode(node.getCheckType(), fromId, 'references');
      visitTypeNode(node.getExtendsType(), fromId, 'references');
      visitTypeNode(node.getTrueType(), fromId, 'references');
      visitTypeNode(node.getFalseType(), fromId, 'references');
      return;
    }

    // MappedTypeNode: { [K in keyof Foo]: Bar }
    if (Node.isMappedTypeNode(node)) {
      const tp = node.getTypeParameter();
      if (tp) { const c = tp.getConstraint(); if (c) visitTypeNode(c, fromId, 'references'); }
      const tn = node.getTypeNode();
      if (tn) visitTypeNode(tn, fromId, 'references');
      return;
    }

    // InferType: infer U extends Foo
    if (kind === SyntaxKind.InferType) {
      node.forEachChild((ch) => { if (ch.getKind() === SyntaxKind.TypeParameter) visitTpDeps(ch, fromId); });
      return;
    }

    // ConstructorType: new (x: A) => B
    if (kind === SyntaxKind.ConstructorType) {
      visitSigLike(node, fromId);
      return;
    }

    // TemplateLiteralType: `${A}_${B}`
    if (kind === SyntaxKind.TemplateLiteralType) {
      node.forEachChild((ch) => { if (Node.isTypeNode(ch)) visitTypeNode(ch, fromId, 'references'); });
      return;
    }

    // TypeOperator: keyof T, readonly T, unique symbol
    if (kind === SyntaxKind.TypeOperator) {
      node.forEachChild((ch) => visitTypeNode(ch, fromId, relation));
      return;
    }

    // FunctionType: (x: A) => B
    if (Node.isFunctionTypeNode(node)) {
      visitSigLike(node, fromId);
      return;
    }

    // TypeLiteral: { x: A; m(y: B): C }
    if (Node.isTypeLiteral(node)) {
      for (const m of node.getMembers()) visitObjMember(m, fromId);
      return;
    }

    // RestType, OptionalType, NamedTupleMember -- child 순회
    if (kind === SyntaxKind.RestType || kind === SyntaxKind.OptionalType || kind === SyntaxKind.NamedTupleMember) {
      node.forEachChild((ch) => { if (Node.isTypeNode(ch)) visitTypeNode(ch, fromId, relation); });
      return;
    }

    // Union, Intersection, Tuple, Array, etc. -- child 순회
    if (kind === SyntaxKind.UnionType || kind === SyntaxKind.IntersectionType
      || kind === SyntaxKind.TupleType || kind === SyntaxKind.ArrayType) {
      node.forEachChild((ch) => { if (Node.isTypeNode(ch)) visitTypeNode(ch, fromId, relation); });
      return;
    }

    // Primitive keywords -- leaf nodes, no refs
    if (kind === SyntaxKind.StringKeyword || kind === SyntaxKind.NumberKeyword
      || kind === SyntaxKind.BooleanKeyword || kind === SyntaxKind.BigIntKeyword
      || kind === SyntaxKind.SymbolKeyword || kind === SyntaxKind.VoidKeyword
      || kind === SyntaxKind.UndefinedKeyword || kind === SyntaxKind.NullKeyword
      || kind === SyntaxKind.NeverKeyword || kind === SyntaxKind.UnknownKeyword
      || kind === SyntaxKind.AnyKeyword || kind === SyntaxKind.ObjectKeyword) {
      return;
    }

    // LiteralType, ThisType, TypePredicate, etc. -- no type refs to resolve
    if (kind === SyntaxKind.LiteralType || kind === SyntaxKind.ThisType
      || kind === SyntaxKind.TypePredicate || kind === SyntaxKind.TemplateLiteralTypeSpan) {
      // LiteralType은 type ref가 아님. child에 TypeNode가 있을 수 있으니 순회.
      node.forEachChild((ch) => { if (Node.isTypeNode(ch)) visitTypeNode(ch, fromId, relation); });
      return;
    }

    // Fallback -- unknown kind -> detector에 기록
    fallbackKinds.add(SyntaxKind[kind] ?? `Unknown(${kind})`);
    node.forEachChild((ch) => {
      if (Node.isTypeNode(ch) || Node.isIdentifier(ch)) visitTypeNode(ch, fromId, relation);
    });
  }

  // ── Initializer (pure type graph: satisfies/as만) ──

  function visitInit(node: Node, fromId: string) {
    if (Node.isSatisfiesExpression(node)) {
      const tn = node.getTypeNode();
      if (tn) visitTypeNode(tn, fromId, 'references');
      return;
    }
    if (Node.isAsExpression(node)) {
      const tn = node.getTypeNode();
      if (tn) visitTypeNode(tn, fromId, 'references');
      return;
    }
    // pure type graph: 나머지 initializer는 처리하지 않음
  }

  // ── Phase 2: Edge Collection ──

  function collectEdges(sf: SourceFile) {
    // Interfaces
    for (const iface of sf.getInterfaces()) {
      const fromId = findNodeId(iface.getName(), 'interface', sf);
      if (!fromId) continue;
      for (const tp of iface.getTypeParameters()) visitTpDeps(tp, fromId);
      for (const ext of iface.getExtends()) visitTypeNode(ext, fromId, 'extends');
      for (const m of iface.getMembers()) visitObjMember(m, fromId);
    }

    // Type aliases
    for (const ta of sf.getTypeAliases()) {
      const fromId = findNodeId(ta.getName(), 'type', sf);
      if (!fromId) continue;
      for (const tp of ta.getTypeParameters()) visitTpDeps(tp, fromId);
      const tn = ta.getTypeNode();
      if (tn) visitTypeNode(tn, fromId, 'references');
    }

    // Const declarations
    for (const stmt of sf.getVariableStatements()) {
      for (const d of stmt.getDeclarations()) {
        const fromId = findNodeId(d.getName(), 'const', sf);
        if (!fromId) continue;
        const tn = d.getTypeNode();
        if (tn) visitTypeNode(tn, fromId, 'references');
        const init = d.getInitializer();
        if (init) visitInit(init, fromId);
      }
    }

    // Classes -- heritage + members
    for (const cls of sf.getClasses()) {
      const name = cls.getName();
      if (!name) continue;
      const fromId = findNodeId(name, 'class', sf);
      if (!fromId) continue;

      for (const tp of cls.getTypeParameters()) visitTpDeps(tp, fromId);
      const ext = cls.getExtends();
      if (ext) visitTypeNode(ext, fromId, 'extends');
      for (const impl of cls.getImplements()) visitTypeNode(impl, fromId, 'extends');

      // Class members
      for (const member of cls.getMembers()) {
        if (Node.isPropertyDeclaration(member)) {
          const tn = member.getTypeNode();
          if (tn) visitTypeNode(tn, fromId, 'references');
        } else if (Node.isMethodDeclaration(member) || Node.isConstructorDeclaration(member)
                   || Node.isGetAccessorDeclaration(member) || Node.isSetAccessorDeclaration(member)) {
          visitSigLike(member, fromId);
        }
      }
    }
  }

  function findNodeId(name: string, kind: NodeKind, sf: SourceFile): string | undefined {
    const id = makeId(rel(sf.getFilePath()), kind, name);
    return nodes.has(id) ? id : undefined;
  }

  // ── Phase 3: Pruning ──

  function prune() {
    const connected = new Set<string>();
    for (const e of edges) { connected.add(e.from); connected.add(e.to); }
    for (const [id] of nodes) { if (!connected.has(id)) nodes.delete(id); }
  }

  // ── Execute Phases ──

  for (const pkg of resolvedPkgs) {
    try {
      const project = new Project({ tsConfigFilePath: pkg.tsconfig });
      const sourceFiles = project.getSourceFiles()
        .filter((sf) => sf.getFilePath().startsWith(pkg.root))
        .filter((sf) => !sf.isDeclarationFile())
        .filter((sf) => !isExcluded(sf.getFilePath()));

      console.log(`  [${pkg.name}] ${sourceFiles.length} source files`);

      for (const sf of sourceFiles) collectNodes(sf, pkg.name);
      for (const sf of sourceFiles) collectEdges(sf);
    } catch (err) {
      console.warn(`  [${pkg.name}] skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  prune();

  return { nodes, edges, fallbackKinds };
}

// ── Static Helpers (순수, state 불필요) ──

function findMonorepoRoot(from: string): string {
  let dir = from;
  while (dir !== path.dirname(dir)) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf-8'));
      if (pkg.workspaces) return dir;
    } catch { /* not root */ }
    dir = path.dirname(dir);
  }
  // fallback: __dirname 기준
  return path.resolve(__dirname, '../..');
}

function detectPackageName(pkgRoot: string, monorepoRoot: string): string {
  const relative = path.relative(monorepoRoot, pkgRoot);
  for (const pkg of ALL_PACKAGES) {
    if (relative === pkg.root || pkgRoot.endsWith(pkg.root)) return pkg.name;
  }
  return path.basename(pkgRoot);
}

function isBuiltin(name: string): boolean {
  const b = new Set([
    'Record', 'Readonly', 'Partial', 'Required', 'Pick', 'Omit', 'Exclude', 'Extract',
    'NonNullable', 'ReturnType', 'Parameters', 'ConstructorParameters', 'InstanceType',
    'Promise', 'Error', 'Array', 'Map', 'Set', 'WeakMap', 'WeakSet',
    'string', 'number', 'boolean', 'bigint', 'symbol', 'void', 'never', 'unknown', 'any',
    'undefined', 'null', 'object', 'Function',
  ]);
  return b.has(name);
}

function isTsLib(fp: string): boolean {
  return fp.includes('node_modules/typescript/lib/') || /^lib\..+\.d\.ts$/.test(path.basename(fp));
}

function extractModName(fp: string, hint?: string): string | undefined {
  if (hint) return hint;
  const pm = fp.match(/node_modules\/\.pnpm\/[^/]+\/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
  if (pm) return pm[1];
  const m = fp.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
  if (m && m[1] !== '.pnpm') return m[1];
  return undefined;
}

function extractLitText(node: Node): string {
  if (Node.isLiteralTypeNode(node)) {
    const lit = node.getLiteral();
    if (Node.isStringLiteral(lit)) return lit.getLiteralText();
  }
  return node.getText().replace(/['"]/g, '');
}

// ── Cluster ──

const PKG_COLORS: Record<string, string> = {
  'guarded-wdk': '#d4edda',
  daemon: '#dae8fc',
  relay: '#fff2cc',
  manifest: '#fce8e6',
  external: '#f0f0f0',
};

const PACKAGE_NAMES = ['guarded-wdk', 'daemon', 'relay', 'manifest'];

function getClusterKey(n: GraphNode, multiPkg: boolean): string {
  if (n.isExternal) return 'external';

  if (multiPkg) {
    // multi-package: "daemon/services", "guarded-wdk/core" 형태
    const dir = path.dirname(n.filePath);
    const parts = dir.split('/');
    const pkgIdx = parts.findIndex((p) => PACKAGE_NAMES.includes(p));
    if (pkgIdx < 0) return n.package;
    const sub = parts.slice(pkgIdx + 1).filter((p) => p !== 'src' && p !== 'lib');
    if (sub.length === 0) return n.package;
    return `${n.package}/${sub.slice(0, 2).join('/')}`;
  }

  // single-package: 상대경로 기반 클러스터
  const filePath = n.filePath;
  const parts = filePath.split('/');
  const pkgIdx = parts.findIndex((p) => PACKAGE_NAMES.includes(p));
  const subParts = pkgIdx >= 0 ? parts.slice(pkgIdx + 1) : parts;
  const subPath = subParts.filter((p) => p !== 'src').join('/');
  const dir = path.dirname(subPath);
  if (dir === '.') return 'root';
  const dirParts = dir.split('/');
  return dirParts[0] || 'root';
}

function groupByClusters(nodeList: GraphNode[], multiPkg: boolean): Record<string, GraphNode[]> {
  const clusters: Record<string, GraphNode[]> = {};
  for (const n of nodeList) {
    const c = getClusterKey(n, multiPkg);
    if (!clusters[c]) clusters[c] = [];
    clusters[c].push(n);
  }
  return clusters;
}

// ── DOT Renderer ──

function dotShape(kind: NodeKind): string {
  switch (kind) {
    case 'type': return 'ellipse';
    case 'interface': return 'box';
    case 'enum': return 'hexagon';
    case 'const': return 'parallelogram';
    case 'class': return 'component';
    case 'external': return 'box';
  }
}

function renderDot(nodeList: GraphNode[], edgeList: GraphEdge[], nodes: Map<string, GraphNode>, multiPkg: boolean): string {
  const L: string[] = [];
  L.push(multiPkg ? 'digraph MonorepoTypeGraph {' : 'digraph TypeDependencyGraph {');
  L.push(multiPkg
    ? '  rankdir=LR; ranksep=2.0; nodesep=0.3;'
    : '  rankdir=LR; ranksep=1.5; nodesep=0.3;');
  L.push(multiPkg
    ? '  node [fontname="Helvetica", fontsize=8, margin="0.1,0.03"];'
    : '  node [fontname="Helvetica", fontsize=9, margin="0.15,0.05"];');
  L.push(multiPkg
    ? '  edge [fontname="Helvetica", fontsize=7, color=gray50];'
    : '  edge [fontname="Helvetica", fontsize=8, color=gray50];');
  L.push('');

  const clusters = groupByClusters(nodeList, multiPkg);
  for (const [c, ns] of Object.entries(clusters).sort(([a], [b]) => a.localeCompare(b))) {
    const cid = c.replace(/[^a-zA-Z0-9]/g, '_');
    if (c === 'external') {
      L.push(`  subgraph cluster_external { label="external"; style=dashed; color=gray60; bgcolor="#f8f8f8";`);
    } else if (multiPkg) {
      const pkg = c.split('/')[0];
      const bg = PKG_COLORS[pkg] || '#f5f5f5';
      L.push(`  subgraph cluster_${cid} { label="${c}"; style="rounded,filled"; fillcolor="${bg}"; color=gray80;`);
    } else {
      L.push(`  subgraph cluster_${cid} { label="${c}/"; style="rounded,filled"; fillcolor="${PKG_COLORS[c] || '#f5f5f5'}"; color=gray80;`);
    }
    for (const n of ns) {
      const s = n.isExternal ? ', style=dashed, color=gray60' : '';
      const lbl = multiPkg
        ? `${n.name}\\n${n.filePath.split('/').slice(-2).join('/')}`
        : n.isExternal
          ? `${n.name}\\n${n.filePath}`
          : `${n.name}\\n${n.filePath}:${n.line}`;
      L.push(`    "${n.id}" [label="${lbl}", shape=${dotShape(n.kind)}${s}];`);
    }
    L.push('  }');
    L.push('');
  }

  for (const e of edgeList) {
    if (multiPkg) {
      const fromPkg = nodes.get(e.from)?.package;
      const toPkg = nodes.get(e.to)?.package;
      const isCross = fromPkg !== toPkg;
      if (e.relation === 'extends') {
        L.push(`  "${e.from}" -> "${e.to}" [style=bold, color=${isCross ? 'red' : 'blue'}];`);
      } else {
        L.push(`  "${e.from}" -> "${e.to}"${isCross ? ' [color=orange]' : ''};`);
      }
    } else {
      L.push(e.relation === 'extends'
        ? `  "${e.from}" -> "${e.to}" [style=bold, color=blue];`
        : `  "${e.from}" -> "${e.to}";`);
    }
  }
  L.push('}');
  return L.join('\n');
}

// ── Mermaid Renderer ──

function mmdId(id: string): string { return id.replace(/[^a-zA-Z0-9_]/g, '_'); }

function mmdShape(kind: NodeKind, id: string, label: string): string {
  const l = JSON.stringify(label);
  switch (kind) {
    case 'type': return `${id}([${l}])`;
    case 'interface': return `${id}[${l}]`;
    case 'enum': return `${id}{{${l}}}`;
    case 'const': return `${id}[/${l}/]`;
    case 'class': return `${id}[[${l}]]`;
    case 'external': return `${id}[${l}]`;
  }
}

function renderMermaid(nodeList: GraphNode[], edgeList: GraphEdge[], multiPkg: boolean): string {
  const L: string[] = ['flowchart LR', ''];
  const clusters = groupByClusters(nodeList, multiPkg);
  for (const [c, ns] of Object.entries(clusters).sort(([a], [b]) => a.localeCompare(b))) {
    const subId = c.replace(/[^a-zA-Z0-9_]/g, '_');
    L.push(`  subgraph ${subId}["${c}/"]`);
    for (const n of ns) {
      const id = mmdId(n.id);
      const lbl = n.isExternal ? `${n.name}<br/>${n.filePath}` : `${n.name}<br/>${n.filePath}:${n.line}`;
      L.push(`    ${mmdShape(n.kind, id, lbl)}`);
    }
    L.push('  end');
    L.push('');
  }
  for (const e of edgeList) {
    L.push(`  ${mmdId(e.from)} ${e.relation === 'extends' ? '==>' : '-->'} ${mmdId(e.to)}`);
  }
  L.push('');
  L.push('  classDef typeNode fill:#e8f4fd,stroke:#4a90d9');
  L.push('  classDef interfaceNode fill:#e8fde8,stroke:#4a9d4a');
  L.push('  classDef enumNode fill:#fde8fd,stroke:#9d4a9d');
  L.push('  classDef constNode fill:#fdf8e8,stroke:#d9a84a');
  L.push('  classDef classNode fill:#fde8e8,stroke:#d94a4a');
  L.push('  classDef externalNode fill:#f0f0f0,stroke:#999,stroke-dasharray: 5 5');
  for (const n of nodeList) L.push(`  class ${mmdId(n.id)} ${n.kind}Node`);
  return L.join('\n');
}

// ── CLI main() ──

function main() {
  const ROOT = path.resolve(__dirname, '../..');
  const OUT_DIR = path.join(ROOT, 'docs/type-dep-graph');
  const jsonMode = process.argv.includes('--json');

  // --include 플래그 파싱
  const includeArg = process.argv.find((a) => a.startsWith('--include='));
  const includePackages = includeArg
    ? includeArg.split('=')[1] === 'all'
      ? ALL_PACKAGES.map((p) => p.name)
      : includeArg.split('=')[1].split(',')
    : ALL_PACKAGES.map((p) => p.name); // 기본값: 전체 4패키지

  const packages = ALL_PACKAGES.filter((p) => includePackages.includes(p.name));
  if (packages.length === 0) {
    console.error(`[type-dep-graph] No packages matched: ${includePackages.join(', ')}`);
    console.error(`  Available: ${ALL_PACKAGES.map((p) => p.name).join(', ')}`);
    process.exit(1);
  }

  const multiPkg = packages.length > 1;

  console.log(`[type-dep-graph] Building graph for: ${packages.map((p) => p.name).join(', ')}`);
  const { nodes, edges, fallbackKinds } = buildMultiGraph(ROOT, packages);

  console.log(`[type-dep-graph] ${nodes.size} nodes, ${edges.length} edges, ${fallbackKinds.size} fallback kinds`);
  if (fallbackKinds.size > 0) {
    console.warn(`[type-dep-graph] Fallback kinds: ${[...fallbackKinds].join(', ')}`);
  }

  // 패키지별 통계
  if (multiPkg) {
    const pkgStats: Record<string, { nodes: number; edges: number }> = {};
    for (const n of nodes.values()) {
      if (!pkgStats[n.package]) pkgStats[n.package] = { nodes: 0, edges: 0 };
      pkgStats[n.package].nodes++;
    }
    for (const e of edges) {
      const pkg = nodes.get(e.from)?.package ?? 'unknown';
      if (!pkgStats[pkg]) pkgStats[pkg] = { nodes: 0, edges: 0 };
      pkgStats[pkg].edges++;
    }
    const crossPkgEdges = edges.filter((e) => nodes.get(e.from)?.package !== nodes.get(e.to)?.package).length;

    console.log('[type-dep-graph] Stats:');
    for (const [pkg, s] of Object.entries(pkgStats).sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  ${pkg}: ${s.nodes} nodes, ${s.edges} edges`);
    }
    console.log(`  cross-package: ${crossPkgEdges} edges`);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const nodeList = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  const edgeList = [...edges].sort((a, b) =>
    a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.relation.localeCompare(b.relation));

  writeFileSync(path.join(OUT_DIR, 'type-dep-graph.dot'), renderDot(nodeList, edgeList, nodes, multiPkg));
  writeFileSync(path.join(OUT_DIR, 'type-dep-graph.mmd'), renderMermaid(nodeList, edgeList, multiPkg));

  if (jsonMode) {
    const jsonOut = {
      ...(multiPkg ? {
        stats: (() => {
          const pkgStats: Record<string, { nodes: number; edges: number }> = {};
          for (const n of nodes.values()) {
            if (!pkgStats[n.package]) pkgStats[n.package] = { nodes: 0, edges: 0 };
            pkgStats[n.package].nodes++;
          }
          for (const e of edges) {
            const pkg = nodes.get(e.from)?.package ?? 'unknown';
            if (!pkgStats[pkg]) pkgStats[pkg] = { nodes: 0, edges: 0 };
            pkgStats[pkg].edges++;
          }
          return {
            ...pkgStats,
            crossPackage: edges.filter((e) => nodes.get(e.from)?.package !== nodes.get(e.to)?.package).length,
            fallbackKinds: [...fallbackKinds],
          };
        })(),
      } : {}),
      nodes: nodeList,
      edges: edgeList.map((e) => ({
        from: nodes.get(e.from) ?? { name: e.from, kind: 'unknown' },
        to: nodes.get(e.to) ?? { name: e.to, kind: 'unknown' },
        relation: e.relation,
      })),
    };
    writeFileSync(path.join(OUT_DIR, 'type-dep-graph.json'), JSON.stringify(jsonOut, null, 2));
    console.log(`  docs/type-dep-graph/type-dep-graph.json`);
  }

  console.log(`[type-dep-graph] Written: docs/type-dep-graph/type-dep-graph.dot, docs/type-dep-graph/type-dep-graph.mmd`);
}

// ── Run (CLI entrypoint guard) ──

const isCLI = process.argv[1]?.includes('type-dep-graph/index');
if (isCLI) main();
