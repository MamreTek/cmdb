import { describe, expect, it, vi } from 'vitest';
import {
  ApiClient,
  ApiError,
  createHttpTransport,
} from '../src/shared/api/client';
import type {
  ApiRequest,
  CIInput,
  CIUpdate,
  Failure,
  Transport,
} from '../src/shared/api/contracts';
import { createMockApi } from '../src/shared/api/mock';
import { sampleCsv } from '../src/shared/api/seed';
import examples from '../docs/api-examples.json';

const input: CIInput = {
  externalKey: 'demo.test-host',
  name: '测试主机',
  modelId: 'host',
  owner: '示例测试团队',
  environment: 'staging',
  status: 'active',
  attributes: { ipAddress: '192.0.2.40' },
};
function setup() {
  const mock = createMockApi({ latency: 0 });
  return { mock, api: new ApiClient(mock.transport) };
}
function update(
  ci: CIInput & { revision: number },
  changes: Partial<CIUpdate> = {},
): CIUpdate {
  return {
    name: ci.name,
    owner: ci.owner,
    environment: ci.environment,
    status: ci.status,
    attributes: ci.attributes,
    revision: ci.revision,
    ...changes,
  };
}

describe('CMDB contract and behavior', () => {
  it.each(examples)(
    'replays the documented example: $name',
    async (example) => {
      const { mock } = setup();
      expect(await mock.transport(example.request as ApiRequest)).toEqual(
        example.response,
      );
    },
  );
  it('filters, sorts and paginates using the same stable resource IDs', async () => {
    const { api } = setup();
    const page = await api.list({
      modelId: 'host',
      environment: 'production',
      sortBy: 'name',
      sortOrder: 'asc',
      pageSize: 1,
    });
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(page.items[0]?.externalKey).toBe('demo.web-01');
    expect((await api.list({ q: 'DEMO.WEB-02' })).items[0]?.id).toBe(
      'ci-demo-host-02',
    );
    expect((await api.list({ q: '没有这个资源' })).total).toBe(0);
    expect((await api.list({ status: 'retired' })).total).toBe(1);
  });
  it('creates, updates and records changes without changing resource identity', async () => {
    const { api } = setup();
    const ci = await api.create(input);
    expect(ci).toMatchObject({ externalKey: input.externalKey, revision: 1 });
    expect(new Date(ci.createdAt).toISOString()).toBe(ci.createdAt);
    const changed = await api.update(
      ci.id,
      update(ci, { owner: '示例新团队', attributes: {} }),
    );
    expect(changed).toMatchObject({
      id: ci.id,
      externalKey: ci.externalKey,
      revision: 2,
      owner: '示例新团队',
      attributes: {},
    });
    expect(
      (await api.changes({ ciId: ci.id })).items.map((event) => event.action),
    ).toEqual(['updated', 'created']);
  });
  it('rejects stale updates atomically and preserves the latest version', async () => {
    const { api } = setup();
    const ci = await api.create(input);
    await api.update(ci.id, update(ci, { name: '已经更新的主机' }));
    await expect(
      api.update(ci.id, update(ci, { name: '过期编辑内容' })),
    ).rejects.toMatchObject({ status: 409, code: 'REVISION_CONFLICT' });
    expect((await api.get(ci.id)).name).toBe('已经更新的主机');
    expect((await api.changes({ ciId: ci.id })).total).toBe(2);
  });
  it('rejects duplicate external keys and reports the offending field', async () => {
    const { api } = setup();
    await api.create(input);
    await expect(api.create(input)).rejects.toMatchObject({
      code: 'DUPLICATE_KEY',
      status: 409,
      fields: { externalKey: expect.any(String) },
    });
    expect((await api.list({ q: input.externalKey })).total).toBe(1);
  });
  it.each([
    { externalKey: 'Wrong Key' },
    { name: ' ' },
    { owner: '' },
    { attributes: { ipAddress: '999.2.3.4' } },
    { attributes: { password: 'fictional' } },
    { environment: 'invalid' },
    { status: 'broken' },
    { modelId: 'unknown' },
  ])('rejects invalid CI input %j', async (patch) => {
    const { api } = setup();
    await expect(
      api.create({ ...input, ...patch } as CIInput),
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
    expect((await api.summary()).total).toBe(6);
  });
  it('does not allow immutable fields or missing revisions in update requests', async () => {
    const { api, mock } = setup();
    const ci = await api.create(input);
    for (const body of [
      { ...update(ci), externalKey: 'demo.replaced' },
      { ...update(ci), revision: undefined },
    ]) {
      const result = await mock.transport({
        method: 'PATCH',
        path: `/api/v1/cis/${ci.id}`,
        body,
      });
      expect(result.status).toBe(422);
    }
    expect((await api.get(ci.id)).revision).toBe(1);
  });
  it('validates directed relations and records removal on both endpoints', async () => {
    const { api } = setup();
    const ci = await api.create(input);
    const relation = await api.addRelation({
      sourceId: 'ci-demo-service',
      targetId: ci.id,
      type: 'runs_on',
    });
    await expect(
      api.addRelation({ sourceId: ci.id, targetId: ci.id, type: 'depends_on' }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(api.addRelation(relation)).rejects.toBeInstanceOf(ApiError);
    await expect(
      api.addRelation({
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        type: relation.type,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_RELATION' });
    expect((await api.relations(ci.id)).length).toBe(1);
    await api.removeRelation(relation.id);
    expect(await api.relations(ci.id)).toEqual([]);
    expect((await api.changes({ ciId: ci.id })).items[0]?.action).toBe(
      'relation_removed',
    );
    expect(
      (await api.changes({ ciId: 'ci-demo-service' })).items[0]?.action,
    ).toBe('relation_removed');
    expect((await api.get(ci.id)).id).toBe(ci.id);
  });
  it('keeps existing relationships when retiring but rejects new retired endpoints', async () => {
    const { api } = setup();
    const ci = await api.get('ci-demo-host-01');
    await api.update(ci.id, update(ci, { status: 'retired' }));
    expect((await api.relations(ci.id)).length).toBe(1);
    await expect(
      api.addRelation({
        sourceId: ci.id,
        targetId: 'ci-demo-db',
        type: 'depends_on',
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('previews without writing, then imports all rows with stable IDs', async () => {
    const { api } = setup();
    const preview = await api.previewImport(sampleCsv);
    expect(preview).toMatchObject({ validCount: 2, invalidCount: 0 });
    expect((await api.summary()).total).toBe(6);
    const imported = await api.import(sampleCsv);
    expect(imported.createdCount).toBe(2);
    expect(new Set(imported.ids).size).toBe(2);
    expect((await api.summary()).total).toBe(8);
    expect(
      (await api.changes({ ciId: imported.ids[0] })).items[0]?.action,
    ).toBe('imported');
  });
  it('reports duplicate rows and invalid fields and imports none of a mixed batch', async () => {
    const { api } = setup();
    const csv =
      sampleCsv +
      '\ndemo.api-new,重复标识,service,示例团队,staging,active\ndemo.invalid,非法环境,host,示例团队,wrong,active';
    const preview = await api.previewImport(csv);
    expect(preview).toMatchObject({ validCount: 2, invalidCount: 2 });
    expect(preview.rows[2]?.line).toBe(4);
    await expect(api.import(csv)).rejects.toMatchObject({
      code: 'IMPORT_INVALID',
      status: 422,
    });
    expect((await api.summary()).total).toBe(6);
  });
  it('revalidates an existing key at submission after a previously valid preview', async () => {
    const { api } = setup();
    await api.previewImport(sampleCsv);
    await api.create({ ...input, externalKey: 'demo.api-new' });
    await expect(api.import(sampleCsv)).rejects.toMatchObject({
      code: 'IMPORT_INVALID',
    });
    expect((await api.summary()).total).toBe(7);
  });
  it('parses escaped quotes, embedded commas/newlines, BOM and CRLF', async () => {
    const { api } = setup();
    const csv =
      '\uFEFFexternalKey,name,modelId,owner,environment,status\r\ndemo.quoted,"示例,\n""引号""主机",host,示例团队,staging,active\r\n';
    const preview = await api.previewImport(csv);
    expect(preview.validCount).toBe(1);
    expect(preview.rows[0]?.input?.name).toBe('示例,\n"引号"主机');
  });
  it.each([
    'bad,header\na,b',
    'externalKey,name,modelId,owner,environment,status\n"unclosed',
    'externalKey,name,modelId,owner,environment,status',
  ])('rejects malformed/empty imports', async (csv) => {
    const { api } = setup();
    await expect(api.previewImport(csv)).rejects.toMatchObject({ status: 422 });
  });
  it('loads all pages for relationship selectors after a 200-row import', async () => {
    const { api } = setup();
    const csv =
      'externalKey,name,modelId,owner,environment,status\n' +
      Array.from(
        { length: 200 },
        (_, index) =>
          `demo.bulk-${index},示例主机${index},host,示例团队,staging,active`,
      ).join('\n');
    await api.import(csv);
    expect((await api.allCIs()).length).toBe(206);
    await expect(
      api.import(csv + '\ndemo.overflow,超限主机,host,示例团队,staging,active'),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('makes service failure observable with a request ID and leaves writes unapplied', async () => {
    const { api, mock } = setup();
    mock.failNext();
    await expect(api.create(input)).rejects.toMatchObject({
      code: 'SIMULATED_FAILURE',
      status: 503,
      requestId: 'mock-1',
    });
    expect((await api.summary()).total).toBe(6);
    expect((await api.create(input)).externalKey).toBe(input.externalKey);
    mock.reset();
    expect((await api.summary()).total).toBe(6);
  });
  it('distinguishes missing resources, malformed pagination and unknown queries', async () => {
    const { api, mock } = setup();
    await expect(api.get('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
    await expect(api.list({ pageSize: 101 })).rejects.toMatchObject({
      status: 422,
    });
    expect(
      (
        await mock.transport({
          method: 'GET',
          path: '/api/v1/cis?unexpected=1',
        })
      ).status,
    ).toBe(422);
  });
  it('times out an aborted transport without applying a write', async () => {
    const mock = createMockApi({ latency: 30 });
    const api = new ApiClient(mock.transport, 1);
    await expect(api.create(input)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect((await new ApiClient(mock.transport).summary()).total).toBe(6);
  });
  it('rejects malformed response envelopes and reports network failures', async () => {
    const invalid: Transport = async () => ({
      status: 200,
      body: { unexpected: true },
    });
    await expect(new ApiClient(invalid).summary()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    const network: Transport = async () => {
      throw new Error('offline');
    };
    await expect(new ApiClient(network).summary()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });
  it('uses a same-origin HTTP adapter with JSON and forwards request IDs', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 503,
      json: async (): Promise<Failure> => ({
        error: { code: 'UNAVAILABLE', message: '暂时不可用' },
        requestId: 'server-123',
      }),
    });
    const api = new ApiClient(createHttpTransport(fetcher));
    await expect(api.create(input)).rejects.toMatchObject({
      requestId: 'server-123',
      status: 503,
    });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/cis',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify(input),
      }),
    );
    await expect(
      createHttpTransport(fetcher)({
        method: 'GET',
        path: 'https://external.example.invalid/api/v1/cis',
      }),
    ).rejects.toThrow('same-origin');
  });
});
