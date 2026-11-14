# 智鉴 ZhiJian — 多模态深度伪造检测平台

一个面向图片和视频的人脸深度伪造（Deepfake）检测全栈系统。用户上传素材后，系统逐帧判断真伪，并由多模态大模型生成**可解释的自然语言分析**，最终输出可视化取证报告。

> 核心模型基于开源的 [M2F2-Det](https://github.com/CHELSEA234/M2F2_Det)（CVPR 2025 Oral），在 **8GB 显存的消费级笔记本显卡（RTX 4060 Laptop）** 上通过 4-bit 量化完成本地推理。

---

## 功能

- **图片 / 视频检测**：上传后自动判别 真实（AUTHENTIC）/ 伪造（FAKE），给出置信度和真伪概率分布
- **视频逐帧分析**：OpenCV 按 1 fps 抽帧（最多 300 帧），逐帧检测后汇总结论
- **AI 可解释报告**：LLaVA 生成自然语言描述，指出可疑的伪造痕迹
- **可视化取证**：取证时间轴、雷达图、仪表盘、热力图叠加、报告抽屉
- **用户与审计**：JWT 登录认证、检测历史、操作审计日志
- **异步任务 + 实时推送**：Kafka 分发检测任务，WebSocket 推送检测进度

## 技术栈

| 层 | 技术 |
|---|---|
| AI 推理 | Python 3.10、PyTorch 2.0、LLaVA-1.5-7B、M2F2-Det、BitsAndBytes 4-bit 量化、OpenCV |
| AI 服务 | Flask（`bridge_service.py`，端口 5000） |
| 后端 | Java 17、Spring Boot 3.2 微服务、Spring Security + JWT、OpenFeign、Spring Retry |
| 前端 | React 19、Vite 7、React Router、Axios |
| 基础设施 | PostgreSQL 15、Kafka、Redis、Docker Compose |

## 系统架构

```
浏览器 ──▶ React 前端 (:3000, Vite 代理)
              │
              ▼
   Spring Boot 微服务 (:9001-9006)
   auth · video · detection · worker · websocket · audit
              │                 │
              │   Kafka 异步任务 │  PostgreSQL / Redis
              ▼
   AI Bridge (Flask :5000) ──▶ M2F2-Det + LLaVA-1.5-7B (4-bit, GPU)
```

## 目录结构

```
.
├── M2F2_Det-main/              # AI 推理引擎
│   ├── bridge_service.py       # Flask 推理服务：/health、/api/detect
│   ├── llava/                  # LLaVA 与 M2F2-Det 模型代码（来自上游）
│   ├── checkpoints/            # 模型权重放这里（需单独下载）
│   └── utils/compute_table_stats.py  # 数据集统计脚本
├── Video-Detection-System-main/  # Java 微服务 + React 前端
│   ├── auth-service/ video-service/ detection-service/
│   ├── worker-service/ websocket-service/ audit-service/
│   ├── ai-client/ common-lib/
│   ├── frontend/               # React 前端
│   └── docker-compose-infra.yml
├── docs/                       # 部署文档、整合方案、开源组件说明
├── start.bat / stop.bat        # Windows 一键启动 / 停止
└── README.md
```

## 快速开始（Windows）

**环境要求**：Docker Desktop、JDK 17、Maven 3.9+、Node.js 18+、Conda、NVIDIA GPU（≥ 6GB 显存）

1. **准备 AI 环境**
   ```bash
   cd M2F2_Det-main
   conda env create -f environment.yml -n m2f2
   ```
2. **下载模型权重**（不随仓库提供）
   - M2F2-Det 权重：[Hugging Face](https://huggingface.co/CHELSEA234/llava-v1.5-7b-M2F2-Det) → 放到 `M2F2_Det-main/checkpoints/llava-v1.5-7b-M2F2-Det/`
   - CLIP Vision Tower 权重：见 [上游 README](https://github.com/CHELSEA234/M2F2_Det) → 放到 `M2F2_Det-main/utils/weights/`
   - 国内下载慢可设置 `HF_ENDPOINT=https://hf-mirror.com`
3. **编译后端、安装前端依赖**
   ```bash
   cd Video-Detection-System-main
   mvn clean package -DskipTests
   cd frontend && npm install
   ```
4. **一键启动**：双击 `start.bat`，启动完成后访问 http://127.0.0.1:3000

详细步骤和常见问题见 [docs/部署文档.md](docs/部署文档.md)。

## AI 推理服务接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查，返回 GPU 状态、显存占用、模型版本 |
| POST | `/api/detect` | 传入 `taskId`、`videoPath`（图片或视频）、`frameRate`、`maxFrames`，返回检测结论、置信度、真伪概率和 AI 分析描述 |

## 性能参考

| 项目 | 数值 |
|---|---|
| 显卡 | RTX 4060 Laptop（8GB） |
| 量化方式 | BitsAndBytes 4-bit (NF4) |
| 显存占用 | 约 4-5 GB |
| 单张图片推理 | 约 8-15 秒（含文本生成） |

## 说明

- 数据库密码、JWT 密钥等为**本地开发默认值**，部署到公网前请通过环境变量替换。
- 模型权重、数据集（DDVQA）、Conda 环境体积较大，未纳入仓库，请按上文下载。

## 致谢

- [M2F2-Det](https://github.com/CHELSEA234/M2F2_Det) — Guo et al., *Rethinking Vision-Language Model in Face Forensics*, CVPR 2025（MIT）
- [LLaVA](https://github.com/haotian-liu/LLaVA)（Apache-2.0）
- 完整的第三方组件清单见 [docs/开源组件使用说明.md](docs/开源组件使用说明.md)

## License

[MIT](LICENSE)
