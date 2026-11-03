import type {
  CI,
  CIInput,
  CIModel,
  ImportPreview,
  ImportRequest,
  ImportRow,
} from './contracts';
import { parseCsv } from './csv';
import { effectiveFields } from './class-schema';
import {
  Problem,
  bad,
  ciInput,
  object,
  onlyKeys,
  stringField,
  uniqueAttributes,
} from './validation';

export const baseColumns = [
  'externalKey',
  'name',
  'modelId',
  'owner',
  'environment',
  'status',
];
export function importRequest(raw: unknown): ImportRequest {
  const input = object(raw);
  onlyKeys(input, ['csv', 'mapping', 'mode', 'previewId']);
  const csv = stringField(input.csv, 'csv', 1, 100_000).replace(/^\uFEFF/, '');
  if (
    input.mode !== undefined &&
    input.mode !== 'create' &&
    input.mode !== 'upsert'
  )
    bad('导入模式无效');
  const mapping =
    input.mapping === undefined ? undefined : object(input.mapping);
  if (
    mapping &&
    Object.values(mapping).some((value) => typeof value !== 'string')
  )
    bad('映射值必须为 CSV 列名');
  return {
    csv,
    mode: input.mode as ImportRequest['mode'],
    ...(mapping ? { mapping: mapping as Record<string, string> } : {}),
    ...(input.previewId === undefined
      ? {}
      : { previewId: stringField(input.previewId, 'previewId', 1, 100) }),
  };
}
export function importSignature(input: ImportRequest) {
  return JSON.stringify({
    csv: input.csv,
    mode: input.mode ?? 'create',
    mapping: input.mapping
      ? Object.entries(input.mapping).sort(([a], [b]) => a.localeCompare(b))
      : null,
  });
}
export function previewImport(
  input: ImportRequest,
  cis: CI[],
  models: CIModel[],
): ImportPreview {
  const records = parseCsv(input.csv),
    header = records.shift();
  if (
    !header ||
    header.cells.some((cell) => !cell.trim()) ||
    new Set(header.cells).size !== header.cells.length
  )
    return bad('CSV 表头不能为空或重复');
  const mapping =
    input.mapping ?? Object.fromEntries(baseColumns.map((key) => [key, key]));
  if (!input.mapping && header.cells.join(',') !== baseColumns.join(','))
    bad('CSV 表头必须与示例完全一致，或显式配置列映射');
  const targets = [
    ...baseColumns,
    ...models.flatMap((model) =>
      effectiveFields(model.id, models).map(
        (field) => `attributes.${field.key}`,
      ),
    ),
  ];
  onlyKeys(mapping, targets);
  if (
    baseColumns.some((key) => !mapping[key]) ||
    Object.values(mapping).some((column) => !header.cells.includes(column))
  )
    bad('请映射全部六个基础字段，列名必须存在于 CSV 表头');
  if (new Set(Object.values(mapping)).size !== Object.values(mapping).length)
    bad('一个 CSV 列只能映射到一个字段');
  if (!records.length || records.length > 200) bad('每批导入 1–200 行');
  const seen = new Set<string>();
  const staged = [...cis];
  const rows: ImportRow[] = records.map((record) => {
    let parsed: CIInput | null = null;
    const errors: string[] = [];
    let action: ImportRow['action'];
    let changes: ImportRow['changes'] = [];
    try {
      if (record.cells.length !== header.cells.length)
        bad('数据列数与表头不一致');
      const mapped = Object.fromEntries(
        Object.entries(mapping).map(([key, column]) => [
          key,
          record.cells[header.cells.indexOf(column)]!.trim(),
        ]),
      );
      const existing = cis.find((ci) => ci.externalKey === mapped.externalKey);
      if (seen.has(mapped.externalKey!)) bad('资源标识在本批次重复');
      seen.add(mapped.externalKey!);
      if (existing && input.mode !== 'upsert')
        bad('资源标识已存在；需要更新时请显式选择新增或更新模式');
      if (existing && existing.modelId !== mapped.modelId)
        bad('已存在资源的模型不能改变');
      const model = models.find((model) => model.id === mapped.modelId);
      if (!model) bad('资源模型不存在');
      const attributes = { ...(existing?.attributes ?? {}) };
      for (const [key, text] of Object.entries(mapped).filter(([key]) =>
        key.startsWith('attributes.'),
      )) {
        const fieldKey = key.slice(11),
          field = effectiveFields(model!.id, models).find(
            (field) => field.key === fieldKey,
          );
        if (!field) bad(`该模型没有属性 ${fieldKey}`);
        const type = field!.type;
        if (!text) delete attributes[fieldKey];
        else if (type === 'number' || type === 'integer') {
          if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(text))
            bad(`${field!.label}必须为数字`);
          attributes[fieldKey] = Number(text);
        } else if (type === 'boolean') {
          if (text !== 'true' && text !== 'false')
            bad(`${field!.label}必须为 true 或 false`);
          attributes[fieldKey] = text === 'true';
        } else attributes[fieldKey] = text;
      }
      parsed = ciInput(
        {
          ...Object.fromEntries(baseColumns.map((key) => [key, mapped[key]])),
          attributes,
        },
        models,
        cis,
        existing,
      );
      uniqueAttributes(parsed, models, staged, existing?.id);
      const flattened = (ci: CIInput) => ({
        ...Object.fromEntries(
          ['name', 'owner', 'environment', 'status'].map((key) => [
            key,
            ci[key as keyof CIInput],
          ]),
        ),
        ...Object.fromEntries(
          Object.entries(ci.attributes).map(([key, value]) => [
            `attributes.${key}`,
            value,
          ]),
        ),
      });
      const before = existing ? flattened(existing) : {},
        after = flattened(parsed);
      changes = [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter((key) => before[key] !== after[key])
        .map((key) => ({
          field: key,
          before: (before[key] ?? null) as string | number | boolean | null,
          after: (after[key] ?? null) as string | number | boolean | null,
        }));
      action = !existing ? 'create' : changes.length ? 'update' : 'unchanged';
      const candidate: CI = {
        ...parsed,
        id: existing?.id ?? `import-line-${record.line}`,
        revision: 1,
        createdAt: '',
        updatedAt: '',
      };
      if (existing)
        staged[staged.findIndex((ci) => ci.id === existing.id)] = candidate;
      else staged.push(candidate);
    } catch (error) {
      if (!(error instanceof Problem)) throw error;
      errors.push(
        error.message,
        ...Object.entries(error.fields ?? {}).map(
          ([key, value]) => `${key}: ${value}`,
        ),
      );
      action = 'conflict';
    }
    return { line: record.line, input: parsed, errors, action, changes };
  });
  // Reference validity uses the final candidate batch, including retirements.
  for (const row of rows) {
    if (!row.input || row.errors.length) continue;
    try {
      ciInput(
        row.input,
        models,
        staged,
        cis.find((ci) => ci.externalKey === row.input!.externalKey),
      );
    } catch (error) {
      if (!(error instanceof Problem)) throw error;
      row.errors.push(error.message, ...Object.values(error.fields ?? {}));
      row.action = 'conflict';
    }
  }
  const invalidCount = rows.filter((row) => row.errors.length).length;
  return {
    rows,
    validCount: rows.length - invalidCount,
    invalidCount,
    createdCount: rows.filter((row) => row.action === 'create').length,
    updatedCount: rows.filter((row) => row.action === 'update').length,
    unchangedCount: rows.filter((row) => row.action === 'unchanged').length,
  };
}
