import React, { useState } from 'react';
import { ArrowLeft, Clock, Upload, FileText, Send } from 'lucide-react';

export default function DTRTracker({ dtrLogs = [], onAddDTR, onBackToDashboard }) {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [timeIn, setTimeIn] = useState('08:00');
    const [timeOut, setTimeOut] = useState('17:00');
    const [accomplishment, setAccomplishment] = useState('');
    const [fileName, setFileName] = useState('');

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFileName(e.target.files[0].name);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const inHour = parseInt(timeIn.split(':')[0], 10);
        const outHour = parseInt(timeOut.split(':')[0], 10);
        const calculatedHours = Math.max(1, outHour - inHour);

        const newLog = {
            id: Date.now(),
            date,
            timeIn,
            timeOut,
            hoursRendered: calculatedHours,
            accomplishment,
            status: 'Pending'
        };

        if (onAddDTR) {
            onAddDTR(newLog);
        } else {
            alert('DTR Submitted!');
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: '#090d16', color: '#e2e8f0', fontFamily: "'Inter', sans-serif", padding: '2rem' }}>
            <style>{`
                .input-field {
                    width: 100%;
                    background: #182238;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    padding: 0.75rem 1rem;
                    color: #fff;
                    font-size: 0.9rem;
                    outline: none;
                    box-sizing: border-box;
                }
                .input-field:focus { border-color: #818cf8; }
            `}</style>

            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <button onClick={onBackToDashboard} style={{ background: 'transparent', border: 'none', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600', marginBottom: '1.5rem', padding: 0 }}>
                    <ArrowLeft size={18} /> Back to Dashboard
                </button>

                <div style={{ marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: '700', color: '#ffffff', margin: 0 }}>Daily Time Record (DTR) Tracker</h1>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '4px 0 0 0' }}>Record working hours, achievements, and proof of attendance.</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    {/* SUBMISSION FORM */}
                    <div style={{ background: '#101726', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '1.75rem' }}>
                        <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock size={18} color="#818cf8" /> New DTR Entry
                        </h3>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '600' }}>DATE</label>
                                <input type="date" className="input-field" value={date} onChange={(e) => setDate(e.target.value)} required />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '600' }}>TIME IN</label>
                                    <input type="time" className="input-field" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '600' }}>TIME OUT</label>
                                    <input type="time" className="input-field" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} required />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '600' }}>DAILY ACCOMPLISHMENTS</label>
                                <textarea className="input-field" rows="4" placeholder="Briefly describe what you did today..." value={accomplishment} onChange={(e) => setAccomplishment(e.target.value)} required style={{ resize: 'vertical' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '600' }}>ATTACHMENT (PROOF/LOGS)</label>
                                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#182238', border: '1px dashed rgba(255,255,255,0.2)', padding: '0.85rem', borderRadius: '8px', cursor: 'pointer', color: '#94a3b8', fontSize: '0.85rem' }}>
                                    <Upload size={16} />
                                    <span>{fileName || 'Upload screenshot or PDF'}</span>
                                    <input type="file" onChange={handleFileChange} style={{ display: 'none' }} accept="image/*,.pdf" />
                                </label>
                            </div>

                            <button type="submit" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', border: 'none', padding: '0.85rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <Send size={16} /> Submit Daily Log
                            </button>
                        </form>
                    </div>

                    {/* LOGS HISTORY */}
                    <div style={{ background: '#101726', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '1.75rem' }}>
                        <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileText size={18} color="#818cf8" /> Submission History ({dtrLogs.length})
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '500px', overflowY: 'auto' }}>
                            {dtrLogs.map((log) => (
                                <div key={log.id} style={{ background: '#182238', borderRadius: '10px', padding: '1rem', border: '1px solid rgba(255,255,255,0.03)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#ffffff' }}>{log.date}</span>
                                        <span style={{ fontSize: '0.7rem', color: log.status === 'Approved' ? '#22c55e' : '#f59e0b', background: log.status === 'Approved' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
                                            {log.status}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{log.timeIn} - {log.timeOut} ({log.hoursRendered} hrs)</div>
                                    <p style={{ fontSize: '0.8rem', color: '#cbd5e1', margin: '8px 0 0 0', lineHeight: '1.4' }}>{log.accomplishment}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}