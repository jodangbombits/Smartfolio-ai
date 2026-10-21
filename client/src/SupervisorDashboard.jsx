import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    Users, FileText, CheckCircle2, XCircle, MessageSquare, Send, Eye, Paperclip,
    Search, Download, Save, AlertCircle, Shield, RotateCcw, UserCheck, CalendarDays,
    Building2, GraduationCap, CheckSquare, LogOut, Zap, LayoutDashboard, Bot, Sparkles, User, Plus
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

/* ───────────── Helpers ───────────── */
const idOf = (l) => l.id || l.log_id;
const hrsOf = (l) => parseFloat(l.rendered_today || l.hoursRendered || 0) || 0;
const statusOf = (l) => (l.status || 'pending').toLowerCase();
const msgText = (m) => m.message || m.text || m.remark || m.content || '';
const fullUrl = (u) => !u ? null : /^https?:\/\//i.test(u) ? u : `${API_BASE_URL}${u.startsWith('/') ? '' : '/'}${u}`;

/* ───────────── Original Exact Cyberpunk Styles ───────────── */
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
.av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;background:linear-gradient(135deg,#e11d48,#f43f5e);flex:none}
.nav{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border-radius:10px;border:1px solid transparent;background:none;color:#94a3b8;cursor:pointer;font-size:12.5px;text-align:left}
.nav:hover{color:#e2e8f0;background:rgba(34,211,238,.06)}
.nav.on{color:var(--cy);border-color:var(--line);background:rgba(34,211,238,.1);box-shadow:0 0 16px rgba(34,211,238,.18)}
.nav .bd{margin-left:auto;background:#ef4444;color:#fff;border-radius:99px;font-size:10px;font-weight:700;padding:1px 7px}
.sf-out{margin-top:auto;color:var(--bad);border-color:rgba(248,113,113,.35);background:rgba(248,113,113,.07)}
.sf-main{margin-left:250px;padding:18px 28px 40px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:11px;color:#94a3b8;margin-bottom:18px}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok);margin-right:8px;animation:pl 2s infinite}
@keyframes pl{50%{opacity:.35}}
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
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
.gt{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
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
.srch{display:flex;align-items:center;gap:8px;padding:7px 12px;border:1px solid var(--line);border-radius:10px;background:rgba(5,8,22,.6);min-width:230px}
.srch input{background:none;border:0;outline:0;color:#e2e8f0;font:inherit;width:100%}
.tbl{width:100%;border-collapse:collapse;text-align:left}
.tbl th{padding:10px 12px;font-size:10px;color:var(--mut);border-bottom:1px solid rgba(34,211,238,.18);letter-spacing:.14em;text-transform:uppercase}
.tbl td{padding:12px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:middle}
.tbl tr:hover td{background:rgba(34,211,238,.04)}
.act{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.in{width:100%;background:rgba(15,23,42,.8);border:1px solid var(--line);border-radius:9px;padding:9px 10px;color:#fff;font:inherit;outline:0;color-scheme:dark}
.toast{position:fixed;right:20px;bottom:20px;z-index:400;padding:12px 16px;border-radius:10px;background:#0a1020;border:1px solid var(--ok);color:var(--ok);box-shadow:0 0 24px rgba(52,211,153,.3)}
.toast.err{border-color:var(--bad);color:var(--bad);box-shadow:0 0 24px rgba(248,113,113,.3)}
.ovl{position:fixed;inset:0;background:rgba(2,6,18,.8);backdrop-filter:blur(6px);display:grid;place-items:center;z-index:200;padding:16px}
.modal{width:min(520px,100%);max-height:92vh;overflow:auto;background:#0a1020;border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:0 0 50px rgba(34,211,238,.18)}
.bub{max-width:85%;padding:9px 12px;font-size:12.5px;line-height:1.5;word-break:break-word;color:#fff}
.bub.me{background:#0e7490;border-radius:14px 14px 3px 14px}
.bub.sup{background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.35);border-radius:14px 14px 14px 3px}
`;

export default function SupervisorDashboard({ supervisorName = "Jodilyn P. Bombita", onLogout }) {
    const [tab, setTab] = useState('dtr');
    const [interns, setInterns] = useState([]);
    const [logs, setLogs] = useState([]);
    const [selectedStudentId, setSelectedStudentId] = useState(2);
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [toast, setToast] = useState(null);

    // Profile form states
    const [profileForm, setProfileForm] = useState({
        school: '', course: '', year_level: '', adviser: '', contact: '',
        host_company: '', department: '', start_date: '', end_date: '', required_hours: 500,
        moa_ref_no: '', moa_signed: false, endorsement_letter: false, parent_consent: false, medical_clearance: false,
        moa_date_signed: '', moa_valid_until: ''
    });

    // Chat / Reject Modal states
    const [activeChatLog, setActiveChatLog] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [rejectLogTarget, setRejectLogTarget] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');

    const notify = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3200); };

    // Fetch interns list
    const fetchInterns = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/interns`);
            if (res.ok) {
                const data = await res.json();
                setInterns(data || []);
            }
        } catch (e) { console.error("Error fetching interns:", e); }
    }, []);

    // Fetch all DTR logs
    const fetchAllLogs = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/dtr/all`);
            if (res.ok) {
                const data = await res.json();
                setLogs(Array.isArray(data) ? data : []);
            }
        } catch (e) { console.error("Error fetching logs:", e); }
    }, []);

    // Fetch intern profile for Supervisor editor
    const fetchStudentProfileForEdit = useCallback(async (userId) => {
        if (!userId) return;
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
                    course: p.course || p.p_course || '',
                    year_level: p.year_level || p.yearLevel || '',
                    adviser: p.adviser || p.school_coordinator || '',
                    contact: p.contact || p.contact_number || '',
                    host_company: p.host_company || p.hostCompany || '',
                    department: p.department || p.dept || '',
                    start_date: p.start_date || p.startDate || '',
                    end_date: p.end_date || p.endDate || '',
                    required_hours: p.required_hours || p.requiredHours || 500,
                    moa_ref_no: p.moa_ref_no || p.moaRefNo || '',
                    moa_signed: Boolean(p.moa_signed || p.moaSigned),
                    endorsement_letter: Boolean(p.endorsement_letter || p.endorsementLetter),
                    parent_consent: Boolean(p.parent_consent || p.parentConsent),
                    medical_clearance: Boolean(p.medical_clearance || p.medicalClearance),
                    moa_date_signed: p.moa_date_signed || p.date_signed || '',
                    moa_valid_until: p.moa_valid_until || p.valid_until || ''
                });
            }
        } catch (e) { console.error("Error fetching profile for edit:", e); }
    }, []);

    useEffect(() => {
        fetchInterns();
        fetchAllLogs();
        const interval = setInterval(() => { fetchAllLogs(); }, 4000);
        return () => clearInterval(interval);
    }, [fetchInterns, fetchAllLogs]);

    useEffect(() => {
        if (selectedStudentId) fetchStudentProfileForEdit(selectedStudentId);
    }, [selectedStudentId, fetchStudentProfileForEdit]);

    // Save profile method (Nagse-save nang diretso para mag-sync agad sa Student Dashboard)
    const handleSaveProfile = async (e) => {
        e.preventDefault();
        try {
            const payload = { user_id: Number(selectedStudentId), ...profileForm };
            const res = await fetch(`${API_BASE_URL}/api/interns/${selectedStudentId}/profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                notify("Matagumpay na na-save at na-sync ang profile ng estudyante!");
            } else {
                notify("Hindi na-save ang profile. Subukan ulit.", true);
            }
        } catch (err) {
            console.error(err);
            notify("Error sa pag-save ng profile.", true);
        }
    };

    // Approve / Reject status update handlers
    const handleUpdateDTRStatus = async (logId, status, reason = '') => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/dtr-logs/${logId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: status.toLowerCase(), rejection_reason: reason, remarks: reason })
            });
            if (res.ok) {
                notify(`DTR record is set to ${status.toUpperCase()}`);
                fetchAllLogs();
                setRejectLogTarget(null);
                setRejectionReason('');
            } else {
                notify("Hindi ma-update ang status.", true);
            }
        } catch (e) {
            console.error(e);
            notify("Connection error.", true);
        }
    };

    // Chat reply handler
    const handleSendReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim() || !activeChatLog) return;
        const logId = idOf(activeChatLog);
        const payload = { sender: 'supervisor', message: replyText.trim(), timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        setActiveChatLog(prev => prev ? { ...prev, messages: [...(prev.messages || []), payload] } : null);
        setReplyText('');
        try {
            await fetch(`${API_BASE_URL}/api/dtr/${logId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            fetchAllLogs();
        } catch (err) { console.error('Error sending chat reply:', err); }
    };

    // Derived statistics
    const stats = useMemo(() => {
        const pending = logs.filter(l => statusOf(l) === 'pending');
        const approved = logs.filter(l => statusOf(l) === 'approved');
        const rejected = logs.filter(l => statusOf(l) === 'rejected');
        return { pending, approved, rejected };
    }, [logs]);

    const visibleLogs = useMemo(() => {
        return logs.filter(l => {
            const st = statusOf(l);
            if (statusFilter === 'pending' && st !== 'pending') return false;
            if (statusFilter === 'approved' && st !== 'approved') return false;
            if (statusFilter === 'rejected' && st !== 'rejected') return false;
            const q = search.toLowerCase();
            return `${l.student_name || ''} ${l.log_date || ''} ${l.accomplishment || l.raw_notes || ''}`.toLowerCase().includes(q);
        });
    }, [logs, statusFilter, search]);

    return (
        <div className="sf">
            <style>{CSS}</style>

            <aside className="sf-side">
                <div className="sf-logo"><Shield size={20} /> Supervisor Hub</div>
                <div className="sf-me">
                    <div className="av">S</div>
                    <div style={{ minWidth: 0 }}>
                        <div className="hd" style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{supervisorName}</div>
                        <div style={{ fontSize: 10, color: '#f87171' }}>OJT Supervisor Portal</div>
                    </div>
                </div>
                <button className={`nav ${tab === 'dtr' ? 'on' : ''}`} onClick={() => setTab('dtr')}><FileText size={16} /> DTR Approval Center</button>
                <button className={`nav ${tab === 'profile' ? 'on' : ''}`} onClick={() => setTab('profile')}><UserCheck size={16} /> Intern Profile & MOA</button>
                <button className="nav sf-out" onClick={onLogout || (() => window.location.reload())}><LogOut size={16} /> Logout</button>
            </aside>

            <main className="sf-main">
                <div className="top">
                    <span><span className="dot" />SUPERVISOR SESSION ACTIVE</span>
                    <span>TOTAL INTERNS: <b>{interns.length || 4}</b></span>
                </div>

                {tab === 'dtr' && (<>
                    <div className="pg" style={{ marginBottom: 18 }}>
                        <div><h1>DTR APPROVAL & REVISION</h1><p>[ SURIIN AT MAG-APPROVE NG MGA DTR RECORDS ]</p></div>
                    </div>

                    <div className="g4">
                        <div className="card">
                            <div className="lbl">Total Submissions</div>
                            <div className="big" style={{ color: '#22d3ee' }}>{logs.length}</div>
                        </div>
                        <div className="card" style={{ '--ac': '#facc15' }}>
                            <div className="lbl">Pending Review</div>
                            <div className="big" style={{ color: '#facc15' }}>{stats.pending.length}</div>
                        </div>
                        <div className="card" style={{ '--ac': '#34d399' }}>
                            <div className="lbl">Approved Logs</div>
                            <div className="big" style={{ color: '#34d399' }}>{stats.approved.length}</div>
                        </div>
                        <div className="card" style={{ '--ac': '#f87171' }}>
                            <div className="lbl">Rejected / Revision</div>
                            <div className="big" style={{ color: '#f87171' }}>{stats.rejected.length}</div>
                        </div>
                    </div>

                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {[['all', 'All', logs.length], ['pending', 'Pending', stats.pending.length], ['approved', 'Approved', stats.approved.length], ['rejected', 'Rejected', stats.rejected.length]].map(([k, t, c]) => (
                                    <button key={k} className={`pill ${statusFilter === k ? 'on' : ''}`} onClick={() => setStatusFilter(k)}>{t} [{c}]</button>
                                ))}
                            </div>
                            <div className="srch"><Search size={14} color="#64748b" /><input placeholder="Search student or notes..." value={search} onChange={e => setSearch(e.target.value)} /></div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table className="tbl">
                                <thead><tr><th>Student</th><th>Date</th><th>Hours</th><th>Accomplishments</th><th>Proof</th><th>Status</th><th>Actions</th></tr></thead>
                                <tbody>
                                    {visibleLogs.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', color: '#64748b' }}>Walang nahanap na DTR submission.</td></tr>}
                                    {visibleLogs.map(l => (
                                        <tr key={idOf(l)}>
                                            <td style={{ fontWeight: 700, color: '#f8fafc' }}>{l.student_name || 'Student Intern'}</td>
                                            <td style={{ color: '#22d3ee' }}>{l.log_date || l.date}</td>
                                            <td style={{ color: '#38bdf8', fontWeight: 700 }}>{hrsOf(l)} hrs</td>
                                            <td style={{ color: '#94a3b8', maxWidth: 260 }}>{l.accomplishment || l.raw_notes}</td>
                                            <td>{l.proof_url ? <a className="btn sm" href={fullUrl(l.proof_url)} target="_blank" rel="noreferrer"><Paperclip size={12} /> View Proof <Eye size={12} /></a> : <span style={{ color: '#475569', fontStyle: 'italic' }}>No File</span>}</td>
                                            <td><span className={`chip ${statusOf(l) === 'approved' ? 'ok' : statusOf(l) === 'rejected' ? 'bad' : 'warn'}`}>{statusOf(l).toUpperCase()}</span></td>
                                            <td><div className="act">
                                                <button className="btn sm ok" onClick={() => handleUpdateDTRStatus(idOf(l), 'approved')}><CheckCircle2 size={12} /> Approve</button>
                                                <button className="btn sm bad" onClick={() => setRejectLogTarget(l)}><XCircle size={12} /> Reject</button>
                                                <button className="btn sm" onClick={() => setActiveChatLog(l)}><MessageSquare size={12} /> Chat</button>
                                            </div></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>)}

                {tab === 'profile' && (<>
                    <div className="pg" style={{ marginBottom: 18 }}>
                        <div><h1>INTERN PROFILE & MOA MANAGEMENT</h1><p>[ EDIT AT I-SYNC ANG REQUIREMENTS NG MGA ESTUDYANTE ]</p></div>
                    </div>

                    <div className="card" style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18 }}>
                            <label className="lbl">Pumili ng Estudyante:</label>
                            <select className="in" style={{ maxWidth: 320 }} value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}>
                                <option value={2}>Friesy Ferry (Student ID: 2)</option>
                                {interns.filter(i => i.id !== 2).map(i => (
                                    <option key={i.id} value={i.id}>{i.full_name || i.email} (ID: {i.id})</option>
                                ))}
                            </select>
                        </div>

                        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="g2">
                                <div><label className="lbl">Paaralan / University</label><input className="in" value={profileForm.school} onChange={e => setProfileForm({ ...profileForm, school: e.target.value })} /></div>
                                <div><label className="lbl">Course / Degree</label><input className="in" value={profileForm.course} onChange={e => setProfileForm({ ...profileForm, course: e.target.value })} /></div>
                                <div><label className="lbl">Year Level</label><input className="in" value={profileForm.year_level} onChange={e => setProfileForm({ ...profileForm, year_level: e.target.value })} /></div>
                                <div><label className="lbl">School Coordinator / Adviser</label><input className="in" value={profileForm.adviser} onChange={e => setProfileForm({ ...profileForm, adviser: e.target.value })} /></div>
                                <div><label className="lbl">Host Company</label><input className="in" value={profileForm.host_company} onChange={e => setProfileForm({ ...profileForm, host_company: e.target.value })} /></div>
                                <div><label className="lbl">Department</label><input className="in" value={profileForm.department} onChange={e => setProfileForm({ ...profileForm, department: e.target.value })} /></div>
                                <div><label className="lbl">MOA Reference Number</label><input className="in" value={profileForm.moa_ref_no} onChange={e => setProfileForm({ ...profileForm, moa_ref_no: e.target.value })} /></div>
                                <div><label className="lbl">Required Hours</label><input className="in" type="number" value={profileForm.required_hours} onChange={e => setProfileForm({ ...profileForm, required_hours: Number(e.target.value) })} /></div>
                            </div>

                            <div className="card" style={{ background: 'rgba(5,8,22,.6)' }}>
                                <div className="lbl" style={{ marginBottom: 12 }}>Requirements Checklist Status</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={profileForm.moa_signed} onChange={e => setProfileForm({ ...profileForm, moa_signed: e.target.checked })} /> MOA Signed
                                    </label>
                                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={profileForm.endorsement_letter} onChange={e => setProfileForm({ ...profileForm, endorsement_letter: e.target.checked })} /> Endorsement Letter
                                    </label>
                                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={profileForm.parent_consent} onChange={e => setProfileForm({ ...profileForm, parent_consent: e.target.checked })} /> Parent Consent Waiver
                                    </label>
                                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={profileForm.medical_clearance} onChange={e => setProfileForm({ ...profileForm, medical_clearance: e.target.checked })} /> Medical Clearance
                                    </label>
                                </div>
                            </div>

                            <button type="submit" className="btn solid" style={{ alignSelf: 'flex-start' }}><Save size={14} /> Save & Sync Profile</button>
                        </form>
                    </div>
                </>)}
            </main>

            {/* Rejection Modal */}
            {rejectLogTarget && (
                <div className="ovl">
                    <div className="modal">
                        <h3 style={{ color: '#f87171', marginBottom: 12 }}>REJECT DTR RECORD</h3>
                        <p style={{ color: '#94a3b8', marginBottom: 12 }}>Maglagay ng dahilan para sa rejection ng DTR log na ito:</p>
                        <textarea className="in" rows="4" value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder="Dahilan ng rejection..." style={{ resize: 'none', marginBottom: 14 }} />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn" onClick={() => setRejectLogTarget(null)}>Cancel</button>
                            <button className="btn bad" onClick={() => handleUpdateDTRStatus(idOf(rejectLogTarget), 'rejected', rejectionReason)}>Confirm Reject</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
        </div>
    );
}