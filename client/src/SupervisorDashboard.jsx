import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    MessageSquare,
    Send,
    X,
    User,
    Users,
    Shield,
    FileText,
    Eye,
    Paperclip,
    CheckCircle2,
    XCircle,
    CheckCheck,
    Search,
    MessageCircleMore,
    LayoutDashboard,
    Bot,
    LogOut,
    Sparkles,
    ShieldCheck,
    TrendingUp,
    GraduationCap,
    FileCheck,
    Printer,
    Download,
    Upload,
    Save,
    AlertTriangle,
    ClipboardCheck,
    Building2
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
// Mga field na galing sa server / account; hindi dapat i-save sa profile JSON
const SERVER_ONLY_FIELDS = ['id', 'email', 'contact_number', 'approvedHours', 'approved_hours', 'full_name', 'internName'];

/* ================= DEFAULT INTERN PROFILE ================= */
const DEFAULT_PROFILE = {
    internName: '',
    school: '',
    course: '',
    yearLevel: '',
    coordinatorName: '',
    coordinatorContact: '',
    hostCompany: '',
    department: '',
    internshipStart: '',
    internshipEnd: '',
    requiredHours: 500,
    moaNumber: '',
    moaDateSigned: '',
    moaValidUntil: '',
    moaSigned: false,
    moaFileUrl: '',
    endorsementLetter: false,
    parentConsent: false,
    medicalClearance: false,
    rating: { punctuality: 0, quality: 0, initiative: 0, communication: 0 }
};

const REQUIREMENTS = [
    { key: 'moaSigned', label: 'MOA Signed' },
    { key: 'endorsementLetter', label: 'Endorsement Letter' },
    { key: 'parentConsent', label: 'Parent Consent Waiver' },
    { key: 'medicalClearance', label: 'Medical Clearance' }
];

const RATING_CRITERIA = [
    { key: 'punctuality', label: 'Punctuality & Attendance' },
    { key: 'quality', label: 'Quality of Work' },
    { key: 'initiative', label: 'Initiative & Learning' },
    { key: 'communication', label: 'Communication & Teamwork' }
];

const SKILL_KEYWORDS = [
    { name: 'Frontend / UI Development', words: ['ui', 'react', 'css', 'frontend', 'design', 'mockup', 'component', 'html', 'figma', 'layout'] },
    { name: 'Backend & API (REST)', words: ['api', 'fastapi', 'backend', 'server', 'endpoint', 'rest', 'cors', 'otp', 'auth'] },
    { name: 'Database & Data Handling', words: ['database', 'sql', 'mysql', 'postgres', 'query', 'inventory', 'data', 'schema', 'table'] },
    { name: 'Debugging & Testing', words: ['debug', 'bug', 'fix', 'test', 'error', 'qa', 'troubleshoot'] },
    { name: 'Security & Audit', words: ['audit', 'security', 'trail', 'encrypt', 'login', 'password', 'verification'] },
    { name: 'Documentation & Reporting', words: ['document', 'report', 'manual', 'presentation', 'notes'] }
];

const QUICK_REPLIES = [
    'Okay, na-review ko na. Salamat!',
    'Pakipaliwanag pa ng kaunti ang mga tasks.',
    'Paki-upload ng mas malinaw na proof.',
    'Paki-double check ang oras ng time in/out.'
];

const REJECT_REASONS = [
    'Hindi malinaw ang proof',
    'Kulang ang detalye ng tasks',
    'Mali ang time in / time out',
    'Duplicate na entry'
];

/* ================= HELPERS ================= */
const pad = (n) => String(n).padStart(2, '0');

const parseDate = (s) => {
    if (!s) return null;
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
};

const fmtDate = (s) => {
    const d = s instanceof Date ? s : parseDate(s);
    return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
};

const addBusinessDays = (start, n) => {
    const d = new Date(start);
    let added = 0;
    while (added < n) {
        d.setDate(d.getDate() + 1);
        const w = d.getDay();
        if (w !== 0 && w !== 6) added += 1;
    }
    return d;
};

const weekStartKey = (date) => {
    const d = new Date(date);
    const offset = (d.getDay() + 6) % 7; // Monday = start of week
    d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const statusOf = (log) => (log.status || 'pending').toLowerCase();
const hoursOf = (log) => Number(log.rendered_today ?? log.hoursRendered ?? 0) || 0;
const notesOf = (log) => log.accomplishment || log.raw_notes || log.accomplishments || '';
const dateOf = (log) => log.log_date || log.date || '';
const idOf = (log) => log.id || log.log_id;
const messageText = (m) => m.message || m.text || m.remark || m.content || '';
const nameOfLog = (log) => log.student_name || log.intern_name || log.full_name || log.user_name || log.username || log.name || '';

const fmtStamp = (ts) => {
    if (!ts) return 'Recently';
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(ts)) {
        const d = new Date(`${ts.replace(' ', 'T')}Z`); // CURRENT_TIMESTAMP ng SQLite ay UTC
        if (!Number.isNaN(d.getTime())) {
            return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }
    }
    return ts;
};

const needsReply = (log) => {
    const msgs = log.messages || [];
    if (msgs.length === 0) return false;
    return msgs[msgs.length - 1].sender !== 'supervisor';
};

const getMoaState = (p, today) => {
    if (!p.moaSigned && !p.moaNumber && !p.moaFileUrl && !p.moaValidUntil) {
        return { label: 'NOT RECORDED', cls: 'muted', note: 'Wala pang MOA na naitala.' };
    }
    if (!p.moaSigned) {
        return { label: 'PENDING SIGNATURE', cls: 'pending', note: 'Hindi pa naka-mark na signed ang MOA.' };
    }
    const vu = parseDate(p.moaValidUntil);
    if (vu) {
        if (vu < today) return { label: 'EXPIRED', cls: 'rejected', note: `Nag-expire noong ${fmtDate(vu)}.` };
        const days = Math.round((vu - today) / 86400000);
        if (days <= 30) return { label: 'EXPIRING SOON', cls: 'pending', note: `${days} araw na lang bago mag-expire.` };
    }
    return { label: 'ACTIVE', cls: 'approved', note: vu ? `Valid hanggang ${fmtDate(vu)}.` : 'Active.' };
};

const fullUrl = (url) => (url ? (url.startsWith('http') ? url : `${API_BASE_URL}${url}`) : null);

const mergeProfile = (loaded) => ({
    ...DEFAULT_PROFILE,
    ...(loaded || {}),
    rating: { ...DEFAULT_PROFILE.rating, ...((loaded && loaded.rating) || {}) }
});

/* ================= CYBER THEME (CSS) ================= */
const cyberCSS = `
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@500;600;700&display=swap');

.sv-root {
    display: flex;
    min-height: 100vh;
    color: #e2e8f0;
    font-family: Inter, system-ui, sans-serif;
    background:
        linear-gradient(rgba(168, 85, 247, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(34, 211, 238, 0.04) 1px, transparent 1px),
        radial-gradient(circle at 85% 10%, #1a1040 0%, #071322 42%, #03070d 100%);
    background-size: 40px 40px, 40px 40px, 100% 100%;
}
.sv-mono { font-family: 'Share Tech Mono', 'Courier New', monospace; }
.sv-tag { font-family: 'Share Tech Mono', 'Courier New', monospace; font-size: 0.72rem; letter-spacing: 0.14em; color: #67e8f9; text-transform: uppercase; }
.sv-title { font-family: 'Rajdhani', Inter, sans-serif; font-weight: 700; letter-spacing: 0.04em; color: #f0fdff; text-shadow: 0 0 18px rgba(34, 211, 238, 0.4); margin: 0; }

.sv-sidebar {
    position: fixed; top: 0; left: 0; bottom: 0; width: 250px; box-sizing: border-box;
    background: rgba(7, 14, 28, 0.96); border-right: 1px solid rgba(34, 211, 238, 0.18);
    padding: 1.5rem 1rem; display: flex; flex-direction: column; justify-content: space-between; z-index: 50;
}
.sv-main { flex: 1; margin-left: 250px; padding: 2rem 2.5rem; box-sizing: border-box; min-width: 0; }

.sv-logo { display: flex; align-items: center; gap: 0.5rem; color: #38bdf8; font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 1.35rem; letter-spacing: 0.05em; margin: 0 0 1.8rem 0.4rem; text-shadow: 0 0 14px rgba(56, 189, 248, 0.6); }
.sv-profilebox { background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 12px; padding: 0.85rem; margin-bottom: 1.4rem; display: flex; align-items: center; gap: 0.75rem; box-shadow: 0 0 14px rgba(168, 85, 247, 0.15); }
.sv-avatar { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #a855f7, #0284c7); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; }
.sv-avatar.sm { width: 30px; height: 30px; font-size: 0.8rem; background: linear-gradient(135deg, #0891b2, #22d3ee); }

.sv-nav { display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.72rem 0.85rem; border-radius: 10px; border: 1px solid transparent; background: transparent; color: #94a3b8; font-weight: 500; cursor: pointer; font-size: 0.86rem; text-align: left; margin-bottom: 0.35rem; }
.sv-nav:hover { background: rgba(34, 211, 238, 0.07); color: #cffafe; }
.sv-nav.active { background: rgba(34, 211, 238, 0.12); border-color: rgba(34, 211, 238, 0.4); color: #22d3ee; font-weight: 700; box-shadow: 0 0 14px rgba(34, 211, 238, 0.18); }
.sv-nav .sv-count { margin-left: auto; background: #f87171; color: #0f172a; border-radius: 10px; padding: 0.05rem 0.45rem; font-size: 0.68rem; font-weight: 800; }
.sv-nav .sv-count.warn { background: #facc15; }

.sv-card { position: relative; background: rgba(8, 20, 34, 0.74); border: 1px solid rgba(34, 211, 238, 0.26); border-radius: 14px; padding: 1.4rem; box-shadow: 0 0 22px rgba(8, 145, 178, 0.13), inset 0 0 18px rgba(34, 211, 238, 0.04); backdrop-filter: blur(4px); }
.sv-card::before, .sv-card::after { content: ''; position: absolute; width: 14px; height: 14px; border-color: #22d3ee; border-style: solid; filter: drop-shadow(0 0 4px #22d3ee); pointer-events: none; }
.sv-card::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; border-top-left-radius: 14px; }
.sv-card::after { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; border-bottom-right-radius: 14px; }
.sv-card.purple { border-color: rgba(168, 85, 247, 0.4); }
.sv-card.purple::before, .sv-card.purple::after { border-color: #c084fc; filter: drop-shadow(0 0 4px #c084fc); }
.sv-card.clickable { cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; }
.sv-card.clickable:hover { transform: translateY(-2px); box-shadow: 0 0 28px rgba(34, 211, 238, 0.3); }
.sv-card.selected { box-shadow: 0 0 30px rgba(34, 211, 238, 0.45); border-color: #22d3ee; }
.sv-intern { min-width: 235px; max-width: 270px; padding: 0.9rem 1rem; flex-shrink: 0; }

.sv-live { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px #34d399; margin-right: 0.5rem; animation: svPulse 1.6s infinite; }
@keyframes svPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.8); } }
.sv-topline { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.3rem; padding-bottom: 0.6rem; border-bottom: 1px solid rgba(34, 211, 238, 0.15); }

.sv-btn { background: linear-gradient(135deg, #0891b2, #0e7490); border: 1px solid #22d3ee; color: #ecfeff; padding: 0.6rem 1.2rem; border-radius: 10px; cursor: pointer; font-family: 'Share Tech Mono', monospace; font-size: 0.8rem; letter-spacing: 0.07em; text-transform: uppercase; display: inline-flex; align-items: center; gap: 0.5rem; box-shadow: 0 0 14px rgba(34, 211, 238, 0.3); transition: box-shadow 0.2s, transform 0.2s; }
.sv-btn:hover:not(:disabled) { box-shadow: 0 0 24px rgba(34, 211, 238, 0.65); transform: translateY(-1px); }
.sv-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.sv-btn.green { background: linear-gradient(135deg, #059669, #047857); border-color: #34d399; box-shadow: 0 0 14px rgba(52, 211, 153, 0.3); }
.sv-btn.danger { background: linear-gradient(135deg, #dc2626, #991b1b); border-color: #f87171; box-shadow: 0 0 14px rgba(248, 113, 113, 0.3); }
.sv-btn.ghost { background: rgba(255, 255, 255, 0.04); border-color: rgba(148, 163, 184, 0.35); color: #94a3b8; box-shadow: none; }
.sv-btn.sm { padding: 0.38rem 0.75rem; font-size: 0.72rem; border-radius: 8px; }

.sv-chip { padding: 0.4rem 0.9rem; border-radius: 999px; border: 1px solid rgba(34, 211, 238, 0.3); background: rgba(8, 20, 34, 0.6); color: #94a3b8; cursor: pointer; font-family: 'Share Tech Mono', monospace; font-size: 0.74rem; letter-spacing: 0.06em; text-transform: uppercase; }
.sv-chip.active { background: rgba(34, 211, 238, 0.18); color: #22d3ee; border-color: #22d3ee; box-shadow: 0 0 12px rgba(34, 211, 238, 0.35); }
.sv-chip.suggest { text-transform: none; font-size: 0.72rem; }

.sv-table-wrap { overflow-x: auto; }
.sv-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.825rem; }
.sv-table th { padding: 0.85rem; font-family: 'Share Tech Mono', monospace; font-weight: 400; font-size: 0.72rem; letter-spacing: 0.12em; color: #67e8f9; text-transform: uppercase; border-bottom: 1px solid rgba(34, 211, 238, 0.3); white-space: nowrap; }
.sv-table td { padding: 0.8rem 0.85rem; border-bottom: 1px solid rgba(34, 211, 238, 0.07); vertical-align: middle; }
.sv-table tbody tr:hover { background: rgba(34, 211, 238, 0.05); }

.sv-badge { font-family: 'Share Tech Mono', monospace; padding: 0.28rem 0.7rem; border-radius: 6px; font-size: 0.72rem; letter-spacing: 0.1em; border: 1px solid; white-space: nowrap; display: inline-block; }
.sv-badge.approved { color: #34d399; border-color: #34d399; background: rgba(16, 185, 129, 0.12); box-shadow: 0 0 10px rgba(52, 211, 153, 0.3); }
.sv-badge.rejected { color: #f87171; border-color: #f87171; background: rgba(239, 68, 68, 0.12); box-shadow: 0 0 10px rgba(248, 113, 113, 0.3); }
.sv-badge.pending { color: #facc15; border-color: #facc15; background: rgba(245, 158, 11, 0.12); box-shadow: 0 0 10px rgba(250, 204, 21, 0.25); }
.sv-badge.muted { color: #94a3b8; border-color: #475569; background: rgba(71, 85, 105, 0.15); }
.sv-badge.sm { font-size: 0.64rem; padding: 0.14rem 0.5rem; }

.sv-proof { background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; padding: 0.35rem 0.65rem; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; font-family: 'Share Tech Mono', monospace; white-space: nowrap; }
.sv-proof:hover { box-shadow: 0 0 12px rgba(56, 189, 248, 0.5); }

.sv-input { width: 100%; background: rgba(3, 12, 22, 0.85); border: 1px solid rgba(34, 211, 238, 0.3); border-radius: 8px; padding: 0.62rem 0.7rem; color: #e0f7ff; outline: none; box-sizing: border-box; font-family: 'Share Tech Mono', monospace; font-size: 0.83rem; }
.sv-input:focus { border-color: #22d3ee; box-shadow: 0 0 12px rgba(34, 211, 238, 0.4); }
.sv-label { display: block; margin-bottom: 0.35rem; }
.sv-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.sv-grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.1rem; }
.sv-grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.1rem; }

.sv-overlay { position: fixed; inset: 0; background: rgba(0, 4, 10, 0.82); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; }
.sv-modal { position: relative; background: #07121f; border: 1px solid rgba(34, 211, 238, 0.4); border-radius: 16px; box-shadow: 0 0 40px rgba(8, 145, 178, 0.35), 0 20px 50px rgba(0, 0, 0, 0.8); }
.sv-close { background: transparent; border: none; color: #94a3b8; cursor: pointer; }
.sv-close:hover { color: #22d3ee; }

.sv-toast { position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 5000; padding: 0.8rem 1.1rem; border-radius: 10px; font-family: 'Share Tech Mono', monospace; font-size: 0.82rem; border: 1px solid; background: #07121f; max-width: 380px; animation: svSlide 0.25s ease; }
.sv-toast.success { color: #34d399; border-color: #34d399; box-shadow: 0 0 18px rgba(52, 211, 153, 0.4); }
.sv-toast.error { color: #f87171; border-color: #f87171; box-shadow: 0 0 18px rgba(248, 113, 113, 0.4); }
.sv-toast.info { color: #67e8f9; border-color: #22d3ee; box-shadow: 0 0 18px rgba(34, 211, 238, 0.4); }
@keyframes svSlide { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.sv-bar { height: 8px; border-radius: 99px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
.sv-bar > div { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #0891b2, #22d3ee); box-shadow: 0 0 8px rgba(34, 211, 238, 0.6); transition: width 0.6s; }
.sv-bar.purple > div { background: linear-gradient(90deg, #7c3aed, #c084fc); box-shadow: 0 0 8px rgba(192, 132, 252, 0.6); }

.sv-check { display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.8rem; border-radius: 10px; border: 1px solid rgba(34, 211, 238, 0.2); background: rgba(3, 12, 22, 0.6); cursor: pointer; font-size: 0.84rem; }
.sv-check input { accent-color: #22d3ee; width: 16px; height: 16px; }
.sv-check.on { border-color: #34d399; background: rgba(16, 185, 129, 0.1); color: #34d399; }

.sv-star { width: 34px; height: 34px; border-radius: 8px; border: 1px solid rgba(168, 85, 247, 0.4); background: rgba(3, 12, 22, 0.7); color: #94a3b8; cursor: pointer; font-family: 'Share Tech Mono', monospace; }
.sv-star.on { background: rgba(168, 85, 247, 0.3); border-color: #c084fc; color: #f5d0fe; box-shadow: 0 0 10px rgba(192, 132, 252, 0.5); }

.sv-print-only { display: none; }

@media print {
    .sv-sidebar, .no-print, .sv-toast { display: none !important; }
    .sv-root { background: #fff !important; }
    .sv-main { margin-left: 0 !important; padding: 0 !important; }
    .sv-card { background: #fff !important; border: 1px solid #999 !important; box-shadow: none !important; }
    .sv-card::before, .sv-card::after { display: none !important; }
    .sv-print-only { display: block !important; margin-bottom: 1rem; }
    .sv-root * { color: #000 !important; text-shadow: none !important; }
    .sv-badge { border-color: #000 !important; background: #fff !important; box-shadow: none !important; }
}
`;

/* ================= RING GAUGE (SVG) ================= */
function RingGauge({ percent = 0, size = 110, stroke = 9, color = '#22d3ee', children }) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (Math.max(0, Math.min(100, percent)) / 100) * c;
    return (
        <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
                <circle
                    cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={offset}
                    style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dashoffset 0.8s ease' }}
                />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                {children}
            </div>
        </div>
    );
}

export default function SupervisorDashboard({ supervisorName = 'Friessy Ferry', onLogout }) {
    // Galing sa backend: lahat ng DTR (may student_name) at ang listahan ng mga student/intern
    const [allLogsRaw, setAllLogsRaw] = useState([]);
    const [internsRaw, setInternsRaw] = useState([]);
    const [backendError, setBackendError] = useState(false);
    const [selectedPid, setSelectedPid] = useState('all'); // 'all' o user ID ng intern
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [activeTab, setActiveTab] = useState('dashboard');

    // Chat state
    const [activeChatLog, setActiveChatLog] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [isSendingChat, setIsSendingChat] = useState(false);
    const chatEndRef = useRef(null);

    // Action modal (approve / reject / bulk)
    const [actionModal, setActionModal] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [isActing, setIsActing] = useState(false);

    // Toast
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);

    // Intern profiles (bawat intern may sariling profile / MOA, naka-save sa database)
    const [profiles, setProfiles] = useState({});
    const [draft, setDraft] = useState(DEFAULT_PROFILE);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isUploadingMoa, setIsUploadingMoa] = useState(false);
    const internsJson = useRef('');

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3800);
    }, []);

    /* ---------- FETCH: LAHAT NG DTR + LISTAHAN NG INTERNS ---------- */
    const refresh = useCallback(async () => {
        try {
            const [logsRes, internsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/dtr/all`),
                fetch(`${API_BASE_URL}/api/interns`)
            ]);

            if (logsRes.ok) {
                const data = await logsRes.json();
                if (Array.isArray(data)) setAllLogsRaw(data);
            }

            if (internsRes.ok) {
                const data = await internsRes.json();
                if (Array.isArray(data)) {
                    const json = JSON.stringify(data);
                    if (json !== internsJson.current) {
                        internsJson.current = json;
                        setInternsRaw(data);
                    }
                }
            }

            setBackendError(!logsRes.ok && !internsRes.ok);
        } catch (error) {
            console.error('Error fetching supervisor data:', error);
            setBackendError(true);
        }
    }, []);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 4000);
        return () => clearInterval(interval);
    }, [refresh]);

    // I-group ang DTR bawat intern (user_id)
    const logsByPid = {};
    allLogsRaw.forEach(l => {
        const uid = Number(l.user_id);
        if (!uid) return;
        if (!logsByPid[uid]) logsByPid[uid] = [];
        logsByPid[uid].push(l);
    });

    const pidList = Array.from(new Set([
        ...internsRaw.map(i => Number(i.id)),
        ...Object.keys(logsByPid).map(Number)
    ])).filter(Boolean).sort((a, b) => a - b);

    // Profile ng bawat intern ay galing sa database (/api/interns)
    useEffect(() => {
        const map = {};
        internsRaw.forEach(i => { map[Number(i.id)] = mergeProfile(i); });
        setProfiles(map);
    }, [internsRaw]);

    // Live sync ng bukas na chat window
    useEffect(() => {
        setActiveChatLog(prev => {
            if (!prev) return null;
            const found = allLogsRaw.find(l => idOf(l) === idOf(prev));
            return found ? { ...found, _pid: Number(found.user_id) } : prev;
        });
    }, [allLogsRaw]);

    /* ---------- CHAT AUTO-SCROLL ---------- */
    const activeMessagesCount = activeChatLog?.messages?.length || 0;
    useEffect(() => {
        if (activeMessagesCount > 0) {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [activeMessagesCount]);

    /* ---------- DERIVED: INTERNS ---------- */
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getProfile = (pid) => profiles[pid] || DEFAULT_PROFILE;
    const tag = (pid, arr) => (arr || []).map(l => ({ ...l, _pid: pid }));

    // Pangalan: laging galing sa student account (users table)
    const nameFor = (pid) => {
        const intern = internsRaw.find(i => Number(i.id) === Number(pid));
        const fromAccount = intern && (intern.full_name || intern.internName);
        const fromLogs = (logsByPid[pid] || []).map(nameOfLog).find(Boolean);
        return fromAccount || fromLogs || `Intern #${pid}`;
    };

    const allLogs = pidList.flatMap(pid => tag(pid, logsByPid[pid]));

    const internList = pidList.map(pid => {
        const logs = logsByPid[pid] || [];
        const prof = getProfile(pid);
        const approved = logs.filter(l => statusOf(l) === 'approved');
        const hours = approved.reduce((s, l) => s + hoursOf(l), 0);
        const required = Number(prof.requiredHours) || 500;
        return {
            pid,
            name: nameFor(pid),
            school: prof.school,
            course: prof.course,
            logs,
            pending: logs.filter(l => statusOf(l) === 'pending').length,
            hours,
            required,
            pct: Math.min(100, Math.round((hours / required) * 100)),
            moa: getMoaState(prof, today),
            unread: logs.filter(needsReply).length
        };
    });

    // Search by pangalan: kung isang intern lang ang tumugma, siya ang ipapakita
    const query = searchTerm.trim().toLowerCase();
    const nameMatches = query ? internList.filter(i => i.name.toLowerCase().includes(query)) : [];
    const searchPid = activeTab === 'dashboard' && selectedPid === 'all' && nameMatches.length === 1 ? nameMatches[0].pid : null;

    // listPid: aling intern ang nakatutok sa listahan (null = lahat)
    const listPid = activeTab === 'dashboard'
        ? (selectedPid !== 'all' ? selectedPid : searchPid)
        : (selectedPid !== 'all' ? selectedPid : null);

    // activePid: para sa mga tab na isang intern lang ang ipinapakita (Profile, AI, Reports)
    const activePid = selectedPid !== 'all' ? selectedPid : (searchPid ?? pidList[0] ?? 0);
    const highlightPid = activeTab === 'dashboard' || activeTab === 'messages' ? listPid : activePid;

    const scopeLogs = listPid != null ? tag(listPid, logsByPid[listPid]) : allLogs;
    const sortedScope = [...scopeLogs].sort((a, b) => (dateOf(b) > dateOf(a) ? 1 : dateOf(b) < dateOf(a) ? -1 : 0));

    const pendingScope = scopeLogs.filter(l => statusOf(l) === 'pending');
    const approvedScopeCount = scopeLogs.filter(l => statusOf(l) === 'approved').length;
    const rejectedScopeCount = scopeLogs.filter(l => statusOf(l) === 'rejected').length;

    const filteredLogs = sortedScope.filter(log => {
        const matchesSearch = !query
            || dateOf(log).toLowerCase().includes(query)
            || notesOf(log).toLowerCase().includes(query)
            || nameFor(log._pid).toLowerCase().includes(query);
        const matchesStatus = statusFilter === 'all' || statusOf(log) === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // Navigation badges (lahat ng interns)
    const pendingAll = allLogs.filter(l => statusOf(l) === 'pending').length;
    const unreadAll = allLogs.filter(needsReply).length;

    // Threads (Student Discussions)
    const threads = sortedScope
        .filter(log => log.messages && log.messages.length > 0)
        .sort((a, b) => Number(needsReply(b)) - Number(needsReply(a)));
    const threadsWaiting = threads.filter(needsReply).length;

    /* ---------- DERIVED: ISANG INTERN (Profile / AI / Reports) ---------- */
    const profile = getProfile(activePid);
    const activeName = nameFor(activePid);
    const activeLogs = logsByPid[activePid] || [];
    const approvedLogs = activeLogs.filter(l => statusOf(l) === 'approved');
    const requiredHours = Number(profile.requiredHours) || 500;
    const totalApprovedHours = approvedLogs.reduce((sum, l) => sum + hoursOf(l), 0);
    const completionPct = Math.min(100, Math.round((totalApprovedHours / requiredHours) * 100));
    const remainingHours = Math.max(0, requiredHours - totalApprovedHours);
    const avgDaily = approvedLogs.length ? totalApprovedHours / approvedLogs.length : 8;
    const daysLeft = remainingHours > 0 && avgDaily > 0 ? Math.ceil(remainingHours / avgDaily) : 0;
    const etaDate = remainingHours > 0 ? addBusinessDays(today, daysLeft) : null;

    const moaState = getMoaState(profile, today);
    const reqDone = REQUIREMENTS.filter(r => profile[r.key]).length;
    const reqPct = Math.round((reqDone / REQUIREMENTS.length) * 100);
    const internEndDate = parseDate(profile.internshipEnd);
    const moaEndDate = parseDate(profile.moaValidUntil);
    const moaCoverageWarning = internEndDate && moaEndDate && internEndDate > moaEndDate;

    // Clearance card sa dashboard (sumusunod sa nakatutok na intern)
    const focusProfile = listPid != null ? getProfile(listPid) : null;
    const focusMoa = focusProfile ? getMoaState(focusProfile, today) : null;
    const focusReqDone = focusProfile ? REQUIREMENTS.filter(r => focusProfile[r.key]).length : 0;
    const focusInfo = listPid != null ? internList.find(i => i.pid === listPid) : null;
    const focusCoverageWarning = focusProfile
        && parseDate(focusProfile.internshipEnd) && parseDate(focusProfile.moaValidUntil)
        && parseDate(focusProfile.internshipEnd) > parseDate(focusProfile.moaValidUntil);

    // Weekly approved-hours chart
    const weeklyMap = {};
    approvedLogs.forEach(l => {
        const d = parseDate(dateOf(l));
        if (!d) return;
        const key = weekStartKey(d);
        weeklyMap[key] = (weeklyMap[key] || 0) + hoursOf(l);
    });
    const weeklyData = Object.keys(weeklyMap).sort().slice(-8).map(k => ({ week: k, hours: weeklyMap[k] }));
    const weeklyMax = Math.max(1, ...weeklyData.map(w => w.hours));

    // Keyword-based skill analysis
    const analyzable = activeLogs.filter(l => statusOf(l) !== 'rejected');
    const skillScores = SKILL_KEYWORDS.map(skill => {
        const regexes = skill.words.map(w => new RegExp(`\\b${w}`, 'i'));
        const matched = analyzable.filter(l => regexes.some(rx => rx.test(notesOf(l)))).length;
        const pct = analyzable.length ? Math.min(100, Math.round((matched / analyzable.length) * 100)) : 0;
        return { name: skill.name, matched, pct };
    });
    const scoreOf = (name) => (skillScores.find(s => s.name === name) || { pct: 0 }).pct;
    const roleProjection = [
        { role: 'Full-Stack Web Developer', pct: Math.round((scoreOf('Frontend / UI Development') + scoreOf('Backend & API (REST)')) / 2) },
        { role: 'Backend Systems Engineer', pct: Math.round((scoreOf('Backend & API (REST)') + scoreOf('Database & Data Handling')) / 2) },
        { role: 'Front-End / UI Developer', pct: Math.round((scoreOf('Frontend / UI Development') + scoreOf('Documentation & Reporting')) / 2) },
        { role: 'QA & Security Support', pct: Math.round((scoreOf('Debugging & Testing') + scoreOf('Security & Audit')) / 2) }
    ].sort((a, b) => b.pct - a.pct).slice(0, 3);

    const ratingValues = Object.values(profile.rating || {}).filter(v => v > 0);
    const avgRating = ratingValues.length ? (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(1) : null;

    // Draft ng profile form: sumusunod sa intern na pinili
    const savedProfileForActive = profiles[activePid];
    useEffect(() => {
        setDraft(savedProfileForActive || DEFAULT_PROFILE);
    }, [activePid, savedProfileForActive]);

    const isDirty = JSON.stringify(draft) !== JSON.stringify(profile);

    /* ---------- SAVE PROFILE (sa database) ---------- */
    const persistProfile = async (pid, next, silent = false) => {
        if (!pid) return false;
        setIsSavingProfile(true);

        const payload = { ...next };
        SERVER_ONLY_FIELDS.forEach(k => { delete payload[k]; });

        let ok = false;
        try {
            const res = await fetch(`${API_BASE_URL}/api/interns/${pid}/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            ok = res.ok;
        } catch (e) { /* ignore */ }

        if (ok) {
            setProfiles(p => ({ ...p, [pid]: next }));
            refresh();
        }
        setIsSavingProfile(false);

        if (!ok) showToast('Hindi na-save ang profile. Check kung tumatakbo ang backend.', 'error');
        else if (!silent) showToast(`Na-save sa database ang profile ni ${nameFor(pid)}.`, 'success');
        return ok;
    };

    const setField = (key, value) => setDraft(d => ({ ...d, [key]: value }));

    const saveRating = (key, value) => {
        const rating = { ...profile.rating, [key]: value };
        persistProfile(activePid, { ...profile, rating }, true);
    };

    const handleMoaUpload = async (file) => {
        if (!file) return;
        setIsUploadingMoa(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch(`${API_BASE_URL}/api/upload`, { method: 'POST', body: form });
            if (!res.ok) throw new Error('Upload failed');
            const json = await res.json();
            if (!json.proof_url) throw new Error('No URL returned');
            await persistProfile(activePid, { ...draft, moaFileUrl: json.proof_url }, true);
            showToast('Na-upload at na-save ang MOA document.', 'success');
        } catch (e) {
            console.error(e);
            showToast('Hindi na-upload ang MOA file. Check kung gumagana ang backend.', 'error');
        } finally {
            setIsUploadingMoa(false);
        }
    };

    /* ---------- APPROVE / REJECT ---------- */
    const updateStatus = async (log, status, reason = '') => {
        const logId = idOf(log);
        try {
            const response = await fetch(`${API_BASE_URL}/api/dtr/${logId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status,
                    ...(reason ? { remarks: reason, supervisor_comment: reason, rejection_reason: reason } : {})
                })
            });
            if (!response.ok) return false;

            // Siguraduhing makikita ng student ang dahilan: i-post din bilang chat message
            if (status === 'REJECTED' && reason) {
                const text = `REJECTED: ${reason}`;
                await fetch(`${API_BASE_URL}/api/dtr/${logId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sender: 'supervisor',
                        message: text,
                        text,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    })
                }).catch(() => { });
            }
            return true;
        } catch (error) {
            console.error(`Error updating status to ${status}:`, error);
            return false;
        }
    };

    const openAction = (type, log = null) => {
        setRejectReason('');
        setActionModal({ type, log });
    };

    const closeAction = () => {
        if (isActing) return;
        setActionModal(null);
        setRejectReason('');
    };

    const confirmAction = async () => {
        if (!actionModal) return;
        const { type, log } = actionModal;
        setIsActing(true);

        if (type === 'approve') {
            const ok = await updateStatus(log, 'APPROVED');
            showToast(ok ? `Na-approve ang DTR ni ${nameFor(log._pid)} (${fmtDate(dateOf(log))}).` : 'Hindi na-approve. Subukan ulit.', ok ? 'success' : 'error');
        } else if (type === 'reject') {
            const ok = await updateStatus(log, 'REJECTED', rejectReason.trim());
            showToast(ok ? `Na-reject ang DTR ni ${nameFor(log._pid)}. Makikita ng student ang dahilan.` : 'Hindi na-reject. Subukan ulit.', ok ? 'success' : 'error');
        } else if (type === 'bulk') {
            let done = 0;
            for (const l of pendingScope) {
                // eslint-disable-next-line no-await-in-loop
                const ok = await updateStatus(l, 'APPROVED');
                if (ok) done += 1;
            }
            showToast(`Na-approve ang ${done} sa ${pendingScope.length} na pending DTR.`, done === pendingScope.length ? 'success' : 'error');
        }

        setIsActing(false);
        setActionModal(null);
        setRejectReason('');
        refresh(false);
    };

    /* ---------- CHAT ---------- */
    const handleSendReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim() || !activeChatLog || isSendingChat) return;

        setIsSendingChat(true);
        const logId = idOf(activeChatLog);
        const currentText = replyText.trim();
        setReplyText('');

        const messagePayload = {
            sender: 'supervisor',
            message: currentText,
            text: currentText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setActiveChatLog(prev => prev ? { ...prev, messages: [...(prev.messages || []), messagePayload] } : null);

        try {
            const response = await fetch(`${API_BASE_URL}/api/dtr/${logId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messagePayload)
            });
            if (response.ok) await refresh(false);
        } catch (error) {
            console.error("Error sending supervisor message:", error);
            showToast('Hindi naipadala ang mensahe.', 'error');
        } finally {
            setIsSendingChat(false);
        }
    };

    /* ---------- EXPORT CSV (para sa napiling intern) ---------- */
    const handleExportCSV = () => {
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = [['Date', 'Time In', 'Time Out', 'Hours', 'Accomplishments', 'Status']];
        [...activeLogs].sort((a, b) => (dateOf(a) > dateOf(b) ? 1 : -1)).forEach(l => {
            rows.push([dateOf(l), l.time_in || l.timeIn || '', l.time_out || l.timeOut || '', hoursOf(l), notesOf(l), (l.status || 'PENDING').toUpperCase()]);
        });
        const csv = rows.map(r => r.map(esc).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DTR_Report_${activeName.replace(/\s+/g, '_')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Na-download ang CSV report ni ${activeName}.`, 'success');
    };

    const handleLogout = () => {
        if (onLogout) onLogout();
        else {
            localStorage.removeItem('token');
            window.location.reload();
        }
    };

    const pickIntern = (pid) => {
        setSelectedPid(pid);
        setSearchTerm('');
        setStatusFilter('all');
    };

    /* ---------- LAYOUT DATA ---------- */
    const navItems = [
        { id: 'dashboard', label: 'DTR Review Portal', icon: LayoutDashboard, badge: pendingAll, warn: true },
        { id: 'intern', label: 'Intern Profile & MOA', icon: GraduationCap },
        { id: 'ai_evaluation', label: 'Intern AI Evaluation', icon: Bot },
        { id: 'messages', label: 'Student Discussions', icon: MessageSquare, badge: unreadAll },
        { id: 'reports', label: 'DTR Summary Reports', icon: FileText }
    ];

    const tabTitles = {
        dashboard: 'SUPERVISOR PORTAL',
        intern: 'INTERN PROFILE & MOA',
        ai_evaluation: 'INTERN AI EVALUATION',
        messages: 'STUDENT DISCUSSIONS',
        reports: 'DTR SUMMARY REPORTS'
    };
    const tabSubtitles = {
        dashboard: 'Review student DTR submissions, approve hours, and give feedback',
        intern: `Paaralan, MOA, requirements at detalye ng internship ni ${activeName}`,
        ai_evaluation: `Skills at career projection ni ${activeName} mula sa kanyang DTR entries`,
        messages: 'Mga usapan ninyo ng mga intern bawat DTR entry',
        reports: `Opisyal na ulat ng oras ni ${activeName} para sa paaralan`
    };

    const showAllCard = activeTab === 'dashboard' || activeTab === 'messages';

    /* ================= RENDER ================= */
    return (
        <div className="sv-root">
            <style>{cyberCSS}</style>

            {/* ============ SIDEBAR ============ */}
            <div className="sv-sidebar">
                <div>
                    <div className="sv-logo"><span>⚡</span> SmartFolio Hub</div>

                    <div className="sv-profilebox">
                        <div className="sv-avatar">{(supervisorName || 'S').charAt(0).toUpperCase()}</div>
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {supervisorName}
                            </div>
                            <div className="sv-mono" style={{ color: '#c084fc', fontSize: '0.7rem' }}>OJT Supervisor Portal</div>
                        </div>
                    </div>

                    {navItems.map(item => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                className={`sv-nav ${activeTab === item.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(item.id)}
                            >
                                <Icon size={18} /> {item.label}
                                {item.badge > 0 && <span className={`sv-count ${item.warn ? 'warn' : ''}`}>{item.badge}</span>}
                            </button>
                        );
                    })}
                </div>

                <button
                    type="button"
                    onClick={handleLogout}
                    className="sv-nav"
                    style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)', fontWeight: 'bold', marginBottom: 0 }}
                >
                    <LogOut size={16} /> Logout Portal
                </button>
            </div>

            {/* ============ MAIN ============ */}
            <div className="sv-main">
                <div className="sv-topline no-print">
                    <span className="sv-tag"><span className="sv-live" />SYS ONLINE // SUPERVISOR SESSION</span>
                    <span className="sv-tag" style={{ color: '#64748b' }}>{internList.length} INTERN(S) MONITORED | DTR & INTERNSHIP HUB</span>
                </div>

                {/* PAGE HEADER */}
                <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                        <h1 className="sv-title" style={{ fontSize: '2.1rem' }}>{tabTitles[activeTab]}</h1>
                        <p className="sv-tag" style={{ margin: '0.3rem 0 0 0', color: '#64748b' }}>[ {tabSubtitles[activeTab]} ]</p>
                    </div>

                    {activeTab === 'dashboard' && (
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', width: '290px' }}>
                                <Search size={15} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    className="sv-input"
                                    placeholder="Search intern name, date or notes..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{ paddingLeft: '2.2rem' }}
                                />
                            </div>
                            <button
                                type="button"
                                className="sv-btn green"
                                disabled={pendingScope.length === 0}
                                onClick={() => openAction('bulk')}
                            >
                                <CheckCheck size={16} /> Approve All Pending ({pendingScope.length})
                            </button>
                        </div>
                    )}
                </div>

                {backendError && (
                    <div className="sv-card no-print" style={{ marginBottom: '1rem', borderColor: '#f87171', color: '#f87171', display: 'flex', gap: '0.7rem', alignItems: 'center', fontSize: '0.85rem' }}>
                        <AlertTriangle size={18} /> Hindi maabot ang backend ({API_BASE_URL}). Siguraduhing tumatakbo ang FastAPI server.
                    </div>
                )}
                {!backendError && internList.length === 0 && (
                    <div className="sv-card no-print sv-mono" style={{ marginBottom: '1rem', color: '#94a3b8', fontSize: '0.82rem' }}>
                        // Wala pang registered na student account.
                    </div>
                )}

                {/* ============ INTERN SELECTOR (nasa lahat ng tab) ============ */}
                <div className="no-print" style={{ display: 'flex', gap: '0.9rem', overflowX: 'auto', padding: '0.3rem 0.2rem 0.8rem 0.2rem', marginBottom: '0.8rem' }}>
                    {showAllCard && (
                        <div
                            className={`sv-card clickable sv-intern ${highlightPid == null ? 'selected' : ''}`}
                            onClick={() => pickIntern('all')}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div className="sv-avatar sm"><Users size={15} /></div>
                                <div>
                                    <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.88rem' }}>All Interns</div>
                                    <div className="sv-mono" style={{ fontSize: '0.68rem', color: '#64748b' }}>{internList.length} intern(s)</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
                                <span className={`sv-badge sm ${pendingAll > 0 ? 'pending' : 'muted'}`}>{pendingAll} pending</span>
                                {unreadAll > 0 && <span className="sv-badge sm rejected">{unreadAll} reply</span>}
                            </div>
                        </div>
                    )}

                    {internList.map(i => (
                        <div
                            key={i.pid}
                            className={`sv-card clickable sv-intern ${highlightPid === i.pid ? 'selected' : ''}`}
                            onClick={() => pickIntern(i.pid)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div className="sv-avatar sm">{i.name.charAt(0).toUpperCase()}</div>
                                <div style={{ overflow: 'hidden' }}>
                                    <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.name}</div>
                                    <div className="sv-mono" style={{ fontSize: '0.66rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {i.school || 'Walang school info'}
                                    </div>
                                </div>
                            </div>
                            <div className="sv-bar" style={{ marginTop: '0.7rem' }}><div style={{ width: `${i.pct}%` }} /></div>
                            <div className="sv-mono" style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.3rem' }}>{i.hours} / {i.required} hrs</div>
                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.55rem', flexWrap: 'wrap' }}>
                                {i.pending > 0 && <span className="sv-badge sm pending">{i.pending} pending</span>}
                                {i.unread > 0 && <span className="sv-badge sm rejected">{i.unread} reply</span>}
                                <span className={`sv-badge sm ${i.moa.cls}`}>MOA: {i.moa.label}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ================= TAB: DTR REVIEW ================= */}
                {activeTab === 'dashboard' && (
                    <div>
                        {/* CLEARANCE CARD: sumusunod sa intern na napili / hinanap */}
                        {focusProfile ? (
                            <div className="sv-card" style={{ marginBottom: '1.4rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', gap: '1rem', flexWrap: 'wrap' }}>
                                    <h3 className="sv-tag" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                        <GraduationCap size={18} /> Intern Educational Clearance & Institutional Records
                                    </h3>
                                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                                        <span className={`sv-badge ${focusMoa.cls}`}>MOA: {focusMoa.label}</span>
                                        <button type="button" className="sv-btn ghost sm" onClick={() => { setSelectedPid(listPid); setActiveTab('intern'); }}>Edit Details</button>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1.1rem', alignItems: 'center', color: '#cbd5e1', fontSize: '0.83rem', flexWrap: 'wrap' }}>
                                    <div>Intern: <strong style={{ color: '#fff' }}>{focusInfo?.name}</strong></div>
                                    <span style={{ color: '#475569' }}>•</span>
                                    <div>School: <strong style={{ color: '#fff' }}>{focusProfile.school || '—'}</strong></div>
                                    <span style={{ color: '#475569' }}>•</span>
                                    <div>Degree: <strong style={{ color: '#38bdf8' }}>{focusProfile.course || '—'}</strong></div>
                                    <span style={{ color: '#475569' }}>•</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: focusReqDone === REQUIREMENTS.length ? '#34d399' : '#facc15', fontWeight: 700 }}>
                                        <FileCheck size={14} /> Requirements: {focusReqDone}/{REQUIREMENTS.length}
                                    </div>
                                </div>
                                {(focusMoa.cls === 'rejected' || focusMoa.cls === 'pending' || focusCoverageWarning) && (
                                    <div style={{ marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#facc15', fontSize: '0.8rem' }}>
                                        <AlertTriangle size={15} />
                                        {focusCoverageWarning ? 'Mas matagal ang internship period kaysa sa validity ng MOA. Paki-renew ang MOA.' : focusMoa.note}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="sv-card" style={{ marginBottom: '1.4rem' }}>
                                <h3 className="sv-tag" style={{ margin: '0 0 0.6rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                    <Users size={18} /> All Interns Overview
                                </h3>
                                <div style={{ color: '#94a3b8', fontSize: '0.83rem', lineHeight: 1.6 }}>
                                    Nakikita mo ang DTR ng <strong style={{ color: '#fff' }}>{internList.length}</strong> intern. Pumili ng intern sa itaas, o i-search ang pangalan niya, para makita ang kanyang school, MOA at requirements.
                                    {internList.some(i => i.moa.cls === 'rejected' || i.moa.cls === 'pending') && (
                                        <span style={{ color: '#facc15' }}> May intern na may MOA na kailangang asikasuhin.</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* METRIC CARDS (clickable filters) */}
                        <div className="sv-grid4" style={{ marginBottom: '1.6rem' }}>
                            <div className={`sv-card clickable ${statusFilter === 'pending' ? 'selected' : ''}`} style={{ textAlign: 'center' }} onClick={() => setStatusFilter('pending')}>
                                <div className="sv-title" style={{ fontSize: '2.6rem', color: '#facc15', textShadow: '0 0 14px rgba(250,204,21,0.5)' }}>{pendingScope.length}</div>
                                <div className="sv-tag" style={{ color: '#64748b' }}>Pending Approvals</div>
                            </div>
                            <div className={`sv-card clickable ${statusFilter === 'approved' ? 'selected' : ''}`} style={{ textAlign: 'center' }} onClick={() => setStatusFilter('approved')}>
                                <div className="sv-title" style={{ fontSize: '2.6rem', color: '#34d399', textShadow: '0 0 14px rgba(52,211,153,0.5)' }}>{approvedScopeCount}</div>
                                <div className="sv-tag" style={{ color: '#64748b' }}>Approved Logs</div>
                            </div>
                            <div className={`sv-card clickable ${statusFilter === 'rejected' ? 'selected' : ''}`} style={{ textAlign: 'center' }} onClick={() => setStatusFilter('rejected')}>
                                <div className="sv-title" style={{ fontSize: '2.6rem', color: '#f87171', textShadow: '0 0 14px rgba(248,113,113,0.5)' }}>{rejectedScopeCount}</div>
                                <div className="sv-tag" style={{ color: '#64748b' }}>Rejected / Needs Revision</div>
                            </div>
                            {focusInfo ? (
                                <div className="sv-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <RingGauge percent={focusInfo.pct} size={78} stroke={7}>
                                        <span className="sv-mono" style={{ fontSize: '0.95rem', color: '#22d3ee' }}>{focusInfo.pct}%</span>
                                    </RingGauge>
                                    <div>
                                        <div className="sv-title" style={{ fontSize: '1.4rem' }}>{focusInfo.hours}<span style={{ fontSize: '0.85rem', color: '#64748b' }}> / {focusInfo.required}</span></div>
                                        <div className="sv-tag" style={{ color: '#64748b' }}>Approved Hrs</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="sv-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <RingGauge percent={100} size={78} stroke={7} color="#c084fc">
                                        <Users size={24} color="#c084fc" />
                                    </RingGauge>
                                    <div>
                                        <div className="sv-title" style={{ fontSize: '1.6rem' }}>{internList.length}</div>
                                        <div className="sv-tag" style={{ color: '#64748b' }}>Active Interns</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* TABLE */}
                        <div className="sv-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem', gap: '1rem', flexWrap: 'wrap' }}>
                                <h3 className="sv-tag" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                    <FileText size={16} color="#22d3ee" /> {focusInfo ? `DTR Logs ni ${focusInfo.name}` : 'Student DTR Logs Review (All Interns)'}
                                </h3>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {[
                                        { id: 'all', label: `All (${scopeLogs.length})` },
                                        { id: 'pending', label: `Pending (${pendingScope.length})` },
                                        { id: 'approved', label: `Approved (${approvedScopeCount})` },
                                        { id: 'rejected', label: `Rejected (${rejectedScopeCount})` }
                                    ].map(f => (
                                        <button key={f.id} type="button" className={`sv-chip ${statusFilter === f.id ? 'active' : ''}`} onClick={() => setStatusFilter(f.id)}>
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="sv-table-wrap">
                                <table className="sv-table">
                                    <thead>
                                        <tr>
                                            {listPid == null && <th>Intern</th>}
                                            <th>Date</th>
                                            <th>Time</th>
                                            <th>Hours</th>
                                            <th>Accomplishments</th>
                                            <th>Proof</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLogs.length === 0 ? (
                                            <tr>
                                                <td colSpan={listPid == null ? 8 : 7} className="sv-mono" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                                    // Walang DTR logs na tumutugma sa filter.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredLogs.map((log) => {
                                                const logId = idOf(log);
                                                const st = statusOf(log);
                                                const isApproved = st === 'approved';
                                                const isRejected = st === 'rejected';
                                                const fullUrl = (u) =>
                                                    !u ? null : /^https?:\/\//i.test(u) ? u : `${API_BASE_URL}${u.startsWith('/') ? '' : '/'}${u}`;
                                                const msgCount = log.messages ? log.messages.length : 0;
                                                const waiting = needsReply(log);

                                                return (
                                                    <tr key={`${log._pid}-${logId}`}>
                                                        {listPid == null && (
                                                            <td>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => pickIntern(log._pid)}
                                                                    style={{ background: 'transparent', border: 'none', color: '#f8fafc', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                                                >
                                                                    <span className="sv-avatar sm" style={{ width: 24, height: 24, fontSize: '0.7rem' }}>{nameFor(log._pid).charAt(0).toUpperCase()}</span>
                                                                    {nameFor(log._pid)}
                                                                </button>
                                                            </td>
                                                        )}
                                                        <td className="sv-mono" style={{ color: '#22d3ee', whiteSpace: 'nowrap' }}>{dateOf(log)}</td>
                                                        <td className="sv-mono" style={{ whiteSpace: 'nowrap' }}>{log.time_in || log.timeIn || '08:00'} - {log.time_out || log.timeOut || '18:00'}</td>
                                                        <td className="sv-mono" style={{ color: '#38bdf8', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{hoursOf(log)} hrs</td>
                                                        <td style={{ color: '#94a3b8', maxWidth: '240px' }} title={notesOf(log)}>
                                                            <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{notesOf(log)}</div>
                                                        </td>
                                                        <td>
                                                            {proof ? (
                                                                <a href={proof} target="_blank" rel="noreferrer" className="sv-proof">
                                                                    <Paperclip size={13} /> View Proof <Eye size={13} />
                                                                </a>
                                                            ) : (
                                                                <span className="sv-mono" style={{ color: '#475569', fontSize: '0.75rem' }}>NO FILE</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <span className={`sv-badge ${isApproved ? 'approved' : isRejected ? 'rejected' : 'pending'}`}>
                                                                {(log.status || 'PENDING').toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                                <button type="button" className="sv-btn green sm" disabled={isApproved} onClick={() => openAction('approve', log)}>
                                                                    <CheckCircle2 size={13} /> Approve
                                                                </button>
                                                                <button type="button" className="sv-btn danger sm" disabled={isRejected} onClick={() => openAction('reject', log)}>
                                                                    <XCircle size={13} /> Reject
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="sv-btn sm"
                                                                    style={waiting ? { borderColor: '#facc15', boxShadow: '0 0 12px rgba(250,204,21,0.5)' } : {}}
                                                                    onClick={() => setActiveChatLog(log)}
                                                                    title={waiting ? 'May bagong mensahe mula sa student' : 'Buksan ang chat'}
                                                                >
                                                                    <MessageSquare size={13} /> Chat
                                                                    {msgCount > 0 && (
                                                                        <span style={{ background: waiting ? '#facc15' : '#475569', color: '#0f172a', borderRadius: '10px', padding: '0.02rem 0.4rem', fontSize: '0.68rem', fontWeight: 800 }}>
                                                                            {msgCount}
                                                                        </span>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ================= TAB: INTERN PROFILE & MOA ================= */}
                {activeTab === 'intern' && (
                    <div>
                        <div className="sv-grid3" style={{ marginBottom: '1.4rem' }}>
                            <div className="sv-card" style={{ display: 'flex', alignItems: 'center', gap: '1.1rem' }}>
                                <RingGauge percent={reqPct} size={92} stroke={8} color={reqPct === 100 ? '#34d399' : '#facc15'}>
                                    <ClipboardCheck size={26} color={reqPct === 100 ? '#34d399' : '#facc15'} />
                                </RingGauge>
                                <div>
                                    <div className="sv-tag">[ Requirements ]</div>
                                    <div className="sv-title" style={{ fontSize: '1.7rem' }}>{reqDone} / {REQUIREMENTS.length}</div>
                                    <div className="sv-tag" style={{ color: '#64748b' }}>Complete</div>
                                </div>
                            </div>

                            <div className="sv-card">
                                <div className="sv-tag">[ MOA Status ]</div>
                                <div style={{ margin: '0.6rem 0' }}><span className={`sv-badge ${moaState.cls}`} style={{ fontSize: '0.85rem' }}>{moaState.label}</span></div>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{moaState.note}</div>
                            </div>

                            <div className="sv-card">
                                <div className="sv-tag">[ Internship Progress ]</div>
                                <div className="sv-title" style={{ fontSize: '1.6rem', marginTop: '0.3rem' }}>
                                    {totalApprovedHours}<span style={{ fontSize: '0.95rem', color: '#64748b' }}> / {requiredHours} hrs</span>
                                </div>
                                <div className="sv-bar" style={{ marginTop: '0.6rem' }}><div style={{ width: `${completionPct}%` }} /></div>
                                <div className="sv-mono" style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                                    {remainingHours > 0
                                        ? `Natitira: ${remainingHours} hrs | Est. tapos: ${fmtDate(etaDate)}`
                                        : 'Kumpleto na ang required hours!'}
                                </div>
                            </div>
                        </div>

                        {moaCoverageWarning && (
                            <div className="sv-card" style={{ marginBottom: '1.4rem', borderColor: '#facc15', display: 'flex', gap: '0.7rem', alignItems: 'center', color: '#facc15', fontSize: '0.85rem' }}>
                                <AlertTriangle size={18} /> Mas matagal ang internship end date ({fmtDate(profile.internshipEnd)}) kaysa sa validity ng MOA ({fmtDate(profile.moaValidUntil)}). Makipag-ugnayan sa school coordinator para i-renew.
                            </div>
                        )}

                        <div className="sv-grid2" style={{ alignItems: 'start' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
                                <div className="sv-card">
                                    <h3 className="sv-tag" style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                        <GraduationCap size={16} /> School / Intern Information
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                                        <div className="sv-grid2">
                                            <div>
                                                <label className="sv-tag sv-label">Pangalan (galing sa student account)</label>
                                                <input className="sv-input" value={activeName} readOnly style={{ opacity: 0.8, cursor: 'not-allowed' }} />
                                            </div>
                                            <div>
                                                <label className="sv-tag sv-label">Email ng Account</label>
                                                <input className="sv-input" value={profile.email || '—'} readOnly style={{ opacity: 0.8, cursor: 'not-allowed' }} />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="sv-tag sv-label">Paaralan / University</label>
                                            <input className="sv-input" value={draft.school} onChange={(e) => setField('school', e.target.value)} placeholder="hal. Asia Technological School of Science and Arts (ASIATECH)" />
                                        </div>
                                        <div className="sv-grid2">
                                            <div>
                                                <label className="sv-tag sv-label">Course / Degree</label>
                                                <input className="sv-input" value={draft.course} onChange={(e) => setField('course', e.target.value)} placeholder="hal. BSIT" />
                                            </div>
                                            <div>
                                                <label className="sv-tag sv-label">Year Level</label>
                                                <input className="sv-input" value={draft.yearLevel} onChange={(e) => setField('yearLevel', e.target.value)} placeholder="hal. 3rd Year" />
                                            </div>
                                        </div>
                                        <div className="sv-grid2">
                                            <div>
                                                <label className="sv-tag sv-label">School Coordinator / Adviser</label>
                                                <input className="sv-input" value={draft.coordinatorName} onChange={(e) => setField('coordinatorName', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="sv-tag sv-label">Contact (email / phone)</label>
                                                <input className="sv-input" value={draft.coordinatorContact} onChange={(e) => setField('coordinatorContact', e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="sv-card">
                                    <h3 className="sv-tag" style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                        <Building2 size={16} /> Internship Details
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                                        <div className="sv-grid2">
                                            <div>
                                                <label className="sv-tag sv-label">Host Company</label>
                                                <input className="sv-input" value={draft.hostCompany} onChange={(e) => setField('hostCompany', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="sv-tag sv-label">Department / Assignment</label>
                                                <input className="sv-input" value={draft.department} onChange={(e) => setField('department', e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="sv-grid3">
                                            <div>
                                                <label className="sv-tag sv-label">Start Date</label>
                                                <input type="date" className="sv-input" value={draft.internshipStart} onChange={(e) => setField('internshipStart', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="sv-tag sv-label">End Date</label>
                                                <input type="date" className="sv-input" value={draft.internshipEnd} onChange={(e) => setField('internshipEnd', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="sv-tag sv-label">Required Hours</label>
                                                <input type="number" min="1" className="sv-input" value={draft.requiredHours} onChange={(e) => setField('requiredHours', e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
                                <div className="sv-card purple">
                                    <h3 className="sv-tag" style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#d8b4fe' }}>
                                        <FileCheck size={16} /> Memorandum of Agreement (MOA)
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                                        <div>
                                            <label className="sv-tag sv-label">MOA Reference No.</label>
                                            <input className="sv-input" value={draft.moaNumber} onChange={(e) => setField('moaNumber', e.target.value)} placeholder="hal. MOA-2026-014" />
                                        </div>
                                        <div className="sv-grid2">
                                            <div>
                                                <label className="sv-tag sv-label">Date Signed</label>
                                                <input type="date" className="sv-input" value={draft.moaDateSigned} onChange={(e) => setField('moaDateSigned', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="sv-tag sv-label">Valid Until</label>
                                                <input type="date" className="sv-input" value={draft.moaValidUntil} onChange={(e) => setField('moaValidUntil', e.target.value)} />
                                            </div>
                                        </div>

                                        <label className={`sv-check ${draft.moaSigned ? 'on' : ''}`}>
                                            <input type="checkbox" checked={!!draft.moaSigned} onChange={(e) => setField('moaSigned', e.target.checked)} />
                                            Signed na ang MOA (parehong partido)
                                        </label>

                                        <div>
                                            <label className="sv-tag sv-label">MOA Document (PDF / Image)</label>
                                            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                <label className="sv-btn ghost sm" style={{ cursor: 'pointer' }}>
                                                    <Upload size={13} /> {isUploadingMoa ? 'Uploading...' : (draft.moaFileUrl ? 'Palitan ang File' : 'Mag-upload')}
                                                    <input
                                                        type="file"
                                                        accept=".pdf,image/*"
                                                        style={{ display: 'none' }}
                                                        disabled={isUploadingMoa}
                                                        onChange={(e) => { handleMoaUpload(e.target.files[0]); e.target.value = ''; }}
                                                    />
                                                </label>
                                                {draft.moaFileUrl ? (
                                                    <a href={fullUrl(draft.moaFileUrl)} target="_blank" rel="noreferrer" className="sv-proof">
                                                        <Paperclip size={13} /> View MOA <Eye size={13} />
                                                    </a>
                                                ) : (
                                                    <span className="sv-mono" style={{ color: '#64748b', fontSize: '0.75rem' }}>Wala pang na-upload</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="sv-card">
                                    <h3 className="sv-tag" style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                        <ClipboardCheck size={16} /> Internship Requirements Checklist
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {REQUIREMENTS.filter(r => r.key !== 'moaSigned').map(r => (
                                            <label key={r.key} className={`sv-check ${draft[r.key] ? 'on' : ''}`}>
                                                <input type="checkbox" checked={!!draft[r.key]} onChange={(e) => setField(r.key, e.target.checked)} />
                                                {r.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="sv-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                    <div className="sv-mono" style={{ fontSize: '0.75rem', color: isDirty ? '#facc15' : '#64748b' }}>
                                        {isDirty ? 'May hindi pa na-save na pagbabago.' : 'Naka-save sa database.'}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                                        <button type="button" className="sv-btn ghost" disabled={!isDirty} onClick={() => setDraft(profile)}>Reset</button>
                                        <button type="button" className="sv-btn" disabled={!isDirty || isSavingProfile} onClick={() => persistProfile(activePid, draft)}>
                                            <Save size={15} /> {isSavingProfile ? 'Saving...' : 'Save Profile'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ================= TAB: AI EVALUATION ================= */}
                {activeTab === 'ai_evaluation' && (
                    <div>
                        <div className="sv-card purple" style={{ marginBottom: '1.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#c084fc', marginBottom: '0.4rem' }}>
                                <Sparkles size={22} />
                                <h2 className="sv-title" style={{ fontSize: '1.5rem' }}>AI STUDENT COMPETENCY & CAREER EVALUATION</h2>
                            </div>
                            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
                                Kinukuwenta mula sa {analyzable.length} DTR entries ni <strong style={{ color: '#fff' }}>{activeName}</strong> (hindi kasama ang rejected). Keyword-based ang analysis na ito; pwedeng i-upgrade sa totoong AI model sa backend.
                            </p>
                        </div>

                        <div className="sv-grid2" style={{ marginBottom: '1.4rem', alignItems: 'start' }}>
                            <div className="sv-card">
                                <h3 className="sv-tag" style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                    <ShieldCheck size={16} /> Verified Technical Capabilities
                                </h3>
                                {analyzable.length === 0 ? (
                                    <div className="sv-mono" style={{ color: '#64748b', fontSize: '0.8rem' }}>// Wala pang DTR entries na masusuri.</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
                                        {[...skillScores].sort((a, b) => b.pct - a.pct).map(s => (
                                            <div key={s.name}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', marginBottom: '0.3rem' }}>
                                                    <span style={{ color: '#f8fafc', fontWeight: 600 }}>{s.name}</span>
                                                    <span className="sv-mono" style={{ color: '#22d3ee' }}>{s.matched} entries | {s.pct}%</span>
                                                </div>
                                                <div className="sv-bar"><div style={{ width: `${s.pct}%` }} /></div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="sv-card purple">
                                <h3 className="sv-tag" style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#d8b4fe' }}>
                                    <TrendingUp size={16} /> Future Industry Role Projection
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                    {roleProjection.map(r => (
                                        <div key={r.role} style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(168,85,247,0.25)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                                                <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>{r.role}</div>
                                                <span className="sv-badge approved" style={{ color: '#d8b4fe', borderColor: '#c084fc', background: 'rgba(168,85,247,0.15)', boxShadow: 'none' }}>{r.pct}% Match</span>
                                            </div>
                                            <div className="sv-bar purple"><div style={{ width: `${r.pct}%` }} /></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="sv-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <h3 className="sv-tag" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                    <User size={16} /> Supervisor Performance Rating: {activeName}
                                </h3>
                                <span className="sv-mono" style={{ color: '#c084fc', fontSize: '0.8rem' }}>
                                    {avgRating ? `Average: ${avgRating} / 5` : 'Wala pang rating'}
                                </span>
                            </div>
                            <div className="sv-grid2">
                                {RATING_CRITERIA.map(c => (
                                    <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', padding: '0.6rem 0' }}>
                                        <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{c.label}</span>
                                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                                            {[1, 2, 3, 4, 5].map(n => (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    className={`sv-star ${(profile.rating?.[c.key] || 0) >= n ? 'on' : ''}`}
                                                    onClick={() => saveRating(c.key, n)}
                                                >
                                                    {n}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ================= TAB: STUDENT DISCUSSIONS ================= */}
                {activeTab === 'messages' && (
                    <div>
                        <div className="sv-card" style={{ marginBottom: '1.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                            <div>
                                <h2 className="sv-title" style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <MessageCircleMore size={22} color="#38bdf8" /> ACTIVE STUDENT DISCUSSION THREADS
                                </h2>
                                <p style={{ color: '#94a3b8', fontSize: '0.83rem', margin: '0.4rem 0 0 0' }}>
                                    Nauuna ang mga thread na naghihintay ng reply mo.
                                </p>
                            </div>
                            <span className={`sv-badge ${threadsWaiting > 0 ? 'pending' : 'approved'}`}>
                                {threadsWaiting > 0 ? `${threadsWaiting} NEEDS REPLY` : 'ALL CAUGHT UP'}
                            </span>
                        </div>

                        {threads.length === 0 ? (
                            <div className="sv-card sv-mono" style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                                // Walang chat threads sa ngayon. Pindutin ang "Chat" sa DTR Review Portal para magsimula.
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1rem' }}>
                                {threads.map((log) => {
                                    const waiting = needsReply(log);
                                    const last = log.messages[log.messages.length - 1];
                                    const st = statusOf(log);
                                    return (
                                        <div key={`${log._pid}-${idOf(log)}`} className="sv-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.9rem', borderColor: waiting ? '#facc15' : undefined }}>
                                            <div>
                                                <div className="sv-tag" style={{ color: '#c084fc', marginBottom: '0.4rem' }}>{nameFor(log._pid)}</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                                    <span className="sv-mono" style={{ color: '#38bdf8', fontSize: '0.85rem' }}>DTR: {dateOf(log)}</span>
                                                    <span className={`sv-badge ${st === 'approved' ? 'approved' : st === 'rejected' ? 'rejected' : 'pending'}`}>{st.toUpperCase()}</span>
                                                </div>
                                                <p style={{ color: '#cbd5e1', fontSize: '0.8rem', lineHeight: 1.4, margin: '0 0 0.6rem 0' }}>
                                                    <strong>Accomplishment:</strong> {notesOf(log)}
                                                </p>
                                                <div style={{ background: 'rgba(3,12,22,0.8)', border: '1px solid rgba(34,211,238,0.12)', borderRadius: '8px', padding: '0.55rem 0.7rem', fontSize: '0.78rem', color: '#94a3b8' }}>
                                                    <span className="sv-mono" style={{ color: last.sender === 'supervisor' ? '#f87171' : '#38bdf8' }}>
                                                        {last.sender === 'supervisor' ? 'You' : 'Student'}:
                                                    </span>{' '}
                                                    {messageText(last).length > 90 ? `${messageText(last).slice(0, 90)}...` : messageText(last)}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                                                <button type="button" className="sv-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setActiveChatLog(log)}>
                                                    <MessageSquare size={14} /> Open Thread
                                                </button>
                                                <span className="sv-badge muted">{log.messages.length} msgs</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ================= TAB: REPORTS ================= */}
                {activeTab === 'reports' && (
                    <div>
                        <div className="sv-print-only">
                            <h2 style={{ margin: 0 }}>OJT Hours & DTR Summary Report</h2>
                            <div>Intern: {activeName}</div>
                            <div>School: {profile.school || '—'} | Course: {profile.course || '—'} {profile.yearLevel ? `| ${profile.yearLevel}` : ''}</div>
                            <div>Host Company: {profile.hostCompany || '—'} {profile.department ? `| ${profile.department}` : ''}</div>
                            <div>Internship Period: {fmtDate(profile.internshipStart)} to {fmtDate(profile.internshipEnd)}</div>
                            <div>MOA: {profile.moaNumber || '—'} ({moaState.label}) | Valid until: {fmtDate(profile.moaValidUntil)}</div>
                            <div>Supervisor: {supervisorName} | Generated: {fmtDate(today)}</div>
                        </div>

                        <div className="sv-card no-print" style={{ marginBottom: '1.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <div>
                                <h2 className="sv-title" style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <FileText size={22} color="#34d399" /> COMPILED DTR SUMMARY & HOURS REPORT
                                </h2>
                                <p style={{ color: '#94a3b8', fontSize: '0.83rem', margin: '0.4rem 0 0 0' }}>
                                    I-export ang opisyal na ulat ni <strong style={{ color: '#fff' }}>{activeName}</strong> para sa submission sa <strong style={{ color: '#fff' }}>{profile.school || 'paaralan'}</strong>.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.6rem' }}>
                                <button type="button" className="sv-btn ghost" onClick={handleExportCSV}><Download size={15} /> Export CSV</button>
                                <button type="button" className="sv-btn green" onClick={() => window.print()}><Printer size={15} /> Print / Save PDF</button>
                            </div>
                        </div>

                        <div className="sv-grid4" style={{ marginBottom: '1.4rem' }}>
                            <div className="sv-card">
                                <div className="sv-tag" style={{ color: '#64748b' }}>Total Approved Hours</div>
                                <div className="sv-title" style={{ fontSize: '1.9rem', color: '#38bdf8', marginTop: '0.4rem' }}>{totalApprovedHours} / {requiredHours} hrs</div>
                            </div>
                            <div className="sv-card">
                                <div className="sv-tag" style={{ color: '#64748b' }}>Completion Rate</div>
                                <div className="sv-title" style={{ fontSize: '1.9rem', color: '#34d399', marginTop: '0.4rem' }}>{completionPct}%</div>
                            </div>
                            <div className="sv-card">
                                <div className="sv-tag" style={{ color: '#64748b' }}>Verified Submissions</div>
                                <div className="sv-title" style={{ fontSize: '1.9rem', color: '#c084fc', marginTop: '0.4rem' }}>{approvedLogs.length} / {activeLogs.length}</div>
                            </div>
                            <div className="sv-card">
                                <div className="sv-tag" style={{ color: '#64748b' }}>Est. Completion</div>
                                <div className="sv-title" style={{ fontSize: '1.45rem', color: '#facc15', marginTop: '0.5rem' }}>
                                    {remainingHours > 0 ? fmtDate(etaDate) : 'DONE'}
                                </div>
                                <div className="sv-mono" style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
                                    {remainingHours > 0 ? `${remainingHours} hrs pa | Lun-Biy` : 'Kumpleto na'}
                                </div>
                            </div>
                        </div>

                        <div className="sv-grid2" style={{ marginBottom: '1.4rem', alignItems: 'stretch' }}>
                            <div className="sv-card">
                                <h3 className="sv-tag" style={{ margin: '0 0 1rem 0', fontSize: '0.85rem' }}>Approved Hours Per Week</h3>
                                {weeklyData.length === 0 ? (
                                    <div className="sv-mono" style={{ color: '#64748b', fontSize: '0.8rem' }}>// Wala pang approved hours.</div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.7rem', height: '170px' }}>
                                        {weeklyData.map(w => (
                                            <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                                                <span className="sv-mono" style={{ fontSize: '0.7rem', color: '#22d3ee', marginBottom: '0.25rem' }}>{w.hours}</span>
                                                <div style={{ width: '100%', maxWidth: '44px', height: `${Math.max(6, (w.hours / weeklyMax) * 120)}px`, borderRadius: '6px 6px 2px 2px', background: 'linear-gradient(180deg, #22d3ee, #0891b2)', boxShadow: '0 0 12px rgba(34,211,238,0.5)' }} />
                                                <span className="sv-mono" style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '0.35rem' }}>{fmtDate(w.week).replace(/, \d{4}/, '')}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="sv-card" style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                                <RingGauge percent={completionPct} size={110} stroke={9} color={completionPct >= 100 ? '#34d399' : '#22d3ee'}>
                                    <GraduationCap size={30} color={completionPct >= 100 ? '#34d399' : '#22d3ee'} />
                                </RingGauge>
                                <div>
                                    <div className="sv-tag">[ Certificate of Completion ]</div>
                                    <div className="sv-title" style={{ fontSize: '1.5rem', marginTop: '0.3rem', color: completionPct >= 100 ? '#34d399' : '#facc15' }}>
                                        {completionPct >= 100 ? 'ELIGIBLE' : 'NOT YET ELIGIBLE'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.3rem', lineHeight: 1.5 }}>
                                        {completionPct >= 100
                                            ? 'Kumpleto na ang required hours. Pwede nang mag-issue ng certificate.'
                                            : `Kailangan pa ng ${remainingHours} oras para ma-complete ang ${requiredHours} hrs.`}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="sv-card">
                            <h3 className="sv-tag" style={{ margin: '0 0 1rem 0', fontSize: '0.85rem' }}>Complete DTR Record: {activeName}</h3>
                            <div className="sv-table-wrap">
                                <table className="sv-table">
                                    <thead>
                                        <tr><th>Date</th><th>Time</th><th>Hours</th><th>Accomplishments</th><th>Status</th></tr>
                                    </thead>
                                    <tbody>
                                        {activeLogs.length === 0 ? (
                                            <tr><td colSpan={5} className="sv-mono" style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>// Walang records.</td></tr>
                                        ) : (
                                            [...activeLogs].sort((a, b) => (dateOf(a) > dateOf(b) ? 1 : -1)).map(l => {
                                                const st = statusOf(l);
                                                return (
                                                    <tr key={idOf(l)}>
                                                        <td className="sv-mono" style={{ whiteSpace: 'nowrap' }}>{dateOf(l)}</td>
                                                        <td className="sv-mono" style={{ whiteSpace: 'nowrap' }}>{l.time_in || l.timeIn || '08:00'} - {l.time_out || l.timeOut || '18:00'}</td>
                                                        <td className="sv-mono">{hoursOf(l)}</td>
                                                        <td>{notesOf(l)}</td>
                                                        <td><span className={`sv-badge ${st === 'approved' ? 'approved' : st === 'rejected' ? 'rejected' : 'pending'}`}>{st.toUpperCase()}</span></td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ============ APPROVE / REJECT / BULK MODAL ============ */}
            {actionModal && (
                <div className="sv-overlay" style={{ zIndex: 3000 }} onClick={closeAction}>
                    <div className="sv-modal" style={{ width: '480px', padding: '1.7rem' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 className="sv-title" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {actionModal.type === 'reject'
                                    ? <><XCircle size={20} color="#f87171" /> REJECT DTR ENTRY</>
                                    : actionModal.type === 'bulk'
                                        ? <><CheckCheck size={20} color="#34d399" /> APPROVE ALL PENDING</>
                                        : <><CheckCircle2 size={20} color="#34d399" /> APPROVE DTR ENTRY</>}
                            </h3>
                            <button type="button" className="sv-close" onClick={closeAction}><X size={20} /></button>
                        </div>

                        {actionModal.type === 'bulk' ? (
                            <div style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                                Aaprubahan mo ang <strong style={{ color: '#facc15' }}>{pendingScope.length}</strong> pending na DTR
                                {focusInfo ? <> ni <strong style={{ color: '#fff' }}>{focusInfo.name}</strong></> : ' ng lahat ng intern'}, kabuuang{' '}
                                <strong style={{ color: '#38bdf8' }}>{pendingScope.reduce((s, l) => s + hoursOf(l), 0)} hrs</strong>. Sigurado ka bang na-review mo na lahat?
                            </div>
                        ) : (
                            <div style={{ background: 'rgba(3,12,22,0.8)', border: '1px solid rgba(34,211,238,0.15)', borderRadius: '10px', padding: '0.85rem', marginBottom: '1rem', fontSize: '0.83rem' }}>
                                <div className="sv-tag" style={{ color: '#c084fc', marginBottom: '0.3rem' }}>{nameFor(actionModal.log._pid)}</div>
                                <div className="sv-mono" style={{ color: '#22d3ee' }}>{dateOf(actionModal.log)} | {hoursOf(actionModal.log)} hrs</div>
                                <div style={{ color: '#94a3b8', marginTop: '0.35rem', lineHeight: 1.4 }}>{notesOf(actionModal.log)}</div>
                            </div>
                        )}

                        {actionModal.type === 'reject' && (
                            <div>
                                <label className="sv-tag sv-label">Dahilan ng pag-reject (required)</label>
                                <textarea
                                    rows="3"
                                    className="sv-input"
                                    style={{ resize: 'none' }}
                                    placeholder="Ipaliwanag kung ano ang kailangang ayusin ng intern..."
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                />
                                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                                    {REJECT_REASONS.map(r => (
                                        <button key={r} type="button" className="sv-chip suggest" onClick={() => setRejectReason(r)}>{r}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.7rem', marginTop: '1.3rem' }}>
                            <button type="button" className="sv-btn ghost" onClick={closeAction} disabled={isActing}>Cancel</button>
                            <button
                                type="button"
                                className={`sv-btn ${actionModal.type === 'reject' ? 'danger' : 'green'}`}
                                disabled={isActing || (actionModal.type === 'reject' && !rejectReason.trim())}
                                onClick={confirmAction}
                            >
                                {isActing ? 'Processing...' : actionModal.type === 'reject' ? 'Confirm Reject' : actionModal.type === 'bulk' ? 'Approve All' : 'Confirm Approve'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============ CHAT MODAL ============ */}
            {activeChatLog && (
                <div className="sv-overlay" style={{ zIndex: 2000 }}>
                    <div className="sv-modal" style={{ width: '520px', padding: '1.5rem', display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(34,211,238,0.2)', paddingBottom: '0.85rem' }}>
                            <div>
                                <h3 className="sv-title" style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <MessageCircleMore color="#22d3ee" size={20} /> STUDENT DISCUSSION THREAD
                                </h3>
                                <div className="sv-tag" style={{ color: '#64748b', marginTop: '0.25rem' }}>
                                    {activeChatLog._pid != null && <><span style={{ color: '#c084fc' }}>{nameFor(activeChatLog._pid)}</span> | </>}
                                    DTR Date: <span style={{ color: '#38bdf8' }}>{dateOf(activeChatLog)}</span>
                                </div>
                            </div>
                            <button type="button" className="sv-close" onClick={() => setActiveChatLog(null)}><X size={20} /></button>
                        </div>

                        <div style={{ flex: 1, minHeight: '260px', maxHeight: '360px', overflowY: 'auto', background: 'rgba(3, 12, 22, 0.9)', borderRadius: '12px', padding: '1rem', marginBottom: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', border: '1px solid rgba(34, 211, 238, 0.12)' }}>
                            {(!activeChatLog.messages || activeChatLog.messages.length === 0) ? (
                                <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.85rem', margin: 'auto', padding: '1rem' }}>
                                    <p style={{ margin: 0, fontWeight: 'bold', color: '#94a3b8' }}>Walang nakatalang usapan dito.</p>
                                    <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.775rem' }}>Mag-iwan ng feedback o instruction para sa estudyante gamit ang field sa ibaba.</p>
                                </div>
                            ) : (
                                activeChatLog.messages.map((msg, idx) => {
                                    const isMe = msg.sender === 'supervisor';
                                    return (
                                        <div key={msg.id || idx} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                                            <div className="sv-mono" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', color: '#64748b', marginBottom: '0.25rem' }}>
                                                {isMe ? (
                                                    <><Shield size={11} color="#f87171" /> <span style={{ color: '#f87171', fontWeight: 'bold' }}>YOU (SUPERVISOR)</span></>
                                                ) : (
                                                    <><User size={11} color="#38bdf8" /> <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>STUDENT</span></>
                                                )}
                                                <span>{fmtStamp(msg.timestamp)}</span>
                                            </div>
                                            <div style={{
                                                background: isMe ? 'rgba(239, 68, 68, 0.2)' : 'rgba(8, 145, 178, 0.85)',
                                                border: isMe ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid #22d3ee',
                                                boxShadow: isMe ? 'none' : '0 0 10px rgba(34, 211, 238, 0.3)',
                                                color: '#ffffff', padding: '0.65rem 0.9rem',
                                                borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                                                fontSize: '0.85rem', lineHeight: 1.4, maxWidth: '85%', wordBreak: 'break-word'
                                            }}>
                                                {messageText(msg)}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
                            {QUICK_REPLIES.map(q => (
                                <button key={q} type="button" className="sv-chip suggest" onClick={() => setReplyText(q)}>{q}</button>
                            ))}
                        </div>

                        <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                                type="text"
                                className="sv-input"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Mag-reply o magbigay ng panuto sa estudyante..."
                                style={{ flex: 1, padding: '0.75rem 0.9rem' }}
                            />
                            <button type="submit" className="sv-btn danger" disabled={isSendingChat || !replyText.trim()} style={{ padding: '0.75rem 1.1rem' }}>
                                <Send size={15} /> Reply
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ============ TOAST ============ */}
            {toast && <div className={`sv-toast ${toast.type}`}>{toast.message}</div>}
        </div>
    );
}
