
import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, Lock, Eye, EyeOff, CheckCircle, ArrowRight, ShieldCheck, KeyRound, AlertTriangle } from 'lucide-react';
import { useCRM } from '../context/CRMContext';

const Login: React.FC = () => {
  const { login, initiateRegistration, verifyRegistration, requestPasswordReset, resetPassword } = useCRM();
  const [view, setView] = useState<'login' | 'register' | 'create-password' | 'verify-code' | 'account-pending' | 'forgot-password' | 'reset-password' | 'password-created'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [urlParams, setUrlParams] = useState(new URLSearchParams(window.location.search));
  
  // Registration Data
  const [regData, setRegData] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
    confirmPassword: ''
  });

  // Login Data
  const [loginData, setLoginData] = useState({
    email: '',
    password: ''
  });

  // Reset Password Data
  const [resetData, setResetData] = useState({
    email: '',
    newPassword: '',
    confirmNewPassword: '',
    token: ''
  });

  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check for reset token on mount
  useEffect(() => {
    const token = urlParams.get('token');
    if (token) {
      setResetData(prev => ({ ...prev, token }));
      setView('reset-password');
    }
  }, [urlParams]);

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLoginData({ ...loginData, [e.target.name]: e.target.value });
    setError(null);
  };

  const handleRegChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRegData({ ...regData, [e.target.name]: e.target.value });
    setError(null);
  };

  const handleLogin = async () => {
    if (!loginData.email || !loginData.password) {
      setError('Please enter both email and password.');
      return;
    }
    setLoading(true);
    const result = await login(loginData.email, loginData.password);
    setLoading(false);
    if (!result.success) {
      setError(result.message || 'Invalid credentials.');
    }
  };

  const handleRegisterStep1 = () => {
    if (!regData.email || !regData.fullName) {
      setError("Please fill in required fields.");
      return;
    }
    setView('create-password'); // Go to password creation first to collect all data
  };

  // Called when password is set, initiates the "SMTP" email
  const handleInitiateRegistration = async () => {
    if (regData.password !== regData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    
    // Strict Password Validation
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    
    if (!passwordRegex.test(regData.password)) {
      setError("Password must contain at least 8 characters, one uppercase letter, and one number.");
      return;
    }
    
    setLoading(true);
    const success = await initiateRegistration(regData.email, regData.password, regData.fullName, regData.phone);
    setLoading(false);
    
    if (success) {
      setView('verify-code');
    } else {
      setError("User already exists or registration failed.");
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    setLoading(true);
    const result = await verifyRegistration(regData.email, verificationCode);
    setLoading(false);

    if (result.success) {
      setView('account-pending');
    } else {
      setError(result.message);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetData.email) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    await requestPasswordReset(resetData.email);
    setLoading(false);
    setSuccessMsg("If an account exists, a reset link has been sent to your email.");
  };

  const handleResetPassword = async () => {
    if (resetData.newPassword !== resetData.confirmNewPassword) {
      setError("Passwords do not match.");
      return;
    }
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(resetData.newPassword)) {
      setError("Password must contain at least 8 characters, one uppercase letter, and one number.");
      return;
    }

    setLoading(true);
    const result = await resetPassword(resetData.token, resetData.newPassword);
    setLoading(false);

    if (result.success) {
      setView('login');
      setSuccessMsg(result.message);
      // Clear token from URL
      window.history.replaceState({}, document.title, "/");
    } else {
      setError(result.message);
    }
  };

  const Header = () => (
    <div className="bg-[#0D1B2A] text-white px-6 py-4">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#F18F01] rounded-lg flex items-center justify-center">
             <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-lg">Rowan Rose Solicitors</h1>
            <p className="text-slate-400 text-xs">Secure Client Portal</p>
          </div>
        </div>
      </div>
    </div>
  );

  // --- Views ---

  if (view === 'login') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-slate-900">Welcome Back</h2>
              <p className="text-slate-500 mt-2">Sign in to access the CRM dashboard</p>
            </div>
            
            {successMsg && (
              <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded-lg flex items-center justify-center border border-green-200">
                {successMsg}
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center justify-center border border-red-200">
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type="email" name="email" value={loginData.email} onChange={handleLoginChange} className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F18F01]" placeholder="your@email.com" />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                   <label className="block text-sm font-medium text-slate-700">Password</label>
                   <button onClick={() => {setError(null); setSuccessMsg(null); setView('forgot-password');}} className="text-xs text-[#F18F01] hover:underline">Forgot Password?</button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type={showPassword ? 'text' : 'password'} name="password" value={loginData.password} onChange={handleLoginChange} className="w-full pl-11 pr-12 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F18F01]" placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button 
                onClick={handleLogin} 
                disabled={loading}
                className="w-full bg-[#0D1B2A] text-white py-3 rounded-xl font-medium hover:bg-slate-800 transition flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {loading ? 'Signing In...' : <>Sign In <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              <p className="text-slate-500 text-sm">First time here?</p>
              <button onClick={() => { setError(null); setView('register'); }} className="text-[#F18F01] font-medium hover:text-amber-700 mt-1">Create your account</button>
            </div>
          </div>
        </div>
        <div className="text-center pb-6">
           <p className="text-slate-400 text-xs">Restricted Access | Authorized Personnel Only</p>
        </div>
      </div>
    );
  }

  if (view === 'register') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-slate-900">Create Account</h2>
              <p className="text-slate-500 mt-2">Enter your details to get started</p>
            </div>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center">
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type="text" name="fullName" value={regData.fullName} onChange={handleRegChange} className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F18F01]" placeholder="John Smith" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type="email" name="email" value={regData.email} onChange={handleRegChange} className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F18F01]" placeholder="your@email.com" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Contact Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type="tel" name="phone" value={regData.phone} onChange={handleRegChange} className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F18F01]" placeholder="07123 456789" />
                </div>
              </div>
              <button onClick={handleRegisterStep1} className="w-full bg-[#0D1B2A] text-white py-3 rounded-xl font-medium hover:bg-slate-800 transition flex items-center justify-center gap-2">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-6 text-center">
              <button onClick={() => { setError(null); setView('login'); }} className="text-slate-500 text-sm hover:text-slate-700">
                Already have an account? <span className="text-[#F18F01] font-medium">Sign in</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'create-password') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-slate-900">Secure Your Account</h2>
              <p className="text-slate-500 mt-2">Choose a secure password</p>
            </div>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center">
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type={showPassword ? 'text' : 'password'} name="password" value={regData.password} onChange={handleRegChange} className="w-full pl-11 pr-12 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F18F01]" placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type="password" name="confirmPassword" value={regData.confirmPassword} onChange={handleRegChange} className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F18F01]" placeholder="••••••••" />
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
                <p className="font-medium mb-2">Password must contain:</p>
                <ul className="space-y-1">
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> At least 8 characters</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> One uppercase letter</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> One number</li>
                </ul>
              </div>
              <button 
                onClick={handleInitiateRegistration} 
                disabled={loading}
                className="w-full bg-[#0D1B2A] text-white py-3 rounded-xl font-medium hover:bg-slate-800 transition disabled:opacity-70"
              >
                 {loading ? 'Sending Code...' : 'Send Verification Code'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'verify-code') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Mail className="w-8 h-8 text-blue-600" />
            </div>
            
            <h2 className="text-2xl font-semibold text-slate-900">Verify Your Sign-In</h2>
            <p className="text-slate-500 mt-3 text-sm">
              We've sent a verification email to <span className="font-semibold text-slate-700">{regData.email}</span>.
            </p>
            <div className="bg-yellow-50 text-yellow-800 text-xs p-2 rounded mt-2 border border-yellow-200">
              The verification code will appear in a browser popup/alert.
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                {error}
              </div>
            )}

            <div className="mt-8">
              <label className="block text-sm font-medium text-slate-700 mb-2 text-left">Enter 6-Digit Code</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="text" 
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => {
                    // Only allow numbers
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setVerificationCode(val);
                    setError(null);
                  }}
                  className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F18F01] text-lg tracking-widest text-center font-mono" 
                  placeholder="000000" 
                />
              </div>
            </div>

            <button 
              onClick={handleVerifyCode} 
              disabled={loading || verificationCode.length !== 6}
              className="w-full bg-[#0D1B2A] text-white py-3 rounded-xl font-medium hover:bg-slate-800 transition mt-6 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Verify Identity'}
            </button>
            
            <p className="text-slate-400 text-sm mt-6">
              Code expires in 5 minutes. <br/>
              <button 
                onClick={handleInitiateRegistration}
                className="text-[#F18F01] hover:underline mt-1"
              >
                Resend Code
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'account-pending') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="w-8 h-8 text-yellow-600" />
            </div>
            <h2 className="text-2xl font-semibold text-slate-900">Account Pending Approval</h2>
            <p className="text-slate-500 mt-3">
              Your identity has been verified, but your account requires approval from Management before you can sign in.
            </p>
            <div className="mt-6 p-4 bg-slate-50 rounded-xl text-left border border-slate-200">
               <p className="text-xs text-slate-500">Please check back later or contact your administrator.</p>
            </div>
            <button 
              onClick={() => setView('login')}
              className="mt-6 text-[#F18F01] font-medium hover:underline"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'forgot-password') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-2">Reset Password</h2>
            <p className="text-slate-500 mb-6 text-sm">Enter your email to receive a password reset link.</p>
            
            {successMsg ? (
               <div className="p-4 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200 mb-6">
                  {successMsg}
               </div>
            ) : (
               <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input 
                        type="email" 
                        value={resetData.email} 
                        onChange={(e) => setResetData({...resetData, email: e.target.value})} 
                        className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F18F01]" 
                        placeholder="your@email.com" 
                      />
                    </div>
                  </div>
                  {error && <p className="text-red-500 text-sm">{error}</p>}
                  <button 
                    onClick={handleForgotPassword} 
                    disabled={loading}
                    className="w-full bg-[#0D1B2A] text-white py-3 rounded-xl font-medium hover:bg-slate-800 transition disabled:opacity-70"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
               </div>
            )}
            
            <button onClick={() => setView('login')} className="mt-6 w-full text-center text-slate-500 text-sm hover:text-slate-700">
               Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'reset-password') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-2">Set New Password</h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type="password" value={resetData.newPassword} onChange={(e) => setResetData({...resetData, newPassword: e.target.value})} className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F18F01]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type="password" value={resetData.confirmNewPassword} onChange={(e) => setResetData({...resetData, confirmNewPassword: e.target.value})} className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F18F01]" />
                </div>
              </div>
              
              <button 
                onClick={handleResetPassword} 
                disabled={loading}
                className="w-full bg-[#0D1B2A] text-white py-3 rounded-xl font-medium hover:bg-slate-800 transition disabled:opacity-70"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default Login;
