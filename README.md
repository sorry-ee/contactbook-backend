# 知交通讯录 · 后端

Flask + SQLite + openpyxl，实现联系人增删改查、收藏、多联系方式和 Excel 导入导出。前端仓库：https://github.com/sorry-ee/contactbook-frontend

## 本地运行

Python 3.10+，把两个仓库放在同一目录：

```sh
git clone https://github.com/sorry-ee/contactbook-backend.git
git clone https://github.com/sorry-ee/contactbook-frontend.git
cd contactbook-backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

打开 http://127.0.0.1:8000 。前端由同一 Flask 服务提供，无需 Node.js、跨域设置或独立静态服务器。

## 测试

```sh
python -m unittest -v
```

## 数据与边界

- 数据保存在 `data/contacts.db`，签名密钥保存在 `data/session-secret`，不要提交 `data/`。
- 浏览器 Cookie 标识独立通讯录，不需要输入账号密码。换浏览器或清除 Cookie 将无法访问之前的通讯录；这不是实名账号系统，也不具备跨设备同步或账号找回功能。Cookie 默认有效期31天，使用过程中延长有效期；请导出备份。
- 所有增删改和导入都要求自定义请求头，查询、修改和删除都按当前 Cookie 归属过滤。
- 公开演示请使用虚构联系人。

## Excel 格式

从页面下载模板，表头严格依次为：`姓名、收藏、手机号、邮箱、社交账号、通讯地址、备注`。

每人一行；每类多条联系方式在同一单元格内换行（Excel 中使用单元格内换行）。收藏填写“是”或“否”。所有列使用文本格式，尤其电话列，避免丢失前导零。模板和导出均是实际的 `.xlsx`，不是改后缀的 CSV。

导入限制：上传不超过3 MB，解压后不超过20 MB，每次最多1000行，每类最多20条联系方式。先完整校验再事务写入；遇到非法行则整个文件不写入。完全相同的记录会跳过；同名但其他内容不同的记录保留为独立联系人，不自动覆盖。Excel 中的公式文本按普通字符串存储与导出，不执行。

## API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /api/contacts | 当前浏览器全部联系人 |
| POST | /api/contacts | 新建 |
| PUT | /api/contacts/{id} | 完整更新，包括收藏 |
| DELETE | /api/contacts/{id} | 删除 |
| GET | /api/export | 导出全部联系人 |
| GET | /api/template | 下载空模板 |
| POST | /api/import | multipart/form-data，字段 file |

联系人字段：`name`、`favorite`、`phones[]`、`emails[]`、`socials[]`、`addresses[]`、`notes`；响应额外包含 `id`。写请求必须带 `X-Requested-With: ContactBook`。

## 云服务器部署

见 [DEPLOY.md](DEPLOY.md)。尚未提供公网部署地址时，不能把部署配置视作已完成加分项。

参考：[Flask 官方文档](https://flask.palletsprojects.com/en/stable/)、[openpyxl 官方教程](https://openpyxl.readthedocs.io/en/stable/tutorial.html)。
