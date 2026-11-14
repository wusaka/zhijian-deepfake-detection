import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import client from '../api/client';
import { LogOut, Activity, LayoutDashboard, FileVideo, ShieldAlert, Image as ImageIcon, History as HistoryIcon, Sparkles, Upload } from 'lucide-react';

export default function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.dispatchEvent(new Event('auth-change'));
        navigate('/login');
    };

    const navItems = [
        { label: '首页', path: '/', icon: <LayoutDashboard size={18} /> },
        { label: '图片检测', path: '/image-detection', icon: <ImageIcon size={18} /> },
        { label: '视频检测', path: '/videos', icon: <FileVideo size={18} /> },
        { label: '历史记录', path: '/history', icon: <HistoryIcon size={18} /> },
        { label: '审计日志', path: '/audit', icon: <ShieldAlert size={18} /> },
    ];

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#111111' }}>
            {/* Header */}
            <header style={{
                background: 'rgba(17, 17, 17, 0.85)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                position: 'sticky',
                top: 0,
                zIndex: 1000,
                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)'
            }}>
                <div style={{
                    maxWidth: '1400px',
                    margin: '0 auto',
                    padding: '0 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: '64px'
                }}>
                    {/* Brand */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                    }} onClick={() => navigate('/')}>
                        <img
                            src="/logo.png"
                            alt="智鉴"
                            style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                objectFit: 'cover',
                                boxShadow: '0 4px 16px rgba(139, 92, 246, 0.2)',
                            }}
                        />
                        <h2 style={{
                            fontSize: '1.15rem',
                            fontWeight: 700,
                            margin: 0,
                            background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                        }}>
                            智鉴
                        </h2>
                    </div>

                    {/* Navigation */}
                    <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {navItems.map((item) => (
                            <NavItem
                                key={item.path}
                                icon={item.icon}
                                label={item.label}
                                active={location.pathname === item.path}
                                onClick={() => navigate(item.path)}
                            />
                        ))}
                    </nav>

                    {/* User Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            padding: '8px 16px',
                            background: 'rgba(255,255,255,0.04)',
                            borderRadius: '12px',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                        }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#F5F5F7' }}>
                                {user.username}
                            </div>
                            <div style={{
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                            }}>
                                {user.roles?.[0] || 'User'}
                            </div>
                        </div>
                        <button
                            onClick={logout}
                            style={{
                                background: 'rgba(239, 68, 68, 0.08)',
                                color: '#EF4444',
                                border: 'none',
                                padding: '9px',
                                borderRadius: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.background = 'rgba(239, 68, 68, 0.15)';
                                e.target.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.background = 'rgba(239, 68, 68, 0.08)';
                                e.target.style.transform = 'translateY(0)';
                            }}
                            title="退出登录"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main style={{
                flex: 1,
                minHeight: 'calc(100vh - 64px - 36px)'
            }}>
                <Outlet />
            </main>

            {/* Footer — Terminal Status Bar */}
            <footer style={{
                background: 'rgba(17, 17, 17, 0.9)',
                borderTop: '1px solid rgba(255,255,255,0.04)',
                marginTop: 'auto',
            }}>
                <div style={{
                    maxWidth: '1400px',
                    margin: '0 auto',
                    padding: '10px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.68rem',
                    letterSpacing: '0.3px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#52525B' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                                width: '6px', height: '6px', borderRadius: '50%',
                                background: '#10B981', display: 'inline-block',
                                boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
                            }}></span>
                            <span style={{ color: '#71717A' }}>引擎:</span>
                            <span style={{ color: '#A78BFA' }}>DeepFake-Det</span>
                            <span style={{
                                color: '#10B981', fontSize: '0.6rem',
                                padding: '1px 6px',
                                background: 'rgba(16, 185, 129, 0.08)',
                                borderRadius: '4px',
                            }}>ONLINE</span>
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.06)' }}>│</span>
                        <span>
                            <span style={{ color: '#71717A' }}>GPU:</span>{' '}
                            <span style={{ color: '#A78BFA' }}>42%</span>
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#52525B' }}>
                        <span>
                            <span style={{ color: '#71717A' }}>E2E加密:</span>{' '}
                            <span style={{ color: '#10B981' }}>ON</span>
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.06)' }}>│</span>
                        <span style={{ color: '#52525B' }}>Build v2.1.0</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function NavItem({ icon, label, active, onClick }) {
    return (
        <div
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '9px 18px',
                borderRadius: '10px',
                textDecoration: 'none',
                color: active ? 'white' : '#71717A',
                fontWeight: active ? 600 : 500,
                fontSize: '0.9rem',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                border: 'none',
                background: active ? 'linear-gradient(135deg, #8B5CF6, #EC4899)' : 'transparent',
                boxShadow: active ? '0 4px 16px rgba(139, 92, 246, 0.3)' : 'none',
                cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
                if (!active) {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)';
                    e.currentTarget.style.color = '#A78BFA';
                }
            }}
            onMouseLeave={(e) => {
                if (!active) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#71717A';
                }
            }}
        >
            {icon}
            <span>{label}</span>
        </div>
    );
}
