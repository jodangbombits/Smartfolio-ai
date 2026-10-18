import React, { useState } from 'react';
import { User, Lock, Briefcase, Mail, UserPlus, LogIn, Phone, KeyRound, RefreshCw } from 'lucide-react';

const API_BASE_URL = 'http://127.0.0.1:8000';

export default function Login({ onLogin }) {
    const [isRegister, setIsRegister] = useState(false);

    // Form States
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [mobile, setMobile] = useState('');
    const [password, setPassword] = useState('');
    // Role ay pinipili LANG sa pag-register. Sa login, ang role ay laging galing sa database.
    const [role, setRole] = useState('student');
    const [inviteCode, setInviteCode] = useState('');

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // reCAPTCHA States
    const [isCaptchaChecked, setIsCaptchaChecked] = useState(false);
    const [isCaptchaLoading, setIsCaptchaLoading] = useState(false);

    // OTP Modal States
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
    const [verifyingOtp, setVerifyingOtp] = useState(false);

    // Dating pekeng Google login na laging nagbibigay ng user ID 1 (kaya nagkakahalo ang mga account).
    // Tinanggal na. Kailangan ng totoong Google OAuth para maging available ito.
    const handleGoogleSignIn = () => {
        setError('Hindi pa available ang Google Sign-In. Gamitin muna ang email at password.');
    };

    const handleToggleCaptcha = () => {
        if (isCaptchaChecked) {
            setIsCaptchaChecked(false);
            return;
        }
        setIsCaptchaLoading(true);
        setTimeout(() => {
            setIsCaptchaLoading(false);
            setIsCaptchaChecked(true);
        }, 800);
    };

    // 1. SUBMIT REGISTRATION / LOGIN HANDLER
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (isRegister && !isCaptchaChecked) {
            setError('Paki-check muna ang "I\'m not a robot" CAPTCHA verification!');
            return;
        }

        if (isRegister && role === 'supervisor' && !inviteCode.trim()) {
            setError('Kailangan ng Supervisor Invite Code para gumawa ng Supervisor account.');
            return;
        }

        setLoading(true);

        if (isRegister) {
            try {
                // TOTOONG PAG-TRIGGER NG OTP EMAIL VIA FASTAPI BACKEND
                const response = await fetch(`${API_BASE_URL}/api/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email }),
                });

                const data = await response.json();

                if (response.ok) {
                    setLoading(false);
                    setShowOtpModal(true); // Open Modal kapag na-dispatch na ang email
                } else {
                    setError(data.detail || 'Bigo sa pagpapadala ng OTP code sa email.');
                    setLoading(false);
                }
            } catch (err) {
                console.error("OTP API Error:", err);
                setError('Hindi ma-connect sa backend server. Siguraduhing tumatakbo ang FastAPI.');
                setLoading(false);
            }
        } else {
            // DIRECT LOGIN FLOW (walang bypass; ang role ay galing lang sa database)
            try {
                const response = await fetch(`${API_BASE_URL}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, password: password }),
                });

                let data = {};
                try {
                    data = await response.json();
                } catch (parseErr) {
                    data = {};
                }

                if (response.ok) {
                    const loggedUser = data.user || data;
                    if (!loggedUser || !loggedUser.id) {
                        setError('Walang user ID na ibinalik ng server. Subukan ulit.');
                    } else {
                        onLogin(loggedUser);
                    }
                } else {
                    setError(data.detail || 'Mali ang Email o Password!');
                }
            } catch (err) {
                console.error("Login API Error:", err);
                setError('Hindi ma-connect sa backend server. Siguraduhing tumatakbo ang FastAPI.');
            } finally {
                setLoading(false);
            }
        }
    };

    const handleOtpChange = (val, index) => {
        if (val.length > 1) return;
        const newOtp = [...otpCode];
        newOtp[index] = val;
        setOtpCode(newOtp);

        if (val && index < 5) {
            const nextInput = document.getElementById(`otp-input-${index + 1}`);
            if (nextInput) nextInput.focus();
        }
    };

    // 2. STRICT OTP VERIFICATION & ACCOUNT ACTIVATION HANDLER
    const handleFinalVerifyOtp = async () => {
        const fullCode = otpCode.join('').trim();

        // Kapag walang nilagay na 6 digits
        if (fullCode.length < 6) {
            alert("⚠️ Pakilagay muna ang buong 6-digit verification code na isinend sa email mo!");
            return;
        }

        setVerifyingOtp(true);

        try {
            // TOTOONG BACKEND OTP VERIFICATION
            const verifyRes = await fetch(`${API_BASE_URL}/api/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, code: fullCode }),
            });

            const verifyData = await verifyRes.json();

            if (verifyRes.ok) {
                // IF OTP VALID, REGISTER USER TO DATABASE
                const regRes = await fetch(`${API_BASE_URL}/api/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        full_name: fullName,
                        email: email,
                        contact_number: mobile,
                        password: password,
                        role: role,
                        invite_code: role === 'supervisor' ? inviteCode.trim() : ''
                    }),
                });

                if (regRes.ok) {
                    setShowOtpModal(false);
                    alert('✓ Account successfully created and verified! Pwede ka nang mag-login.');
                    setIsRegister(false);
                    setPassword('');
                    setInviteCode('');
                    setRole('student');
                    setOtpCode(['', '', '', '', '', '']);
                    setIsCaptchaChecked(false);
                } else {
                    const regData = await regRes.json();
                    setShowOtpModal(false);
                    setOtpCode(['', '', '', '', '', '']);
                    setError(regData.detail || 'Hindi na-register ang account.');
                }
            } else {
                // Mali ang tinype na OTP Code
                alert(`❌ ${verifyData.detail || 'Mali ang Verification Code! Subukan ulit.'}`);
            }
        } catch (err) {
            alert('⚠️ Hindi ma-connect sa server para i-verify ang OTP code.');
        } finally {
            setVerifyingOtp(false);
        }
    };

    const fieldStyle = {
        width: '100%',
        padding: '0.7rem 0.7rem 0.7rem 2.5rem',
        background: '#1e293b',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '0.875rem',
        outline: 'none',
        boxSizing: 'border-box'
    };

    const labelStyle = { display: 'block', color: '#94a3b8', fontSize: '0.775rem', fontWeight: 600, marginBottom: '0.4rem' };
    const iconStyle = { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at 50% 10%, #0f172a 0%, #070a11 100%)',
            fontFamily: 'Inter, sans-serif',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* BACKGROUND DECORATIVE GLOWS */}
            <div style={{
                position: 'absolute',
                top: '-10%',
                left: '-10%',
                width: '400px',
                height: '400px',
                background: 'rgba(2, 132, 199, 0.15)',
                borderRadius: '50%',
                filter: 'blur(80px)',
                pointerEvents: 'none'
            }} />
            <div style={{
                position: 'absolute',
                bottom: '-10%',
                right: '-10%',
                width: '400px',
                height: '400px',
                background: 'rgba(99, 102, 241, 0.12)',
                borderRadius: '50%',
                filter: 'blur(80px)',
                pointerEvents: 'none'
            }} />

            {/* CARD CONTAINER */}
            <div style={{
                background: '#131c2e',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '20px',
                padding: '2.2rem',
                width: '100%',
                maxWidth: '420px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                zIndex: 10
            }}>

                {/* HEADER */}
                <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                    <h2 style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        ⚡ SmartFolio
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '0.825rem', marginTop: '0.4rem' }}>
                        {isRegister ? 'Gumawa ng bagong account para sa OJT portal' : 'Sign in to access your OJT portal'}
                    </p>
                </div>

                {/* GOOGLE BUTTON (hindi pa available) */}
                <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    style={{
                        width: '100%',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '10px',
                        padding: '0.7rem',
                        color: '#1e293b',
                        fontWeight: '600',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        opacity: 0.6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.6rem',
                        marginBottom: '1.25rem'
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    Continue with Google (Coming soon)
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', color: '#475569', fontSize: '0.725rem', fontWeight: '600' }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                    <span>OR {isRegister ? 'REGISTER' : 'LOGIN'} WITH EMAIL</span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                </div>

                {/* ERROR MESSAGE DISPLAY */}
                {error && (
                    <div style={{ background: '#ef444422', border: '1px solid #ef4444', color: '#f87171', padding: '0.75rem', borderRadius: '10px', fontSize: '0.825rem', marginBottom: '1rem', textAlign: 'center' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    {/* FULL NAME FIELD (REGISTRATION ONLY) */}
                    {isRegister && (
                        <div>
                            <label style={labelStyle}>Full Name</label>
                            <div style={{ position: 'relative' }}>
                                <User size={18} style={iconStyle} />
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Juan Dela Cruz"
                                    required
                                    style={fieldStyle}
                                />
                            </div>
                        </div>
                    )}

                    {/* EMAIL FIELD */}
                    <div>
                        <label style={labelStyle}>Email Address</label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={18} style={iconStyle} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="juan@example.com"
                                required
                                style={fieldStyle}
                            />
                        </div>
                    </div>

                    {/* CONTACT NUMBER FIELD (REGISTRATION ONLY) */}
                    {isRegister && (
                        <div>
                            <label style={labelStyle}>Mobile / Contact Number</label>
                            <div style={{ position: 'relative' }}>
                                <Phone size={18} style={iconStyle} />
                                <input
                                    type="tel"
                                    value={mobile}
                                    onChange={(e) => setMobile(e.target.value)}
                                    placeholder="+63 912 345 6789"
                                    required
                                    style={fieldStyle}
                                />
                            </div>
                        </div>
                    )}

                    {/* PASSWORD FIELD */}
                    <div>
                        <label style={labelStyle}>Password</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={18} style={iconStyle} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                style={fieldStyle}
                            />
                        </div>
                    </div>

                    {/* ROLE SELECTION (REGISTRATION ONLY) */}
                    {isRegister && (
                        <div>
                            <label style={labelStyle}>Register As</label>
                            <div style={{ position: 'relative' }}>
                                <Briefcase size={18} style={iconStyle} />
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    style={{ ...fieldStyle, cursor: 'pointer' }}
                                >
                                    <option value="student" style={{ background: '#1e293b', color: '#fff' }}>Student Intern</option>
                                    <option value="supervisor" style={{ background: '#1e293b', color: '#fff' }}>Supervisor (kailangan ng invite code)</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* SUPERVISOR INVITE CODE (kapag Supervisor ang pinili) */}
                    {isRegister && role === 'supervisor' && (
                        <div>
                            <label style={labelStyle}>Supervisor Invite Code</label>
                            <div style={{ position: 'relative' }}>
                                <KeyRound size={18} style={iconStyle} />
                                <input
                                    type="password"
                                    value={inviteCode}
                                    onChange={(e) => setInviteCode(e.target.value)}
                                    placeholder="Ilagay ang invite code"
                                    style={fieldStyle}
                                />
                            </div>
                        </div>
                    )}

                    {/* RECAPTCHA STYLE WIDGET (REGISTRATION ONLY) */}
                    {isRegister && (
                        <div style={{
                            background: '#f9f9f9',
                            border: '1px solid #d3d3d3',
                            borderRadius: '4px',
                            padding: '0.75rem 0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            color: '#222',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                        }}>
                            <div
                                onClick={handleToggleCaptcha}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}
                            >
                                <div style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {isCaptchaLoading ? (
                                        <RefreshCw size={20} className="spin" style={{ color: '#0284c7', animation: 'spin 1s linear infinite' }} />
                                    ) : isCaptchaChecked ? (
                                        <div style={{ width: '22px', height: '22px', background: '#10b981', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>✓</div>
                                    ) : (
                                        <div style={{ width: '22px', height: '22px', border: '2px solid #c1c1c1', background: '#fff', borderRadius: '3px' }} />
                                    )}
                                </div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#333' }}>I'm not a robot</span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" alt="reCAPTCHA" style={{ width: '26px', opacity: 0.8 }} />
                                <span style={{ fontSize: '0.55rem', color: '#777', marginTop: '2px' }}>reCAPTCHA</span>
                            </div>
                        </div>
                    )}

                    {/* SUBMIT BUTTON */}
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            marginTop: '0.4rem',
                            width: '100%',
                            padding: '0.85rem',
                            background: loading ? '#475569' : '#0284c7',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 4px 15px rgba(2, 132, 199, 0.4)'
                        }}
                    >
                        {loading ? (
                            isRegister ? 'Sending OTP Code...' : 'Signing in...'
                        ) : isRegister ? (
                            <><UserPlus size={18} /> Register Account</>
                        ) : (
                            <><LogIn size={18} /> Enter Dashboard</>
                        )}
                    </button>

                </form>

                {/* TOGGLE REGISTRATION / LOGIN */}
                <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.85rem', color: '#94a3b8' }}>
                    {isRegister ? (
                        <span>
                            May account ka na?{' '}
                            <button
                                type="button"
                                onClick={() => { setIsRegister(false); setError(''); setIsCaptchaChecked(false); }}
                                style={{ background: 'none', border: 'none', color: '#38bdf8', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                            >
                                Sign In
                            </button>
                        </span>
                    ) : (
                        <span>
                            Wala pang account?{' '}
                            <button
                                type="button"
                                onClick={() => { setIsRegister(true); setError(''); setIsCaptchaChecked(false); }}
                                style={{ background: 'none', border: 'none', color: '#38bdf8', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                            >
                                Register here
                            </button>
                        </span>
                    )}
                </div>

            </div>

            {/* OTP CODE MODAL */}
            {showOtpModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
                    <div style={{ background: '#0f172a', border: '1px solid rgba(34, 211, 238, 0.4)', borderRadius: '20px', padding: '2rem', width: '380px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.9)' }}>
                        <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                            <Mail size={24} />
                        </div>
                        <h3 style={{ margin: 0, color: '#fff', fontSize: '1.2rem' }}>Verify Email</h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.4rem', lineHeight: 1.5 }}>
                            Nagpadala kami ng 6-digit verification code sa <strong style={{ color: '#22d3ee' }}>{email}</strong>.
                        </p>

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', margin: '1.5rem 0' }}>
                            {otpCode.map((digit, idx) => (
                                <input
                                    key={idx}
                                    id={`otp-input-${idx}`}
                                    type="text"
                                    maxLength="1"
                                    value={digit}
                                    onChange={(e) => handleOtpChange(e.target.value, idx)}
                                    style={{ width: '40px', height: '48px', background: '#1e293b', border: '1px solid rgba(34, 211, 238, 0.4)', borderRadius: '8px', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold', textAlign: 'center', outline: 'none' }}
                                />
                            ))}
                        </div>

                        <button
                            onClick={handleFinalVerifyOtp}
                            disabled={verifyingOtp}
                            style={{ width: '100%', background: '#0891b2', border: 'none', color: '#fff', padding: '0.75rem', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(8, 145, 178, 0.4)' }}
                        >
                            {verifyingOtp ? 'Verifying Code...' : 'Verify & Activate Account'}
                        </button>

                        <button
                            type="button"
                            onClick={() => { setShowOtpModal(false); setOtpCode(['', '', '', '', '', '']); }}
                            style={{ marginTop: '0.75rem', background: 'transparent', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
