# MamreTek CMDB

轻量的配置管理产品雏形：让团队看清资源、归属和依赖。独立可用，保留与未来作业平台和 ITSM 组合的稳定资源身份。

**产品原型 / 模拟数据。** 没有真实后端、持久化、认证、权限保护或真实审计保证。示例均为虚构资料，操作仅影响当前页面会话；刷新或“重置演示”恢复初始数据。不接入生产数据，不用于生产部署。

## 可以体验

- 配置总览：资源数量、模型分布、关系与最近变更。
- 资源清单：搜索、模型/环境/生命周期/负责人/单属性等值筛选、排序分页，以及保存/应用/删除当前会话视图。
- 模型与建档：CI Class单继承树、创建子类、标明继承字段来源、必填/唯一/默认值及子树影响预览；资源身份固定，更新检查版本，退役需确认。
- 字段类型：保留已有六种类型，补充varchar字符长度、integer范围和带时区timestamp；字段改型提供只读迁移预览。[类型与继承说明](docs/ci-classes.md)明确范围、格式与尚待确认的long语义。
- 资源关系：模型组合与 1:1/1:n/n:n 规则、有向依赖、最多三层的服务依赖树、移除确认，以及重复/自关联/退役端点校验。
- CSV 导入：列映射（含专有属性）、新增或显式更新、逐项差异、预览失效保护和整批提交，支持引号与 CRLF，最多 200 行；保留未映射属性和固定身份。
- 模拟变更记录，以及“模拟下次失败”后的输入保留与重试。

## 启动与验证

使用 `.nvmrc` 的 **Node 24.14.0** 和 **npm 11.9.0**。有 nvm 时先 `nvm use`，否则将兼容版本加入当前终端 PATH。不要使用 `sudo npm`。

```sh
npm ci
npm run dev
```

打开 Vite 输出的回环地址，默认 `http://127.0.0.1:5173/`。手机通过顶部导航按钮打开菜单。Hash 路由支持直达 `/#/cis`、`/#/relations`、`/#/models`、`/#/import`、`/#/changes`。

建议体验：资源模型中选中主机并新建子类 → 为父类追加varchar字段并预览整个子树 → 选择子类建档或映射导入 → 资源清单切换精确类/包含子类并保存视图 → 查看服务依赖 → 字段迁移预览仅查看候选类型或长度的影响。

```sh
npm run check          # 格式、lint、strict 类型、测试、构建
npx playwright install chromium
npm run test:e2e       # Chromium 完整流程与 390px 窄屏检查
npm run build
npm run preview       # 回环地址预览静态构建
```

本地浏览器测试需要允许绑定回环端口；Playwright 自动启动并关闭测试服务，不部署服务。CI 重复核心检查和浏览器检查。`dist/`、依赖和测试产物不提交。

本期结果与限制见 [验证记录](docs/verification.md)。

## API 与后端适配

- [API 契约](docs/api-contract.md)：路径、字段、校验、分页和错误。
- [类型](src/shared/api/contracts.ts)、[统一客户端](src/shared/api/client.ts)、[Mock 处理器](src/shared/api/mock.ts)。页面只通过客户端访问数据。
- [可重放示例](docs/api-examples.json)由契约测试验证，不代表真实接口已实现。
- `RuntimeProvider` 默认且仅选用 Mock，没有可误切生产的环境变量或任意后端地址设置。
- 后端实现 `/api/v1` 后，可显式构造 `new ApiClient(createHttpTransport())` 并注入 Runtime，使用同源 HTTP。先在独立测试环境完成契约、身份、权限、隔离、审计和持久化验收；当前 UI 没有这些能力。

## 工程结构与边界

```text
src/app/          主题、导航、路由、布局
src/features/     配置项、关系、模型、导入、变更
src/shared/api/   契约、客户端、传输、Mock、虚构数据
tests/            契约、界面行为和浏览器流程
docs/             API 与可移植开发约定
```

没有修改其他产品或复制私有 OpsAtlas 源码。REQ-001 保存在源仓库外，通过 [Issue #1](https://github.com/MamreTek/cmdb/issues/1) 和独立分支/PR 交付；`main` 初始化提交仅含项目 README。

模型删除/字段改型、发现/同步、字段级数据血缘、完整影响分析、后端和数据存储留待后续。原型流程和 Mock 验收不等同于真实业务或安全验收。产品概念与许可证边界见[参考与设计决定](docs/product-references.md)，实现为独立原创代码。

兼容范围参考 [Vite 官方要求](https://vite.dev/guide/)、[Ant Design React](https://ant.design/docs/react/introduce/) 和 [React Router](https://reactrouter.com/7.18.5/start/declarative/installation)。依赖和 lockfile 固定；lint 依赖 minimatch 通过 override 固定到修补版本，升级时复跑检查。
