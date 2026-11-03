import { Alert, Card, Tree, Tag, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { Link } from 'react-router';
import {
  relationLabels,
  type CI,
  type Relation,
} from '../shared/api/contracts';
import {
  serviceDependencies,
  type DependencyNode,
} from '../shared/dependency-tree';
import { EmptyState } from '../shared/ui';
export function ServiceTree({
  cis,
  relations,
}: {
  cis: CI[];
  relations: Relation[];
}) {
  const result = serviceDependencies(cis, relations);
  const display = (nodes: DependencyNode[]): DataNode[] =>
    nodes.map((node) => ({
      key: node.key,
      title: (
        <span>
          {node.via ? (
            <Typography.Text type="secondary">
              {relationLabels[node.via]} →{' '}
            </Typography.Text>
          ) : null}
          <Link to={`/cis?ciId=${encodeURIComponent(node.ci.id)}`}>
            {node.ci.name}
          </Link>{' '}
          <Typography.Text type="secondary">
            {node.ci.externalKey}
          </Typography.Text>
          {node.ci.status === 'retired' ? <Tag>已退役</Tag> : null}
          {node.stop ? (
            <Tag color="warning">
              {node.stop === 'cycle' ? '循环，已截断' : '后续依赖已截断'}
            </Tag>
          ) : null}
        </span>
      ),
      children: display(node.children ?? []),
    }));
  return (
    <Card title="服务依赖树" className="relation-map">
      <Typography.Paragraph type="secondary">
        以业务服务为根，按出向关系展开最多三层、200
        个节点。同一资源可出现在不同依赖路径；循环会截断。此视图不代表完整影响分析。
      </Typography.Paragraph>
      {result.truncated ? (
        <Alert
          showIcon
          type="warning"
          title="已达到 200 节点展示上限，部分路径未展开。"
        />
      ) : null}
      {result.nodes.length ? (
        <div style={{ overflowX: 'auto' }}>
          <Tree
            key={`${relations.map((edge) => edge.id).join(',')}`}
            defaultExpandAll
            showLine
            treeData={display(result.nodes)}
            selectable={false}
          />
        </div>
      ) : (
        <EmptyState text="暂无业务服务，请先建立 service 模型资源" />
      )}
    </Card>
  );
}
