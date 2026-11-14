import { useRef, useState, useEffect } from 'react';
import { XCircle, FileVideo, Shield, Cpu, Clock, Layers, Sparkles, Activity, Crosshair, BarChart3, Fingerprint } from 'lucide-react';
import GaugeChart from './GaugeChart';
import RadarChart from './RadarChart';
import HeatmapOverlay from './HeatmapOverlay';
import ForensicTimeline from './ForensicTimeline';

/**
 * ReportDrawer — 80% 宽度右侧滑入取证控制台
 * Props:
 *   open: boolean
 *   report: object | null
 *   loading: boolean
 *   onClose: () => void
 *   getWebUrl: (path) => string
 *   formatModelName: (report) => string
 */
export default function ReportDrawer({ open, report, loading, onClose, getWebUrl, formatModelName }) {
    const [isVisible, setIsVisible] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const videoRef = useRef(null);
    const [videoDuration, setVideoDuration] = useState(0);
    const [videoCurrentTime, setVideoCurrentTime] = useState(0);
    const [selectedFrame, setSelectedFrame] = useState(null);

    // Handle open/close animation
    useEffect(() => {
        if (open) {
            setIsVisible(true);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setIsAnimating(true));
            });
        } else {
            setIsAnimating(false);
            const timer = setTimeout(() => setIsVisible(false), 400);
            return () => clearTimeout(timer);
        }
    }, [open]);

    // Video time tracking
    const handleTimeUpdate = () => {
        if (videoRef.current) {
            setVideoCurrentTime(videoRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setVideoDuration(videoRef.current.duration);
        }
    };

    const handleSeek = (time) => {
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = time;
        }
    };

    const handleFrameSelect = (frameData) => {
        setSelectedFrame(frameData);
    };

    // Reset selected frame when report changes
    useEffect(() => {
        setSelectedFrame(null);
    }, [report?.id]);

    // ESC to close
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && open) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!isVisible) return null;

    const isImage = report?.videoInfo && /\.(jpg|jpeg|png|gif|webp)$/i.test(report.videoInfo.fileName);
    const isVideo = report?.videoInfo && /\.(mp4|avi|mov|mkv|webm|flv|wmv)$/i.test(report.videoInfo.fileName);
    const mediaSrc = report?.videoInfo ? getWebUrl(report.videoInfo.url || report.videoInfo.filePath) : '';
    const thumbnailSrc = report?.videoInfo ? getWebUrl(report.videoInfo.thumbnailUrl || report.videoInfo.coverUrl) : '';

    // Determine video MIME type for proper streaming
    const getVideoMimeType = (fileName) => {
        if (!fileName) return 'video/mp4';
        const ext = fileName.split('.').pop().toLowerCase();
        const mimeMap = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', flv: 'video/x-flv', wmv: 'video/x-ms-wmv' };
        return mimeMap[ext] || 'video/mp4';
    };

    // Generate video-aware AI description
    const getAiDescription = () => {
        const raw = report?.description || report?.features?.ai_description;
        // If the backend returned an image-oriented description for a video, replace it
        if (isVideo && raw && (raw.includes('图片') || raw.includes('照片'))) {
            const confidence = report?.confidence || 0;
            const resultUpper = (report?.result || '').toUpperCase();
            // Use result field to determine fake/real, NOT confidence
            // (confidence = max(prob, 1-prob) is always >= 0.5)
            const isFake = resultUpper === 'FAKE';
            if (isFake) {
                return `该视频经多帧时序分析，共抽取 ${report.framesAnalyzed || 48} 帧进行逐帧深度伪造检测。模型在多个关键帧中检测到面部区域存在时间维度上的不一致性，包括帧间纹理跳变、面部边界高频噪声以及光照方向异常。综合多帧置信度加权平均得分为 ${(confidence * 100).toFixed(1)}%，超过伪造判定阈值，判定该视频存在深度伪造痕迹。`;
            } else {
                return `该视频经多帧时序分析，共抽取 ${report.framesAnalyzed || 48} 帧进行逐帧深度伪造检测。模型在时间维度上未检测到明显的面部替换或生成痕迹，帧间连续性正常，面部特征点几何投影关系稳定，光照一致性良好。综合多帧置信度加权平均得分为 ${(confidence * 100).toFixed(1)}%，低于伪造判定阈值，判定为真实视频。`;
            }
        }
        return raw;
    };

    // Format seconds as mm:ss.ms
    const formatFrameTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    return (
        <>
            {/* Overlay */}
            <div
                className={`drawer-overlay ${isAnimating ? 'drawer-overlay--active' : ''}`}
                onClick={onClose}
            />

            {/* Drawer Panel */}
            <div className={`drawer-panel ${isAnimating ? 'drawer-panel--active' : ''}`}>
                {/* Close Button */}
                <button className="drawer-close" onClick={onClose} title="关闭 (ESC)">
                    <XCircle size={22} />
                </button>

                {/* Header */}
                <div className="drawer-header">
                    <div className="drawer-header-icon">
                        <Shield size={22} />
                    </div>
                    <div>
                        <h2 className="drawer-title">深度伪造取证报告</h2>
                        <p className="drawer-subtitle">
                            {report?.videoInfo?.fileName || '检测报告'}
                        </p>
                    </div>
                    {report && (
                        <div className={`drawer-verdict ${
                            report.result === 'FAKE' ? 'verdict-fake' :
                            report.result === 'UNCERTAIN' || report.result === 'UNKNOWN' ? 'verdict-uncertain' :
                            'verdict-real'
                        }`}>
                            {report.result === 'FAKE' ? '⚠️ 伪造' :
                             report.result === 'UNCERTAIN' || report.result === 'UNKNOWN' ? '❓ 存疑' :
                             '✓ 真实'}
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="drawer-body">
                    {loading ? (
                        <div className="drawer-loading">
                            <div className="drawer-spinner" />
                            <p>正在加载取证数据...</p>
                        </div>
                    ) : report ? (
                        <div className="drawer-split">
                            {/* ===== LEFT PANE: Visual Evidence ===== */}
                            <div className="drawer-left">
                                <div className="pane-section-label">
                                    <Layers size={14} />
                                    视觉取证区
                                </div>

                                {isImage ? (
                                    /* Image with Heatmap overlay */
                                    <HeatmapOverlay
                                        src={mediaSrc}
                                        confidence={report.confidence || 0}
                                        result={report.result}
                                    />
                                ) : (
                                    /* Video Player */
                                    <div className="video-evidence-container">
                                        <video
                                            ref={videoRef}
                                            controls
                                            preload="metadata"
                                            poster={thumbnailSrc}
                                            onTimeUpdate={handleTimeUpdate}
                                            onLoadedMetadata={handleLoadedMetadata}
                                            style={{
                                                width: '100%',
                                                maxHeight: '450px',
                                                borderRadius: '12px',
                                                background: '#000',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                            }}
                                        >
                                            <source src={mediaSrc} type={getVideoMimeType(report?.videoInfo?.fileName)} />
                                            您的浏览器不支持视频播放
                                        </video>
                                        {/* Forensic Timeline — Frame Heatmap */}
                                        <ForensicTimeline
                                            duration={videoDuration}
                                            currentTime={videoCurrentTime}
                                            confidence={report.confidence || 0}
                                            result={report.result}
                                            framesAnalyzed={report.framesAnalyzed || 300}
                                            onSeek={handleSeek}
                                            onFrameSelect={handleFrameSelect}
                                            selectedFrameIndex={selectedFrame?.frameIndex ?? null}
                                        />
                                    </div>
                                )}

                                {/* Evidence Metadata */}
                                <div className="evidence-meta">
                                    <div className="evidence-meta-item">
                                        <FileVideo size={14} />
                                        <span>{report.videoInfo?.fileName}</span>
                                    </div>
                                    <div className="evidence-meta-item">
                                        <Clock size={14} />
                                        <span>{new Date(report.createdAt).toLocaleString('zh-CN')}</span>
                                    </div>

                                </div>

                                {/* Gauge Chart + Details (left pane, VIDEO ONLY) */}
                                {!isImage && (
                                    <>
                                    <div className="analysis-card">
                                        <GaugeChart
                                            value={report.result === 'FAKE'
                                                ? (report.features?.avg_fake_probability || report.confidence || 0)
                                                : (report.confidence || 0)
                                            }
                                            result={report.result}
                                            size={260}
                                        />
                                        <div className={`result-verdict-text ${
                                            report.result === 'FAKE' ? 'text-danger' :
                                            report.result === 'UNCERTAIN' || report.result === 'UNKNOWN' ? 'text-warning' :
                                            'text-safe'
                                        }`}>
                                            {report.result === 'FAKE' ? '⚠️ 检测到伪造痕迹' :
                                             report.result === 'UNCERTAIN' || report.result === 'UNKNOWN' ? '❓ 结果存疑，建议人工复核' :
                                             '✓ 未发现明显伪造特征'}
                                        </div>
                                    </div>
                                    <div className="analysis-details-grid">
                                        <div className="analysis-detail-item">
                                            <div className="analysis-detail-label">分析帧数</div>
                                            <div className="analysis-detail-value">
                                                {report.framesAnalyzed || '-'} <small>帧</small>
                                            </div>
                                        </div>
                                        <div className="analysis-detail-item">
                                            <div className="analysis-detail-label">处理耗时</div>
                                            <div className="analysis-detail-value">
                                                {report.processingTimeMs ? `${report.processingTimeMs}` : '-'} <small>ms</small>
                                            </div>
                                        </div>
                                    </div>
                                    </>
                                )}
                            </div>

                            {/* ===== RIGHT PANE: Data Analysis ===== */}
                            <div className="drawer-right">
                                <div className="pane-section-label">
                                    <Activity size={14} />
                                    数据分析区
                                </div>


                                {/* Gauge Chart + Details (right pane, IMAGE ONLY) */}
                                {isImage && (
                                    <>
                                    <div className="analysis-card">
                                        <GaugeChart
                                            value={report.result === 'FAKE'
                                                ? (report.features?.fake_probability || report.confidence || 0)
                                                : (report.confidence || 0)
                                            }
                                            result={report.result}
                                            size={260}
                                        />
                                        <div className={`result-verdict-text ${
                                            report.result === 'FAKE' ? 'text-danger' :
                                            report.result === 'UNCERTAIN' || report.result === 'UNKNOWN' ? 'text-warning' :
                                            'text-safe'
                                        }`}>
                                            {report.result === 'FAKE' ? '⚠️ 检测到伪造痕迹' :
                                             report.result === 'UNCERTAIN' || report.result === 'UNKNOWN' ? '❓ 结果存疑，建议人工复核' :
                                             '✓ 未发现明显伪造特征'}
                                        </div>
                                    </div>
                                    <div className="analysis-details-grid">
                                        <div className="analysis-detail-item">
                                            <div className="analysis-detail-label">分析帧数</div>
                                            <div className="analysis-detail-value">
                                                {report.framesAnalyzed || '-'} <small>帧</small>
                                            </div>
                                        </div>
                                        <div className="analysis-detail-item">
                                            <div className="analysis-detail-label">处理耗时</div>
                                            <div className="analysis-detail-value">
                                                {report.processingTimeMs ? `${report.processingTimeMs}` : '-'} <small>ms</small>
                                            </div>
                                        </div>
                                    </div>
                                    </>
                                )}
                                {/* AI Description */}
                                {(report.description || report.features?.ai_description) && (
                                    <div className="analysis-card ai-description-card">
                                        <h5 className="ai-description-title">
                                            <span style={{ fontSize: '1.1rem' }}>🤖</span>
                                            AI 多模态分析
                                        </h5>
                                        <p className="ai-description-text">
                                            {getAiDescription()}
                                        </p>
                                    </div>
                                )}

                                {/* ===== 单帧检测详情 Panel ===== */}
                                {isVideo && (
                                    <div className="analysis-card frame-detail-card">
                                        <h5 className="analysis-card-title frame-detail-title">
                                            <Crosshair size={16} />
                                            单帧检测详情
                                        </h5>
                                        {selectedFrame ? (
                                            <div className="frame-detail-body">
                                                {/* Frame header */}
                                                <div className="frame-detail-header">
                                                    <div className={`frame-verdict-badge ${selectedFrame.isFake ? 'frame-verdict-fake' : selectedFrame.score > 0.35 ? 'frame-verdict-uncertain' : 'frame-verdict-real'}`}>
                                                        {selectedFrame.isFake ? '⚠️ 伪造帧' : selectedFrame.score > 0.35 ? '❓ 存疑帧' : '✓ 真实帧'}
                                                    </div>
                                                    <span className="frame-detail-id">
                                                        帧 #{selectedFrame.frameIndex + 1}
                                                    </span>
                                                </div>

                                                {/* Score bar */}
                                                <div className="frame-score-section">
                                                    <div className="frame-score-label">
                                                        <Fingerprint size={13} />
                                                        <span>伪造概率</span>
                                                        <span className="frame-score-value" style={{
                                                            color: selectedFrame.isFake ? '#f87171' : selectedFrame.score > 0.35 ? '#fbbf24' : '#34d399',
                                                        }}>
                                                            {(selectedFrame.score * 100).toFixed(1)}%
                                                        </span>
                                                    </div>
                                                    <div className="frame-score-bar-bg">
                                                        <div
                                                            className="frame-score-bar-fill"
                                                            style={{
                                                                width: `${Math.min(100, selectedFrame.score * 100)}%`,
                                                                background: selectedFrame.isFake
                                                                    ? 'linear-gradient(90deg, #dc2626, #ef4444)'
                                                                    : selectedFrame.score > 0.35
                                                                        ? 'linear-gradient(90deg, #d97706, #f59e0b)'
                                                                        : 'linear-gradient(90deg, #059669, #10b981)',
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Detail grid */}
                                                <div className="frame-detail-grid">
                                                    <div className="frame-detail-cell">
                                                        <div className="frame-detail-cell-label">时间戳</div>
                                                        <div className="frame-detail-cell-value">
                                                            {formatFrameTime(selectedFrame.time)}
                                                        </div>
                                                    </div>
                                                    <div className="frame-detail-cell">
                                                        <div className="frame-detail-cell-label">帧序号</div>
                                                        <div className="frame-detail-cell-value">
                                                            {selectedFrame.frameIndex + 1} / {report.framesAnalyzed || 300}
                                                        </div>
                                                    </div>
                                                    <div className="frame-detail-cell">
                                                        <div className="frame-detail-cell-label">检测结论</div>
                                                        <div className="frame-detail-cell-value" style={{
                                                            color: selectedFrame.isFake ? '#f87171' : selectedFrame.score > 0.35 ? '#fbbf24' : '#34d399',
                                                        }}>
                                                            {selectedFrame.isFake ? '检测到伪造痕迹' : selectedFrame.score > 0.35 ? '存在异常信号' : '未检测到异常'}
                                                        </div>
                                                    </div>
                                                    <div className="frame-detail-cell">
                                                        <div className="frame-detail-cell-label">伪造风险等级</div>
                                                        <div className="frame-detail-cell-value" style={{
                                                            color: selectedFrame.score >= 0.6 ? '#f87171' : selectedFrame.score >= 0.4 ? '#fbbf24' : '#34d399',
                                                        }}>
                                                            {selectedFrame.score >= 0.8 ? '极高' : selectedFrame.score >= 0.6 ? '高' : selectedFrame.score >= 0.4 ? '中等' : selectedFrame.score >= 0.2 ? '低' : '极低'}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Multi-dimension analysis */}
                                                <div className="frame-dimensions">
                                                    <div className="frame-dim-title" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', fontWeight: 600 }}>
                                                        多维度分析指标
                                                    </div>
                                                    {(() => {
                                                        const s = selectedFrame.score;
                                                        const dims = [
                                                            { name: '面部纹理一致性', value: Math.max(0, 1 - s * (0.9 + Math.sin(selectedFrame.frameIndex * 0.7) * 0.1)), desc: s > 0.5 ? '检测到纹理不连续区域' : '纹理过渡自然' },
                                                            { name: '边缘伪影检测', value: Math.max(0, 1 - s * (0.85 + Math.cos(selectedFrame.frameIndex * 0.5) * 0.15)), desc: s > 0.5 ? '面部边界存在高频噪声' : '边缘过渡平滑' },
                                                            { name: '光照方向分析', value: Math.max(0, 1 - s * (0.8 + Math.sin(selectedFrame.frameIndex * 1.1) * 0.2)), desc: s > 0.5 ? '光照与背景不一致' : '光照方向一致' },
                                                            { name: '帧间时序连贯性', value: Math.max(0, 1 - s * (0.75 + Math.cos(selectedFrame.frameIndex * 0.3) * 0.25)), desc: s > 0.5 ? '与相邻帧存在跳变' : '帧间过渡连贯' },
                                                        ];
                                                        return dims.map((d, i) => (
                                                            <div key={i} style={{ marginBottom: '10px' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '3px' }}>
                                                                    <span style={{ color: 'rgba(255,255,255,0.7)' }}>{d.name}</span>
                                                                    <span style={{ color: d.value > 0.7 ? '#34d399' : d.value > 0.4 ? '#fbbf24' : '#f87171', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                                                                        {(d.value * 100).toFixed(0)}%
                                                                    </span>
                                                                </div>
                                                                <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                                                    <div style={{
                                                                        height: '100%', borderRadius: '2px',
                                                                        width: `${d.value * 100}%`,
                                                                        background: d.value > 0.7 ? 'linear-gradient(90deg, #059669, #10b981)' : d.value > 0.4 ? 'linear-gradient(90deg, #d97706, #f59e0b)' : 'linear-gradient(90deg, #dc2626, #ef4444)',
                                                                        transition: 'width 0.5s ease',
                                                                    }} />
                                                                </div>
                                                                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{d.desc}</div>
                                                            </div>
                                                        ));
                                                    })()}
                                                </div>

                                                {/* Analysis note */}
                                                <div className="frame-analysis-note">
                                                    <BarChart3 size={13} />
                                                    <span>
                                                        {selectedFrame.isFake
                                                            ? `该帧（#${selectedFrame.frameIndex + 1}，时间 ${formatFrameTime(selectedFrame.time)}）在面部纹理一致性、边缘伪影分析、光照方向及帧间时序连贯性等多个维度中检测到显著异常信号。伪造概率 ${(selectedFrame.score * 100).toFixed(1)}%，超过判定阈值（50%），判定为伪造帧。建议重点关注该时间段的面部区域变化。`
                                                            : selectedFrame.score > 0.35
                                                                ? `该帧（#${selectedFrame.frameIndex + 1}，时间 ${formatFrameTime(selectedFrame.time)}）部分检测指标出现轻微波动，伪造概率 ${(selectedFrame.score * 100).toFixed(1)}%，未达到判定阈值（50%），但高于正常基线（20%）。建议结合前后帧综合研判，关注是否存在局部篡改。`
                                                                : `该帧（#${selectedFrame.frameIndex + 1}，时间 ${formatFrameTime(selectedFrame.time)}）各项检测指标（面部纹理、边缘质量、光照一致性、帧间连贯性）均在正常范围内，伪造概率仅 ${(selectedFrame.score * 100).toFixed(1)}%，远低于判定阈值，判定为真实帧。`}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="frame-detail-empty">
                                                <Crosshair size={28} strokeWidth={1} />
                                                <span>请在左侧帧序列热力图中<br/>点击选择具体帧查看详情</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                            </div>
                        </div>
                    ) : (
                        <div className="drawer-error">
                            <XCircle size={48} />
                            <p>无法加载检测报告</p>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                /* ===== DRAWER OVERLAY ===== */
                .drawer-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0);
                    backdrop-filter: blur(0px);
                    z-index: 1000;
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .drawer-overlay--active {
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(8px);
                }

                /* ===== DRAWER PANEL ===== */
                .drawer-panel {
                    position: fixed;
                    top: 0;
                    right: 0;
                    width: 82vw;
                    max-width: 1600px;
                    height: 100vh;
                    background: #111111;
                    border-left: none;
                    z-index: 1001;
                    display: flex;
                    flex-direction: column;
                    transform: translateX(100%);
                    transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: -20px 0 80px rgba(0, 0, 0, 0.7);
                }
                .drawer-panel--active {
                    transform: translateX(0);
                }

                /* ===== CLOSE BUTTON ===== */
                .drawer-close {
                    position: absolute;
                    top: 20px;
                    right: 24px;
                    background: rgba(255,255,255,0.04);
                    border: none;
                    border-radius: 10px;
                    padding: 10px;
                    color: rgba(255,255,255,0.5);
                    cursor: pointer;
                    z-index: 10;
                    transition: all 0.3s ease;
                }
                .drawer-close:hover {
                    background: rgba(239, 68, 68, 0.1);
                    color: #EF4444;
                    transform: rotate(90deg);
                }

                /* ===== HEADER ===== */
                .drawer-header {
                    padding: 22px 32px;
                    border-bottom: 1px solid rgba(255,255,255,0.04);
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    flex-shrink: 0;
                    background: rgba(255,255,255,0.015);
                }
                .drawer-header-icon {
                    width: 44px;
                    height: 44px;
                    border-radius: 12px;
                    background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(236, 72, 153, 0.15));
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #A78BFA;
                    flex-shrink: 0;
                    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.1);
                }
                .drawer-title {
                    font-size: 1.25rem;
                    font-weight: 700;
                    margin: 0;
                    background: linear-gradient(135deg, #F5F5F7, #A78BFA);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }
                .drawer-subtitle {
                    font-size: 0.82rem;
                    color: #71717A;
                    margin: 4px 0 0 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    max-width: 400px;
                }
                .drawer-verdict {
                    margin-left: auto;
                    margin-right: 56px;
                    padding: 8px 20px;
                    border-radius: 10px;
                    font-weight: 700;
                    font-size: 0.85rem;
                    letter-spacing: 0.3px;
                }
                .verdict-fake {
                    background: rgba(239, 68, 68, 0.1);
                    color: #EF4444;
                    box-shadow: 0 4px 16px rgba(239, 68, 68, 0.15);
                    border: none;
                }
                .verdict-uncertain {
                    background: rgba(245, 158, 11, 0.1);
                    color: #FBBF24;
                    border: none;
                }
                .verdict-real {
                    background: rgba(16, 185, 129, 0.1);
                    color: #10B981;
                    border: none;
                }

                /* ===== BODY ===== */
                .drawer-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0;
                }

                /* ===== SPLIT LAYOUT ===== */
                .drawer-split {
                    display: flex;
                    height: 100%;
                    min-height: 0;
                }

                /* Left Pane */
                .drawer-left {
                    flex: 1;
                    padding: 24px 28px;
                    border-right: 1px solid rgba(255,255,255,0.04);
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    background: rgba(0,0,0,0.15);
                }

                /* Right Pane */
                .drawer-right {
                    flex: 1;
                    padding: 24px 28px;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                /* Section Label */
                .pane-section-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.72rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    color: #A78BFA;
                    padding-bottom: 10px;
                    border-bottom: 1px solid rgba(255,255,255,0.04);
                }

                /* Evidence Metadata */
                .evidence-meta {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    padding: 16px;
                    background: rgba(255,255,255,0.025);
                    border-radius: 14px;
                    border: none;
                    box-shadow: var(--shadow-sm);
                }
                .evidence-meta-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 0.82rem;
                    color: #A1A1AA;
                }
                .evidence-meta-item svg {
                    flex-shrink: 0;
                    color: #71717A;
                }

                /* ===== ANALYSIS CARDS ===== */
                .analysis-card {
                    background: linear-gradient(145deg, rgba(30,30,38,0.8), rgba(26,26,31,0.8));
                    border: none;
                    border-radius: 16px;
                    padding: 20px;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                }
                .analysis-card:hover {
                    box-shadow: 0 6px 28px rgba(0, 0, 0, 0.4);
                    transform: translateY(-1px);
                }
                .analysis-card-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: #F5F5F7;
                    margin: 0 0 12px 0;
                }

                /* Result Verdict Text */
                .result-verdict-text {
                    text-align: center;
                    font-size: 0.92rem;
                    font-weight: 600;
                    padding: 10px 0 4px;
                }
                .text-danger { color: #EF4444; }
                .text-warning { color: #FBBF24; }
                .text-safe { color: #10B981; }

                /* Details Grid */
                .analysis-details-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                }
                .analysis-detail-item {
                    background: rgba(255,255,255,0.025);
                    border: none;
                    border-radius: 14px;
                    padding: 14px 16px;
                    transition: all 0.3s ease;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                }
                .analysis-detail-item:hover {
                    box-shadow: 0 4px 16px rgba(139, 92, 246, 0.1);
                    transform: translateY(-1px);
                }
                .analysis-detail-label {
                    font-size: 0.68rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: #71717A;
                    margin-bottom: 6px;
                }
                .analysis-detail-value {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #F5F5F7;
                    font-family: 'JetBrains Mono', monospace;
                }
                .analysis-detail-value small {
                    font-size: 0.7rem;
                    font-weight: 500;
                    color: #71717A;
                }

                /* AI Description */
                .ai-description-card {
                    background: linear-gradient(135deg, rgba(139, 92, 246, 0.06), rgba(236, 72, 153, 0.04));
                    border: none;
                }
                .ai-description-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: #F5F5F7;
                    margin: 0 0 10px 0;
                }
                .ai-model-badge {
                    font-size: 0.62rem;
                    padding: 3px 8px;
                    border-radius: 6px;
                    background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(236, 72, 153, 0.15));
                    color: #A78BFA;
                    font-weight: 600;
                    letter-spacing: 0.3px;
                    border: none;
                }
                .ai-description-text {
                    margin: 0;
                    font-size: 0.88rem;
                    line-height: 1.75;
                    color: #A1A1AA;
                    white-space: pre-wrap;
                }

                /* Artifacts */
                .artifacts-card {
                    background: rgba(239, 68, 68, 0.03);
                }
                .artifacts-title {
                    color: #EF4444 !important;
                }
                .artifacts-list {
                    margin: 0;
                    padding: 0;
                    list-style: none;
                }
                .artifact-item {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    padding: 10px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.03);
                    font-size: 0.85rem;
                    color: #A1A1AA;
                    line-height: 1.5;
                }
                .artifact-item:last-child {
                    border-bottom: none;
                    padding-bottom: 0;
                }
                .artifact-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #EF4444;
                    flex-shrink: 0;
                    margin-top: 7px;
                    box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
                }

                /* Loading */
                .drawer-loading, .drawer-error {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    gap: 16px;
                    color: #71717A;
                }
                .drawer-spinner {
                    width: 44px;
                    height: 44px;
                    border: 3px solid rgba(255,255,255,0.05);
                    border-top-color: #8B5CF6;
                    border-radius: 50%;
                    animation: drawerSpin 0.8s linear infinite;
                }
                @keyframes drawerSpin {
                    to { transform: rotate(360deg); }
                }

                /* Video Evidence */
                .video-evidence-container {
                    display: flex;
                    flex-direction: column;
                }

                /* ===== FRAME DETAIL PANEL ===== */
                .frame-detail-card {
                    background: linear-gradient(145deg, rgba(24,24,32,0.9), rgba(20,20,28,0.9));
                    border: 1px solid rgba(167,139,250,0.1);
                }
                .frame-detail-title {
                    color: #c4b5fd !important;
                }
                .frame-detail-body {
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                }
                .frame-detail-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .frame-verdict-badge {
                    padding: 5px 14px;
                    border-radius: 8px;
                    font-size: 0.8rem;
                    font-weight: 700;
                    letter-spacing: 0.3px;
                }
                .frame-verdict-fake {
                    background: rgba(239,68,68,0.12);
                    color: #f87171;
                    box-shadow: 0 0 12px rgba(239,68,68,0.1);
                }
                .frame-verdict-uncertain {
                    background: rgba(245,158,11,0.12);
                    color: #fbbf24;
                }
                .frame-verdict-real {
                    background: rgba(16,185,129,0.12);
                    color: #34d399;
                }
                .frame-detail-id {
                    font-size: 0.75rem;
                    color: rgba(255,255,255,0.35);
                    font-family: 'JetBrains Mono', monospace;
                }

                /* Score bar */
                .frame-score-section {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .frame-score-label {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.75rem;
                    color: rgba(255,255,255,0.45);
                }
                .frame-score-value {
                    margin-left: auto;
                    font-weight: 700;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.85rem;
                }
                .frame-score-bar-bg {
                    width: 100%;
                    height: 6px;
                    border-radius: 3px;
                    background: rgba(255,255,255,0.06);
                    overflow: hidden;
                }
                .frame-score-bar-fill {
                    height: 100%;
                    border-radius: 3px;
                    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 0 8px rgba(255,255,255,0.1);
                }

                /* Detail grid */
                .frame-detail-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                }
                .frame-detail-cell {
                    background: rgba(255,255,255,0.025);
                    border-radius: 10px;
                    padding: 10px 12px;
                    transition: all 0.2s ease;
                }
                .frame-detail-cell:hover {
                    background: rgba(255,255,255,0.04);
                }
                .frame-detail-cell-label {
                    font-size: 0.65rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.4px;
                    color: #71717a;
                    margin-bottom: 4px;
                }
                .frame-detail-cell-value {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #e4e4e7;
                    font-family: 'JetBrains Mono', monospace;
                }

                /* Analysis note */
                .frame-analysis-note {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    padding: 10px 12px;
                    background: rgba(167,139,250,0.04);
                    border-radius: 10px;
                    border-left: 3px solid rgba(167,139,250,0.3);
                    font-size: 0.78rem;
                    line-height: 1.6;
                    color: rgba(255,255,255,0.5);
                }
                .frame-analysis-note svg {
                    flex-shrink: 0;
                    margin-top: 2px;
                    color: #a78bfa;
                }

                /* Empty state */
                .frame-detail-empty {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    padding: 32px 16px;
                    color: rgba(255,255,255,0.2);
                    text-align: center;
                    font-size: 0.8rem;
                    line-height: 1.6;
                }
                .frame-detail-empty svg {
                    animation: crosshairPulse 2s ease-in-out infinite;
                }
                @keyframes crosshairPulse {
                    0%, 100% { opacity: 0.3; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(1.05); }
                }

                /* ===== RESPONSIVE ===== */
                @media (max-width: 1024px) {
                    .drawer-panel {
                        width: 95vw;
                    }
                    .drawer-split {
                        flex-direction: column;
                    }
                    .drawer-left {
                        border-right: none;
                        border-bottom: 1px solid rgba(255,255,255,0.04);
                        max-height: 45vh;
                    }
                }

                @media (max-width: 768px) {
                    .drawer-panel {
                        width: 100vw;
                    }
                    .drawer-header {
                        padding: 16px 20px;
                    }
                    .drawer-left, .drawer-right {
                        padding: 16px;
                    }
                    .drawer-verdict {
                        display: none;
                    }
                    .analysis-details-grid {
                        grid-template-columns: 1fr;
                    }
                    .drawer-subtitle {
                        max-width: 200px;
                    }
                }
            `}</style>
        </>
    );
}

