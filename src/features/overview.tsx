import {
  ArrowRightOutlined,
  ApartmentOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  NodeIndexOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Row,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { Link, useNavigate } from 'react-router';
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
        eyebrow="CONFIGURATION MANAGEMENT"
        title="让每一项资源，都有清晰的来处"
        description="从资源、负责人到服务依赖，建立团队共享的配置视图。"
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
                [
                  '配置项总数',
                  summary.total,
                  <DatabaseOutlined key="all" />,
                  '所有模型与环境',
                ],
                [
                  '使用中',
                  summary.active,
                  <CheckCircleOutlined key="active" />,
                  '当前处于使用中的资源',
                ],
                [
                  '资源关系',
                  summary.relations,
                  <NodeIndexOutlined key="relations" />,
                  '有方向、可追溯的依赖',
                ],
                [
                  '预置模型',
                  models?.length ?? 0,
                  <ApartmentOutlined key="models" />,
                  '开箱即用，按需建档',
                ],
              ].map(([label, count, icon, note], index) => (
                <Col xs={12} xl={6} key={index}>
                  <Card>
                    <div className="metric-icon">{icon}</div>
                    <div className="metric-label">{label}</div>
                    <div className="metric-value">{count}</div>
                    <span className="muted">{note}</span>
                  </Card>
                </Col>
              ))}
            </Row>
            <Card className="getting-started">
              <div>
                <Tag color="blue">从第一条记录开始</Tag>
                <Typography.Title level={4}>
                  用一个简单流程，把资源串起来
                </Typography.Title>
                <Typography.Paragraph type="secondary">
                  选择模型 → 录入配置项 → 指定负责人 →
                  建立关系。无需先配置复杂平台。
                </Typography.Paragraph>
              </div>
              <Button
                type="primary"
                ghost
                icon={<ArrowRightOutlined />}
                onClick={() => navigate('/cis')}
              >
                浏览资源清单
              </Button>
            </Card>
            <div className="section-heading">
              <Typography.Title level={4}>按模型管理</Typography.Title>
              <Link to="/models">
                查看模型与字段 <ArrowRightOutlined />
              </Link>
            </div>
            <Row gutter={[16, 16]}>
              {models?.map((model) => (
                <Col xs={24} md={8} key={model.id}>
                  <Card
                    hoverable
                    onClick={() => navigate(`/cis?modelId=${model.id}`)}
                  >
                    <Space>
                      <div className="model-mark">
                        {model.id === 'host'
                          ? 'H'
                          : model.id === 'service'
                            ? 'S'
                            : 'D'}
                      </div>
                      <Typography.Title level={5} style={{ margin: 0 }}>
                        {model.name}
                      </Typography.Title>
                      <Tag>{summary.modelCounts[model.id]} 项</Tag>
                    </Space>
                    <p className="muted model-description">
                      {model.description}
                    </p>
                    <Button
                      type="link"
                      onClick={(event) => {
                        event.stopPropagation();
                        void navigate(`/cis?modelId=${model.id}`);
                      }}
                    >
                      查看配置项 <ArrowRightOutlined />
                    </Button>
                  </Card>
                </Col>
              ))}
            </Row>
            <div className="section-heading">
              <Typography.Title level={4}>最近变更</Typography.Title>
              <Link to="/changes">
                全部变更 <ArrowRightOutlined />
              </Link>
            </div>
            <Card className="table-card">
              <Table
                rowKey="id"
                dataSource={changes?.items}
                pagination={false}
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
          </>
        )
      )}
    </>
  );
}
