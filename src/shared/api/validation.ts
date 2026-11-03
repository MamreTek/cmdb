import type {
  AttributeValue,
  CI,
  CIInput,
  CIModel,
  ModelField,
  Relation,
  RelationRule,
} from './contracts';

export class Problem extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export const bad = (
  message: string,
  fields?: Record<string, string>,
): never => {
  throw new Problem(422, 'VALIDATION_ERROR', message, fields);
};
export function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return bad('请求必须是 JSON 对象');
  return input as Record<string, unknown>;
}
export function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  const invalid = Object.keys(value).filter((key) => !keys.includes(key));
  if (invalid.length) bad(`不支持的字段：${invalid.join(', ')}`);
}
export function stringField(
  value: unknown,
  key: string,
  min: number,
  max: number,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.trim().length > max
  )
    return bad('请检查字段内容', { [key]: `请输入 ${min}–${max} 个字符` });
  return value.trim();
}
export function choice<T extends string>(
  value: unknown,
  values: readonly T[],
  key: string,
): T {
  if (typeof value !== 'string' || !values.includes(value as T))
    return bad('字段值不在允许范围内', { [key]: `可选：${values.join(', ')}` });
  return value as T;
}
export function attribute(
  raw: unknown,
  field: ModelField,
  cis: CI[],
  previousValue?: AttributeValue,
): AttributeValue | undefined {
  const key = `attributes.${field.key}`;
  const value =
    raw === undefined || raw === '' || raw === null ? field.defaultValue : raw;
  if (value === undefined) {
    if (field.required) bad('缺少必填属性', { [key]: `${field.label}必填` });
    return undefined;
  }
  const type = field.type ?? 'text';
  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value))
      return bad('数字属性无效', { [key]: '请输入有限数字' });
    return value;
  }
  if (type === 'boolean') {
    if (typeof value !== 'boolean')
      return bad('布尔属性无效', { [key]: '请选择 true 或 false' });
    return value;
  }
  const text = stringField(value, key, field.required ? 1 : 0, 120);
  if (!text) return undefined;
  if (
    type === 'date' &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
      !Number.isFinite(Date.parse(text)) ||
      new Date(text).toISOString().slice(0, 10) !== text)
  )
    bad('日期无效', { [key]: '请输入真实日期 YYYY-MM-DD' });
  if (type === 'enum' && !field.options?.includes(text))
    bad('枚举值无效', { [key]: `可选：${field.options?.join(', ')}` });
  if (
    type === 'reference' &&
    !cis.some(
      (ci) =>
        ci.id === text &&
        ci.modelId === field.referenceModelId &&
        (ci.status !== 'retired' || previousValue === text),
    )
  )
    bad('引用资源无效', { [key]: '请选择指定模型下未退役的资源' });
  if (
    field.format === 'ipv4' &&
    (!/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(text) ||
      text.split('.').some((part) => Number(part) > 255))
  )
    bad('IPv4 地址格式不正确', { [key]: '请输入有效 IPv4 地址' });
  return text;
}
export function ciInput(
  raw: unknown,
  models: CIModel[],
  cis: CI[],
  previous?: CI,
): CIInput {
  const input = object(raw);
  onlyKeys(input, [
    'externalKey',
    'name',
    'modelId',
    'owner',
    'environment',
    'status',
    'attributes',
  ]);
  const externalKey = stringField(input.externalKey, 'externalKey', 3, 64);
  if (!/^[a-z][a-z0-9._-]{2,63}$/.test(externalKey))
    bad('资源标识格式不正确', {
      externalKey:
        '小写字母开头，3–64 字符，可用字母、数字、点、下划线或短横线',
    });
  const modelId = choice(
    input.modelId,
    models.map((model) => model.id),
    'modelId',
  );
  const model = models.find((model) => model.id === modelId)!;
  const rawAttributes = object(input.attributes);
  onlyKeys(
    rawAttributes,
    model.fields.map((field) => field.key),
  );
  const attributes: Record<string, AttributeValue> = {};
  for (const field of model.fields) {
    const value = attribute(
      rawAttributes[field.key],
      field,
      cis,
      previous?.attributes[field.key],
    );
    if (value !== undefined) attributes[field.key] = value;
  }
  return {
    externalKey,
    modelId,
    name: stringField(input.name, 'name', 2, 80),
    owner: stringField(input.owner, 'owner', 2, 60),
    environment: choice(
      input.environment,
      ['production', 'staging', 'development'],
      'environment',
    ),
    status: choice(
      input.status,
      ['active', 'maintenance', 'retired'],
      'status',
    ),
    attributes,
  };
}
export function uniqueAttributes(
  input: CIInput,
  models: CIModel[],
  cis: CI[],
  excludeId?: string,
) {
  for (const field of models.find((model) => model.id === input.modelId)!
    .fields) {
    const value = input.attributes[field.key];
    if (
      field.unique &&
      value !== undefined &&
      cis.some(
        (ci) =>
          ci.id !== excludeId &&
          ci.modelId === input.modelId &&
          ci.attributes[field.key] === value,
      )
    )
      bad('属性值必须唯一', {
        [`attributes.${field.key}`]: `${field.label}的值已存在（含退役资源）`,
      });
  }
}
export function modelField(
  raw: unknown,
  models: CIModel[],
  cis: CI[],
): ModelField {
  const value = object(raw);
  onlyKeys(value, [
    'key',
    'label',
    'description',
    'type',
    'required',
    'unique',
    'defaultValue',
    'options',
    'referenceModelId',
  ]);
  const key = stringField(value.key, 'key', 1, 40);
  if (
    !/^[a-z][a-zA-Z0-9_]*$/.test(key) ||
    Object.hasOwn(Object.prototype, key) ||
    key === 'prototype'
  )
    bad('字段标识须以小写字母开头，仅使用字母、数字和下划线');
  const type = choice(
    value.type,
    ['text', 'number', 'boolean', 'date', 'enum', 'reference'],
    'type',
  );
  for (const flag of ['required', 'unique'])
    if (value[flag] !== undefined && typeof value[flag] !== 'boolean')
      bad(`${flag} 必须为布尔值`);
  const field: ModelField = {
    key,
    label: stringField(value.label, 'label', 1, 40),
    description:
      value.description === undefined
        ? ''
        : stringField(value.description, 'description', 0, 160),
    type,
    required: value.required === true,
    unique: value.unique === true,
  };
  if (type === 'enum') {
    if (
      !Array.isArray(value.options) ||
      value.options.length < 1 ||
      value.options.length > 20
    )
      bad('枚举需要 1–20 个选项');
    field.options = (value.options as unknown[]).map((item) =>
      stringField(item, 'options', 1, 40),
    );
    if (new Set(field.options).size !== field.options.length)
      bad('枚举选项不能重复');
  } else if (value.options !== undefined) bad('仅枚举字段可以设置选项');
  if (type === 'reference')
    field.referenceModelId = choice(
      value.referenceModelId,
      models.map((model) => model.id),
      'referenceModelId',
    );
  else if (value.referenceModelId !== undefined)
    bad('仅引用字段可以设置目标模型');
  if (value.defaultValue !== undefined)
    field.defaultValue = attribute(
      value.defaultValue,
      { ...field, required: true },
      cis,
    );
  return field;
}
export function relationRuleValid(
  rule: RelationRule,
  edges: Relation[],
  cis: CI[],
) {
  const relevant = edges.filter(
    (edge) =>
      edge.type === rule.type &&
      cis.find((ci) => ci.id === edge.sourceId)?.modelId ===
        rule.sourceModelId &&
      cis.find((ci) => ci.id === edge.targetId)?.modelId === rule.targetModelId,
  );
  if (rule.cardinality === 'n:n') return;
  const sources = new Set<string>(),
    targets = new Set<string>();
  for (const edge of relevant) {
    if (
      targets.has(edge.targetId) ||
      (rule.cardinality === '1:1' && sources.has(edge.sourceId))
    )
      bad('关系超出模型规则基数，现存关系未修改');
    sources.add(edge.sourceId);
    targets.add(edge.targetId);
  }
}
