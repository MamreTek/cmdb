import type {
  ApiRequest,
  CI,
  CIInput,
  CIModel,
  CIQuery,
  Change,
  SchemaPreview,
  RelationRule,
  SavedView,
  Page,
  Relation,
  RelationInput,
  Transport,
} from './contracts';
import { models as seedModels, seedData } from './seed';

import {
  Problem,
  bad,
  object,
  onlyKeys,
  stringField,
  choice,
  ciInput,
  uniqueAttributes,
  modelField,
  relationRuleValid,
  timestampValue,
} from './validation';
import { previewImport, importRequest, importSignature } from './imports';
import {
  classLineage,
  classTree,
  effectiveFields,
  isWithinClass,
  publicModel,
} from './class-schema';

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
  let models = structuredClone(seedModels).map((model) => ({
    ...model,
    revision: 1,
  })) as CIModel[];
  const seedRules = (): RelationRule[] =>
    [
      ...seedModels.flatMap((source) =>
        seedModels.map((target) => ({
          sourceModelId: source.id,
          targetModelId: target.id,
          type: 'depends_on' as const,
        })),
      ),
      {
        sourceModelId: 'service',
        targetModelId: 'host',
        type: 'runs_on' as const,
      },
      {
        sourceModelId: 'database',
        targetModelId: 'host',
        type: 'runs_on' as const,
      },
    ].map((rule, index) => ({
      ...rule,
      id: `rule-${index}`,
      cardinality: 'n:n',
      revision: 1,
    }));
  let rules = seedRules(),
    views: SavedView[] = [],
    epoch = 0;
  const previews = new Map<string, { epoch: number; signature: string }>();
  const id = (prefix: string) => {
    // getRandomValues is also available on private HTTP origins used for LAN demos.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    return `${prefix}-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
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
    uniqueAttributes(input, models, store.cis);
  };
  const create = (
    input: CIInput,
    action: 'created' | 'imported' = 'created',
  ) => {
    unique(input);
    const now = new Date().toISOString();
    const ci: CI = {
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
      return {
        status: 200,
        data: models.map((model) => publicModel(model, models)),
      };
    if (method === 'GET' && pathname === '/api/v1/class-tree')
      return { status: 200, data: classTree(models) };
    if (method === 'POST' && pathname === '/api/v1/models') {
      const value = object(body);
      onlyKeys(value, ['id', 'name', 'description', 'parentId']);
      const modelId = stringField(value.id, 'id', 2, 40);
      if (
        !/^[a-z][a-z0-9_]+$/.test(modelId) ||
        ['constructor', 'prototype'].includes(modelId)
      )
        bad('模型标识仅允许小写字母、数字和下划线，以字母开头');
      if (models.some((model) => model.id === modelId))
        throw new Problem(409, 'DUPLICATE_MODEL', '模型标识已存在');
      if (models.length >= 20) bad('原型最多 20 个模型');
      const parentId =
        value.parentId === undefined
          ? undefined
          : choice(
              value.parentId,
              models.map((model) => model.id),
              'parentId',
            );
      if (parentId && classLineage(parentId, models).length >= 6)
        bad('CI Class 原型最多6层');
      const model: CIModel = {
        id: modelId,
        name: stringField(value.name, 'name', 2, 40),
        description: stringField(
          value.description ?? '',
          'description',
          0,
          160,
        ),
        fields: [],
        revision: 1,
        ...(parentId ? { parentId } : {}),
      };
      models.push(model);
      return { status: 201, data: publicModel(model, models) };
    }
    const fieldMatch = /^\/api\/v1\/models\/([^/]+)\/fields(\/preview)?$/.exec(
      pathname,
    );
    const migrationMatch =
      /^\/api\/v1\/models\/([^/]+)\/fields\/([^/]+)\/migration-preview$/.exec(
        pathname,
      );
    if (method === 'POST' && (fieldMatch || migrationMatch)) {
      const modelId = decodeURIComponent((fieldMatch ?? migrationMatch)![1]!);
      const model = models.find((model) => model.id === modelId);
      if (!model) throw new Problem(404, 'NOT_FOUND', '模型不存在');
      const value = object(body);
      onlyKeys(value, ['revision', 'field']);
      if (value.revision !== model.revision)
        throw new Problem(409, 'REVISION_CONFLICT', '模型已更新，请刷新后重试');
      const field = modelField(value.field, models, store.cis);
      const affected = models.filter((item) =>
        isWithinClass(item.id, model.id, models),
      );
      if (migrationMatch) {
        if (
          field.key !== decodeURIComponent(migrationMatch[2]!) ||
          !model.fields.some((item) => item.key === field.key)
        )
          bad('只可预览本类声明字段，标识固定，继承字段请在声明类操作');
      } else if (
        affected.some((item) =>
          effectiveFields(item.id, models).some(
            (item) => item.key === field.key,
          ),
        )
      )
        bad('字段标识与本类、祖先或子类字段冲突，不允许覆盖继承字段');
      const schemas = models.map((item) => {
        if (!affected.some((affected) => affected.id === item.id)) return item;
        return {
          ...item,
          revision: item.revision! + 1,
          fields:
            item.id === model.id
              ? migrationMatch
                ? item.fields.map((item) =>
                    item.key === field.key ? field : item,
                  )
                : [...item.fields, field]
              : item.fields,
        };
      });
      if (
        affected.some((item) => effectiveFields(item.id, schemas).length > 25)
      )
        bad('本类或子类有效字段超过原型25字段上限');
      const preview: SchemaPreview = {
        total: 0,
        backfillCount: 0,
        errors: [],
        affectedClasses: affected.map((item) => ({
          id: item.id,
          name: item.name,
          revision: item.revision!,
          ciCount: store.cis.filter((ci) => ci.modelId === item.id).length,
        })),
        ...(migrationMatch ? { changes: [] } : {}),
      };
      const replacements: CI[] = [];
      const untouched = store.cis.filter(
        (ci) => !isWithinClass(ci.modelId, model.id, models),
      );
      for (const ci of store.cis.filter((ci) =>
        isWithinClass(ci.modelId, model.id, models),
      )) {
        preview.total++;
        try {
          const { externalKey, name, modelId, owner, environment, status } = ci;
          const attributes = { ...ci.attributes };
          // A preview may parse an exact numeric string, but never truncates data.
          if (
            migrationMatch &&
            field.type === 'integer' &&
            typeof attributes[field.key] === 'string' &&
            /^-?(0|[1-9]\d*)$/.test(String(attributes[field.key]))
          )
            attributes[field.key] = Number(attributes[field.key]);
          const normalized = ciInput(
            {
              externalKey,
              name,
              modelId,
              owner,
              environment,
              status,
              attributes,
            },
            schemas,
            store.cis,
            ci,
          );
          uniqueAttributes(
            normalized,
            schemas,
            [...untouched, ...replacements],
            ci.id,
          );
          const changed = [
            ...new Set([
              ...Object.keys(normalized.attributes),
              ...Object.keys(ci.attributes),
            ]),
          ].some((key) => normalized.attributes[key] !== ci.attributes[key]);
          if (changed) preview.backfillCount++;
          if (
            migrationMatch &&
            normalized.attributes[field.key] !== ci.attributes[field.key]
          )
            preview.changes!.push({
              externalKey: ci.externalKey,
              modelId: ci.modelId,
              before: ci.attributes[field.key] ?? null,
              after: normalized.attributes[field.key] ?? null,
            });
          replacements.push({
            ...ci,
            ...normalized,
            revision: ci.revision + (changed ? 1 : 0),
            updatedAt: changed ? new Date().toISOString() : ci.updatedAt,
          });
        } catch (error) {
          if (!(error instanceof Problem)) throw error;
          preview.errors.push({
            externalKey: ci.externalKey,
            message: [error.message, ...Object.values(error.fields ?? {})].join(
              '；',
            ),
          });
        }
      }
      if (migrationMatch || fieldMatch![2])
        return { status: 200, data: preview };
      if (preview.errors.length)
        bad('模型变更与本类或子类存量数据不兼容，未修改任何模型或资源');
      models = schemas;
      for (const ci of replacements) {
        const previous = findCI(ci.id);
        store.cis[store.cis.indexOf(previous)] = ci;
        if (ci.revision !== previous.revision)
          log(
            ci.id,
            'schema_backfilled',
            '模型字段 ' + field.label + ' 默认值回填 · 版本 ' + ci.revision,
          );
      }
      return {
        status: 201,
        data: publicModel(
          models.find((item) => item.id === model.id)!,
          models,
        ),
      };
    }
    if (pathname === '/api/v1/relation-rules' && method === 'GET')
      return { status: 200, data: rules };
    const ruleMatch = /^\/api\/v1\/relation-rules\/([^/]+)$/.exec(pathname);
    if (
      (pathname === '/api/v1/relation-rules' && method === 'POST') ||
      (ruleMatch && method === 'PATCH')
    ) {
      const value = object(body);
      let rule: RelationRule;
      if (ruleMatch) {
        onlyKeys(value, ['revision', 'cardinality']);
        const existing = rules.find(
          (rule) => rule.id === decodeURIComponent(ruleMatch[1]!),
        );
        if (!existing) throw new Problem(404, 'NOT_FOUND', '关系规则不存在');
        if (value.revision !== existing.revision)
          throw new Problem(409, 'REVISION_CONFLICT', '关系规则已更新，请刷新');
        rule = {
          ...existing,
          cardinality: choice(
            value.cardinality,
            ['1:1', '1:n', 'n:n'],
            'cardinality',
          ),
          revision: existing.revision + 1,
        };
      } else {
        onlyKeys(value, [
          'sourceModelId',
          'targetModelId',
          'type',
          'cardinality',
        ]);
        rule = {
          id: id('rule'),
          sourceModelId: choice(
            value.sourceModelId,
            models.map((model) => model.id),
            'sourceModelId',
          ),
          targetModelId: choice(
            value.targetModelId,
            models.map((model) => model.id),
            'targetModelId',
          ),
          type: choice(value.type, ['depends_on', 'runs_on'], 'type'),
          cardinality: choice(
            value.cardinality,
            ['1:1', '1:n', 'n:n'],
            'cardinality',
          ),
          revision: 1,
        };
        if (
          rules.some(
            (item) =>
              item.sourceModelId === rule.sourceModelId &&
              item.targetModelId === rule.targetModelId &&
              item.type === rule.type,
          )
        )
          throw new Problem(
            409,
            'DUPLICATE_RULE',
            '模型关系规则已存在，请编辑基数',
          );
        if (rules.length >= 100) bad('原型最多 100 条模型关系规则');
      }
      relationRuleValid(rule, store.relations, store.cis);
      if (ruleMatch)
        rules[rules.findIndex((item) => item.id === rule.id)] = rule;
      else rules.push(rule);
      return { status: ruleMatch ? 200 : 201, data: rule };
    }
    if (pathname === '/api/v1/views' && method === 'GET')
      return { status: 200, data: views };
    if (pathname === '/api/v1/views' && method === 'POST') {
      const value = object(body);
      onlyKeys(value, ['name', 'query']);
      const name = stringField(value.name, 'name', 1, 40),
        query = object(value.query);
      onlyKeys(query, [
        'q',
        'modelId',
        'environment',
        'status',
        'owner',
        'attributeKey',
        'attributeValue',
        'sortBy',
        'sortOrder',
        'includeDescendants',
      ]);
      if (Object.values(query).some((value) => typeof value !== 'string'))
        bad('视图查询值须为字符串');
      route({
        method: 'GET',
        path: `/api/v1/cis?${new URLSearchParams(query as Record<string, string>)}`,
      });
      if (views.some((view) => view.name === name))
        throw new Problem(409, 'DUPLICATE_VIEW', '视图名称已存在');
      if (views.length >= 20) bad('原型最多 20 个保存视图');
      const view: SavedView = { id: id('view'), name, query: query as CIQuery };
      views.push(view);
      return { status: 201, data: view };
    }
    const viewMatch = /^\/api\/v1\/views\/([^/]+)$/.exec(pathname);
    if (method === 'DELETE' && viewMatch) {
      const view = views.find(
        (view) => view.id === decodeURIComponent(viewMatch[1]!),
      );
      if (!view) throw new Problem(404, 'NOT_FOUND', '视图不存在');
      views = views.filter((item) => item.id !== view.id);
      return { status: 200, data: { id: view.id } };
    }
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
        'owner',
        'attributeKey',
        'attributeValue',
        'includeDescendants',
      ]);
      const query: CIQuery = {};
      if (params.has('modelId'))
        query.modelId = choice(
          params.get('modelId'),
          models.map((model) => model.id),
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
      const owner = params.has('owner')
        ? stringField(params.get('owner'), 'owner', 1, 60)
        : undefined;
      const attributeKey = params.get('attributeKey');
      let attributeValue = params.get('attributeValue');
      if (attributeKey !== null || attributeValue !== null) {
        if (
          !query.modelId ||
          !attributeKey ||
          attributeValue === null ||
          Array.from(attributeValue).length >
            (effectiveFields(query.modelId, models).find(
              (field) => field.key === attributeKey,
            )?.maxLength ?? 120) ||
          !effectiveFields(query.modelId, models).some(
            (field) => field.key === attributeKey,
          )
        )
          bad('属性查询需要有效模型、字段与等值条件');
        if (
          attributeValue &&
          effectiveFields(query.modelId!, models).find(
            (field) => field.key === attributeKey,
          )?.type === 'timestamp'
        )
          attributeValue = timestampValue(attributeValue, 'attributeValue');
      }
      const includeDescendants = params.has('includeDescendants')
        ? choice(
            params.get('includeDescendants'),
            ['true', 'false'],
            'includeDescendants',
          ) === 'true'
        : false;
      if (includeDescendants && !query.modelId)
        bad('包含子类需要先选择CI Class');
      const items = store.cis.filter(
        (ci) =>
          (!query.modelId ||
            (includeDescendants
              ? isWithinClass(ci.modelId, query.modelId, models)
              : ci.modelId === query.modelId)) &&
          (!query.environment || ci.environment === query.environment) &&
          (!query.status || ci.status === query.status) &&
          (!owner || ci.owner === owner) &&
          (!attributeKey ||
            String(ci.attributes[attributeKey] ?? '') === attributeValue) &&
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
      return { status: 201, data: create(ciInput(body, models, store.cis)) };
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
      const input = ciInput(
        {
          name: update.name,
          owner: update.owner,
          environment: update.environment,
          status: update.status,
          attributes: update.attributes,
          externalKey: ci.externalKey,
          modelId: ci.modelId,
        },
        models,
        store.cis,
        ci,
      );
      uniqueAttributes(input, models, store.cis, ci.id);
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
      const rule = rules.find(
        (rule) =>
          rule.sourceModelId === source.modelId &&
          rule.targetModelId === target.modelId &&
          rule.type === relation.type,
      );
      if (!rule) bad('该模型组合尚未定义此关系，请先配置模型关系规则');
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
      relationRuleValid(rule!, [...store.relations, result], store.cis);
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
      const request = importRequest(body);
      if (
        !pathname.endsWith('/preview') &&
        (request.mode === 'upsert' || request.previewId)
      ) {
        const prior = request.previewId
          ? previews.get(request.previewId)
          : undefined;
        if (
          !prior ||
          prior.epoch !== epoch ||
          prior.signature !== importSignature(request)
        )
          throw new Problem(
            409,
            'PREVIEW_STALE',
            '预览已失效，请重新校验并确认差异',
          );
      }
      const preview = previewImport(request, store.cis, models);
      if (pathname.endsWith('/preview')) {
        const previewId = id('preview');
        if (previews.size >= 20) previews.delete(previews.keys().next().value!);
        previews.set(previewId, { epoch, signature: importSignature(request) });
        return { status: 200, data: { ...preview, previewId } };
      }
      if (preview.invalidCount)
        throw new Problem(
          422,
          'IMPORT_INVALID',
          '导入包含无效行，未写入任何数据',
          { csv: '重新预览并修复所有行后提交' },
        );
      const ids: string[] = [];
      for (const row of preview.rows) {
        const input = row.input!,
          existing = store.cis.find(
            (ci) => ci.externalKey === input.externalKey,
          );
        if (row.action === 'unchanged') {
          ids.push(existing!.id);
          continue;
        }
        const source = {
          kind: 'csv' as const,
          label: 'CSV 演示导入',
          at: new Date().toISOString(),
        };
        if (existing) {
          const changed: CI = {
            ...existing,
            ...input,
            source,
            revision: existing.revision + 1,
            updatedAt: source.at,
          };
          store.cis[store.cis.indexOf(existing)] = changed;
          log(
            existing.id,
            'imported',
            `CSV 更新 ${changed.name} · ${row.changes?.map((change) => change.field).join(', ')} · 版本 ${changed.revision}`,
          );
          ids.push(existing.id);
        } else {
          const ci = create(input, 'imported');
          ci.source = source;
          ids.push(ci.id);
        }
      }
      return {
        status: 201,
        data: {
          ids,
          createdCount: preview.createdCount,
          updatedCount: preview.updatedCount,
          unchangedCount: preview.unchangedCount,
        },
      };
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
      const requestPath = new URL(request.path, 'https://cmdb.example.invalid')
        .pathname;
      if (
        request.method !== 'GET' &&
        !requestPath.endsWith('/preview') &&
        !requestPath.endsWith('/migration-preview')
      )
        epoch++;
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
      models = structuredClone(seedModels).map((model) => ({
        ...model,
        revision: 1,
      }));
      rules = seedRules();
      views = [];
      epoch++;
      previews.clear();
      fail = false;
    },
  };
}
