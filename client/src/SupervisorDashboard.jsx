import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LayoutDashboard, UserCheck, Bot, MessageSquare, FileText,
    CheckCircle2, XCircle, Search, Eye, Save,
    Users, LogOut, Zap, Send, Download, Printer, Sparkles
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

/* ───────────── Helpers ───────────── */
const idOf = (l) => l.id || l.log_id;
const hrsOf = (l) => parseFloat(l.rendered_today || l.hoursRendered || 0) || 0;
const statusOf = (l) => (l.status || 'pending').toLowerCase();
const msgText = (m) => typeof m === 'string' ? m : (m.message || m.text || m.remark || m.content || '');
const fullUrl = (u) => !u ? null : /^https?:\/\//i.test(u) ? u : `${API_BASE_URL}${u.startsWith('/') ? '' : '/'}${u}`;

/* ───────────── Fixed Alignment Cyberpunk Styling ───────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
.sf{--cy:#22d3ee;--vi:#a78bfa;--ok:#34d399;--warn:#facc15;--bad:#f87171;--mut:#64748b;--line:rgba(34,211,238,.3);
 min-height:100vh;color:#e2e8f0;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12.5px;
 background:radial-gradient(900px 520px at 88% -8%,rgba(124,58,237,.24),transparent 60%),radial-gradient(800px 480px at 0% 0%,rgba(8,145,178,.2),transparent 55%),#050816}
.sf *{box-sizing:border-box}
.sf h1,.sf h2,.sf h3,.sf .hd{font-family:'Chakra Petch',sans-serif;margin:0}
.sf button{font-family:inherit}
.sf-side{position:fixed;inset:0 auto 0 0;width:250px;padding:18px 14px;background:rgba(5,8,22,.94);border-right:1px solid rgba(34,211,238,.16);display:flex;flex-direction:column;gap:10px;z-index:50}
.sf-logo{font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:19px;color:var(--cy);display:flex;gap:8px;align-items:center;padding:4px 6px 10px;text-shadow:0 0 14px rgba(34,211,238,.6)}
.sf-me{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:12px;background:rgba(124,58,237,.1)}
.av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;background:linear-gradient(135deg,#0891b2,#22d3ee);flex:none}
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
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;align-items:stretch}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px}
.gt{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.sh{display:flex;align-items:center;gap:8px;font-family:'Chakra Petch',sans-serif;font-weight:600;letter-spacing:.1em;text-transform:uppercase;font-size:13.5px;color:#f1f5f9;margin-bottom:12px}
.sh svg{color:var(--cy)}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:99px;border:1px solid var(--line);background:rgba(34,211,238,.08);color:var(--cy);font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;text-decoration:none}
.btn:hover{background:rgba(34,211,238,.18)}
.btn.solid{background:linear-gradient(90deg,#0891b2,#0e7490);color:#fff;border-color:#22d3ee;box-shadow:0 0 18px rgba(34,211,238,.4)}
.btn.ok{color:var(--ok);border-color:rgba(52,211,153,.4);background:rgba(52,211,153,.1)}
.btn.bad{color:var(--bad);border-color:rgba(248,113,113,.45);background:rgba(239,68,68,.12)}
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
.tbl{width:100%;border-collapse:collapse;text-align:left}
.tbl th{padding:10px 12px;font-size:10px;color:var(--mut);border-bottom:1px solid rgba(34,211,238,.18);letter-spacing:.14em;text-transform:uppercase}
.tbl td{padding:12px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:middle}
.tbl tr:hover td{background:rgba(34,211,238,.04)}
.act{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.cnt{background:#facc15;color:#050816;border-radius:99px;padding:0 6px;font-size:10px;font-weight:800}
.in{width:100%;background:rgba(15,23,42,.8);border:1px solid var(--line);border-radius:99px;padding:9px 16px;color:#fff;font:inherit;outline:0;color-scheme:dark}
.in.sq{border-radius:99px}
.toast{position:fixed;right:20px;bottom:20px;z-index:400;padding:12px 16px;border-radius:10px;background:#0a1020;border:1px solid var(--ok);color:var(--ok);box-shadow:0 0 24px rgba(52,211,153,.3)}
.toast.err{border-color:var(--bad);color:var(--bad);box-shadow:0 0 24px rgba(248,113,113,.3)}
.ovl{position:fixed;inset:0;background:rgba(2,6,18,.8);backdrop-filter:blur(6px);display:grid;place-items:center;z-index:200;padding:16px}
.modal{width:min(520px,100%);max-height:92vh;overflow:auto;background:#0a1020;border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:0 0 50px rgba(34,211,238,.18)}
.bub{max-width:85%;padding:9px 12px;font-size:12.5px;line-height:1.5;word-break:break-word;color:#fff}
.bub.me{background:#0e7490;border-radius:14px 14px 3px 14px}
.bub.sup{background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.35);border-radius:14px 14px 14px 3px}
.bar{height:7px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:6px}
.bar>i{display:block;height:100%;background:linear-gradient(90deg,#0891b2,#22d3ee);box-shadow:0 0 10px #22d3ee;transition:width .4s ease-in-out}
.intern-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:18px}
.intern-card{background:rgba(15,23,42,.6);border:1px solid rgba(34,211,238,.2);border-radius:12px;padding:12px;cursor:pointer;transition:all .2s;display:flex;flex-direction:column;justify-content:space-between}
.intern-card:hover,.intern-card.on{border-color:var(--cy);background:rgba(34,211,238,.1);box-shadow:0 0 16px rgba(34,211,238,.2)}
.rate-btn{width:28px;height:28px;border-radius:6px;border:1px solid var(--line);background:rgba(15,23,42,.8);color:#94a3b8;cursor:pointer;display:grid;place-items:center;font-weight:700}
.rate-btn.on{background:#0891b2;color:#fff;border-color:#22d3ee;box-shadow:0 0 10px rgba(34,211,238,.5)}
.chart-bar-wrap{display:flex;align-items:flex-end;gap:18px;height:120px;padding-top:10px}
.chart-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end}
.chart-bar{width:100%;max-width:32px;background:linear-gradient(180deg,#22d3ee,#0891b2);border-radius:4px 4px 0 0;box-shadow:0 0 12px rgba(34,211,238,.4)}
`;

const NAV = [
    { id: 'review', label: 'DTR Review Portal', icon: LayoutDashboard },
    { id: 'profile', label: 'Intern Profile & MOA', icon: UserCheck },
    { id: 'ai', label: 'Intern AI Evaluation', icon: Bot },
    { id: 'discussions', label: 'Student Discussions', icon: MessageSquare, badge: 1 },
    { id: 'reports', label: 'DTR Summary Reports', icon: FileText }
];

export default function SupervisorDashboard({ supervisorName: supProp, onLogout }) {
    const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const supervisorName = supProp || savedUser.full_name || "Jodilyn M. Bombita";

    const [tab, setTab] = useState('review');
    const [selectedInternId, setSelectedInternId] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [toast, setToast] = useState(null);
    const [logs, setLogs] = useState([]);
    const [interns, setInterns] = useState([]);

    const [profileForm, setProfileForm] = useState({
        school: '', email: '', course: '', year_level: '', adviser: '', contact: '',
        host_company: '', department: '', start_date: '', end_date: '', required_hours: 500,
        moa_ref_no: '', moa_date_signed: '', moa_valid_until: '', moa_signed: false,
        endorsement_letter: false, parent_consent: false, medical_clearance: false
    });

    const [ratings, setRatings] = useState({ punctuality: 0, quality: 0, initiative: 0, communication: 0 });

    const [activeChatLog, setActiveChatLog] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [rejectLogTarget, setRejectLogTarget] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');

    const notify = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3200); };

    const fetchInternsList = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/interns`);
            if (res.ok) {
                const data = await res.json();
                setInterns(Array.isArray(data) ? data : []);
            }
        } catch (e) { console.error("Error fetching interns:", e); }
    }, []);

    const fetchAllLogs = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/dtr/all`);
            if (res.ok) {
                const data = await res.json();
                setLogs(Array.isArray(data) ? data : []);
            }
        } catch (e) { console.error("Error fetching logs:", e); }
    }, []);

    // 1. Ayusin ang fetchInternProfile (Siguraduhing may /api/ sa URL)
    const fetchInternProfile = useCallback(async (userId) => {
        if (!userId || userId === 'all') return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/interns/${userId}/profile`);
            if (res.ok) {
                const rawData = await res.json();
                let p = rawData || {};
                if (rawData && rawData.data) {
                    if (typeof rawData.data === 'string') {
                        try { p = JSON.parse(rawData.data); } catch (e) { p = rawData; }
                    } else if (typeof rawData.data === 'object') {
                        p = { ...rawData, ...rawData.data };
                    }
                }
                setProfileForm({
                    school: p.school || p.p_school || '',
                    email: p.email || '',
                    course: p.course || p.p_course || '',
                    year_level: p.year_level || p.p_year_level || '',
                    adviser: p.adviser || p.school_coordinator || '',
                    contact: p.contact || p.contact_number || '',
                    host_company: p.host_company || '',
                    department: p.department || '',
                    start_date: p.start_date || '',
                    end_date: p.end_date || '',
                    required_hours: p.required_hours || 500,
                    moa_ref_no: p.moa_ref_no || '',
                    moa_date_signed: p.moa_date_signed || '',
                    moa_valid_until: p.moa_valid_until || '',
                    moa_signed: Boolean(p.moa_signed),
                    endorsement_letter: Boolean(p.endorsement_letter),
                    parent_consent: Boolean(p.parent_consent),
                    medical_clearance: Boolean(p.medical_clearance)
                });
            }
        } catch (e) { console.error("Error fetching profile:", e); }
    }, []);

    // 2. Ayusin ang handleUpdateStatus para sa Reject Action
    const handleUpdateStatus = async (logId, status, reason = '') => {
        try {
            const payload = {
                status: status.toLowerCase(),
                rejection_reason: reason,
                remarks: reason,
                supervisor_comment: reason
            };

            // Instant UI update
            setLogs(prev => prev.map(l => {
                if (idOf(l) === logId) {
                    return {
                        ...l,
                        status: status.toLowerCase(),
                        rejection_reason: reason,
                        remarks: reason,
                        supervisor_comment: reason
                    };
                }
                return l;
            }));

            setRejectLogTarget(null);
            setRejectionReason('');

            const res = await fetch(`${API_BASE_URL}/api/dtr-logs/${logId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                notify(`DTR Status: ${status.toUpperCase()}`);
                fetchAllLogs();
            }
        } catch (e) {
            console.error("Update status error:", e);
        }
    };

    const stats = useMemo(() => {
        const pending = logs.filter(l => statusOf(l) === 'pending');
        const approved = logs.filter(l => statusOf(l) === 'approved');
        const rejected = logs.filter(l => statusOf(l) === 'rejected');
        return { pending, approved, rejected };
    }, [logs]);

    const visibleLogs = useMemo(() => {
        return logs.filter(l => {
            if (selectedInternId !== 'all' && Number(l.user_id) !== Number(selectedInternId)) return false;
            const st = statusOf(l);
            if (statusFilter === 'pending' && st !== 'pending') return false;
            if (statusFilter === 'approved' && st !== 'approved') return false;
            if (statusFilter === 'rejected' && st !== 'rejected') return false;
            const q = search.toLowerCase();
            return `${l.student_name || ''} ${l.log_date || ''} ${l.accomplishment || l.raw_notes || ''}`.toLowerCase().includes(q);
        });
    }, [logs, selectedInternId, statusFilter, search]);

    const activeInternList = useMemo(() => {
        const list = [{ id: 'all', full_name: 'All Interns', email: `${interns.length} intern(s)` }, ...interns];
        return list;
    }, [interns]);

    const selectedInternObj = useMemo(() => {
        return interns.find(i => String(i.id) === String(selectedInternId)) || interns[0] || {};
    }, [interns, selectedInternId]);

    const aiEvaluationData = useMemo(() => {
        const studentLogs = selectedInternId === 'all'
            ? logs.filter(l => statusOf(l) === 'approved')
            : logs.filter(l => Number(l.user_id) === Number(selectedInternId) && statusOf(l) === 'approved');

        const totalEntries = studentLogs.length;
        let frontend = 0, debugging = 0, database = 0, security = 0, api = 0, docs = 0;

        studentLogs.forEach(l => {
            const txt = (l.accomplishment || l.raw_notes || '').toLowerCase();
            if (txt.includes('ui') || txt.includes('frontend') || txt.includes('react') || txt.includes('design')) frontend++;
            if (txt.includes('debug') || txt.includes('testing') || txt.includes('fix') || txt.includes('issue')) debugging++;
            if (txt.includes('db') || txt.includes('database') || txt.includes('sql') || txt.includes('data')) database++;
            if (txt.includes('audit') || txt.includes('security') || txt.includes('auth')) security++;
            if (txt.includes('api') || txt.includes('backend') || txt.includes('endpoint')) api++;
            if (txt.includes('doc') || txt.includes('report') || txt.includes('paper')) docs++;
        });

        const calcPct = (count) => Math.min(100, Math.round((count / Math.max(1, totalEntries > 5 ? 10 : 5)) * 100));

        return {
            totalEntries: totalEntries,
            skills: [
                { name: 'Frontend / UI Development', count: frontend, pct: calcPct(frontend) },
                { name: 'Debugging & Testing', count: debugging, pct: calcPct(debugging) },
                { name: 'Database & Data Handling', count: database, pct: calcPct(database) },
                { name: 'Security & Audit', count: security, pct: calcPct(security) },
                { name: 'Backend & API (REST)', count: api, pct: calcPct(api) },
                { name: 'Documentation & Reporting', count: docs, pct: calcPct(docs) }
            ]
        };
    }, [logs, selectedInternId]);

    const selectedInternApprovedHours = useMemo(() => {
        return logs
            .filter(l => (selectedInternId === 'all' || Number(l.user_id) === Number(selectedInternId)) && statusOf(l) === 'approved')
            .reduce((s, l) => s + hrsOf(l), 0);
    }, [logs, selectedInternId]);

    return (
        <div className="sf">
            <style>{CSS}</style>

            <aside className="sf-side">
                <div className="sf-logo"><Zap size={18} /> SmartFolio Hub</div>
                <div className="sf-me">
                    <div className="av">{supervisorName.charAt(0).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                        <div className="hd" style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{supervisorName}</div>
                        <div style={{ fontSize: 10, color: '#a78bfa' }}>OJT Supervisor Portal</div>
                    </div>
                </div>
                {NAV.map(n => {
                    const IconComp = n.icon;
                    return (
                        <button key={n.id} className={`nav ${tab === n.id ? 'on' : ''}`} onClick={() => setTab(n.id)}>
                            <IconComp size={16} /> {n.label}
                            {n.badge ? <span className="bd">{n.badge}</span> : null}
                        </button>
                    );
                })}
                <button className="nav sf-out" onClick={onLogout || (() => window.location.reload())}><LogOut size={16} /> Logout Portal</button>
            </aside>

            <main className="sf-main">
                <div className="top">
                    <span><span className="dot" />SYS ONLINE // SUPERVISOR SESSION</span>
                    <span>{interns.length} INTERNS MONITORED | DTR & INTERNSHIP HUB</span>
                </div>

                <div className="intern-row">
                    {activeInternList.map(item => {
                        const isAll = item.id === 'all';
                        const studentLogs = isAll ? logs : logs.filter(l => Number(l.user_id) === Number(item.id));
                        const pCount = studentLogs.filter(l => statusOf(l) === 'pending').length;
                        const hrs = studentLogs.filter(l => statusOf(l) === 'approved').reduce((s, l) => s + hrsOf(l), 0);

                        return (
                            <div key={item.id} className={`intern-card ${selectedInternId === item.id ? 'on' : ''}`} onClick={() => setSelectedInternId(item.id)}>
                                <div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                        <div className="av" style={{ width: 24, height: 24, fontSize: 11 }}>{(item.full_name || 'I').charAt(0)}</div>
                                        <div style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.full_name}</div>
                                    </div>
                                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.email}</div>
                                </div>
                                <div>
                                    {!isAll && (
                                        <div style={{ fontSize: 10, color: '#22d3ee', marginTop: 4 }}>
                                            <b>{hrs}</b> / 500 hrs
                                            <div className="bar"><i style={{ width: `${Math.min(100, (hrs / 500) * 100)}%` }} /></div>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                                        {pCount > 0 ? <span className="chip warn" style={{ fontSize: 9 }}>{pCount} pending</span> : <span className="chip ok" style={{ fontSize: 9 }}>Up to date</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {tab === 'review' && (<>
                    <div className="pg">
                        <div>
                            <h1>SUPERVISOR PORTAL</h1>
                            <p>[ REVIEW STUDENT DTR SUBMISSIONS, APPROVE HOURS, AND GIVE FEEDBACK ]</p>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <div className="srch">
                                <Search size={14} color="#64748b" />
                                <input placeholder="Search intern name, date or notes..." value={search} onChange={e => setSearch(e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="g4">
                        <div className="card" style={{ textAlign: 'center' }}>
                            <div className="big" style={{ color: '#facc15' }}>{stats.pending.length}</div>
                            <div className="lbl">PENDING APPROVALS</div>
                        </div>
                        <div className="card" style={{ textAlign: 'center' }}>
                            <div className="big" style={{ color: '#34d399' }}>{stats.approved.length}</div>
                            <div className="lbl">APPROVED LOGS</div>
                        </div>
                        <div className="card" style={{ textAlign: 'center' }}>
                            <div className="big" style={{ color: '#f87171' }}>{stats.rejected.length}</div>
                            <div className="lbl">REJECTED / NEEDS REVISION</div>
                        </div>
                        <div className="card" style={{ textAlign: 'center', '--ac': '#a78bfa' }}>
                            <div className="big" style={{ color: '#a78bfa' }}>{interns.length}</div>
                            <div className="lbl">ACTIVE INTERNS</div>
                        </div>
                    </div>

                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <div className="sh" style={{ margin: 0 }}><FileText size={16} /> STUDENT DTR LOGS REVIEW</div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {[['all', 'ALL', logs.length], ['pending', 'PENDING', stats.pending.length], ['approved', 'APPROVED', stats.approved.length], ['rejected', 'REJECTED', stats.rejected.length]].map(([k, label, count]) => (
                                    <button key={k} className={`pill ${statusFilter === k ? 'on' : ''}`} onClick={() => setStatusFilter(k)}>{label} [{count}]</button>
                                ))}
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table className="tbl">
                                <thead>
                                    <tr><th>INTERN</th><th>DATE</th><th>TIME</th><th>HOURS</th><th>ACCOMPLISHMENTS</th><th>PROOF</th><th>STATUS</th><th>ACTIONS</th></tr>
                                </thead>
                                <tbody>
                                    {visibleLogs.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center', color: '#64748b', padding: 24 }}>Walang nahanap na DTR submission.</td></tr>}
                                    {visibleLogs.map(l => (
                                        <tr key={idOf(l)}>
                                            <td style={{ fontWeight: 700, color: '#f8fafc' }}>{l.student_name || 'Student Intern'}</td>
                                            <td style={{ color: '#22d3ee' }}>{l.log_date || l.date}</td>
                                            <td>{l.time_in || '08:00'} - {l.time_out || '18:00'}</td>
                                            <td style={{ color: '#38bdf8', fontWeight: 700 }}>{hrsOf(l)} hrs</td>
                                            <td style={{ color: '#94a3b8', maxWidth: 220 }}>{l.accomplishment || l.raw_notes}</td>
                                            <td>{l.proof_url ? <a className="btn sm" href={fullUrl(l.proof_url)} target="_blank" rel="noreferrer"><Eye size={12} /> View Proof</a> : 'No File'}</td>
                                            <td><span className={`chip ${statusOf(l) === 'approved' ? 'ok' : statusOf(l) === 'rejected' ? 'bad' : 'warn'}`}>{statusOf(l).toUpperCase()}</span></td>
                                            <td>
                                                <div className="act">
                                                    <button className="btn sm ok" onClick={() => handleUpdateStatus(idOf(l), 'approved')}><CheckCircle2 size={12} /> APPROVE</button>
                                                    <button className="btn sm bad" onClick={() => setRejectLogTarget(l)}><XCircle size={12} /> REJECT</button>
                                                    <button className="btn sm" onClick={() => setActiveChatLog(l)}><MessageSquare size={12} /> CHAT {l.messages?.length > 0 && <span className="cnt">{l.messages.length}</span>}</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>)}

                {/* ───── TAB: INTERN AI EVALUATION ───── */}
                {tab === 'ai' && (<>
                    <div className="pg">
                        <div>
                            <h1>INTERN AI EVALUATION</h1>
                            <p>[ SKILLS AT CAREER PROJECTION NI <b>{selectedInternObj.full_name || "Student"}</b> MULA SA DTR ENTRIES ]</p>
                        </div>
                    </div>

                    <div className="card" style={{ marginBottom: 16 }}>
                        <div className="sh"><Sparkles size={16} /> AI STUDENT COMPETENCY & CAREER EVALUATION</div>
                        <p style={{ color: '#94a3b8', margin: 0 }}>
                            Kinukwenta mula sa <b>{aiEvaluationData.totalEntries} DTR entries</b> ni <b>{selectedInternObj.full_name || "Student"}</b> (hindi kasama ang rejected).
                        </p>
                    </div>

                    <div className="g2">
                        <div className="card">
                            <div className="sh"><CheckCircle2 size={16} /> VERIFIED TECHNICAL CAPABILITIES</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
                                {aiEvaluationData.skills.map((s, idx) => (
                                    <div key={idx}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                                            <span style={{ fontWeight: 600, color: '#f8fafc' }}>{s.name}</span>
                                            <span style={{ color: '#22d3ee' }}>{s.count} entries | {s.pct}%</span>
                                        </div>
                                        <div className="bar"><i style={{ width: `${s.pct}%` }} /></div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="card" style={{ '--ac': '#a78bfa' }}>
                            <div className="sh"><Zap size={16} /> FUTURE INDUSTRY ROLE PROJECTION</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                                {[
                                    { role: 'Full-Stack Web Developer', match: Math.min(95, 25 + (aiEvaluationData.totalEntries * 10)) },
                                    { role: 'Front-End / UI Developer', match: Math.min(90, 20 + (aiEvaluationData.totalEntries * 8)) },
                                    { role: 'QA & Security Support', match: Math.min(85, 15 + (aiEvaluationData.totalEntries * 5)) }
                                ].map((r, idx) => (
                                    <div key={idx} style={{ background: 'rgba(15,23,42,.8)', padding: 12, borderRadius: 10, border: '1px solid rgba(167,139,250,.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#f8fafc' }}>{r.role}</span>
                                        <span className="chip ok" style={{ background: 'rgba(167,139,250,.15)', borderColor: '#a78bfa', color: '#a78bfa' }}>{r.match}% Match</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>)}

                {/* ───── TAB: STUDENT DISCUSSIONS ───── */}
                {tab === 'discussions' && (<>
                    <div className="pg">
                        <div>
                            <h1>STUDENT DISCUSSIONS</h1>
                            <p>[ MGA USAPAN NINYO NG MGA INTERN BAWAT DTR ENTRY ]</p>
                        </div>
                    </div>

                    <div className="gt">
                        {logs.filter(l => l.messages && l.messages.length > 0).map(l => (
                            <div key={idOf(l)} className="card" style={{ '--ac': '#22d3ee' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <b>{l.student_name || 'Student Intern'}</b>
                                    <span className={`chip ${statusOf(l) === 'approved' ? 'ok' : 'bad'}`}>{statusOf(l).toUpperCase()}</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#a78bfa', marginBottom: 8 }}>DTR: {l.log_date || l.date}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}><b>Accomplishment:</b> {l.accomplishment || l.raw_notes}</div>
                                <div style={{ background: 'rgba(5,8,22,.8)', padding: 10, borderRadius: 8, fontSize: 11, color: '#e2e8f0', marginBottom: 12 }}>
                                    Last: {msgText(l.messages[l.messages.length - 1])}
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn solid" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setActiveChatLog(l)}>
                                        <MessageSquare size={12} /> OPEN THREAD
                                    </button>
                                    <span className="chip" style={{ alignSelf: 'center', color: '#94a3b8', borderColor: 'rgba(255,255,255,.2)' }}>{l.messages.length} msgs</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </>)}

                {/* ───── TAB: DTR SUMMARY REPORTS ───── */}
                {tab === 'reports' && (<>
                    <div className="pg">
                        <div>
                            <h1>DTR SUMMARY REPORTS</h1>
                            <p>[ OPISYAL NA ULAT NG ORAS PARA SA PAARALAN ]</p>
                        </div>
                    </div>

                    <div className="g4">
                        <div className="card">
                            <div className="lbl">TOTAL APPROVED HOURS</div>
                            <div className="big" style={{ color: '#22d3ee' }}>{selectedInternApprovedHours} <span style={{ fontSize: 16, color: '#64748b' }}>/ 500 hrs</span></div>
                        </div>
                        <div className="card">
                            <div className="lbl">COMPLETION RATE</div>
                            <div className="big" style={{ color: '#34d399' }}>{Math.min(100, Math.round((selectedInternApprovedHours / 500) * 100))}%</div>
                        </div>
                    </div>
                </>)}

                {tab === 'profile' && (<>
                    <form onSubmit={handleSaveProfile} className="g2">
                        <div className="col" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div className="card">
                                <div className="sh"><UserCheck size={16} /> SCHOOL / INTERN INFORMATION</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div><label className="lbl">PANGALAN</label><input className="in sq" value={selectedInternObj.full_name || "N/A"} readOnly /></div>
                                    <div><label className="lbl">EMAIL</label><input className="in sq" value={profileForm.email || selectedInternObj.email || ''} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} /></div>
                                    <div><label className="lbl">PAARALAN / UNIVERSITY</label><input className="in sq" value={profileForm.school} onChange={e => setProfileForm({ ...profileForm, school: e.target.value })} /></div>
                                </div>
                            </div>
                        </div>
                        <div className="col">
                            <div className="card">
                                <button type="submit" className="btn solid"><Save size={14} /> SAVE PROFILE</button>
                            </div>
                        </div>
                    </form>
                </>)}
            </main>

            {/* REJECT MODAL */}
            {rejectLogTarget && (
                <div className="ovl">
                    <div className="modal">
                        <h3 style={{ color: '#f87171', marginBottom: 12 }}>REJECT DTR RECORD</h3>
                        <p style={{ color: '#94a3b8', marginBottom: 12 }}>Maglagay ng dahilan para sa rejection ng DTR log na ito:</p>
                        <textarea className="in sq" rows="4" value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder="Dahilan ng rejection..." style={{ resize: 'none', marginBottom: 14 }} />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn" onClick={() => setRejectLogTarget(null)}>Cancel</button>
                            <button className="btn bad" onClick={() => handleUpdateStatus(idOf(rejectLogTarget), 'rejected', rejectionReason)}>Confirm Reject</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
        </div>
    );
}