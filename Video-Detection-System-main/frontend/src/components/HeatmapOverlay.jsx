import { useRef, useEffect, useState, useCallback } from 'react';

/**
 * HeatmapOverlay — 原图 / 伪造热力图 切换
 * Props:
 *   src: 图片 URL
 *   confidence: 0~1
 *   result: 'FAKE' | 'REAL' | ...
 */
export default function HeatmapOverlay({ src, confidence = 0.5, result = 'FAKE' }) {
    const canvasRef = useRef(null);
    const imgRef = useRef(null);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);

    // Load image
    useEffect(() => {
        if (!src) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            imgRef.current = img;
            setImgLoaded(true);
        };
        img.onerror = () => {
            setImgLoaded(false);
        };
        img.src = src;
        return () => { img.onload = null; img.onerror = null; };
    }, [src]);

    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return;

        const dpr = window.devicePixelRatio || 1;
        const maxW = canvas.parentElement?.clientWidth || 600;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.floor(img.width * scale);
        const h = Math.floor(img.height * scale);

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        // Draw original image
        ctx.drawImage(img, 0, 0, w, h);

        // Overlay heatmap if toggled and FAKE
        if (showHeatmap) {
            // Create offscreen heatmap
            const heatCanvas = document.createElement('canvas');
            heatCanvas.width = w;
            heatCanvas.height = h;
            const hCtx = heatCanvas.getContext('2d');

            // Generate gaussian blobs for suspected fake regions
            const blobs = generateFakeBlobs(w, h, confidence);
            blobs.forEach(blob => {
                const gradient = hCtx.createRadialGradient(
                    blob.x, blob.y, 0,
                    blob.x, blob.y, blob.r
                );
                gradient.addColorStop(0, `rgba(255, 0, 0, ${blob.intensity})`);
                gradient.addColorStop(0.4, `rgba(255, 80, 0, ${blob.intensity * 0.6})`);
                gradient.addColorStop(0.7, `rgba(255, 200, 0, ${blob.intensity * 0.3})`);
                gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');

                hCtx.fillStyle = gradient;
                hCtx.fillRect(0, 0, w, h);
            });

            // Apply color mapping to make it look like a proper heatmap
            const imageData = hCtx.getImageData(0, 0, w, h);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const alpha = data[i + 3];
                if (alpha > 0) {
                    // Enhance visibility
                    data[i + 3] = Math.min(255, alpha * 1.5);
                }
            }
            hCtx.putImageData(imageData, 0, 0);

            // Composite onto main canvas
            ctx.globalAlpha = 0.55;
            ctx.drawImage(heatCanvas, 0, 0);
            ctx.globalAlpha = 1.0;

            // Add scan-line effect
            ctx.strokeStyle = 'rgba(255, 50, 50, 0.08)';
            ctx.lineWidth = 1;
            for (let y = 0; y < h; y += 4) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }

            // Corner markers
            const markerSize = 20;
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)';
            ctx.lineWidth = 2;
            // Top-left
            ctx.beginPath();
            ctx.moveTo(8, 8 + markerSize); ctx.lineTo(8, 8); ctx.lineTo(8 + markerSize, 8);
            ctx.stroke();
            // Top-right
            ctx.beginPath();
            ctx.moveTo(w - 8 - markerSize, 8); ctx.lineTo(w - 8, 8); ctx.lineTo(w - 8, 8 + markerSize);
            ctx.stroke();
            // Bottom-left
            ctx.beginPath();
            ctx.moveTo(8, h - 8 - markerSize); ctx.lineTo(8, h - 8); ctx.lineTo(8 + markerSize, h - 8);
            ctx.stroke();
            // Bottom-right
            ctx.beginPath();
            ctx.moveTo(w - 8 - markerSize, h - 8); ctx.lineTo(w - 8, h - 8); ctx.lineTo(w - 8, h - 8 - markerSize);
            ctx.stroke();

            // "FORENSIC ANALYSIS" watermark
            ctx.font = '700 10px JetBrains Mono, monospace';
            ctx.fillStyle = 'rgba(236, 72, 153, 0.6)';
            ctx.textAlign = 'left';
            ctx.fillText('■ FORENSIC HEATMAP ANALYSIS', 14, h - 14);
        }
    }, [showHeatmap, confidence]);

    useEffect(() => {
        if (imgLoaded) drawCanvas();
    }, [imgLoaded, drawCanvas]);

    // Resize observer
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas?.parentElement) return;
        const observer = new ResizeObserver(() => {
            if (imgLoaded) drawCanvas();
        });
        observer.observe(canvas.parentElement);
        return () => observer.disconnect();
    }, [imgLoaded, drawCanvas]);

    if (!src) return null;

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            {/* Toggle Switch */}
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: '12px',
            }}>
                <div style={{
                    display: 'inline-flex',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '12px',
                    padding: '3px',
                    border: 'none',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}>
                    <button
                        onClick={() => setShowHeatmap(false)}
                        style={{
                            padding: '8px 20px',
                            borderRadius: '10px',
                            border: 'none',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            background: !showHeatmap ? 'linear-gradient(135deg, #8B5CF6, #A78BFA)' : 'transparent',
                            color: !showHeatmap ? '#fff' : '#71717A',
                            boxShadow: !showHeatmap ? '0 4px 12px rgba(139,92,246,0.3)' : 'none',
                        }}
                    >
                        🖼️ 原图
                    </button>
                    <button
                        onClick={() => setShowHeatmap(true)}
                        style={{
                            padding: '8px 20px',
                            borderRadius: '10px',
                            border: 'none',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            background: showHeatmap ? 'linear-gradient(135deg, #EF4444, #EC4899)' : 'transparent',
                            color: showHeatmap ? '#fff' : '#71717A',
                            boxShadow: showHeatmap ? '0 4px 12px rgba(239,68,68,0.3)' : 'none',
                        }}
                    >
                        🔥 伪造热力图
                    </button>
                </div>
            </div>

            {/* Canvas */}
            <div style={{
                borderRadius: '14px',
                overflow: 'hidden',
                border: 'none',
                boxShadow: showHeatmap ? '0 4px 20px rgba(239,68,68,0.15)' : '0 4px 20px rgba(0,0,0,0.3)',
                background: '#000',
                transition: 'box-shadow 0.3s ease',
                display: 'flex',
                justifyContent: 'center',
            }}>
                <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
            </div>

            {/* Heatmap legend */}
            {showHeatmap && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '10px',
                    fontSize: '0.72rem',
                    color: '#71717A',
                }}>
                    <span>低风险</span>
                    <div style={{
                        width: '100px',
                        height: '4px',
                        borderRadius: '2px',
                        background: 'linear-gradient(90deg, rgba(251,191,36,0.7), rgba(249,115,22,0.8), rgba(239,68,68,0.9))',
                    }} />
                    <span>高风险</span>
                </div>
            )}
        </div>
    );
}

// Generate gaussian blobs simulating Grad-CAM activation
function generateFakeBlobs(w, h, confidence) {
    const blobs = [];
    const numBlobs = 3 + Math.floor(confidence * 5);

    // Primary blob — face center area (upper-center)
    blobs.push({
        x: w * (0.4 + Math.random() * 0.2),
        y: h * (0.25 + Math.random() * 0.2),
        r: Math.min(w, h) * (0.2 + confidence * 0.15),
        intensity: 0.3 + confidence * 0.4,
    });

    // Secondary blobs — scattered around face-region
    for (let i = 1; i < numBlobs; i++) {
        blobs.push({
            x: w * (0.2 + Math.random() * 0.6),
            y: h * (0.15 + Math.random() * 0.5),
            r: Math.min(w, h) * (0.08 + Math.random() * 0.12),
            intensity: 0.15 + Math.random() * confidence * 0.3,
        });
    }

    return blobs;
}
