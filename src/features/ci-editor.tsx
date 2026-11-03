import { Alert, App, Form, Input, Modal, Select, Typography } from 'antd';
import { useState } from 'react';
import { ApiError, errorText } from '../shared/api/client';
import type { CI, CIInput, CIModel } from '../shared/api/contracts';
import { environmentLabels, lifecycleLabels } from '../shared/api/contracts';
import { useRuntime } from '../shared/api/runtime';
import { useResource } from '../shared/useResource';
import { fieldControl } from '../shared/field-input';

export function CIEditor({
  ci,
  models,
  onClose,
  onSaved,
}: {
  ci: CI | null;
  models: CIModel[];
  onClose: () => void;
  onSaved: (ci: CI) => void;
}) {
  const { api } = useRuntime();
  const references = useResource(() => api.allCIs(), 'field-references');
  const { modal } = App.useApp();
  const [form] = Form.useForm<CIInput>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const modelId = Form.useWatch('modelId', form) ?? ci?.modelId ?? 'host';
  const model = models.find((item) => item.id === modelId);
  async function save(input: CIInput) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const normalized = { ...input, attributes: input.attributes ?? {} };
      const result = ci
        ? await api.update(ci.id, {
            name: normalized.name,
            owner: normalized.owner,
            environment: normalized.environment,
            status: normalized.status,
            attributes: normalized.attributes,
            revision: ci.revision,
          })
        : await api.create(normalized);
      onSaved(result);
    } catch (reason) {
      setError(reason);
      if (reason instanceof ApiError && reason.fields) {
        const topFields = [
          'externalKey',
          'name',
          'modelId',
          'owner',
          'environment',
          'status',
        ] as const;
        for (const [name, message] of Object.entries(reason.fields)) {
          const top = topFields.find((field) => field === name);
          if (top) form.setFields([{ name: [top], errors: [message] }]);
          else if (name.startsWith('attributes.'))
            form.setFields([
              { name: ['attributes', name.slice(11)], errors: [message] },
            ]);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  function submit(input: CIInput) {
    if (input.status === 'retired' && ci?.status !== 'retired') {
      modal.confirm({
        title: `确认将 ${input.name} 标记为退役？`,
        content:
          '此操作只改变模拟配置项状态，已有关系保留；退役后不能新增关系。',
        okText: '确认退役',
        cancelText: '继续编辑',
        onOk: () => save(input),
      });
    } else void save(input);
  }
  return (
    <Modal
      open
      title={ci ? `编辑配置项 · ${ci.name}` : '新建配置项'}
      okText="保存配置项"
      cancelText="取消"
      onOk={() => form.submit()}
      onCancel={() => {
        if (!busy) onClose();
      }}
      confirmLoading={busy}
      closable={!busy}
      keyboard={!busy}
      mask={{ closable: false }}
      width={640}
    >
      <Typography.Paragraph type="secondary">
        资源标识和模型在建档后固定。只输入虚构资料，不记录密码、密钥或真实资产。
      </Typography.Paragraph>
      {error ? (
        <Alert
          type="error"
          showIcon
          title={errorText(error)}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        initialValues={
          ci ?? {
            modelId: 'host',
            environment: 'staging',
            status: 'active',
            attributes: {},
          }
        }
        onFinish={submit}
        onValuesChange={(changed) => {
          if ('modelId' in changed) form.setFieldValue('attributes', {});
        }}
        disabled={busy}
      >
        <div className="form-grid">
          <Form.Item
            name="modelId"
            label="资源模型"
            rules={[{ required: true }]}
          >
            <Select
              disabled={!!ci}
              options={models.map((model) => ({
                value: model.id,
                label: model.name,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="externalKey"
            label="资源标识"
            rules={[
              { required: true, message: '请输入资源标识' },
              {
                pattern: /^[a-z][a-z0-9._-]{2,63}$/,
                message:
                  '3–64 字符，小写字母开头，可用数字、点、下划线和短横线',
              },
            ]}
          >
            <Input disabled={!!ci} placeholder="demo.web-03" maxLength={64} />
          </Form.Item>
        </div>
        <Form.Item
          name="name"
          label="名称"
          rules={[
            {
              required: true,
              whitespace: true,
              min: 2,
              max: 80,
              message: '名称为 2–80 字符',
            },
          ]}
        >
          <Input placeholder="例如：示例应用节点 03" maxLength={80} />
        </Form.Item>
        <Form.Item
          name="owner"
          label="负责人 / 团队"
          rules={[
            {
              required: true,
              whitespace: true,
              min: 2,
              max: 60,
              message: '请填写 2–60 字符的虚构团队名',
            },
          ]}
        >
          <Input placeholder="示例基础设施团队" maxLength={60} />
        </Form.Item>
        <div className="form-grid">
          <Form.Item
            name="environment"
            label="环境"
            rules={[{ required: true }]}
          >
            <Select
              options={Object.entries(environmentLabels).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </Form.Item>
          <Form.Item
            name="status"
            label="生命周期"
            rules={[{ required: true }]}
          >
            <Select
              options={Object.entries(lifecycleLabels).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </Form.Item>
        </div>
        <Typography.Title level={5}>{model?.name}属性</Typography.Title>
        {model?.fields.map((field) => (
          <Form.Item
            key={`${model.id}-${field.key}`}
            name={['attributes', field.key]}
            label={field.label}
            extra={field.description}
            initialValue={ci ? undefined : field.defaultValue}
            rules={[
              { required: field.required, message: `请填写${field.label}` },
              ...(field.format === 'ipv4'
                ? [
                    {
                      validator: (_: unknown, value: string | undefined) =>
                        !value ||
                        (/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(
                          value,
                        ) &&
                          value.split('.').every((part) => Number(part) <= 255))
                          ? Promise.resolve()
                          : Promise.reject(new Error('请输入有效 IPv4 地址')),
                    },
                  ]
                : []),
            ]}
          >
            {fieldControl(field, references.data, ci?.attributes[field.key])}
          </Form.Item>
        ))}
        {references.error ? (
          <Alert
            type="error"
            title={errorText(references.error)}
            action={<a onClick={references.reload}>重试引用资源</a>}
          />
        ) : null}
      </Form>
    </Modal>
  );
}
