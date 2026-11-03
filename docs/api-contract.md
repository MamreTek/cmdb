# CMDB API 契约草案 v0.1

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

| 字段                  | 类型和约束                                                           |
| --------------------- | -------------------------------------------------------------------- |
| externalKey           | 必填 string；`^[a-z][a-z0-9._-]{2,63}$`；唯一，不可变                |
| name                  | 必填 string，去首尾空白后 2–80 字符                                  |
| modelId               | 必填 host / service / database，不可变                               |
| owner                 | 必填 string，2–60 字符，原型只用虚构团队                             |
| environment           | production / staging / development；均为演示标签                     |
| status                | active / maintenance / retired                                       |
| attributes            | 必填对象，值均为 string、最多 120 字符；字段可选，空值归一化为未填写 |
| id                    | 仅响应，不透明、不可变 string                                        |
| revision              | 仅响应及更新请求；正整数，创建为 1，更新成功递增                     |
| createdAt / updatedAt | 仅响应，UTC ISO 字符串                                               |

| 模型     | 允许属性                                                          |
| -------- | ----------------------------------------------------------------- |
| host     | ipAddress（可选标准 IPv4，每段 0–255，无前导零）、operatingSystem |
| service  | endpoint、repository，仅记录文字，不访问端点                      |
| database | engine、endpoint，不保存密码或连接凭据                            |

三个生命周期枚举可互相转换。UI 退役前确认，保留既有关系和历史；退役端点不能**新增**关系。恢复使用中也使用带 revision 的更新。没有物理删除 CI 接口。关系允许环，本期不实现影响分析或无环约束。

### Relation / Change

RelationInput：`{sourceId,targetId,type}`；type 为 depends_on（依赖于）或 runs_on（运行于）。两个端点存在、不同、均未退役。相同源/目标/类型不可重复，反向关系不同；不限制模型组合。响应增加 id、createdAt。

Change：`{id,ciId,action,actor,summary,createdAt}`。action 为 created / updated / relation_added / relation_removed / imported。关系操作在两个端点各写记录；退役属于 updated。操作者明确为模拟角色，不是身份凭证。

## 方法与路径

| 方法 / 路径           | 请求                                                  | data 与结果                                                                                 |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GET /models           | 无                                                    | CIModel[]：id、name、description、fields[{key,label,description,format?}]；format 可为 ipv4 |
| GET /summary          | 无                                                    | `{total,active,relations,modelCounts:{host,service,database}}`                              |
| GET /cis              | 查询见下                                              | Page<CI>                                                                                    |
| GET /cis/:id          | CI ID                                                 | CI；不存在 404                                                                              |
| POST /cis             | CIInput                                               | 新 CI，revision=1；重复键 409                                                               |
| PATCH /cis/:id        | `{name,owner,environment,status,attributes,revision}` | 完整更新可编辑字段，旧 revision 409，无写入                                                 |
| GET /relations        | 可选 ciId                                             | Relation[]，源或目标匹配；未知 CI 404；本期无分页                                           |
| POST /relations       | RelationInput                                         | 新 Relation；重复 409，非法端点 422/404                                                     |
| DELETE /relations/:id | 无                                                    | `{id}`，保留 CI，增加双端点记录；不存在 404                                                 |
| GET /changes          | 可选 ciId、page、pageSize                             | Page<Change>，新记录在前；未知 CI 404                                                       |
| POST /imports/preview | `{csv:string}`                                        | ImportPreview，不写入                                                                       |
| POST /imports         | `{csv:string}`                                        | 重校验后原子写入；`{ids:string[],createdCount:number}`                                      |

### 列表行为

GET /cis 支持：

- q：最多 120 字符，名称/externalKey/owner 的包含查询，不区分大小写；首尾空白忽略。
- modelId、environment、status：枚举同 CI；筛选条件按 AND 组合。
- sortBy：name 或 updatedAt，默认 updatedAt；sortOrder：asc 或 desc，默认 desc；同值用 id 升序。Mock 名称使用 zh-CN localeCompare；后端须固定兼容排序规则。
- page：1–100000 整数，默认 1；pageSize：1–100 整数，默认 10。超出结果的页返回空 items，total 保留。
- 未声明查询参数拒绝 422；changes 仅接受 ciId/page/pageSize，relations 仅接受 ciId。

关系选择器复用 `/cis` 分页读取全部原型资源，不把首 100 项当作全部。真实大规模环境后续应改为远端搜索，不改变 CI 身份。

### CSV 预览与提交

表头顺序固定：`externalKey,name,modelId,owner,environment,status`。UTF-8，兼容 BOM、LF/CRLF、引号、双双引号转义、引号内逗号和换行。忽略空白记录；1–200 条，输入最多 100000 字符。导入属性为 `{}`，后续可在详情编辑。

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

line 是记录起始物理行。字段错误时 input 可为 null；重复标识保留解析结果并提供 errors；有效行 errors 为空。表头/CSV 格式/条数问题返回 422 VALIDATION_ERROR；逐行错误在预览 200 的 rows 内返回。提交含无效行返回 422 IMPORT_INVALID，不写入任何行。预览不锁定资源，提交重新检查唯一性和字段。

## 错误

| HTTP / code            | 说明                                               |
| ---------------------- | -------------------------------------------------- |
| 422 VALIDATION_ERROR   | 字段、枚举、查询、分页、格式、自关联或退役端点无效 |
| 409 DUPLICATE_KEY      | externalKey 已存在，fields.externalKey 有说明      |
| 409 REVISION_CONFLICT  | 编辑版本过期，重新读取后编辑，不覆盖新版本         |
| 409 DUPLICATE_RELATION | 相同有向关系已存在                                 |
| 422 IMPORT_INVALID     | 无效导入，整批不写入                               |
| 404 NOT_FOUND          | 资源或路径/方法不存在                              |
| 503 SIMULATED_FAILURE  | 演示单次失败，后续请求正常                         |

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
