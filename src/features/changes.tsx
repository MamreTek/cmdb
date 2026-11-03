import { Card, Select, Skeleton, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router';
import { useRuntime } from '../shared/api/runtime';
import { useResource } from '../shared/useResource';
import { EmptyState, FailureNotice, PageTitle, time } from '../shared/ui';

const actionLabels: Record<string, string> = {
  created: '建档',
  updated: '更新',
  relation_added: '建立关系',
  relation_removed: '移除关系',
  imported: '导入',
  schema_backfilled: '模型默认值回填',
};
export function ChangesPage() {
  const { api } = useRuntime();
  const [ciId, setCiId] = useState<string>();
  const [page, setPage] = useState(1);
  const resource = useResource(
    () => api.changes({ ciId, page, pageSize: 10 }),
    `${ciId ?? ''}:${page}`,
  );
  const cis = useResource(() => api.allCIs(), 'change-cis');
  return (
    <>
      <PageTitle
        title="变更记录"
        description="查看配置项和关系的模拟变更记录，不具备真实审计保证。"
      />
      <Card className="table-card">
        <div className="filter-bar">
          <Space wrap>
            <Typography.Text>配置项</Typography.Text>
            <Select
              aria-label="筛选变更配置项"
              style={{ minWidth: 260 }}
              placeholder="所有配置项"
              showSearch
              optionFilterProp="label"
              allowClear
              value={ciId}
              options={cis.data?.map((ci) => ({
                value: ci.id,
                label: ci.name,
              }))}
              onChange={(value: string | undefined) => {
                setCiId(value);
                setPage(1);
              }}
            />
          </Space>
        </div>
        {cis.error ? (
          <FailureNotice error={cis.error} retry={cis.reload} />
        ) : null}
        {resource.error ? (
          <FailureNotice error={resource.error} retry={resource.reload} />
        ) : !resource.data && resource.loading ? (
          <Skeleton active />
        ) : (
          <Table
            rowKey="id"
            dataSource={resource.data?.items}
            loading={resource.loading}
            scroll={{ x: 750 }}
            locale={{ emptyText: <EmptyState text="暂无变更记录" /> }}
            pagination={{
              current: page,
              pageSize: 10,
              total: resource.data?.total,
              showSizeChanger: false,
              onChange: setPage,
            }}
            columns={[
              { title: '时间', dataIndex: 'createdAt', render: time },
              {
                title: '动作',
                dataIndex: 'action',
                render: (action: string) => <Tag>{actionLabels[action]}</Tag>,
              },
              {
                title: '内容',
                dataIndex: 'summary',
                render: (value: string, change) => (
                  <Link to={`/cis?ciId=${change.ciId}`}>{value}</Link>
                ),
              },
              { title: '操作人', dataIndex: 'actor' },
            ]}
          />
        )}
      </Card>
    </>
  );
}
