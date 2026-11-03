import type {
  ApiRequest,
  CI,
  CIInput,
  CIModel,
  CIQuery,
  CIUpdate,
  Change,
  Failure,
  ImportPreview,
  Page,
  Relation,
  RelationInput,
  Success,
  Summary,
  Transport,
} from './contracts';

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public requestId: string,
    public status: number,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function createHttpTransport(fetcher: typeof fetch = fetch): Transport {
  return async ({ method, path, body, signal }) => {
    if (!path.startsWith('/api/v1/') || path.includes('..')) {
      throw new Error('Only same-origin versioned API requests are supported');
    }
    const response = await fetcher(path, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
}

function queryString(query: object): string {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') result.set(key, String(value));
  }
  return result.size ? `?${result.toString()}` : '';
}

export class ApiClient {
  constructor(
    private transport: Transport,
    private timeoutMs = 8_000,
  ) {}

  private async request<T>(
    method: ApiRequest['method'],
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.transport({
        method,
        path: `/api/v1${path}`,
        body,
        signal: controller.signal,
      });
      const envelope = response.body as Success<T> | Failure | null;
      if (
        !envelope ||
        typeof envelope !== 'object' ||
        typeof envelope.requestId !== 'string'
      ) {
        throw new ApiError(
          '接口返回格式不符合契约',
          'INVALID_RESPONSE',
          'unavailable',
          response.status,
        );
      }
      if ('error' in envelope) {
        throw new ApiError(
          envelope.error.message,
          envelope.error.code,
          envelope.requestId,
          response.status,
          envelope.error.fields,
        );
      }
      if (response.status >= 400 || !('data' in envelope)) {
        throw new ApiError(
          '接口返回格式不符合契约',
          'INVALID_RESPONSE',
          envelope.requestId,
          response.status,
        );
      }
      return envelope.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted)
        throw new ApiError('请求超时，请重试', 'TIMEOUT', 'unavailable', 0);
      throw new ApiError(
        '连接失败，请检查服务后重试',
        'NETWORK_ERROR',
        'unavailable',
        0,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  models = () => this.request<CIModel[]>('GET', '/models');
  summary = () => this.request<Summary>('GET', '/summary');
  list = (query: CIQuery = {}) =>
    this.request<Page<CI>>('GET', `/cis${queryString(query)}`);
  allCIs = async (): Promise<CI[]> => {
    const first = await this.list({
      pageSize: 100,
      sortBy: 'name',
      sortOrder: 'asc',
    });
    const items = [...first.items];
    for (let page = 2; page <= Math.ceil(first.total / 100); page++) {
      items.push(
        ...(
          await this.list({
            page,
            pageSize: 100,
            sortBy: 'name',
            sortOrder: 'asc',
          })
        ).items,
      );
    }
    return items;
  };
  get = (id: string) =>
    this.request<CI>('GET', `/cis/${encodeURIComponent(id)}`);
  create = (input: CIInput) => this.request<CI>('POST', '/cis', input);
  update = (id: string, input: CIUpdate) =>
    this.request<CI>('PATCH', `/cis/${encodeURIComponent(id)}`, input);
  relations = (ciId?: string) =>
    this.request<Relation[]>('GET', `/relations${queryString({ ciId })}`);
  addRelation = (input: RelationInput) =>
    this.request<Relation>('POST', '/relations', input);
  removeRelation = (id: string) =>
    this.request<{ id: string }>(
      'DELETE',
      `/relations/${encodeURIComponent(id)}`,
    );
  changes = (query: { ciId?: string; page?: number; pageSize?: number } = {}) =>
    this.request<Page<Change>>('GET', `/changes${queryString(query)}`);
  previewImport = (csv: string) =>
    this.request<ImportPreview>('POST', '/imports/preview', { csv });
  import = (csv: string) =>
    this.request<{ ids: string[]; createdCount: number }>('POST', '/imports', {
      csv,
    });
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError)
    return `${error.message} · 请求 ${error.requestId}`;
  return error instanceof Error ? error.message : '操作失败，请重试';
}
