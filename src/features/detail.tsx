import {
  App,
  Button,
  Descriptions,
  Drawer,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { useState } from 'react';
import { environmentLabels, type CI } from '../shared/api/contracts';
import { useRuntime } from '../shared/api/runtime';
import { useResource } from '../shared/useResource';
import { EmptyState, FailureNotice, StatusTag, time } from '../shared/ui';
import { CIEditor } from './ci-editor';
import { RelationEditor, RelationTable } from './relations';

export function CIDetail({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { api } = useRuntime();
  const { message, modal } = App.useApp();
  const [editing, setEditing] = useState(false),
    [relationOpen, setRelationOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<unknown>();
  const [changePage, setChangePage] = useState(1);
  const resource = useResource(
    () =>
      Promise.all([api.get(id), api.models(), api.relations(id), api.allCIs()]),
    id,
  );
  const changes = useResource(
    () => api.changes({ ciId: id, page: changePage, pageSize: 10 }),
    `${id}:${changePage}`,
  );
  const [ci, models, relations, cis] = resource.data ?? [];
  function changed() {
    resource.reload();
    changes.reload();
    onChanged();
  }
  function saved() {
    setEditing(false);
    void message.success('配置项已保存（模拟）');
    changed();
  }
  function retire(ci: CI) {
    modal.confirm({
      title: `退役 ${ci.name}？`,
      content: `已有 ${relations?.length ?? 0} 条关系保留，不影响其他配置项。退役后不能新增关系。`,
      okText: '确认退役',
      cancelText: '取消',
      onOk: async () => {
        setBusy(true);
        setMutationError(undefined);
        try {
          await api.update(ci.id, {
            name: ci.name,
            owner: ci.owner,
            environment: ci.environment,
            status: 'retired',
            attributes: ci.attributes,
            revision: ci.revision,
          });
          void message.success('已标记退役（模拟）');
          changed();
        } catch (error) {
          setMutationError(error);
        } finally {
          setBusy(false);
        }
      },
    });
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title="配置项详情"
      size="min(860px, 100vw)"
      extra={<Tag color="gold">模拟数据</Tag>}
    >
      {resource.error ? (
        <FailureNotice error={resource.error} retry={resource.reload} />
      ) : resource.loading ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        ci && (
          <>
            <div className="detail-heading">
              <span className="eyebrow">{ci.externalKey}</span>
              <Typography.Title level={3}>{ci.name}</Typography.Title>
              <Space wrap>
                <StatusTag status={ci.status} />
                <Tag>
                  {models?.find((model) => model.id === ci.modelId)?.name}
                </Tag>
                <Tag>版本 {ci.revision}</Tag>
              </Space>
            </div>
            {mutationError ? <FailureNotice error={mutationError} /> : null}
            <Space className="detail-actions" wrap>
              <Button type="primary" onClick={() => setEditing(true)}>
                编辑属性
              </Button>
              <Button
                onClick={() => setRelationOpen(true)}
                disabled={ci.status === 'retired'}
              >
                建立关系
              </Button>
              <Button
                danger
                loading={busy}
                disabled={ci.status === 'retired'}
                onClick={() => retire(ci)}
              >
                标记退役
              </Button>
              <Button onClick={changed}>刷新详情</Button>
            </Space>
            <Tabs
              items={[
                {
                  key: 'overview',
                  label: '基本信息',
                  children: (
                    <>
                      <Descriptions
                        bordered
                        column={1}
                        size="small"
                        items={[
                          {
                            key: 'id',
                            label: '稳定 ID',
                            children: (
                              <Typography.Text copyable>
                                {ci.id}
                              </Typography.Text>
                            ),
                          },
                          {
                            key: 'key',
                            label: '资源标识',
                            children: ci.externalKey,
                          },
                          {
                            key: 'owner',
                            label: '负责人 / 团队',
                            children: ci.owner,
                          },
                          {
                            key: 'environment',
                            label: '环境',
                            children: environmentLabels[ci.environment],
                          },
                          {
                            key: 'createdAt',
                            label: '建档时间',
                            children: time(ci.createdAt),
                          },
                          {
                            key: 'updatedAt',
                            label: '更新时间',
                            children: time(ci.updatedAt),
                          },
                          ...(
                            models?.find((model) => model.id === ci.modelId)
                              ?.fields ?? []
                          ).map((field) => ({
                            key: field.key,
                            label: field.label,
                            children: ci.attributes[field.key] || '未填写',
                          })),
                        ]}
                      />
                      <p className="muted">
                        ID 与资源标识用于未来作业平台和 ITSM
                        关联。本原型尚未对接其他产品。
                      </p>
                    </>
                  ),
                },
                {
                  key: 'relations',
                  label: `资源关系 (${relations?.length ?? 0})`,
                  children: (
                    <RelationTable
                      relations={relations ?? []}
                      cis={cis ?? []}
                      onChanged={changed}
                    />
                  ),
                },
                {
                  key: 'changes',
                  label: '变更记录',
                  children: changes.error ? (
                    <FailureNotice
                      error={changes.error}
                      retry={changes.reload}
                    />
                  ) : changes.loading ? (
                    <Skeleton active />
                  ) : (
                    <>
                      <p className="muted">
                        模拟操作记录，仅用于验证产品流程，不具备真实审计保证。
                      </p>
                      {changes.data?.items.length ? (
                        <Timeline
                          items={changes.data.items.map((change) => ({
                            title: time(change.createdAt),
                            content: (
                              <>
                                <strong>{change.summary}</strong>
                                <p className="muted">{change.actor}</p>
                              </>
                            ),
                          }))}
                        />
                      ) : (
                        <EmptyState text="暂无记录" />
                      )}
                      <Space>
                        <Button
                          disabled={changePage === 1}
                          onClick={() => setChangePage((page) => page - 1)}
                        >
                          上一页
                        </Button>
                        <Typography.Text>
                          {changePage} /{' '}
                          {Math.max(
                            1,
                            Math.ceil((changes.data?.total ?? 0) / 10),
                          )}
                        </Typography.Text>
                        <Button
                          disabled={
                            changePage * 10 >= (changes.data?.total ?? 0)
                          }
                          onClick={() => setChangePage((page) => page + 1)}
                        >
                          下一页
                        </Button>
                      </Space>
                    </>
                  ),
                },
              ]}
            />
            {editing && models ? (
              <CIEditor
                ci={ci}
                models={models}
                onClose={() => setEditing(false)}
                onSaved={saved}
              />
            ) : null}
            {relationOpen && cis ? (
              <RelationEditor
                cis={cis}
                sourceId={ci.id}
                onClose={() => setRelationOpen(false)}
                onSaved={() => {
                  setRelationOpen(false);
                  void message.success('关系已建立（模拟）');
                  changed();
                }}
              />
            ) : null}
          </>
        )
      )}
      <Typography.Paragraph type="secondary" style={{ marginTop: 24 }}>
        产品原型 · 刷新页面后所有演示改动重置
      </Typography.Paragraph>
    </Drawer>
  );
}
