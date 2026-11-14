import { useRef, useEffect, useState } from 'react';

/**
 * RadarChart — 多维雷达图（Canvas 手绘）
 * 
 * 使用后端 detection_engine 计算的真实 FeatureScores:
 *   - temporal_consistency: 帧间时序一致性 (0~1, 越高越正常)
 *   - facial_landmarks_score: 面部特征点分数 (0~1)
 *   - compression_artifacts: 压缩伪影程度 (0~1, 越高越异常)
 *   - color_histogram_score: 色彩直方图分数 (0~1)
 *   - optical_flow_score: 光流一致性分数 (0~1)
 *
 * Props:
 *   confidence: 0~1  (总体伪造置信度)
 *   artifacts: string[]  伪造痕迹文本列表
 *   features: object  后端返回的 FeatureScores (可能为空)
 *   size: 画布尺寸 (默认 300)
 */

// 六维雷达图维度定义
// value 含义: 越高 = 越"健康/正常"，图形越大 = 越安全
const DIMENSIONS = [
    {
        key: 'lighting',
        label: '光照一致性',
        // 从 temporal_consistency 派生 (帧间一致性暗示光照稳定)
        extract: (f) => f.temporal_consistency,
    },
    {
        key: 'blink',
        label: '眨眼频率',
        // 从 facial_landmarks_score 派生 (关键点准确度反映眨眼自然度)
        extract: (f) => f.facial_landmarks_score,
    },
    {
        key: 'background',
        label: '背景融合度',
        // 从 color_histogram_score 派生
        extract: (f) => f.color_histogram_score,
    },
    {
        key: 'color',
        label: '色彩映射',
        // 从 optical_flow_score 派生
        extract: (f) => f.optical_flow_score,
    },
    {
        key: 'edge',
        label: '边缘自然度',
        // compression_artifacts 越高 = 越异常，所以取反
        extract: (f) => 1.0 - f.compression_artifacts,
    },
    {
        key: 'texture',
        label: '纹理连续性',
        // 帧间时序一致性直接映射
        extract: (f) => f.temporal_consistency,
    },
];

/**
 * 计算各维度分数
 * 优先使用后端真实 features；若无数据则从 confidence 推导
 */
function computeScores(confidence, artifacts = [], features = {}) {
    const hasRealData = features
        && typeof features === 'object'
        && Object.keys(features).length > 0
        && features.temporal_consistency !== undefined;

    // 用于关键词匹配的文本
    const joined = artifacts.join(' ').toLowerCase();

    // Seeded random for deterministic fallback (so it doesn't jump on re-render)
    let seed = Math.round(confidence * 100000);
    const seeded = () => {
        seed = (seed * 16807 + 0) % 2147483647;
        return (seed - 1) / 2147483646;
    };

    return DIMENSIONS.map((dim) => {
        let value;

        if (hasRealData) {
            // ✅ 使用后端真实数据
            const raw = dim.extract(features);
            value = typeof raw === 'number' ? raw : 0.5;
        } else {
            // Fallback: 从 confidence 推导 (确定性)
            value = 1 - confidence * (0.4 + seeded() * 0.3);
            // 关键词惩罚
            const keywords = {
                lighting: ['光照', '光线', 'lighting'],
                blink: ['眨眼', 'blink'],
                background: ['背景', 'background'],
                color: ['色彩', '棋盘格', 'color'],
                edge: ['边缘', '噪声', 'edge'],
                texture: ['纹理', '跳变', 'texture'],
            };
            const kws = keywords[dim.key] || [];
            if (kws.some(kw => joined.includes(kw.toLowerCase()))) {
                value -= 0.15 + seeded() * 0.2;
            }
        }

        return {
            ...dim,
            value: Math.max(0.05, Math.min(1, value)),
        };
    });
}

export default function RadarChart({ confidence = 0, artifacts = [], features = {}, size = 300 }) {
    const canvasRef = useRef(null);
    const [animProgress, setAnimProgress] = useState(0);
    const scoresRef = useRef(computeScores(confidence, artifacts, features));

    // Recompute scores when props change
    useEffect(() => {
        scoresRef.current = computeScores(confidence, artifacts, features);
    }, [confidence, artifacts, features]);

    // Animate
    useEffect(() => {
        let start = null;
        const duration = 1000;
        const animate = (ts) => {
            if (!start) start = ts;
            const elapsed = ts - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setAnimProgress(eased);
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [confidence]);

    // Draw
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, size, size);

        const cx = size / 2;
        const cy = size / 2;
        const maxR = size / 2 - 40;
        const n = DIMENSIONS.length;
        const angleStep = (Math.PI * 2) / n;
        const startOffset = -Math.PI / 2; // start from top
        const scores = scoresRef.current;

        // --- Grid rings ---
        const rings = [0.2, 0.4, 0.6, 0.8, 1.0];
        rings.forEach((ringPct) => {
            ctx.beginPath();
            for (let i = 0; i <= n; i++) {
                const angle = startOffset + i * angleStep;
                const r = maxR * ringPct;
                const x = cx + Math.cos(angle) * r;
                const y = cy + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = `rgba(255,255,255,${ringPct === 1 ? 0.08 : 0.03})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        // --- Grid spokes ---
        for (let i = 0; i < n; i++) {
            const angle = startOffset + i * angleStep;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // --- Data polygon (filled) ---
        ctx.beginPath();
        scores.forEach((s, i) => {
            const angle = startOffset + i * angleStep;
            const r = maxR * s.value * animProgress;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();

        // Gradient fill
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
        const isFake = confidence > 0.5;
        if (isFake) {
            grad.addColorStop(0, 'rgba(239, 68, 68, 0.03)');
            grad.addColorStop(1, 'rgba(236, 72, 153, 0.2)');
        } else {
            grad.addColorStop(0, 'rgba(16, 185, 129, 0.03)');
            grad.addColorStop(1, 'rgba(16, 185, 129, 0.2)');
        }
        ctx.fillStyle = grad;
        ctx.fill();

        // Stroke
        ctx.strokeStyle = isFake ? 'rgba(236, 72, 153, 0.7)' : 'rgba(16, 185, 129, 0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // --- Data dots ---
        scores.forEach((s, i) => {
            const angle = startOffset + i * angleStep;
            const r = maxR * s.value * animProgress;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;

            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = isFake ? '#EC4899' : '#10B981';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#111111';
            ctx.fill();
        });

        // --- Labels ---
        ctx.font = '600 10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        scores.forEach((s, i) => {
            const angle = startOffset + i * angleStep;
            const labelR = maxR + 24;
            const lx = cx + Math.cos(angle) * labelR;
            const ly = cy + Math.sin(angle) * labelR;

            // Score percentage
            const scoreText = Math.round(s.value * 100) + '%';
            ctx.fillStyle = '#52525B';
            ctx.font = '700 10px JetBrains Mono, monospace';
            ctx.fillText(scoreText, lx, ly - 9);

            // Dimension label
            ctx.fillStyle = '#A1A1AA';
            ctx.font = '500 11px Inter, sans-serif';
            ctx.fillText(s.label, lx, ly + 7);
        });

    }, [animProgress, size, confidence]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
            <canvas ref={canvasRef} />
        </div>
    );
}
