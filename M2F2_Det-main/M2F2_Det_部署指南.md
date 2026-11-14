# M2F2_Det 多模态伪造人脸检测系统 — 部署指南

## 📋 项目概述

M2F2_Det 是基于 LLaVA-7B 的多模态伪造人脸检测系统，通过融合 CLIP 视觉/文本特征和 DenseNet121 deepfake 特征，实现图像真伪判别。

---

## 🖥️ 硬件环境

| 项目 | 配置 |
|------|------|
| GPU | NVIDIA RTX 4060 (8GB VRAM) |
| 系统 | Windows 11 |
| CUDA | 12.8 |
| Python | 3.10.20 (Conda 环境: `m2f2`) |

---

## 📦 关键依赖版本

> [!IMPORTANT]
> 以下依赖版本经过验证，**请勿随意升降级**，否则可能导致各种兼容性问题。

| 包 | 版本 | 说明 |
|----|------|------|
| `torch` | 2.1.2+cu121 | GPU 计算 |
| `transformers` | 4.37.0 | LLaVA 模型框架 |
| `accelerate` | **0.33.0** | ⚠️ 必须 ≥0.33.0，旧版 (0.21.0) 有 meta device bug |
| `bitsandbytes` | 0.43.1 | 4-bit 量化 |
| `peft` | 0.10.0 | LoRA 支持 |
| `gradio` | **4.16.0** | Web UI（不能用最新版） |
| `gradio_client` | 0.8.1 | Gradio 客户端 |
| `starlette` | **<1.0.0** (0.52.1) | Gradio 依赖，1.0.0 有 unhashable dict bug |
| `fastapi` | <1.0.0 | API 框架 |

---

## 🔧 代码修改总结

部署过程中修改了 4 个文件，解决了 5 个核心问题：

### 1. `llava/model/language_model/llava_llama.py`

**问题**: 4-bit 量化加载时，`from_pretrained` 在 meta device 上初始化模型，但 `deepfake_encoder` 和 `deepfake_projector` 不在预训练 checkpoint 中，导致它们永远留在 meta device 上。

**修复**:
```diff
# __init__ 方法中检测 meta device，延迟初始化
+ _on_meta = any(p.is_meta for p in self.parameters())
+ if _on_meta:
+     self.deepfake_encoder = None
+     self.deepfake_projector = None
+     self._deepfake_initialized = False
+ else:
+     self._init_deepfake_components()
```

```diff
# _init_deepfake_components 中 dtype 从 bfloat16 改为 float16
- vision_dtype=torch.bfloat16,
- text_dtype=torch.bfloat16,
- deepfake_dtype=torch.bfloat16,
+ vision_dtype=torch.float16,
+ text_dtype=torch.float16,
+ deepfake_dtype=torch.float16,
```

---

### 2. `llava/model/builder.py`

**问题 1**: `low_cpu_mem_usage=False` 与 4-bit 量化不兼容。  
**问题 2**: `mm_projector` 被错误量化导致 GELU 激活函数崩溃 (`"GeluCUDAKernelImpl" not implemented for 'Byte'`)。  
**问题 3**: deepfake 组件延迟初始化后需要手动移到 GPU。

**修复**:
```diff
# 1. 启用 low_cpu_mem_usage（4-bit 量化必需）
- low_cpu_mem_usage=False,
+ low_cpu_mem_usage=True,
```

```diff
# 2. 排除不应被量化的模块
  kwargs['quantization_config'] = BitsAndBytesConfig(
      load_in_4bit=True,
      bnb_4bit_compute_dtype=torch.float16,
      bnb_4bit_use_double_quant=True,
      bnb_4bit_quant_type='nf4',
+     llm_int8_skip_modules=['mm_projector', 'deepfake_encoder', 'deepfake_projector', 'lm_head']
  )
```

```diff
# 3. 量化模型加载后，补充初始化 deepfake 组件并移到 GPU
+ if hasattr(model, '_deepfake_initialized') and not model._deepfake_initialized:
+     model._init_deepfake_components()
+     model.deepfake_encoder = model.deepfake_encoder.to(dtype=torch.float16, device='cuda')
+     model.deepfake_projector = model.deepfake_projector.to(dtype=torch.float16, device='cuda')
```

---

### 3. `llava/serve/model_worker.py`

**问题**: 4-bit 量化后模型已在 GPU 上，不需要再调用 `.to('cuda')`。

**修复**:
```diff
+ if load_8bit or load_4bit:
+     # Model already on GPU from 4-bit quantized from_pretrained
+     pass
+ else:
+     self.model = self.model.to('cuda')
```

---

### 4. `llava/serve/gradio_web_server.py`

**问题**: Gradio 检测 localhost 不可访问（代理干扰），拒绝启动。

**修复**:
```diff
- share=args.share
+ share=args.share or True
```

---

## 🚀 启动方式

> [!IMPORTANT]
> 必须按以下顺序在 **3 个独立终端** 中依次启动。

### 终端 1 — Controller

```powershell
cd f:\fake\M2F2_Det-main
conda activate m2f2
python -m llava.serve.controller --host 0.0.0.0 --port 10000
```

### 终端 2 — Gradio Web Server

```powershell
cd f:\fake\M2F2_Det-main
conda activate m2f2
python -m llava.serve.gradio_web_server --controller http://localhost:10000 --model-list-mode reload
```

### 终端 3 — Model Worker (4-bit 量化)

```powershell
cd f:\fake\M2F2_Det-main
conda activate m2f2
$env:HF_HUB_OFFLINE="1"
python -m llava.serve.model_worker --host 0.0.0.0 --controller http://localhost:10000 --port 40000 --worker http://localhost:40000 --model-path ./checkpoints/llava-v1.5-7b-M2F2-Det --load-4bit
```

> [!TIP]
> `$env:HF_HUB_OFFLINE="1"` 可避免 HuggingFace 网络超时问题，使用本地缓存。

---

## ✅ 验证服务

### 检查端口

```powershell
netstat -an | Select-String "7860|10000|40000" | Select-String "LISTENING"
```

预期输出：
```
TCP    0.0.0.0:7860     0.0.0.0:0    LISTENING   ← Gradio
TCP    0.0.0.0:10000    0.0.0.0:0    LISTENING   ← Controller
TCP    0.0.0.0:40000    0.0.0.0:0    LISTENING   ← Worker
```

### 检查模型注册

```powershell
conda activate m2f2
python -c "import requests; print(requests.post('http://localhost:10000/list_models').json())"
```

预期输出：`{'models': ['M2F2-Det']}`

### 访问 Web UI

浏览器打开：**http://localhost:7860**

---

## 📊 性能数据

| 指标 | 数值 |
|------|------|
| 模型加载时间 | ~30 秒 |
| GPU 显存占用 | **4.19 GB / 8 GB** |
| 单次图像推理 | **~2 秒** |
| 量化方式 | NF4 4-bit + double quant |

---

## ⚠️ 常见问题

### Q: `ValueError: weight is on the meta device`
**原因**: `accelerate` 版本太旧。  
**解决**: `pip install accelerate==0.33.0`

### Q: `TypeError: unhashable type: 'dict'`
**原因**: `starlette` 1.0.0 与 Gradio 4.16.0 不兼容。  
**解决**: `pip install "starlette<1.0.0"`

### Q: `RuntimeError: "GeluCUDAKernelImpl" not implemented for 'Byte'`
**原因**: `mm_projector` 被错误地 4-bit 量化。  
**解决**: 在 `BitsAndBytesConfig` 中添加 `llm_int8_skip_modules`。

### Q: `RuntimeError: expected scalar type BFloat16 but found Half`
**原因**: deepfake 组件用了 `bfloat16`，但模型用 `float16`。  
**解决**: 将 `_init_deepfake_components` 中的 dtype 全部改为 `torch.float16`。

### Q: `localhost is not accessible`
**原因**: 代理设置干扰了 Gradio 的 localhost 检测。  
**解决**: 在 `gradio_web_server.py` 中设置 `share=True`。

### Q: HuggingFace 下载超时
**解决**: 启动前设置 `$env:HF_HUB_OFFLINE="1"`。

---

## 📁 项目文件结构（关键文件）

```
M2F2_Det-main/
├── checkpoints/
│   └── llava-v1.5-7b-M2F2-Det/     # 模型权重
├── llava/
│   ├── model/
│   │   ├── builder.py                # ✏️ 模型加载（已修改）
│   │   ├── llava_arch.py             # 多模态架构
│   │   ├── language_model/
│   │   │   └── llava_llama.py        # ✏️ LLaMA + Deepfake（已修改）
│   │   ├── deepfake/
│   │   │   └── M2F2Det/
│   │   │       ├── model.py          # deepfake 检测模型
│   │   │       └── text_encoder.py   # CLIP 文本编码器
│   │   └── multimodal_encoder/
│   │       └── clip_encoder.py       # CLIP 视觉编码器
│   └── serve/
│       ├── controller.py             # 服务控制器
│       ├── gradio_web_server.py      # ✏️ Web UI（已修改）
│       └── model_worker.py           # ✏️ 模型推理（已修改）
└── m2f2/                             # Conda 虚拟环境
```

> ✏️ = 已修改的文件
