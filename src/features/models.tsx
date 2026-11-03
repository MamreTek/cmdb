import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Table,
  Tabs,
  Tag,
  Tree,
  TreeSelect,
  Typography,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useState } from 'react';
import type { CIClassNode, CIModel, ModelField } from '../shared/api/contracts';
import {
  classLineage,
  classOptions,
  classTree,
} from '../shared/api/class-schema';
import { errorText } from '../shared/api/client';
import { useRuntime } from '../shared/api/runtime';
import { useResource } from '../shared/useResource';
import { FailureNotice, PageTitle } from '../shared/ui';
import { attributeText, fieldTypeLabels } from '../shared/field-input';
import { RelationRulesPanel } from './relation-rules';
import { FieldDesigner } from './field-designer';

const navigationNodes = (nodes: CIClassNode[]): DataNode[] =>
  nodes.map((node) => ({
    key: node.id,
    title: `${node.name} (${node.id})`,
    children: navigationNodes(node.children),
  }));

export function ModelsPage() {
  const { api } = useRuntime(),
    { message } = App.useApp();
  const resource = useResource(() => api.models(), 'models');
  const [adding, setAdding] = useState(false),
    [selected, setSelected] = useState<CIModel>(),
    [selectedClass, setSelectedClass] = useState<string>();
  const [migration, setMigration] = useState<{
    model: CIModel;
    field: ModelField;
  }>();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const models = resource.data ?? [];
  async function create(values: {
    id: string;
    name: string;
    description: string;
    parentId?: string;
  }) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const created = await api.createModel(values);
      setAdding(false);
      form.resetFields();
      setSelectedClass(created.id);
      resource.reload();
      void message.success('模型已创建（模拟）');
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="资源模型"
        description="CI Class 单继承树：子类继承父类字段及约束，显示声明来源；追加字段先预览整个子树。"
      />
      <Tabs
        items={[
          {
            key: 'models',
            label: '模型与字段',
            children: (
              <div className="class-layout">
                <Card title="CI Class 树" size="small">
                  <Input.Search
                    aria-label="定位 CI Class"
                    placeholder="类名称或标识"
                    allowClear
                    onSearch={(value) => {
                      const text = value.trim();
                      if (!text) {
                        setSelectedClass(undefined);
                        return;
                      }
                      const found = models.find(
                        (model) =>
                          model.name.includes(text) || model.id.includes(text),
                      );
                      if (found) setSelectedClass(found.id);
                      else void message.info('未找到匹配的 CI Class');
                    }}
                  />
                  <Tree
                    style={{ marginTop: 16 }}
                    defaultExpandAll
                    key={models.map((model) => model.id).join(',')}
                    selectedKeys={[selectedClass ?? 'all-classes']}
                    treeData={[
                      {
                        key: 'all-classes',
                        title: '全部 CI Class',
                        children: navigationNodes(classTree(models)),
                      },
                    ]}
                    onSelect={(keys) =>
                      setSelectedClass(
                        keys[0] && keys[0] !== 'all-classes'
                          ? String(keys[0])
                          : undefined,
                      )
                    }
                  />
                  <Typography.Paragraph
                    type="secondary"
                    style={{ marginTop: 16 }}
                  >
                    单继承，最多6层。继承字段在声明类维护；关系规则按具体类匹配，不自动继承。已有类不提供移动或删除。
                  </Typography.Paragraph>
                </Card>
                <Card
                  className="table-card"
                  title={
                    selectedClass
                      ? `CI Class · ${models.find((model) => model.id === selectedClass)?.name ?? selectedClass}`
                      : '模型列表'
                  }
                  extra={
                    <Button
                      type="primary"
                      onClick={() => {
                        setError(undefined);
                        form.resetFields();
                        form.setFieldValue('parentId', selectedClass);
                        setAdding(true);
                      }}
                    >
                      {selectedClass ? '新建子类' : '新建模型'}
                    </Button>
                  }
                >
                  {resource.error ? (
                    <FailureNotice
                      error={resource.error}
                      retry={resource.reload}
                    />
                  ) : (
                    <Table<CIModel>
                      key={selectedClass ?? 'all-classes'}
                      tableLayout="fixed"
                      rowKey="id"
                      loading={resource.loading}
                      dataSource={models.filter(
                        (model) => !selectedClass || model.id === selectedClass,
                      )}
                      pagination={false}
                      scroll={{ x: 780 }}
                      expandable={{
                        defaultExpandedRowKeys: ['host'],
                        ...(selectedClass
                          ? { expandedRowKeys: [selectedClass] }
                          : {}),
                        expandedRowRender: (model) => (
                          <Table<ModelField>
                            tableLayout="fixed"
                            rowKey="key"
                            dataSource={model.fields}
                            pagination={false}
                            size="small"
                            scroll={{ x: 1080 }}
                            locale={{
                              emptyText: '尚无专有字段，可添加第一个字段',
                            }}
                            columns={[
                              { title: '字段名称', dataIndex: 'label' },
                              {
                                title: '标识',
                                dataIndex: 'key',
                                render: (key: string) => (
                                  <Typography.Text code>{key}</Typography.Text>
                                ),
                              },
                              {
                                title: '类型',
                                render: (_, field) =>
                                  fieldTypeLabels[field.type ?? 'text'],
                              },
                              {
                                title: '声明来源',
                                render: (_, field) => (
                                  <Tag
                                    color={
                                      field.originModelId &&
                                      field.originModelId !== model.id
                                        ? 'blue'
                                        : 'default'
                                    }
                                  >
                                    {models.find(
                                      (item) => item.id === field.originModelId,
                                    )?.name ?? model.name}
                                    {field.originModelId &&
                                    field.originModelId !== model.id
                                      ? ' · 继承只读'
                                      : ' · 本类'}
                                  </Tag>
                                ),
                              },
                              {
                                title: '约束',
                                render: (_, field) =>
                                  [
                                    field.required ? '必填' : '可选',
                                    field.unique ? '声明类及子类唯一' : '',
                                    field.maxLength
                                      ? `最长${field.maxLength}字符`
                                      : '',
                                    field.type === 'integer'
                                      ? `${field.minValue}–${field.maxValue}`
                                      : '',
                                    field.options?.join(' / '),
                                    field.referenceModelId
                                      ? `引用 ${field.referenceModelId}`
                                      : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' · '),
                              },
                              {
                                title: '默认值',
                                render: (_, field) =>
                                  attributeText(field.defaultValue),
                              },
                              {
                                title: '调整评估',
                                render: (_, field) => (
                                  <Button
                                    type="link"
                                    disabled={
                                      !!field.originModelId &&
                                      field.originModelId !== model.id
                                    }
                                    onClick={() =>
                                      setMigration({ model, field })
                                    }
                                  >
                                    预览迁移
                                  </Button>
                                ),
                              },
                            ]}
                          />
                        ),
                      }}
                      columns={[
                        { title: '模型', dataIndex: 'name' },
                        {
                          title: '标识',
                          dataIndex: 'id',
                          render: (id: string) => <Tag>{id}</Tag>,
                        },
                        {
                          title: '层级路径',
                          render: (_, model) =>
                            classLineage(model.id, models)
                              .map((item) => item.name)
                              .join(' / '),
                        },
                        {
                          title: '字段数',
                          render: (_, model) => model.fields.length,
                        },
                        {
                          title: '版本',
                          render: (_, model) => model.revision ?? 1,
                        },
                        {
                          title: '操作',
                          render: (_, model) => (
                            <Button
                              type="link"
                              onClick={() => setSelected(model)}
                            >
                              新增字段
                            </Button>
                          ),
                        },
                      ]}
                    />
                  )}
                </Card>
              </div>
            ),
          },
          {
            key: 'rules',
            label: '模型关系规则',
            children: <RelationRulesPanel />,
          },
        ]}
      />
      {adding ? (
        <Modal
          open
          title="新建资源模型"
          okText="创建模型"
          cancelText="取消"
          onOk={() => form.submit()}
          confirmLoading={busy}
          onCancel={() => !busy && setAdding(false)}
          mask={{ closable: false }}
        >
          {error ? <Alert type="error" title={errorText(error)} /> : null}
          <Form
            form={form}
            layout="vertical"
            initialValues={{ description: '' }}
            onFinish={(values) => void create(values)}
            disabled={busy}
          >
            <Form.Item
              name="parentId"
              label="父 CI Class（可选）"
              extra="留空为根类。建档后父类固定，继承字段不可覆盖。"
            >
              <TreeSelect
                allowClear
                treeDefaultExpandAll
                treeData={classOptions(models)}
                placeholder="选择父类或留空"
              />
            </Form.Item>
            <Form.Item
              name="id"
              label="模型标识"
              rules={[{ required: true, pattern: /^[a-z][a-z0-9_]{1,39}$/ }]}
            >
              <Input placeholder="例如：linux_host" />
            </Form.Item>
            <Form.Item
              name="name"
              label="模型名称"
              rules={[{ required: true, min: 2, max: 40 }]}
            >
              <Input placeholder="例如：Linux 主机" />
            </Form.Item>
            <Form.Item name="description" label="模型说明">
              <Input.TextArea maxLength={160} />
            </Form.Item>
          </Form>
        </Modal>
      ) : null}
      {selected ? (
        <FieldDesigner
          model={selected}
          models={models}
          close={() => setSelected(undefined)}
          done={() => {
            setSelected(undefined);
            resource.reload();
            void message.success('字段已添加（模拟）');
          }}
        />
      ) : null}
      {migration ? (
        <FieldDesigner
          model={migration.model}
          models={models}
          existingField={migration.field}
          done={() => undefined}
          close={() => setMigration(undefined)}
        />
      ) : null}
    </>
  );
}
