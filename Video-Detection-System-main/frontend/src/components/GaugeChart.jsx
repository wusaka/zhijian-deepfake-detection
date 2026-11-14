import { useRef, useEffect, useState } from 'react';

/**
 * GaugeChart — 半圆仪表盘（Canvas 手绘）
 * Props:
 *   value: 0~1 置信度
 *   result: 'FAKE' | 'REAL' | 'UNCERTAIN' | 'UNKNOWN'
 *   size: 画布直径 (默认 280)
 */
export default function GaugeChart({ value = 0, result = 'REAL', size = 280 }) {
    const canvasRef = useRef(null);
    const [animValue, setAnimValue] = useState(0);

    // Animate from 0 to target value
    useEffect(() => {
        let start = null;
        const duration = 1200;
        const target = Math.max(0, Math.min(1, value));

        const animate = (timestamp) => {
            if (!start) start = timestamp;
            const elapsed = timestamp - start;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setAnimValue(eased * target);
            if (progress < 1) requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }, [value]);

    // Draw gauge
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const w = size;
        const h = size * 0.65;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h - 20;
        const radius = w / 2 - 30;
        const lineWidth = 18;
        const startAngle = Math.PI;
        const endAngle = 2 * Math.PI;

        // --- Background arc (dark track) ---
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.lineWidth = lineWidth + 4;
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineCap = 'round';
        ctx.stroke();

        // --- Gradient arc ---
        // For FAKE results: green(safe) -> red(danger) left to right
        // For REAL results: red(danger) -> green(safe) left to right (inverted)
        const isFake = result === 'FAKE';
        const gradient = ctx.createLinearGradient(0, cy, w, cy);
        if (isFake) {
            gradient.addColorStop(0, '#10B981');    // green (low fake confidence)
            gradient.addColorStop(0.35, '#34D399');
            gradient.addColorStop(0.5, '#FBBF24');  // amber
            gradient.addColorStop(0.7, '#F97316');
            gradient.addColorStop(0.85, '#EF4444'); // red (high fake confidence)
            gradient.addColorStop(1, '#DC2626');
        } else {
            gradient.addColorStop(0, '#DC2626');     // red (low real confidence = suspicious)
            gradient.addColorStop(0.15, '#EF4444');
            gradient.addColorStop(0.3, '#F97316');
            gradient.addColorStop(0.5, '#FBBF24');  // amber
            gradient.addColorStop(0.65, '#34D399');
            gradient.addColorStop(1, '#10B981');    // green (high real confidence = safe)
        }

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = gradient;
        ctx.lineCap = 'round';
        ctx.stroke();

        // --- Tick marks ---
        for (let i = 0; i <= 10; i++) {
            const angle = startAngle + (i / 10) * Math.PI;
            const innerR = radius - lineWidth / 2 - 8;
            const outerR = radius - lineWidth / 2 - (i % 5 === 0 ? 18 : 12);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
            ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
            ctx.lineWidth = i % 5 === 0 ? 2 : 1;
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // --- Tick labels: 0%, 50%, 100% ---
        ctx.font = '600 10px JetBrains Mono, monospace';
        ctx.fillStyle = '#52525B';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelR = radius - lineWidth / 2 - 28;
        const labels = [
            { pct: '0%', angle: Math.PI },
            { pct: '50%', angle: Math.PI * 1.5 },
            { pct: '100%', angle: Math.PI * 2 },
        ];
        labels.forEach(({ pct, angle }) => {
            const lx = cx + Math.cos(angle) * labelR;
            const ly = cy + Math.sin(angle) * labelR;
            ctx.fillText(pct, lx, ly);
        });

        // --- Needle ---
        const needleAngle = startAngle + animValue * Math.PI;
        const needleLen = radius - lineWidth / 2 - 6;

        // Determine colors based on result context
        const isFakeResult = result === 'FAKE';
        let dotColor, textColor;
        if (isFakeResult) {
            // FAKE: high value = bad (red)
            dotColor = animValue > 0.5 ? '#EF4444' : animValue > 0.35 ? '#FBBF24' : '#10B981';
            textColor = dotColor;
        } else {
            // REAL/AUTHENTIC: high value = good (green)
            dotColor = animValue > 0.65 ? '#10B981' : animValue > 0.5 ? '#34D399' : animValue > 0.35 ? '#FBBF24' : '#EF4444';
            textColor = dotColor;
        }

        // Needle shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(
            cx + Math.cos(needleAngle) * needleLen,
            cy + Math.sin(needleAngle) * needleLen
        );
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#F5F5F7';
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();

        // Needle dot
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#F5F5F7';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

        // --- Center value text ---
        const pctText = (animValue * 100).toFixed(1) + '%';
        ctx.font = '800 32px JetBrains Mono, monospace';
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pctText, cx, cy - 38);

        // Label
        const labelText = result === 'FAKE' ? '伪造置信度' :
            result === 'UNCERTAIN' || result === 'UNKNOWN' ? '不确定度' : '真实置信度';
        ctx.font = '600 11px JetBrains Mono, monospace';
        ctx.fillStyle = '#71717A';
        ctx.fillText(labelText, cx, cy - 14);

    }, [animValue, size, result]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <canvas ref={canvasRef} />
        </div>
    );
}
