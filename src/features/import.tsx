import { CheckCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Input,
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
import { sampleCsv } from '../shared/api/seed';
import { FailureNotice, PageTitle } from '../shared/ui';

export function ImportPage() {
  const { api } = useRuntime();
  const [csv, setCsv] = useState(''),
    [preview, setPreview] = useState<ImportPreview>(),
    [previewedCsv, setPreviewedCsv] = useState('');
  const [busy, setBusy] = useState<'preview' | 'import'>(),
    [error, setError] = useState<unknown>(),
    [created, setCreated] = useState<number>();
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
      const result = await api.previewImport(csv);
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
      const result = await api.import(csv);
      setCreated(result.createdCount);
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
        eyebrow="QUICK ONBOARDING"
        title="从一份清单开始"
        description="粘贴虚构 CSV，先预览再提交。每批最多 200 行，任一行不通过就整批不写入。"
      />
      <Steps
        className="import-steps"
        current={created ? 2 : preview ? 1 : 0}
        items={[
          { title: '准备数据', content: '使用固定表头' },
          { title: '校验预览', content: '逐行确认问题' },
          { title: '完成建档', content: '一次性导入' },
        ]}
      />
      {created ? (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          title={`已导入 ${created} 个配置项（模拟）`}
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
          表头：
          <Typography.Text code>
            externalKey,name,modelId,owner,environment,status
          </Typography.Text>
        </Typography.Paragraph>
        <div className="import-hints">
          <span>模型：host / service / database</span>
          <span>环境：production / staging / development</span>
          <span>状态：active / maintenance / retired</span>
        </div>
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
