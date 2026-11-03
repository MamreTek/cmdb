import type { CI, CIModel, Change, Relation } from './contracts';

export const models: CIModel[] = [
  {
    id: 'service',
    name: '业务服务',
    description: '把服务归属与依赖联系起来，先明确业务上下文。',
    fields: [
      {
        key: 'endpoint',
        label: '服务入口',
        description: '可选，最多 120 字；仅记录说明，不发起访问',
      },
      {
        key: 'repository',
        label: '代码库标识',
        description: '可选，最多 120 字；不保存凭据',
      },
    ],
  },
  {
    id: 'host',
    name: '主机',
    description: '管理计算资源及责任人，不采集凭据、不执行远程操作。',
    fields: [
      {
        key: 'ipAddress',
        label: 'IPv4 地址',
        description: '可选，标准 IPv4；示例使用文档地址',
        format: 'ipv4',
      },
      {
        key: 'operatingSystem',
        label: '操作系统',
        description: '可选，最多 120 字',
      },
    ],
  },
  {
    id: 'database',
    name: '数据库',
    description: '描述数据服务的归属与连接关系，不保存连接密码。',
    fields: [
      {
        key: 'engine',
        label: '数据库引擎',
        description: '可选，如 MySQL 8.0，最多 120 字',
      },
      {
        key: 'endpoint',
        label: '端点标识',
        description: '可选，最多 120 字；不保存连接凭据',
      },
    ],
  },
];
const createdAt = '2026-11-01T08:00:00.000Z';
export function seedData(): {
  cis: CI[];
  relations: Relation[];
  changes: Change[];
} {
  const input: Omit<CI, 'revision' | 'createdAt' | 'updatedAt'>[] = [
    {
      id: 'ci-demo-service',
      externalKey: 'demo.checkout',
      name: '示例订单服务',
      modelId: 'service',
      owner: '示例应用团队',
      environment: 'production',
      status: 'active',
      attributes: {
        endpoint: 'https://checkout.example.invalid',
        repository: 'demo/checkout',
      },
    },
    {
      id: 'ci-demo-host-01',
      externalKey: 'demo.web-01',
      name: '示例应用节点 01',
      modelId: 'host',
      owner: '示例基础设施团队',
      environment: 'production',
      status: 'active',
      attributes: { ipAddress: '192.0.2.10', operatingSystem: 'Ubuntu 24.04' },
    },
    {
      id: 'ci-demo-host-02',
      externalKey: 'demo.web-02',
      name: '示例应用节点 02',
      modelId: 'host',
      owner: '示例基础设施团队',
      environment: 'production',
      status: 'maintenance',
      attributes: { ipAddress: '192.0.2.11', operatingSystem: 'Ubuntu 24.04' },
    },
    {
      id: 'ci-demo-db',
      externalKey: 'demo.orders-db',
      name: '示例订单数据库',
      modelId: 'database',
      owner: '示例数据团队',
      environment: 'production',
      status: 'active',
      attributes: {
        engine: 'MySQL 8.0',
        endpoint: 'orders-db.example.invalid:3306',
      },
    },
    {
      id: 'ci-demo-staging',
      externalKey: 'demo.checkout-staging',
      name: '订单服务预发布',
      modelId: 'service',
      owner: '示例应用团队',
      environment: 'staging',
      status: 'active',
      attributes: {},
    },
    {
      id: 'ci-demo-old',
      externalKey: 'demo.legacy-01',
      name: '历史开发节点',
      modelId: 'host',
      owner: '示例基础设施团队',
      environment: 'development',
      status: 'retired',
      attributes: { ipAddress: '192.0.2.30' },
    },
  ];
  return {
    cis: input.map((ci) => ({
      ...ci,
      revision: 1,
      createdAt,
      updatedAt: createdAt,
    })),
    relations: [
      {
        id: 'rel-demo-1',
        sourceId: 'ci-demo-service',
        targetId: 'ci-demo-host-01',
        type: 'runs_on',
        createdAt,
      },
      {
        id: 'rel-demo-2',
        sourceId: 'ci-demo-service',
        targetId: 'ci-demo-db',
        type: 'depends_on',
        createdAt,
      },
    ],
    changes: input.map((ci, index) => ({
      id: `change-demo-${index}`,
      ciId: ci.id,
      action: 'created',
      actor: '演示初始化（模拟）',
      summary: `建立 ${ci.name}`,
      createdAt,
    })),
  };
}

export const sampleCsv =
  'externalKey,name,modelId,owner,environment,status\ndemo.api-new,示例新服务,service,示例应用团队,staging,active\ndemo.host-new,示例新节点,host,示例基础设施团队,staging,active';
