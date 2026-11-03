import { Card, Col, Row, Skeleton, Table, Tag, Typography } from 'antd';
import { useRuntime } from '../shared/api/runtime';
import { useResource } from '../shared/useResource';
import { FailureNotice, PageTitle } from '../shared/ui';

export function ModelsPage() {
  const { api } = useRuntime();
  const resource = useResource(() => api.models(), 'models');
  return (
    <>
      <PageTitle
        eyebrow="RESOURCE MODELS"
        title="模型，够用就好"
        description="三种预置模型共享标识、负责人、环境和生命周期。专有属性按模型收敛，先从常用资源开始。"
      />
      {resource.error ? (
        <FailureNotice error={resource.error} retry={resource.reload} />
      ) : resource.loading ? (
        <Skeleton active />
      ) : (
        <Row gutter={[16, 16]}>
          {resource.data?.map((model) => (
            <Col xs={24} xl={8} key={model.id}>
              <Card title={model.name} extra={<Tag>{model.id}</Tag>}>
                <Typography.Paragraph type="secondary">
                  {model.description}
                </Typography.Paragraph>
                <Table
                  rowKey="key"
                  size="small"
                  pagination={false}
                  dataSource={model.fields}
                  columns={[
                    {
                      title: '属性',
                      dataIndex: 'label',
                      render: (value: string, field) => (
                        <>
                          <strong>{value}</strong>
                          <div>
                            <Typography.Text code>{field.key}</Typography.Text>
                          </div>
                          <p className="muted">{field.description}</p>
                        </>
                      ),
                    },
                  ]}
                />
                <p className="muted">
                  专有属性均为可选；共用必填字段在建档表单中提供。模型设计器留待后续。
                </p>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </>
  );
}
