import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    LayoutDashboard, UserCheck, Bot, MessageSquare, FileText, CheckCircle2, XCircle, Search, Eye, Save,
    Users, LogOut, Zap, Send, Download, Printer, Sparkles, Paperclip, Upload, RotateCcw, X, User, Shield,
    Award, AlertCircle, TrendingUp, ClipboardCheck, GraduationCap, Building2, FileSignature, CalendarDays
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const DEFAULT_HOURS = 500;
const POLL_MS = 3000;

/* ───────────── Helpers ───────────── */
const idOf = (l) => l.id || l.log_id;
const hrsOf = (l) => parseFloat(l.rendered_today || l.hoursRendered || 0) || 0;
const statusOf = (l) => (l.status || 'pending').toLowerCase();
const dateOf = (l) => l.log_date || l.date || '';
const msgText = (m) => typeof m === 'string' ? m : (m.message || m.text || m.remark || m.content || '');
const fullUrl = (u) => !u ? null : /^https?:\/\//i.test(u) ? u : `${API}${u.startsWith('/') ? '' : '/'}${u}`;
const isSup = (m) => {
    if (!m) return false;
    const role = String(m.sender_role || m.sender_name || m.sender || '').toLowerCase();
    return role === 'supervisor';
    const needsReply = (l) => {
        if (!l || !Array.isArray(l.messages) || l.messages.length === 0) return false;
        const lastMsg = l.messages[l.messages.length - 1];
        // Naghihintay ng reply kapag HINDI galing sa supervisor ang huling message
        return !isSup(lastMsg);
    };
const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseLocal = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return (y && m && d) ? new Date(y, m - 1, d) : null; };
const weekStartKey = (s) => { const d = parseLocal(s) || new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return keyOf(d); };
const shortDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtDate = (s) => { const d = s instanceof Date ? s : parseLocal(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };
const addBusinessDays = (n) => { const d = new Date(); let left = n; while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6 !== 0) left--; } return d; };
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Tinatanggap ang snake_case o camelCase galing backend
const normProfile = (raw) => {
    const p = raw || {};
    const pick = (a, b, d = '') => p[a] ?? p[b] ?? d;
    return {
        school: pick('school', 'p_school'), email: pick('email', 'email'), course: pick('course', 'p_course'),
        year_level: pick('year_level', 'yearLevel'), adviser: pick('adviser', 'school_coordinator'),
        contact: pick('contact', 'contact_number'), host_company: pick('host_company', 'hostCompany'),
        department: pick('department', 'department'), start_date: pick('start_date', 'startDate'),
        end_date: pick('end_date', 'endDate'), required_hours: Number(pick('required_hours', 'requiredHours', DEFAULT_HOURS)) || DEFAULT_HOURS,
        moa_ref_no: pick('moa_ref_no', 'moaNumber'), moa_date_signed: pick('moa_date_signed', 'moaDateSigned'),
        moa_valid_until: pick('moa_valid_until', 'moaValidUntil'), moa_file_url: pick('moa_file_url', 'moaFileUrl'),
        moa_signed: Boolean(pick('moa_signed', 'moaSigned', false)),
        endorsement_letter: Boolean(pick('endorsement_letter', 'endorsementLetter', false)),
        parent_consent: Boolean(pick('parent_consent', 'parentConsent', false)),
        medical_clearance: Boolean(pick('medical_clearance', 'medicalClearance', false)),
        ratings: p.ratings || {}
    };
};

const getMoaState = (p, today) => {
    if (!p.moa_signed && !p.moa_ref_no && !p.moa_file_url && !p.moa_valid_until) return { label: 'NOT RECORDED', cls: 'muted', note: 'Wala pang MOA na naitala.' };
    if (!p.moa_signed) return { label: 'PENDING SIGNATURE', cls: 'warn', note: 'Hindi pa naka-mark na signed ang MOA.' };
    const vu = parseLocal(p.moa_valid_until);
    if (vu) {
        if (vu < today) return { label: 'EXPIRED', cls: 'bad', note: `Nag-expire noong ${fmtDate(vu)}.` };
        const days = Math.round((vu - today) / 86400000);
        if (days <= 30) return { label: 'EXPIRING SOON', cls: 'warn', note: `${days} araw na lang bago mag-expire.` };
    }
    return { label: 'ACTIVE', cls: 'ok', note: vu ? `Valid hanggang ${fmtDate(vu)}.` : 'Active.' };
};

const CATS = [
    { key: 'Frontend / UI Development', re: /ui|design|react|css|frontend|layout|form|dashboard/i, role: 'Front-End / UI Developer' },
    { key: 'Debugging & Testing', re: /debug|bug|fix|error|test/i, role: 'QA & Debugging Support' },
    { key: 'Database & Data Handling', re: /database|sql|query|inventory|table|data|where|inner|join/i, role: 'Database Associate' },
    { key: 'Security & Audit', re: /audit|security|login|auth|otp|trail/i, role: 'Cybersecurity Associate' },
    { key: 'Backend & API (REST)', re: /api|backend|endpoint|server|fastapi|payment|pos/i, role: 'Backend / API Developer' },
    { key: 'Documentation & Reporting', re: /document|report|docs|manual|summary/i, role: 'Technical Writer' }
];
const RATINGS = [
    { key: 'punctuality', label: 'Punctuality & Attendance' },
    { key: 'quality', label: 'Quality of Work' },
    { key: 'initiative', label: 'Initiative & Learning' },
    { key: 'communication', label: 'Communication & Teamwork' }
];
const NAV = [
    { id: 'review', label: 'DTR Review Portal', icon: LayoutDashboard },
    { id: 'profile', label: 'Intern Profile & MOA', icon: UserCheck },
    { id: 'ai', label: 'Intern AI Evaluation', icon: Bot },
    { id: 'discussions', label: 'Student Discussions', icon: MessageSquare },
    { id: 'reports', label: 'DTR Summary Reports', icon: FileText }
];

/* ───────────── Styles ───────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
.sf{--cy:#22d3ee;--vi:#a78bfa;--ok:#34d399;--warn:#facc15;--bad:#f87171;--mut:#64748b;--line:rgba(34,211,238,.3);
 min-height:100vh;color:#e2e8f0;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12.5px;
 background:radial-gradient(900px 520px at 88% -8%,rgba(124,58,237,.24),transparent 60%),radial-gradient(800px 480px at 0% 0%,rgba(8,145,178,.2),transparent 55%),#050816}
.sf *{box-sizing:border-box}
.sf h1,.sf h2,.sf h3,.sf .hd{font-family:'Chakra Petch',sans-serif;margin:0}
.sf button{font-family:inherit}
.sf :focus-visible{outline:2px solid var(--cy);outline-offset:2px}
.sf-side{position:fixed;inset:0 auto 0 0;width:250px;padding:18px 14px;background:rgba(5,8,22,.94);border-right:1px solid rgba(34,211,238,.16);display:flex;flex-direction:column;gap:10px;z-index:50}
.sf-logo{font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:19px;color:var(--cy);display:flex;gap:8px;align-items:center;padding:4px 6px 10px;text-shadow:0 0 14px rgba(34,211,238,.6)}
.sf-me{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:12px;background:rgba(124,58,237,.1)}
.av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;background:linear-gradient(135deg,#6366f1,#a78bfa);flex:none}
.av.cy{background:linear-gradient(135deg,#0891b2,#22d3ee)}
.nav{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border-radius:10px;border:1px solid transparent;background:none;color:#94a3b8;cursor:pointer;font-size:12.5px;text-align:left}
.nav:hover{color:#e2e8f0;background:rgba(34,211,238,.06)}
.nav.on{color:var(--cy);border-color:var(--line);background:rgba(34,211,238,.1);box-shadow:0 0 16px rgba(34,211,238,.18)}
.nav .bd{margin-left:auto;background:#ef4444;color:#fff;border-radius:99px;font-size:10px;font-weight:700;padding:1px 7px}
.sf-out{margin-top:auto;color:var(--bad);border-color:rgba(248,113,113,.35);background:rgba(248,113,113,.07)}
.sf-main{margin-left:250px;padding:18px 28px 40px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:11px;color:#94a3b8;margin-bottom:18px}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok);margin-right:8px}
.pg{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.pg h1{font-size:30px;letter-spacing:.06em;text-transform:uppercase;color:#f8fafc;text-shadow:0 0 18px rgba(34,211,238,.35)}
.pg p{margin:6px 0 0;font-size:11px;color:var(--mut);letter-spacing:.08em}
.card{--ac:#22d3ee;position:relative;background:linear-gradient(160deg,rgba(15,23,42,.78),rgba(9,14,34,.78));border:1px solid color-mix(in srgb,var(--ac) 35%,transparent);border-radius:14px;padding:18px;box-shadow:0 0 24px color-mix(in srgb,var(--ac) 10%,transparent),inset 0 0 26px color-mix(in srgb,var(--ac) 4%,transparent)}
.card::before,.card::after{content:'';position:absolute;bottom:-1px;width:20px;height:20px;border-bottom:2px solid var(--ac);pointer-events:none}
.card::before{left:-1px;border-left:2px solid var(--ac);border-bottom-left-radius:14px}
.card::after{right:-1px;border-right:2px solid var(--ac);border-bottom-right-radius:14px}
.lbl{display:block;font-size:10.5px;letter-spacing:.14em;color:var(--mut);text-transform:uppercase}
.big{font-family:'Chakra Petch',sans-serif;font-size:38px;font-weight:700;line-height:1.1;margin:8px 0 4px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
.g2{display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:16px}
.g2e{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px}
.gt{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}
.col{display:flex;flex-direction:column;gap:14px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.bar{height:7px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:6px}
.bar>i{display:block;height:100%;background:linear-gradient(90deg,#0891b2,#22d3ee);box-shadow:0 0 10px #22d3ee;transition:width .5s}
.sh{display:flex;align-items:center;gap:8px;font-family:'Chakra Petch',sans-serif;font-weight:600;letter-spacing:.1em;text-transform:uppercase;font-size:13.5px;color:#f1f5f9;margin-bottom:12px}
.sh svg{color:var(--cy)}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:99px;border:1px solid var(--line);background:rgba(34,211,238,.08);color:var(--cy);font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;text-decoration:none}
.btn:hover:not(:disabled){background:rgba(34,211,238,.18)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn.solid{background:linear-gradient(90deg,#0891b2,#0e7490);color:#fff;border-color:#22d3ee;box-shadow:0 0 18px rgba(34,211,238,.4)}
.btn.ok{color:var(--ok);border-color:rgba(52,211,153,.4);background:rgba(52,211,153,.1)}
.btn.green{color:#ecfdf5;background:#059669;border-color:#34d399}
.btn.bad{color:var(--bad);border-color:rgba(248,113,113,.45);background:rgba(239,68,68,.12)}
.btn.sm{padding:5px 10px;font-size:10.5px}
.pill{padding:5px 12px;border-radius:99px;border:1px solid var(--line);background:none;color:#94a3b8;font-size:10.5px;cursor:pointer;letter-spacing:.06em;text-transform:uppercase}
.pill.on{color:var(--cy);background:rgba(34,211,238,.14);box-shadow:0 0 12px rgba(34,211,238,.25)}
.chip{display:inline-block;padding:3px 10px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:.08em;border:1px solid;white-space:nowrap}
.chip.ok{color:var(--ok);background:rgba(52,211,153,.1);border-color:rgba(52,211,153,.5)}
.chip.warn{color:var(--warn);background:rgba(250,204,21,.1);border-color:rgba(250,204,21,.5)}
.chip.bad{color:var(--bad);background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.5)}
.chip.muted{color:#94a3b8;background:rgba(71,85,105,.15);border-color:#475569}
.srch{display:flex;align-items:center;gap:8px;padding:7px 12px;border:1px solid var(--line);border-radius:10px;background:rgba(5,8,22,.6);min-width:230px}
.srch input{background:none;border:0;outline:0;color:#e2e8f0;font:inherit;width:100%}
.tw{overflow-x:auto}
.tbl{width:100%;border-collapse:collapse;text-align:left}
.tbl th{padding:10px 12px;font-size:10px;letter-spacing:.14em;color:var(--mut);font-weight:500;text-transform:uppercase;border-bottom:1px solid rgba(34,211,238,.18)}
.tbl td{padding:12px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:middle}
.tbl tr:hover td{background:rgba(34,211,238,.04)}
.act{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.cnt{background:#facc15;color:#050816;border-radius:99px;padding:0 6px;font-size:10px;font-weight:800}
.irow{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:18px}
.icard{background:rgba(15,23,42,.6);border:1px solid rgba(34,211,238,.2);border-radius:12px;padding:12px;cursor:pointer;transition:all .2s;display:flex;flex-direction:column;justify-content:space-between;gap:8px;text-align:left;color:inherit;font-family:inherit}
.icard:hover,.icard.on{border-color:var(--cy);background:rgba(34,211,238,.1);box-shadow:0 0 16px rgba(34,211,238,.2)}
.ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fl{display:block;font-size:10.5px;letter-spacing:.12em;color:var(--mut);text-transform:uppercase;margin-bottom:6px}
.in{width:100%;background:rgba(15,23,42,.8);border:1px solid var(--line);border-radius:9px;padding:10px 12px;color:#fff;font:inherit;outline:0;color-scheme:dark}
.in:read-only{opacity:.7}
.chk{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid rgba(52,211,153,.35);border-radius:10px;background:rgba(52,211,153,.07);cursor:pointer;margin-bottom:10px}
.chk input{width:16px;height:16px;accent-color:#22d3ee}
.rate{display:flex;gap:6px}
.rate button{width:30px;height:30px;border-radius:6px;border:1px solid var(--line);background:rgba(15,23,42,.8);color:#94a3b8;cursor:pointer;font-weight:700}
.rate button.on{background:#0891b2;color:#fff;border-color:#22d3ee;box-shadow:0 0 10px rgba(34,211,238,.5)}
.chart{display:flex;align-items:flex-end;gap:14px;height:170px;padding-top:18px}
.chart>div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px;font-size:10px;color:var(--mut)}
.chart i{display:block;width:100%;max-width:46px;border-radius:5px 5px 0 0;background:linear-gradient(180deg,#22d3ee,#0e7490);box-shadow:0 0 14px rgba(34,211,238,.45);min-height:2px}
.chart b{color:#cffafe;font-size:10.5px}
.ringin{position:absolute;inset:0;display:grid;place-items:center;text-align:center}
.th{display:flex;flex-direction:column;gap:9px}
.th.new{--ac:#facc15}
.pv{padding:8px 10px;border-radius:8px;background:rgba(5,8,22,.7);border:1px solid rgba(255,255,255,.07);color:#94a3b8}
.role{display:flex;justify-content:space-between;align-items:center;padding:12px;margin-bottom:10px;border:1px solid rgba(167,139,250,.35);border-radius:10px;background:rgba(15,23,42,.8)}
.ovl{position:fixed;inset:0;background:rgba(2,6,18,.8);backdrop-filter:blur(6px);display:grid;place-items:center;z-index:200;padding:16px}
.modal{width:min(520px,100%);max-height:92vh;overflow:auto;background:#0a1020;border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:0 0 50px rgba(34,211,238,.18)}
.bub{max-width:85%;padding:9px 12px;font-size:12.5px;line-height:1.5;word-break:break-word;color:#fff}
.bub.me{background:#0e7490;border-radius:14px 14px 3px 14px}
.bub.other{background:rgba(167,139,250,.16);border:1px solid rgba(167,139,250,.4);border-radius:14px 14px 14px 3px}
.toast{position:fixed;right:20px;bottom:20px;z-index:400;padding:12px 16px;border-radius:10px;background:#0a1020;border:1px solid var(--ok);color:var(--ok);box-shadow:0 0 24px rgba(52,211,153,.3)}
.toast.err{border-color:var(--bad);color:var(--bad)}
.empty{text-align:center;padding:30px 12px;color:var(--mut)}
@media (max-width:1100px){.g4{grid-template-columns:repeat(2,1fr)}.g2,.g3,.g2e{grid-template-columns:1fr}}
@media (max-width:860px){.sf-side{position:static;width:100%;flex-direction:row;flex-wrap:wrap}.sf-me{display:none}.sf-out{margin:0 0 0 auto;width:auto}.sf-main{margin-left:0;padding:16px}.nav{width:auto}.g4,.row2{grid-template-columns:1fr}}
`;

const Ring = ({ pct, size = 92, stroke = 8, color = '#22d3ee', children }) => {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return (
        <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, pct) / 100)} style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dashoffset .6s' }} />
            </svg>
            <div className="ringin">{children}</div>
        </div>
    );
};

const chipFor = (l) => { const s = statusOf(l); return <span className={`chip ${s === 'approved' ? 'ok' : s === 'rejected' ? 'bad' : 'warn'}`}>{s.toUpperCase()}</span>; };

export default function SupervisorDashboard({ supervisorName: supProp, onLogout }) {
    const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const supervisorName = supProp || savedUser.full_name || savedUser.name || 'Supervisor';

    const [tab, setTab] = useState('review');
    const [selectedId, setSelectedId] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [toast, setToast] = useState(null);
    const [logs, setLogs] = useState([]);
    const [interns, setInterns] = useState([]);
    const [profiles, setProfiles] = useState({});
    const [form, setForm] = useState(normProfile({}));
    const [ratings, setRatings] = useState({});
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [activeChatId, setActiveChatId] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [rejectTarget, setRejectTarget] = useState(null);
    const [reason, setReason] = useState('');
    const chatEndRef = useRef(null);

    const notify = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3200); };
    const same = (prev, next) => JSON.stringify(prev) === JSON.stringify(next) ? prev : next;

    /* ── Fetching (realtime polling) ── */
    const fetchAll = useCallback(async () => {
        try {
            const [a, b, c] = await Promise.all([
                fetch(`${API}/api/interns`), fetch(`${API}/api/dtr/all`), fetch(`${API}/api/interns/profiles`)
            ]);
            if (a.ok) { const d = await a.json(); setInterns(p => same(p, Array.isArray(d) ? d : [])); }
            if (b.ok) { const d = await b.json(); setLogs(p => same(p, Array.isArray(d) ? d : [])); }
            if (c.ok) {
                const d = await c.json(); const m = {};
                Object.entries(d || {}).forEach(([k, v]) => { m[k] = normProfile(v); });
                setProfiles(p => same(p, m));
            }
        } catch (e) { console.error('Fetch error:', e); }
    }, []);

    useEffect(() => {
        fetchAll();
        const t = setInterval(fetchAll, POLL_MS);
        return () => clearInterval(t);
    }, [fetchAll]);

    // I-load ang form kapag nagpalit ng intern (at hindi pa nag-e-edit)
    useEffect(() => { setDirty(false); }, [selectedId]);
    useEffect(() => {
        if (selectedId === 'all' || dirty) return;
        const p = profiles[selectedId] || normProfile({});
        setForm(p); setRatings(p.ratings || {});
    }, [selectedId, profiles, dirty]);

    const activeChatLog = useMemo(() => logs.find(l => idOf(l) === activeChatId) || null, [logs, activeChatId]);
    const chatCount = activeChatLog?.messages?.length || 0;
    useEffect(() => { if (chatCount) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatCount, activeChatId]);

    /* ── Derived ── */
    const isAll = selectedId === 'all';
    const selectedIntern = isAll ? null : interns.find(i => String(i.id) === String(selectedId)) || null;
    const selectedProfile = isAll ? null : (profiles[selectedId] || normProfile({}));
    const scopeLogs = useMemo(() => isAll ? logs : logs.filter(l => Number(l.user_id) === Number(selectedId)), [logs, selectedId, isAll]);
    const requiredHours = isAll ? interns.length * DEFAULT_HOURS || DEFAULT_HOURS : (Number(selectedProfile?.required_hours) || DEFAULT_HOURS);
    const scopeName = isAll ? 'All Interns' : (selectedIntern?.full_name || 'Intern');
    const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

    const stats = useMemo(() => {
        const pending = scopeLogs.filter(l => !['approved', 'rejected'].includes(statusOf(l)));
        const approved = scopeLogs.filter(l => statusOf(l) === 'approved');
        const rejected = scopeLogs.filter(l => statusOf(l) === 'rejected');
        return { pending, approved, rejected, hours: approved.reduce((s, l) => s + hrsOf(l), 0) };
    }, [scopeLogs]);

    const visibleLogs = useMemo(() => {
        const q = search.trim().toLowerCase();
        return scopeLogs.filter(l => {
            const st = statusOf(l);
            if (statusFilter === 'pending' && ['approved', 'rejected'].includes(st)) return false;
            if (statusFilter === 'approved' && st !== 'approved') return false;
            if (statusFilter === 'rejected' && st !== 'rejected') return false;
            return !q || `${l.student_name || ''} ${dateOf(l)} ${l.accomplishment || l.raw_notes || ''}`.toLowerCase().includes(q);
        });
    }, [scopeLogs, statusFilter, search]);

    const pct = Math.min(100, Math.round((stats.hours / requiredHours) * 100));
    const remaining = Math.max(0, requiredHours - stats.hours);
    const avgHrs = stats.approved.length ? stats.hours / stats.approved.length : 8;
    const eta = remaining === 0 ? null : addBusinessDays(Math.ceil(remaining / avgHrs));
    const etaText = eta ? fmtDate(eta) : 'Complete';

    const weeks = useMemo(() => {
        const map = {};
        stats.approved.forEach(l => { const k = weekStartKey(dateOf(l)); map[k] = (map[k] || 0) + hrsOf(l); });
        const cur = parseLocal(weekStartKey(keyOf(new Date())));
        return Array.from({ length: 6 }, (_, i) => { const d = new Date(cur); d.setDate(d.getDate() - (5 - i) * 7); return { label: shortDate(d), hrs: map[keyOf(d)] || 0 }; });
    }, [stats.approved]);
    const maxWeek = Math.max(1, ...weeks.map(w => w.hrs));

    const skills = useMemo(() => CATS.map(c => {
        const n = stats.approved.filter(l => c.re.test(l.accomplishment || l.raw_notes || '')).length;
        return { ...c, n, pct: stats.approved.length ? Math.round((n / stats.approved.length) * 100) : 0 };
    }), [stats.approved]);
    const roles = useMemo(() => {
        const top = [...skills].filter(s => s.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
        return top.map(s => ({ role: s.role, match: Math.min(95, 15 + s.pct) }));
    }, [skills]);

    const replyCount = useMemo(() => logs.filter(needsReply).length, [logs]);
    const threads = useMemo(() => scopeLogs.filter(l => l.messages?.length).sort((a, b) => (needsReply(b) ? 1 : 0) - (needsReply(a) ? 1 : 0)), [scopeLogs]);
    const threadsWaiting = threads.filter(needsReply).length;

    const reqDone = [form.moa_signed, form.endorsement_letter, form.parent_consent, form.medical_clearance].filter(Boolean).length;
    const moa = getMoaState(form, today);
    const ratingVals = RATINGS.map(r => Number(ratings[r.key]) || 0).filter(Boolean);
    const ratingAvg = ratingVals.length ? (ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length).toFixed(1) : null;

    /* ── Actions ── */
    const postStatus = async (logId, status, why = '') => {
        const res = await fetch(`${API}/api/dtr-logs/${logId}/status`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, rejection_reason: why, remarks: why, supervisor_comment: why })
        });
        if (!res.ok) throw new Error('status failed');
    };
    const applyLocal = (ids, status, why) => setLogs(prev => prev.map(l => ids.includes(idOf(l)) ? { ...l, status, rejection_reason: why, remarks: why } : l));

    const handleStatus = async (logId, status, why = '') => {
        try {
            await postStatus(logId, status, why);
            applyLocal([logId], status, why);
            setRejectTarget(null); setReason('');
            notify(`DTR status: ${status.toUpperCase()}`);
            fetchAll();
        } catch { notify('Hindi na-update ang status. Check ang server.', true); }
    };

    const approveAllPending = async () => {
        const ids = visibleLogs.filter(l => !['approved', 'rejected'].includes(statusOf(l))).map(idOf);
        if (!ids.length) return;
        try {
            await Promise.all(ids.map(id => postStatus(id, 'approved')));
            applyLocal(ids, 'approved', '');
            notify(`${ids.length} DTR na-approve na.`);
            fetchAll();
        } catch { notify('May ilang hindi na-approve. Subukan ulit.', true); fetchAll(); }
    };

    const sendReply = async (e) => {
        e.preventDefault();
        const text = replyText.trim();
        if (!text || !activeChatLog) return;
        const logId = idOf(activeChatLog);
        const msg = { sender: 'supervisor', message: text, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        setReplyText('');
        setLogs(prev => prev.map(l => idOf(l) === logId ? { ...l, messages: [...(l.messages || []), msg] } : l));
        try {
            const res = await fetch(`${API}/api/dtr/${logId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: 'supervisor', message: text }) });
            if (!res.ok) throw new Error();
            fetchAll();
        } catch { notify('Hindi na-send ang mensahe.', true); fetchAll(); }
    };

    const saveProfile = async (e) => {
        e?.preventDefault();
        if (isAll) return;
        setSaving(true);
        try {
            const body = { ...form, user_id: Number(selectedId), ratings, required_hours: Number(form.required_hours) || DEFAULT_HOURS };
            const res = await fetch(`${API}/api/interns/${selectedId}/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error();
            setProfiles(prev => ({ ...prev, [selectedId]: normProfile(body) }));
            setDirty(false);
            notify('Naka-save na sa database!');
            fetchAll();
        } catch { notify('Hindi na-save ang profile.', true); }
        finally { setSaving(false); }
    };

    const setF = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };
    const resetForm = () => { setDirty(false); };

    const uploadMoa = async (file) => {
        if (!file) return;
        setUploading(true);
        try {
            const fd = new FormData(); fd.append('file', file);
            const res = await fetch(`${API}/api/upload`, { method: 'POST', body: fd });
            if (!res.ok) throw new Error();
            const d = await res.json();
            setF('moa_file_url', d.proof_url || d.url || '');
            notify('Na-upload ang MOA. I-click ang Save Profile.');
        } catch { notify('Hindi na-upload ang MOA (PDF/PNG/JPG lang).', true); }
        finally { setUploading(false); }
    };

    const exportCSV = () => {
        const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = [['Intern', 'Date', 'Time In', 'Time Out', 'Hours', 'Accomplishment', 'Status', 'Remarks'],
        ...scopeLogs.map(l => [l.student_name, dateOf(l), l.time_in, l.time_out, hrsOf(l), l.accomplishment || l.raw_notes, statusOf(l), l.rejection_reason || l.remarks || ''])];
        const url = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
        const a = document.createElement('a'); a.href = url; a.download = `dtr-report-${scopeName.replace(/\s+/g, '-')}.csv`; a.click(); URL.revokeObjectURL(url);
    };

    const printReport = () => {
        const w = window.open('', '_blank');
        if (!w) { notify('I-allow ang pop-up para sa Print / Save PDF.', true); return; }
        const rows = [...scopeLogs].sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
        w.document.write(`<html><head><title>DTR Summary - ${esc(scopeName)}</title><style>body{font-family:Arial,sans-serif;padding:28px;color:#111}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:12px}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#eee}</style></head><body>
<h2>DTR Summary &amp; Hours Report</h2>
<p><b>Intern:</b> ${esc(scopeName)}<br><b>School:</b> ${esc(selectedProfile?.school || '—')}<br><b>Approved hours:</b> ${stats.hours} / ${requiredHours} (${pct}%)<br><b>Generated:</b> ${esc(fmtDate(new Date()))}</p>
<table><tr><th>Intern</th><th>Date</th><th>Time</th><th>Hours</th><th>Accomplishments</th><th>Status</th></tr>
${rows.map(l => `<tr><td>${esc(l.student_name)}</td><td>${esc(dateOf(l))}</td><td>${esc(l.time_in)} - ${esc(l.time_out)}</td><td>${hrsOf(l)}</td><td>${esc(l.accomplishment || l.raw_notes)}</td><td>${esc(statusOf(l).toUpperCase())}</td></tr>`).join('')}
</table></body></html>`);
        w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    };

    const handleLogout = () => { if (onLogout) onLogout(); else { localStorage.clear(); window.location.reload(); } };

    /* ── Shared pieces ── */
    const InternRow = (
        <div className="irow">
            {[{ id: 'all', full_name: 'All Interns' }, ...interns].map(item => {
                const all = item.id === 'all';
                const L = all ? logs : logs.filter(l => Number(l.user_id) === Number(item.id));
                const pend = L.filter(l => !['approved', 'rejected'].includes(statusOf(l))).length;
                const rep = L.filter(needsReply).length;
                const hrs = L.filter(l => statusOf(l) === 'approved').reduce((s, l) => s + hrsOf(l), 0);
                const p = profiles[item.id] || normProfile({});
                const m = getMoaState(p, today);
                return (
                    <button type="button" key={item.id} className={`icard ${String(selectedId) === String(item.id) ? 'on' : ''}`} onClick={() => setSelectedId(item.id)}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                            <div className="av cy" style={{ width: 26, height: 26, fontSize: 11 }}>{all ? <Users size={13} /> : (item.full_name || 'I').charAt(0)}</div>
                            <div style={{ minWidth: 0 }}>
                                <div className="ell" style={{ fontWeight: 700, fontSize: 12 }}>{item.full_name}</div>
                                <div className="ell" style={{ fontSize: 10, color: '#64748b' }}>{all ? `${interns.length} intern(s)` : (p.school || 'Walang school info')}</div>
                            </div>
                        </div>
                        {!all && (
                            <div style={{ fontSize: 10, color: '#22d3ee' }}>
                                <b>{hrs}</b> / {p.required_hours} hrs
                                <div className="bar"><i style={{ width: `${Math.min(100, (hrs / p.required_hours) * 100)}%` }} /></div>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {all && <span className={`chip ${pend ? 'warn' : 'muted'}`} style={{ fontSize: 9 }}>{pend} pending</span>}
                            {rep > 0 && <span className="chip bad" style={{ fontSize: 9 }}>{rep} reply</span>}
                            {!all && <span className={`chip ${m.cls}`} style={{ fontSize: 9 }}>MOA: {m.label}</span>}
                        </div>
                    </button>
                );
            })}
        </div>
    );

    const logTable = (rows, withActions) => (
        <div className="tw">
            <table className="tbl">
                <thead><tr><th>Intern</th><th>Date</th><th>Time</th><th>Hours</th><th>Accomplishments</th><th>Proof</th><th>Status</th><th>{withActions ? 'Actions' : 'Remarks'}</th></tr></thead>
                <tbody>
                    {rows.length === 0 && <tr><td colSpan="8"><div className="empty">Walang nahanap na DTR submission.</div></td></tr>}
                    {rows.map(l => {
                        const st = statusOf(l); const n = l.messages?.length || 0;
                        return (
                            <tr key={idOf(l)}>
                                <td style={{ fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap' }}><span className="av cy" style={{ width: 22, height: 22, fontSize: 10, display: 'inline-grid', marginRight: 8, verticalAlign: 'middle' }}>{(l.student_name || 'S').charAt(0)}</span>{l.student_name || 'Student'}</td>
                                <td style={{ color: '#22d3ee', whiteSpace: 'nowrap' }}>{dateOf(l)}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>{l.time_in || '08:00'} - {l.time_out || '18:00'}</td>
                                <td style={{ color: '#38bdf8', fontWeight: 700, whiteSpace: 'nowrap' }}>{hrsOf(l)} hrs</td>
                                <td style={{ color: '#94a3b8', maxWidth: 240 }}>{l.accomplishment || l.raw_notes}</td>
                                <td>{l.proof_url ? <a className="btn sm" href={fullUrl(l.proof_url)} target="_blank" rel="noreferrer"><Paperclip size={12} /> View Proof <Eye size={12} /></a> : <span style={{ color: '#475569', fontStyle: 'italic' }}>No file</span>}</td>
                                <td>{chipFor(l)}</td>
                                {withActions ? (
                                    <td><div className="act">
                                        <button className="btn sm ok" disabled={st === 'approved'} onClick={() => handleStatus(idOf(l), 'approved')}><CheckCircle2 size={12} /> Approve</button>
                                        <button className="btn sm bad" disabled={st === 'rejected'} onClick={() => { setRejectTarget(l); setReason(''); }}><XCircle size={12} /> Reject</button>
                                        <button className="btn sm" style={needsReply(l) ? { borderColor: '#facc15', boxShadow: '0 0 10px rgba(250,204,21,.4)' } : null} onClick={() => setActiveChatId(idOf(l))}><MessageSquare size={12} /> Chat {n > 0 && <span className="cnt">{n}</span>}</button>
                                    </div></td>
                                ) : <td style={{ color: '#94a3b8', maxWidth: 200 }}>{st === 'rejected' ? (l.rejection_reason || l.remarks || '—') : '—'}</td>}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    const needIntern = (
        <div className="card empty"><User size={30} /><p>Pumili muna ng intern sa taas para makita at ma-edit ang detalye nila.</p></div>
    );

    return (
        <div className="sf">
            <style>{CSS}</style>

            <aside className="sf-side">
                <div className="sf-logo"><Zap size={18} /> SmartFolio Hub</div>
                <div className="sf-me">
                    <div className="av">{supervisorName.charAt(0).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                        <div className="hd ell" style={{ fontWeight: 700, fontSize: 13 }}>{supervisorName}</div>
                        <div style={{ fontSize: 10, color: '#a78bfa' }}>OJT Supervisor Portal</div>
                    </div>
                </div>
                {NAV.map(n => (
                    <button key={n.id} className={`nav ${tab === n.id ? 'on' : ''}`} onClick={() => setTab(n.id)}>
                        <n.icon size={16} /> {n.label}
                        {n.id === 'discussions' && replyCount > 0 && <span className="bd">{replyCount}</span>}
                    </button>
                ))}
                <button className="nav sf-out" onClick={handleLogout}><LogOut size={16} /> Logout Portal</button>
            </aside>

            <main className="sf-main">
                <div className="top">
                    <span><span className="dot" />SYS ONLINE // SUPERVISOR SESSION</span>
                    <span>{interns.length} INTERN(S) MONITORED | DTR &amp; INTERNSHIP HUB</span>
                </div>

                {/* ═════ REVIEW ═════ */}
                {tab === 'review' && (<>
                    <div className="pg">
                        <div><h1>Supervisor Portal</h1><p>[ REVIEW STUDENT DTR SUBMISSIONS, APPROVE HOURS, AND GIVE FEEDBACK ]</p></div>
                        <div className="act">
                            <label className="srch"><Search size={14} color="#64748b" /><input placeholder="Search intern name, date or notes..." value={search} onChange={e => setSearch(e.target.value)} /></label>
                            <button className="btn green" disabled={!visibleLogs.some(l => !['approved', 'rejected'].includes(statusOf(l)))} onClick={approveAllPending}>
                                <CheckCircle2 size={14} /> Approve all pending ({stats.pending.length})
                            </button>
                        </div>
                    </div>
                    {InternRow}
                    <div className="card" style={{ marginBottom: 16 }}>
                        <div className="sh" style={{ marginBottom: 6 }}><Users size={16} /> {isAll ? 'All interns overview' : `${scopeName} overview`}</div>
                        <div style={{ color: '#94a3b8' }}>
                            {isAll
                                ? <>Nakikita mo ang DTR ng {interns.length} intern. Pumili ng intern sa itaas, o i-search ang pangalan niya, para makita ang kanyang school, MOA at requirements.{interns.some(i => ['EXPIRED', 'EXPIRING SOON'].includes(getMoaState(profiles[i.id] || normProfile({}), today).label)) && <b style={{ color: '#facc15' }}> May intern na may MOA na kailangang asikasuhin.</b>}</>
                                : <>{selectedProfile?.school || 'Walang school info'} | MOA: {getMoaState(selectedProfile, today).label} | {stats.hours} / {requiredHours} approved hrs</>}
                        </div>
                    </div>
                    <div className="g4">
                        <div className="card" style={{ '--ac': '#facc15', textAlign: 'center' }}><div className="big" style={{ color: '#facc15' }}>{stats.pending.length}</div><div className="lbl">Pending approvals</div></div>
                        <div className="card" style={{ '--ac': '#34d399', textAlign: 'center' }}><div className="big" style={{ color: '#34d399' }}>{stats.approved.length}</div><div className="lbl">Approved logs</div></div>
                        <div className="card" style={{ '--ac': '#f87171', textAlign: 'center' }}><div className="big" style={{ color: '#f87171' }}>{stats.rejected.length}</div><div className="lbl">Rejected / needs revision</div></div>
                        <div className="card" style={{ '--ac': '#a78bfa', display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
                            <Ring pct={(interns.length ? 100 : 0)} color="#a78bfa" size={64} stroke={6}><Users size={20} color="#c4b5fd" /></Ring>
                            <div><div className="big" style={{ color: '#fff', margin: 0, fontSize: 30 }}>{interns.length}</div><div className="lbl">Active interns</div></div>
                        </div>
                    </div>
                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                            <div className="sh" style={{ margin: 0 }}><FileText size={16} /> Student DTR logs review ({scopeName})</div>
                            <div className="act">
                                {[['all', 'All', scopeLogs.length], ['pending', 'Pending', stats.pending.length], ['approved', 'Approved', stats.approved.length], ['rejected', 'Rejected', stats.rejected.length]].map(([k, t, n]) => (
                                    <button key={k} className={`pill ${statusFilter === k ? 'on' : ''}`} onClick={() => setStatusFilter(k)}>{t} [{n}]</button>
                                ))}
                            </div>
                        </div>
                        {logTable(visibleLogs, true)}
                    </div>
                </>)}

                {/* ═════ PROFILE & MOA ═════ */}
                {tab === 'profile' && (<>
                    <div className="pg"><div><h1>Intern Profile &amp; MOA</h1><p>[ SCHOOL INFO, MOA, AT REQUIREMENTS NI {scopeName.toUpperCase()} ]</p></div></div>
                    {InternRow}
                    {isAll ? needIntern : (<>
                        <div className="g3">
                            <div className="card" style={{ '--ac': reqDone === 4 ? '#34d399' : '#facc15', display: 'flex', alignItems: 'center', gap: 16 }}>
                                <Ring pct={(reqDone / 4) * 100} size={92} color={reqDone === 4 ? '#34d399' : '#facc15'}><ClipboardCheck size={26} color={reqDone === 4 ? '#34d399' : '#facc15'} /></Ring>
                                <div><div className="lbl">[ Requirements ]</div><div className="big" style={{ fontSize: 28 }}>{reqDone} / 4</div><div className="lbl">Complete</div></div>
                            </div>
                            <div className="card" style={{ '--ac': moa.cls === 'ok' ? '#34d399' : moa.cls === 'bad' ? '#f87171' : moa.cls === 'warn' ? '#facc15' : '#94a3b8' }}>
                                <div className="lbl">[ MOA status ]</div>
                                <div style={{ margin: '10px 0' }}><span className={`chip ${moa.cls}`} style={{ fontSize: 12 }}>{moa.label}</span></div>
                                <div style={{ color: '#94a3b8' }}>{moa.note}</div>
                            </div>
                            <div className="card" style={{ '--ac': '#a78bfa' }}>
                                <div className="lbl">[ Internship progress ]</div>
                                <div className="big" style={{ fontSize: 28 }}>{stats.hours}<span style={{ fontSize: 14, color: '#64748b' }}> / {requiredHours} hrs</span></div>
                                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>Natitira: {remaining} hrs | Est. tapos: {etaText}</div>
                            </div>
                        </div>

                        <form onSubmit={saveProfile} className="g2" style={{ alignItems: 'start' }}>
                            <div className="col">
                                <div className="card">
                                    <div className="sh"><GraduationCap size={16} /> School / intern information</div>
                                    <div className="col" style={{ gap: 12 }}>
                                        <div className="row2">
                                            <div><label className="fl">Pangalan (galing sa student account)</label><input className="in" readOnly value={selectedIntern?.full_name || ''} /></div>
                                            <div><label className="fl">Email ng account</label><input className="in" type="email" value={form.email || selectedIntern?.email || ''} onChange={e => setF('email', e.target.value)} /></div>
                                        </div>
                                        <div><label className="fl">Paaralan / University</label><input className="in" value={form.school} onChange={e => setF('school', e.target.value)} /></div>
                                        <div className="row2">
                                            <div><label className="fl">Course / Degree</label><input className="in" value={form.course} onChange={e => setF('course', e.target.value)} /></div>
                                            <div><label className="fl">Year level</label><input className="in" value={form.year_level} onChange={e => setF('year_level', e.target.value)} /></div>
                                        </div>
                                        <div className="row2">
                                            <div><label className="fl">School coordinator / adviser</label><input className="in" value={form.adviser} onChange={e => setF('adviser', e.target.value)} /></div>
                                            <div><label className="fl">Contact (email / phone)</label><input className="in" value={form.contact} onChange={e => setF('contact', e.target.value)} /></div>
                                        </div>
                                    </div>
                                </div>
                                <div className="card">
                                    <div className="sh"><Building2 size={16} /> Internship details</div>
                                    <div className="col" style={{ gap: 12 }}>
                                        <div className="row2">
                                            <div><label className="fl">Host company</label><input className="in" value={form.host_company} onChange={e => setF('host_company', e.target.value)} /></div>
                                            <div><label className="fl">Department / assignment</label><input className="in" value={form.department} onChange={e => setF('department', e.target.value)} /></div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                            <div><label className="fl">Start date</label><input className="in" type="date" value={form.start_date} onChange={e => setF('start_date', e.target.value)} /></div>
                                            <div><label className="fl">End date</label><input className="in" type="date" value={form.end_date} onChange={e => setF('end_date', e.target.value)} /></div>
                                            <div><label className="fl">Required hours</label><input className="in" type="number" min="1" value={form.required_hours} onChange={e => setF('required_hours', e.target.value)} /></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="col">
                                <div className="card" style={{ '--ac': '#a78bfa' }}>
                                    <div className="sh"><FileSignature size={16} /> Memorandum of Agreement (MOA)</div>
                                    <div className="col" style={{ gap: 12 }}>
                                        <div><label className="fl">MOA reference no.</label><input className="in" value={form.moa_ref_no} onChange={e => setF('moa_ref_no', e.target.value)} /></div>
                                        <div className="row2">
                                            <div><label className="fl">Date signed</label><input className="in" type="date" value={form.moa_date_signed} onChange={e => setF('moa_date_signed', e.target.value)} /></div>
                                            <div><label className="fl">Valid until</label><input className="in" type="date" value={form.moa_valid_until} onChange={e => setF('moa_valid_until', e.target.value)} /></div>
                                        </div>
                                        <label className="chk" style={{ margin: 0 }}><input type="checkbox" checked={form.moa_signed} onChange={e => setF('moa_signed', e.target.checked)} /> Signed na ang MOA (parehong partido)</label>
                                        <div>
                                            <label className="fl">MOA document (PDF / image)</label>
                                            <div className="act">
                                                <label className="btn sm" style={{ cursor: 'pointer' }}>
                                                    <Upload size={12} /> {uploading ? 'Uploading...' : 'Palitan ang file'}
                                                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden onChange={e => uploadMoa(e.target.files[0])} />
                                                </label>
                                                {form.moa_file_url && <a className="btn sm" href={fullUrl(form.moa_file_url)} target="_blank" rel="noreferrer"><Paperclip size={12} /> View MOA <Eye size={12} /></a>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="card">
                                    <div className="sh"><ClipboardCheck size={16} /> Internship requirements checklist</div>
                                    {[['endorsement_letter', 'Endorsement Letter'], ['parent_consent', 'Parent Consent Waiver'], ['medical_clearance', 'Medical Clearance']].map(([k, t]) => (
                                        <label key={k} className="chk"><input type="checkbox" checked={form[k]} onChange={e => setF(k, e.target.checked)} /> {t}</label>
                                    ))}
                                </div>
                                <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 10.5, color: dirty ? '#facc15' : '#64748b' }}>{dirty ? 'May hindi pa na-save na pagbabago.' : 'Naka-save sa database.'}</span>
                                    <div className="act">
                                        <button type="button" className="btn" disabled={!dirty} onClick={resetForm}><RotateCcw size={13} /> Reset</button>
                                        <button type="submit" className="btn solid" disabled={!dirty || saving}><Save size={13} /> {saving ? 'Saving...' : 'Save profile'}</button>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </>)}
                </>)}

                {/* ═════ AI EVALUATION ═════ */}
                {tab === 'ai' && (<>
                    <div className="pg"><div><h1>Intern AI Evaluation</h1><p>[ SKILLS AT CAREER PROJECTION NI {scopeName.toUpperCase()} MULA SA KANYANG DTR ENTRIES ]</p></div></div>
                    {InternRow}
                    <div className="card" style={{ marginBottom: 16, '--ac': '#a78bfa' }}>
                        <div className="sh"><Sparkles size={16} /> AI student competency &amp; career evaluation</div>
                        <div style={{ color: '#94a3b8' }}>Kinukwenta mula sa <b>{stats.approved.length} DTR entries</b> ni <b style={{ color: '#fff' }}>{scopeName}</b> (hindi kasama ang rejected at pending). Keyword-based ang analysis na ito.</div>
                    </div>
                    <div className="g2e">
                        <div className="card">
                            <div className="sh"><CheckCircle2 size={16} /> Verified technical capabilities</div>
                            {skills.map(s => (
                                <div key={s.key} style={{ marginBottom: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span style={{ fontWeight: 600, color: '#f8fafc' }}>{s.key}</span><span style={{ color: '#22d3ee' }}>{s.n} entries | {s.pct}%</span></div>
                                    <div className="bar"><i style={{ width: `${s.pct}%` }} /></div>
                                </div>
                            ))}
                        </div>
                        <div className="card" style={{ '--ac': '#a78bfa' }}>
                            <div className="sh"><TrendingUp size={16} /> Future industry role projection</div>
                            {roles.length === 0 && <div className="empty">Wala pang sapat na approved DTR para sa projection.</div>}
                            {roles.map(r => (
                                <div key={r.role} className="role">
                                    <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: '#f8fafc' }}>{r.role}</div><div className="bar" style={{ maxWidth: 260 }}><i style={{ width: `${r.match}%`, background: 'linear-gradient(90deg,#7c3aed,#a78bfa)', boxShadow: '0 0 10px #a78bfa' }} /></div></div>
                                    <span className="chip" style={{ color: '#a78bfa', borderColor: '#a78bfa', background: 'rgba(167,139,250,.15)' }}>{r.match}% Match</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                            <div className="sh" style={{ margin: 0 }}><User size={16} /> Supervisor performance rating: {scopeName}</div>
                            <span style={{ color: ratingAvg ? '#facc15' : '#64748b', fontSize: 11 }}>{ratingAvg ? `Average ${ratingAvg} / 5` : 'Wala pang rating'}</span>
                        </div>
                        {isAll ? <div className="empty" style={{ padding: 12 }}>Pumili ng intern sa taas para mag-rate.</div> : (<>
                            <div className="row2" style={{ gap: '14px 40px' }}>
                                {RATINGS.map(r => (
                                    <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                        <span>{r.label}</span>
                                        <div className="rate">{[1, 2, 3, 4, 5].map(n => (
                                            <button type="button" key={n} className={(Number(ratings[r.key]) || 0) >= n ? 'on' : ''} onClick={() => { setRatings(x => ({ ...x, [r.key]: n })); setDirty(true); }}>{n}</button>
                                        ))}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="act" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
                                <button className="btn solid" disabled={!dirty || saving} onClick={saveProfile}><Save size={13} /> {saving ? 'Saving...' : 'Save rating'}</button>
                            </div>
                        </>)}
                    </div>
                </>)}

                {/* ═════ DISCUSSIONS ═════ */}
                {tab === 'discussions' && (<>
                    <div className="pg"><div><h1>Student Discussions</h1><p>[ MGA USAPAN NINYO NG MGA INTERN BAWAT DTR ENTRY ]</p></div></div>
                    {InternRow}
                    <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                            <div className="sh" style={{ marginBottom: 4 }}><MessageSquare size={16} /> Active student discussion threads</div>
                            <div style={{ color: '#64748b' }}>Nauuna ang mga thread na naghihintay ng reply mo.</div>
                        </div>
                        <span className={`chip ${threadsWaiting ? 'warn' : 'ok'}`}>{threadsWaiting ? `${threadsWaiting} NEEDS REPLY` : 'ALL CAUGHT UP'}</span>
                    </div>
                    {threads.length === 0 ? <div className="card empty"><MessageSquare size={30} /><p>Wala pang usapan sa napiling intern.</p></div> : (
                        <div className="gt">
                            {threads.map(l => {
                                const last = l.messages[l.messages.length - 1]; const waiting = needsReply(l);
                                return (
                                    <div key={idOf(l)} className={`card th ${waiting ? 'new' : ''}`}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', fontSize: 10.5 }}>{l.student_name || 'Student'}</span>{chipFor(l)}
                                        </div>
                                        <div style={{ color: '#38bdf8' }}>DTR: {dateOf(l)}</div>
                                        <div><b>Accomplishment:</b> {l.accomplishment || l.raw_notes}</div>
                                        <div className="pv ell">{isSup(last) ? 'You' : 'Student'}: {msgText(last)}</div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button className="btn solid" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setActiveChatId(idOf(l))}><MessageSquare size={13} /> Open thread</button>
                                            <span className="chip muted" style={{ alignSelf: 'center' }}>{l.messages.length} msgs</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>)}

                {/* ═════ REPORTS ═════ */}
                {tab === 'reports' && (<>
                    <div className="pg"><div><h1>DTR Summary Reports</h1><p>[ OPISYAL NA ULAT NG ORAS NI {scopeName.toUpperCase()} PARA SA PAARALAN ]</p></div></div>
                    {InternRow}
                    <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                            <div className="sh" style={{ marginBottom: 4 }}><FileText size={16} /> Compiled DTR summary &amp; hours report</div>
                            <div style={{ color: '#94a3b8' }}>I-export ang opisyal na ulat ni <b style={{ color: '#fff' }}>{scopeName}</b>{selectedProfile?.school ? <> para sa submission sa <b style={{ color: '#fff' }}>{selectedProfile.school}</b></> : null}.</div>
                        </div>
                        <div className="act">
                            <button className="btn" disabled={!scopeLogs.length} onClick={exportCSV}><Download size={14} /> Export CSV</button>
                            <button className="btn green" disabled={!scopeLogs.length} onClick={printReport}><Printer size={14} /> Print / Save PDF</button>
                        </div>
                    </div>
                    <div className="g4">
                        <div className="card"><div className="lbl">Total approved hours</div><div className="big" style={{ color: '#22d3ee', fontSize: 30 }}>{stats.hours} / {requiredHours} hrs</div></div>
                        <div className="card" style={{ '--ac': '#34d399' }}><div className="lbl">Completion rate</div><div className="big" style={{ color: '#34d399', fontSize: 30 }}>{pct}%</div></div>
                        <div className="card" style={{ '--ac': '#a78bfa' }}><div className="lbl">Verified submissions</div><div className="big" style={{ color: '#a78bfa', fontSize: 30 }}>{stats.approved.length} / {scopeLogs.length}</div></div>
                        <div className="card" style={{ '--ac': '#facc15' }}><div className="lbl">Est. completion</div><div className="big" style={{ color: '#fde047', fontSize: 30 }}>{etaText}</div><div style={{ fontSize: 10, color: '#64748b' }}>{remaining} hrs pa | Lun-Biy</div></div>
                    </div>
                    <div className="g2">
                        <div className="card">
                            <div className="sh"><CalendarDays size={16} /> Approved hours per week</div>
                            <div className="chart">{weeks.map(w => (
                                <div key={w.label}>{w.hrs > 0 && <b>{w.hrs}</b>}<i style={{ height: `${(w.hrs / maxWeek) * 100}%`, opacity: w.hrs ? 1 : .25 }} /><span>{w.label}</span></div>
                            ))}</div>
                        </div>
                        <div className="card" style={{ '--ac': remaining === 0 ? '#34d399' : '#22d3ee', display: 'flex', alignItems: 'center', gap: 18 }}>
                            <Ring pct={pct} size={96} stroke={9} color={remaining === 0 ? '#34d399' : '#22d3ee'}><Award size={30} color={remaining === 0 ? '#34d399' : '#22d3ee'} /></Ring>
                            <div>
                                <div className="lbl">[ Certificate of completion ]</div>
                                <div className="hd" style={{ fontSize: 20, fontWeight: 700, margin: '6px 0', color: remaining === 0 ? '#34d399' : '#facc15' }}>{remaining === 0 ? 'ELIGIBLE' : 'NOT YET ELIGIBLE'}</div>
                                <div style={{ color: '#94a3b8', lineHeight: 1.5 }}>{remaining === 0 ? 'Kumpleto na ang required hours.' : `Kailangan pa ng ${remaining} oras para ma-complete ang ${requiredHours} hrs.`}</div>
                            </div>
                        </div>
                    </div>
                    <div className="card">
                        <div className="sh"><FileText size={16} /> Complete DTR record: {scopeName}</div>
                        {logTable([...scopeLogs].sort((a, b) => dateOf(b).localeCompare(dateOf(a))), false)}
                    </div>
                </>)}
            </main>

            {/* ───── REJECT MODAL ───── */}
            {rejectTarget && (
                <div className="ovl">
                    <div className="modal">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <h3 style={{ color: '#f87171', fontSize: 16, textTransform: 'uppercase', display: 'flex', gap: 8, alignItems: 'center' }}><AlertCircle size={18} /> Reject DTR record</h3>
                            <button className="btn sm" aria-label="Close" onClick={() => setRejectTarget(null)}><X size={14} /></button>
                        </div>
                        <p style={{ color: '#94a3b8', margin: '0 0 10px' }}>{rejectTarget.student_name} • {dateOf(rejectTarget)}. Ito ang makikita ng student bilang remark sa Resubmit.</p>
                        <textarea className="in" rows="4" value={reason} onChange={e => setReason(e.target.value)} placeholder="Dahilan ng rejection..." style={{ resize: 'none', marginBottom: 14 }} />
                        <div className="act" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn" onClick={() => setRejectTarget(null)}>Cancel</button>
                            <button className="btn bad" disabled={!reason.trim()} onClick={() => handleStatus(idOf(rejectTarget), 'rejected', reason.trim())}>Confirm reject</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ───── CHAT MODAL ───── */}
            {activeChatLog && (
                <div className="ovl" style={{ zIndex: 300 }}>
                    <div className="modal" style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                            <div>
                                <h3 style={{ fontSize: 16, textTransform: 'uppercase', display: 'flex', gap: 8, alignItems: 'center' }}><MessageSquare size={18} color="#22d3ee" /> {activeChatLog.student_name || 'Student'}</h3>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>DTR record: <b style={{ color: '#38bdf8' }}>{dateOf(activeChatLog)}</b> • {statusOf(activeChatLog).toUpperCase()}</div>
                            </div>
                            <button className="btn sm" aria-label="Close" onClick={() => setActiveChatId(null)}><X size={14} /></button>
                        </div>
                        <div style={{ minHeight: 250, maxHeight: 360, overflowY: 'auto', background: 'rgba(5,8,22,.8)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: 14, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {!activeChatLog.messages?.length ? <div className="empty" style={{ margin: 'auto' }}><b style={{ color: '#94a3b8' }}>Wala pang usapan dito. Magsimula ka!</b></div>
                                : activeChatLog.messages.map((m, i) => {
                                    const me = isSup(m);
                                    return (
                                        <div key={m.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start' }}>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10.5, color: '#64748b', marginBottom: 3 }}>
                                                {me ? <><Shield size={11} color="#38bdf8" /><b style={{ color: '#38bdf8' }}>You</b></> : <><User size={11} color="#a78bfa" /><b style={{ color: '#a78bfa' }}>Student</b></>}
                                                <span>• {m.timestamp || 'Recently'}</span>
                                            </div>
                                            <div className={`bub ${me ? 'me' : 'other'}`}>{msgText(m)}</div>
                                        </div>
                                    );
                                })}
                            <div ref={chatEndRef} />
                        </div>
                        <form onSubmit={sendReply} style={{ display: 'flex', gap: 8 }}>
                            <input className="in" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Mag-type ng mensahe para sa student..." />
                            <button type="submit" className="btn solid" disabled={!replyText.trim()}><Send size={14} /> Send</button>
                        </form>
                    </div>
                </div>
            )}

            {toast && <div className={`toast ${toast.err ? 'err' : ''}`} role="status">{toast.msg}</div>}
        </div>
    );
}