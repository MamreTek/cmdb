import { ArrowRightOutlined, PlusOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Form,
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
import { Link } from 'react-router';
import { errorText } from '../shared/api/client';
import type { CI, Relation, RelationInput } from '../shared/api/contracts';
import { relationLabels } from '../shared/api/contracts';
import { useRuntime } from '../shared/api/runtime';
import { useResource } from '../shared/useResource';
import { EmptyState, FailureNotice, PageTitle, time } from '../shared/ui';

export function RelationEditor({
  cis,
  sourceId,
  onClose,
  onSaved,
}: {
  cis: CI[];
  sourceId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api } = useRuntime();
  const [form] = Form.useForm<RelationInput>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const selectedSource = Form.useWatch('sourceId', form) as string | undefined;
  const options = cis
    .filter((ci) => ci.status !== 'retired')
    .map((ci) => ({ value: ci.id, label: `${ci.name} · ${ci.externalKey}` }));
  async function save(input: RelationInput) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.addRelation(input);
      onSaved();
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title="建立资源关系"
      okText="保存关系"
      cancelText="取消"
      confirmLoading={busy}
      closable={!busy}
      mask={{ closable: false }}
      onCancel={() => {
        if (!busy) onClose();
      }}
      onOk={() => form.submit()}
    >
      <Typography.Paragraph type="secondary">
        关系从源指向目标，例如“业务服务 运行于 主机”。退役资源不能新增关系。
      </Typography.Paragraph>
      {error ? (
        <div className="inline-error" role="alert">
          {errorText(error)}
        </div>
      ) : null}
      <Form
        form={form}
        layout="vertical"
        initialValues={{ sourceId, type: 'depends_on' }}
        onFinish={(value) => void save(value)}
        disabled={busy}
      >
        <Form.Item
          name="sourceId"
          label="源配置项"
          rules={[{ required: true, message: '请选择源配置项' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={options}
            onChange={() => form.resetFields(['targetId'])}
          />
        </Form.Item>
        <Form.Item name="type" label="关系类型" rules={[{ required: true }]}>
          <Select
            options={Object.entries(relationLabels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="targetId"
          label="目标配置项"
          rules={[{ required: true, message: '请选择目标配置项' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={options.filter(
              (option) => option.value !== selectedSource,
            )}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function RelationTable({
  relations,
  cis,
  onChanged,
}: {
  relations: Relation[];
  cis: CI[];
  onChanged: () => void;
}) {
  const { api } = useRuntime();
  const { message } = App.useApp();
  const [removing, setRemoving] = useState<string>();
  const [error, setError] = useState<unknown>();
  const label = (id: string) => cis.find((ci) => ci.id === id)?.name ?? id;
  async function remove(id: string) {
    if (removing) return;
    setRemoving(id);
    setError(undefined);
    try {
      await api.removeRelation(id);
      void message.success('关系已移除（模拟）');
      onChanged();
    } catch (reason) {
      setError(reason);
    } finally {
      setRemoving(undefined);
    }
  }
  return (
    <>
      {error ? <FailureNotice error={error} /> : null}
      <Table<Relation>
        rowKey="id"
        dataSource={relations}
        pagination={false}
        scroll={{ x: 650 }}
        locale={{
          emptyText: <EmptyState text="暂无资源关系，可以先建立第一条依赖" />,
        }}
        columns={[
          {
            title: '源配置项',
            dataIndex: 'sourceId',
            render: (id: string) => (
              <Link to={`/cis?ciId=${id}`}>{label(id)}</Link>
            ),
          },
          {
            title: '关系',
            dataIndex: 'type',
            render: (type: Relation['type']) => (
              <Tag>{relationLabels[type]} →</Tag>
            ),
          },
          {
            title: '目标配置项',
            dataIndex: 'targetId',
            render: (id: string) => (
              <Link to={`/cis?ciId=${id}`}>{label(id)}</Link>
            ),
          },
          { title: '建立时间', dataIndex: 'createdAt', render: time },
          {
            title: '操作',
            key: 'actions',
            render: (_, row) => (
              <Popconfirm
                title="移除这条关系？"
                description={`${label(row.sourceId)} → ${label(row.targetId)}。配置项本身将保留。`}
                okText="确认移除"
                cancelText="取消"
                onConfirm={() => remove(row.id)}
              >
                <Button
                  type="link"
                  aria-label="移除"
                  danger
                  loading={removing === row.id}
                  disabled={!!removing && removing !== row.id}
                >
                  移除
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </>
  );
}

export function RelationsPage() {
  const { api } = useRuntime();
  const [selected, setSelected] = useState<string>();
  const [editing, setEditing] = useState(false);
  const resource = useResource(
    () => Promise.all([api.allCIs(), api.relations(selected)]),
    `relations:${selected ?? ''}`,
  );
  const [cis, relations] = resource.data ?? [];
  const names = new Map(cis?.map((ci) => [ci.id, ci.name]));
  return (
    <>
      <PageTitle
        eyebrow="RESOURCE RELATIONSHIPS"
        title="从单点资源，到业务关系"
        description="把依赖方向说清楚。这里只维护配置关系，不执行任务或自动影响关联资源。"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!cis}
            onClick={() => setEditing(true)}
          >
            建立关系
          </Button>
        }
      />
      <Card className="relationship-filter">
        <Space wrap>
          <Typography.Text>聚焦配置项</Typography.Text>
          <Select
            aria-label="聚焦配置项"
            style={{ minWidth: 240 }}
            showSearch
            optionFilterProp="label"
            allowClear
            placeholder="查看全部关系"
            value={selected}
            options={cis?.map((ci) => ({ value: ci.id, label: ci.name }))}
            onChange={setSelected}
          />
        </Space>
      </Card>
      {resource.error ? (
        <FailureNotice error={resource.error} retry={resource.reload} />
      ) : resource.loading ? (
        <Skeleton active />
      ) : (
        <>
          <Card title="关系视图" className="relation-map">
            {relations?.length ? (
              <div className="edge-list">
                {relations.map((relation) => (
                  <div className="relation-edge" key={relation.id}>
                    <Link to={`/cis?ciId=${relation.sourceId}`}>
                      {names.get(relation.sourceId)}
                    </Link>
                    <span>
                      <small>{relationLabels[relation.type]}</small>
                      <ArrowRightOutlined />
                    </span>
                    <Link to={`/cis?ciId=${relation.targetId}`}>
                      {names.get(relation.targetId)}
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="当前范围没有关联关系" />
            )}
          </Card>
          <Card
            className="table-card"
            title={`关系明细 · ${relations?.length ?? 0}`}
          >
            <RelationTable
              relations={relations ?? []}
              cis={cis ?? []}
              onChanged={resource.reload}
            />
          </Card>
        </>
      )}
      {editing && cis ? (
        <RelationEditor
          cis={cis}
          sourceId={selected}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            resource.reload();
          }}
        />
      ) : null}
    </>
  );
}
