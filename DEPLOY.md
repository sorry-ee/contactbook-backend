# 云服务器部署说明（待实际部署核验）

适用于已具备公网 IP 的 Ubuntu 云服务器。以下为部署方案，不是已部署证明。

## 1. 安装与检出

```sh
sudo apt update
sudo apt install -y python3-venv git nginx
sudo mkdir -p /opt/contactbook
sudo chown "$USER" /opt/contactbook
cd /opt/contactbook
git clone https://github.com/sorry-ee/contactbook-backend.git
git clone https://github.com/sorry-ee/contactbook-frontend.git
cd contactbook-backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## 2. 运行服务

配置 systemd 服务时，将 User 替换为拥有该目录的普通用户。先确保该用户能写入 backend/data 目录。

```ini
[Unit]
Description=ContactBook
After=network.target

[Service]
User=YOUR_LINUX_USER
WorkingDirectory=/opt/contactbook/contactbook-backend
ExecStart=/opt/contactbook/contactbook-backend/.venv/bin/gunicorn --bind 127.0.0.1:8000 --workers 1 'app:create_app()'
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

保存为 `/etc/systemd/system/contactbook.service`，执行 `sudo systemctl daemon-reload` 与 `sudo systemctl enable --now contactbook`。

## 3. 反向代理

Nginx server 配置（替换域名或公网IP）：

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;
    client_max_body_size 3m;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

确认 Nginx 站点无冲突，`sudo nginx -t` 后 reload。云平台安全组开放80/443；应用8000端口仅绑定本机。使用域名及 HTTPS 后，在 systemd Service 中加入 `Environment=COOKIE_SECURE=1`，并重启服务。HTTP演示不设置该变量，否则浏览器无法发送Cookie。

## 4. 验收与备份

- 从另一网络访问公网地址，验证收藏、多联系方式及 Excel 往返。
- 服务重启后检查数据保持；部署更新前备份整个 data 目录，包括 session-secret。
- 截图必须展示真实公网地址和运行页面；保留完整操作视频。
- 不要上传 SSH 密钥到仓库或博客。
