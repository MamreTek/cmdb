import {
  ApartmentOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  HistoryOutlined,
  ImportOutlined,
  MenuOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  NodeIndexOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  ConfigProvider,
  Drawer,
  Layout,
  Menu,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { Suspense, lazy, useState } from 'react';
import {
  HashRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router';
import {
  RuntimeProvider,
  useRuntime,
  type Runtime,
} from '../shared/api/runtime';
import './styles.css';

const Overview = lazy(() =>
  import('../features/overview').then((module) => ({
    default: module.Overview,
  })),
);
const CIsPage = lazy(() =>
  import('../features/cis').then((module) => ({ default: module.CIsPage })),
);
const RelationsPage = lazy(() =>
  import('../features/relations').then((module) => ({
    default: module.RelationsPage,
  })),
);
const ModelsPage = lazy(() =>
  import('../features/models').then((module) => ({
    default: module.ModelsPage,
  })),
);
const ImportPage = lazy(() =>
  import('../features/import').then((module) => ({
    default: module.ImportPage,
  })),
);
const ChangesPage = lazy(() =>
  import('../features/changes').then((module) => ({
    default: module.ChangesPage,
  })),
);

const navigation = [
  { key: '/', label: <Link to="/">配置总览</Link>, icon: <AppstoreOutlined /> },
  {
    key: '/cis',
    label: <Link to="/cis">资源清单</Link>,
    icon: <DatabaseOutlined />,
  },
  {
    key: '/relations',
    label: <Link to="/relations">资源关系</Link>,
    icon: <NodeIndexOutlined />,
  },
  {
    key: '/models',
    label: <Link to="/models">资源模型</Link>,
    icon: <ApartmentOutlined />,
  },
  {
    key: '/import',
    label: <Link to="/import">快速导入</Link>,
    icon: <ImportOutlined />,
  },
  {
    key: '/changes',
    label: <Link to="/changes">变更记录</Link>,
    icon: <HistoryOutlined />,
  },
];
function Brand() {
  return (
    <Link to="/" className="brand">
      <div className="brand-symbol">
        <ApartmentOutlined />
      </div>
      <div>
        <strong>CMDB</strong>
        <span>MamreTek</span>
      </div>
    </Link>
  );
}
function Shell() {
  const { demo } = useRuntime();
  const { message, modal } = App.useApp();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false),
    [generation, setGeneration] = useState(0),
    [collapsed, setCollapsed] = useState(false);
  function reset() {
    modal.confirm({
      title: '重置所有演示改动？',
      content: '当前会话的新建、编辑、导入和关系操作将清空，恢复最初示例。',
      okText: '确认重置',
      cancelText: '取消',
      onOk: () => {
        demo.reset();
        setGeneration((value) => value + 1);
        void message.success('演示数据已重置');
      },
    });
  }
  const menu = (
    <Menu
      theme="light"
      mode="inline"
      selectedKeys={[location.pathname]}
      items={navigation}
      onClick={() => setMobileOpen(false)}
    />
  );
  return (
    <Layout
      hasSider={false}
      className={`app-layout${collapsed ? ' sidebar-collapsed' : ''}`}
    >
      <Layout.Header className="topbar">
        <Space>
          <Button
            className="mobile-menu-button"
            aria-label="打开导航"
            icon={<MenuOutlined />}
            onClick={() => setMobileOpen(true)}
          />
          <Brand />
          <Typography.Text className="topbar-module">配置管理</Typography.Text>
        </Space>
        <Space wrap className="demo-controls">
          <Tag>演示环境</Tag>
          <Button
            size="small"
            onClick={() => {
              demo.failNext();
              void message.info('下一次 API 请求将模拟失败，随后可重试');
            }}
          >
            模拟下次失败
          </Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={reset}>
            重置演示
          </Button>
        </Space>
      </Layout.Header>
      <Layout.Sider
        width={208}
        collapsed={collapsed}
        collapsedWidth={56}
        trigger={null}
        className="desktop-sidebar"
      >
        {!collapsed && <div className="nav-label">配置管理</div>}
        {menu}
        <div className="sidebar-bottom">
          {!collapsed && (
            <Typography.Text type="secondary">
              MamreTek · 产品原型
            </Typography.Text>
          )}
          <Button
            type="text"
            aria-label={collapsed ? '展开导航' : '收起导航'}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((value) => !value)}
          />
        </div>
      </Layout.Sider>
      <Drawer
        className="mobile-nav"
        title="CMDB · 配置管理"
        open={mobileOpen}
        placement="left"
        onClose={() => setMobileOpen(false)}
        size={240}
      >
        {menu}
      </Drawer>
      <Layout className="main-layout">
        <div className="prototype-notice">
          <Alert
            type="warning"
            showIcon
            title={
              <span>
                <strong>产品原型 / 模拟数据</strong>
                <span className="notice-detail">
                  未实现权限保护，不接入生产数据；刷新页面将重置所有改动。
                </span>
              </span>
            }
          />
        </div>
        <Layout.Content className="main-content">
          <div key={generation}>
            <Suspense fallback={<Skeleton active paragraph={{ rows: 6 }} />}>
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/cis" element={<CIsPage />} />
                <Route path="/relations" element={<RelationsPage />} />
                <Route path="/models" element={<ModelsPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/changes" element={<ChangesPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
        </Layout.Content>
        <Layout.Footer className="footer">
          MamreTek CMDB · 原型 0.1 <span>虚构数据 · 无后端服务 · UTC 时间</span>
        </Layout.Footer>
      </Layout>
    </Layout>
  );
}
export function CMDBApp({ runtime }: { runtime?: Runtime }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          colorInfo: '#1677ff',
          colorBgLayout: '#f5f5f5',
          colorText: 'rgba(0, 0, 0, 0.88)',
          borderRadius: 6,
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: 14,
        },
        components: {
          Layout: { siderBg: '#ffffff', headerBg: '#ffffff' },
          Menu: {
            itemBorderRadius: 4,
            itemSelectedBg: '#e6f4ff',
            itemSelectedColor: '#1677ff',
          },
          Button: { primaryShadow: 'none' },
          Table: {
            headerBg: '#fafafa',
            cellPaddingBlock: 12,
            cellPaddingInline: 16,
          },
          Card: { headerFontSize: 16 },
        },
      }}
    >
      <App>
        <RuntimeProvider value={runtime}>
          <HashRouter>
            <Shell />
          </HashRouter>
        </RuntimeProvider>
      </App>
    </ConfigProvider>
  );
}
