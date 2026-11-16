# Soul 通讯录 · 后端

Cloudflare Worker + D1，提供联系人管理与批量导入接口。仓库包含配套前端，可直接运行集成版本。

- [在线应用](https://zhijiao-contactbook-sorryee.equal-cup-7231.chatgpt.site)
- [后端源码](worker/index.js)
- [前端仓库](https://github.com/sorry-ee/contactbook-frontend)
- [代码规范](CODING_STANDARDS.md)

## 本地运行

安装 Node.js 24 或更高版本，然后执行：

```sh
git clone https://github.com/sorry-ee/contactbook-backend.git
cd contactbook-backend/backend
node scripts/build.mjs
node --test tests/contactbook.test.mjs
node scripts/preview.mjs
```

打开 http://127.0.0.1:8001 。无需安装额外 npm 依赖。本地预览使用 Node 内置 SQLite 模拟 D1 接口，数据保存在 .sites-runtime/preview.db；生产环境使用真实 D1，数据相互独立。

## 文件

| 目录 | 内容 |
| --- | --- |
| public | 页面、样式、交互和 Excel 处理 |
| worker | 联系人 API、输入校验与归属检查 |
| drizzle | 数据库迁移 |
| tests | API 和 Excel 文件测试 |
| scripts | 构建和本地预览 |

## 数据和 Excel 格式

每人一行，表头依次为：姓名、收藏、手机号、邮箱、社交账号、通讯地址、备注。收藏填“是”或“否”，多条联系方式在单元格内换行；电话等内容使用文本格式，避免丢失前导零。上传最大3 MB，每次最多1000位联系人。后端完整校验后批量写入，完全相同的记录跳过，同名但信息不同者保留。

数据以随机浏览器 Cookie 隔离，不支持跨设备账号登录或找回。更换浏览器、清除 Cookie 或 Cookie 过期会失去原访问标识，请定期导出。公开演示使用虚构数据。

## 验证

8项自动测试覆盖增删改查、收藏、浏览器归属隔离、导入校验、重复记录、真实 Excel 往返、公式文本和静态文件访问。本地使用 SQLite 模拟接口；公网已验证导入、收藏、刷新数据保存和 Excel 下载。
