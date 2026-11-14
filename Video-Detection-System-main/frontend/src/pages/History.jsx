import { useState, useEffect, useCallback, useRef } from 'react';
import client from '../api/client';
import { FileVideo, Trash2, Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import ReportDrawer from '../components/ReportDrawer';
import { useWebSocket } from '../context/WebSocketContext';

export default function History() {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [selectedReport, setSelectedReport] = useState(null);
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportLoading, setReportLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const { lastMessage } = useWebSocket();
    const pollingRef = useRef(null);

    // Fetch Videos and enrich with detection results
    const fetchVideos = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const res = await client.get(`/videos/my?page=${page}&size=10`);
            if (res.data) {
                const videoList = res.data.content || [];

                // Fetch detection results for each video in parallel
                const enriched = await Promise.all(
                    videoList.map(async (video) => {
                        try {
                            const detRes = await client.get(`/detections/video/${video.id}`);
                            if (detRes.data) {
                                return {
                                    ...video,
                                    detectionResult: detRes.data.result,   // 'FAKE' / 'AUTHENTIC'
                                    confidence: detRes.data.confidence,
                                    status: 'COMPLETED',
                                };
                            }
                        } catch {
                            // No detection result yet — might still be processing
                            // Check if there's a pending task
                            try {
                                const taskRes = await client.get(`/tasks/my`);
                                const tasks = taskRes.data?.content || taskRes.data || [];
                                const videoTask = Array.isArray(tasks)
                                    ? tasks.find(t => t.videoId === video.id)
                                    : null;
                                if (videoTask) {
                                    return {
                                        ...video,
                                        status: videoTask.status || 'PENDING',
                                    };
                                }
                            } catch {
                                // ignore task fetch error
                            }
                        }
                        return video;
                    })
                );

                setVideos(enriched);
                setTotalPages(res.data.totalPages || 0);
            }
        } catch (err) {
            console.error("Failed to fetch videos:", err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [page]);

    useEffect(() => {
        fetchVideos();
    }, [fetchVideos]);

    // Auto-refresh when WebSocket delivers a detection result
    useEffect(() => {
        if (lastMessage && (lastMessage.type === 'DETECTION_COMPLETE' || lastMessage.type === 'DETECTION_RESULT' || lastMessage.type === 'RESULT')) {
            // Silently refresh the list so status badges update
            fetchVideos(true);
        }
    }, [lastMessage, fetchVideos]);

    // Poll every 10s if any video is still processing
    useEffect(() => {
        const hasPending = videos.some(v => {
            const s = (v.status || '').toUpperCase();
            return ['PROCESSING', 'PENDING', 'QUEUED'].includes(s);
        });

        if (hasPending) {
            pollingRef.current = setInterval(() => {
                fetchVideos(true);
            }, 10000);
        }

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [videos, fetchVideos]);

    // Handle Delete
    const handleDelete = async (videoId) => {
        try {
            await client.delete(`/videos/${videoId}`);
            setDeleteConfirm(null);
            fetchVideos();
        } catch (err) {
            console.error("Delete failed:", err);
            alert('删除失败');
        }
    };

    // Handle View Report
    const handleViewReport = async (video) => {
        try {
            setReportLoading(true);
            setSelectedReport(null); // Reset first
            setShowReportModal(true);

            // Fetch report
            const res = await client.get(`/detections/video/${video.id}`);
            if (res.data) {
                const report = { ...res.data, videoInfo: video }; // Merge video info
                setSelectedReport(report);
            } else {
                alert('暂无检测报告或检测尚未完成');
                setShowReportModal(false);
            }
        } catch (err) {
            console.error("Failed to fetch report:", err);
            alert('获取报告失败: ' + (err.response?.data?.message || err.message));
            setShowReportModal(false);
        } finally {
            setReportLoading(false);
        }
    };

    // Get result badge — show detection conclusion instead of status
    const getResultBadge = (video) => {
        const status = video.status ? video.status.toUpperCase() : null;

        // Still processing
        if (['PROCESSING', 'PENDING', 'QUEUED'].includes(status)) {
            return (
                <span className="status-badge status-pending">
                    <Clock size={12} />
                    分析中
                </span>
            );
        }

        // Failed
        if (['FAILED', 'ERROR'].includes(status)) {
            return (
                <span className="status-badge status-failed">
                    <XCircle size={12} />
                    检测失败
                </span>
            );
        }

        // Completed → show FAKE / REAL result based on detection result field
        const result = video.detectionResult
            ? (typeof video.detectionResult === 'string' ? video.detectionResult : video.detectionResult.toString()).toUpperCase()
            : null;

        // Use result field ONLY — do NOT use confidence (it's always >= 0.5)
        if (result === 'FAKE') {
            return (
                <span className="status-badge status-fake">
                    <AlertCircle size={12} />
                    检出伪造
                </span>
            );
        }

        if (result === 'AUTHENTIC' || result === 'REAL') {
            return (
                <span className="status-badge status-real">
                    <CheckCircle size={12} />
                    未见异常
                </span>
            );
        }

        if (result === 'UNCERTAIN') {
            return (
                <span className="status-badge status-pending">
                    <AlertCircle size={12} />
                    结果存疑
                </span>
            );
        }

        // No detection result yet
        if (status === 'COMPLETED') {
            return (
                <span className="status-badge status-real">
                    <CheckCircle size={12} />
                    未见异常
                </span>
            );
        }

        // Default: waiting
        return (
            <span className="status-badge status-pending">
                <Clock size={12} />
                等待检测
            </span>
        );
    };

    // Skeleton Loader
    const SkeletonRow = () => (
        <div className="skeleton-row">
            <div className="skeleton skeleton-file"></div>
            <div className="skeleton skeleton-text"></div>
            <div className="skeleton skeleton-text"></div>
            <div className="skeleton skeleton-badge"></div>
            <div className="skeleton skeleton-actions"></div>
        </div>
    );

    // URL Helper: Convert generic/absolute path to web URL
    const getWebUrl = (path) => {
        if (!path) return '';
        if (path.startsWith('http')) return path;
        // Normalize slashes
        const normalized = path.replace(/\\/g, '/');
        // Check for uploads directory
        const match = normalized.match(/\/uploads\/.+/);
        if (match) {
            return match[0];
        }
        // Fallback: if absolute path but no uploads pattern found
        return path;
    };

    // Thumbnail Renderer
    const renderThumbnail = (video) => {
        // Try common thumbnail fields or check if URL is an image
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(video.fileName);

        // Priority: thumbnail -> cover -> url -> filePath
        const rawPath = video.thumbnailUrl || video.coverUrl || video.imgUrl || (isImage ? (video.url || video.filePath) : null);
        const imgSrc = getWebUrl(rawPath);

        if (imgSrc) {
            return (
                <div className="file-icon file-thumbnail">
                    <img
                        src={imgSrc}
                        alt={video.fileName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.parentNode.classList.remove('file-thumbnail');
                        }}
                    />
                    {/* Fallback icon hidden behind image unless image fails/missing */}
                    <div className="thumbnail-fallback" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: -1 }}>
                        <FileVideo size={20} />
                    </div>
                </div>
            );
        }

        return (
            <div className="file-icon">
                <FileVideo size={20} />
            </div>
        );
    };

    // Helper to format model name user-friendly
    const formatModelName = (report) => {
        // Try to map based on mode first (if available)
        if (report.mode === 'aigc') return 'AIGC生成检测 (DRCT)';
        if (report.mode === 'standard') return '人脸伪造检测 (Effort级联模型)';

        // Fallback to modelVersion string matching
        const model = report.modelVersion || '';
        const lower = model.toLowerCase();

        if (lower.includes('effort') || lower.includes('efficient')) return '人脸伪造检测 (Effort级联模型)';
        if (lower.includes('drct')) return 'AIGC生成检测 (DRCT)';
        if (lower.includes('meso')) return '人脸伪造检测 (MesoNet)';

        return model || '人脸伪造检测 (Standard)';
    };

    return (
        <div className="history-container animate-fade-in">
            {/* Header */}
            <div style={{ marginBottom: '40px' }}>
                <h2 style={{ fontSize: '2.25rem', marginBottom: '12px', fontWeight: 800 }}>
                    <span className="text-gradient">历史记录</span>
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>查看所有上传的视频和图片检测记录</p>
            </div>

            {/* Records Table - Desktop */}
            <div className="glass-card table-container">
                <div className="table-header">
                    <div>文件名称</div>
                    <div>上传时间</div>
                    <div>大小 (MB)</div>
                    <div>检测结论</div>
                    <div className="actions-col">操作</div>
                </div>

                <div className="table-body">
                    {loading ? (
                        <>
                            {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
                        </>
                    ) : videos.length === 0 ? (
                        <div className="empty-state">
                            <FileVideo size={48} />
                            <h3>暂无记录</h3>
                            <p>上传视频后，检测记录将显示在这里</p>
                        </div>
                    ) : (
                        videos.map(video => (
                            <div key={video.id} className="table-row">
                                <div className="file-info">
                                    {renderThumbnail(video)}
                                    <span className="file-name" title={video.fileName}>
                                        {video.fileName}
                                    </span>
                                </div>
                                <div className="data-mono">
                                    {new Date(video.createdAt).toLocaleString('zh-CN', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </div>
                                <div className="data-mono">
                                    {(video.fileSize / 1024 / 1024).toFixed(2)}
                                </div>
                                <div>{getResultBadge(video)}</div>
                                <div className="actions-cell">
                                    <button
                                        className="btn-view"
                                        onClick={() => handleViewReport(video)}
                                    >
                                        查看报告
                                    </button>
                                    <button
                                        className="btn-delete"
                                        onClick={() => setDeleteConfirm(video.id)}
                                        title="删除"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Mobile Card View */}
                <div className="mobile-cards">
                    {loading ? (
                        <>
                            {[1, 2, 3].map(i => (
                                <div key={i} className="skeleton-card">
                                    <div className="skeleton skeleton-card-header"></div>
                                    <div className="skeleton skeleton-text"></div>
                                    <div className="skeleton skeleton-text"></div>
                                </div>
                            ))}
                        </>
                    ) : videos.length === 0 ? (
                        <div className="empty-state">
                            <FileVideo size={48} />
                            <h3>暂无记录</h3>
                            <p>上传视频后，检测记录将显示在这里</p>
                        </div>
                    ) : (
                        videos.map(video => (
                            <div key={video.id} className="mobile-card">
                                <div className="mobile-card-header">
                                    {renderThumbnail(video)}
                                    <div className="mobile-card-title">
                                        <div className="file-name">{video.fileName}</div>
                                        <div className="text-muted small">
                                            {new Date(video.createdAt).toLocaleString('zh-CN', {
                                                month: '2-digit',
                                                day: '2-digit',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </div>
                                    </div>
                                    {getResultBadge(video)}
                                </div>
                                <div className="mobile-card-info">
                                    <span>大小: {(video.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                                </div>
                                <div className="mobile-card-actions">
                                    <button
                                        className="btn-view"
                                        onClick={() => handleViewReport(video)}
                                    >
                                        查看报告
                                    </button>
                                    <button
                                        className="btn-delete"
                                        onClick={() => setDeleteConfirm(video.id)}
                                    >
                                        <Trash2 size={18} />
                                        删除
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="pagination">
                        <button
                            disabled={page === 0}
                            onClick={() => setPage(p => p - 1)}
                            className="btn-pagination"
                        >
                            上一页
                        </button>
                        <span className="page-info">
                            第 {page + 1} 页 / 共 {totalPages} 页
                        </span>
                        <button
                            disabled={page >= totalPages - 1}
                            onClick={() => setPage(p => p + 1)}
                            className="btn-pagination"
                        >
                            下一页
                        </button>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal-small" onClick={e => e.stopPropagation()}>
                        <div className="modal-icon-warning">
                            <AlertCircle size={48} />
                        </div>
                        <h3>确认删除</h3>
                        <p>删除后将无法恢复，确定要删除这条记录吗？</p>
                        <div className="modal-actions">
                            <button
                                className="btn-cancel"
                                onClick={() => setDeleteConfirm(null)}
                            >
                                取消
                            </button>
                            <button
                                className="btn-confirm-delete"
                                onClick={() => handleDelete(deleteConfirm)}
                            >
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Report Drawer */}
            <ReportDrawer
                open={showReportModal}
                report={selectedReport}
                loading={reportLoading}
                onClose={() => setShowReportModal(false)}
                getWebUrl={getWebUrl}
                formatModelName={formatModelName}
            />

            <style>{`
                /* Container */
                .history-container {
                    max-width: 1400px;
                    margin: 0 auto;
                    padding: 0 20px;
                }

                /* Table Container */
                .table-container {
                    padding: 0;
                    overflow: hidden;
                }

                .table-header {
                    display: grid;
                    grid-template-columns: minmax(200px, 2fr) 1fr 1fr 1fr 1fr;
                    padding: 14px 24px;
                    background: #13151A;
                    border-bottom: 1px solid #1E2028;
                    color: #3E424E;
                    font-weight: 700;
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                }

                .table-header .actions-col {
                    text-align: right;
                }

                .table-body {
                    min-height: 400px;
                }

                .table-row {
                    display: grid;
                    grid-template-columns: minmax(200px, 2fr) 1fr 1fr 1fr 1fr;
                    padding: 12px 24px;
                    border-bottom: 1px solid #1E2028;
                    align-items: center;
                    font-size: 0.85rem;
                    transition: all 0.15s ease;
                }

                .table-row:hover {
                    background: rgba(0, 255, 65, 0.02);
                    border-left: 2px solid #00FF41;
                    padding-left: 22px;
                }

                .file-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    min-width: 0;
                }

                .file-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 4px;
                    background: rgba(0, 255, 65, 0.06);
                    border: 1px solid rgba(0, 255, 65, 0.15);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    color: #00FF41;
                    position: relative;
                    overflow: hidden;
                }
                
                .file-thumbnail {
                    padding: 0;
                    border: 1px solid #1E2028;
                }

                .file-name {
                    font-weight: 600;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: #E0E2E8;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.82rem;
                }

                .text-muted {
                    color: var(--text-muted);
                }

                /* Status / Result Badges */
                .status-badge {
                    padding: 5px 12px;
                    border-radius: 2px;
                    font-size: 0.72rem;
                    font-weight: 700;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    font-family: 'JetBrains Mono', monospace;
                }

                .status-pending {
                    background: rgba(255, 184, 0, 0.08);
                    color: #FFB800;
                    border: 1px solid rgba(255, 184, 0, 0.25);
                }

                .status-real {
                    background: rgba(0, 255, 65, 0.06);
                    color: #00FF41;
                    border: 1px solid rgba(0, 255, 65, 0.2);
                    text-shadow: 0 0 6px rgba(0, 255, 65, 0.2);
                }

                .status-fake {
                    background: rgba(255, 0, 60, 0.1);
                    color: #FF003C;
                    border: 1px solid rgba(255, 0, 60, 0.3);
                    box-shadow: 0 0 10px rgba(255, 0, 60, 0.15);
                    animation: breatheRed 2s ease-in-out infinite;
                }

                @keyframes breatheRed {
                    0%, 100% {
                        box-shadow: 0 0 6px rgba(255, 0, 60, 0.15);
                        text-shadow: 0 0 4px rgba(255, 0, 60, 0.3);
                    }
                    50% {
                        box-shadow: 0 0 16px rgba(255, 0, 60, 0.35);
                        text-shadow: 0 0 10px rgba(255, 0, 60, 0.6);
                    }
                }

                .status-failed {
                    background: rgba(255, 0, 60, 0.06);
                    color: #FF003C;
                    border: 1px solid rgba(255, 0, 60, 0.15);
                }

                /* Monospace data cells */
                .data-mono {
                    font-family: 'JetBrains Mono', 'Fira Code', monospace;
                    color: #8B8F9A;
                    font-size: 0.82rem;
                    letter-spacing: 0.3px;
                }

                /* Actions */
                .actions-cell {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    align-items: center;
                }

                .btn-view {
                    padding: 6px 14px;
                    font-size: 0.78rem;
                    font-weight: 700;
                    background: #00FF41;
                    color: #0A0A0C;
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    white-space: nowrap;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                }

                .btn-view:hover {
                    box-shadow: 0 0 12px rgba(0, 255, 65, 0.3);
                }

                .btn-delete {
                    background: transparent;
                    border: none;
                    color: #FF003C;
                    cursor: pointer;
                    opacity: 0.5;
                    transition: all 0.15s ease;
                    padding: 6px;
                    border-radius: 2px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .btn-delete:hover {
                    opacity: 1;
                    background: rgba(255, 0, 60, 0.08);
                }

                /* Mobile Cards */
                .mobile-cards {
                    display: none;
                }

                .mobile-card {
                    padding: 16px;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    transition: background 0.2s;
                }

                .mobile-card:hover {
                    background: rgba(255,255,255,0.02);
                }

                .mobile-card-header {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    margin-bottom: 12px;
                }

                .mobile-card-title {
                    flex: 1;
                    min-width: 0;
                }

                .mobile-card-title .file-name {
                    display: block;
                    margin-bottom: 4px;
                    font-weight: 500;
                }

                .mobile-card-title .small {
                    font-size: 0.8rem;
                }

                .mobile-card-info {
                    margin-bottom: 12px;
                    font-size: 0.85rem;
                    color: var(--text-muted);
                }

                .mobile-card-actions {
                    display: flex;
                    gap: 8px;
                }

                .mobile-card-actions .btn-view,
                .mobile-card-actions .btn-delete {
                    flex: 1;
                    justify-content: center;
                }

                /* Pagination */
                .pagination {
                    padding: 20px 24px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 16px;
                    border-top: 1px solid rgba(255,255,255,0.05);
                }

                .btn-pagination {
                    padding: 8px 20px;
                    font-size: 0.875rem;
                    font-weight: 600;
                    background: rgba(255,255,255,0.05);
                    color: white;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .btn-pagination:hover:not(:disabled) {
                    background: rgba(255,255,255,0.1);
                    border-color: var(--primary);
                }

                .btn-pagination:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                }

                .page-info {
                    color: var(--text-muted);
                    font-size: 0.9rem;
                    min-width: 120px;
                    text-align: center;
                }

                /* Delete Confirmation Modal */
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.75);
                    backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 20px;
                    animation: fadeIn 0.2s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .modal-small {
                    background: linear-gradient(135deg, rgba(30, 30, 40, 0.98), rgba(20, 20, 30, 0.98));
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 16px;
                    padding: 32px;
                    max-width: 420px;
                    width: 100%;
                    text-align: center;
                    animation: slideUp 0.3s ease;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .modal-icon-warning {
                    width: 80px;
                    height: 80px;
                    margin: 0 auto 20px;
                    border-radius: 50%;
                    background: rgba(239, 68, 68, 0.1);
                    border: 2px solid rgba(239, 68, 68, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #ef4444;
                }

                .modal-small h3 {
                    margin: 0 0 12px 0;
                    font-size: 1.5rem;
                    color: #fff;
                }

                .modal-small p {
                    margin: 0 0 24px 0;
                    color: var(--text-muted);
                    line-height: 1.6;
                }

                .modal-actions {
                    display: flex;
                    gap: 12px;
                }

                .btn-cancel {
                    flex: 1;
                    padding: 12px;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    color: white;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .btn-cancel:hover {
                    background: rgba(255,255,255,0.1);
                }

                .btn-confirm-delete {
                    flex: 1;
                    padding: 12px;
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    border: none;
                    border-radius: 8px;
                    color: white;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .btn-confirm-delete:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
                }

                /* Loading & Empty States */
                .loading-state, .error-state {
                    padding: 60px 20px;
                    text-align: center;
                    color: var(--text-muted);
                }

                .loading-state p, .error-state p {
                    margin-top: 16px;
                    font-size: 0.95rem;
                }

                .spinner {
                    width: 48px;
                    height: 48px;
                    border: 4px solid rgba(255,255,255,0.1);
                    border-top-color: var(--primary);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                    margin: 0 auto;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .empty-state {
                    padding: 80px 20px;
                    text-align: center;
                    color: var(--text-muted);
                }

                .empty-state svg {
                    opacity: 0.3;
                    margin-bottom: 20px;
                }

                .empty-state h3 {
                    margin: 0 0 8px 0;
                    font-size: 1.25rem;
                    color: rgba(255,255,255,0.6);
                }

                .empty-state p {
                    margin: 0;
                    font-size: 0.9rem;
                }

                /* Skeleton Loading */
                .skeleton-row {
                    display: grid;
                    grid-template-columns: minmax(200px, 2fr) 1fr 1fr 1fr 1fr;
                    padding: 16px 24px;
                    border-bottom: 1px solid rgba(255,255,255,0.03);
                    align-items: center;
                    gap: 16px;
                }

                .skeleton {
                    background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%);
                    background-size: 200% 100%;
                    animation: shimmer 1.5s infinite;
                    border-radius: 6px;
                }

                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }

                .skeleton-file {
                    height: 44px;
                    width: 200px;
                }

                .skeleton-text {
                    height: 20px;
                }

                .skeleton-badge {
                    height: 28px;
                    width: 80px;
                }

                .skeleton-actions {
                    height: 36px;
                    width: 120px;
                    margin-left: auto;
                }

                .skeleton-card {
                    padding: 16px;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }

                .skeleton-card-header {
                    height: 44px;
                    margin-bottom: 12px;
                }

                /* Responsive Design */
                @media (max-width: 1024px) {
                    .table-header {
                        grid-template-columns: 2fr 1fr 1fr 1fr 140px;
                    }
                    .table-row {
                        grid-template-columns: 2fr 1fr 1fr 1fr 140px;
                    }
                }

                @media (max-width: 768px) {
                    .table-header, .table-body {
                        display: none;
                    }

                    .mobile-cards {
                        display: block;
                    }

                    .page-header h2 {
                        font-size: 1.5rem;
                    }

                    .modal-large {
                        max-width: 95%;
                        border-radius: 16px;
                    }

                    .modal-header, .modal-content, .modal-footer {
                        padding: 24px;
                    }

                    .details-grid {
                        grid-template-columns: 1fr;
                        gap: 12px;
                    }

                    .result-summary {
                        padding: 24px;
                    }

                    .result-summary h4 {
                        font-size: 1.4rem;
                    }
                }

                @media (max-width: 480px) {
                    .history-container {
                        padding: 0 12px;
                    }

                    .page-header {
                        margin-bottom: 24px;
                    }

                    .pagination {
                        flex-wrap: wrap;
                        gap: 8px;
                    }

                    .page-info {
                        width: 100%;
                        order: -1;
                        margin-bottom: 8px;
                    }
                }

                /* Animation */
                .animate-fade-in {
                    animation: fadeIn 0.3s ease;
                }
            `}</style>
        </div>
    );
}
