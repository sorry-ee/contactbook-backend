# Soul ContactBook · 云端版本

HTML/CSS/JavaScript 前端，Cloudflare Worker 后端，D1 数据库，SheetJS 0.20.3 实现真实 `.xlsx` 导入导出。使用 Sites 插件部署。旧版 Flask 实现不再作为当前云部署方案。

## 本地复现（Node.js 22.13+，建议24+）

```sh
node scripts/build.mjs
node --test tests/contactbook.test.mjs
node scripts/preview.mjs
```

访问 http://127.0.0.1:8001 。本地使用 Node 自带 SQLite 模拟 D1 查询接口；生产环境使用真实 D1。预览数据保存于 `.sites-runtime/preview.db`，不提交该目录。

## 模块

- public/index.html、style.css、app.js：界面和 API 联调。
- public/excel.js：Excel 模板、读取及写入。
- public/xlsx.full.min.js：SheetJS 官方0.20.3依赖，随站点托管。
- worker/index.js：联系人 CRUD、收藏、浏览器归属隔离、批量导入。
- drizzle/：数据库建表及唯一约束迁移。
- tests/：API、权限隔离和真实 Excel 文件测试。
- scripts/build.mjs：将静态文件嵌入单个 Worker 输出。

## 功能与限制

每个联系人支持收藏，以及多个手机号、邮箱、社交账号、地址。页面提供搜索与收藏筛选。

数据保存在云端数据库，使用随机256位 HttpOnly Cookie 标识当前浏览器的通讯录，不是跨设备账号系统。更换浏览器、清除Cookie或Cookie过期会失去原通讯录访问标识，请定期导出；公开演示使用虚构数据。

Excel 必须使用模板：姓名、收藏、手机号、邮箱、社交账号、通讯地址、备注。每人一行，多值在单元格内换行，收藏填“是/否”，所有列使用文本格式。最多3MB、1000位联系人；每类联系方式最多20条、每条最多300字。前端读取和校验表格，后端再次独立校验全部联系人，再事务批量写入。完全重复记录跳过，同名但信息不同者保留；编辑成完全重复内容时提示冲突。公式形式的用户文本按字符串导出，不执行。

## 部署

`.openai/hosting.json` 声明 D1 绑定 DB。Sites 发布时应用 drizzle 迁移并部署 Worker；本地预览数据与生产数据库分离。云版本必须经过公网操作验证后才记为完成。

## 参考

- https://developers.cloudflare.com/workers/
- https://developers.cloudflare.com/d1/
- https://docs.sheetjs.com/docs/getting-started/installation/nodejs/

SheetJS CE © SheetJS LLC, Apache-2.0；保留依赖文件中的版权及许可声明。
