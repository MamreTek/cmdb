import { describe, expect, it } from 'vitest';
import { ApiClient } from '../src/shared/api/client';
import { createMockApi } from '../src/shared/api/mock';
import type { CI, CIInput, ModelField } from '../src/shared/api/contracts';
import { seedData } from '../src/shared/api/seed';
import {
  serviceDependencies,
  type DependencyNode,
} from '../src/shared/dependency-tree';

const setup = () => {
  const mock = createMockApi({ latency: 0 });
  return { mock, api: new ApiClient(mock.transport) };
};
const input: CIInput = {
  externalKey: 'demo.config-host',
  name: '示例配置节点',
  modelId: 'host',
  owner: '示例团队',
  environment: 'staging',
  status: 'active',
  attributes: {},
};
const update = (ci: CI) => {
  const { name, owner, environment, status, attributes, revision } = ci;
  return { name, owner, environment, status, attributes, revision };
};
async function field(api: ApiClient, value: ModelField, modelId = 'host') {
  const model = (await api.models()).find((model) => model.id === modelId)!;
  return api.addField(modelId, { revision: model.revision!, field: value });
}

describe('configurable inventory contracts', () => {
  it('preserves existing references to retired CIs but rejects new references to a batch-retired target atomically', async () => {
    const { api } = setup();
    await field(api, {
      key: 'peer',
      label: '关联节点',
      type: 'reference',
      referenceModelId: 'host',
      description: '',
    });
    const ci = await api.create({
      ...input,
      attributes: { peer: 'ci-demo-host-01' },
    });
    const target = await api.get('ci-demo-host-01');
    await api.update(target.id, { ...update(target), status: 'retired' });
    expect(
      await api.update(ci.id, { ...update(ci), owner: '示例接管团队' }),
    ).toMatchObject({ attributes: { peer: target.id } });
    await expect(
      api.create({
        ...input,
        externalKey: 'demo.new-reference',
        attributes: { peer: target.id },
      }),
    ).rejects.toMatchObject({ status: 422 });
    const active = await api.update(target.id, {
      ...update(await api.get(target.id)),
      status: 'active',
    });
    const request = {
      csv: 'externalKey,name,modelId,owner,environment,status,peer\ndemo.web-01,示例应用节点 01,host,示例团队,production,retired,\ndemo.batch-reference,示例新节点,host,示例团队,staging,active,ci-demo-host-01',
      mode: 'upsert' as const,
      mapping: {
        externalKey: 'externalKey',
        name: 'name',
        modelId: 'modelId',
        owner: 'owner',
        environment: 'environment',
        status: 'status',
        'attributes.peer': 'peer',
      },
    };
    const preview = await api.previewImport(request);
    expect(preview.invalidCount).toBe(1);
    await expect(
      api.import({ ...request, previewId: preview.previewId }),
    ).rejects.toMatchObject({ code: 'IMPORT_INVALID' });
    expect(await api.get(target.id)).toEqual(active);
    expect((await api.list({ q: 'demo.batch-reference' })).total).toBe(0);
  });
  it('previews required-field impact without writes and atomically backfills defaults with revisions', async () => {
    const { api } = setup();
    const definition: ModelField = {
      key: 'costCenter',
      label: '成本中心',
      description: '',
      type: 'text',
      required: true,
    };
    expect(
      await api.previewField('host', { revision: 1, field: definition }),
    ).toMatchObject({
      total: 3,
      backfillCount: 0,
      errors: expect.arrayContaining([
        expect.objectContaining({ externalKey: 'demo.web-01' }),
      ]),
    });
    await expect(field(api, definition)).rejects.toMatchObject({ status: 422 });
    expect(
      (await api.models()).find((model) => model.id === 'host')?.revision,
    ).toBe(1);
    const request = {
      revision: 1,
      field: { ...definition, defaultValue: 'demo-center' },
    };
    expect(await api.previewField('host', request)).toEqual({
      total: 3,
      backfillCount: 3,
      errors: [],
    });
    await api.addField('host', request);
    const ci = await api.get('ci-demo-host-01');
    expect(ci).toMatchObject({
      revision: 2,
      attributes: { costCenter: 'demo-center', ipAddress: '192.0.2.10' },
    });
    expect((await api.changes({ ciId: ci.id })).items[0]?.action).toBe(
      'schema_backfilled',
    );
    await expect(
      api.addField('host', {
        ...request,
        field: { ...definition, key: 'stale' },
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      api.update(ci.id, { ...update(ci), revision: 1 }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });
  it('rejects a unique default that would collide, without changing any CI or schema', async () => {
    const { api } = setup();
    const before = await api.allCIs();
    await expect(
      field(api, {
        key: 'serial',
        label: '序列号',
        description: '',
        type: 'text',
        unique: true,
        defaultValue: 'same',
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(await api.allCIs()).toEqual(before);
    expect(
      (await api.models()).find((model) => model.id === 'host')?.fields,
    ).toHaveLength(2);
  });
  it('supports custom models and strict number/boolean/date/enum/reference values', async () => {
    const { api } = setup();
    await api.createModel({
      id: 'middleware',
      name: '中间件',
      description: '虚构测试',
    });
    for (const definition of [
      { key: 'capacity', label: '容量', type: 'number' as const },
      { key: 'managed', label: '托管', type: 'boolean' as const },
      { key: 'renewal', label: '续期', type: 'date' as const },
      {
        key: 'tier',
        label: '等级',
        type: 'enum' as const,
        options: ['A', 'B'],
      },
      {
        key: 'hostRef',
        label: '主机',
        type: 'reference' as const,
        referenceModelId: 'host',
      },
    ])
      await field(
        api,
        { ...definition, description: '', required: true },
        'middleware',
      );
    const attributes = {
      capacity: 0,
      managed: false,
      renewal: '2028-02-29',
      tier: 'A',
      hostRef: 'ci-demo-host-01',
    };
    const ci = await api.create({
      ...input,
      modelId: 'middleware',
      attributes,
    });
    expect(ci.attributes).toEqual(attributes);
    for (const patch of [
      { capacity: '0' },
      { managed: 'false' },
      { renewal: '2027-02-29' },
      { tier: 'C' },
      { hostRef: 'ci-demo-old' },
      { hostRef: 'ci-demo-db' },
    ])
      await expect(
        api.create({
          ...input,
          externalKey: `demo.invalid-${Object.keys(patch)[0]!.toLowerCase()}`,
          modelId: 'middleware',
          attributes: { ...attributes, ...patch },
        }),
      ).rejects.toMatchObject({ status: 422 });
  });
  it('enforces attribute uniqueness in create, edit, and a mixed batch without partial writes', async () => {
    const { api } = setup();
    await field(api, {
      key: 'serial',
      label: '序列号',
      description: '',
      type: 'number',
      unique: true,
    });
    const ci = await api.create({ ...input, attributes: { serial: 0 } });
    await expect(
      api.create({
        ...input,
        externalKey: 'demo.duplicate-serial',
        attributes: { serial: 0 },
      }),
    ).rejects.toMatchObject({ status: 422 });
    const second = await api.create({
      ...input,
      externalKey: 'demo.second',
      attributes: { serial: 2 },
    });
    await expect(
      api.update(second.id, { ...update(second), attributes: { serial: 0 } }),
    ).rejects.toMatchObject({ status: 422 });
    const csv =
      'externalKey,name,modelId,owner,environment,status,serial\ndemo.batch-one,示例甲主机,host,示例团队,staging,active,5\ndemo.batch-two,示例乙主机,host,示例团队,staging,active,5';
    const mapping = Object.fromEntries(
      ['externalKey', 'name', 'modelId', 'owner', 'environment', 'status'].map(
        (key) => [key, key],
      ),
    );
    mapping['attributes.serial'] = 'serial';
    const request = { csv, mapping };
    expect((await api.previewImport(request)).invalidCount).toBe(1);
    await expect(api.import(request)).rejects.toMatchObject({
      code: 'IMPORT_INVALID',
    });
    expect((await api.summary()).total).toBe(8);
    expect((await api.get(ci.id)).attributes.serial).toBe(0);
  });
  it('maps custom columns, previews updates, preserves unmapped attributes and identity, and makes repeat upserts no-ops', async () => {
    const { api } = setup();
    await field(api, {
      key: 'managed',
      label: '托管',
      description: '',
      type: 'boolean',
    });
    const before = await api.get('ci-demo-host-01');
    const csv =
      '标识,名称,模型,团队,环境,状态,托管\ndemo.web-01,已更新的示例节点,host,示例团队,production,active,false';
    const mapping = {
      externalKey: '标识',
      name: '名称',
      modelId: '模型',
      owner: '团队',
      environment: '环境',
      status: '状态',
      'attributes.managed': '托管',
    };
    const request = { csv, mapping, mode: 'upsert' as const };
    const preview = await api.previewImport(request);
    expect(preview).toMatchObject({
      createdCount: 0,
      updatedCount: 1,
      invalidCount: 0,
    });
    expect(preview.rows[0]?.changes).toContainEqual({
      field: 'attributes.managed',
      before: null,
      after: false,
    });
    expect(await api.get(before.id)).toEqual(before);
    await expect(api.import(request)).rejects.toMatchObject({
      code: 'PREVIEW_STALE',
    });
    await api.import({ ...request, previewId: preview.previewId });
    const after = await api.get(before.id);
    expect(after).toMatchObject({
      id: before.id,
      revision: before.revision + 1,
      attributes: { ...before.attributes, managed: false },
      source: { kind: 'csv' },
    });
    const again = await api.previewImport(request);
    expect(again).toMatchObject({ unchangedCount: 1, updatedCount: 0 });
    await api.import({ ...request, previewId: again.previewId });
    expect(await api.get(before.id)).toEqual(after);
    expect((await api.summary()).total).toBe(6);
  });
  it('invalidates import tokens on data/schema changes and changed payload, without losing any updates', async () => {
    const { api } = setup();
    const request = {
      csv: 'externalKey,name,modelId,owner,environment,status\ndemo.new-token,示例新节点,host,示例团队,staging,active',
    };
    const first = await api.previewImport(request);
    await field(api, {
      key: 'note',
      label: '备注',
      description: '',
      type: 'text',
    });
    await expect(
      api.import({ ...request, previewId: first.previewId }),
    ).rejects.toMatchObject({ code: 'PREVIEW_STALE' });
    const second = await api.previewImport(request);
    await expect(
      api.import({
        ...request,
        csv: request.csv.replace('示例新节点', '载荷改变'),
        previewId: second.previewId,
      }),
    ).rejects.toMatchObject({ code: 'PREVIEW_STALE' });
    await api.create({ ...input, externalKey: 'demo.other-write' });
    await expect(
      api.import({ ...request, previewId: second.previewId }),
    ).rejects.toMatchObject({ code: 'PREVIEW_STALE' });
    expect((await api.summary()).total).toBe(7);
  });
  it('restricts model relationship pairs and checks cardinality changes against existing edges', async () => {
    const { api } = setup();
    await expect(
      api.addRelation({
        sourceId: 'ci-demo-host-01',
        targetId: 'ci-demo-service',
        type: 'runs_on',
      }),
    ).rejects.toMatchObject({ status: 422 });
    const rule = (await api.relationRules()).find(
      (rule) => rule.type === 'runs_on' && rule.sourceModelId === 'service',
    )!;
    await api.updateRule(rule.id, { revision: 1, cardinality: '1:1' });
    await expect(
      api.addRelation({
        sourceId: 'ci-demo-service',
        targetId: 'ci-demo-host-02',
        type: 'runs_on',
      }),
    ).rejects.toMatchObject({ status: 422 });
    await api.updateRule(rule.id, { revision: 2, cardinality: 'n:n' });
    await api.addRelation({
      sourceId: 'ci-demo-service',
      targetId: 'ci-demo-host-02',
      type: 'runs_on',
    });
    await expect(
      api.updateRule(rule.id, { revision: 3, cardinality: '1:1' }),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      (await api.relationRules()).find((item) => item.id === rule.id),
    ).toMatchObject({ cardinality: 'n:n', revision: 3 });
  });
  it('saves validated AND filters and resets all configurable state with the demo', async () => {
    const { api, mock } = setup();
    await field(api, {
      key: 'managed',
      label: '托管',
      description: '',
      type: 'boolean',
      defaultValue: false,
    });
    const view = await api.saveView({
      name: '示例生产节点',
      query: {
        modelId: 'host',
        environment: 'production',
        owner: '示例基础设施团队',
        attributeKey: 'managed',
        attributeValue: 'false',
      },
    });
    expect((await api.list(view.query)).total).toBe(2);
    expect(await api.views()).toEqual([view]);
    await expect(
      api.saveView({
        name: '错误视图',
        query: { attributeKey: 'managed', attributeValue: 'false' },
      }),
    ).rejects.toMatchObject({ status: 422 });
    await api.removeView(view.id);
    expect(await api.views()).toEqual([]);
    mock.reset();
    expect(
      (await api.models()).find((model) => model.id === 'host')?.fields,
    ).toHaveLength(2);
    expect(
      (
        await api.list({
          modelId: 'host',
          attributeKey: 'ipAddress',
          attributeValue: '',
        })
      ).total,
    ).toBe(0);
  });
});

it('bounds service dependencies, cuts cycles and preserves unique path keys', () => {
  const { cis, relations } = seedData();
  relations.push(
    {
      id: 'cycle',
      sourceId: 'ci-demo-host-01',
      targetId: 'ci-demo-service',
      type: 'depends_on',
      createdAt: '',
    },
    {
      id: 'parallel',
      sourceId: 'ci-demo-service',
      targetId: 'ci-demo-host-01',
      type: 'depends_on',
      createdAt: '',
    },
  );
  const result = serviceDependencies(cis, relations);
  expect(result.cycles).toBe(2);
  const flat = (nodes: DependencyNode[]): DependencyNode[] =>
    nodes.flatMap((node) => [node, ...flat(node.children ?? [])]);
  const all = flat(result.nodes);
  expect(new Set(all.map((node) => node.key)).size).toBe(all.length);
  expect(serviceDependencies(cis, relations, 2).truncated).toBe(true);
  expect(flat(serviceDependencies(cis, relations, 2).nodes)).toHaveLength(2);
});
