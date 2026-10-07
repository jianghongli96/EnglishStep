# EnglishLearning

给基础薄弱的初高中学生使用的英语练习网站。当前项目拆成两个部分：

- `frontend/`：学习网站界面，基于 Vinext/React。
- `backend/`：MVP 学习 API，使用 Node.js 内置 HTTP 服务和 SQLite。

## 本地启动

前端和后端都需要 Node.js `>=22.13.0`。项目根目录已通过 Volta 固定为
Node.js `22.14.0`，安装 Volta 后在本目录执行 `npm run ...` 会自动使用正确版本。
如果没有使用 Volta，请先手动切换到 Node 22 或 Node 24。

先启动后端：

```bash
npm run dev:backend
```

再启动前端：

```bash
npm run dev:frontend
```

默认地址：

- 后端 API：`http://localhost:4000`
- 前端页面：以前端启动命令输出为准，通常是 `http://localhost:3001`

## MVP 后端能力

- 体验学生登录与学习档案
- 词汇、语法、阅读题库
- SQLite 数据库存储
- 教材词库 CSV 导入
- 导入词汇后按规则自动生成词汇题
- 题目 fingerprint 去重
- 每日任务生成
- 答题提交与后端判题
- 错题本记录与答对后自动移出
- 按模块统计掌握度
- 简单题库新增接口：`POST /api/admin/questions`

后端首次启动时会根据 `backend/data/seed.json` 创建本地 SQLite 数据库：

```text
backend/data/english-learning.db
```

这个文件用于保存本地词库、题库、答题记录和错题，不会提交到 Git。

## 词库导入

前端左侧进入“词库管理”，可以粘贴 CSV：

```csv
word,meaning,partOfSpeech,example,grade,sourceBook,sourceUnit,difficulty,tags
borrow,借入,verb,I borrow a book from the library.,八年级,人教版,Unit 2,1,高频动词
```

导入后每个词默认生成 3 道题：

- 英译中选择题
- 中译英选择题
- 例句填空题

后端也可以直接调用：

```text
POST /api/admin/vocabulary/import
GET /api/admin/questions?module=words
```

## 服务器部署

当前服务器部署目录：

```text
/var/www/english-learning
```

普通代码部署：

```bash
npm run deploy
```

这个命令会同步代码、在服务器安装依赖、构建前端、重启 pm2，并 reload nginx。默认不会覆盖服务器数据库。

普通部署默认也不会删除服务器上多余的旧文件。如果要清理远端已经废弃的文件，可以先预览：

```bash
./scripts/deploy.sh --dry-run --prune
```

确认无误后再执行：

```bash
./scripts/deploy.sh --prune
```

如果确实需要把本地 SQLite 数据库也迁移到服务器：

```bash
npm run deploy:with-db
```

带数据库部署会先备份服务器上的旧数据库，再上传本地：

```text
backend/data/english-learning.db
```

服务器进程和端口：

```text
english-learning-backend   127.0.0.1:4010
english-learning-frontend  127.0.0.1:4011
nginx external             0.0.0.0:8081
```

nginx 配置文件：

```text
/etc/nginx/conf.d/english-learning.conf
```

## GitHub Actions 自动部署

仓库已添加 workflow：

```text
.github/workflows/deploy.yml
```

推送到 `main` 分支时会自动部署到服务器，也可以在 GitHub Actions 页面手动触发。

需要在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 中配置这些 Secrets：

```text
ALIYUN_HOST       服务器公网 IP 或域名，例如 47.100.77.39
ALIYUN_USER       SSH 用户，例如 root
ALIYUN_SSH_KEY    用于登录服务器的 SSH 私钥
ALIYUN_PORT       SSH 端口，可选，不配置时默认 22
```

可选 Variables：

```text
REMOTE_DIR        默认 /var/www/english-learning
NODE_BIN_DIR      默认 /opt/node-v24.11.0-linux-x64/bin
```

Actions 部署不会上传本地 SQLite 数据库，也不会覆盖服务器学习记录。数据库迁移仍然需要手动执行：

```bash
npm run deploy:with-db
```
