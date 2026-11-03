import type {
  ApiRequest,
  CI,
  CIInput,
  CIQuery,
  Change,
  ImportPreview,
  ImportRow,
  Page,
  Relation,
  RelationInput,
  Transport,
} from './contracts';
import { models, seedData } from './seed';

class Problem extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
const bad = (message: string, fields?: Record<string, string>): never => {
  throw new Problem(422, 'VALIDATION_ERROR', message, fields);
};
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return bad('请求必须是 JSON 对象');
  return input as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  const invalid = Object.keys(value).filter((key) => !keys.includes(key));
  if (invalid.length) bad(`不支持的字段：${invalid.join(', ')}`);
}
function stringField(
  value: unknown,
  key: string,
  min: number,
  max: number,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.trim().length > max
  ) {
    return bad('请检查字段内容', { [key]: `请输入 ${min}–${max} 个字符` });
  }
  return value.trim();
}
function choice<T extends string>(
  value: unknown,
  values: readonly T[],
  key: string,
): T {
  if (typeof value !== 'string' || !values.includes(value as T))
    return bad('字段值不在允许范围内', { [key]: `可选：${values.join(', ')}` });
  return value as T;
}
function ciInput(raw: unknown): CIInput {
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
        '小写字母开头，使用字母、数字、点、下划线或短横线，3–64 字符',
    });
  const modelId = choice(
    input.modelId,
    ['host', 'service', 'database'],
    'modelId',
  );
  const model = models.find((item) => item.id === modelId)!;
  const sourceAttributes = object(input.attributes);
  onlyKeys(
    sourceAttributes,
    model.fields.map((field) => field.key),
  );
  const attributes: Record<string, string> = {};
  for (const field of model.fields) {
    const value = sourceAttributes[field.key];
    if (value === undefined) continue;
    const content = stringField(value, `attributes.${field.key}`, 0, 120);
    if (
      content &&
      field.format === 'ipv4' &&
      !/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(content)
    )
      bad('IPv4 地址格式不正确', {
        [`attributes.${field.key}`]: '请输入标准 IPv4 地址',
      });
    if (
      content &&
      field.format === 'ipv4' &&
      content.split('.').some((part) => Number(part) > 255)
    )
      bad('IPv4 地址超出范围', { [`attributes.${field.key}`]: '每段为 0–255' });
    if (content) attributes[field.key] = content;
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

interface CSVRecord {
  line: number;
  cells: string[];
}
function parseCsv(csv: string): CSVRecord[] {
  const rows: CSVRecord[] = [];
  let cells: string[] = [],
    cell = '',
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  const commit = () => {
    rows.push({ line: start, cells: [...cells, cell] });
    cells = [];
    cell = '';
    closed = false;
    start = line + 1;
  };
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index]!;
    if (quoted) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        cell += char;
        if (char === '\n') line++;
      }
      continue;
    }
    if (char === '"') {
      if (cell || closed)
        return bad(`第 ${line} 行：引号位置不正确`, {
          csv: '双引号必须从单元格开头开始',
        });
      quoted = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
      closed = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[index + 1] === '\n') index++;
      commit();
      line++;
      start = line;
    } else {
      if (closed)
        return bad(`第 ${line} 行：引号后存在额外字符`, {
          csv: '闭合引号后只能跟逗号或换行',
        });
      cell += char;
    }
  }
  if (quoted) return bad('CSV 引号未闭合', { csv: '请检查引号配对' });
  if (cell || cells.length || closed)
    rows.push({ line: start, cells: [...cells, cell] });
  return rows.filter((row) => row.cells.some((value) => value.trim() !== ''));
}

function importPreview(raw: unknown, cis: CI[]): ImportPreview {
  const input = object(raw);
  onlyKeys(input, ['csv']);
  const csv = stringField(input.csv, 'csv', 1, 100_000).replace(/^\uFEFF/, '');
  const records = parseCsv(csv);
  const header = records.shift();
  const keys = [
    'externalKey',
    'name',
    'modelId',
    'owner',
    'environment',
    'status',
  ];
  if (!header || header.cells.join(',') !== keys.join(','))
    return bad('CSV 表头必须与示例完全一致', { csv: keys.join(',') });
  if (!records.length || records.length > 200)
    return bad('每批导入 1–200 行', { csv: '请拆分批次或添加数据行' });
  const seen = new Set(cis.map((ci) => ci.externalKey));
  const rows: ImportRow[] = records.map((record) => {
    let input: CIInput | null = null;
    const errors: string[] = [];
    try {
      if (record.cells.length !== keys.length) bad('列数必须为 6');
      input = ciInput({
        ...Object.fromEntries(
          keys.map((key, index) => [key, record.cells[index]]),
        ),
        attributes: {},
      });
      if (seen.has(input.externalKey))
        errors.push('资源标识已存在或在本批次重复');
      seen.add(input.externalKey);
    } catch (error) {
      if (!(error instanceof Problem)) throw error;
      errors.push(
        error.message,
        ...Object.entries(error.fields ?? {}).map(
          ([field, message]) => `${field}: ${message}`,
        ),
      );
    }
    return { line: record.line, input, errors };
  });
  const invalidCount = rows.filter((row) => row.errors.length > 0).length;
  return { rows, validCount: rows.length - invalidCount, invalidCount };
}

function pageParams(params: URLSearchParams): {
  page: number;
  pageSize: number;
} {
  const page = Number(params.get('page') ?? '1'),
    pageSize = Number(params.get('pageSize') ?? '10');
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100_000 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    bad('分页参数超出范围');
  return { page, pageSize };
}
function paginate<T>(items: T[], params: URLSearchParams): Page<T> {
  const { page, pageSize } = pageParams(params);
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
  };
}
function allowQuery(params: URLSearchParams, keys: string[]) {
  for (const key of params.keys())
    if (!keys.includes(key)) bad(`不支持的查询参数：${key}`);
}
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

export function createMockApi(options: { latency?: number } = {}) {
  let store = seedData(),
    fail = false,
    sequence = 0;
  const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
  const findCI = (key: string) => {
    const ci = store.cis.find((item) => item.id === key);
    if (!ci) throw new Problem(404, 'NOT_FOUND', '配置项不存在');
    return ci;
  };
  const log = (ciId: string, action: Change['action'], summary: string) => {
    store.changes.unshift({
      id: id('change'),
      ciId,
      action,
      summary,
      actor: '演示操作员（模拟）',
      createdAt: new Date().toISOString(),
    });
  };
  const unique = (input: CIInput) => {
    if (store.cis.some((item) => item.externalKey === input.externalKey))
      throw new Problem(409, 'DUPLICATE_KEY', '资源标识已经存在', {
        externalKey: '请使用不同的资源标识',
      });
  };
  const create = (
    input: CIInput,
    action: 'created' | 'imported' = 'created',
  ) => {
    unique(input);
    const now = new Date().toISOString();
    const ci = {
      ...input,
      id: id('ci'),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    store.cis.unshift(ci);
    log(ci.id, action, `${action === 'imported' ? '导入' : '建立'} ${ci.name}`);
    return ci;
  };
  function route({ method, path, body }: ApiRequest): {
    status: number;
    data: unknown;
  } {
    const url = new URL(path, 'https://cmdb.example.invalid');
    const pathname = url.pathname,
      params = url.searchParams;
    if (method === 'GET' && pathname === '/api/v1/models')
      return { status: 200, data: models };
    if (method === 'GET' && pathname === '/api/v1/summary')
      return {
        status: 200,
        data: {
          total: store.cis.length,
          active: store.cis.filter((ci) => ci.status === 'active').length,
          relations: store.relations.length,
          modelCounts: Object.fromEntries(
            models.map((model) => [
              model.id,
              store.cis.filter((ci) => ci.modelId === model.id).length,
            ]),
          ),
        },
      };
    if (pathname === '/api/v1/cis' && method === 'GET') {
      allowQuery(params, [
        'q',
        'modelId',
        'environment',
        'status',
        'sortBy',
        'sortOrder',
        'page',
        'pageSize',
      ]);
      const query: CIQuery = {};
      if (params.has('modelId'))
        query.modelId = choice(
          params.get('modelId'),
          ['host', 'service', 'database'] as const,
          'modelId',
        );
      if (params.has('environment'))
        query.environment = choice(
          params.get('environment'),
          ['production', 'staging', 'development'] as const,
          'environment',
        );
      if (params.has('status'))
        query.status = choice(
          params.get('status'),
          ['active', 'maintenance', 'retired'] as const,
          'status',
        );
      const sortBy = choice(
        params.get('sortBy') ?? 'updatedAt',
        ['updatedAt', 'name'],
        'sortBy',
      );
      const sortOrder = choice(
        params.get('sortOrder') ?? 'desc',
        ['asc', 'desc'],
        'sortOrder',
      );
      const search = (params.get('q') ?? '').trim().toLocaleLowerCase();
      if (search.length > 120) bad('搜索最多 120 字');
      const items = store.cis.filter(
        (ci) =>
          (!query.modelId || ci.modelId === query.modelId) &&
          (!query.environment || ci.environment === query.environment) &&
          (!query.status || ci.status === query.status) &&
          (!search ||
            `${ci.name} ${ci.externalKey} ${ci.owner}`
              .toLocaleLowerCase()
              .includes(search)),
      );
      items.sort((a, b) => {
        const primary =
          a[sortBy].localeCompare(b[sortBy], 'zh-CN') *
          (sortOrder === 'asc' ? 1 : -1);
        return primary || a.id.localeCompare(b.id);
      });
      return { status: 200, data: paginate(items, params) };
    }
    if (pathname === '/api/v1/cis' && method === 'POST')
      return { status: 201, data: create(ciInput(body)) };
    const match = /^\/api\/v1\/cis\/([^/]+)$/.exec(pathname);
    if (match && (method === 'GET' || method === 'PATCH')) {
      const ci = findCI(decodeURIComponent(match[1]!));
      if (method === 'GET') return { status: 200, data: ci };
      const update = object(body);
      onlyKeys(update, [
        'name',
        'owner',
        'environment',
        'status',
        'attributes',
        'revision',
      ]);
      if (!Number.isSafeInteger(update.revision) || Number(update.revision) < 1)
        bad('更新必须携带正整数 revision');
      if (update.revision !== ci.revision)
        throw new Problem(
          409,
          'REVISION_CONFLICT',
          '配置项已更新，请关闭编辑并刷新详情后重试',
        );
      const input = ciInput({
        name: update.name,
        owner: update.owner,
        environment: update.environment,
        status: update.status,
        attributes: update.attributes,
        externalKey: ci.externalKey,
        modelId: ci.modelId,
      });
      const changed = {
        ...ci,
        ...input,
        revision: ci.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      store.cis[store.cis.indexOf(ci)] = changed;
      log(
        ci.id,
        'updated',
        `更新 ${ci.name} · 版本 ${changed.revision} · 状态 ${changed.status}`,
      );
      return { status: 200, data: changed };
    }
    if (pathname === '/api/v1/relations' && method === 'GET') {
      allowQuery(params, ['ciId']);
      const ciId = params.get('ciId');
      if (ciId) findCI(ciId);
      return {
        status: 200,
        data: store.relations.filter(
          (relation) =>
            !ciId || relation.sourceId === ciId || relation.targetId === ciId,
        ),
      };
    }
    if (pathname === '/api/v1/relations' && method === 'POST') {
      const input = object(body);
      onlyKeys(input, ['sourceId', 'targetId', 'type']);
      const relation: RelationInput = {
        sourceId: stringField(input.sourceId, 'sourceId', 1, 100),
        targetId: stringField(input.targetId, 'targetId', 1, 100),
        type: choice(input.type, ['depends_on', 'runs_on'], 'type'),
      };
      const source = findCI(relation.sourceId),
        target = findCI(relation.targetId);
      if (source.id === target.id) bad('配置项不能与自身建立关系');
      if (source.status === 'retired' || target.status === 'retired')
        bad('退役配置项不能新增关系');
      if (
        store.relations.some(
          (item) =>
            item.sourceId === source.id &&
            item.targetId === target.id &&
            item.type === relation.type,
        )
      )
        throw new Problem(409, 'DUPLICATE_RELATION', '相同关系已经存在');
      const result: Relation = {
        ...relation,
        id: id('rel'),
        createdAt: new Date().toISOString(),
      };
      store.relations.unshift(result);
      for (const endpoint of [source, target])
        log(
          endpoint.id,
          'relation_added',
          `${source.name} → ${target.name} · ${relation.type}`,
        );
      return { status: 201, data: result };
    }
    const relationMatch = /^\/api\/v1\/relations\/([^/]+)$/.exec(pathname);
    if (relationMatch && method === 'DELETE') {
      const relation = store.relations.find(
        (item) => item.id === decodeURIComponent(relationMatch[1]!),
      );
      if (!relation) throw new Problem(404, 'NOT_FOUND', '关系不存在');
      store.relations = store.relations.filter(
        (item) => item.id !== relation.id,
      );
      const source = findCI(relation.sourceId),
        target = findCI(relation.targetId);
      for (const endpoint of [source, target])
        log(
          endpoint.id,
          'relation_removed',
          `移除 ${source.name} → ${target.name} · ${relation.type}`,
        );
      return { status: 200, data: { id: relation.id } };
    }
    if (pathname === '/api/v1/changes' && method === 'GET') {
      allowQuery(params, ['ciId', 'page', 'pageSize']);
      const ciId = params.get('ciId');
      if (ciId) findCI(ciId);
      return {
        status: 200,
        data: paginate(
          store.changes.filter((change) => !ciId || change.ciId === ciId),
          params,
        ),
      };
    }
    if (
      (pathname === '/api/v1/imports/preview' ||
        pathname === '/api/v1/imports') &&
      method === 'POST'
    ) {
      const preview = importPreview(body, store.cis);
      if (pathname.endsWith('/preview')) return { status: 200, data: preview };
      if (preview.invalidCount)
        throw new Problem(
          422,
          'IMPORT_INVALID',
          '导入包含无效行，未写入任何数据',
          { csv: '重新预览并修复所有行后提交' },
        );
      const ids = preview.rows.map((row) => create(row.input!, 'imported').id);
      return { status: 201, data: { ids, createdCount: ids.length } };
    }
    throw new Problem(404, 'NOT_FOUND', 'API 路径或方法不存在');
  }
  const transport: Transport = async (request) => {
    const requestId = `mock-${++sequence}`;
    await wait(options.latency ?? 220, request.signal);
    try {
      if (fail) {
        fail = false;
        throw new Problem(
          503,
          'SIMULATED_FAILURE',
          '模拟服务暂时不可用，请重试',
        );
      }
      const result = route(request);
      return {
        status: result.status,
        body: structuredClone({ data: result.data, requestId }),
      };
    } catch (error) {
      if (!(error instanceof Problem)) throw error;
      return {
        status: error.status,
        body: {
          error: {
            code: error.code,
            message: error.message,
            ...(error.fields ? { fields: error.fields } : {}),
          },
          requestId,
        },
      };
    }
  };
  return {
    transport,
    failNext: () => {
      fail = true;
    },
    reset: () => {
      store = seedData();
      fail = false;
    },
  };
}
