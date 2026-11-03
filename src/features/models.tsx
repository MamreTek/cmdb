import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import type {
  CIModel,
  ModelField,
  SchemaPreview,
  FieldChange,
} from '../shared/api/contracts';
import { errorText } from '../shared/api/client';
import { useRuntime } from '../shared/api/runtime';
import { useResource } from '../shared/useResource';
import { FailureNotice, PageTitle } from '../shared/ui';
import {
  attributeText,
  fieldControl,
  fieldTypeLabels,
} from '../shared/field-input';
import { RelationRulesPanel } from './relation-rules';

function FieldEditor({
  model,
  models,
  done,
  close,
}: {
  model: CIModel;
  models: CIModel[];
  done: () => void;
  close: () => void;
}) {
  const { api } = useRuntime();
  const [form] = Form.useForm();
  const [preview, setPreview] = useState<SchemaPreview>(),
    [payload, setPayload] = useState<FieldChange>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const type = (Form.useWatch('type', form) as ModelField['type']) ?? 'text';
  const referenceModelId = Form.useWatch('referenceModelId', form) as
    string | undefined;
  const options = Form.useWatch('optionsText', form) as string | undefined;
  const cis = useResource(() => api.allCIs(), 'field-default-references');
  async function submit(values: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (preview && payload) {
        await api.addField(model.id, payload);
        done();
      } else {
        const { optionsText, ...rest } = values;
        const field = {
          ...rest,
          ...(type === 'enum'
            ? {
                options: String(optionsText ?? '')
                  .split('\n')
                  .map((value) => value.trim())
                  .filter(Boolean),
              }
            : {}),
        } as unknown as ModelField;
        if (field.defaultValue === '' || field.defaultValue === null)
          delete field.defaultValue;
        const request = { revision: model.revision ?? 1, field };
        setPreview(await api.previewField(model.id, request));
        setPayload(request);
      }
    } catch (reason) {
      setError(reason);
      setPreview(undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={`新增字段 · ${model.name}`}
      width={640}
      okText={preview ? '确认添加字段' : '预览影响'}
      cancelText="取消"
      confirmLoading={busy}
      okButtonProps={{ disabled: !!preview?.errors.length }}
      onCancel={() => !busy && close()}
      mask={{ closable: false }}
      onOk={() => form.submit()}
    >
      <Typography.Paragraph type="secondary">
        字段创建后标识与类型固定。先检查存量数据；默认值回填会增加资源版本并留下模拟记录。
      </Typography.Paragraph>
      {error ? <FailureNotice error={error} /> : null}
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          type: 'text',
          required: false,
          unique: false,
          description: '',
        }}
        onFinish={(values) => void submit(values)}
        disabled={busy}
        onValuesChange={(changed) => {
          setPreview(undefined);
          setPayload(undefined);
          if ('type' in changed)
            form.setFieldsValue({
              defaultValue: undefined,
              optionsText: undefined,
              referenceModelId: undefined,
            });
        }}
      >
        <div className="form-grid">
          <Form.Item
            name="key"
            label="字段标识"
            rules={[
              {
                required: true,
                pattern: /^[a-z][a-zA-Z0-9_]{0,39}$/,
                message: '小写字母开头，最多 40 位字母、数字或下划线',
              },
            ]}
          >
            <Input placeholder="例如：costCenter" />
          </Form.Item>
          <Form.Item
            name="label"
            label="字段名称"
            rules={[{ required: true, whitespace: true, max: 40 }]}
          >
            <Input placeholder="例如：成本中心" />
          </Form.Item>
        </div>
        <Form.Item name="type" label="字段类型" rules={[{ required: true }]}>
          <Select
            options={Object.entries(fieldTypeLabels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </Form.Item>
        {type === 'enum' ? (
          <Form.Item
            name="optionsText"
            label="枚举选项（每行一个）"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        ) : null}
        {type === 'reference' ? (
          <Form.Item
            name="referenceModelId"
            label="引用目标模型"
            rules={[{ required: true }]}
          >
            <Select
              options={models.map((model) => ({
                value: model.id,
                label: model.name,
              }))}
            />
          </Form.Item>
        ) : null}
        <Form.Item name="defaultValue" label="默认值（可选）">
          {fieldControl(
            {
              key: 'default',
              label: '默认值',
              description: '',
              type,
              options: options
                ?.split('\n')
                .map((value) => value.trim())
                .filter(Boolean),
              referenceModelId,
            },
            cis.data,
          )}
        </Form.Item>
        <Space wrap>
          <Form.Item name="required" valuePropName="checked">
            <Checkbox>必填</Checkbox>
          </Form.Item>
          <Form.Item name="unique" valuePropName="checked">
            <Checkbox>模型内唯一（含退役资源）</Checkbox>
          </Form.Item>
        </Space>
        <Form.Item name="description" label="字段说明">
          <Input maxLength={160} />
        </Form.Item>
      </Form>
      {preview ? (
        <Alert
          type={preview.errors.length ? 'warning' : 'success'}
          showIcon
          title={`影响 ${preview.total} 个资源，默认值回填 ${preview.backfillCount} 个，阻塞 ${preview.errors.length} 个`}
          description={
            preview.errors.length ? (
              <ul>
                {preview.errors.slice(0, 8).map((error) => (
                  <li key={error.externalKey}>
                    {error.externalKey}：{error.message}
                  </li>
                ))}
              </ul>
            ) : (
              '提交时再次检查模型版本与存量数据。'
            )
          }
        />
      ) : null}
    </Modal>
  );
}

export function ModelsPage() {
  const { api } = useRuntime(),
    { message } = App.useApp();
  const resource = useResource(() => api.models(), 'models');
  const [adding, setAdding] = useState(false),
    [selected, setSelected] = useState<CIModel>();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  async function create(values: {
    id: string;
    name: string;
    description: string;
  }) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.createModel(values);
      setAdding(false);
      form.resetFields();
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
        description="配置资源类型、字段约束和模型关系。先预览存量影响，再确认变更。"
      />
      <Tabs
        items={[
          {
            key: 'models',
            label: '模型与字段',
            children: (
              <Card
                className="table-card"
                title="模型列表"
                extra={
                  <Button
                    type="primary"
                    onClick={() => {
                      setError(undefined);
                      setAdding(true);
                    }}
                  >
                    新建模型
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
                    rowKey="id"
                    loading={resource.loading}
                    dataSource={resource.data}
                    pagination={false}
                    scroll={{ x: 650 }}
                    expandable={{
                      defaultExpandedRowKeys: ['host'],
                      expandedRowRender: (model) => (
                        <Table
                          rowKey="key"
                          dataSource={model.fields}
                          pagination={false}
                          size="small"
                          scroll={{ x: 680 }}
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
                              title: '约束',
                              render: (_, field) =>
                                [
                                  field.required ? '必填' : '可选',
                                  field.unique ? '唯一' : '',
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
                      { title: '说明', dataIndex: 'description' },
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
              name="id"
              label="模型标识"
              rules={[{ required: true, pattern: /^[a-z][a-z0-9_]{1,39}$/ }]}
            >
              <Input placeholder="例如：middleware" />
            </Form.Item>
            <Form.Item
              name="name"
              label="模型名称"
              rules={[{ required: true, min: 2, max: 40 }]}
            >
              <Input placeholder="例如：中间件" />
            </Form.Item>
            <Form.Item name="description" label="模型说明">
              <Input.TextArea maxLength={160} />
            </Form.Item>
          </Form>
        </Modal>
      ) : null}
      {selected ? (
        <FieldEditor
          model={selected}
          models={resource.data ?? []}
          close={() => setSelected(undefined)}
          done={() => {
            setSelected(undefined);
            resource.reload();
            void message.success('字段已添加（模拟）');
          }}
        />
      ) : null}
    </>
  );
}
