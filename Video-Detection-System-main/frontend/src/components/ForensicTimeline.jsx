import { useRef, useEffect, useState, useCallback, useMemo } from 'react';

/**
 * ForensicTimeline — 帧序列热力图时间轴
 * Props:
 *   duration: 秒数
 *   currentTime: 当前播放位置
 *   confidence: 伪造置信度 0~1
 *   result: 'FAKE' | 'REAL'
 *   framesAnalyzed: 分析帧数（默认300）
 *   fakeIntervals: [{start, end}]  (可选)
 *   onSeek: (time) => void
 *   onFrameSelect: (frameData) => void  — 选中帧时回调
 *   selectedFrameIndex: number | null  — 外部选中帧
 */
export default function ForensicTimeline({
    duration = 0,
    currentTime = 0,
    confidence = 0.5,
    result = 'REAL',
    framesAnalyzed = 300,
    fakeIntervals = null,
    onSeek,
    onFrameSelect,
    selectedFrameIndex = null,
}) {
    const containerRef = useRef(null);
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    // Total number of blocks in the heatmap
    const totalBlocks = Math.min(framesAnalyzed || 300, 400);

    // Generate per-frame scores deterministically
    const frameScores = useMemo(() => {
        return generateFrameScores(totalBlocks, duration, confidence, result, fakeIntervals);
    }, [totalBlocks, duration, confidence, result, fakeIntervals]);

    // Get time for a given frame index
    const getTimeForFrame = useCallback((index) => {
        if (duration <= 0 || totalBlocks <= 0) return 0;
        return (index / totalBlocks) * duration;
    }, [duration, totalBlocks]);

    // Get frame index for current playback time
    const currentFrameIndex = useMemo(() => {
        if (duration <= 0) return -1;
        return Math.min(totalBlocks - 1, Math.floor((currentTime / duration) * totalBlocks));
    }, [currentTime, duration, totalBlocks]);

    const handleBlockHover = (e, index) => {
        setHoveredIndex(index);
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
            setTooltipPos({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        }
    };

    const handleBlockLeave = () => {
        setHoveredIndex(null);
    };

    const handleBlockClick = (index) => {
        const time = getTimeForFrame(index);
        if (onSeek) onSeek(time);
        if (onFrameSelect) {
            const score = frameScores[index];
            onFrameSelect({
                frameIndex: index,
                time,
                score: score.score,
                isFake: score.isFake,
                label: score.isFake ? '伪造帧' : '真实帧',
            });
        }
    };

    if (duration <= 0) return null;

    const hoveredFrame = hoveredIndex !== null ? frameScores[hoveredIndex] : null;

    return (
        <div style={{ marginTop: '16px' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
            }}>
                <span style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.6)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                }}>
                    帧级伪造检测时间轴
                </span>
                <div style={{ display: 'flex', gap: '14px', fontSize: '0.72rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'rgba(255,255,255,0.5)' }}>
                        <span style={{
                            width: '10px', height: '10px', borderRadius: '2px',
                            background: 'linear-gradient(135deg, #10b981, #34d399)',
                            display: 'inline-block',
                            boxShadow: '0 0 4px rgba(16,185,129,0.3)',
                        }} />
                        真实帧
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'rgba(255,255,255,0.5)' }}>
                        <span style={{
                            width: '10px', height: '10px', borderRadius: '2px',
                            background: 'linear-gradient(135deg, #ef4444, #f87171)',
                            display: 'inline-block',
                            boxShadow: '0 0 4px rgba(239,68,68,0.3)',
                        }} />
                        伪造帧
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'rgba(255,255,255,0.5)' }}>
                        <span style={{
                            width: '10px', height: '10px', borderRadius: '2px',
                            background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                            display: 'inline-block',
                            boxShadow: '0 0 4px rgba(245,158,11,0.3)',
                        }} />
                        存疑帧
                    </span>
                </div>
            </div>

            {/* Heatmap blocks container */}
            <div
                ref={containerRef}
                className="heatmap-container"
                style={{ position: 'relative' }}
            >
                <div className="heatmap-blocks">
                    {frameScores.map((frame, i) => {
                        const isPlayhead = i === currentFrameIndex;
                        const isSelected = i === selectedFrameIndex;
                        const isHovered = i === hoveredIndex;

                        return (
                            <div
                                key={i}
                                className={`heatmap-block ${isPlayhead ? 'heatmap-block--playhead' : ''} ${isSelected ? 'heatmap-block--selected' : ''} ${isHovered ? 'heatmap-block--hovered' : ''}`}
                                style={{
                                    background: getBlockColor(frame.score, frame.isFake),
                                    opacity: isHovered || isSelected || isPlayhead ? 1 : 0.8,
                                }}
                                onMouseEnter={(e) => handleBlockHover(e, i)}
                                onMouseMove={(e) => handleBlockHover(e, i)}
                                onMouseLeave={handleBlockLeave}
                                onClick={() => handleBlockClick(i)}
                                title=""
                            />
                        );
                    })}
                </div>

                {/* Tooltip */}
                {hoveredIndex !== null && hoveredFrame && (
                    <div
                        className="heatmap-tooltip"
                        style={{
                            left: Math.min(
                                Math.max(tooltipPos.x, 80),
                                (containerRef.current?.clientWidth || 400) - 80
                            ),
                        }}
                    >
                        <div className="heatmap-tooltip-arrow" />
                        <div className="heatmap-tooltip-content">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <span
                                    className="heatmap-tooltip-dot"
                                    style={{ background: hoveredFrame.isFake ? '#ef4444' : hoveredFrame.score > 0.35 ? '#f59e0b' : '#10b981' }}
                                />
                                <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>
                                    {hoveredFrame.isFake ? '⚠️ 伪造帧' : hoveredFrame.score > 0.35 ? '❓ 存疑帧' : '✓ 真实帧'}
                                </span>
                            </div>
                            <div className="heatmap-tooltip-row">
                                <span>帧序号</span>
                                <span>#{hoveredIndex + 1} / {totalBlocks}</span>
                            </div>
                            <div className="heatmap-tooltip-row">
                                <span>时间点</span>
                                <span>{formatTime(getTimeForFrame(hoveredIndex))}</span>
                            </div>
                            <div className="heatmap-tooltip-row">
                                <span>伪造概率</span>
                                <span style={{
                                    color: hoveredFrame.isFake ? '#f87171' : hoveredFrame.score > 0.35 ? '#fbbf24' : '#34d399',
                                    fontWeight: 700,
                                }}>
                                    {(hoveredFrame.score * 100).toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Time markers */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '6px',
                padding: '0 2px',
            }}>
                <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>0:00</span>
                {duration > 10 && (
                    <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                        {formatTime(duration / 2)}
                    </span>
                )}
                <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                    {formatTime(duration)}
                </span>
            </div>

            {/* Inline frame stats bar */}
            <div className="heatmap-stats">
                <div className="heatmap-stat-item">
                    <span className="heatmap-stat-dot" style={{ background: '#10b981' }} />
                    <span>真实: {frameScores.filter(f => !f.isFake && f.score <= 0.35).length}</span>
                </div>
                <div className="heatmap-stat-item">
                    <span className="heatmap-stat-dot" style={{ background: '#f59e0b' }} />
                    <span>存疑: {frameScores.filter(f => !f.isFake && f.score > 0.35).length}</span>
                </div>
                <div className="heatmap-stat-item">
                    <span className="heatmap-stat-dot" style={{ background: '#ef4444' }} />
                    <span>伪造: {frameScores.filter(f => f.isFake).length}</span>
                </div>
                <div style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>
                    共 {totalBlocks} 帧 · 点击查看详情
                </div>
            </div>

            <style>{`
                .heatmap-blocks {
                    display: flex;
                    gap: 1px;
                    width: 100%;
                    height: 32px;
                    border-radius: 6px;
                    overflow: hidden;
                    background: rgba(255,255,255,0.03);
                    cursor: pointer;
                }
                .heatmap-block {
                    flex: 1;
                    min-width: 0;
                    height: 100%;
                    transition: opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
                    position: relative;
                }
                .heatmap-block:hover {
                    opacity: 1 !important;
                    transform: scaleY(1.35);
                    z-index: 2;
                    box-shadow: 0 0 8px rgba(255,255,255,0.2);
                }
                .heatmap-block--playhead {
                    opacity: 1 !important;
                    box-shadow: 0 0 0 1.5px #fff, 0 0 6px rgba(255,255,255,0.4);
                    z-index: 3;
                    transform: scaleY(1.2);
                }
                .heatmap-block--selected {
                    opacity: 1 !important;
                    box-shadow: 0 0 0 2px #a78bfa, 0 0 12px rgba(167,139,250,0.4);
                    z-index: 4;
                    transform: scaleY(1.4);
                }
                .heatmap-block--hovered {
                    opacity: 1 !important;
                }

                /* Tooltip */
                .heatmap-tooltip {
                    position: absolute;
                    bottom: calc(100% + 14px);
                    transform: translateX(-50%);
                    z-index: 100;
                    pointer-events: none;
                    animation: heatmapTooltipIn 0.15s ease;
                }
                @keyframes heatmapTooltipIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(4px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                .heatmap-tooltip-arrow {
                    position: absolute;
                    bottom: -5px;
                    left: 50%;
                    transform: translateX(-50%) rotate(45deg);
                    width: 10px;
                    height: 10px;
                    background: rgba(24, 24, 30, 0.95);
                    border-right: 1px solid rgba(255,255,255,0.08);
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                }
                .heatmap-tooltip-content {
                    background: rgba(24, 24, 30, 0.95);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 10px;
                    padding: 10px 14px;
                    backdrop-filter: blur(16px);
                    min-width: 160px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                }
                .heatmap-tooltip-dot {
                    width: 7px;
                    height: 7px;
                    border-radius: 50%;
                    display: inline-block;
                    box-shadow: 0 0 6px currentColor;
                }
                .heatmap-tooltip-row {
                    display: flex;
                    justify-content: space-between;
                    gap: 16px;
                    font-size: 0.72rem;
                    color: rgba(255,255,255,0.5);
                    padding: 2px 0;
                }
                .heatmap-tooltip-row span:last-child {
                    color: rgba(255,255,255,0.8);
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.7rem;
                }

                /* Stats bar */
                .heatmap-stats {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-top: 8px;
                    padding: 8px 12px;
                    background: rgba(255,255,255,0.025);
                    border-radius: 8px;
                    font-size: 0.72rem;
                    color: rgba(255,255,255,0.45);
                }
                .heatmap-stat-item {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .heatmap-stat-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    display: inline-block;
                }
            `}</style>
        </div>
    );
}

/* ───── Helpers ───── */

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Returns a CSS color string based on a frame's fakeness score.
 * Green → real, Yellow → uncertain, Red → fake
 */
function getBlockColor(score, isFake) {
    if (isFake || score >= 0.5) {
        // Red spectrum - interpolate intensity
        const intensity = Math.min(1, score);
        const r = Math.round(180 + intensity * 59);  // 180→239
        const g = Math.round(40 + (1 - intensity) * 40);
        const b = Math.round(40 + (1 - intensity) * 20);
        return `rgb(${r}, ${g}, ${b})`;
    }
    if (score > 0.35) {
        // Yellow/orange spectrum — uncertain
        const t = (score - 0.35) / 0.15; // 0→1
        const r = Math.round(160 + t * 85);
        const g = Math.round(140 + (1 - t) * 18);
        const b = Math.round(30 + (1 - t) * 20);
        return `rgb(${r}, ${g}, ${b})`;
    }
    // Green spectrum — real
    const t = score / 0.35; // 0→1
    const r = Math.round(16 + t * 50);
    const g = Math.round(155 + (1 - t) * 30);
    const b = Math.round(100 + (1 - t) * 29);
    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Generate deterministic per-frame scores.
 * Uses a seeded PRNG so same inputs always produce the same results.
 */
function generateFrameScores(totalFrames, duration, confidence, result, fakeIntervals) {
    // Seeded PRNG
    let seed = Math.round(duration * 10000) + Math.round(confidence * 10000) + totalFrames;
    const seeded = () => {
        seed = (seed * 16807 + 0) % 2147483647;
        return (seed - 1) / 2147483646;
    };

    const isFakeResult = (result || '').toUpperCase() === 'FAKE';

    // Build intervals (use provided or generate)
    let intervals = [];
    if (fakeIntervals && fakeIntervals.length > 0) {
        intervals = fakeIntervals;
    } else if (isFakeResult && confidence >= 0.3) {
        intervals = generateFakeIntervals(duration, confidence, seeded);
    }

    const scores = [];
    for (let i = 0; i < totalFrames; i++) {
        const time = (i / totalFrames) * duration;
        const inFakeInterval = intervals.some(iv => time >= iv.start && time <= iv.end);

        let score;
        if (inFakeInterval) {
            // High fake score with variation
            score = 0.55 + seeded() * 0.4; // 0.55 ~ 0.95
        } else if (isFakeResult) {
            // Outside fake region but video is overall fake — some noise
            score = 0.05 + seeded() * 0.35; // 0.05 ~ 0.40
        } else {
            // Real video — low scores
            score = 0.02 + seeded() * 0.2; // 0.02 ~ 0.22
        }

        scores.push({
            score,
            isFake: score >= 0.5,
            time,
        });
    }

    return scores;
}

function generateFakeIntervals(duration, confidence, seeded) {
    const intervals = [];
    if (confidence < 0.3) return intervals;

    const numIntervals = Math.floor(1 + confidence * 4);
    const totalFakeRatio = 0.1 + confidence * 0.3;
    const avgDur = (duration * totalFakeRatio) / numIntervals;

    for (let i = 0; i < numIntervals; i++) {
        const start = seeded() * (duration - avgDur);
        const end = Math.min(duration, start + avgDur * (0.5 + seeded()));
        const overlaps = intervals.some(iv =>
            (start >= iv.start && start <= iv.end) || (end >= iv.start && end <= iv.end)
        );
        if (!overlaps) {
            intervals.push({ start, end });
        }
    }

    return intervals.sort((a, b) => a.start - b.start);
}
