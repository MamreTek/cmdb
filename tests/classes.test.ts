import { describe, expect, it } from 'vitest';
import { ApiClient } from '../src/shared/api/client';
import { createMockApi } from '../src/shared/api/mock';
import type { CIInput, ModelField } from '../src/shared/api/contracts';

const setup = () => {
  const mock = createMockApi({ latency: 0 });
  return { mock, api: new ApiClient(mock.transport) };
};
const ci: CIInput = {
  externalKey: 'demo.class-item',
  name: '示例分类资源',
  modelId: 'host',
  owner: '示例团队',
  environment: 'staging',
  status: 'active',
  attributes: {},
};
async function add(api: ApiClient, id: string, field: ModelField) {
  const model = (await api.models()).find((model) => model.id === id)!;
  return api.addField(id, { revision: model.revision!, field });
}
async function hierarchy(api: ApiClient) {
  for (const [id, name, parentId] of [
    ['linux', 'Linux主机', 'host'],
    ['ubuntu', 'Ubuntu主机', 'linux'],
    ['windows', 'Windows主机', 'host'],
  ])
    await api.createModel({
      id: id!,
      name: name!,
      parentId: parentId!,
      description: '',
    });
}

describe('CI Class inheritance and database-style fields', () => {
  it('browses class hierarchy, preserves origins and explicitly includes descendants in saved views', async () => {
    const { api } = setup();
    await hierarchy(api);
    expect(
      (await api.models()).find((model) => model.id === 'ubuntu'),
    ).toMatchObject({
      parentId: 'linux',
      fields: [
        { key: 'ipAddress', originModelId: 'host' },
        { key: 'operatingSystem', originModelId: 'host' },
      ],
    });
    expect(
      (await api.classTree())
        .find((node) => node.id === 'host')
        ?.children.find((node) => node.id === 'linux')?.children[0]?.id,
    ).toBe('ubuntu');
    const created = await api.create({
      ...ci,
      modelId: 'ubuntu',
      attributes: { ipAddress: '192.0.2.80' },
    });
    expect((await api.list({ modelId: 'host' })).total).toBe(3);
    const view = await api.saveView({
      name: '全部主机子类',
      query: { modelId: 'host', includeDescendants: 'true' },
    });
    expect((await api.list(view.query)).total).toBe(4);
    expect((await api.get(created.id)).modelId).toBe('ubuntu');
    await expect(
      api.list({ includeDescendants: 'true' }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('enforces declaration-subtree uniqueness and rejects overrides and descendant collisions atomically', async () => {
    const { api } = setup();
    await hierarchy(api);
    await add(api, 'host', {
      key: 'assetCode',
      label: '资产编码',
      description: '',
      type: 'varchar',
      maxLength: 12,
      unique: true,
    });
    await api.create({
      ...ci,
      modelId: 'linux',
      attributes: { assetCode: 'SAME' },
    });
    await expect(
      api.create({
        ...ci,
        externalKey: 'demo.windows',
        modelId: 'windows',
        attributes: { assetCode: 'SAME' },
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      add(api, 'ubuntu', {
        key: 'assetCode',
        label: '覆盖字段',
        description: '',
        type: 'text',
      }),
    ).rejects.toMatchObject({ status: 422 });
    await add(api, 'ubuntu', {
      key: 'leafCode',
      label: '本类字段',
      description: '',
      type: 'text',
    });
    const before = await api.models(),
      items = await api.allCIs();
    await expect(
      add(api, 'host', {
        key: 'leafCode',
        label: '父类冲突',
        description: '',
        type: 'text',
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(await api.models()).toEqual(before);
    expect(await api.allCIs()).toEqual(items);
  });
  it('previews and atomically backfills an ancestor field across descendants and invalidates their revisions', async () => {
    const { api } = setup();
    await hierarchy(api);
    await api.create({ ...ci, modelId: 'ubuntu' });
    const field: ModelField = {
      key: 'location',
      label: '位置',
      description: '',
      type: 'varchar',
      maxLength: 20,
      required: true,
      defaultValue: '示例机房',
    };
    const preview = await api.previewField('host', { revision: 1, field });
    expect(preview).toMatchObject({ total: 4, backfillCount: 4, errors: [] });
    expect(preview.affectedClasses?.map((model) => model.id)).toEqual([
      'host',
      'linux',
      'ubuntu',
      'windows',
    ]);
    await api.addField('host', { revision: 1, field });
    expect(
      (await api.models()).find((model) => model.id === 'ubuntu')?.revision,
    ).toBe(2);
    await expect(
      api.addField('ubuntu', {
        revision: 1,
        field: { key: 'stale', label: '旧版本', description: '', type: 'text' },
      }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(
      (
        await api.list({ modelId: 'host', includeDescendants: 'true' })
      ).items.every((item) => item.attributes.location === '示例机房'),
    ).toBe(true);
    expect(
      (await api.models()).find((model) => model.id === 'database')?.revision,
    ).toBe(1);
    const before = await api.allCIs(),
      schemas = await api.models();
    await expect(
      add(api, 'host', {
        key: 'uniqueDefault',
        label: '冲突默认值',
        description: '',
        type: 'varchar',
        unique: true,
        defaultValue: 'same',
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(await api.allCIs()).toEqual(before);
    expect(await api.models()).toEqual(schemas);
  });
  it('validates Unicode varchar length and signed integer boundaries without truncation or coercion', async () => {
    const { api } = setup();
    await api.createModel({ id: 'typed', name: '类型示例', description: '' });
    await add(api, 'typed', {
      key: 'code',
      label: '编码',
      description: '',
      type: 'varchar',
      maxLength: 2,
      required: true,
    });
    await add(api, 'typed', {
      key: 'count',
      label: '计数',
      description: '',
      type: 'integer',
    });
    expect(
      (
        await api.create({
          ...ci,
          modelId: 'typed',
          attributes: { code: '😀中', count: -2147483648 },
        })
      ).attributes,
    ).toEqual({ code: '😀中', count: -2147483648 });
    await api.create({
      ...ci,
      externalKey: 'demo.int-max',
      modelId: 'typed',
      attributes: { code: '中文', count: 2147483647 },
    });
    for (const attributes of [
      { code: '😀中文', count: 1 },
      { code: '中文', count: 2147483648 },
      { code: '中文', count: 0.5 },
      { code: '中文', count: '1' },
    ])
      await expect(
        api.create({
          ...ci,
          externalKey: 'demo.invalid',
          modelId: 'typed',
          attributes,
        }),
      ).rejects.toMatchObject({ status: 422 });
    await expect(
      add(api, 'typed', {
        key: 'badLength',
        label: '非法长度',
        description: '',
        type: 'varchar',
        maxLength: 0,
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      add(api, 'typed', {
        key: 'badRange',
        label: '非法范围',
        description: '',
        type: 'integer',
        minValue: 20,
        maxValue: 10,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('normalizes timezone timestamps, validates calendar/precision/range and compares canonical uniqueness', async () => {
    const { api } = setup();
    await api.createModel({ id: 'timed', name: '时间示例', description: '' });
    await add(api, 'timed', {
      key: 'observed',
      label: '观测时间',
      description: '',
      type: 'timestamp',
      unique: true,
    });
    expect(
      (
        await api.create({
          ...ci,
          modelId: 'timed',
          attributes: { observed: '2026-11-03T18:00:00+08:00' },
        })
      ).attributes.observed,
    ).toBe('2026-11-03T10:00:00.000Z');
    await expect(
      api.create({
        ...ci,
        externalKey: 'demo.same-time',
        modelId: 'timed',
        attributes: { observed: '2026-11-03T10:00:00Z' },
      }),
    ).rejects.toMatchObject({ status: 422 });
    for (const value of [
      '2026-11-03T10:00:00',
      '2026-02-30T10:00:00Z',
      '2026-11-03T10:00:00.0001Z',
      '2026-11-03T10:00:00-00:00',
      '1969-12-31T23:59:59Z',
      '2038-01-19T03:14:07.500Z',
      '2026-11-03T10:00:60Z',
    ])
      await expect(
        api.create({
          ...ci,
          externalKey: 'demo.bad-time',
          modelId: 'timed',
          attributes: { observed: value },
        }),
      ).rejects.toMatchObject({ status: 422 });
    await api.create({
      ...ci,
      externalKey: 'demo.min-time',
      modelId: 'timed',
      attributes: { observed: '1970-01-01T00:00:01Z' },
    });
    await api.create({
      ...ci,
      externalKey: 'demo.max-time',
      modelId: 'timed',
      attributes: { observed: '2038-01-19T03:14:07.499Z' },
    });
  });
  it('maps inherited typed CSV fields and rejects mixed invalid batches without partial writes', async () => {
    const { api } = setup();
    await hierarchy(api);
    await add(api, 'host', {
      key: 'capacity',
      label: '容量',
      description: '',
      type: 'integer',
      minValue: 0,
      maxValue: 100,
    });
    const mapping = {
      externalKey: 'externalKey',
      name: 'name',
      modelId: 'modelId',
      owner: 'owner',
      environment: 'environment',
      status: 'status',
      'attributes.capacity': 'capacity',
    };
    const csv =
      'externalKey,name,modelId,owner,environment,status,capacity\ndemo.child-import,示例子类主机,ubuntu,示例团队,staging,active,100';
    const preview = await api.previewImport({ csv, mapping });
    expect(preview.invalidCount).toBe(0);
    const result = await api.import({
      csv,
      mapping,
      previewId: preview.previewId,
    });
    expect(await api.get(result.ids[0]!)).toMatchObject({
      modelId: 'ubuntu',
      attributes: { capacity: 100 },
    });
    await expect(
      api.import({
        mapping,
        csv:
          csv.replace('demo.child-import', 'demo.invalid-1') +
          '\ndemo.invalid-2,示例溢出主机,linux,示例团队,staging,active,101',
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_INVALID' });
    expect((await api.summary()).total).toBe(7);
  });
  it('only previews migration and keeps schema, resources, logs and import tokens untouched', async () => {
    const { api } = setup();
    await api.createModel({ id: 'migrate', name: '迁移示例', description: '' });
    await add(api, 'migrate', {
      key: 'quantity',
      label: '数量',
      description: '',
      type: 'text',
    });
    await api.create({
      ...ci,
      modelId: 'migrate',
      attributes: { quantity: '42' },
    });
    const before = await api.allCIs(),
      models = await api.models(),
      changes = await api.changes();
    const csv =
      'externalKey,name,modelId,owner,environment,status\ndemo.still-valid,示例新资源,host,示例团队,staging,active';
    const token = await api.previewImport(csv);
    expect(
      await api.previewMigration('migrate', {
        revision: 2,
        field: {
          key: 'quantity',
          label: '数量',
          description: '',
          type: 'integer',
          minValue: 0,
          maxValue: 50,
        },
      }),
    ).toMatchObject({
      total: 1,
      backfillCount: 1,
      errors: [],
      changes: [
        {
          externalKey: ci.externalKey,
          modelId: 'migrate',
          before: '42',
          after: 42,
        },
      ],
    });
    expect(
      (
        await api.previewMigration('migrate', {
          revision: 2,
          field: {
            key: 'quantity',
            label: '数量',
            description: '',
            type: 'varchar',
            maxLength: 1,
          },
        })
      ).errors,
    ).toHaveLength(1);
    expect(await api.allCIs()).toEqual(before);
    expect(await api.models()).toEqual(models);
    expect(await api.changes()).toEqual(changes);
    await api.import({ csv, previewId: token.previewId });
  });
  it('keeps relationship rules exact, accepts subclass references and prevents excessive depth or reparenting', async () => {
    const { api, mock } = setup();
    await hierarchy(api);
    const child = await api.create({ ...ci, modelId: 'ubuntu' });
    await add(api, 'service', {
      key: 'hostRef',
      label: '主机引用',
      description: '',
      type: 'reference',
      referenceModelId: 'host',
    });
    expect(
      await api.create({
        ...ci,
        externalKey: 'demo.ref-child',
        modelId: 'service',
        attributes: { hostRef: child.id },
      }),
    ).toMatchObject({ attributes: { hostRef: child.id } });
    await expect(
      api.addRelation({
        sourceId: 'ci-demo-service',
        targetId: child.id,
        type: 'runs_on',
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      api.createModel({
        id: 'self',
        name: '自引用',
        description: '',
        parentId: 'self',
      }),
    ).rejects.toMatchObject({ status: 422 });
    let parent = 'ubuntu';
    for (let index = 0; index < 3; index++) {
      const id = 'level_' + index;
      await api.createModel({
        id,
        name: '层级' + index,
        description: '',
        parentId: parent,
      });
      parent = id;
    }
    await expect(
      api.createModel({
        id: 'too_deep',
        name: '过深层级',
        description: '',
        parentId: parent,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      (
        await mock.transport({
          method: 'PATCH',
          path: '/api/v1/models/host',
          body: { parentId: 'ubuntu' },
        })
      ).status,
    ).toBe(404);
  });
});
