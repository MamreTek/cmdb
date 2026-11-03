import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Input,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type {
  CI,
  CIQuery,
  Environment,
  Lifecycle,
  ModelId,
} from '../shared/api/contracts';
import { environmentLabels, lifecycleLabels } from '../shared/api/contracts';
import { useRuntime } from '../shared/api/runtime';
import { useResource } from '../shared/useResource';
import {
  EmptyState,
  FailureNotice,
  PageTitle,
  StatusTag,
  time,
} from '../shared/ui';
import { CIEditor } from './ci-editor';
import { CIDetail } from './detail';

export function CIsPage() {
  const { api } = useRuntime();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<CI | null>();
  const query: CIQuery = {
    q: params.get('q') ?? undefined,
    modelId: (params.get('modelId') as ModelId) || undefined,
    environment: (params.get('environment') as Environment) || undefined,
    status: (params.get('status') as Lifecycle) || undefined,
    sortBy: (params.get('sortBy') as CIQuery['sortBy']) || 'updatedAt',
    sortOrder: (params.get('sortOrder') as CIQuery['sortOrder']) || 'desc',
    page: Number(params.get('page') ?? 1),
    pageSize: Number(params.get('pageSize') ?? 10),
  };
  const queryKey = JSON.stringify(query);
  const resource = useResource(() => api.list(query), queryKey);
  const models = useResource(() => api.models(), 'models');
  const selectedId = params.get('ciId');
  const createOpen = params.get('create') === '1';
  function updateQuery(
    patch: Record<string, string | undefined>,
    resetPage = true,
  ) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (resetPage) next.delete('page');
    setParams(next);
  }
  function closeEditor() {
    setEditing(undefined);
    if (createOpen) updateQuery({ create: undefined }, false);
  }
  function saved(ci: CI) {
    setEditing(undefined);
    void message.success('配置项已保存（模拟）');
    updateQuery({ create: undefined, ciId: ci.id }, false);
    resource.reload();
  }
  return (
    <>
      <PageTitle
        eyebrow="CONFIGURATION ITEMS"
        title="资源清单"
        description="每个配置项都有稳定标识、明确归属与生命周期。先找得到，再管得清。"
        extra={
          <>
            <Button
              onClick={() =>
                updateQuery({
                  q: undefined,
                  modelId: undefined,
                  environment: undefined,
                  status: undefined,
                })
              }
            >
              清空筛选
            </Button>
            <Button
              type="primary"
              aria-label="新建配置项"
              icon={<PlusOutlined />}
              onClick={() => updateQuery({ create: '1' }, false)}
              disabled={!models.data}
            >
              新建配置项
            </Button>
          </>
        }
      />
      {models.error ? (
        <FailureNotice error={models.error} retry={models.reload} />
      ) : null}
      <Card className="table-card">
        <div className="filter-bar">
          <Input.Search
            key={query.q ?? ''}
            aria-label="搜索配置项"
            placeholder="搜索名称、资源标识或负责人"
            defaultValue={query.q}
            maxLength={120}
            allowClear
            onSearch={(value) => updateQuery({ q: value.trim() })}
            enterButton="搜索"
          />
          <Select
            aria-label="筛选资源模型"
            placeholder="全部模型"
            allowClear
            value={query.modelId}
            options={models.data?.map((model) => ({
              value: model.id,
              label: model.name,
            }))}
            onChange={(value: string | undefined) =>
              updateQuery({ modelId: value })
            }
          />
          <Select
            aria-label="筛选环境"
            placeholder="全部环境"
            allowClear
            value={query.environment}
            options={Object.entries(environmentLabels).map(
              ([value, label]) => ({ value, label }),
            )}
            onChange={(value: string | undefined) =>
              updateQuery({ environment: value })
            }
          />
          <Select
            aria-label="筛选生命周期"
            placeholder="全部状态"
            allowClear
            value={query.status}
            options={Object.entries(lifecycleLabels).map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(value: string | undefined) =>
              updateQuery({ status: value })
            }
          />
        </div>
        <div className="list-meta">
          <Typography.Text type="secondary">
            共 {resource.data?.total ?? '—'} 个配置项
          </Typography.Text>
          <Space>
            <Select
              aria-label="排序方式"
              value={`${query.sortBy}-${query.sortOrder}`}
              options={[
                { value: 'updatedAt-desc', label: '更新：新到旧' },
                { value: 'updatedAt-asc', label: '更新：旧到新' },
                { value: 'name-asc', label: '名称：升序' },
                { value: 'name-desc', label: '名称：降序' },
              ]}
              onChange={(value) => {
                const [sortBy, sortOrder] = value.split('-');
                updateQuery({ sortBy, sortOrder });
              }}
            />
            <Button
              aria-label="刷新清单"
              icon={<ReloadOutlined />}
              onClick={resource.reload}
              loading={resource.loading}
            />
          </Space>
        </div>
        {resource.error ? (
          <div className="card-inset">
            <FailureNotice error={resource.error} retry={resource.reload} />
          </div>
        ) : !resource.data && resource.loading ? (
          <div className="card-inset">
            <Skeleton active />
          </div>
        ) : (
          <Table<CI>
            rowKey="id"
            loading={resource.loading}
            dataSource={resource.data?.items}
            scroll={{ x: 960 }}
            locale={{ emptyText: <EmptyState /> }}
            pagination={{
              current: query.page,
              pageSize: query.pageSize,
              total: resource.data?.total,
              showSizeChanger: true,
              pageSizeOptions: [5, 10, 20, 50],
              onChange: (page, pageSize) =>
                updateQuery(
                  {
                    page: String(pageSize !== query.pageSize ? 1 : page),
                    pageSize: String(pageSize),
                  },
                  false,
                ),
            }}
            columns={[
              {
                title: '配置项',
                dataIndex: 'name',
                width: 260,
                render: (name: string, ci) => (
                  <>
                    <Button
                      type="link"
                      className="resource-link"
                      onClick={() => updateQuery({ ciId: ci.id }, false)}
                    >
                      {name}
                    </Button>
                    <div>
                      <Typography.Text
                        type="secondary"
                        className="resource-key"
                      >
                        {ci.externalKey}
                      </Typography.Text>
                    </div>
                  </>
                ),
              },
              {
                title: '模型',
                dataIndex: 'modelId',
                render: (modelId: ModelId) => (
                  <Tag>
                    {models.data?.find((model) => model.id === modelId)?.name ??
                      modelId}
                  </Tag>
                ),
              },
              { title: '负责人 / 团队', dataIndex: 'owner' },
              {
                title: '环境',
                dataIndex: 'environment',
                render: (value: Environment) => environmentLabels[value],
              },
              {
                title: '状态',
                dataIndex: 'status',
                render: (value: Lifecycle) => <StatusTag status={value} />,
              },
              { title: '更新于', dataIndex: 'updatedAt', render: time },
              {
                title: '操作',
                key: 'actions',
                render: (_, ci) => (
                  <Button type="link" onClick={() => setEditing(ci)}>
                    编辑
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
      {(createOpen || editing !== undefined) && models.data ? (
        <CIEditor
          key={editing?.id ?? 'new'}
          ci={editing ?? null}
          models={models.data}
          onClose={closeEditor}
          onSaved={saved}
        />
      ) : null}
      {selectedId ? (
        <CIDetail
          key={selectedId}
          id={selectedId}
          onClose={() => updateQuery({ ciId: undefined }, false)}
          onChanged={resource.reload}
        />
      ) : null}
    </>
  );
}
