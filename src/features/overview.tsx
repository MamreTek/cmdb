import { PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Typography,
} from 'antd';
import { Link, useNavigate } from 'react-router';
import type { CIModel } from '../shared/api/contracts';
import { useRuntime } from '../shared/api/runtime';
import { useResource } from '../shared/useResource';
import { EmptyState, FailureNotice, PageTitle, time } from '../shared/ui';

export function Overview() {
  const { api } = useRuntime();
  const navigate = useNavigate();
  const resource = useResource(
    () =>
      Promise.all([api.summary(), api.models(), api.changes({ pageSize: 5 })]),
    'overview',
  );
  const [summary, models, changes] = resource.data ?? [];
  return (
    <>
      <PageTitle
        title="配置总览"
        description="查看配置项数量、生命周期、模型分布和最近变更。"
        extra={
          <>
            <Button onClick={() => navigate('/import')}>导入配置项</Button>
            <Button
              type="primary"
              aria-label="新建配置项"
              icon={<PlusOutlined />}
              onClick={() => navigate('/cis?create=1')}
            >
              新建配置项
            </Button>
          </>
        }
      />
      {resource.error ? (
        <FailureNotice error={resource.error} retry={resource.reload} />
      ) : resource.loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        summary && (
          <>
            <Row gutter={[16, 16]} className="metrics">
              {[
                {
                  label: '配置项总数',
                  value: summary.total,
                  note: '全部模型与环境',
                  path: '/cis',
                },
                {
                  label: '使用中配置项',
                  value: summary.active,
                  note: '生命周期：使用中',
                  path: '/cis?status=active',
                },
                {
                  label: '资源关系',
                  value: summary.relations,
                  note: '依赖关系与运行关系',
                  path: '/relations',
                },
                {
                  label: '资源模型',
                  value: models?.length ?? 0,
                  note: '预置模板与自定义模型',
                  path: '/models',
                },
              ].map((item) => (
                <Col xs={12} xl={6} key={item.label}>
                  <Card>
                    <Statistic title={item.label} value={item.value} />
                    <div className="stat-footer">
                      <Typography.Text type="secondary">
                        {item.note}
                      </Typography.Text>
                      <Link to={item.path}>查看</Link>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
            <Card
              title="模型分布"
              extra={<Link to="/models">模型与字段</Link>}
              className="table-card overview-section"
            >
              <Table<CIModel>
                rowKey="id"
                dataSource={models}
                pagination={false}
                size="middle"
                scroll={{ x: 660 }}
                columns={[
                  { title: '模型名称', dataIndex: 'name', width: 140 },
                  {
                    title: '模型标识',
                    dataIndex: 'id',
                    width: 140,
                    render: (id: string) => (
                      <Typography.Text code>{id}</Typography.Text>
                    ),
                  },
                  {
                    title: '配置项数量',
                    key: 'count',
                    width: 120,
                    render: (_, model) => summary.modelCounts[model.id],
                  },
                  { title: '说明', dataIndex: 'description' },
                  {
                    title: '操作',
                    key: 'actions',
                    width: 130,
                    render: (_, model) => (
                      <Link to={`/cis?modelId=${model.id}`}>查看配置项</Link>
                    ),
                  },
                ]}
              />
            </Card>
            <Card
              title="最近变更"
              extra={<Link to="/changes">全部变更</Link>}
              className="table-card overview-section"
            >
              <Table
                rowKey="id"
                dataSource={changes?.items}
                pagination={false}
                size="middle"
                locale={{ emptyText: <EmptyState text="暂无变更" /> }}
                scroll={{ x: 620 }}
                columns={[
                  {
                    title: '变更内容',
                    dataIndex: 'summary',
                    render: (value: string, row) => (
                      <Link to={`/cis?ciId=${row.ciId}`}>{value}</Link>
                    ),
                  },
                  { title: '操作人', dataIndex: 'actor' },
                  { title: '时间', dataIndex: 'createdAt', render: time },
                ]}
              />
            </Card>
            <Space className="overview-note">
              <Typography.Text type="secondary">
                统计与操作记录均来自当前 Mock 会话；刷新页面后重置。
              </Typography.Text>
            </Space>
          </>
        )
      )}
    </>
  );
}
