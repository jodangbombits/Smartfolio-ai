import React, { useState, useEffect, useCallback } from 'react';
import StudentDashboard from './StudentDashboard';
import SupervisorDashboard from './SupervisorDashboard';
import StudentDTR from './StudentDTR';
import Login from './Login';
import { ShieldCheck, ExternalLink, Activity, Sparkles, TrendingUp, CheckCircle2 } from 'lucide-react';
import { GoogleOAuthProvider } from '@react-oauth/google';
const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
// I-normalize ang user object galing login/localStorage.
// - Laging "id" ang gagamitin (galing sa users table).
// - Tinatanggal ang lumang "portfolio_id" na nagdudulot ng pagkakahalo ng mga account.
const normalizeUser = (u) => {
    if (!u || typeof u !== 'object') return null;
    const copy = { ...u };
    delete copy.portfolio_id;
    copy.id = copy.id ?? copy.user_id ?? null;
    return copy;
};

export default function App() {
    // ... Lahat ng iyong umiiral na useState, useEffect, at handlers (WALANG BAGUHIN) ...

    return (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            {/* 1. Unauthenticated View -> Login Screen */}
            {!user && <Login onLogin={handleLogin} />}

            {/* 2. Role-Based Navigation: SUPERVISOR / EMPLOYEE */}
            {user && isSupervisor && (
                <SupervisorDashboard
                    supervisorName={user.name || user.full_name || user.username || 'Supervisor'}
                    onLogout={handleLogout}
                />
            )}

            {/* 3. Role-Based Navigation: STUDENT */}
            {user && !isSupervisor && normalizedRole === 'student' && (
                <div style={{ background: '#070a11', minHeight: '100vh' }}>
                    {!userId ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#fff', background: '#0f172a', minHeight: '100vh' }}>
                            <h2>Walang user ID ang session mo</h2>
                            <p style={{ color: '#94a3b8' }}>Paki-login ulit para ma-load ang sarili mong DTR.</p>
                            <button
                                onClick={handleLogout}
                                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', marginTop: '1rem' }}
                            >
                                Back to Login
                            </button>
                        </div>
                    ) : (
                        <>
                            {currentView === 'dtr' && (
                                <StudentDTR
                                    user={user}
                                    portfolioId={userId}
                                    onLogout={handleLogout}
                                    onSubmitSuccess={() => {
                                        fetchDtrLogs();
                                        setCurrentView('dashboard');
                                    }}
                                    onBack={() => {
                                        fetchDtrLogs();
                                        setCurrentView('dashboard');
                                    }}
                                />
                            )}

                            {currentView === 'dashboard' && (
                                <StudentDashboard
                                    renderedHours={renderedHours}
                                    dtrLogs={dtrLogs}
                                    studentInfo={user}
                                    currentView={currentView}
                                    onNavigate={(view) => setCurrentView(view)}
                                    onNavigateToDTR={() => setCurrentView('dtr')}
                                    onLogout={handleLogout}
                                />
                            )}

                            {currentView === 'ai' && (
                                /* Inilagay mo na AI Assistant View d'ito */
                                <div style={{ padding: '2rem', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
                                    {/* ... existing AI UI content ... */}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Fallback View kung may hindi tumugmang role */}
            {user && !isSupervisor && normalizedRole !== 'student' && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#fff', background: '#0f172a', minHeight: '100vh' }}>
                    <h2>Unknown User Role: "{user.role || user.user_type}"</h2>
                    <p style={{ color: '#94a3b8' }}>Mali ang role na pumasok mula sa backend database. Paki-check ang user object.</p>
                    <button
                        onClick={handleLogout}
                        style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', marginTop: '1rem' }}
                    >
                        Back to Login
                    </button>
                </div>
            )}
        </GoogleOAuthProvider>
    );
}

    const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'dtr', or 'ai'
    const [dtrLogs, setDtrLogs] = useState([]);
    const [renderedHours, setRenderedHours] = useState(0);

    // Safety check: Kunin ang role at i-normalize
    const normalizedRole = (user?.role || user?.user_type || user?.role_name || '').toString().toLowerCase();
    const isSupervisor = normalizedRole === 'supervisor' || normalizedRole === 'employee';

    // ID ng totoong naka-login na user. WALANG fallback sa 1.
    const userId = user?.id ?? null;

    // Kunin ang DTR logs ng NAKA-LOGIN NA STUDENT lang.
    // (Ang Supervisor dashboard ay kumukuha ng sarili niyang data sa backend.)
    const fetchDtrLogs = useCallback(async () => {
        if (!user || isSupervisor || !userId) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/dtr/${userId}`);
            if (response.ok) {
                const logs = await response.json();
                const logsList = Array.isArray(logs) ? logs : (logs.data || []);

                // Normalization para sa data property mapping sa frontend UI
                const mappedLogs = logsList.map(log => ({
                    ...log,
                    log_date: log.log_date || log.date || 'N/A',
                    timeIn: log.timeIn || log.time_in || 'N/A',
                    timeOut: log.timeOut || log.time_out || 'N/A',
                    hoursRendered: log.hoursRendered || log.rendered_hours || log.rendered_today || 0,
                    accomplishments: log.accomplishments || log.accomplishment || log.raw_notes || log.ai_generated_report || 'No entry',
                    proof_url: log.proof_url || log.proofUrl || null
                }));

                setDtrLogs(mappedLogs);

                // Kwentahin ang total hours para sa Approved logs lamang
                const total = mappedLogs
                    .filter(log => log.status?.toLowerCase() === 'approved')
                    .reduce((sum, log) => sum + Number(log.hoursRendered || 0), 0);

                setRenderedHours(total);
            } else {
                console.error('Failed to fetch DTR logs, status:', response.status);
            }
        } catch (error) {
            console.error('Error fetching DTR logs from FastAPI:', error);
        }
    }, [user, isSupervisor, userId]);

    useEffect(() => {
        if (user && !isSupervisor) {
            fetchDtrLogs();
        }
    }, [user, isSupervisor, fetchDtrLogs]);

    // Handle Login with Session Storage
    const handleLogin = (userData) => {
        const clean = normalizeUser(userData);
        setUser(clean);
        localStorage.setItem('smartfolio_user', JSON.stringify(clean));
    };

    // Handle Logout with Session Cleanup
    const handleLogout = () => {
        localStorage.removeItem('smartfolio_user');
        localStorage.removeItem('token');
        setUser(null);
        setCurrentView('dashboard');
        setDtrLogs([]);
        setRenderedHours(0);
    };

    // 1. Unauthenticated View -> Login Screen
    if (!user) {
        return <Login onLogin={handleLogin} />;
    }

    // 2. Role-Based Navigation: SUPERVISOR / EMPLOYEE
    // May sarili nang sidebar at logout ang SupervisorDashboard.
    if (isSupervisor) {
        return (
            <SupervisorDashboard
                supervisorName={user.name || user.full_name || user.username || 'Supervisor'}
                onLogout={handleLogout}
            />
        );
    }

    // 3. Role-Based Navigation: STUDENT
    if (normalizedRole === 'student') {
        // Proteksyon: kapag walang user ID, huwag magpakita ng DTR ng ibang tao
        if (!userId) {
            return (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#fff', background: '#0f172a', minHeight: '100vh' }}>
                    <h2>Walang user ID ang session mo</h2>
                    <p style={{ color: '#94a3b8' }}>Paki-login ulit para ma-load ang sarili mong DTR.</p>
                    <button
                        onClick={handleLogout}
                        style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', marginTop: '1rem' }}
                    >
                        Back to Login
                    </button>
                </div>
            );
        }

        return (
            <div style={{ background: '#070a11', minHeight: '100vh' }}>
                {/* VIEW RENDERER BASED ON CURRENT VIEW */}
                {currentView === 'dtr' && (
                    <StudentDTR
                        user={user}
                        portfolioId={userId}
                        onLogout={handleLogout}
                        onSubmitSuccess={() => {
                            fetchDtrLogs();
                            setCurrentView('dashboard');
                        }}
                        onBack={() => {
                            fetchDtrLogs();
                            setCurrentView('dashboard');
                        }}
                    />
                )}

                {currentView === 'dashboard' && (
                    <StudentDashboard
                        renderedHours={renderedHours}
                        dtrLogs={dtrLogs}
                        studentInfo={user}
                        currentView={currentView}
                        onNavigate={(view) => setCurrentView(view)}
                        onNavigateToDTR={() => setCurrentView('dtr')}
                        onLogout={handleLogout}
                    />
                )}

                {/* SMARTFOLIO FUTURISTIC AI ASSISTANT VIEW */}
                {currentView === 'ai' && (
                    <div style={{ padding: '2rem', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
                        {/* BACK BUTTON TO DASHBOARD */}
                        <div style={{ marginBottom: '1rem' }}>
                            <button
                                onClick={() => setCurrentView('dashboard')}
                                style={{
                                    background: 'rgba(56, 189, 248, 0.15)',
                                    color: '#38bdf8',
                                    border: '1px solid rgba(56, 189, 248, 0.3)',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    fontSize: '0.85rem'
                                }}
                            >
                                ← Back to Dashboard
                            </button>
                        </div>

                        {/* TOP FUTURISTIC AI HERO HEADER */}
                        <div className="cyber-card-cyan" style={{ borderRadius: '24px', padding: '1.75rem', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '220px', height: '220px', background: 'radial-gradient(circle, rgba(34,211,238,0.25) 0%, rgba(0,0,0,0) 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', position: 'relative', zIndex: 2 }}>
                                <div>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(34, 211, 238, 0.1)', border: '1px solid #22d3ee', padding: '0.35rem 0.85rem', borderRadius: '30px', color: '#22d3ee', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                                        <Sparkles size={14} /> SmartFolio AI Neural Engine v2.4
                                    </div>
                                    <h2 style={{ fontSize: '1.85rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        Intern Core Strengths & <span style={{ background: 'linear-gradient(90deg, #22d3ee, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FUTURE</span> Readiness Profile
                                    </h2>
                                    <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.5rem', maxWidth: '650px', lineHeight: 1.6 }}>
                                        Awtomatikong sinusuri ng AI ang lahat ng na-approve na DTR entries, system activities, at code artifacts para tukuyin ang iyong natatanging lakas at i-predict ang iyong career role sa hinaharap.
                                    </p>
                                </div>

                                {/* AI STATUS HUD BADGE */}
                                <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '1rem 1.25rem', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(34, 211, 238, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22d3ee' }}>
                                        <Activity size={22} className="spin" />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Overall Capability Index</div>
                                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#38bdf8' }}>98.4% <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600 }}>Top Tier Intern</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* MAIN TWO-COLUMN DASHBOARD GRID */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

                            {/* LEFT COLUMN: STRENGTHS WITH VERIFIED OUTPUT PROOFS */}
                            <div className="cyber-card-cyan" style={{ borderRadius: '20px', padding: '1.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                    <h3 style={{ color: '#38bdf8', fontSize: '1.15rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                        <ShieldCheck size={20} style={{ color: '#22d3ee' }} /> Identified Strengths & Verified Proofs
                                    </h3>
                                    <span style={{ fontSize: '0.725rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid #10b981', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 700 }}>
                                        2 Proofs Attached
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                                    {/* STRENGTH ITEM 1 */}
                                    <div className="proof-badge" style={{ background: '#1e293b', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '1.2rem', borderRadius: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                            <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                ⚡ Full-Stack REST API & Integration
                                            </span>
                                            <span style={{ color: '#38bdf8', fontSize: '0.75rem', fontWeight: 800, background: 'rgba(2, 132, 199, 0.2)', padding: '0.25rem 0.65rem', borderRadius: '20px' }}>
                                                Core Strength
                                            </span>
                                        </div>
                                        <p style={{ color: '#94a3b8', fontSize: '0.825rem', margin: '0 0 0.85rem 0', lineHeight: 1.5 }}>
                                            Pinatunayan ang kahusayan sa pag-set up ng FastAPI endpoints, SQLite database architecture, at live Brevo email API (OTP) triggers.
                                        </p>

                                        {/* PROOF LINK BADGE */}
                                        <div style={{ background: '#0f172a', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '0.65rem 0.85rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#22d3ee', fontWeight: 600 }}>
                                                <CheckCircle2 size={15} style={{ color: '#10b981' }} />
                                                <span>Verified Output: <strong>DTR Log #004 (FastAPI + Brevo OTP Gateway)</strong></span>
                                            </div>
                                            <span style={{ cursor: 'pointer', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem', fontWeight: 700 }}>
                                                View Log <ExternalLink size={12} />
                                            </span>
                                        </div>
                                    </div>

                                    {/* STRENGTH ITEM 2 */}
                                    <div className="proof-badge" style={{ background: '#1e293b', border: '1px solid rgba(168, 85, 247, 0.25)', padding: '1.2rem', borderRadius: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                            <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                🎨 Glassmorphism UI & Component Architecture
                                            </span>
                                            <span style={{ color: '#c084fc', fontSize: '0.75rem', fontWeight: 800, background: 'rgba(168, 85, 247, 0.2)', padding: '0.25rem 0.65rem', borderRadius: '20px' }}>
                                                Core Strength
                                            </span>
                                        </div>
                                        <p style={{ color: '#94a3b8', fontSize: '0.825rem', margin: '0 0 0.85rem 0', lineHeight: 1.5 }}>
                                            Matagumpay na nakabuo ng responsive cyber-dark user interfaces, interactive reCAPTCHA security modals, at dynamic DTR tables.
                                        </p>

                                        {/* PROOF LINK BADGE */}
                                        <div style={{ background: '#0f172a', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '0.65rem 0.85rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#c084fc', fontWeight: 600 }}>
                                                <CheckCircle2 size={15} style={{ color: '#10b981' }} />
                                                <span>Verified Output: <strong>DTR Log #002 (React.js Frontend UI Redesign)</strong></span>
                                            </div>
                                            <span style={{ cursor: 'pointer', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem', fontWeight: 700 }}>
                                                View Log <ExternalLink size={12} />
                                            </span>
                                        </div>
                                    </div>

                                </div>
                            </div>

                            {/* RIGHT COLUMN: "FUTURE" CAREER ROLE PREDICTION */}
                            <div className="cyber-card-purple" style={{ borderRadius: '20px', padding: '1.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                    <h3 style={{ color: '#c084fc', fontSize: '1.15rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                        <TrendingUp size={20} style={{ color: '#a855f7' }} /> <span style={{ color: '#a855f7' }}>FUTURE</span> Career Role Prediction
                                    </h3>
                                    <span style={{ fontSize: '0.725rem', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: '1px solid #a855f7', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 700 }}>
                                        AI Market Match
                                    </span>
                                </div>

                                <p style={{ color: '#94a3b8', fontSize: '0.825rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                                    Ina-project ng aming AI Predictive Engine ang iyong **FUTURE Industry Roles** base sa iyong mga natapos na technical accomplishments at verified output logs:
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                                    {/* FUTURE ROLE 1 */}
                                    <div style={{ background: '#1e293b', border: '1px solid rgba(168, 85, 247, 0.4)', padding: '1.25rem', borderRadius: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <div>
                                                <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>Full-Stack Web Developer</div>
                                                <div style={{ color: '#c084fc', fontSize: '0.75rem', fontWeight: 600 }}>FUTURE Industry Readiness Score</div>
                                            </div>
                                            <span style={{ background: 'linear-gradient(135deg, #a855f7, #0284c7)', color: '#fff', padding: '0.35rem 0.8rem', borderRadius: '20px', fontWeight: 800, fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' }}>
                                                96% Match
                                            </span>
                                        </div>
                                        <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden', margin: '0.75rem 0' }}>
                                            <div style={{ width: '96%', height: '100%', background: 'linear-gradient(90deg, #a855f7 0%, #22d3ee 100%)', borderRadius: '4px' }} />
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <span style={{ background: '#0f172a', padding: '0.2rem 0.5rem', borderRadius: '6px', color: '#38bdf8' }}>✓ React.js Master</span>
                                            <span style={{ background: '#0f172a', padding: '0.2rem 0.5rem', borderRadius: '6px', color: '#38bdf8' }}>✓ Python FastAPI</span>
                                            <span style={{ background: '#0f172a', padding: '0.2rem 0.5rem', borderRadius: '6px', color: '#38bdf8' }}>✓ SQLite DB</span>
                                        </div>
                                    </div>

                                    {/* FUTURE ROLE 2 */}
                                    <div style={{ background: '#1e293b', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '1.25rem', borderRadius: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <div>
                                                <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>Backend API & Systems Engineer</div>
                                                <div style={{ color: '#38bdf8', fontSize: '0.75rem', fontWeight: 600 }}>FUTURE Industry Readiness Score</div>
                                            </div>
                                            <span style={{ background: 'rgba(2, 132, 199, 0.3)', color: '#38bdf8', border: '1px solid #0284c7', padding: '0.35rem 0.8rem', borderRadius: '20px', fontWeight: 800, fontSize: '0.85rem' }}>
                                                91% Match
                                            </span>
                                        </div>
                                        <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden', margin: '0.75rem 0' }}>
                                            <div style={{ width: '91%', height: '100%', background: 'linear-gradient(90deg, #0284c7 0%, #34d399 100%)', borderRadius: '4px' }} />
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <span style={{ background: '#0f172a', padding: '0.2rem 0.5rem', borderRadius: '6px', color: '#34d399' }}>✓ REST Endpoints</span>
                                            <span style={{ background: '#0f172a', padding: '0.2rem 0.5rem', borderRadius: '6px', color: '#34d399' }}>✓ Brevo Email Gateway</span>
                                        </div>
                                    </div>

                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Fallback View kung may hindi tumugmang role
    return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#fff', background: '#0f172a', minHeight: '100vh' }}>
            <h2>Unknown User Role: "{user.role || user.user_type}"</h2>
            <p style={{ color: '#94a3b8' }}>Mali ang role na pumasok mula sa backend database. Paki-check ang user object.</p>
            <button
                onClick={handleLogout}
                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', marginTop: '1rem' }}
            >
                Back to Login
            </button>
        </div>
    );

