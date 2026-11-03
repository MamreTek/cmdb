import { Alert, Button, Empty, Space, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { errorText } from './api/client';
import { lifecycleLabels, type Lifecycle } from './api/contracts';

export function PageTitle({
  eyebrow,
  title,
  description,
  extra,
}: {
  eyebrow: string;
  title: string;
  description: string;
  extra?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <Typography.Title level={2}>{title}</Typography.Title>
        <Typography.Paragraph type="secondary">
          {description}
        </Typography.Paragraph>
      </div>
      <Space wrap>{extra}</Space>
    </div>
  );
}
export function FailureNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <Alert
      type="error"
      showIcon
      title="请求未完成"
      description={errorText(error)}
      action={
        retry ? (
          <Button aria-label="重试" onClick={retry}>
            重试
          </Button>
        ) : undefined
      }
    />
  );
}
export function StatusTag({ status }: { status: Lifecycle }) {
  return (
    <Tag
      color={
        status === 'active'
          ? 'success'
          : status === 'maintenance'
            ? 'warning'
            : 'default'
      }
    >
      {lifecycleLabels[status]}
    </Tag>
  );
}
export function EmptyState({ text = '还没有匹配的配置项' }: { text?: string }) {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />;
}
export function time(value: string): string {
  return (
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value)) + ' UTC'
  );
}
