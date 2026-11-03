# CMDB 原型设计依据

本轮从“配置模型 → 预览数据变化 → 按业务查看资源”组织体验，独立实现，不复制下列项目的源代码、品牌、截图或其他素材。

| 公开参考                                                                                                                    | 借鉴的产品概念             | 本轮选择与边界                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------- |
| [维易模型配置](https://veops.cn/docs/docs/cmdb/basic/cmdb_citype/)                                                          | 可配置字段、类型和数据约束 | 六种类型、追加字段、存量影响预览；不做复杂继承、公式或字段改型 |
| [维易模型关系](https://veops.cn/docs/docs/cmdb/basic/cmdb_relation/)                                                        | 区分模型关系与实例关系     | 模型组合及基数约束；原有实例关系继续保留                       |
| [维易资源查询](https://veops.cn/docs/docs/cmdb/cmdb_search/)                                                                | 条件查询、保存视图         | AND 组合基础条件及一个属性等值条件；不实现完整表达式语言       |
| [维易发现](https://veops.cn/docs/docs/cmdb/cmdb_discovery/)                                                                 | 入库前检查发现结果         | 仅 CSV 差异预览；未接入 OneAgent、真实采集和同步               |
| [蓝鲸业务拓扑](https://github.com/TencentBlueKing/bk-cmdb/blob/master/docs/apidoc/apigw/open/zh/search_biz_inst_topo.md)    | 从业务上下文查看资源       | 简单服务依赖树；不强制使用业务/集群/模块层级，非完整影响分析   |
| [蓝鲸模型关联](https://github.com/TencentBlueKing/bk-cmdb/blob/master/docs/apidoc/apigw/open/zh/find_object_association.md) | 模型关系及 1:1/1:n/n:n     | 约束定义独立于实例边，拒绝破坏现存边的基数收紧                 |

维易开源仓库使用 [AGPL-3.0](https://github.com/veops/cmdb/blob/master/LICENSE)，其官网文档也包含企业版能力，OneAgent 需要单独申请，不能将所有文档能力视为仓库自带。AGPL 允许商业使用；修改后通过网络提供交互服务涉及对应源码提供义务。蓝鲸主体使用 [MIT](https://github.com/TencentBlueKing/bk-cmdb/blob/master/LICENSE.txt)，复用须保留声明，第三方组件仍有各自条款。未来若复用代码须逐版本、逐组件评估；当前没有引入这两个项目的代码依赖。

UI 按用户指定的 Ant Design Pro 风格与[官方表格文档](https://pro-components.antdigital.dev/components/table/)、[表单文档](https://ant.design/components/form/)组织。官方预览网页读取无正文，之前本机 Chrome 也显示空白，未声称完成逐页或像素核验。沿用现有浅色导航、页面标题、查询区、表格、Modal/Form；服务树是业务需要，详见 [UI 对齐记录](ui-guidelines.md)。

所有配置、视图、来源与变更仅存在于当前 Mock 会话。没有真实后端、发现同步、生产数据、认证权限、持久化或可靠审计；原型测试不等于这些能力已验收。
