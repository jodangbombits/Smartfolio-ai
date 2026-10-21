import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LayoutDashboard, UserCheck, Bot, MessageSquare, FileText,
    CheckCircle2, XCircle, Search, Eye, Save,
    Users, LogOut, Zap, Send, Download, Printer, Sparkles, AlertCircle
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

/* ───────────── Helpers ───────────── */
const idOf = (l) => l.id || l.log_id;
const hrsOf = (l) => parseFloat(l.rendered_today || l.hoursRendered || 0) || 0;
const statusOf = (l) => (l.status || 'pending').toLowerCase();
const msgText = (m) => typeof m === 'string' ? m : (m.message || m.text || m.remark || m.content || '');
const fullUrl = (u) => !u ? null : /^https?:\/\//i.test(u) ? u : `${API_BASE_URL}${u.startsWith('/') ? '' : '/'}${u}`;

/* ───────────── Cyberpunk Styling ───────────── */
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
.cnt{background:#facc15;color:#050816;border-radius:99px;padding:0 6px;font-size:10px;font-weight:800}
.in{width:100%;background:rgba(15,23,42,.8);border:1px solid var(--line);border-radius:99px;padding:9px 16px;color:#fff;font:inherit;outline:0;color-scheme:dark}
.in.sq{border-radius:10px}
.toast{position:fixed;right:20px;bottom:20px;z-index:400;padding:12px 16px;border-radius:10px;background:#0a1020;border:1px solid var(--ok);color:var(--ok);box-shadow:0 0 24px rgba(52,211,153,.3)}
.toast.err{border-color:var(--bad);color:var(--bad);box-shadow:0 0 24px rgba(248,113,113,.3)}
.ovl{position:fixed;inset:0;background:rgba(2,6,18,.8);backdrop-filter:blur(6px);display:grid;place-items:center;z-index:200;padding:16px}
.modal{width:min(520px,100%);max-height:92vh;overflow:auto;background:#0a1020;border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:0 0 50px rgba(34,211,238,.18)}
.bub{max-width:85%;padding:9px 12px;font-size:12.5px;line-height:1.5;word-break:break-word;color:#fff}
.bub.me{background:#0e7490;border-radius:14px 14px 3px 14px}
.bub.sup{background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.35);border-radius:14px 14px 14px 3px}
.intern-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:18px}
.intern-card{background:rgba(15,23,42,.6);border:1px solid rgba(34,211,238,.2);border-radius:12px;padding:12px;cursor:pointer;transition:all .2s;display:flex;flex-direction:column;justify-content:space-between}
.intern-card:hover,.intern-card.on{border-color:var(--cy);background:rgba(34,211,238,.1);box-shadow:0 0 16px rgba(34,211,238,.2)}
`;

const NAV = [
    { id: 'review', label: 'DTR Review Portal', icon: LayoutDashboard },
    { id: 'profile', label: 'Intern Profile & MOA', icon: UserCheck },
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

    const [rejectLogTarget, setRejectLogTarget] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');

    const [profileForm, setProfileForm] = useState({
        school: '', email: '', course: '', year_level: '', adviser: '', contact: '',
        host_company: '', department: '', start_date: '', end_date: '', required_hours: 500,
        moa_ref_no: '', moa_signed: false, endorsement_letter: false, parent_consent: false, medical_clearance: false
    });

    const notify = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3200); };

    /* ───── Fetch Interns List ───── */
    const fetchInternsList = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/interns`);
            if (res.ok) {
                const data = await res.json();
                setInterns(Array.isArray(data) ? data : []);
            }
        } catch (e) { console.error("Error fetching interns:", e); }
    }, []);

    /* ───── Fetch All Logs ───── */
    const fetchAllLogs = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/dtr/all`);
            if (res.ok) {
                const data = await res.json();
                setLogs(Array.isArray(data) ? data : []);
            }
        } catch (e) { console.error("Error fetching logs:", e); }
    }, []);

    /* ───── Fetch Intern Profile ───── */
    const fetchInternProfile = useCallback(async (userId) => {
        if (!userId || userId === 'all') return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/interns/${userId}/profile`);
            if (res.ok) {
                const p = await res.json();
                setProfileForm({
                    school: p.school || '', email: p.email || '', course: p.course || '',
                    year_level: p.year_level || '', adviser: p.adviser || '', contact: p.contact || '',
                    host_company: p.host_company || '', department: p.department || '',
                    start_date: p.start_date || '', end_date: p.end_date || '', required_hours: p.required_hours || 500,
                    moa_ref_no: p.moa_ref_no || '', moa_signed: Boolean(p.moa_signed),
                    endorsement_letter: Boolean(p.endorsement_letter), parent_consent: Boolean(p.parent_consent),
                    medical_clearance: Boolean(p.medical_clearance)
                });
            }
        } catch (e) { console.error("Error fetching profile:", e); }
    }, []);

    useEffect(() => {
        fetchInternsList();
        fetchAllLogs();
        const interval = setInterval(() => { fetchAllLogs(); fetchInternsList(); }, 2000);
        return () => clearInterval(interval);
    }, [fetchAllLogs, fetchInternsList]);

    useEffect(() => {
        if (selectedInternId !== 'all') fetchInternProfile(selectedInternId);
    }, [selectedInternId, fetchInternProfile]);

    /* ───── Status Update (Approve / Reject) ───── */
    const handleUpdateStatus = async (logId, status, reason = '') => {
        const lowerStatus = status.toLowerCase();

        // Optimistic Local State Update
        setLogs(prev => prev.map(l => {
            if (idOf(l) === logId) {
                return {
                    ...l,
                    status: lowerStatus,
                    rejection_reason: reason,
                    remarks: reason,
                    supervisor_comment: reason
                };
            }
            return l;
        }));

        setRejectLogTarget(null);
        setRejectionReason('');

        try {
            const payload = {
                status: lowerStatus,
                rejection_reason: reason,
                remarks: reason,
                supervisor_comment: reason
            };

            const res = await fetch(`${API_BASE_URL}/api/dtr-logs/${logId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                notify(`DTR Status: ${status.toUpperCase()}`);
                fetchAllLogs();
            } else {
                notify(`DTR Status set to ${status.toUpperCase()}`);
            }
        } catch (e) {
            console.error("Update status error:", e);
            notify(`DTR Status set to ${status.toUpperCase()}`);
        }
    };

    /* ───── Save Profile ───── */
    const handleSaveProfile = async (e) => {
        e.preventDefault();
        const targetId = selectedInternId === 'all' ? (interns[0]?.id || 2) : selectedInternId;
        try {
            const payload = { user_id: Number(targetId), ...profileForm };
            const res = await fetch(`${API_BASE_URL}/api/interns/${targetId}/profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) notify("Profile saved successfully!");
            else notify("Failed to save profile.", true);
        } catch (e) { notify("Error saving profile.", true); }
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
        return [{ id: 'all', full_name: 'All Interns', email: `${interns.length} intern(s)` }, ...interns];
    }, [interns]);

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
                {NAV.map(n => (
                    <button key={n.id} className={`nav ${tab === n.id ? 'on' : ''}`} onClick={() => setTab(n.id)}>
                        <n.icon size={16} /> {n.label}
                    </button>
                ))}
                <button className="nav sf-out" onClick={onLogout || (() => window.location.reload())}><LogOut size={16} /> Logout Portal</button>
            </aside>

            <main className="sf-main">
                <div className="top">
                    <span><span className="dot" />SYS ONLINE // SUPERVISOR SESSION</span>
                    <span>{interns.length} INTERNS MONITORED | DTR & INTERNSHIP HUB</span>
                </div>

                <div className="intern-row">
                    {activeInternList.map(item => (
                        <div key={item.id} className={`intern-card ${selectedInternId === item.id ? 'on' : ''}`} onClick={() => setSelectedInternId(item.id)}>
                            <div style={{ fontWeight: 700, fontSize: 12 }}>{item.full_name}</div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>{item.email}</div>
                        </div>
                    ))}
                </div>

                <div className="pg">
                    <div>
                        <h1>SUPERVISOR PORTAL</h1>
                        <p>[ REVIEW STUDENT DTR SUBMISSIONS, APPROVE HOURS, AND GIVE FEEDBACK ]</p>
                    </div>
                    <div className="srch">
                        <Search size={14} color="#64748b" />
                        <input placeholder="Search intern name, date or notes..." value={search} onChange={e => setSearch(e.target.value)} />
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

                {/* ───── TAB 1: REVIEW PORTAL ───── */}
                {tab === 'review' && (
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
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ───── TAB 2: INTERN PROFILE & MOA ───── */}
                {tab === 'profile' && (
                    <div className="card">
                        <div className="sh"><UserCheck size={16} /> INTERN PROFILE & MOA RECORDS</div>
                        <form onSubmit={handleSaveProfile} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <div><label className="lbl">School</label><input className="in sq" value={profileForm.school} onChange={e => setProfileForm({ ...profileForm, school: e.target.value })} /></div>
                            <div><label className="lbl">Course</label><input className="in sq" value={profileForm.course} onChange={e => setProfileForm({ ...profileForm, course: e.target.value })} /></div>
                            <div><label className="lbl">Year Level</label><input className="in sq" value={profileForm.year_level} onChange={e => setProfileForm({ ...profileForm, year_level: e.target.value })} /></div>
                            <div><label className="lbl">Coordinator / Adviser</label><input className="in sq" value={profileForm.adviser} onChange={e => setProfileForm({ ...profileForm, adviser: e.target.value })} /></div>
                            <div><label className="lbl">Required Hours</label><input className="in sq" type="number" value={profileForm.required_hours} onChange={e => setProfileForm({ ...profileForm, required_hours: e.target.value })} /></div>
                            <div><label className="lbl">MOA Reference No.</label><input className="in sq" value={profileForm.moa_ref_no} onChange={e => setProfileForm({ ...profileForm, moa_ref_no: e.target.value })} /></div>
                            <div style={{ gridColumn: 'span 2', display: 'flex', gap: 20, margin: '10px 0' }}>
                                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={profileForm.moa_signed} onChange={e => setProfileForm({ ...profileForm, moa_signed: e.target.checked })} /> MOA Signed
                                </label>
                                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={profileForm.endorsement_letter} onChange={e => setProfileForm({ ...profileForm, endorsement_letter: e.target.checked })} /> Endorsement Letter
                                </label>
                                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={profileForm.parent_consent} onChange={e => setProfileForm({ ...profileForm, parent_consent: e.target.checked })} /> Parent Consent
                                </label>
                            </div>
                            <button className="btn solid" style={{ gridColumn: 'span 2', justifyContent: 'center' }} type="submit"><Save size={14} /> Save Profile Records</button>
                        </form>
                    </div>
                )}

                {/* ───── TAB 3: DTR SUMMARY REPORTS ───── */}
                {tab === 'reports' && (
                    <div className="card">
                        <div className="sh"><FileText size={16} /> SUMMARY REPORTS</div>
                        <p style={{ color: '#94a3b8' }}>Mabilisang buod ng kabuuang renders at submission ng bawat student intern.</p>
                        <table className="tbl" style={{ marginTop: 14 }}>
                            <thead><tr><th>Intern</th><th>Total Logs</th><th>Approved Hours</th><th>Status</th></tr></thead>
                            <tbody>
                                {interns.map(i => {
                                    const studentLogs = logs.filter(l => Number(l.user_id) === Number(i.id) && statusOf(l) === 'approved');
                                    const totalHrs = studentLogs.reduce((s, l) => s + hrsOf(l), 0);
                                    return (
                                        <tr key={i.id}>
                                            <td style={{ fontWeight: 700 }}>{i.full_name}</td>
                                            <td>{logs.filter(l => Number(l.user_id) === Number(i.id)).length} submissions</td>
                                            <td style={{ color: '#38bdf8', fontWeight: 700 }}>{totalHrs} hrs</td>
                                            <td><span className="chip ok">ACTIVE</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
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