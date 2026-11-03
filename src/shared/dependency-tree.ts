import type { CI, Relation, RelationType } from './api/contracts';
export interface DependencyNode {
  key: string;
  ci: CI;
  via?: RelationType;
  stop?: 'cycle' | 'depth';
  children?: DependencyNode[];
}
export function serviceDependencies(
  cis: CI[],
  relations: Relation[],
  limit = 200,
) {
  const index = new Map(cis.map((ci) => [ci.id, ci]));
  let count = 0,
    truncated = false,
    cycles = 0;
  const visit = (
    ci: CI,
    path: string[],
    via?: RelationType,
    key = `root:${ci.id}`,
  ): DependencyNode | undefined => {
    if (count >= limit) {
      truncated = true;
      return;
    }
    count++;
    const node: DependencyNode = { key, ci, via };
    if (path.includes(ci.id)) {
      node.stop = 'cycle';
      cycles++;
      return node;
    }
    const outgoing = relations.filter((edge) => edge.sourceId === ci.id);
    if (path.length >= 2) {
      if (outgoing.length) node.stop = 'depth';
      return node;
    }
    node.children = outgoing.flatMap((edge) => {
      const target = index.get(edge.targetId);
      if (!target) return [];
      const child = visit(
        target,
        [...path, ci.id],
        edge.type,
        `${key}/${edge.id}`,
      );
      return child ? [child] : [];
    });
    return node;
  };
  const nodes = cis
    .filter((ci) => ci.modelId === 'service')
    .flatMap((ci) => {
      const node = visit(ci, []);
      return node ? [node] : [];
    });
  return { nodes, truncated, cycles };
}
