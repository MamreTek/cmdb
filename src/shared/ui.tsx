import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Empty,
  Space,
  Typography,
} from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { errorText } from './api/client';
import { lifecycleLabels, type Lifecycle } from './api/contracts';

export function PageTitle({
  title,
  description,
  extra,
}: {
  title: string;
  description: string;
  extra?: ReactNode;
}) {
  return (
    <div className="page-header">
      <Breadcrumb
        items={[{ title: <Link to="/">配置管理</Link> }, { title }]}
      />
      <div className="page-title">
        <div>
          <Typography.Title level={2}>{title}</Typography.Title>
          <Typography.Paragraph type="secondary">
            {description}
          </Typography.Paragraph>
        </div>
        {extra && <Space wrap>{extra}</Space>}
      </div>
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
    <Badge
      status={
        status === 'active'
          ? 'success'
          : status === 'maintenance'
            ? 'warning'
            : 'default'
      }
      text={lifecycleLabels[status]}
    />
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
