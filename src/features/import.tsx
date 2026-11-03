import { CheckCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Checkbox,
  Card,
  Input,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { Link } from 'react-router';
import type { ImportPreview } from '../shared/api/contracts';
import { useRuntime } from '../shared/api/runtime';
import { useResource } from '../shared/useResource';
import { parseCsv } from '../shared/api/csv';
import { baseColumns } from '../shared/api/imports';
import { sampleCsv } from '../shared/api/seed';
import { FailureNotice, PageTitle } from '../shared/ui';

export function ImportPage() {
  const { api } = useRuntime();
  const models = useResource(() => api.models(), 'import-models');
  const [mode, setMode] = useState<'create' | 'upsert'>('create');
  const [mappingEnabled, setMappingEnabled] = useState(false),
    [mapping, setMapping] = useState<Record<string, string>>({});
  const [mappingModel, setMappingModel] = useState('host');
  const [csv, setCsv] = useState(''),
    [preview, setPreview] = useState<ImportPreview>(),
    [previewedCsv, setPreviewedCsv] = useState('');
  const [busy, setBusy] = useState<'preview' | 'import'>(),
    [error, setError] = useState<unknown>(),
    [created, setCreated] = useState<number>(),
    [updated, setUpdated] = useState(0),
    [unchanged, setUnchanged] = useState(0);
  let columns: string[] = [];
  try {
    columns = parseCsv(csv.replace(/^\uFEFF/, ''))[0]?.cells ?? [];
  } catch {
    /* Preview reports CSV syntax errors. */
  }
  const request = { csv, mode, ...(mappingEnabled ? { mapping } : {}) };
  function invalidate() {
    setPreview(undefined);
    setCreated(undefined);
    setError(undefined);
  }
  function edit(value: string) {
    setCsv(value);
    setPreview(undefined);
    setCreated(undefined);
    setError(undefined);
  }
  async function validate() {
    if (busy) return;
    setBusy('preview');
    setError(undefined);
    setCreated(undefined);
    try {
      const result = await api.previewImport(request);
      setPreview(result);
      setPreviewedCsv(csv);
    } catch (reason) {
      setError(reason);
      setPreview(undefined);
    } finally {
      setBusy(undefined);
    }
  }
  async function submit() {
    if (busy || !preview || preview.invalidCount || previewedCsv !== csv)
      return;
    setBusy('import');
    setError(undefined);
    try {
      const result = await api.import({
        ...request,
        previewId: preview.previewId,
      });
      setCreated(result.createdCount);
      setUpdated(result.updatedCount);
      setUnchanged(result.unchangedCount);
      setPreview(undefined);
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <>
      <PageTitle
        title="CSV 导入"
        description="粘贴虚构 CSV，先预览再提交。每批最多 200 行，任一行不通过就整批不写入。"
      />
      <Steps
        className="import-steps"
        current={created !== undefined ? 2 : preview ? 1 : 0}
        items={[
          { title: '准备数据', content: '选择模式与列映射' },
          { title: '校验预览', content: '逐行确认问题' },
          { title: '完成建档', content: '一次性导入' },
        ]}
      />
      {created !== undefined ? (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          title={
            updated || unchanged
              ? `导入完成：新增 ${created}，更新 ${updated}，无变化 ${unchanged}（模拟）`
              : `已导入 ${created} 个配置项（模拟）`
          }
          description={<Link to="/cis">前往资源清单查看新记录</Link>}
          className="import-result"
        />
      ) : null}
      {error ? (
        <div className="import-result">
          <FailureNotice error={error} />
        </div>
      ) : null}
      <Card
        title={
          <Space>
            <FileTextOutlined />
            粘贴 CSV 内容
          </Space>
        }
        extra={
          <Button disabled={!!busy} onClick={() => edit(sampleCsv)}>
            填入示例
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          默认表头：
          <Typography.Text code>
            externalKey,name,modelId,owner,environment,status
          </Typography.Text>
        </Typography.Paragraph>
        <div className="import-hints">
          <span>
            模型：
            {models.data?.map((model) => model.id).join(' / ') ?? '加载中'}
          </span>
          <span>环境：production / staging / development</span>
          <span>状态：active / maintenance / retired</span>
        </div>
        {models.error ? (
          <FailureNotice error={models.error} retry={models.reload} />
        ) : null}
        <Space wrap style={{ marginBottom: 16 }}>
          <Typography.Text>导入模式</Typography.Text>
          <Select
            aria-label="导入模式"
            disabled={!!busy}
            value={mode}
            style={{ width: 200 }}
            options={[
              { value: 'create', label: '仅新增（默认）' },
              { value: 'upsert', label: '新增或更新（按资源标识）' },
            ]}
            onChange={(value) => {
              setMode(value);
              invalidate();
            }}
          />
          <Checkbox
            checked={mappingEnabled}
            disabled={!!busy}
            onChange={(event) => {
              setMappingEnabled(event.target.checked);
              setMapping(
                Object.fromEntries(
                  baseColumns
                    .filter((key) => columns.includes(key))
                    .map((key) => [key, key]),
                ),
              );
              invalidate();
            }}
          >
            自定义列映射
          </Checkbox>
        </Space>
        {mode === 'upsert' ? (
          <Alert
            type="warning"
            showIcon
            title="已存在资源会按映射字段更新。请确认下方逐项差异；未映射属性保留，映射到空白的可选属性会清除或使用模型默认值。"
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <Input.TextArea
          aria-label="CSV 内容"
          value={csv}
          onChange={(event) => edit(event.target.value)}
          disabled={!!busy}
          autoSize={{ minRows: 8, maxRows: 18 }}
          maxLength={100000}
          placeholder="请使用虚构数据；支持双引号、逗号和 CRLF 换行。"
          className="csv-input"
        />
        {mappingEnabled ? (
          <div style={{ marginTop: 16 }}>
            <Space wrap>
              <Typography.Text>专有字段所属模型</Typography.Text>
              <Select
                aria-label="映射字段模型"
                disabled={!!busy}
                value={mappingModel}
                options={models.data?.map((model) => ({
                  value: model.id,
                  label: model.name,
                }))}
                onChange={(value) => {
                  setMappingModel(value);
                  setMapping(
                    Object.fromEntries(
                      Object.entries(mapping).filter(
                        ([key]) => !key.startsWith('attributes.'),
                      ),
                    ),
                  );
                  invalidate();
                }}
              />
            </Space>
            <Typography.Paragraph type="secondary">
              六个基础字段必须映射；专有字段可选。一个源列只映射一次，未映射的
              CSV 列忽略。跨模型不兼容的专有属性会返回行级错误。
            </Typography.Paragraph>
            <div className="form-grid">
              {[
                ...baseColumns.map((key) => ({ key, label: key })),
                ...(models.data
                  ?.find((model) => model.id === mappingModel)
                  ?.fields.map((field) => ({
                    key: `attributes.${field.key}`,
                    label: `${field.label} (${field.key})`,
                  })) ?? []),
              ].map((target) => (
                <div className="query-field" key={target.key}>
                  <label htmlFor={`map-${target.key}`}>{target.label}</label>
                  <Select
                    id={`map-${target.key}`}
                    aria-label={`映射 ${target.key}`}
                    disabled={!!busy}
                    allowClear
                    placeholder="选择 CSV 源列"
                    value={mapping[target.key]}
                    options={columns.map((value) => ({ value, label: value }))}
                    onChange={(value: string | undefined) => {
                      setMapping((prior) => {
                        const next = { ...prior };
                        if (value) next[target.key] = value;
                        else delete next[target.key];
                        return next;
                      });
                      invalidate();
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="import-actions">
          <Typography.Text type="secondary">
            预览不写入。刷新页面后演示数据重置。
          </Typography.Text>
          <Space wrap>
            <Button
              loading={busy === 'preview'}
              disabled={!!busy || !csv.trim()}
              onClick={() => void validate()}
            >
              校验并预览
            </Button>
            <Button
              type="primary"
              loading={busy === 'import'}
              disabled={
                !!busy ||
                !preview ||
                preview.invalidCount > 0 ||
                previewedCsv !== csv
              }
              onClick={() => void submit()}
            >
              确认导入 {preview?.validCount ?? 0} 项
            </Button>
          </Space>
        </div>
      </Card>
      {preview ? (
        <Card
          className="import-preview"
          title="导入预览"
          extra={
            <Space>
              <Tag color="success">可导入 {preview.validCount}</Tag>
              <Tag>新增 {preview.createdCount ?? 0}</Tag>
              <Tag>更新 {preview.updatedCount ?? 0}</Tag>
              <Tag>无变化 {preview.unchangedCount ?? 0}</Tag>
              <Tag color={preview.invalidCount ? 'error' : 'default'}>
                有问题 {preview.invalidCount}
              </Tag>
            </Space>
          }
        >
          {preview.invalidCount ? (
            <Alert
              type="warning"
              showIcon
              title="请修复所有问题后重新预览，当前没有写入任何数据。"
            />
          ) : (
            <Alert
              type="success"
              showIcon
              title="校验通过，可以提交。提交时仍会重新校验唯一性和字段。"
            />
          )}
          <Table
            rowKey="line"
            dataSource={preview.rows}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 680 }}
            columns={[
              { title: 'CSV 行', dataIndex: 'line', width: 90 },
              {
                title: '资源标识',
                render: (_, row) => row.input?.externalKey ?? '—',
              },
              { title: '名称', render: (_, row) => row.input?.name ?? '—' },
              {
                title: '操作',
                render: (_, row) =>
                  ({
                    create: '新增',
                    update: '更新',
                    unchanged: '无变化',
                    conflict: '冲突',
                  })[row.action ?? 'conflict'],
              },
              {
                title: '字段差异',
                width: 320,
                render: (_, row) =>
                  row.action === 'unchanged' ? (
                    '保持原记录'
                  ) : (
                    <ul>
                      {row.changes?.map((change) => (
                        <li key={change.field}>
                          {change.field}：
                          {change.before === null
                            ? '空'
                            : String(change.before)}{' '}
                          →{' '}
                          {change.after === null ? '空' : String(change.after)}
                        </li>
                      ))}
                    </ul>
                  ),
              },
              {
                title: '校验结果',
                render: (_, row) =>
                  row.errors.length ? (
                    <span className="validation-error">
                      {row.errors.join('；')}
                    </span>
                  ) : (
                    <Tag color="success">通过</Tag>
                  ),
              },
            ]}
          />
        </Card>
      ) : null}
    </>
  );
}
