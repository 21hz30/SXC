# SRC - 混合训练平台

一个面向 Hyrox 教练的 AI 辅助训练管理后台：管理运动员、训练营、课程、
结构化训练内容以及每节课的表现数据，并内置 AI 协同教练，可协助起草训练
计划并给出针对个人的指导建议。

**线上地址：** https://hybridtraining.cn/

**技术栈：** Next.js 16（App Router）· React 19 · Prisma 7 + PostgreSQL（Supabase）· Tailwind 4 · Anthropic SDK。

> 🇬🇧 English docs: [README.md](README.md)

> **登录鉴权：** 采用简单的基于 Cookie 的会话机制。公开注册会创建运动员
> /客户（customer）账号；教练（coach）和管理员（admin）账号由管理员在
> Team 页面创建。

---

## 环境要求

- **Node.js 20+**（22 亦可）与 npm
- 一个 **Supabase** 项目（免费版即可）。在
  *Project Settings → Database → Connection string → Session* 处获取
  **session-mode pooler** 连接字符串。

## 快速开始

```bash
# 1. 安装依赖（postinstall 会自动生成 Prisma client）
npm install

# 2. 创建本地环境变量文件
cp .env.example .env
#    然后打开 .env，填入 DATABASE_URL、SESSION_SECRET 以及（可选的）AI 密钥

# 3. 创建数据库结构并载入示例数据
npm run db:setup

# 4. 启动开发服务器
npm run dev
```

打开 **http://localhost:3000**，然后在 **注册（Register）** 页面创建账号。

## 环境变量

将 `.env.example` 复制为 `.env` 并填写：

| 变量             | 是否必填   | 说明                                                                   |
| ---------------- | ---------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`   | 是         | Supabase **session-mode pooler** 连接串。格式：`postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres` |
| `SESSION_SECRET` | 是         | 用于签名会话 Cookie 的密钥，生产环境请使用足够长的随机字符串。        |
| `NEXT_PUBLIC_FEATURE_NUTRITION` | 可选 | 设为 `true` 可恢复独立 Nutrition 模块；默认隐藏。                 |
| `AI_API_KEY`     | AI 对话需要 | 模型服务商的 API Key（需兼容 Anthropic）。                            |
| `AI_BASE_URL`    | AI 对话需要 | 模型服务商的 Base URL。                                                |
| `AI_MODEL`       | 可选       | 模型名称（默认为 `deepseek-chat`）。                                   |

不填 AI 密钥也可正常运行，但在设置 `AI_API_KEY`（通常还需 `AI_BASE_URL`）
之前，**AI 协同教练对话功能将被禁用**。

> **数据库迁移：** 生产部署会在 `next build` 前运行
> `scripts/migrate-deploy.mjs`。该脚本只在 Vercel production 环境执行迁移，
> 并使用支持 session 的 Postgres 连接；本地和 preview 构建会跳过自动迁移。

## 常用脚本

| 命令                 | 作用                                              |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | 启动开发服务器（Turbopack），端口 3000。          |
| `npm run build`      | 生产环境构建。                                    |
| `npm start`          | 运行生产构建。                                    |
| `npm run lint`       | 使用 ESLint 进行代码检查。                         |
| `npm run db:setup`   | 执行待处理的数据库迁移。                         |
| `npm run db:migrate` | 仅执行待处理的迁移（不载入数据）。                |
| `npm run db:demo-reset` | 破坏性重置演示数据；仅限显式授权的开发环境。  |
| `npm run db:wipe`    | 破坏性清空应用数据；仅限显式授权的开发环境。      |

## 项目结构

```
src/
├─ app/             # 页面（UI）+ API 路由（后端）—— Next.js App Router
│  ├─ (app)/        # 登录后的后台：日历、训练营、客户、课程、训练内容
│  ├─ api/          # 后端接口（chat、workouts、performance……）
│  └─ login/        # 登录页
├─ agent/           # AI 协同教练引擎（流式循环 + 系统提示词）          [后端]
├─ tools/           # AI 工具注册表                                      [后端]
├─ domain/          # 业务逻辑：训练内容、表现、基准数据                [后端]
├─ lib/             # 数据库客户端、鉴权、公共查询                      [后端]
└─ components/      # 可复用 UI 组件                                    [前端]
prisma/             # schema.prisma、迁移、seed.ts
```

后端（`agent`、`tools`、`domain`、`lib`、`app/api`）与前端
（`components`、`app/*/page.tsx`）共享同一套代码库与类型定义——这是一个
全栈 Next.js 应用的有意设计。

## 提交规范

```
<type>: <简短说明>
```

类型：`feat`（新功能）· `fix`（缺陷修复）· `docs`（文档）·
`style`（仅格式调整）· `refactor`（非功能/缺陷的代码调整）·
`test`（测试）· `chore`（杂项维护）。
