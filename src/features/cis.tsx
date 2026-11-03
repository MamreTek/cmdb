import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  Popconfirm,
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
import { errorText } from '../shared/api/client';

export function CIsPage() {
  const { api } = useRuntime();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<CI | null>();
  const views = useResource(() => api.views(), 'saved-views');
  const [viewName, setViewName] = useState(''),
    [saveOpen, setSaveOpen] = useState(false),
    [viewBusy, setViewBusy] = useState(false),
    [viewError, setViewError] = useState<unknown>(),
    [activeView, setActiveView] = useState<string>();
  const query: CIQuery = {
    q: params.get('q') ?? undefined,
    modelId: (params.get('modelId') as ModelId) || undefined,
    environment: (params.get('environment') as Environment) || undefined,
    status: (params.get('status') as Lifecycle) || undefined,
    sortBy: (params.get('sortBy') as CIQuery['sortBy']) || 'updatedAt',
    sortOrder: (params.get('sortOrder') as CIQuery['sortOrder']) || 'desc',
    page: Number(params.get('page') ?? 1),
    pageSize: Number(params.get('pageSize') ?? 10),
    owner: params.get('owner') || undefined,
    attributeKey: params.get('attributeKey') || undefined,
    attributeValue: params.has('attributeValue')
      ? params.get('attributeValue')!
      : undefined,
    includeDescendants:
      params.get('includeDescendants') === 'true' ? 'true' : undefined,
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
    setActiveView(undefined);
    for (const [key, value] of Object.entries(patch)) {
      if (value || (key === 'attributeValue' && value === ''))
        next.set(key, value);
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
  async function saveView() {
    if (viewBusy) return;
    setViewBusy(true);
    setViewError(undefined);
    try {
      const filters = { ...query };
      delete filters.page;
      delete filters.pageSize;
      const view = await api.saveView({
        name: viewName,
        query: Object.fromEntries(
          Object.entries(filters).filter(([, value]) => value !== undefined),
        ),
      });
      views.reload();
      setActiveView(view.id);
      setSaveOpen(false);
      setViewName('');
      void message.success('视图已保存（当前会话）');
    } catch (error) {
      setViewError(error);
    } finally {
      setViewBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="资源清单"
        description="管理配置项、责任团队、环境和生命周期。"
      />
      {models.error ? (
        <FailureNotice error={models.error} retry={models.reload} />
      ) : null}
      <Card className="query-card">
        <Space wrap style={{ marginBottom: 16 }}>
          <Typography.Text>保存的视图</Typography.Text>
          <Select
            aria-label="保存的视图"
            value={activeView}
            placeholder="选择当前会话视图"
            allowClear
            style={{ minWidth: 200 }}
            options={views.data?.map((view) => ({
              value: view.id,
              label: view.name,
            }))}
            onChange={(id: string | undefined) => {
              const view = views.data?.find((view) => view.id === id);
              if (view) {
                setParams(
                  new URLSearchParams(
                    Object.entries(view.query).map(([key, value]) => [
                      key,
                      String(value),
                    ]),
                  ),
                );
                setActiveView(id);
              } else setActiveView(undefined);
            }}
          />
          <Button
            disabled={!!resource.error || resource.loading}
            onClick={() => {
              setViewError(undefined);
              setSaveOpen(true);
            }}
          >
            保存当前筛选
          </Button>
          <Popconfirm
            title="删除选中的保存视图？"
            description="只删除查询条件，资源保持不变。"
            okText="删除视图"
            cancelText="取消"
            onConfirm={async () => {
              if (!activeView || viewBusy) return;
              setViewBusy(true);
              try {
                await api.removeView(activeView);
                views.reload();
                setActiveView(undefined);
              } catch (error) {
                void message.error(errorText(error));
              } finally {
                setViewBusy(false);
              }
            }}
          >
            <Button danger disabled={!activeView || viewBusy}>
              删除视图
            </Button>
          </Popconfirm>
        </Space>
        {views.error ? (
          <FailureNotice error={views.error} retry={views.reload} />
        ) : null}
        <div className="query-grid" role="search" aria-label="配置项查询">
          <div className="query-field">
            <label htmlFor="ci-query">配置项</label>
            <Input.Search
              id="ci-query"
              key={query.q ?? ''}
              aria-label="搜索配置项"
              placeholder="搜索名称、资源标识或负责人"
              defaultValue={query.q}
              maxLength={120}
              allowClear
              onSearch={(value) => updateQuery({ q: value.trim() })}
              enterButton="查询"
            />
          </div>
          <div className="query-field">
            <label htmlFor="ci-model">资源模型</label>
            <Select
              id="ci-model"
              aria-label="筛选资源模型"
              placeholder="全部模型"
              allowClear
              value={query.modelId}
              options={models.data?.map((model) => ({
                value: model.id,
                label: model.name,
              }))}
              onChange={(value: string | undefined) =>
                updateQuery({
                  modelId: value,
                  attributeKey: undefined,
                  attributeValue: undefined,
                  includeDescendants: undefined,
                })
              }
            />
          </div>
          <div className="query-field">
            <label htmlFor="ci-environment">环境</label>
            <Select
              id="ci-environment"
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
          </div>
          <div className="query-field">
            <label htmlFor="ci-status">生命周期</label>
            <Select
              id="ci-status"
              aria-label="筛选生命周期"
              placeholder="全部状态"
              allowClear
              value={query.status}
              options={Object.entries(lifecycleLabels).map(
                ([value, label]) => ({
                  value,
                  label,
                }),
              )}
              onChange={(value: string | undefined) =>
                updateQuery({ status: value })
              }
            />
          </div>
          <div className="query-actions">
            <Checkbox
              disabled={!query.modelId}
              checked={query.includeDescendants === 'true'}
              onChange={(event) =>
                updateQuery({
                  includeDescendants: event.target.checked ? 'true' : undefined,
                })
              }
            >
              包含子类
            </Checkbox>
            <Button
              onClick={() =>
                updateQuery({
                  q: undefined,
                  modelId: undefined,
                  environment: undefined,
                  status: undefined,
                  includeDescendants: undefined,
                  owner: undefined,
                  attributeKey: undefined,
                  attributeValue: undefined,
                })
              }
            >
              清空筛选
            </Button>
          </div>
          <div className="query-field">
            <label htmlFor="ci-owner">负责人精确匹配</label>
            <Input.Search
              id="ci-owner"
              aria-label="负责人精确匹配"
              key={query.owner ?? ''}
              allowClear
              maxLength={60}
              defaultValue={query.owner}
              placeholder="输入完整团队名"
              onSearch={(value) =>
                updateQuery({ owner: value.trim() || undefined })
              }
            />
          </div>
          <div className="query-field">
            <label htmlFor="ci-attribute">模型属性</label>
            <Select
              id="ci-attribute"
              aria-label="筛选模型属性"
              disabled={!query.modelId}
              allowClear
              placeholder="先选择模型"
              value={query.attributeKey}
              options={models.data
                ?.find((model) => model.id === query.modelId)
                ?.fields.map((field) => ({
                  value: field.key,
                  label: field.label,
                }))}
              onChange={(value: string | undefined) =>
                updateQuery({
                  attributeKey: value,
                  attributeValue: value ? '' : undefined,
                })
              }
            />
          </div>
          <div className="query-field">
            <label htmlFor="ci-attribute-value">属性等于</label>
            <Input.Search
              id="ci-attribute-value"
              aria-label="属性等值条件"
              key={`${query.modelId}-${query.attributeKey}-${query.attributeValue ?? ''}`}
              disabled={!query.attributeKey}
              defaultValue={query.attributeValue}
              maxLength={
                models.data
                  ?.find((model) => model.id === query.modelId)
                  ?.fields.find((field) => field.key === query.attributeKey)
                  ?.maxLength ?? 120
              }
              placeholder="布尔填 true/false，引用填 CI ID"
              onSearch={(value) =>
                updateQuery({ attributeValue: value.trim() })
              }
            />
          </div>
        </div>
      </Card>
      <Modal
        open={saveOpen}
        title="保存当前筛选"
        okText="保存视图"
        cancelText="取消"
        confirmLoading={viewBusy}
        onCancel={() => !viewBusy && setSaveOpen(false)}
        onOk={() => void saveView()}
        okButtonProps={{ disabled: !viewName.trim() }}
      >
        <Typography.Paragraph type="secondary">
          保存查询条件与排序；切换模块可恢复，刷新或重置演示后清空。
        </Typography.Paragraph>
        <Input
          aria-label="视图名称"
          value={viewName}
          onChange={(event) => setViewName(event.target.value)}
          maxLength={40}
          placeholder="例如：生产主机"
        />
        {viewError ? <FailureNotice error={viewError} /> : null}
      </Modal>
      <Card className="table-card">
        <div className="list-meta">
          <Space size={16}>
            <Typography.Title level={5}>配置项列表</Typography.Title>
            <Typography.Text type="secondary">
              共 {resource.data?.total ?? '—'} 个配置项
            </Typography.Text>
          </Space>
          <Space wrap>
            <Button
              type="primary"
              aria-label="新建配置项"
              icon={<PlusOutlined />}
              onClick={() => updateQuery({ create: '1' }, false)}
              disabled={!models.data}
            >
              新建配置项
            </Button>
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
            size="middle"
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
