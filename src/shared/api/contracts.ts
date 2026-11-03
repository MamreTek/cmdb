export type ModelId = 'host' | 'service' | 'database';
export type Environment = 'production' | 'staging' | 'development';
export type Lifecycle = 'active' | 'maintenance' | 'retired';
export type RelationType = 'depends_on' | 'runs_on';
export interface ModelField {
  key: string;
  label: string;
  description: string;
  format?: 'ipv4';
}
export interface CIModel {
  id: ModelId;
  name: string;
  description: string;
  fields: ModelField[];
}
export interface CIInput {
  externalKey: string;
  name: string;
  modelId: ModelId;
  owner: string;
  environment: Environment;
  status: Lifecycle;
  attributes: Record<string, string>;
}
export type CIUpdate = Omit<CIInput, 'externalKey' | 'modelId'> & {
  revision: number;
};
export interface CI extends CIInput {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface RelationInput {
  sourceId: string;
  targetId: string;
  type: RelationType;
}
export interface Relation extends RelationInput {
  id: string;
  createdAt: string;
}
export interface Change {
  id: string;
  ciId: string;
  action:
    'created' | 'updated' | 'relation_added' | 'relation_removed' | 'imported';
  actor: string;
  summary: string;
  createdAt: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface CIQuery {
  q?: string;
  modelId?: ModelId;
  environment?: Environment;
  status?: Lifecycle;
  sortBy?: 'name' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}
export interface Summary {
  total: number;
  active: number;
  relations: number;
  modelCounts: Record<ModelId, number>;
}
export interface ImportRow {
  line: number;
  input: CIInput | null;
  errors: string[];
}
export interface ImportPreview {
  rows: ImportRow[];
  validCount: number;
  invalidCount: number;
}
export interface Success<T> {
  data: T;
  requestId: string;
}
export interface Failure {
  error: { code: string; message: string; fields?: Record<string, string> };
  requestId: string;
}
export interface ApiRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  signal?: AbortSignal;
}
export interface ApiResponse {
  status: number;
  body: unknown;
}
export type Transport = (request: ApiRequest) => Promise<ApiResponse>;
export const environmentLabels: Record<Environment, string> = {
  production: '生产环境（模拟）',
  staging: '预发布',
  development: '开发',
};
export const lifecycleLabels: Record<Lifecycle, string> = {
  active: '使用中',
  maintenance: '维护中',
  retired: '已退役',
};
export const relationLabels: Record<RelationType, string> = {
  depends_on: '依赖于',
  runs_on: '运行于',
};
