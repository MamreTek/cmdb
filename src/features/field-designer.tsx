import {
  Alert,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import type {
  CIModel,
  ModelField,
  SchemaPreview,
  FieldChange,
} from '../shared/api/contracts';
import { useRuntime } from '../shared/api/runtime';
import { useResource } from '../shared/useResource';
import { FailureNotice } from '../shared/ui';
import {
  attributeText,
  fieldControl,
  fieldTypeLabels,
} from '../shared/field-input';

export function FieldDesigner({
  model,
  models,
  done,
  close,
  existingField,
}: {
  model: CIModel;
  models: CIModel[];
  done: () => void;
  close: () => void;
  existingField?: ModelField;
}) {
  const { api } = useRuntime();
  const [form] = Form.useForm();
  const impactRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<SchemaPreview>(),
    [payload, setPayload] = useState<FieldChange>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  useEffect(() => {
    if (preview) impactRef.current?.scrollIntoView({ block: 'nearest' });
  }, [preview]);
  const type = (Form.useWatch('type', form) as ModelField['type']) ?? 'text';
  const referenceModelId = Form.useWatch('referenceModelId', form) as
    string | undefined;
  const options = Form.useWatch('optionsText', form) as string | undefined;
  const cis = useResource(() => api.allCIs(), 'field-default-references');
  const maxLength = Form.useWatch('maxLength', form) as number | undefined;
  const minValue = Form.useWatch('minValue', form) as number | undefined;
  const maxValue = Form.useWatch('maxValue', form) as number | undefined;
  async function submit(values: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (preview && payload && !existingField) {
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
        setPreview(
          await (existingField
            ? api.previewMigration(model.id, request)
            : api.previewField(model.id, request)),
        );
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
      title={`${existingField ? '字段迁移预览' : '新增字段'} · ${model.name}`}
      style={{ top: 24 }}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      width={640}
      okText={
        existingField ? '评估影响' : preview ? '确认添加字段' : '预览影响'
      }
      cancelText="取消"
      confirmLoading={busy}
      okButtonProps={{ disabled: !existingField && !!preview?.errors.length }}
      onCancel={() => !busy && close()}
      mask={{ closable: false }}
      onOk={() => form.submit()}
    >
      <Typography.Paragraph type="secondary">
        {existingField
          ? '只评估候选类型/约束的迁移影响，不执行改型，不截断存量值。实际修改需另行确认。'
          : '继承字段在声明类维护。父类追加字段检查整个子树，默认值回填会增加资源版本并留下模拟记录。'}
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
          ...(existingField
            ? {
                ...existingField,
                type: existingField.type ?? 'text',
                optionsText: existingField.options?.join('\n'),
              }
            : {}),
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
              maxLength: changed.type === 'varchar' ? 255 : undefined,
              minValue: changed.type === 'integer' ? -2147483648 : undefined,
              maxValue: changed.type === 'integer' ? 2147483647 : undefined,
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
            <Input disabled={!!existingField} placeholder="例如：costCenter" />
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
        {type === 'varchar' ? (
          <Form.Item
            name="maxLength"
            label="最大字符数"
            rules={[{ required: true, type: 'integer', min: 1, max: 4096 }]}
            extra="按Unicode字符计数，超长拒绝，不自动截断；默认255，原型上限4096。"
          >
            <InputNumber min={1} max={4096} />
          </Form.Item>
        ) : null}
        {type === 'integer' ? (
          <div className="form-grid">
            <Form.Item
              name="minValue"
              label="最小整数"
              rules={[{ type: 'integer', min: -2147483648, max: 2147483647 }]}
            >
              <InputNumber />
            </Form.Item>
            <Form.Item
              name="maxValue"
              label="最大整数"
              rules={[{ type: 'integer', min: -2147483648, max: 2147483647 }]}
            >
              <InputNumber />
            </Form.Item>
          </div>
        ) : null}
        {type === 'timestamp' ? (
          <Alert
            type="info"
            showIcon
            title="显式时区、最多3位毫秒，归一化UTC。兼容范围1970-01-01T00:00:01Z至2038-01-19T03:14:07.499Z；默认值为固定时间，不是自动当前时间。"
            style={{ marginBottom: 16 }}
          />
        ) : null}
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
        <Form.Item key={type} name="defaultValue" label="默认值（可选）">
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
              maxLength,
              minValue,
              maxValue,
            },
            cis.data,
            undefined,
            models,
          )}
        </Form.Item>
        <Space wrap>
          <Form.Item name="required" valuePropName="checked">
            <Checkbox>必填</Checkbox>
          </Form.Item>
          <Form.Item name="unique" valuePropName="checked">
            <Checkbox>声明类及其子类唯一（含退役资源）</Checkbox>
          </Form.Item>
        </Space>
        <Form.Item name="description" label="字段说明">
          <Input maxLength={160} />
        </Form.Item>
      </Form>
      {preview ? (
        <div ref={impactRef}>
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
              ) : existingField ? (
                '仅预览，未修改模型、资源或变更记录。'
              ) : (
                '提交时再次检查模型版本与存量数据。'
              )
            }
          />
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={preview.affectedClasses}
            columns={[
              { title: '受影响CI Class', dataIndex: 'name' },
              { title: '当前版本', dataIndex: 'revision' },
              { title: '资源数', dataIndex: 'ciCount' },
            ]}
          />
          {existingField ? (
            <Table
              size="small"
              rowKey="externalKey"
              pagination={{ pageSize: 5 }}
              dataSource={preview.changes}
              scroll={{ x: 450 }}
              columns={[
                { title: '资源标识', dataIndex: 'externalKey' },
                { title: '当前值', dataIndex: 'before', render: attributeText },
                { title: '候选值', dataIndex: 'after', render: attributeText },
              ]}
            />
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
