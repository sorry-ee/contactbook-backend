# Cloudflare 部署

在线应用：https://soul.hmlin-2028.workers.dev/

前端、Worker API 和 D1 数据库部署在本人 Cloudflare 账号，不需要 ChatGPT 或 OpenAI API。前后端同源，前端仓库保留独立源文件，后端仓库包含可部署的集成版本。

## 更新现有部署

1. 在 backend 目录执行 `node scripts/build.mjs`。
2. 打开 Cloudflare 控制台 → Workers & Pages → soul → Edit code。
3. 将 dist/server/index.js 全文替换到 worker.js，点击 Deploy。
4. Settings → Bindings 中确认 D1 database 的变量名为 DB，连接 soul-contacts。

也可使用 Cloudflare 官方 Wrangler，通过本人账号授权后执行 `npx wrangler deploy`。wrangler.jsonc 中保存的是本次数据库标识，不是访问密钥。

## 在其他账号重新部署

1. 创建 D1 数据库。
2. 在该数据库的 Console 执行 drizzle/0000_contacts.sql 中的两条 SQL，建立 contacts 表及索引；仅对新数据库执行一次。
3. 创建 Worker，将其绑定到新数据库，变量名必须为 DB。
4. 按上面步骤构建并上传代码。
5. 如果使用 Wrangler，先把 wrangler.jsonc 的 database_id、database_name 和 name 改为自己账号下的资源。

数据库内容不会包含在源码中。当前浏览器由随机 HttpOnly Cookie 标识；换浏览器或清除 Cookie 后无法访问原通讯录，请先导出备份。未启用付费套餐，资源使用受平台免费额度限制。
