"""
M2F2 Bridge Service - 桥接 Video-Detection-System 与 M2F2_Det 模型
Flask HTTP API，端口 5000，兼容 Video-Detection-System 的 /api/detect 接口格式
"""

import os
import sys
import time
import json
import logging
import torch
import cv2
import numpy as np
from PIL import Image
from datetime import datetime
from flask import Flask, request, jsonify
from torch.nn import functional as F

# LLaVA text generation imports
from llava.mm_utils import tokenizer_hybrid_token
from llava.constants import IMAGE_TOKEN_INDEX, DEEPFAKE_TOKEN_INDEX, DEFAULT_IMAGE_TOKEN, DEFAULT_DEEPFAKE_TOKEN

# 设置离线模式
os.environ['HF_HUB_OFFLINE'] = '1'

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('M2F2-Bridge')

app = Flask(__name__)

# ============================================================
# 全局模型实例
# ============================================================
model = None
tokenizer = None
image_processor = None


def load_model():
    """加载 M2F2_Det 4-bit 量化模型"""
    global model, tokenizer, image_processor
    
    logger.info("正在加载 M2F2_Det 模型 (4-bit 量化)...")
    start = time.time()
    
    from llava.model.builder import load_deepfake_model
    
    tokenizer, model, image_processor, _ = load_deepfake_model(
        model_path='./checkpoints/llava-v1.5-7b-M2F2-Det',
        model_base=None,
        model_name='llava-v1.5-7b-M2F2-Det',
        load_4bit=True
    )
    
    elapsed = time.time() - start
    gpu_mem = torch.cuda.memory_allocated() / 1024**3
    logger.info(f"✅ 模型加载完成 ({elapsed:.1f}s, GPU: {gpu_mem:.2f}GB)")


def detect_single_image(pil_image: Image.Image) -> dict:
    """
    对单张 PIL Image 做伪造检测
    返回: {"result": "FAKE"/"REAL", "confidence": 0.xx, "fake_prob": 0.xx, "real_prob": 0.xx}
    """
    # 1. 用 deepfake_encoder 自带的 CLIP image_processor 预处理
    processor = model.deepfake_encoder.image_processor
    pixel_values = processor.preprocess(pil_image, return_tensors='pt')['pixel_values']
    
    device = next(model.deepfake_encoder.parameters()).device
    dtype = next(model.deepfake_encoder.parameters()).dtype
    pixel_values = pixel_values.to(device=device, dtype=dtype)
    
    # 2. 用 LLaVA 的 vision tower 获取 CLIP 视觉特征
    #    (deepfake_encoder 初始化时 load_vision_encoder=False，需要外部提供)
    vision_tower = model.model.vision_tower
    with torch.inference_mode():
        clip_vision_features = vision_tower(pixel_values)  # [1, 577, 1024]
        # 加上 CLS token (vision tower 返回的是 patch features，需要完整的)
        image_forward_outs = vision_tower.vision_tower(
            pixel_values.to(device=vision_tower.device, dtype=vision_tower.dtype),
            output_hidden_states=True
        )
        clip_vision_features = image_forward_outs.hidden_states[-2]  # [1, 577, 1024]
    
    # 3. 前向推理 deepfake_encoder -> [B, 2] (logits: [real, fake])
    with torch.inference_mode():
        logits = model.deepfake_encoder(
            images=pixel_values,
            clip_vision_features=clip_vision_features.to(dtype=dtype),
            use_cached_clip_text_features=True
        )  # [1, 2]
        probs = F.softmax(logits, dim=-1)  # [1, 2]
    
    real_prob = probs[0, 0].item()
    fake_prob = probs[0, 1].item()
    
    return {
        'result': 'FAKE' if fake_prob > 0.5 else 'REAL',
        'confidence': round(max(real_prob, fake_prob), 4),
        'fake_prob': round(fake_prob, 4),
        'real_prob': round(real_prob, 4),
    }


def generate_description(pil_image: Image.Image, detection_result: dict = None, is_video: bool = False) -> str:
    """
    使用 LLaVA 多模态大语言模型生成自然语言鉴定分析
    返回: 描述图片/视频为何是真实/伪造的文字说明
    """
    try:
        media_type = "视频" if is_video else "图像"
        
        # 根据检测结果构建引导 prompt，保持分析描述与分类结论一致
        if detection_result:
            det_label = detection_result.get('result', 'UNKNOWN')
            det_conf = detection_result.get('confidence', 0)
            fake_p = detection_result.get('fake_prob', 0)
            real_p = detection_result.get('real_prob', 0)
            frames_info = detection_result.get('frames_analyzed', '')
            if is_video and frames_info:
                result_hint = (
                    f"注意：这是一段视频的关键帧截图，深度伪造检测器对该视频共分析了 {frames_info} 帧，"
                    f"综合判定结果为 {det_label}，"
                    f"置信度 {det_conf:.1%}（平均伪造概率 {fake_p:.1%}，真实概率 {real_p:.1%}）。"
                    f"请基于此结论，从视频伪造检测的角度进行详细分析。"
                )
            else:
                result_hint = (
                    f"注意：深度伪造检测器已将此{media_type}判定为 {det_label}，"
                    f"置信度 {det_conf:.1%}（伪造概率 {fake_p:.1%}，真实概率 {real_p:.1%}）。"
                    f"请基于此结论进行详细分析。"
                )
        else:
            result_hint = ""

        if is_video:
            task_desc = (
                f"这是一段视频的关键帧截图。请从视频伪造检测的角度分析该视频是否为深度伪造生成。"
                f"请从面部纹理、边缘伪影、光照一致性、帧间连贯性等维度分析，"
                f"请用中文回答，全程以“该视频”为主语，详细说明判断依据。"
            )
        else:
            task_desc = (
                f"Determine the authenticity. Is the image real or fake? "
                f"If it is fake, explain what artifacts or traces indicate it has been manipulated. "
                f"请用中文回答，详细说明判断依据。"
            )

        prompt = (
            f"Assistant: A chat between a curious human and an artificial intelligence assistant. "
            f"The assistant gives helpful, detailed, and polite answers to the human's questions."
            f"###Human: {DEFAULT_IMAGE_TOKEN}\n {DEFAULT_DEEPFAKE_TOKEN}\n "
            f"{result_hint} "
            f"{task_desc}"
            f"###Assistant:"
        )
        
        input_ids = tokenizer_hybrid_token(
            prompt, tokenizer, IMAGE_TOKEN_INDEX, DEEPFAKE_TOKEN_INDEX,
            return_tensors='pt'
        ).unsqueeze(0).to('cuda')
        
        with torch.inference_mode():
            output = model.generate(
                input_ids,
                images=[pil_image],
                image_sizes=[pil_image.size],
                deepfake_inputs=[pil_image],
                do_sample=False,
                num_beams=1,
                max_new_tokens=512,
                use_cache=True,
            )
        
        text = tokenizer.decode(output[0], skip_special_tokens=True).strip()
        
        # 清理输出：去掉 prompt 回显部分，只保留 Assistant 的回答
        if '###Assistant:' in text:
            text = text.split('###Assistant:')[-1].strip()
        elif 'Assistant:' in text:
            parts = text.split('Assistant:')
            text = parts[-1].strip() if len(parts) > 1 else text
        
        logger.info(f"LLaVA 生成描述: {text[:100]}...")
        return text
        
    except Exception as e:
        logger.error(f"LLaVA 生成描述失败: {e}")
        return ""


def extract_frames(video_path: str, fps: int = 1, max_frames: int = 300) -> list:
    """
    从视频中按指定帧率抽帧
    返回: list of PIL.Image
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"无法打开视频文件: {video_path}")
    
    video_fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / video_fps if video_fps > 0 else 0
    
    # 每隔 frame_interval 帧取一帧
    frame_interval = max(1, int(video_fps / fps))
    
    frames = []
    frame_idx = 0
    while len(frames) < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_interval == 0:
            # BGR -> RGB -> PIL
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(rgb)
            frames.append(pil_img)
        frame_idx += 1
    
    cap.release()
    
    metadata = {
        'resolution': f"{int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}",
        'duration': round(duration, 1),
        'total_frames': total_frames,
        'video_fps': round(video_fps, 1),
        'codec': 'h264',  # 简化处理
    }
    
    return frames, metadata


def is_image_file(path: str) -> bool:
    """判断是否为图片文件"""
    ext = os.path.splitext(path)[1].lower()
    return ext in {'.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff'}


def is_video_file(path: str) -> bool:
    """判断是否为视频文件"""
    ext = os.path.splitext(path)[1].lower()
    return ext in {'.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.webm'}


# ============================================================
# API 路由
# ============================================================

@app.route('/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'healthy',
        'service': 'M2F2 AI Detection Service',
        'version': '1.0.0',
        'model': 'M2F2-Det-7B-4bit',
        'timestamp': datetime.utcnow().isoformat(),
        'gpu_available': torch.cuda.is_available(),
        'gpu_memory_used_gb': round(torch.cuda.memory_allocated() / 1024**3, 2) if torch.cuda.is_available() else 0,
    }), 200


@app.route('/api/detect', methods=['POST'])
def detect():
    """
    核心检测接口 - 兼容 Video-Detection-System 的格式
    
    请求:
    {
        "taskId": "uuid",
        "videoPath": "D:/uploads/video.mp4",  (也支持图片路径)
        "fileHash": "sha256:...",
        "mode": "standard",
        "frameRate": 1,
        "maxFrames": 300
    }
    """
    start_time = time.time()
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON', 'errorCode': 'INVALID_REQUEST'}), 400
        
        task_id = data.get('taskId', 'unknown')
        file_path = data.get('videoPath', '')
        frame_rate = data.get('frameRate', 1)
        max_frames = data.get('maxFrames', 300)
        
        logger.info(f"[{task_id}] 收到检测请求: {file_path}")
        
        # 验证文件
        if not file_path or not os.path.exists(file_path):
            logger.error(f"[{task_id}] 文件不存在: {file_path}")
            return jsonify({
                'error': f'文件不存在: {file_path}',
                'errorCode': 'FILE_NOT_FOUND',
                'taskId': task_id,
                'timestamp': datetime.utcnow().isoformat()
            }), 404
        
        # ---- 图片检测 ----
        if is_image_file(file_path):
            logger.info(f"[{task_id}] 图片检测模式")
            pil_img = Image.open(file_path).convert('RGB')
            result = detect_single_image(pil_img)
            
            # 生成 LLaVA 自然语言分析描述（传入检测结果以保持一致性）
            logger.info(f"[{task_id}] 生成 AI 分析描述...")
            description = generate_description(pil_img, detection_result=result)
            
            processing_time_ms = int((time.time() - start_time) * 1000)
            
            response = {
                'taskId': task_id,
                'result': result['result'],
                'confidence': result['confidence'],
                'modelVersion': 'm2f2-det-7b-4bit',
                'processingTimeMs': processing_time_ms,
                'framesAnalyzed': 1,
                'description': description,
                'features': {
                    'fake_probability': result['fake_prob'],
                    'real_probability': result['real_prob'],
                    'ai_description': description,
                },
                'artifacts': ['deepfake_detection'] if result['result'] == 'FAKE' else [],
                'metadata': {
                    'type': 'image',
                    'resolution': f"{pil_img.width}x{pil_img.height}",
                }
            }
            
            logger.info(f"[{task_id}] ✅ 检测完成 | {result['result']} | 置信度={result['confidence']} | {processing_time_ms}ms")
            return jsonify(response), 200
        
        # ---- 视频检测 ----
        elif is_video_file(file_path):
            logger.info(f"[{task_id}] 视频检测模式 (帧率={frame_rate}fps, 最大帧数={max_frames})")
            
            # 抽帧
            frames, video_meta = extract_frames(file_path, fps=frame_rate, max_frames=max_frames)
            logger.info(f"[{task_id}] 提取了 {len(frames)} 帧")
            
            if len(frames) == 0:
                return jsonify({
                    'error': '无法从视频中提取帧',
                    'errorCode': 'EXTRACTION_FAILED',
                    'taskId': task_id,
                }), 500
            
            # 逐帧检测
            per_frame_scores = []
            for i, frame in enumerate(frames):
                result = detect_single_image(frame)
                per_frame_scores.append(result['fake_prob'])
                if (i + 1) % 10 == 0:
                    logger.info(f"[{task_id}] 已处理 {i+1}/{len(frames)} 帧")
            
            # 汇总结果
            avg_fake_prob = sum(per_frame_scores) / len(per_frame_scores)
            avg_confidence = max(avg_fake_prob, 1.0 - avg_fake_prob)
            final_result = 'FAKE' if avg_fake_prob > 0.5 else 'REAL'
            
            # 对最具代表性的帧生成 LLaVA 描述 (选择 fake_prob 最高的帧)
            logger.info(f"[{task_id}] 生成 AI 分析描述 (选取关键帧)...")
            key_frame_idx = per_frame_scores.index(max(per_frame_scores))
            video_result = {
                'result': final_result,
                'confidence': round(avg_confidence, 4),
                'fake_prob': round(avg_fake_prob, 4),
                'real_prob': round(1.0 - avg_fake_prob, 4),
                'frames_analyzed': len(frames),
            }
            description = generate_description(frames[key_frame_idx], detection_result=video_result, is_video=True)
            
            processing_time_ms = int((time.time() - start_time) * 1000)
            
            response = {
                'taskId': task_id,
                'result': final_result,
                'confidence': round(avg_confidence, 4),
                'modelVersion': 'm2f2-det-7b-4bit',
                'processingTimeMs': processing_time_ms,
                'framesAnalyzed': len(frames),
                'description': description,
                'features': {
                    'avg_fake_probability': round(avg_fake_prob, 4),
                    'per_frame_scores': [round(s, 4) for s in per_frame_scores],
                    'fake_frame_ratio': round(sum(1 for s in per_frame_scores if s > 0.5) / len(per_frame_scores), 4),
                    'ai_description': description,
                    'key_frame_index': key_frame_idx,
                },
                'artifacts': ['deepfake_detection'] if final_result == 'FAKE' else [],
                'metadata': video_meta,
            }
            
            logger.info(
                f"[{task_id}] ✅ 视频检测完成 | {final_result} | "
                f"置信度={avg_confidence:.4f} | "
                f"帧数={len(frames)} | {processing_time_ms}ms"
            )
            return jsonify(response), 200
        
        else:
            return jsonify({
                'error': f'不支持的文件格式: {os.path.splitext(file_path)[1]}',
                'errorCode': 'UNSUPPORTED_FORMAT',
                'taskId': task_id,
            }), 400
    
    except FileNotFoundError as e:
        return jsonify({
            'error': str(e),
            'errorCode': 'FILE_NOT_FOUND',
            'taskId': data.get('taskId', 'unknown'),
            'timestamp': datetime.utcnow().isoformat()
        }), 404
    
    except Exception as e:
        logger.error(f"检测失败: {str(e)}", exc_info=True)
        return jsonify({
            'error': str(e),
            'errorCode': 'INTERNAL_ERROR',
            'taskId': data.get('taskId', 'unknown'),
            'timestamp': datetime.utcnow().isoformat()
        }), 500


# ============================================================
# 启动
# ============================================================

if __name__ == '__main__':
    print("=" * 60)
    print("  M2F2 AI Detection Bridge Service")
    print("  兼容 Video-Detection-System /api/detect 接口")
    print("=" * 60)
    
    # 加载模型
    load_model()
    
    print()
    print(f"  服务地址: http://localhost:5000")
    print(f"  GPU 显存: {torch.cuda.memory_allocated()/1024**3:.2f} GB")
    print()
    print("  接口:")
    print("    GET  /health        → 健康检查")
    print("    POST /api/detect    → 图片/视频检测")
    print()
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=False)
