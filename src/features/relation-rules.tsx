import { Button, Card, Form, Modal, Select, Table, Typography } from 'antd';
import { useState } from 'react';
import type { RelationRule, RelationRuleInput } from '../shared/api/contracts';
import { relationLabels } from '../shared/api/contracts';
import { useRuntime } from '../shared/api/runtime';
import { useResource } from '../shared/useResource';
import { FailureNotice } from '../shared/ui';

export function RelationRulesPanel() {
  const { api } = useRuntime();
  const data = useResource(
    () => Promise.all([api.models(), api.relationRules()]),
    'model-rules',
  );
  const [editing, setEditing] = useState<RelationRule | null>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const [form] = Form.useForm<RelationRuleInput>();
  const [models, rules] = data.data ?? [];
  const label = (id: string) =>
    models?.find((model) => model.id === id)?.name ?? id;
  function open(rule: RelationRule | null) {
    setEditing(rule);
    setError(undefined);
    form.resetFields();
    form.setFieldsValue(rule ?? { type: 'depends_on', cardinality: 'n:n' });
  }
  async function save(values: RelationRuleInput) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (editing)
        await api.updateRule(editing.id, {
          revision: editing.revision,
          cardinality: values.cardinality,
        });
      else await api.createRule(values);
      setEditing(undefined);
      data.reload();
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      title="模型关系规则"
      extra={
        <Button type="primary" disabled={!models} onClick={() => open(null)}>
          新增规则
        </Button>
      }
    >
      <Typography.Paragraph type="secondary">
        1:1：源和目标各最多一条；1:n：一个源可连接多个目标，每个目标最多一个源；n:n：两端不限。规则仅作用于指定模型和关系类型，包含保留的退役资源关系。
      </Typography.Paragraph>
      {data.error ? (
        <FailureNotice error={data.error} retry={data.reload} />
      ) : (
        <Table<RelationRule>
          rowKey="id"
          loading={data.loading}
          dataSource={rules}
          scroll={{ x: 650 }}
          columns={[
            { title: '源模型', dataIndex: 'sourceModelId', render: label },
            {
              title: '关系',
              dataIndex: 'type',
              render: (type: RelationRule['type']) => relationLabels[type],
            },
            { title: '目标模型', dataIndex: 'targetModelId', render: label },
            { title: '基数', dataIndex: 'cardinality' },
            {
              title: '操作',
              render: (_, rule) => (
                <Button type="link" onClick={() => open(rule)}>
                  编辑基数
                </Button>
              ),
            },
          ]}
        />
      )}
      {editing !== undefined ? (
        <Modal
          open
          title={editing ? '编辑关系基数' : '新增模型关系规则'}
          okText="保存规则"
          cancelText="取消"
          confirmLoading={busy}
          onOk={() => form.submit()}
          onCancel={() => !busy && setEditing(undefined)}
          mask={{ closable: false }}
        >
          {error ? <FailureNotice error={error} /> : null}
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => void save(values)}
            disabled={busy}
          >
            <Form.Item
              name="sourceModelId"
              label="源模型"
              rules={[{ required: true }]}
            >
              <Select
                disabled={!!editing}
                options={models?.map((model) => ({
                  value: model.id,
                  label: model.name,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="type"
              label="关系类型"
              rules={[{ required: true }]}
            >
              <Select
                disabled={!!editing}
                options={Object.entries(relationLabels).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
            </Form.Item>
            <Form.Item
              name="targetModelId"
              label="目标模型"
              rules={[{ required: true }]}
            >
              <Select
                disabled={!!editing}
                options={models?.map((model) => ({
                  value: model.id,
                  label: model.name,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="cardinality"
              label="关系基数"
              rules={[{ required: true }]}
            >
              <Select
                options={['1:1', '1:n', 'n:n'].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Form.Item>
          </Form>
          <Typography.Text type="secondary">
            提交时检查现有关系，冲突时整项规则变更拒绝。
          </Typography.Text>
        </Modal>
      ) : null}
    </Card>
  );
}
