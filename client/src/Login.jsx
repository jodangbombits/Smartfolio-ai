import React, { useState, useEffect, useRef } from 'react';
import { User, Lock, Briefcase, Mail, UserPlus, LogIn, Phone, KeyRound, RefreshCw, Eye, EyeOff, ArrowLeft } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

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
const linkBtn = { background: 'none', border: 'none', color: '#38bdf8', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 'inherit' };
const primaryBtn = (disabled) => ({
    marginTop: '0.4rem', width: '100%', padding: '0.85rem',
    background: disabled ? '#475569' : '#0284c7', color: '#fff', border: 'none', borderRadius: '10px',
    fontWeight: 700, fontSize: '0.95rem', cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
    boxShadow: '0 4px 15px rgba(2, 132, 199, 0.4)'
});

function PasswordField({ id, label, value, onChange, placeholder = '••••••••', autoComplete, show, onToggle }) {
    return (
        <div>
            <label htmlFor={id} style={labelStyle}>{label}</label>
            <div style={{ position: 'relative' }}>
                <Lock size={18} style={iconStyle} />
                <input
                    id={id} name={id}
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    required
                    style={{ ...fieldStyle, paddingRight: '2.6rem' }}
                />
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 6, display: 'flex' }}
                >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
        </div>
    );
}

export default function Login({ onLogin }) {
    const [isRegister, setIsRegister] = useState(false);

    // Form States
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [mobile, setMobile] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [role, setRole] = useState('student');
    const [inviteCode, setInviteCode] = useState('');

    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);

    // reCAPTCHA States
    const [isCaptchaChecked, setIsCaptchaChecked] = useState(false);
    const [isCaptchaLoading, setIsCaptchaLoading] = useState(false);

    // OTP Modal States
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
    const [verifyingOtp, setVerifyingOtp] = useState(false);

    // Forgot Password States
    const [forgotMode, setForgotMode] = useState(false);
    const [forgotStep, setForgotStep] = useState(1);
    const [resetCode, setResetCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNew, setShowNew] = useState(false);

    /* Google Sign-In Script & Button Rendering */
    const googleBtnRef = useRef(null);
    const onLoginRef = useRef(onLogin);
    onLoginRef.current = onLogin;

    useEffect(() => {
        if (!GOOGLE_CLIENT_ID || forgotMode || !googleBtnRef.current) return;
        let cancelled = false;

        const handleCredential = async (resp) => {
            setError(''); setInfo(''); setLoading(true);
            try {
                const res = await fetch(`${API_BASE_URL}/api/google-login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ credential: resp.credential }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.user?.id) onLoginRef.current(data.user);
                else setError(data.detail || 'Hindi nakapag-sign in gamit ang Google.');
            } catch (err) {
                console.error('Google login error:', err);
                setError('Hindi ma-connect sa backend server. Subukan ulit.');
            } finally { setLoading(false); }
        };

        const init = () => {
            if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return;
            window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredential });
            googleBtnRef.current.innerHTML = '';
            window.google.accounts.id.renderButton(googleBtnRef.current, {
                theme: 'outline', size: 'large', width: 348, text: 'continue_with', shape: 'rectangular'
            });
        };

        let script = document.getElementById('gsi-script');
        if (window.google?.accounts?.id) {
            init();
        } else {
            if (!script) {
                script = document.createElement('script');
                script.id = 'gsi-script';
                script.src = 'https://accounts.google.com/gsi/client';
                script.async = true; script.defer = true;
                document.head.appendChild(script);
            }
            script.addEventListener('load', init);
        }
        return () => { cancelled = true; if (script) script.removeEventListener('load', init); };
    }, [forgotMode, isRegister]);

    /* Captcha Handler */
    const handleToggleCaptcha = () => {
        if (isCaptchaChecked) { setIsCaptchaChecked(false); return; }
        setIsCaptchaLoading(true);
        setTimeout(() => { setIsCaptchaLoading(false); setIsCaptchaChecked(true); }, 800);
    };

    /* Submit Handler (Login & Register) */
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setInfo('');

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
                const response = await fetch(`${API_BASE_URL}/api/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                });
                const data = await response.json();
                if (response.ok) setShowOtpModal(true);
                else setError(data.detail || 'Bigo sa pagpapadala ng OTP code sa email.');
            } catch (err) {
                console.error('OTP API Error:', err);
                setError('Hindi ma-connect sa backend server. Siguraduhing tumatakbo ang FastAPI.');
            } finally { setLoading(false); }
        } else {
            try {
                const response = await fetch(`${API_BASE_URL}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });
                let data = {};
                try { data = await response.json(); } catch { data = {}; }

                if (response.ok) {
                    const loggedUser = data.user || data;
                    if (!loggedUser || !loggedUser.id) setError('Walang user ID na ibinalik ng server. Subukan ulit.');
                    else onLogin(loggedUser);
                } else {
                    setError(data.detail || 'Mali ang Email o Password!');
                }
            } catch (err) {
                console.error('Login API Error:', err);
                setError('Hindi ma-connect sa backend server. Siguraduhing tumatakbo ang FastAPI.');
            } finally { setLoading(false); }
        }
    };

    const handleOtpChange = (val, index) => {
        if (val.length > 1) return;
        const next = [...otpCode];
        next[index] = val;
        setOtpCode(next);
        if (val && index < 5) document.getElementById(`otp-input-${index + 1}`)?.focus();
    };

    const handleFinalVerifyOtp = async () => {
        const fullCode = otpCode.join('').trim();
        if (fullCode.length < 6) {
            alert('⚠️ Pakilagay muna ang buong 6-digit verification code na isinend sa email mo!');
            return;
        }
        setVerifyingOtp(true);
        try {
            const verifyRes = await fetch(`${API_BASE_URL}/api/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code: fullCode }),
            });
            const verifyData = await verifyRes.json();

            if (verifyRes.ok) {
                const regRes = await fetch(`${API_BASE_URL}/api/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        full_name: fullName, email, contact_number: mobile, password, role,
                        invite_code: role === 'supervisor' ? inviteCode.trim() : ''
                    }),
                });
                if (regRes.ok) {
                    setShowOtpModal(false);
                    alert('✓ Account successfully created and verified! Pwede ka nang mag-login.');
                    setIsRegister(false); setPassword(''); setInviteCode(''); setRole('student');
                    setOtpCode(['', '', '', '', '', '']); setIsCaptchaChecked(false);
                } else {
                    const regData = await regRes.json().catch(() => ({}));
                    setShowOtpModal(false);
                    setOtpCode(['', '', '', '', '', '']);
                    setError(regData.detail || 'Hindi na-register ang account.');
                }
            } else {
                alert(`❌ ${verifyData.detail || 'Mali ang Verification Code! Subukan ulit.'}`);
            }
        } catch {
            alert('⚠️ Hindi ma-connect sa server para i-verify ang OTP code.');
        } finally { setVerifyingOtp(false); }
    };

    /* Forgot Password Handlers */
    const openForgot = () => {
        setForgotMode(true); setForgotStep(1); setError(''); setInfo('');
        setResetCode(''); setNewPassword(''); setConfirmPassword('');
    };
    const closeForgot = () => { setForgotMode(false); setError(''); setInfo(''); };

    const handleSendReset = async (e) => {
        e.preventDefault();
        setError(''); setInfo('');
        if (!email.trim()) { setError('Ilagay ang email ng account mo.'); return; }
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setForgotStep(2);
                setInfo(data.message || 'Nagpadala kami ng reset code kung may account ang email na ito.');
            } else setError(data.detail || 'Hindi maipadala ang reset code.');
        } catch {
            setError('Hindi ma-connect sa backend server. Subukan ulit.');
        } finally { setLoading(false); }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError(''); setInfo('');
        if (resetCode.trim().length < 6) { setError('Ilagay ang 6-digit code na natanggap mo sa email.'); return; }
        if (newPassword.length < 6) { setError('Dapat hindi bababa sa 6 na character ang bagong password.'); return; }
        if (newPassword !== confirmPassword) { setError('Hindi magkapareho ang dalawang password.'); return; }
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code: resetCode.trim(), new_password: newPassword }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setForgotMode(false); setForgotStep(1);
                setPassword(''); setResetCode(''); setNewPassword(''); setConfirmPassword('');
                setInfo('✓ Na-update na ang password mo. Pwede ka nang mag-login.');
            } else setError(data.detail || 'Hindi na-update ang password.');
        } catch {
            setError('Hindi ma-connect sa backend server. Subukan ulit.');
        } finally { setLoading(false); }
    };

    const msgBox = (text, ok) => (
        <div style={{
            background: ok ? '#10b98122' : '#ef444422', border: `1px solid ${ok ? '#10b981' : '#ef4444'}`,
            color: ok ? '#6ee7b7' : '#f87171', padding: '0.75rem', borderRadius: '10px',
            fontSize: '0.825rem', marginBottom: '1rem', textAlign: 'center'
        }}>{text}</div>
    );

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 50% 10%, #0f172a 0%, #070a11 100%)',
            fontFamily: 'Inter, sans-serif', position: 'relative', overflow: 'hidden'
        }}>
            <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '400px', height: '400px', background: 'rgba(2, 132, 199, 0.15)', borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '400px', height: '400px', background: 'rgba(99, 102, 241, 0.12)', borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none' }} />

            <div style={{
                background: '#131c2e', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px',
                padding: '2.2rem', width: '100%', maxWidth: '420px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', zIndex: 10
            }}>
                <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                    <h2 style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        ⚡ SmartFolio
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '0.825rem', marginTop: '0.4rem' }}>
                        {forgotMode ? 'I-reset ang password mo' : isRegister ? 'Gumawa ng bagong account para sa OJT portal' : 'Sign in to access your OJT portal'}
                    </p>
                </div>

                {error && msgBox(error, false)}
                {info && msgBox(info, true)}

                {/* FORGOT PASSWORD FORM */}
                {forgotMode ? (
                    <>
                        {forgotStep === 1 ? (
                            <form onSubmit={handleSendReset} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <p style={{ color: '#94a3b8', fontSize: '0.825rem', margin: 0, lineHeight: 1.5 }}>
                                    Ilagay ang email ng account mo. Magpapadala kami ng 6-digit code para makapagtakda ka ng bagong password.
                                </p>
                                <div>
                                    <label htmlFor="fp-email" style={labelStyle}>Email Address</label>
                                    <div style={{ position: 'relative' }}>
                                        <Mail size={18} style={iconStyle} />
                                        <input id="fp-email" name="email" type="email" autoComplete="email" value={email}
                                            onChange={(e) => setEmail(e.target.value)} placeholder="juan@example.com" required style={fieldStyle} />
                                    </div>
                                </div>
                                <button type="submit" disabled={loading} style={primaryBtn(loading)}>
                                    {loading ? 'Sending code...' : <><Mail size={18} /> Send reset code</>}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label htmlFor="fp-code" style={labelStyle}>6-digit reset code</label>
                                    <div style={{ position: 'relative' }}>
                                        <KeyRound size={18} style={iconStyle} />
                                        <input id="fp-code" name="code" type="text" inputMode="numeric" maxLength={6} autoComplete="one-time-code"
                                            value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                                            placeholder="123456" required style={{ ...fieldStyle, letterSpacing: '0.3em' }} />
                                    </div>
                                </div>
                                <PasswordField id="fp-new" label="Bagong password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                                    autoComplete="new-password" show={showNew} onToggle={() => setShowNew(v => !v)} />
                                <PasswordField id="fp-confirm" label="Ulitin ang bagong password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                    autoComplete="new-password" show={showNew} onToggle={() => setShowNew(v => !v)} />
                                <button type="submit" disabled={loading} style={primaryBtn(loading)}>
                                    {loading ? 'Updating...' : <><Lock size={18} /> Reset password</>}
                                </button>
                                <button type="button" onClick={() => { setForgotStep(1); setError(''); setInfo(''); }} style={{ ...linkBtn, fontSize: '0.8rem', textAlign: 'center' }}>
                                    Hindi dumating ang code? Magpadala ulit
                                </button>
                            </form>
                        )}
                        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.85rem' }}>
                            <button type="button" onClick={closeForgot} style={{ ...linkBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <ArrowLeft size={14} /> Bumalik sa Sign In
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {/* GOOGLE SIGN IN BUTTON CONTAINER */}
                        {GOOGLE_CLIENT_ID ? (
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem', minHeight: 44 }}>
                                <div ref={googleBtnRef} />
                            </div>
                        ) : (
                            <button type="button" disabled style={{
                                width: '100%', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '0.7rem',
                                color: '#1e293b', fontWeight: 600, fontSize: '0.85rem', opacity: 0.5, cursor: 'not-allowed', marginBottom: '1.25rem'
                            }}>
                                Google Sign-In (hindi pa naka-configure)
                            </button>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', color: '#475569', fontSize: '0.725rem', fontWeight: 600 }}>
                            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                            <span>OR {isRegister ? 'REGISTER' : 'LOGIN'} WITH EMAIL</span>
                            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                        </div>

                        {/* LOGIN / REGISTER FORM */}
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {isRegister && (
                                <div>
                                    <label htmlFor="full-name" style={labelStyle}>Full Name</label>
                                    <div style={{ position: 'relative' }}>
                                        <User size={18} style={iconStyle} />
                                        <input id="full-name" name="full_name" type="text" autoComplete="name" value={fullName}
                                            onChange={(e) => setFullName(e.target.value)} placeholder="Juan Dela Cruz" required style={fieldStyle} />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label htmlFor="email" style={labelStyle}>Email Address</label>
                                <div style={{ position: 'relative' }}>
                                    <Mail size={18} style={iconStyle} />
                                    <input id="email" name="email" type="email" autoComplete="email" value={email}
                                        onChange={(e) => setEmail(e.target.value)} placeholder="juan@example.com" required style={fieldStyle} />
                                </div>
                            </div>

                            {isRegister && (
                                <div>
                                    <label htmlFor="mobile" style={labelStyle}>Mobile / Contact Number</label>
                                    <div style={{ position: 'relative' }}>
                                        <Phone size={18} style={iconStyle} />
                                        <input id="mobile" name="mobile" type="tel" autoComplete="tel" value={mobile}
                                            onChange={(e) => setMobile(e.target.value)} placeholder="+63 912 345 6789" required style={fieldStyle} />
                                    </div>
                                </div>
                            )}

                            <div>
                                <PasswordField id="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)}
                                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                                    show={showPassword} onToggle={() => setShowPassword(v => !v)} />
                                {!isRegister && (
                                    <div style={{ textAlign: 'right', marginTop: '0.45rem', fontSize: '0.78rem' }}>
                                        <button type="button" onClick={openForgot} style={linkBtn}>Forgot password?</button>
                                    </div>
                                )}
                            </div>

                            {isRegister && (
                                <div>
                                    <label htmlFor="role" style={labelStyle}>Register As</label>
                                    <div style={{ position: 'relative' }}>
                                        <Briefcase size={18} style={iconStyle} />
                                        <select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                                            <option value="student" style={{ background: '#1e293b', color: '#fff' }}>Student Intern</option>
                                            <option value="supervisor" style={{ background: '#1e293b', color: '#fff' }}>Supervisor (kailangan ng invite code)</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {isRegister && role === 'supervisor' && (
                                <div>
                                    <label htmlFor="invite" style={labelStyle}>Supervisor Invite Code</label>
                                    <div style={{ position: 'relative' }}>
                                        <KeyRound size={18} style={iconStyle} />
                                        <input id="invite" name="invite_code" type="password" autoComplete="off" value={inviteCode}
                                            onChange={(e) => setInviteCode(e.target.value)} placeholder="Ilagay ang invite code" style={fieldStyle} />
                                    </div>
                                </div>
                            )}

                            {isRegister && (
                                <div style={{ background: '#f9f9f9', border: '1px solid #d3d3d3', borderRadius: '4px', padding: '0.75rem 0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#222', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                                    <div onClick={handleToggleCaptcha} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
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

                            <button type="submit" disabled={loading} style={primaryBtn(loading)}>
                                {loading ? (
                                    isRegister ? 'Sending OTP Code...' : 'Signing in...'
                                ) : isRegister ? (
                                    <><UserPlus size={18} /> Register Account</>
                                ) : (
                                    <><LogIn size={18} /> Enter Dashboard</>
                                )}
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
                    </>
                )}
            </div>

            {/* OTP CODE MODAL */}
            {showOtpModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
                    <div style={{ background: '#0f172a', border: '1px solid rgba(34, 211, 238, 0.4)', borderRadius: '20px', padding: '2rem', width: '380px', maxWidth: '92vw', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.9)' }}>
                        <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                            <Mail size={24} />
                        </div>
                        <h3 style={{ margin: 0, color: '#fff', fontSize: '1.2rem' }}>Verify Email</h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.4rem', lineHeight: 1.5 }}>
                            Nagpadala kami ng 6-digit verification code sa <strong style={{ color: '#22d3ee' }}>{email}</strong>.
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', margin: '1.5rem 0' }}>
                            {otpCode.map((digit, idx) => (
                                <input key={idx} id={`otp-input-${idx}`} name={`otp-${idx}`} aria-label={`OTP digit ${idx + 1}`} type="text" maxLength="1" value={digit}
                                    onChange={(e) => handleOtpChange(e.target.value, idx)}
                                    style={{ width: '40px', height: '48px', background: '#1e293b', border: '1px solid rgba(34, 211, 238, 0.4)', borderRadius: '8px', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold', textAlign: 'center', outline: 'none' }} />
                            ))}
                        </div>
                        <button onClick={handleFinalVerifyOtp} disabled={verifyingOtp}
                            style={{ width: '100%', background: '#0891b2', border: 'none', color: '#fff', padding: '0.75rem', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(8, 145, 178, 0.4)' }}>
                            {verifyingOtp ? 'Verifying Code...' : 'Verify & Activate Account'}
                        </button>
                        <button type="button" onClick={() => { setShowOtpModal(false); setOtpCode(['', '', '', '', '', '']); }}
                            style={{ marginTop: '0.75rem', background: 'transparent', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer' }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}