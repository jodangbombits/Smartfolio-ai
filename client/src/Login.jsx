import React, { useState, useEffect, useCallback } from 'react';
import { User, Lock, Briefcase, Mail, UserPlus, LogIn, Phone, RefreshCw, X, Eye, EyeOff, KeyRound, CheckCircle2 } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const RESEND_SECONDS = 30;
const MIN_PASSWORD = 8;

const EMPTY_OTP = ['', '', '', '', '', ''];

/* ───────────── shared styles ───────────── */
const labelStyle = { display: 'block', color: '#94a3b8', fontSize: '0.775rem', fontWeight: 600, marginBottom: '0.4rem' };
const inputStyle = { width: '100%', padding: '0.7rem 0.7rem 0.7rem 2.5rem', background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#fff', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' };
const iconStyle = { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' };
const linkBtn = { background: 'none', border: 'none', color: '#38bdf8', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 'inherit' };
const primaryBtn = (disabled) => ({ width: '100%', padding: '0.8rem', background: disabled ? '#475569' : '#0891b2', border: 'none', color: '#fff', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: disabled ? 'not-allowed' : 'pointer', boxShadow: disabled ? 'none' : '0 4px 12px rgba(8, 145, 178, 0.4)' });
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '1rem' };
const modalStyle = { background: '#0f172a', border: '1px solid rgba(34, 211, 238, 0.4)', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.9)', position: 'relative', maxHeight: '92vh', overflowY: 'auto' };
const bannerStyle = (type) => ({
    background: type === 'ok' ? '#10b98122' : '#ef444422',
    border: `1px solid ${type === 'ok' ? '#10b981' : '#ef4444'}`,
    color: type === 'ok' ? '#34d399' : '#f87171',
    padding: '0.75rem', borderRadius: '10px', fontSize: '0.825rem', marginBottom: '1rem', textAlign: 'center'
});

/* ───────────── small reusable pieces ───────────── */
function Field({ icon: Icon, label, ...props }) {
    return (
        <div>
            <label style={labelStyle}>{label}</label>
            <div style={{ position: 'relative' }}>
                <Icon size={18} style={iconStyle} />
                <input {...props} style={inputStyle} />
            </div>
        </div>
    );
}

function PasswordField({ label, value, onChange, placeholder = '••••••••', autoComplete, right = null, id }) {
    const [show, setShow] = useState(false);
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label htmlFor={id} style={{ ...labelStyle, marginBottom: 0 }}>{label}</label>
                {right}
            </div>
            <div style={{ position: 'relative' }}>
                <Lock size={18} style={iconStyle} />
                <input
                    id={id}
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    required
                    style={{ ...inputStyle, paddingRight: '2.8rem' }}
                />
                <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    title={show ? 'Hide password' : 'Show password'}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: show ? '#22d3ee' : '#64748b', cursor: 'pointer', padding: '6px', display: 'flex' }}
                >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
        </div>
    );
}

function OtpBoxes({ value, onChange, idPrefix }) {
    const focusAt = (i) => document.getElementById(`${idPrefix}-${i}`)?.focus();
    const setAt = (i, raw) => {
        const d = raw.replace(/\D/g, '').slice(-1);
        const next = [...value];
        next[i] = d;
        onChange(next);
        if (d && i < 5) focusAt(i + 1);
    };
    const onKeyDown = (e, i) => { if (e.key === 'Backspace' && !value[i] && i > 0) focusAt(i - 1); };
    const onPaste = (e) => {
        const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (!t) return;
        e.preventDefault();
        const next = [...EMPTY_OTP];
        t.split('').forEach((c, i) => { next[i] = c; });
        onChange(next);
        focusAt(Math.min(t.length, 5));
    };
    return (
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', margin: '1.25rem 0' }} onPaste={onPaste}>
            {value.map((digit, i) => (
                <input
                    key={i}
                    id={`${idPrefix}-${i}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => setAt(i, e.target.value)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    aria-label={`Digit ${i + 1}`}
                    style={{ width: '40px', height: '48px', background: '#1e293b', border: '1px solid rgba(34, 211, 238, 0.4)', borderRadius: '8px', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold', textAlign: 'center', outline: 'none' }}
                />
            ))}
        </div>
    );
}

function useCooldown() {
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        if (seconds <= 0) return undefined;
        const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [seconds]);
    const start = useCallback(() => setSeconds(RESEND_SECONDS), []);
    return [seconds, start];
}

const postJson = async (path, body) => {
    const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
};

export default function Login({ onLogin }) {
    const [isRegister, setIsRegister] = useState(false);

    // Form states
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [mobile, setMobile] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('student');
    const [inviteCode, setInviteCode] = useState('');

    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);

    // reCAPTCHA-style widget
    const [isCaptchaChecked, setIsCaptchaChecked] = useState(false);
    const [isCaptchaLoading, setIsCaptchaLoading] = useState(false);

    // Register OTP modal
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [otpCode, setOtpCode] = useState(EMPTY_OTP);
    const [otpError, setOtpError] = useState('');
    const [otpNotice, setOtpNotice] = useState('');
    const [verifyingOtp, setVerifyingOtp] = useState(false);
    const [resendingOtp, setResendingOtp] = useState(false);
    const [resendCooldown, startResendCooldown] = useCooldown();

    // Forgot password modal
    const [showForgot, setShowForgot] = useState(false);
    const [fpStep, setFpStep] = useState('email'); // 'email' | 'otp' | 'password' | 'done'
    const [fpEmail, setFpEmail] = useState('');
    const [fpCode, setFpCode] = useState(EMPTY_OTP);
    const [fpNew, setFpNew] = useState('');
    const [fpConfirm, setFpConfirm] = useState('');
    const [fpLoading, setFpLoading] = useState(false);
    const [fpError, setFpError] = useState('');
    const [fpNotice, setFpNotice] = useState('');
    const [fpCooldown, startFpCooldown] = useCooldown();

    const cleanEmail = email.trim().toLowerCase();
    const cleanFpEmail = fpEmail.trim().toLowerCase();

    /* GOOGLE SIGN-IN HANDLER (endpoint: /api/google-login) */
    const handleGoogleSuccess = async (credentialResponse) => {
        setError(''); setInfo('');
        try {
            const { ok, data } = await postJson('/api/google-login', { credential: credentialResponse.credential });
            if (ok) {
                onLogin(data.user || data);
            } else {
                setError(data.detail || 'Hindi ma-verify ang Google account mo.');
            }
        } catch (err) {
            console.error('Google login error:', err);
            setError('Hindi ma-connect sa backend server. Maaaring natutulog pa ang server, subukan ulit pagkalipas ng ilang segundo.');
        }
    };

    /* CAPTCHA */
    const handleToggleCaptcha = () => {
        if (isCaptchaChecked) { setIsCaptchaChecked(false); return; }
        setIsCaptchaLoading(true);
        setTimeout(() => { setIsCaptchaLoading(false); setIsCaptchaChecked(true); }, 800);
    };

    /* LOGIN / REGISTER SUBMIT */
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setInfo('');

        if (isRegister && !isCaptchaChecked) {
            setError('Paki-check muna ang "I\'m not a robot" CAPTCHA verification!');
            return;
        }
        if (isRegister && password.length < MIN_PASSWORD) {
            setError(`Dapat hindi bababa sa ${MIN_PASSWORD} characters ang password.`);
            return;
        }
        if (isRegister && role === 'supervisor' && !inviteCode.trim()) {
            setError('Kailangan ng Supervisor Invite Code para gumawa ng Supervisor account.');
            return;
        }

        setLoading(true);
        try {
            if (isRegister) {
                const { ok, data } = await postJson('/api/send-otp', { email: cleanEmail });
                if (ok) {
                    setOtpCode(EMPTY_OTP); setOtpError(''); setOtpNotice('');
                    startResendCooldown();
                    setShowOtpModal(true);
                } else {
                    setError(data.detail || 'Bigo sa pagpapadala ng OTP code sa email.');
                }
            } else {
                const { ok, data } = await postJson('/api/login', { email: cleanEmail, password });
                if (ok) onLogin(data.user || data);
                else setError(data.detail || 'Mali ang Email o Password!');
            }
        } catch (err) {
            console.error('Auth API error:', err);
            setError('Hindi ma-connect sa backend server.');
        } finally {
            setLoading(false);
        }
    };

    /* REGISTER OTP */
    const handleResendOtp = async () => {
        if (resendCooldown > 0 || resendingOtp) return;
        setResendingOtp(true); setOtpError(''); setOtpNotice('');
        try {
            const { ok, data } = await postJson('/api/send-otp', { email: cleanEmail });
            if (ok) {
                setOtpCode(EMPTY_OTP);
                startResendCooldown();
                setOtpNotice('Nagpadala kami ng bagong code sa email mo.');
                document.getElementById('reg-otp-0')?.focus();
            } else {
                setOtpError(data.detail || 'Bigo ang pag-resend ng code. Subukan ulit.');
            }
        } catch (err) {
            setOtpError('Hindi ma-connect sa server para mag-resend ng OTP code.');
        } finally {
            setResendingOtp(false);
        }
    };

    const handleFinalVerifyOtp = async () => {
        const fullCode = otpCode.join('').trim();
        if (fullCode.length < 6) { setOtpError('Pakilagay ang buong 6-digit code na isinend sa email mo.'); return; }

        setVerifyingOtp(true); setOtpError(''); setOtpNotice('');
        try {
            const verify = await postJson('/api/verify-otp', { email: cleanEmail, code: fullCode });
            if (!verify.ok) { setOtpError(verify.data.detail || 'Mali ang Verification Code! Subukan ulit.'); return; }

            const reg = await postJson('/api/register', {
                full_name: fullName,
                email: cleanEmail,
                contact_number: mobile,
                password,
                role,
                invite_code: role === 'supervisor' ? inviteCode.trim() : ''
            });
            if (reg.ok) {
                setShowOtpModal(false);
                setIsRegister(false);
                setPassword(''); setInviteCode(''); setRole('student');
                setOtpCode(EMPTY_OTP); setIsCaptchaChecked(false);
                setInfo('Na-create at na-verify na ang account mo. Pwede ka nang mag-login.');
            } else {
                setOtpError(`Registration error: ${reg.data.detail || 'Subukan ulit.'}`);
            }
        } catch (err) {
            setOtpError('Hindi ma-connect sa server para i-verify ang OTP code.');
        } finally {
            setVerifyingOtp(false);
        }
    };

    /* FORGOT PASSWORD */
    const openForgot = () => {
        setFpStep('email'); setFpEmail(cleanEmail); setFpCode(EMPTY_OTP);
        setFpNew(''); setFpConfirm(''); setFpError(''); setFpNotice('');
        setShowForgot(true);
    };
    const closeForgot = () => { if (!fpLoading) setShowForgot(false); };

    // STEP 1: Send OTP to Email
    const sendResetCode = async (isResend = false) => {
        if (!cleanFpEmail) { setFpError('Ilagay ang email ng account mo.'); return; }
        setFpLoading(true); setFpError(''); setFpNotice('');
        try {
            const { ok, data } = await postJson('/api/forgot-password', { email: cleanFpEmail });
            if (ok) {
                setFpCode(EMPTY_OTP);
                startFpCooldown();
                setFpStep('otp');
                setFpNotice(isResend ? 'Nagpadala kami ng bagong code sa email mo.' : 'Nagpadala kami ng 6-digit reset code sa email mo.');
            } else {
                setFpError(data.detail || 'Hindi naipadala ang code. Subukan ulit.');
            }
        } catch (err) {
            setFpError('Hindi ma-connect sa backend server. Subukan ulit.');
        } finally {
            setFpLoading(false);
        }
    };

    // STEP 2: Verify OTP Code
    const verifyResetOtp = async () => {
        const code = fpCode.join('');
        if (code.length < 6) { setFpError('Ilagay ang buong 6-digit code.'); return; }

        setFpLoading(true); setFpError(''); setFpNotice('');
        try {
            const { ok, data } = await postJson('/api/verify-otp', { email: cleanFpEmail, code });
            if (ok) {
                setFpStep('password');
                setFpNotice('Na-verify na ang code! Ilagay ang iyong bagong password.');
            } else {
                setFpError(data.detail || 'Mali o expired na ang code. Subukan ulit.');
            }
        } catch (err) {
            setFpError('Hindi ma-connect sa backend server.');
        } finally {
            setFpLoading(false);
        }
    };

    // STEP 3: Reset Password
    const submitNewPassword = async () => {
        const code = fpCode.join('');
        if (fpNew.length < MIN_PASSWORD) { setFpError(`Dapat hindi bababa sa ${MIN_PASSWORD} characters ang bagong password.`); return; }
        if (fpNew !== fpConfirm) { setFpError('Hindi magkapareho ang dalawang password.'); return; }

        setFpLoading(true); setFpError(''); setFpNotice('');
        try {
            const { ok, data } = await postJson('/api/reset-password', { email: cleanFpEmail, code, new_password: fpNew });
            if (ok) {
                setFpStep('done');
            } else {
                setFpError(data.detail || 'Bigo ang pag-reset ng password. Subukan ulit.');
            }
        } catch (err) {
            setFpError('Hindi ma-connect sa backend server.');
        } finally {
            setFpLoading(false);
        }
    };

    const backToLoginAfterReset = () => {
        setShowForgot(false);
        setIsRegister(false);
        setEmail(cleanFpEmail);
        setPassword('');
        setError('');
        setInfo('Napalitan na ang password mo. Mag-login gamit ang bagong password.');
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 50% 10%, #0f172a 0%, #070a11 100%)', fontFamily: 'Inter, sans-serif', position: 'relative', overflow: 'hidden', padding: '1rem' }}>
            <style>{'@keyframes sfspin { to { transform: rotate(360deg); } }'}</style>

            <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '400px', height: '400px', background: 'rgba(2, 132, 199, 0.15)', borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '400px', height: '400px', background: 'rgba(99, 102, 241, 0.12)', borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none' }} />

            {/* CARD */}
            <div style={{ background: '#131c2e', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', padding: '2.2rem', width: '100%', maxWidth: '420px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', zIndex: 10 }}>

                <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                    <h2 style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>⚡ SmartFolio</h2>
                    <p style={{ color: '#64748b', fontSize: '0.825rem', marginTop: '0.4rem' }}>
                        {isRegister ? 'Gumawa ng bagong account para sa OJT portal' : 'Sign in to access your OJT portal'}
                    </p>
                </div>

                {/* OFFICIAL GOOGLE LOGIN BUTTON */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
                    <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => setError('Bigo sa Google Sign-In verification.')}
                        theme="outline"
                        size="large"
                        text="continue_with"
                        shape="rectangular"
                        width="350px"
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', color: '#475569', fontSize: '0.725rem', fontWeight: 600 }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                    <span>OR {isRegister ? 'REGISTER' : 'LOGIN'} WITH EMAIL</span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                </div>

                {info && <div style={bannerStyle('ok')} role="status">{info}</div>}
                {error && <div style={bannerStyle('err')} role="alert">{error}</div>}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    {isRegister && (
                        <Field icon={User} label="Full Name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Dela Cruz" autoComplete="name" required />
                    )}

                    <Field icon={Mail} label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@example.com" autoComplete="email" required />

                    {isRegister && (
                        <Field icon={Phone} label="Mobile / Contact Number" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+63 912 345 6789" autoComplete="tel" required />
                    )}

                    <PasswordField
                        id="login-password"
                        label="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={isRegister ? 'new-password' : 'current-password'}
                        right={!isRegister && (
                            <button type="button" onClick={openForgot} style={{ ...linkBtn, fontSize: '0.75rem' }}>Forgot password?</button>
                        )}
                    />

                    {isRegister && (
                        <div>
                            <label style={labelStyle}>Register As</label>
                            <div style={{ position: 'relative' }}>
                                <Briefcase size={18} style={iconStyle} />
                                <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                                    <option value="student" style={{ background: '#1e293b', color: '#fff' }}>Student Intern</option>
                                    <option value="supervisor" style={{ background: '#1e293b', color: '#fff' }}>Supervisor (kailangan ng invite code)</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {isRegister && role === 'supervisor' && (
                        <Field icon={KeyRound} label="Supervisor Invite Code" type="password" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Ilagay ang invite code" autoComplete="off" required />
                    )}

                    {isRegister && (
                        <div style={{ background: '#f9f9f9', border: '1px solid #d3d3d3', borderRadius: '4px', padding: '0.75rem 0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#222', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                            <div onClick={handleToggleCaptcha} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
                                <div style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {isCaptchaLoading ? (
                                        <RefreshCw size={20} style={{ color: '#0284c7', animation: 'sfspin 1s linear infinite' }} />
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

                    <button
                        type="submit"
                        disabled={loading}
                        style={{ marginTop: '0.4rem', width: '100%', padding: '0.85rem', background: loading ? '#475569' : '#0284c7', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(2, 132, 199, 0.4)' }}
                    >
                        {loading ? (isRegister ? 'Sending OTP Code...' : 'Signing in...') : isRegister ? (<><UserPlus size={18} /> Register Account</>) : (<><LogIn size={18} /> Enter Dashboard</>)}
                    </button>
                </form>

                <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.85rem', color: '#94a3b8' }}>
                    {isRegister ? (
                        <span>May account ka na?{' '}
                            <button type="button" onClick={() => { setIsRegister(false); setError(''); setInfo(''); setIsCaptchaChecked(false); }} style={linkBtn}>Sign In</button>
                        </span>
                    ) : (
                        <span>Wala pang account?{' '}
                            <button type="button" onClick={() => { setIsRegister(true); setError(''); setInfo(''); setIsCaptchaChecked(false); }} style={linkBtn}>Register here</button>
                        </span>
                    )}
                </div>
            </div>

            {/* REGISTER OTP MODAL */}
            {showOtpModal && (
                <div style={{ ...overlayStyle, zIndex: 3000 }} role="dialog" aria-modal="true" aria-label="Verify email">
                    <div style={modalStyle}>
                        <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}><Mail size={24} /></div>
                        <h3 style={{ margin: 0, color: '#fff', fontSize: '1.2rem' }}>Verify Email</h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.4rem', lineHeight: 1.5 }}>
                            Nagpadala kami ng 6-digit verification code sa <strong style={{ color: '#22d3ee' }}>{cleanEmail}</strong>.
                        </p>

                        <OtpBoxes value={otpCode} onChange={setOtpCode} idPrefix="reg-otp" />

                        {otpError && <div style={bannerStyle('err')} role="alert">{otpError}</div>}
                        {otpNotice && <div style={bannerStyle('ok')} role="status">{otpNotice}</div>}

                        <button type="button" onClick={handleFinalVerifyOtp} disabled={verifyingOtp} style={primaryBtn(verifyingOtp)}>
                            {verifyingOtp ? 'Verifying Code...' : 'Verify & Activate Account'}
                        </button>

                        <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                            Hindi natanggap ang code?{' '}
                            <button type="button" onClick={handleResendOtp} disabled={resendCooldown > 0 || resendingOtp}
                                style={{ ...linkBtn, color: resendCooldown > 0 || resendingOtp ? '#64748b' : '#38bdf8', cursor: resendCooldown > 0 || resendingOtp ? 'not-allowed' : 'pointer' }}>
                                {resendingOtp ? 'Sending...' : resendCooldown > 0 ? `Resend sa ${resendCooldown}s` : 'Resend Code'}
                            </button>
                        </div>

                        <button type="button" onClick={() => setShowOtpModal(false)} disabled={verifyingOtp} style={{ marginTop: '0.6rem', background: 'none', border: 'none', color: '#64748b', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
                    </div>
                </div>
            )}

            {/* FORGOT PASSWORD MODAL */}
            {showForgot && (
                <div style={{ ...overlayStyle, zIndex: 3500 }} role="dialog" aria-modal="true" aria-label="Forgot password">
                    <div style={modalStyle}>
                        <button type="button" onClick={closeForgot} aria-label="Close" style={{ position: 'absolute', top: '14px', right: '14px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>

                        {fpStep === 'done' ? (
                            <>
                                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}><CheckCircle2 size={26} /></div>
                                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.2rem' }}>Password Updated</h3>
                                <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0.5rem 0 1.25rem', lineHeight: 1.5 }}>Napalitan na ang password ng <strong style={{ color: '#22d3ee' }}>{cleanFpEmail}</strong>.</p>
                                <button type="button" onClick={backToLoginAfterReset} style={primaryBtn(false)}>Back to Login</button>
                            </>
                        ) : (
                            <>
                                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}><KeyRound size={24} /></div>
                                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.2rem' }}>Forgot Password</h3>
                                <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0.4rem 0 1.1rem', lineHeight: 1.5 }}>
                                    {fpStep === 'email' && 'Ilagay ang email ng account mo. Magpapadala kami ng 6-digit code para makagawa ka ng bagong password.'}
                                    {fpStep === 'otp' && <>Ilagay ang 6-digit reset code na isinend sa <strong style={{ color: '#22d3ee' }}>{cleanFpEmail}</strong>.</>}
                                    {fpStep === 'password' && 'Maglagay ng iyong bagong password sa ibaba.'}
                                </p>

                                {fpError && <div style={bannerStyle('err')} role="alert">{fpError}</div>}
                                {fpNotice && <div style={bannerStyle('ok')} role="status">{fpNotice}</div>}

                                {fpStep === 'email' && (
                                    <form onSubmit={(e) => { e.preventDefault(); sendResetCode(false); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
                                        <Field icon={Mail} label="Email Address" type="email" value={fpEmail} onChange={(e) => setFpEmail(e.target.value)} placeholder="juan@example.com" autoComplete="email" required />
                                        <button type="submit" disabled={fpLoading} style={primaryBtn(fpLoading)}>{fpLoading ? 'Sending code...' : 'Send Reset Code'}</button>
                                    </form>
                                )}

                                {fpStep === 'otp' && (
                                    <div style={{ textAlign: 'center' }}>
                                        <OtpBoxes value={fpCode} onChange={setFpCode} idPrefix="fp-otp" />
                                        <button type="button" onClick={verifyResetOtp} disabled={fpLoading} style={{ ...primaryBtn(fpLoading), marginTop: '1rem' }}>
                                            {fpLoading ? 'Verifying Code...' : 'Verify Reset Code'}
                                        </button>
                                        <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                                            Hindi natanggap ang code?{' '}
                                            <button type="button" onClick={() => sendResetCode(true)} disabled={fpCooldown > 0 || fpLoading}
                                                style={{ ...linkBtn, color: fpCooldown > 0 || fpLoading ? '#64748b' : '#38bdf8', cursor: fpCooldown > 0 || fpLoading ? 'not-allowed' : 'pointer' }}>
                                                {fpCooldown > 0 ? `Resend sa ${fpCooldown}s` : 'Resend Code'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {fpStep === 'password' && (
                                    <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <PasswordField id="fp-new" label="New Password" value={fpNew} onChange={(e) => setFpNew(e.target.value)} autoComplete="new-password" />
                                        <PasswordField id="fp-confirm" label="Confirm New Password" value={fpConfirm} onChange={(e) => setFpConfirm(e.target.value)} autoComplete="new-password" />
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '-0.4rem' }}>Hindi bababa sa {MIN_PASSWORD} characters.</div>
                                        <button type="button" onClick={submitNewPassword} disabled={fpLoading} style={primaryBtn(fpLoading)}>
                                            {fpLoading ? 'Saving Password...' : 'Save New Password'}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}