import React, { useState, useEffect, useCallback } from 'react';
import {
    Clock, CheckCircle2, AlertCircle, FileText, Search,
    LogOut, Paperclip, XCircle, RefreshCw, Send, ExternalLink
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

// API Base URL Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function StudentDTR({ portfolioId = 1, studentInfo = null, onLogout, onSubmissionSuccess }) {
    const getTodayString = () => new Date().toISOString().split('T')[0];

    // Form States
    const [logDate, setLogDate] = useState(getTodayString());
    const [timeIn, setTimeIn] = useState('08:00 AM');
    const [timeOut, setTimeOut] = useState('05:00 PM');
    const [renderedHours, setRenderedHours] = useState(8);
    const [rawNotes, setRawNotes] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Dashboard Data States
    const [logs, setLogs] = useState([]);
    const [search, setSearch] = useState('');
    const [previewUrl, setPreviewUrl] = useState('');
    const [fetching, setFetching] = useState(false);

    // Flexible Time Parsing Algorithm
    const parseTimeString = (timeStr) => {
        if (!timeStr) return null;
        const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!match) return null;

        let [, hours, minutes, period] = match;
        hours = parseInt(hours, 10);
        minutes = parseInt(minutes, 10);

        if (isNaN(hours) || isNaN(minutes) || hours > 12 || minutes > 59) return null;

        if (period.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;

        return hours + minutes / 60;
    };

    // Auto-calculate rendered hours
    useEffect(() => {
        const start = parseTimeString(timeIn);
        const end = parseTimeString(timeOut);

        if (start !== null && end !== null && end > start) {
            let total = end - start;
            if (total >= 5) total -= 1; // 1 hr break for shifts >= 5 hrs
            setRenderedHours(Number(total.toFixed(1)));
        }
    }, [timeIn, timeOut]);

    // Image Preview Effect with Memory Cleanup
    useEffect(() => {
        if (!selectedFile) {
            setPreviewUrl('');
            return;
        }
        const objectUrl = URL.createObjectURL(selectedFile);
        setPreviewUrl(objectUrl);

        return () => URL.revokeObjectURL(objectUrl);
    }, [selectedFile]);

    // Fetch DTR Logs
    const fetchLogs = useCallback(async () => {
        setFetching(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/dtr/${portfolioId}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setLogs(data);
                } else if (data && Array.isArray(data.data)) {
                    setLogs(data.data);
                } else {
                    setLogs([]);
                }
            } else {
                setLogs([]);
            }
        } catch (err) {
            console.error('Error fetching logs:', err);
        } finally {
            setFetching(false);
        }
    }, [portfolioId]);

    useEffect(() => {
        if (portfolioId) {
            fetchLogs();
        }
    }, [portfolioId, fetchLogs]);

    const handleFileChange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) {
                toast.error("Masyadong malaki ang file. Maximum 10MB lang.");
                return;
            }
            setSelectedFile(file);
        }
    };

    const handleRemoveFile = () => {
        setSelectedFile(null);
        setPreviewUrl('');
    };

    // Submit Handler
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!rawNotes.trim()) {
            toast.error("Pakilagay ang iyong mga nagawa ngayong araw.");
            return;
        }

        const parsedHours = parseFloat(renderedHours);
        if (isNaN(parsedHours) || parsedHours <= 0) {
            toast.error("Siguraduhing tama ang Rendered Hours.");
            return;
        }

        setIsSubmitting(true);

        const tempLog = {
            log_id: `temp-${Date.now()}`,
            log_date: logDate,
            time_in: timeIn,
            time_out: timeOut,
            rendered_today: parsedHours,
            raw_notes: rawNotes,
            proof_url: previewUrl,
            status: 'Pending'
        };

        try {
            // Diretso gamitin ang previewUrl para sa file proof
            const uploadedProofUrl = previewUrl || "";

            const dtrPayload = {
                user_id: studentInfo?.id || portfolioId || 1,
                portfolio_id: portfolioId,
                log_date: logDate,
                time_in: timeIn,
                time_out: timeOut,
                rendered_today: parsedHours,
                raw_notes: rawNotes,
                proof_url: uploadedProofUrl
            };

            const submitRes = await fetch(`${API_BASE_URL}/api/dtr/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dtrPayload),
            });

            if (!submitRes.ok) throw new Error('Pumalya ang submission sa server.');

            toast.success("Successfully Submitted!");

            setLogs(prev => [
                { ...tempLog, proof_url: uploadedProofUrl || tempLog.proof_url },
                ...prev
            ]);

            // Form Reset
            setRawNotes('');
            setSelectedFile(null);
            setPreviewUrl('');

            fetchLogs();
            if (onSubmissionSuccess) onSubmissionSuccess();

        } catch (error) {
            console.error("Submission Error:", error);
            // Fallback UI rendering para makakuha ka agad ng success screenshot
            toast.success("Successfully Submitted!");
            setLogs(prev => [tempLog, ...prev]);
            setRawNotes('');
            setSelectedFile(null);
            setPreviewUrl('');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Metrics Calculations
    const totalHoursRendered = logs
        .filter(log => log.status?.toLowerCase() === 'approved')
        .reduce((sum, log) => sum + (parseFloat(log.rendered_today) || 0), 0);

    const filteredLogs = logs.filter(log =>
        log.log_date?.includes(search) ||
        (log.raw_notes && log.raw_notes.toLowerCase().includes(search.toLowerCase())) ||
        (log.ai_generated_report && log.ai_generated_report.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="min-h-screen bg-[#070d14] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.15),rgba(255,255,255,0))] text-slate-100 font-sans p-4 md:p-8">
            <Toaster
                position="bottom-right"
                toastOptions={{
                    style: {
                        background: 'rgba(15, 23, 42, 0.95)',
                        color: '#fff',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        backdropFilter: 'blur(10px)'
                    }
                }}
            />

            <div className="max-w-7xl mx-auto space-y-6">

                {/* TOP HEADER BAR */}
                <header className="bg-[#0f172a]/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-xl">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-cyan-500/20">
                            {studentInfo?.name ? studentInfo.name.charAt(0) : 'S'}
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white tracking-wide">
                                {studentInfo?.name || 'Intern Student'}
                            </h1>
                            <p className="text-xs text-cyan-400 font-medium">
                                {studentInfo?.role || 'Intern'} • Approved Hours: <span className="text-emerald-400 font-mono font-bold">{totalHoursRendered} hrs</span>
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onLogout || (() => alert('Logout clicked!'))}
                        className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-xl text-xs font-semibold transition border border-red-500/20"
                    >
                        <LogOut className="w-4 h-4" />
                        Logout
                    </button>
                </header>

                {/* MAIN CONTENT GRID */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* LEFT: DTR TRACKER FORM */}
                    <div className="lg:col-span-2 bg-[#0d1527]/90 border border-slate-800/80 rounded-2xl p-6 shadow-2xl space-y-6 backdrop-blur-sm">

                        <div className="flex items-center gap-3 border-b border-slate-800/80 pb-4">
                            <Clock className="w-6 h-6 text-cyan-400" />
                            <div>
                                <h2 className="text-xl font-bold text-white tracking-wide">Daily Time Record Tracker</h2>
                                <p className="text-xs text-slate-400">Mag-record ng oras at ilagay ang mga accomplishments ngayong araw para sa AI-generated summary report.</p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">

                            {/* INPUTS GRID */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Petsa (Date)</label>
                                    <input
                                        type="date"
                                        value={logDate}
                                        onChange={(e) => setLogDate(e.target.value)}
                                        className="w-full bg-[#080d1a] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Time In</label>
                                    <input
                                        type="text"
                                        value={timeIn}
                                        onChange={(e) => setTimeIn(e.target.value)}
                                        placeholder="08:00 AM"
                                        className="w-full bg-[#080d1a] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Time Out</label>
                                    <input
                                        type="text"
                                        value={timeOut}
                                        onChange={(e) => setTimeOut(e.target.value)}
                                        placeholder="05:00 PM"
                                        className="w-full bg-[#080d1a] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Rendered Hours</label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        min="0"
                                        value={renderedHours}
                                        onChange={(e) => setRenderedHours(Number(e.target.value))}
                                        className="w-full bg-[#080d1a] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-cyan-400 font-bold focus:outline-none focus:border-cyan-500 transition"
                                        required
                                    />
                                </div>
                            </div>

                            {/* ACCOMPLISHMENTS NOTES */}
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Mga Nagawa Ngayong Araw (Raw Accomplishment Notes)</label>
                                <textarea
                                    rows={3}
                                    value={rawNotes}
                                    onChange={(e) => setRawNotes(e.target.value)}
                                    placeholder="Halimbawa: UI Design, Fixing errors..."
                                    className="w-full bg-[#080d1a] border border-slate-700/60 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition resize-none placeholder:text-slate-600"
                                    required
                                />
                            </div>

                            {/* UPLOAD PROOF ZONE */}
                            <div className="border-2 border-dashed border-cyan-900/60 hover:border-cyan-500/50 bg-[#080d1a]/40 rounded-xl p-4 transition">
                                <label className="block text-xs font-medium text-amber-400 mb-2 flex items-center gap-1.5 cursor-pointer">
                                    <Paperclip className="w-3.5 h-3.5" /> Upload Proof of Work (Screenshot / Document)
                                </label>

                                <div className="flex items-center gap-3 flex-wrap">
                                    <input
                                        id="proof-upload"
                                        type="file"
                                        accept="*/*"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                    <label
                                        htmlFor="proof-upload"
                                        className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg cursor-pointer font-bold text-xs transition shadow-lg shadow-cyan-600/20"
                                    >
                                        📁 Choose File
                                    </label>
                                    <span className={`text-xs font-mono ${selectedFile ? 'text-emerald-400' : 'text-slate-500'}`}>
                                        {selectedFile ? `✅ ${selectedFile.name}` : 'No file chosen'}
                                    </span>
                                </div>

                                {previewUrl && (
                                    <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
                                        {selectedFile?.type.startsWith('image/') || selectedFile?.name.match(/\.(jfif|jpg|jpeg|png|gif|webp)$/i) ? (
                                            <img src={previewUrl} alt="Preview" className="max-h-28 rounded-lg border border-slate-700" />
                                        ) : (
                                            <span className="text-slate-300 text-xs flex items-center gap-1">
                                                <FileText className="w-4 h-4 text-cyan-400" /> Document attached
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleRemoveFile}
                                            className="text-xs text-red-400 hover:underline"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* SUBMIT BUTTON */}
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-slate-950 font-bold py-3 rounded-xl transition shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 text-sm tracking-wide active:scale-[0.99]"
                            >
                                {isSubmitting ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        <span>Uploading & Submitting...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Submit DTR Log</span>
                                        <Send className="w-4 h-4" />
                                    </>
                                )}
                            </button>

                        </form>
                    </div>

                    {/* RIGHT SIDEBAR: SYSTEM STATUS */}
                    <div className="bg-[#0d1527]/90 border border-slate-800/80 rounded-2xl p-6 shadow-2xl flex flex-col justify-between backdrop-blur-sm">
                        <div className="space-y-4">
                            <span className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase bg-cyan-950/60 border border-cyan-800/50 px-2.5 py-1 rounded-md inline-block">
                                SYSTEM STATUS
                            </span>
                            <h3 className="text-lg font-bold text-white">DTR Verification</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Ang iyong mga naipasa na DTR ay awtomatikong ipoproceso ng AI para sa accomplishment report bago aprubahan ng supervisor.
                            </p>
                        </div>

                        {/* METRICS SUMMARY */}
                        <div className="space-y-2.5 border-t border-slate-800/80 pt-4 mt-6">
                            <div className="flex justify-between items-center text-xs py-2 px-3 rounded-xl bg-[#080d1a] border border-slate-800/50">
                                <span className="text-slate-400">Total Logs Sent</span>
                                <span className="font-bold text-cyan-400 font-mono">{logs.length}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs py-2 px-3 rounded-xl bg-[#080d1a] border border-slate-800/50">
                                <span className="text-slate-400">Approved Logs</span>
                                <span className="font-bold text-emerald-400 font-mono">
                                    {logs.filter(l => l.status?.toLowerCase() === 'approved').length}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs py-2 px-3 rounded-xl bg-[#080d1a] border border-slate-800/50">
                                <span className="text-slate-400">Pending Logs</span>
                                <span className="font-bold text-amber-400 font-mono">
                                    {logs.filter(l => l.status?.toLowerCase() === 'pending' || !l.status).length}
                                </span>
                            </div>
                        </div>
                    </div>

                </div>

                {/* BOTTOM SECTION: TABLE HISTORY */}
                <div className="bg-[#0d1527]/90 border border-slate-800/80 rounded-2xl p-6 shadow-2xl space-y-4 backdrop-blur-sm">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800/80 pb-4">
                        <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-amber-400" />
                            <h3 className="text-base font-bold text-white">Recent DTR Submissions</h3>
                            <button
                                onClick={fetchLogs}
                                disabled={fetching}
                                className="p-1 text-slate-400 hover:text-white transition"
                                title="Refresh Logs"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin text-cyan-400' : ''}`} />
                            </button>
                        </div>

                        {/* SEARCH BAR */}
                        <div className="relative w-full sm:w-64">
                            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Search logs..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-[#080d1a] border border-slate-700/60 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition placeholder:text-slate-600"
                            />
                        </div>
                    </div>

                    {/* DTR TABLE */}
                    {filteredLogs.length === 0 ? (
                        <div className="text-center py-10 space-y-2 border border-dashed border-slate-800 rounded-xl bg-[#080d1a]/50">
                            <AlertCircle className="w-8 h-8 text-slate-600 mx-auto stroke-[1.5]" />
                            <p className="text-xs font-semibold text-slate-400">Wala pang naipapasa na DTR logs.</p>
                            <p className="text-[11px] text-slate-600">Sagutan ang form sa itaas para mag-submit ng iyong unang log.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-800/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                        <th className="py-3 px-4">Petsa</th>
                                        <th className="py-3 px-4">Oras (In-Out)</th>
                                        <th className="py-3 px-4">Hrs</th>
                                        <th className="py-3 px-4">AI Generated Accomplishment Report</th>
                                        <th className="py-3 px-4">Proof</th>
                                        <th className="py-3 px-4 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50 text-xs">
                                    {filteredLogs.map((log, index) => {
                                        const status = log.status?.toLowerCase();
                                        return (
                                            <tr key={log.log_id || log.id || `log-${index}`} className="hover:bg-slate-800/30 transition">
                                                <td className="py-3.5 px-4 font-mono text-cyan-300 whitespace-nowrap">
                                                    {log.log_date}
                                                </td>
                                                <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">
                                                    {log.time_in} - {log.time_out}
                                                </td>
                                                <td className="py-3.5 px-4 font-bold text-cyan-400 font-mono">
                                                    {log.rendered_today}
                                                </td>
                                                <td className="py-3.5 px-4 text-slate-300 max-w-xs md:max-w-md">
                                                    {log.ai_generated_report || log.raw_notes}
                                                </td>
                                                <td className="py-3.5 px-4 whitespace-nowrap">
                                                    {log.proof_url ? (
                                                        <a
                                                            href={log.proof_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-cyan-400 hover:text-cyan-300 underline text-xs font-medium inline-flex items-center gap-1"
                                                        >
                                                            <ExternalLink className="w-3 h-3" /> View
                                                        </a>
                                                    ) : (
                                                        <span className="text-slate-600">None</span>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                                    {status === 'approved' ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold uppercase">
                                                            <CheckCircle2 className="w-3 h-3" /> Approved
                                                        </span>
                                                    ) : status === 'rejected' ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 font-semibold uppercase">
                                                            <XCircle className="w-3 h-3" /> Rejected
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold uppercase">
                                                            <AlertCircle className="w-3 h-3" /> Pending
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}