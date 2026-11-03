import type { CIClassNode, CIModel, ModelField } from './contracts';

export function classLineage(id: string, models: CIModel[]): CIModel[] {
  const path: CIModel[] = [],
    seen = new Set<string>();
  let current = models.find((model) => model.id === id);
  while (current) {
    if (seen.has(current.id)) throw new Error('Invalid cyclic class schema');
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId
      ? models.find((model) => model.id === current!.parentId)
      : undefined;
  }
  return path;
}
export function isWithinClass(
  id: string,
  ancestorId: string,
  models: CIModel[],
) {
  return classLineage(id, models).some((model) => model.id === ancestorId);
}
export function effectiveFields(id: string, models: CIModel[]): ModelField[] {
  return classLineage(id, models).flatMap((model) =>
    model.fields
      .filter(
        (field) => !field.originModelId || field.originModelId === model.id,
      )
      .map((field) => ({ ...field, originModelId: model.id })),
  );
}
export function publicModel(model: CIModel, models: CIModel[]): CIModel {
  return { ...model, fields: effectiveFields(model.id, models) };
}
export function classTree(models: CIModel[], parentId?: string): CIClassNode[] {
  return models
    .filter((model) => model.parentId === parentId)
    .map((model) => ({
      id: model.id,
      name: model.name,
      children: classTree(models, model.id),
    }));
}
interface ClassOption {
  value: string;
  title: string;
  children: ClassOption[];
}
export function classOptions(models: CIModel[]) {
  const display = (nodes: CIClassNode[]): ClassOption[] =>
    nodes.map((node) => ({
      value: node.id,
      title: node.name,
      children: display(node.children),
    }));
  return display(classTree(models));
}
