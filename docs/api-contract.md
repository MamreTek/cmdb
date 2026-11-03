# CMDB API 契约草案 v0.3

**产品原型 / 模拟数据**。这是后端适配目标，当前只由内存 Mock 实现，没有真实身份、权限、隔离、持久化或不可篡改审计。新增菜单/按钮/API 权限本阶段暂缓；正式服务需单独实施并验收。

## 通用结构

- `/api/v1`，JSON UTF-8。不透明服务端 ID；Mock 新记录用 UUID 前缀。externalKey 是唯一、不可变外部引用键；其他产品应保存 CI ID，当前无真实跨产品联动。
- UTC ISO 时间，如 `2026-11-01T08:00:00.000Z`，页面以 UTC 展示。
- 成功 `{data:T,requestId:string}`。分页 data 为 `{items:T[],total:number,page:number,pageSize:number}`。
- 失败 `{error:{code:string,message:string,fields?:Record<string,string>},requestId:string}`。属性错误使用点路径，例如 `attributes.ipAddress`。UI 展示 message 和 requestId。
- GET/PATCH/DELETE 成功 200，创建和导入成功 201。删除关系返回 `{data:{id},requestId}`，不是 204。
- 请求体拒绝未知字段；字符串去除首尾空白。更新要求完整可编辑字段，attributes 整体替换。提交导入完整校验后一次写入，未来后端应通过事务保证相同语义。
- 客户端超时 8 秒；本地错误 NETWORK_ERROR/TIMEOUT 使用 status 0 和 requestId unavailable。Transport 必须响应 AbortSignal。HTTP 适配器仅使用同源路径；原型没有切换后端的环境变量或地址输入。
- 无幂等请求键。UI 提交时防重复点击；真实网络结果不确定时先查询 externalKey，不可盲重试创建。

## 实体与约束

### CIInput / CI

| 字段                  | 类型和约束                                                            |
| --------------------- | --------------------------------------------------------------------- |
| externalKey           | 必填 string；`^[a-z][a-z0-9._-]{2,63}$`；唯一，不可变                 |
| name                  | 必填 string，去首尾空白后 2–80 字符                                   |
| modelId               | 必填，已存在模型的标识，不可变；种子为 host / service / database      |
| owner                 | 必填 string，2–60 字符，原型只用虚构团队                              |
| environment           | production / staging / development；均为演示标签                      |
| status                | active / maintenance / retired                                        |
| attributes            | 必填对象，按模型字段校验 string / number / boolean；详见下方类型约束  |
| id                    | 仅响应，不透明、不可变 string                                         |
| revision              | 仅响应及更新请求；正整数，创建为 1，更新成功递增                      |
| createdAt / updatedAt | 仅响应，UTC ISO 字符串                                                |
| source                | 可选响应，最近一次 CSV 写入的 `{kind:"csv",label,at}`；不是字段级血缘 |

| 模型     | 允许属性                                                          |
| -------- | ----------------------------------------------------------------- |
| host     | ipAddress（可选标准 IPv4，每段 0–255，无前导零）、operatingSystem |
| service  | endpoint、repository，仅记录文字，不访问端点                      |
| database | engine、endpoint，不保存密码或连接凭据                            |

三个生命周期枚举可互相转换。UI 退役前确认，保留既有关系和历史；退役端点不能**新增**关系。恢复使用中也使用带 revision 的更新。没有物理删除 CI 接口。关系允许环，本期不实现影响分析或无环约束。

### Relation / Change

RelationInput：`{sourceId,targetId,type}`；type 为 depends_on（依赖于）或 runs_on（运行于）。两个端点存在、不同、均未退役。相同源/目标/类型不可重复，反向关系不同；模型组合必须存在对应关系规则并满足基数。响应增加 id、createdAt。

Change：`{id,ciId,action,actor,summary,createdAt}`。action 为 created / updated / relation_added / relation_removed / imported / schema_backfilled。关系操作在两个端点各写记录；退役属于 updated。操作者明确为模拟角色，不是身份凭证。

## 方法与路径

| 方法 / 路径           | 请求                                                  | data 与结果                                                                     |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| GET /models           | 无                                                    | CIModel[]：id、name、description、revision、parentId?、有效fields，详见模型配置 |
| GET /summary          | 无                                                    | `{total,active,relations,modelCounts:Record<modelId,number>}`                   |
| GET /cis              | 查询见下                                              | Page<CI>                                                                        |
| GET /cis/:id          | CI ID                                                 | CI；不存在 404                                                                  |
| POST /cis             | CIInput                                               | 新 CI，revision=1；重复键 409                                                   |
| PATCH /cis/:id        | `{name,owner,environment,status,attributes,revision}` | 完整更新可编辑字段，旧 revision 409，无写入                                     |
| GET /relations        | 可选 ciId                                             | Relation[]，源或目标匹配；未知 CI 404；本期无分页                               |
| POST /relations       | RelationInput                                         | 新 Relation；重复 409，非法端点 422/404                                         |
| DELETE /relations/:id | 无                                                    | `{id}`，保留 CI，增加双端点记录；不存在 404                                     |
| GET /changes          | 可选 ciId、page、pageSize                             | Page<Change>，新记录在前；未知 CI 404                                           |
| POST /imports/preview | ImportRequest                                         | ImportPreview，不修改资源，生成会话内预览令牌                                   |
| POST /imports         | ImportRequest                                         | 原子提交；`{ids,createdCount,updatedCount,unchangedCount}`                      |

### 列表行为

GET /cis 支持：

- q：最多 120 字符，名称/externalKey/owner 的包含查询，不区分大小写；首尾空白忽略。
- modelId、environment、status：枚举同 CI；筛选条件按 AND 组合。
- owner：完整团队名精确匹配，1–60 字符。attributeKey + attributeValue：必须同时传有效 modelId、模型字段和等值字符串，最长 120 字符；空字符串匹配未填写字段。数字/布尔使用规范字符串（例如 `0`、`false`），日期使用 YYYY-MM-DD，引用使用 CI ID。一次一个属性条件，与其他条件 AND 组合。
- sortBy：name 或 updatedAt，默认 updatedAt；sortOrder：asc 或 desc，默认 desc；同值用 id 升序。Mock 名称使用 zh-CN localeCompare；后端须固定兼容排序规则。
- page：1–100000 整数，默认 1；pageSize：1–100 整数，默认 10。超出结果的页返回空 items，total 保留。
- 未声明查询参数拒绝 422；changes 仅接受 ciId/page/pageSize，relations 仅接受 ciId。

关系选择器复用 `/cis` 分页读取全部原型资源，不把首 100 项当作全部。真实大规模环境后续应改为远端搜索，不改变 CI 身份。

### CSV 预览与提交

未传 mapping 时沿用固定表头：`externalKey,name,modelId,owner,environment,status`。UTF-8，兼容 BOM、LF/CRLF、引号、双双引号转义、引号内逗号和换行。忽略空白记录；1–200 条，输入最多 100000 字符。创建时未映射属性使用模型默认值；更新时未映射属性保留。

请求：

```json
{
  "csv": "externalKey,name,modelId,owner,environment,status\ndemo.new-host,示例新主机,host,示例团队,staging,active"
}
```

预览 data：

```json
{
  "rows": [
    {
      "line": 2,
      "input": {
        "externalKey": "demo.new-host",
        "name": "示例新主机",
        "modelId": "host",
        "owner": "示例团队",
        "environment": "staging",
        "status": "active",
        "attributes": {}
      },
      "errors": []
    }
  ],
  "validCount": 1,
  "invalidCount": 0
}
```

以上展示旧创建请求的基本结构；v0.2 预览响应另外必含 previewId、createdCount、updatedCount、unchangedCount，每行增加 action 和 changes，详见下节。line 是记录起始物理行。字段错误时 input 可为 null；逐行错误在预览 200 的 rows 内返回。提交含无效行返回 422 IMPORT_INVALID，不写入任何行。提交重新检查唯一性和字段；预览不锁定资源。

## 模型配置

- `POST /models`：`{id,name,description,parentId?}`，201返回模型，revision=1、fields含继承的有效字段。parentId必须存在，单继承最多6层，建档后不提供修改或删除。id为2–40位`^[a-z][a-z0-9_]+$`，拒绝constructor/prototype；name 2–40字符，description 0–160字符。id全局唯一（409 DUPLICATE_MODEL），最多20个类。`GET /class-tree`返回`[{id,name,children:CIClassNode[]}]`；“全部CI Class”仅为前端导航容器。
- `POST /models/:id/fields/preview`和`POST /models/:id/fields`：`{revision,field}`。模型必须存在，revision与当前版本相等，否则409 REVISION_CONFLICT。只支持追加；祖先/本类/任何子类的同名字段均拒绝，任意受影响类的有效字段不得超过25个。字段标识/类型不提供应用修改或删除API。
- field：`{key,label,description?,type,required?,unique?,defaultValue?,options?,referenceModelId?,maxLength?,minValue?,maxValue?}`。key为1–40位、小写字母开头的字母/数字/下划线，拒绝Object原型保留名与prototype；label 1–40字符，description 0–160。required/unique为布尔值，默认false。响应有效字段带只读originModelId，表示声明来源；不接受客户端写入此元数据。
- type：text（最多 120 字符）、number（JSON 有限数字）、boolean（JSON 布尔值）、date（真实日历日期 YYYY-MM-DD）、enum（1–20 个不重复、每项 1–40 字符的 options）、reference（指定现存 referenceModelId 下未退役 CI 的 ID）。已有引用的目标后来退役时允许原值保留，不允许新增指向退役资源的引用；导入也检查整批候选状态。其他类型不能携带 options/referenceModelId。种子字段未声明 type 时按 text 兼容，IPv4 保留额外格式校验。字段标识额外拒绝 Object 原型保留名。
- 缺失、null或空字符串属性使用defaultValue；无默认值时可选属性省略、必填属性报错。false/0有效。默认值须通过类型校验。继承所有字段约束；unique在字段声明类及其完整子树比较规范化值，含退役CI，忽略未填写。reference允许指定类及其子类的资源；关系规则仍按具体类匹配，不自动继承。
- 预览200返回`{total,backfillCount,errors:[{externalKey,message}],affectedClasses:[{id,name,revision,ciCount}]}`，覆盖本类与全部子类，不写数据。提交再次检查版本和存量，不兼容则422且不写入。成功201返回有效模型，受影响类的revision均+1；实际回填的CI revision+1、updatedAt更新并记录schema_backfilled；未改变属性值的CI不改版本。

### 数据库风格类型与迁移预览（v0.3）

- varchar：字符串，maxLength默认255，可配置整数1–4096；首尾空白按既有约定移除，再按Unicode码点计数。超长拒绝，不截断。其他类型不能携带maxLength。
- integer：JSON数字、有符号32位整数，默认-2147483648至2147483647；可设minValue/maxValue但不能越过内建范围或前后颠倒。小数或JSON字符串拒绝；CSV按数字解析后复用校验。其他类型不能携带这两个范围字段。
- timestamp：带Z或明确偏移的RFC3339子集，秒必填，最多3位毫秒，真实日历，拒绝无时区、-00:00和闰秒，归一化UTC。兼容范围1970-01-01T00:00:01.000Z至2038-01-19T03:14:07.499Z；默认值固定，不提供CURRENT_TIMESTAMP。唯一性和等值查询按规范化UTC比较。
- long语义等待用户明确：不接受歧义`long`别名，也不默认把它映射成数字或长文本。完整类型说明、数据库原始范围和原型边界见[CI Class与字段类型](ci-classes.md)。
- `GET /cis`新增includeDescendants=true/false，默认false；true必须带modelId，筛选完整子树。保存视图也支持同名字符串条件。属性查询支持所选类继承字段；varchar按字段长度校验查询值，timestamp条件会规范化。
- `POST /models/:id/fields/:key/migration-preview`：`{revision,field}`，key固定且仅可评估本类声明字段。200返回上述SchemaPreview并增加changes数组`{externalKey,modelId,before,after}`。逐行评估候选类型/长度/范围及继承唯一性；integer仅额外尝试解析严格十进制整数字符串，不截断或猜测时区。列出差异及阻塞，不能应用改型。此接口不写模型/CI/关系/变更记录、不使导入令牌失效；不可逆调整需后续明确确认。

## 映射导入与更新

ImportRequest：`{csv,mapping?,mode?,previewId?}`。mode 默认 create；upsert 必须显式指定。mapping 方向为目标字段 → CSV 表头，例如：

```json
{
  "csv": "标识,名称,模型,团队,环境,状态,中心\ndemo.web-01,示例节点,host,示例团队,production,active,demo-center",
  "mode": "upsert",
  "mapping": {
    "externalKey": "标识",
    "name": "名称",
    "modelId": "模型",
    "owner": "团队",
    "environment": "环境",
    "status": "状态",
    "attributes.costCenter": "中心"
  }
}
```

基础六字段必须映射；专有属性用 `attributes.<key>`，对每行模型检查是否存在。源列必须存在且不可重复使用，未映射 CSV 列忽略。表头不可空或重复。数字接受十进制和科学记数法，布尔仅 true/false；引用填现存 CI ID，不支持同批新 CI 的引用。映射的空白属性清除或使用默认值；未映射的属性保留。按 externalKey 匹配，CI ID/模型不变；create 遇已存在标识报行级错误。

预览返回 `{rows,validCount,invalidCount,previewId,createdCount,updatedCount,unchangedCount}`。每行 `{line,input,errors,action,changes}`；action 为 create/update/unchanged/conflict，changes 为 `{field,before,after}[]`（未填写用 null）。包含基础属性和专有属性差异，无变化时 changes=[]。

UI 总是携带 previewId 提交。upsert API 强制要求令牌；旧 create 调用可以不传令牌，但仍重新完整校验。令牌仅属于当前 Mock 会话；任何成功写操作或演示重置后失效，CSV/映射/模式与原预览不同也返回 409 PREVIEW_STALE。最多保留最近 20 次预览，不代表资源锁或可跨后端进程使用的生产实现。

有效批次按行顺序原子提交，无效批次不写资源或变更。唯一值交换等需要临时冲突的批次保守拒绝，不提供自动协调。unchanged 行保留全部元数据和版本；更新行 revision+1，创建行为维持不变，二者记录 CSV 来源与 imported 变更。source 只表示最近 CSV 写入，不是字段级血缘或真实审计。

## 模型关系规则与保存视图

- `GET /relation-rules` 返回 RelationRule[]：`{id,sourceModelId,targetModelId,type,cardinality,revision}`。种子对三类模型的 depends_on 开放 n:n，对 service/database → host 的 runs_on 开放 n:n，保留原型合法关系。
- `POST /relation-rules`：`{sourceModelId,targetModelId,type,cardinality}`，201；模型存在，type 同实例关系，cardinality 为 1:1/1:n/n:n。相同模型对与类型重复为 409 DUPLICATE_RULE，最多 100 条规则。
- `PATCH /relation-rules/:id`：`{revision,cardinality}`，200；旧版本 409。1:1 限制同一规则下每个源和目标各最多一条；1:n 允许源连多个目标、每目标最多一个源；n:n 不限。包括保留的退役端点边。现存关系不满足新基数则 422，规则和关系均保持原样。
- `GET /views` 返回 SavedView[]：`{id,name,query}`。`POST /views` 接收 `{name,query}`，201；name 1–40 字符且当前会话唯一（409 DUPLICATE_VIEW），最多 20 项。query 仅接受 q/modelId/environment/status/owner/attributeKey/attributeValue/sortBy/sortOrder，值均为字符串，复用资源查询校验；不保存分页或详情入口。`DELETE /views/:id` 返回 200 `{id}`，不存在 404，不修改资源。
- 服务依赖树由现有资源与关系接口组装：service 为根，沿出边最多三层、200 节点；重复路径分别展示，循环或深度超限明确截断。不是跨图谱影响分析 API，真实规模场景后续单独设计查询接口。

## 错误

| HTTP / code                                           | 说明                                               |
| ----------------------------------------------------- | -------------------------------------------------- |
| 422 VALIDATION_ERROR                                  | 字段、枚举、查询、分页、格式、自关联或退役端点无效 |
| 409 DUPLICATE_KEY                                     | externalKey 已存在，fields.externalKey 有说明      |
| 409 REVISION_CONFLICT                                 | 编辑版本过期，重新读取后编辑，不覆盖新版本         |
| 409 DUPLICATE_RELATION                                | 相同有向关系已存在                                 |
| 409 DUPLICATE_MODEL / DUPLICATE_RULE / DUPLICATE_VIEW | 模型标识、模型关系组合或视图名称重复               |
| 409 PREVIEW_STALE                                     | 导入预览令牌缺失/失效或载荷不同，重新预览后确认    |
| 422 IMPORT_INVALID                                    | 无效导入，整批不写入                               |
| 404 NOT_FOUND                                         | 资源或路径/方法不存在                              |
| 503 SIMULATED_FAILURE                                 | 演示单次失败，后续请求正常                         |

```json
{
  "error": {
    "code": "DUPLICATE_KEY",
    "message": "资源标识已经存在",
    "fields": { "externalKey": "请使用不同的资源标识" }
  },
  "requestId": "mock-1"
}
```

精确可重放示例见 [api-examples.json](api-examples.json)，每项使用独立初始 Mock；类型见 [contracts.ts](../src/shared/api/contracts.ts)。

## 后端交接

ApiClient 接收 Transport，Mock 和 HTTP 都返回相同 status/envelope。Runtime 固定选择 Mock，HTTP 适配器已提供但 UI 不启用。真实接入应在隔离环境注入 HTTP Runtime、复用示例和契约测试，然后补齐真实身份、权限、隔离、事务、审计、备份恢复。当前未验证真实发现、同步、性能、生产业务或安全能力。
