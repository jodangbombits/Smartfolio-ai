import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    MessageSquare, Send, X, User, Shield, FileText, Eye, Paperclip, Clock, Plus,
    Upload, RotateCcw, AlertCircle, Sparkles, LayoutDashboard, Mail, Bot, Search,
    Download, Copy, Zap, CheckCircle2, Award, Wand2, LogOut, CalendarDays, Building2, FileSignature
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const REQUIRED_HOURS = 500;
const POLL_MS = 3000;

/* ───────────── Helpers ───────────── */
const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const getLocalDateString = () => keyOf(new Date());
const parseLocal = (s) => { const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number); return (y && m && d) ? new Date(y, m - 1, d) : null; };
const weekStartKey = (s) => { const d = parseLocal(s) || new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return keyOf(d); };
const shortDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const addBusinessDays = (n) => { const d = new Date(); let left = n; while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6 !== 0) left--; } return d; };
const msgText = (m) => typeof m === 'string' ? m : (m.message || m.text || m.remark || m.content || '');
const idOf = (l) => l.id || l.log_id;
const hrsOf = (l) => parseFloat(l.rendered_today || l.hoursRendered || 0) || 0;
const statusOf = (l) => (l.status || 'pending').toLowerCase();
const dateOf = (l) => l.log_date || l.date || '';
const isStudentMsg = (m) => m && m.sender === 'student';
const sameJson = (prev, next) => JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
const safeUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}') || {}; } catch { return {}; } };

const getRejectionRemark = (log) => {
    if (!log) return '';

    // 1. Unang icheck ang direct column fields mula sa dtr_logs table
    if (log.rejection_reason && log.rejection_reason.trim()) return log.rejection_reason;
    if (log.remarks && typeof log.remarks === 'string' && log.remarks.trim()) return log.remarks;
    if (log.supervisor_comment && log.supervisor_comment.trim()) return log.supervisor_comment;

    // 2. Kung wala doon, icheck ang messages o remarks array
    if (Array.isArray(log.messages) && log.messages.length > 0) {
        const lastSupMsg = [...log.messages].reverse().find(m => m.sender === 'supervisor' || m.sender_role === 'supervisor');
        if (lastSupMsg && (lastSupMsg.message || lastSupMsg.text)) {
            return (lastSupMsg.message || lastSupMsg.text).replace(/^REJECTED:\s*/i, '');
        }
    }

    if (Array.isArray(log.remarks) && log.remarks.length > 0) {
        const lastRemark = log.remarks[log.remarks.length - 1];
        if (typeof lastRemark === 'string') return lastRemark;
        if (lastRemark && lastRemark.message) return lastRemark.message.replace(/^REJECTED:\s*/i, '');
    }

    // 3. Fallback lang kung talagang walang itinype ang supervisor
    return 'Walang inilagay na tiyak na dahilan ang supervisor.';
};
const fmtDate = (s) => { const d = s instanceof Date ? s : parseLocal(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };
const fullUrl = (u) => !u ? null : /^https?:\/\//i.test(u) ? u : `${API_BASE_URL}${u.startsWith('/') ? '' : '/'}${u}`;

// Tumatanggap ng snake_case (galing DB) o camelCase (aliases ng backend)
const normProfile = (p) => {
    if (!p || typeof p !== 'object') return null;
    const g = (a, b) => p[a] ?? p[b];
    return {
        school: g('school', 'p_school'), course: g('course', 'p_course'), email: p.email,
        yearLevel: g('yearLevel', 'year_level'), adviser: p.adviser ?? p.school_coordinator,
        hostCompany: g('hostCompany', 'host_company'), department: p.department,
        startDate: g('startDate', 'start_date'), endDate: g('endDate', 'end_date'),
        requiredHours: g('requiredHours', 'required_hours'),
        moaNumber: g('moaNumber', 'moa_ref_no'), moaDateSigned: g('moaDateSigned', 'moa_date_signed'),
        moaValidUntil: g('moaValidUntil', 'moa_valid_until'), moaFileUrl: g('moaFileUrl', 'moa_file_url'),
        moaSigned: Boolean(g('moaSigned', 'moa_signed')),
        endorsementLetter: Boolean(g('endorsementLetter', 'endorsement_letter')),
        parentConsent: Boolean(g('parentConsent', 'parent_consent')),
        medicalClearance: Boolean(g('medicalClearance', 'medical_clearance')),
        ratings: p.ratings || {}
    };
};

const getMoaState = (p, today) => {
    if (!p.moaSigned && !p.moaNumber && !p.moaFileUrl && !p.moaValidUntil) return { label: 'NOT RECORDED', cls: 'muted', note: 'Wala pang MOA na naitala ng Supervisor.' };
    if (!p.moaSigned) return { label: 'PENDING SIGNATURE', cls: 'warn', note: 'Hindi pa naka-mark na signed ang MOA.' };
    const vu = parseLocal(p.moaValidUntil);
    if (vu) {
        if (vu < today) return { label: 'EXPIRED', cls: 'bad', note: `Nag-expire noong ${fmtDate(vu)}.` };
        const days = Math.round((vu - today) / 86400000);
        if (days <= 30) return { label: 'EXPIRING SOON', cls: 'warn', note: `${days} araw na lang bago mag-expire.` };
    }
    return { label: 'ACTIVE', cls: 'ok', note: vu ? `Valid hanggang ${fmtDate(vu)}.` : 'Active.' };
};

const compressImage = (file, maxSize = 1600, quality = 0.8) =>
    new Promise((resolve) => {
        if (!file || !file.type.startsWith('image/')) return resolve(file);
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(url);
                if (!blob || blob.size >= file.size) return resolve(file);
                resolve(new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
            }, 'image/jpeg', quality);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });

const REQS = [
    { key: 'moaSigned', label: 'MOA Signed' },
    { key: 'endorsementLetter', label: 'Endorsement Letter' },
    { key: 'parentConsent', label: 'Parent Consent Waiver' },
    { key: 'medicalClearance', label: 'Medical Clearance' }
];
const RATINGS = [
    { key: 'punctuality', label: 'Punctuality & Attendance' },
    { key: 'quality', label: 'Quality of Work' },
    { key: 'initiative', label: 'Initiative & Learning' },
    { key: 'communication', label: 'Communication & Teamwork' }
];

const CATS = [
    { key: 'Frontend / UI Development', re: /ui|design|react|css|frontend|layout|form|dashboard/i, role: 'Front-End / UI Developer' },
    { key: 'Debugging & Testing', re: /debug|bug|fix|error|test/i, role: 'QA & Debugging Support' },
    { key: 'Database & Data Handling', re: /database|sql|query|inventory|table|data|where|inner|join/i, role: 'Database Associate' },
    { key: 'Security & Audit', re: /audit|security|login|auth|otp|trail/i, role: 'Cybersecurity Associate' },
    { key: 'Backend & API (REST)', re: /api|backend|endpoint|server|fastapi|payment|pos/i, role: 'Backend / API Developer' },
    { key: 'Documentation & Reporting', re: /document|report|docs|manual|summary/i, role: 'Technical Writer' }
];

const VERBS = [
    [/ui|design|layout|css|frontend|react/i, 'Designed and refined user interface components'],
    [/debug|bug|fix|error|test/i, 'Debugged and resolved issues to improve stability'],
    [/database|sql|query|table|schema|inventory/i, 'Worked on database structures and queries'],
    [/api|backend|endpoint|server|fastapi/i, 'Built and tested backend API functionality'],
    [/audit|security|login|auth|otp/i, 'Strengthened security and audit features'],
    [/document|report|docs|manual/i, 'Prepared documentation and progress reports']
];
const polishNotes = (raw) => raw.split(/[,\n;]+|\band\b/i).map(s => s.trim()).filter(Boolean).map(chunk => {
    const hit = VERBS.find(([re]) => re.test(chunk));
    const cap = chunk.charAt(0).toUpperCase() + chunk.slice(1);
    return hit ? `${hit[1]} (${cap}).` : `Completed task: ${cap}.`;
}).map(l => `• ${l}`).join('\n');

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
.lbl{font-size:10.5px;letter-spacing:.14em;color:var(--mut);text-transform:uppercase}
.big{font-family:'Chakra Petch',sans-serif;font-size:38px;font-weight:700;line-height:1.1;margin:8px 0 4px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
.g2{display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:16px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px}
.gt{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.bar{height:7px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}
.bar>i{display:block;height:100%;background:linear-gradient(90deg,#0891b2,#22d3ee);box-shadow:0 0 10px #22d3ee;transition:width .6s}
.sh{display:flex;align-items:center;gap:8px;font-family:'Chakra Petch',sans-serif;font-weight:600;letter-spacing:.1em;text-transform:uppercase;font-size:13.5px;color:#f1f5f9;margin-bottom:12px}
.sh svg{color:var(--cy)}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:9px;border:1px solid var(--line);background:rgba(34,211,238,.08);color:var(--cy);font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;text-decoration:none}
.btn:hover:not(:disabled){background:rgba(34,211,238,.18)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn.solid{background:linear-gradient(90deg,#0891b2,#0e7490);color:#fff;border-color:#22d3ee;box-shadow:0 0 18px rgba(34,211,238,.4)}
.btn.bad{color:var(--bad);border-color:rgba(248,113,113,.45);background:rgba(239,68,68,.12)}
.btn.vi{color:var(--vi);border-color:rgba(167,139,250,.5);background:rgba(167,139,250,.1)}
.btn.sm{padding:5px 10px;font-size:10.5px}
.pill{padding:5px 12px;border-radius:99px;border:1px solid var(--line);background:none;color:#94a3b8;font-size:10.5px;cursor:pointer;letter-spacing:.06em;text-transform:uppercase}
.pill.on{color:var(--cy);background:rgba(34,211,238,.14);box-shadow:0 0 12px rgba(34,211,238,.25)}
.chip{display:inline-block;padding:3px 10px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:.08em;border:1px solid}
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
.cnt{background:#38bdf8;color:#082f49;border-radius:99px;padding:0 6px;font-size:10px;font-weight:800}
.chart{display:flex;align-items:flex-end;gap:14px;height:170px;padding-top:18px}
.chart>div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px;font-size:10px;color:var(--mut)}
.chart i{display:block;width:100%;max-width:46px;border-radius:5px 5px 0 0;background:linear-gradient(180deg,#22d3ee,#0e7490);box-shadow:0 0 14px rgba(34,211,238,.45);min-height:2px}
.chart b{color:#cffafe;font-size:10.5px}
.ringin{position:absolute;inset:0;display:grid;place-items:center;text-align:center}
.th{display:flex;flex-direction:column;gap:9px}
.th .pv{padding:8px 10px;border-radius:8px;background:rgba(5,8,22,.7);border:1px solid rgba(255,255,255,.07);color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.th.new{--ac:#facc15}
.ta{width:100%;min-height:96px;resize:vertical;background:rgba(5,8,22,.75);border:1px solid var(--line);border-radius:10px;padding:10px;color:#e2e8f0;font:inherit}
.out{white-space:pre-wrap;background:rgba(5,8,22,.75);border:1px dashed rgba(34,211,238,.4);border-radius:10px;padding:12px;min-height:96px;line-height:1.6;color:#cffafe}
.ms{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.ms:last-child{border:0}
.ms .ic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;border:1px solid var(--line);color:var(--mut)}
.ms.done .ic{color:var(--ok);border-color:var(--ok);background:rgba(52,211,153,.1)}
.ovl{position:fixed;inset:0;background:rgba(2,6,18,.8);backdrop-filter:blur(6px);display:grid;place-items:center;z-index:200;padding:16px}
.modal{width:min(480px,100%);max-height:92vh;overflow:auto;background:#0a1020;border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:0 0 50px rgba(34,211,238,.18)}
.fl{display:block;font-size:10.5px;letter-spacing:.12em;color:var(--mut);text-transform:uppercase;margin-bottom:6px}
.in{width:100%;background:rgba(15,23,42,.8);border:1px solid var(--line);border-radius:9px;padding:9px 10px;color:#fff;font:inherit;outline:0;color-scheme:dark}
.bub{max-width:85%;padding:9px 12px;font-size:12.5px;line-height:1.5;word-break:break-word;color:#fff}
.bub.me{background:#0e7490;border-radius:14px 14px 3px 14px}
.bub.sup{background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.35);border-radius:14px 14px 14px 3px}
.toast{position:fixed;right:20px;bottom:20px;z-index:400;padding:12px 16px;border-radius:10px;background:#0a1020;border:1px solid var(--ok);color:var(--ok);box-shadow:0 0 24px rgba(52,211,153,.3)}
.toast.err{border-color:var(--bad);color:var(--bad);box-shadow:0 0 24px rgba(248,113,113,.3)}
.empty{text-align:center;padding:36px 12px;color:var(--mut)}
.col{display:flex;flex-direction:column;gap:14px}
.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px}
.dots{display:flex;gap:5px}.dots i{width:22px;height:8px;border-radius:4px;background:rgba(255,255,255,.1)}.dots i.on{background:#a78bfa;box-shadow:0 0 8px #a78bfa}
@media (max-width:1100px){.g4{grid-template-columns:repeat(2,1fr)}.g2,.g3{grid-template-columns:1fr}}
@media (max-width:860px){.sf-side{position:static;width:100%;flex-direction:row;flex-wrap:wrap;align-items:center}.sf-me{display:none}.sf-out{margin:0 0 0 auto;width:auto}.sf-main{margin-left:0;padding:16px}.nav{width:auto}.g4{grid-template-columns:1fr}.pg h1{font-size:24px}}
`;

const Ring = ({ pct, size = 104, stroke = 9, color = '#22d3ee', children }) => {
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

const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'logs', label: 'My DTR Logs', icon: FileText },
    { id: 'messages', label: 'Messages', icon: Mail },
    { id: 'ai', label: 'AI Assistant', icon: Bot },
    { id: 'profile', label: 'Profile', icon: User }
];

const HEAD = {
    dashboard: ['Student Dashboard', 'DTR COMMUNICATION & LOG PORTAL'],
    logs: ['My DTR Logs', 'LAHAT NG ISINUMITE MONG DTR'],
    messages: ['Supervisor Messages', 'MGA USAPAN SA BAWAT DTR ENTRY'],
    ai: ['AI Assistant', 'MATALINONG KATULONG PARA SA IYONG OJT'],
    profile: ['My Profile', 'IMPORMASYON AT PROGRESS NG IYONG INTERNSHIP']
};

export default function StudentDashboard({ studentName: studentNameProp = 'Student', studentInfo = null, user = null, onLogout }) {
    const savedUser = safeUser();
    const info = { ...savedUser, ...(user || {}), ...(studentInfo || {}) };
    // Walang fallback sa fake ID — kung walang user, walang ife-fetch
    const currentUserId = studentInfo?.id || user?.id || savedUser?.id || savedUser?.user_id || null;
    const studentName = studentInfo?.name || studentInfo?.full_name || savedUser?.full_name || savedUser?.name || studentNameProp;

    const [logs, setLogs] = useState([]);
    const [tab, setTab] = useState('dashboard');
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [toast, setToast] = useState(null);
    const [internProfile, setInternProfile] = useState(null);
    const prof = internProfile || {};
    const requiredHours = Number(prof.requiredHours) || REQUIRED_HOURS;

    const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
    const [resubmitTargetLog, setResubmitTargetLog] = useState(null);
    const [logDate, setLogDate] = useState(getLocalDateString());
    const [timeIn, setTimeIn] = useState('08:00');
    const [timeOut, setTimeOut] = useState('18:00');
    const [accomplishment, setAccomplishment] = useState('');
    const [proofFile, setProofFile] = useState(null);
    const [existingProofUrl, setExistingProofUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [activeChatId, setActiveChatId] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [isSendingChat, setIsSendingChat] = useState(false);
    const chatEndRef = useRef(null);

    const [rawIdea, setRawIdea] = useState('');
    const [polished, setPolished] = useState('');

    const notify = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3200); };

    /* ── Realtime fetching ── */
    const fetchDTRLogs = useCallback(async () => {
        if (!currentUserId) return;
        try {
            const cleanUserId = String(currentUserId).split(':')[0].replace(/[^0-9]/g, '');
            const res = await fetch(`${API_BASE_URL}/api/dtr/${cleanUserId}`);
            if (!res.ok) return;
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.logs || []);
            setLogs(prev => sameJson(prev, list));
        } catch (e) { console.error('Error fetching DTR logs:', e); }
    }, [currentUserId]);

    const fetchInternProfile = useCallback(async () => {
        if (!currentUserId) return;
        try {
            const cleanUserId = String(currentUserId).split(':')[0].replace(/[^0-9]/g, '');
            const res = await fetch(`${API_BASE_URL}/api/interns/${cleanUserId}/profile`);
            if (res.ok) {
                const data = normProfile(await res.json());
                setInternProfile(prev => sameJson(prev, data));
            }
        } catch (e) { console.error('Error fetching intern profile:', e); }
    }, [currentUserId]);

    useEffect(() => {
        fetchDTRLogs(); fetchInternProfile();
        const t = setInterval(() => { fetchDTRLogs(); fetchInternProfile(); }, POLL_MS);
        return () => clearInterval(t);
    }, [fetchDTRLogs, fetchInternProfile]);

    // Laging galing sa latest logs ang bukas na chat / resubmit (hindi na stale)
    const activeChatLog = useMemo(() => logs.find(l => idOf(l) === activeChatId) || null, [logs, activeChatId]);
    const resubmitLog = useMemo(() => resubmitTargetLog ? (logs.find(l => idOf(l) === idOf(resubmitTargetLog)) || resubmitTargetLog) : null, [logs, resubmitTargetLog]);

    const activeMessageCount = activeChatLog?.messages?.length || 0;
    useEffect(() => { if (activeMessageCount > 0) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeMessageCount, activeChatId]);

    const calcHours = (a, b) => {
        if (!a || !b) return 0;
        const [ah, am] = a.split(':').map(Number), [bh, bm] = b.split(':').map(Number);
        let end = bh + bm / 60; const start = ah + am / 60;
        if (end < start) end += 24;
        return parseFloat((end - start).toFixed(2));
    };
    /* ── Derived Stats ── */
    const S = useMemo(() => {
        const approved = logs.filter(l => statusOf(l) === 'approved');
        const rejected = logs.filter(l => statusOf(l) === 'rejected');
        const pending = logs.filter(l => !['approved', 'rejected'].includes(statusOf(l)));
        const hours = approved.reduce((s, l) => s + hrsOf(l), 0);
        const pct = Math.min(100, Math.round((hours / requiredHours) * 100));
        const remaining = Math.max(0, requiredHours - hours);
        const avg = approved.length ? hours / approved.length : 8;
        const eta = remaining === 0 ? null : addBusinessDays(Math.ceil(remaining / avg));

        const weekMap = {};
        approved.forEach(l => { const k = weekStartKey(dateOf(l)); weekMap[k] = (weekMap[k] || 0) + hrsOf(l); });
        const weeks = [];
        const cur = parseLocal(weekStartKey(getLocalDateString()));
        for (let i = 5; i >= 0; i--) { const d = new Date(cur); d.setDate(d.getDate() - i * 7); weeks.push({ label: shortDate(d), hrs: weekMap[keyOf(d)] || 0 }); }

        const needsReply = logs.filter(l => l.messages?.length && !isStudentMsg(l.messages[l.messages.length - 1]));
        return { approved, rejected, pending, hours, pct, remaining, eta, weeks, needsReply, maxWeek: Math.max(1, ...weeks.map(w => w.hrs)) };
    }, [logs, requiredHours]);

    const visibleLogs = useMemo(() => {
        const q = search.trim().toLowerCase();
        return logs.filter(l => {
            const st = statusOf(l);
            if (statusFilter === 'pending' && ['approved', 'rejected'].includes(st)) return false;
            if (statusFilter === 'approved' && st !== 'approved') return false;
            if (statusFilter === 'rejected' && st !== 'rejected') return false;
            if (!q) return true;
            return `${dateOf(l)} ${l.accomplishment || l.raw_notes || ''}`.toLowerCase().includes(q);
        });
    }, [logs, statusFilter, search]);

    /* ── Actions ── */
    const openNew = (prefill = '') => {
        setResubmitTargetLog(null); setLogDate(getLocalDateString()); setTimeIn('08:00'); setTimeOut('18:00');
        setAccomplishment(typeof prefill === 'string' ? prefill : ''); setProofFile(null); setExistingProofUrl(''); setIsSubmitModalOpen(true);
    };
    const openResubmit = (log) => {
        setResubmitTargetLog(log); setLogDate(dateOf(log) || getLocalDateString());
        setTimeIn(log.time_in || '08:00'); setTimeOut(log.time_out || '18:00');
        setAccomplishment(log.accomplishment || log.raw_notes || ''); setExistingProofUrl(log.proof_url || ''); setProofFile(null); setIsSubmitModalOpen(true);
    };

    const handleSubmitDTR = async (e) => {
        e.preventDefault();
        const hours = calcHours(timeIn, timeOut);
        if (hours <= 0) {
            notify('Mali ang oras. Siguraduhing tama ang Time In at Time Out.', true);
            return;
        }

        setIsSubmitting(true);
        try {
            let proofUrl = existingProofUrl || '';

            // Mag-upload LANG kung may bagong napiling file ang student
            if (proofFile) {
                try {
                    const fd = new FormData();
                    const processedFile = typeof compressImage === 'function' ? await compressImage(proofFile) : proofFile;
                    fd.append('file', processedFile);

                    const up = await fetch(`${API_BASE_URL}/api/upload`, { method: 'POST', body: fd });
                    if (up.ok) {
                        const d = await up.json();
                        proofUrl = d.proof_url || d.url || proofUrl;
                    }
                } catch (upErr) {
                    console.error("Proof upload failed, keeping existing proof:", upErr);
                }
            }

            // Tiyaking makuha ang tamang Log ID
            const targetLogId = resubmitTargetLog ? (resubmitTargetLog.id || resubmitTargetLog.dtr_id || resubmitTargetLog.log_id) : null;

            const payload = {
                user_id: Number(currentUserId),
                student_name: String(studentName || ''),
                log_date: String(logDate || ''),
                time_in: String(timeIn || ''),
                time_out: String(timeOut || ''),
                rendered_today: Number(hours),
                accomplishment: String(accomplishment || ''),
                raw_notes: String(accomplishment || ''),
                proof_url: String(proofUrl || ''),
                status: 'pending'
            };

            if (targetLogId) {
                payload.dtr_id = Number(targetLogId);
                payload.id = Number(targetLogId);
            }

            console.log("SENDING DTR PAYLOAD:", payload);

            const res = await fetch(`${API_BASE_URL}/api/dtr/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const resData = await res.json().catch(() => ({}));

            if (res.ok) {
                notify(resubmitTargetLog ? 'Na-resubmit na ang DTR mo at naka-PENDING na ulit!' : 'Na-submit na ang DTR!');
                setIsSubmitModalOpen(false);
                setResubmitTargetLog(null);
                setAccomplishment('');
                setProofFile(null);
                fetchDTRLogs();
            } else {
                console.error("SERVER RESPONSE ERROR:", resData);
                const errDetail = resData.detail || resData.message || 'Hindi na-submit. Subukang muli.';
                notify(`Error (${res.status}): ${typeof errDetail === 'object' ? JSON.stringify(errDetail) : errDetail}`, true);
            }
        } catch (err) {
            console.error("FRONTEND SUBMIT EXCEPTION:", err);
            notify('Hindi na-submit. May problema sa submission request.', true);
        } finally {
            setIsSubmitting(false);
        }
    };
};
const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !activeChatLog || isSendingChat) return;
    setIsSendingChat(true);
    const logId = idOf(activeChatLog), text = replyText.trim();
    setReplyText('');

    const newMsg = {
        sender: 'student',
        message: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Aggressive Optimistic UI — Idagdag agad sa local state para HINDI NA MAWALA!
    setLogs(prev => prev.map(l => {
        if (idOf(l) === logId) {
            const curMsgs = Array.isArray(l.messages) ? l.messages : [];
            return { ...l, messages: [...curMsgs, newMsg] };
        }
        return l;
    }));

    try {
        const res = await fetch(`${API_BASE_URL}/api/dtr/${logId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: 'student', message: text })
        });

        if (res.ok) {
            notify('Naipadala na ang mensahe!');
            fetchDTRLogs();
        } else {
            console.error("Message send server error:", res.status);
        }
    } catch (err) {
        console.error("Chat fetch error:", err);
    } finally {
        setIsSendingChat(false);
    }
};

const handleLogout = () => { if (onLogout) onLogout(); else { localStorage.clear(); window.location.reload(); } };
const copy = async (t, ok = 'Na-copy.') => { try { await navigator.clipboard.writeText(t); notify(ok); } catch { notify('Hindi ma-copy.', true); } };

const weeklyReport = useMemo(() => {
    const wk = weekStartKey(getLocalDateString());
    const rows = logs.filter(l => weekStartKey(dateOf(l)) === wk && statusOf(l) !== 'rejected')
        .sort((a, b) => String(dateOf(a)).localeCompare(String(dateOf(b))));
    if (!rows.length) return '';
    const total = rows.reduce((s, l) => s + hrsOf(l), 0);
    return [`WEEKLY ACCOMPLISHMENT REPORT`, `Intern: ${studentName}`, `Week of ${shortDate(parseLocal(wk))}`, '',
        ...rows.map(l => `${dateOf(l)} | ${l.time_in || '08:00'}-${l.time_out || '18:00'} | ${hrsOf(l)} hrs\n${polishNotes(l.accomplishment || l.raw_notes || '')}`),
        '', `Total hours this week: ${total}`, `Total approved hours to date: ${S.hours} / ${requiredHours}`].join('\n');
}, [logs, studentName, S.hours, requiredHours]);

const exportCSV = () => {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Date', 'Time In', 'Time Out', 'Hours', 'Accomplishment', 'Status', 'Supervisor Remark'],
    ...logs.map(l => [dateOf(l), l.time_in || '08:00', l.time_out || '18:00', hrsOf(l), l.accomplishment || l.raw_notes, statusOf(l), getRejectionRemark(l)])];
    const url = URL.createObjectURL(new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'my-dtr-logs.csv'; a.click(); URL.revokeObjectURL(url);
};

const chip = (l) => { const s = statusOf(l); return <span className={`chip ${s === 'approved' ? 'ok' : s === 'rejected' ? 'bad' : 'warn'}`}>{s.toUpperCase()}</span>; };

const renderTable = (rows) => (
    <div className="tw">
        <table className="tbl">
            <thead><tr><th>Date</th><th>Time</th><th>Hours</th><th>Accomplishments</th><th>Proof</th><th>Status</th><th>Messages & Actions</th></tr></thead>
            <tbody>
                {rows.length === 0 && <tr><td colSpan="7"><div className="empty">Walang DTR na tumutugma. Magdagdag ng bagong entry o palitan ang filter.</div></td></tr>}
                {rows.map(l => {
                    const n = l.messages?.length || 0;
                    const supReply = (l.messages || []).some(m => !isStudentMsg(m));
                    const remark = statusOf(l) === 'rejected' ? getRejectionRemark(l) : '';
                    return (
                        <tr key={idOf(l)}>
                            <td style={{ color: '#22d3ee', whiteSpace: 'nowrap' }}>{dateOf(l)}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{l.time_in || '08:00'} - {l.time_out || '18:00'}</td>
                            <td style={{ color: '#38bdf8', fontWeight: 700, whiteSpace: 'nowrap' }}>{hrsOf(l)} hrs</td>
                            <td style={{ color: '#94a3b8', maxWidth: 260 }}>{l.accomplishment || l.raw_notes}</td>
                            <td>{l.proof_url
                                ? <a className="btn sm" href={fullUrl(l.proof_url)} target="_blank" rel="noreferrer"><Paperclip size={12} /> View Proof <Eye size={12} /></a>
                                : <span style={{ color: '#475569', fontStyle: 'italic' }}>No file</span>}</td>
                            <td>
                                {chip(l)}
                                {remark && <div style={{ color: '#fca5a5', fontSize: 10.5, marginTop: 6, maxWidth: 180, wordBreak: 'break-word' }}>{remark}</div>}
                            </td>
                            <td><div className="act">
                                <button className="btn sm" style={supReply ? { borderColor: '#22d3ee', boxShadow: '0 0 10px rgba(34,211,238,.35)' } : null} onClick={() => setActiveChatId(idOf(l))}>
                                    <MessageSquare size={12} /> Chat {n > 0 && <span className="cnt">{n}</span>}
                                </button>
                                {statusOf(l) === 'rejected' && <button className="btn sm bad" onClick={() => openResubmit(l)}><RotateCcw size={12} /> Resubmit</button>}
                            </div></td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

const filters = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['all', 'All', logs.length], ['pending', 'Pending', S.pending.length], ['approved', 'Approved', S.approved.length], ['rejected', 'Rejected', S.rejected.length]].map(([k, t, n]) => (
            <button key={k} className={`pill ${statusFilter === k ? 'on' : ''}`} onClick={() => setStatusFilter(k)}>{t} [{n}]</button>
        ))}
        <label className="srch"><Search size={14} color="#64748b" /><input placeholder="Search date or notes..." value={search} onChange={e => setSearch(e.target.value)} /></label>
    </div>
);

const etaText = S.eta ? S.eta.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Complete';

return (
    <div className="sf">
        <style>{CSS}</style>

        <aside className="sf-side">
            <div className="sf-logo"><Zap size={18} /> SmartFolio Hub</div>
            <div className="sf-me">
                <div className="av">{String(studentName).charAt(0).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                    <div className="hd" style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{studentName}</div>
                    <div style={{ fontSize: 10, color: '#a78bfa' }}>DTR Student Portal</div>
                </div>
            </div>
            {NAV.map(n => (
                <button key={n.id} className={`nav ${tab === n.id ? 'on' : ''}`} onClick={() => setTab(n.id)}>
                    <n.icon size={16} /> {n.label}
                    {n.id === 'messages' && S.needsReply.length > 0 && <span className="bd">{S.needsReply.length}</span>}
                </button>
            ))}
            <button className="nav sf-out" onClick={handleLogout}><LogOut size={16} /> Logout Portal</button>
        </aside>

        <main className="sf-main">
            <div className="top">
                <span><span className="dot" />SYS ONLINE // STUDENT SESSION</span>
                <span>INTERN: <b style={{ color: '#a78bfa' }}>{studentName}</b> | {requiredHours} HRS REQUIRED</span>
            </div>

            <div className="pg">
                <div><h1>{HEAD[tab][0]}</h1><p>[ {HEAD[tab][1]} ]</p></div>
                <button className="btn solid" onClick={() => openNew()}><Plus size={15} /> New DTR Entry</button>
            </div>

            {/* ───── DASHBOARD ───── */}
            {tab === 'dashboard' && (<>
                <div className="g4">
                    <div className="card">
                        <div className="lbl">Approved hours</div>
                        <div className="big" style={{ color: '#22d3ee' }}>{S.hours}<span style={{ fontSize: 16, color: '#64748b' }}> / {requiredHours}</span></div>
                        <div className="bar"><i style={{ width: `${S.pct}%` }} /></div>
                        <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 6 }}>{S.pct}% complete</div>
                    </div>
                    <div className="card" style={{ '--ac': '#facc15' }}>
                        <div className="lbl">Pending approval</div>
                        <div className="big" style={{ color: '#facc15' }}>{S.pending.length}</div>
                        <div style={{ fontSize: 10.5, color: '#64748b' }}>Hinihintay ang review ng Supervisor</div>
                    </div>
                    <div className="card" style={{ '--ac': '#f87171' }}>
                        <div className="lbl">Needs revision</div>
                        <div className="big" style={{ color: '#f87171' }}>{S.rejected.length}</div>
                        <div style={{ fontSize: 10.5, color: '#64748b' }}>{S.rejected.length ? 'May Resubmit button sa table' : 'Walang kailangang ayusin'}</div>
                    </div>
                    <div className="card" style={{ '--ac': '#a78bfa', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <Ring pct={S.pct} color="#a78bfa" size={84} stroke={8}><b className="hd" style={{ fontSize: 17 }}>{S.pct}%</b></Ring>
                        <div>
                            <div className="lbl">Est. completion</div>
                            <div className="hd" style={{ fontSize: 19, fontWeight: 700, color: '#c4b5fd', margin: '4px 0' }}>{etaText}</div>
                            <div style={{ fontSize: 10.5, color: '#64748b' }}>{S.remaining} hrs pa | Lun-Biy</div>
                        </div>
                    </div>
                </div>

                <div className="g2">
                    <div className="card">
                        <div className="sh"><CalendarDays size={16} /> Approved hours per week</div>
                        <div className="chart">
                            {S.weeks.map(w => (
                                <div key={w.label}>
                                    {w.hrs > 0 && <b>{w.hrs}</b>}
                                    <i style={{ height: `${(w.hrs / S.maxWeek) * 100}%`, opacity: w.hrs ? 1 : .25 }} />
                                    <span>{w.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="card" style={{ '--ac': S.remaining === 0 ? '#34d399' : '#22d3ee', display: 'flex', alignItems: 'center', gap: 18 }}>
                        <Ring pct={S.pct} size={96} color={S.remaining === 0 ? '#34d399' : '#22d3ee'}><Award size={30} color={S.remaining === 0 ? '#34d399' : '#22d3ee'} /></Ring>
                        <div>
                            <div className="lbl">[ Certificate of completion ]</div>
                            <div className="hd" style={{ fontSize: 20, fontWeight: 700, margin: '6px 0', color: S.remaining === 0 ? '#34d399' : '#facc15' }}>{S.remaining === 0 ? 'ELIGIBLE' : 'NOT YET ELIGIBLE'}</div>
                            <div style={{ color: '#94a3b8', lineHeight: 1.5 }}>{S.remaining === 0 ? 'Kumpleto mo na ang required hours.' : `Kailangan pa ng ${S.remaining} oras para ma-complete ang ${requiredHours} hrs.`}</div>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                        <div className="sh" style={{ margin: 0 }}><FileText size={16} /> My DTR submissions</div>
                        {filters}
                    </div>
                    {renderTable(visibleLogs)}
                </div>
            </>)}

            {/* ───── LOGS ───── */}
            {tab === 'logs' && (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                        {filters}
                        <button className="btn" onClick={exportCSV} disabled={!logs.length}><Download size={14} /> Export CSV</button>
                    </div>
                    {renderTable(visibleLogs)}
                </div>
            )}

            {/* ───── MESSAGES ───── */}
            {tab === 'messages' && (<>
                <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                        <div className="sh" style={{ marginBottom: 4 }}><MessageSquare size={16} /> Active supervisor threads</div>
                        <div style={{ color: '#64748b' }}>Nauuna ang mga thread na naghihintay ng reply mo.</div>
                    </div>
                    <span className={`chip ${S.needsReply.length ? 'warn' : 'ok'}`}>{S.needsReply.length ? `${S.needsReply.length} NEEDS REPLY` : 'ALL CAUGHT UP'}</span>
                </div>
                {logs.filter(l => l.messages?.length).length === 0 ? (
                    <div className="card empty"><MessageSquare size={30} /><p>Wala ka pang usapan kasama ang Supervisor.</p>
                        <button className="btn" onClick={() => setTab('logs')}>Pumunta sa My DTR Logs</button></div>
                ) : (
                    <div className="gt">
                        {[...logs].filter(l => l.messages?.length)
                            .sort((a, b) => (S.needsReply.includes(b) ? 1 : 0) - (S.needsReply.includes(a) ? 1 : 0))
                            .map(l => {
                                const last = l.messages[l.messages.length - 1];
                                const waiting = !isStudentMsg(last);
                                return (
                                    <div key={idOf(l)} className={`card th ${waiting ? 'new' : ''}`}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ color: '#a78bfa' }}>DTR: {dateOf(l)}</span>{chip(l)}
                                        </div>
                                        <div><b>Accomplishment:</b> {l.accomplishment || l.raw_notes}</div>
                                        <div className="pv">{waiting ? 'Supervisor' : 'You'}: {msgText(last)}</div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button className="btn solid" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setActiveChatId(idOf(l))}><MessageSquare size={13} /> Open thread</button>
                                            <span className="chip" style={{ alignSelf: 'center', color: '#94a3b8', borderColor: 'rgba(255,255,255,.2)' }}>{l.messages.length} msgs</span>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                )}
            </>)}

            {/* ───── AI ASSISTANT ───── */}
            {tab === 'ai' && (<>
                <div className="g2">
                    <div className="card" style={{ '--ac': '#a78bfa' }}>
                        <div className="sh"><Wand2 size={16} /> Notes polisher</div>
                        <p style={{ color: '#64748b', margin: '0 0 10px' }}>Ilagay ang raw notes mo (paghiwalayin ng comma). Gagawin itong professional na accomplishment.</p>
                        <textarea className="ta" placeholder="Halimbawa: ui design, fixing bugs, pos inventory" value={rawIdea} onChange={e => setRawIdea(e.target.value)} />
                        <div className="act" style={{ margin: '10px 0' }}>
                            <button className="btn vi" disabled={!rawIdea.trim()} onClick={() => setPolished(polishNotes(rawIdea))}><Sparkles size={13} /> Polish notes</button>
                        </div>
                        <div className="out">{polished || 'Lalabas dito ang resulta.'}</div>
                        <div className="act" style={{ marginTop: 10 }}>
                            <button className="btn" disabled={!polished} onClick={() => copy(polished)}><Copy size={13} /> Copy</button>
                            <button className="btn solid" disabled={!polished} onClick={() => openNew(polished)}><Plus size={13} /> Use in new DTR</button>
                        </div>
                    </div>
                    <div className="card" style={{ '--ac': '#34d399' }}>
                        <div className="sh"><FileText size={16} /> Weekly report</div>
                        <p style={{ color: '#64748b', margin: '0 0 10px' }}>Awtomatikong ginagawa mula sa mga DTR mo ngayong linggo.</p>
                        <div className="out" style={{ maxHeight: 250, overflow: 'auto', fontSize: 11.5 }}>{weeklyReport || 'Wala pang DTR ngayong linggo.'}</div>
                        <div className="act" style={{ marginTop: 10 }}>
                            <button className="btn" disabled={!weeklyReport} onClick={() => copy(weeklyReport)}><Copy size={13} /> Copy</button>
                        </div>
                    </div>
                </div>
            </>)}

            {/* ───── PROFILE ───── */}
            {tab === 'profile' && (() => {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const moa = getMoaState(prof, today);
                const reqDone = REQS.filter(r => prof[r.key]).length;
                const reqPct = Math.round((reqDone / REQS.length) * 100);
                const F = (k, v) => <div key={k}><div className="lbl">{k}</div><div style={{ marginTop: 4, color: v ? '#e2e8f0' : '#475569' }}>{v || 'Wala pang info'}</div></div>;
                const moaColor = moa.cls === 'ok' ? '#34d399' : moa.cls === 'bad' ? '#f87171' : moa.cls === 'warn' ? '#facc15' : '#94a3b8';
                const ratings = prof.ratings || {};
                const hasRatings = RATINGS.some(r => Number(ratings[r.key]) > 0);
                return (<>
                    <div className="g3">
                        <div className="card" style={{ '--ac': reqPct === 100 ? '#34d399' : '#facc15', display: 'flex', alignItems: 'center', gap: 16 }}>
                            <Ring pct={reqPct} size={92} stroke={8} color={reqPct === 100 ? '#34d399' : '#facc15'}><CheckCircle2 size={26} color={reqPct === 100 ? '#34d399' : '#facc15'} /></Ring>
                            <div>
                                <div className="lbl">[ Requirements ]</div>
                                <div className="big" style={{ fontSize: 28 }}>{reqDone} / {REQS.length}</div>
                                <div className="lbl">Complete</div>
                            </div>
                        </div>
                        <div className="card" style={{ '--ac': moaColor }}>
                            <div className="lbl">[ MOA status ]</div>
                            <div style={{ margin: '10px 0' }}><span className={`chip ${moa.cls}`} style={{ fontSize: 12 }}>{moa.label}</span></div>
                            <div style={{ color: '#94a3b8' }}>{moa.note}</div>
                        </div>
                        <div className="card" style={{ '--ac': '#a78bfa' }}>
                            <div className="lbl">[ Internship progress ]</div>
                            <div className="big" style={{ fontSize: 28 }}>{S.hours}<span style={{ fontSize: 14, color: '#64748b' }}> / {requiredHours} hrs</span></div>
                            <div className="bar"><i style={{ width: `${S.pct}%` }} /></div>
                        </div>
                    </div>

                    <div className="g2" style={{ alignItems: 'start' }}>
                        <div className="col">
                            <div className="card">
                                <div className="sh"><User size={16} /> Student information</div>
                                <div className="kv">
                                    {F('Name', studentName)}
                                    {F('Email', info.email || prof.email)}
                                    {F('School', prof.school)}
                                    {F('Course', prof.course)}
                                    {F('Year level', prof.yearLevel)}
                                    {F('Adviser', prof.adviser)}
                                </div>
                            </div>
                            <div className="card">
                                <div className="sh"><Building2 size={16} /> Internship details</div>
                                <div className="kv">
                                    {F('Host company', prof.hostCompany)}
                                    {F('Department', prof.department)}
                                    {F('Start date', prof.startDate ? fmtDate(prof.startDate) : '')}
                                    {F('End date', prof.endDate ? fmtDate(prof.endDate) : '')}
                                </div>
                            </div>
                            <div className="card" style={{ '--ac': '#a78bfa' }}>
                                <div className="sh"><Award size={16} /> Supervisor performance rating</div>
                                {!hasRatings ? <div style={{ color: '#475569' }}>Wala pang rating mula sa Supervisor.</div> : RATINGS.map(r => (
                                    <div key={r.key} className="ms">
                                        <span style={{ flex: 1 }}>{r.label}</span>
                                        <div className="dots">{[1, 2, 3, 4, 5].map(n => <i key={n} className={(Number(ratings[r.key]) || 0) >= n ? 'on' : ''} />)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="col">
                            <div className="card">
                                <div className="sh"><FileSignature size={16} /> MOA details</div>
                                <div className="col" style={{ gap: 12 }}>
                                    {F('Reference no.', prof.moaNumber)}
                                    {F('Date signed', prof.moaDateSigned ? fmtDate(prof.moaDateSigned) : '')}
                                    {F('Valid until', prof.moaValidUntil ? fmtDate(prof.moaValidUntil) : '')}
                                    {prof.moaFileUrl && <div><a className="btn sm" href={fullUrl(prof.moaFileUrl)} target="_blank" rel="noreferrer"><Paperclip size={12} /> View MOA <Eye size={12} /></a></div>}
                                </div>
                            </div>
                            <div className="card">
                                <div className="sh"><CheckCircle2 size={16} /> Checklist</div>
                                {REQS.map(r => (
                                    <div key={r.key} className={`ms ${prof[r.key] ? 'done' : ''}`}>
                                        <div className="ic">{prof[r.key] ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}</div>
                                        <span style={{ flex: 1 }}>{r.label}</span>
                                        <span className={`chip ${prof[r.key] ? 'ok' : 'warn'}`}>{prof[r.key] ? 'DONE' : 'MISSING'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>);
            })()}
        </main>

        {/* ───── SUBMIT / RESUBMIT MODAL ───── */}
        {isSubmitModalOpen && (
            <div className="ovl">
                <div className="modal">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ fontSize: 17, textTransform: 'uppercase', display: 'flex', gap: 8, alignItems: 'center' }}>
                            {resubmitTargetLog ? <RotateCcw size={18} color="#f87171" /> : <Clock size={18} color="#22d3ee" />}
                            {resubmitTargetLog ? 'Resubmit DTR entry' : 'Submit daily time record'}
                        </h3>
                        <button className="btn sm" onClick={() => setIsSubmitModalOpen(false)} aria-label="Close"><X size={14} /></button>
                    </div>

                    {resubmitTargetLog && (
                        <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.35)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
                            <div style={{ color: '#f87171', fontWeight: 700, fontSize: 11, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}><AlertCircle size={14} /> SUPERVISOR REMARK / REJECTION REASON</div>
                            <div style={{ color: '#fca5a5', lineHeight: 1.5, wordBreak: 'break-word' }}>
                                {getRejectionRemark(resubmitLog) || 'Pakiayos ang mga detalye o mag-upload ng bagong proof.'}
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmitDTR} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div><label className="fl">Date</label><input className="in" type="date" value={logDate} onChange={e => setLogDate(e.target.value)} required /></div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label className="fl">Time in</label><input className="in" type="time" value={timeIn} onChange={e => setTimeIn(e.target.value)} required /></div>
                            <div><label className="fl">Time out</label><input className="in" type="time" value={timeOut} onChange={e => setTimeOut(e.target.value)} required /></div>
                        </div>
                        <div style={{ color: '#22d3ee' }}>Rendered hours: <b>{calcHours(timeIn, timeOut)} hrs</b></div>
                        <div><label className="fl">Accomplishments / summary</label>
                            <textarea className="in" rows="4" placeholder="Ano ang mga natapos mo ngayong araw?" value={accomplishment} onChange={e => setAccomplishment(e.target.value)} style={{ resize: 'none' }} required />
                        </div>
                        <div>
                            <label className="fl">Proof / document</label>
                            <div style={{ position: 'relative', border: '1px dashed rgba(34,211,238,.5)', borderRadius: 10, padding: 14, textAlign: 'center', color: '#22d3ee', background: 'rgba(15,23,42,.6)' }}>
                                <input type="file" accept=".png,.jpg,.jpeg,.jfif,.webp,.pdf" aria-label="Upload proof" onChange={e => setProofFile(e.target.files[0] || null)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }} />
                                <Upload size={15} style={{ verticalAlign: -3 }} /> {proofFile ? proofFile.name : (existingProofUrl ? 'Palitan ang kasalukuyang file' : 'Pumili ng file o image')}
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button type="button" className="btn" onClick={() => setIsSubmitModalOpen(false)}>Cancel</button>
                            <button type="submit" className={`btn ${resubmitTargetLog ? 'bad' : 'solid'}`} disabled={isSubmitting}>
                                {isSubmitting ? 'Submitting...' : (resubmitTargetLog ? 'Resubmit DTR' : 'Submit DTR')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* ───── CHAT MODAL ───── */}
        {activeChatLog && (
            <div className="ovl" style={{ zIndex: 300 }}>
                <div className="modal" style={{ width: 'min(520px,100%)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                        <div>
                            <h3 style={{ fontSize: 16, textTransform: 'uppercase', display: 'flex', gap: 8, alignItems: 'center' }}><MessageSquare size={18} color="#22d3ee" /> Supervisor thread</h3>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>DTR record: <b style={{ color: '#38bdf8' }}>{dateOf(activeChatLog)}</b></div>
                        </div>
                        <button className="btn sm" onClick={() => setActiveChatId(null)} aria-label="Close"><X size={14} /></button>
                    </div>
                    <div style={{ minHeight: 250, maxHeight: 360, overflowY: 'auto', background: 'rgba(5,8,22,.8)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: 14, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {!activeChatLog.messages?.length ? (
                            <div className="empty" style={{ margin: 'auto' }}><b style={{ color: '#94a3b8' }}>Wala pang usapan dito.</b></div>
                        ) : activeChatLog.messages.map((m, i) => {
                            const me = isStudentMsg(m);
                            return (
                                <div key={m.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start' }}>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10.5, color: '#64748b', marginBottom: 3 }}>
                                        {me ? <><User size={11} color="#38bdf8" /><b style={{ color: '#38bdf8' }}>You</b></> : <><Shield size={11} color="#f87171" /><b style={{ color: '#f87171' }}>Supervisor</b></>}
                                        <span>• {m.timestamp || 'Recently'}</span>
                                    </div>
                                    <div className={`bub ${me ? 'me' : 'sup'}`}>{msgText(m)}</div>
                                </div>
                            );
                        })}
                        <div ref={chatEndRef} />
                    </div>
                    <form onSubmit={handleSendReply} style={{ display: 'flex', gap: 8 }}>
                        <input className="in" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Mag-type ng mensahe para sa Supervisor..." />
                        <button type="submit" className="btn solid" disabled={isSendingChat || !replyText.trim()}><Send size={14} /> Send</button>
                    </form>
                </div>
            </div>
        )}

        {toast && <div className={`toast ${toast.err ? 'err' : ''}`} role="status">{toast.msg}</div>}
    </div>
);



