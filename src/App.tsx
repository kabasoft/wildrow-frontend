import { useEffect, useRef, useState } from 'react';
import {
  Phone, ShieldCheck, TrendingUp, ArrowUpRight, ArrowDownRight,
  Home, PlusCircle, History, User, CheckCircle2, Smartphone, Lock,
  ChevronRight, ChevronLeft, X, Info,
} from 'lucide-react';
import { api, getToken, setToken, clearToken, ApiError } from './api/client';
import type { ActivePool, MnoNetwork, Transaction, UserProfile, WalletBalance } from './types';

type Screen = 'login' | 'otp' | 'kyc' | 'app';
type Tab = 'home' | 'invest' | 'history' | 'profile';
type ModalKind = null | 'topup' | 'withdraw';
type FlowStep = 'amount' | 'waiting' | 'processing' | 'success' | 'error';

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-ZM', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(getToken() ? 'app' : 'login');
  const [error, setError] = useState('');

  // --- auth state ---
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [nrc, setNrc] = useState('');
  const [network, setNetwork] = useState<MnoNetwork>('MTN');

  // --- app data ---
  const [tab, setTab] = useState<Tab>('home');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [pool, setPool] = useState<ActivePool | null>(null);

  // --- top-up / withdraw modal ---
  const [modal, setModal] = useState<ModalKind>(null);
  const [flowStep, setFlowStep] = useState<FlowStep>('amount');
  const [amount, setAmount] = useState(100);
  const [txRef, setTxRef] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (screen === 'app') void loadAppData();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  async function loadAppData() {
    try {
      const [p, b, t, pl] = await Promise.all([
        api.getProfile() as Promise<UserProfile>,
        api.getBalance() as Promise<WalletBalance>,
        api.getTransactions() as Promise<Transaction[]>,
        api.getActivePool() as Promise<ActivePool>,
      ]);
      setProfile(p);
      setBalance(b);
      setTxs(t);
      setPool(pl);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearToken();
        setScreen('login');
      }
    }
  }

  async function handleRequestOtp() {
    setError('');
    try {
      const res = await api.requestOtp(phone);
      setDevCode(res.devCode);
      setScreen('otp');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send OTP');
    }
  }

  async function handleVerifyOtp() {
    setError('');
    try {
      const res = await api.verifyOtp(phone, otp.join(''));
      setToken(res.accessToken);
      const me = (await api.getProfile()) as UserProfile;
      setProfile(me);
      setScreen(me.kycTier === 'UNVERIFIED' ? 'kyc' : 'app');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code');
    }
  }

  async function handleSubmitKyc() {
    setError('');
    try {
      await api.submitTierOneKyc(nrc, network);
      setScreen('app');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    }
  }

  function openTopup() {
    setModal('topup');
    setFlowStep('amount');
    setAmount(100);
    setError('');
  }
  function openWithdraw() {
    setModal('withdraw');
    setFlowStep('amount');
    setAmount(100);
    setError('');
  }
  function closeModal() {
    stopPolling();
    setModal(null);
  }
  function stopPolling() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }

  async function confirmTopup() {
    if (!profile) return;
    setFlowStep('waiting');
    try {
      const res: any = await api.createCharge({
        amount,
        currency: 'ZMW',
        email: `${profile.phoneNumber}@wildrow.net`,
        network,
        phone_number: profile.phoneNumber,
        fullname: profile.fullName ?? 'Wildrow Investor',
        meta: {
          tier_kyc_status: profile.kycTier,
          national_registration_number: nrc,
          fund_code: 'WR_RETAIL_MMF',
        },
      });
      const ref = res.data.tx_ref as string;
      setTxRef(ref);
      beginPolling(ref);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payment');
      setFlowStep('error');
    }
  }

  function beginPolling(ref: string) {
    setFlowStep('processing');
    pollRef.current = window.setInterval(async () => {
      const { status } = await api.getChargeStatus(ref);
      if (status === 'SUCCESSFUL') {
        stopPolling();
        await loadAppData();
        setFlowStep('success');
      } else if (status === 'FAILED' || status === 'EXPIRED') {
        stopPolling();
        setError('Payment was not authorized');
        setFlowStep('error');
      }
    }, 1500);
  }

  async function confirmWithdraw() {
    setFlowStep('processing');
    try {
      await api.withdraw(amount);
      await loadAppData();
      setFlowStep('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Withdrawal failed');
      setFlowStep('error');
    }
  }

  function logout() {
    clearToken();
    setProfile(null);
    setScreen('login');
  }

  const otpFilled = otp.every((d) => d !== '');

  return (
    <div className="wr-app">
      {screen === 'login' && (
        <div className="wr-screen">
          <div className="wr-pad" style={{ paddingTop: 36 }}>
            <span className="wr-eyebrow">Wildrow · Digital MMF</span>
            <h1 className="wr-h1">
              Government
              <br />
              treasury bills,
              <br />
              from K100.
            </h1>
            <p className="wr-sub">No paperwork, no K30,000 minimum. Verify with the mobile wallet you already use.</p>
            {error && <div className="wr-error">{error}</div>}
            <div className="wr-field">
              <Phone size={18} color="#5B6760" />
              <input placeholder="260 9X XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" />
            </div>
            <button className="wr-btn wr-btn-primary" disabled={phone.length < 9} onClick={handleRequestOtp}>
              Continue <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {screen === 'otp' && (
        <div className="wr-screen">
          <div className="wr-pad" style={{ paddingTop: 30 }}>
            <button className="wr-back" onClick={() => setScreen('login')}>
              <ChevronLeft size={20} />
            </button>
            <span className="wr-eyebrow">Step 1 of 2</span>
            <h1 className="wr-h1" style={{ fontSize: 24 }}>Enter the code we sent</h1>
            <p className="wr-sub">A 4-digit code was sent to {phone} via SMS.{devCode ? ` (dev: ${devCode})` : ''}</p>
            {error && <div className="wr-error">{error}</div>}
            <div className="wr-otp-row">
              {otp.map((d, i) => (
                <div key={i} className={`wr-otp-box ${d ? 'filled' : ''}`}>
                  <input
                    maxLength={1}
                    value={d}
                    onChange={(e) => {
                      if (!/^\d?$/.test(e.target.value)) return;
                      const next = [...otp];
                      next[i] = e.target.value;
                      setOtp(next);
                    }}
                  />
                </div>
              ))}
            </div>
            <button className="wr-btn wr-btn-primary" disabled={!otpFilled} onClick={handleVerifyOtp}>
              Verify
            </button>
          </div>
        </div>
      )}

      {screen === 'kyc' && (
        <div className="wr-screen">
          <div className="wr-pad" style={{ paddingTop: 30 }}>
            <button className="wr-back" onClick={() => setScreen('otp')}>
              <ChevronLeft size={20} />
            </button>
            <span className="wr-eyebrow">Step 2 of 2</span>
            <h1 className="wr-h1" style={{ fontSize: 24 }}>Tier 1 verification</h1>
            <p className="wr-sub">We match your NRC against your mobile money profile — no documents to upload.</p>
            {error && <div className="wr-error">{error}</div>}
            <div className="wr-field">
              <ShieldCheck size={18} color="#5B6760" />
              <input placeholder="NRC number, e.g. 123456/11/1" value={nrc} onChange={(e) => setNrc(e.target.value)} />
            </div>
            <div className="wr-chip-row">
              {(['MTN', 'AIRTEL', 'ZAMTEL'] as MnoNetwork[]).map((n) => (
                <button key={n} className={`wr-chip ${network === n ? 'active' : ''}`} onClick={() => setNetwork(n)}>
                  {n}
                </button>
              ))}
            </div>
            <button className="wr-btn wr-btn-primary" disabled={nrc.length < 7} onClick={handleSubmitKyc}>
              Fund my account <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {screen === 'app' && profile && (
        <>
          <div className="wr-screen">
            {tab === 'home' && (
              <div className="wr-pad">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <span className="wr-eyebrow">Welcome back</span>
                    <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 600, fontSize: 19 }}>
                      {profile.fullName ?? profile.phoneNumber}
                    </div>
                  </div>
                  <div className="wr-tag">
                    <ShieldCheck size={12} /> {profile.kycTier === 'TIER_1_VERIFIED' ? 'Tier 1' : profile.kycTier}
                  </div>
                </div>

                <div className="wr-banner">
                  <span className="wr-balance-label">Total wallet balance</span>
                  <div className="wr-balance">K{fmt(balance?.totalBalanceZmw ?? 0)}</div>
                  <div className="wr-yieldline">
                    <TrendingUp size={13} /> {pool ? `${(Number(pool.nominalRateApy) * 100).toFixed(1)}%` : '—'} gross ·{' '}
                    {pool?.tenorDays ?? 364}-day T-Bill pool
                  </div>
                  <div className="wr-rowbtns">
                    <button className="wr-btn wr-btn-dark" onClick={openTopup}>
                      <PlusCircle size={15} /> Top up
                    </button>
                    <button
                      className="wr-btn wr-btn-ghost"
                      style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}
                      onClick={openWithdraw}
                    >
                      <ArrowUpRight size={15} /> Withdraw
                    </button>
                  </div>
                </div>

                <div className="wr-section-title">Recent activity</div>
                <div className="wr-card">
                  {txs.length === 0 && <div style={{ fontSize: 13, color: 'var(--slate)' }}>No activity yet — top up to get started.</div>}
                  {txs.slice(0, 6).map((t) => (
                    <div className="wr-tx-row" key={t.id}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div className="wr-icon-chip" style={{ background: t.type === 'WITHDRAWAL' ? '#FBEAE5' : '#EAF3ED' }}>
                          {t.type === 'WITHDRAWAL' ? <ArrowUpRight size={15} color="#B3492F" /> : <ArrowDownRight size={15} color="#3F7858" />}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{t.type.replace('_', ' ')}</div>
                          <div style={{ fontSize: 11, color: 'var(--slate)' }}>{new Date(t.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                      <div className={t.type === 'WITHDRAWAL' ? 'wr-amt-neg' : 'wr-amt-pos'}>
                        {t.type === 'WITHDRAWAL' ? '-' : '+'}K{fmt(t.amountZmw)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'invest' && (
              <div className="wr-pad">
                <span className="wr-eyebrow">Grow your pool</span>
                <h1 className="wr-h1" style={{ fontSize: 22 }}>Add to your T-Bill pool</h1>
                <p className="wr-sub">Every K100 buys one micro-unit at today's NAV.</p>
                <button className="wr-btn wr-btn-primary" onClick={openTopup}>
                  Top up now <ChevronRight size={16} />
                </button>
                {pool && (
                  <div className="wr-card" style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--slate)' }}>
                      Current lot {pool.isinOrAuctionId}: {pool.unitsRemaining} of {pool.totalUnits} K100 micro-units remaining.
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'history' && (
              <div className="wr-pad">
                <span className="wr-eyebrow">Ledger</span>
                <h1 className="wr-h1" style={{ fontSize: 22 }}>All activity</h1>
                <div className="wr-card">
                  {txs.map((t) => (
                    <div className="wr-tx-row" key={t.id}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{t.type.replace('_', ' ')}</div>
                        <div style={{ fontSize: 11, color: 'var(--slate)' }}>{new Date(t.createdAt).toLocaleString()}</div>
                      </div>
                      <div className={t.type === 'WITHDRAWAL' ? 'wr-amt-neg' : 'wr-amt-pos'}>
                        {t.type === 'WITHDRAWAL' ? '-' : '+'}K{fmt(t.amountZmw)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'profile' && (
              <div className="wr-pad">
                <span className="wr-eyebrow">Account</span>
                <h1 className="wr-h1" style={{ fontSize: 22 }}>{profile.fullName ?? 'Investor'}</h1>
                <div className="wr-card" style={{ marginBottom: 12 }}>
                  <div className="wr-tx-row">
                    <span style={{ fontSize: 13, color: 'var(--slate)' }}>Phone</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{profile.phoneNumber}</span>
                  </div>
                  <div className="wr-tx-row">
                    <span style={{ fontSize: 13, color: 'var(--slate)' }}>KYC tier</span>
                    <span className="wr-tag">
                      <ShieldCheck size={12} /> {profile.kycTier}
                    </span>
                  </div>
                </div>
                <button className="wr-btn wr-btn-ghost" onClick={logout}>
                  Log out
                </button>
              </div>
            )}
          </div>

          <div className="wr-nav">
            <button className={`wr-nav-item ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}>
              <Home size={19} />
              Home
            </button>
            <button className={`wr-nav-item ${tab === 'invest' ? 'active' : ''}`} onClick={() => setTab('invest')}>
              <PlusCircle size={19} />
              Invest
            </button>
            <button className={`wr-nav-item ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
              <History size={19} />
              History
            </button>
            <button className={`wr-nav-item ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>
              <User size={19} />
              Profile
            </button>
          </div>

          {modal && (
            <div className="wr-overlay">
              <div className="wr-sheet">
                {flowStep === 'amount' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <h1 className="wr-h1" style={{ fontSize: 21, margin: 0 }}>
                        {modal === 'topup' ? 'Top up' : 'Withdraw'}
                      </h1>
                      <button className="wr-back" onClick={closeModal}>
                        <X size={20} />
                      </button>
                    </div>
                    <p className="wr-sub">
                      {modal === 'topup'
                        ? 'Choose an amount — paid via MNO mobile money.'
                        : `Available: K${fmt(balance?.totalBalanceZmw ?? 0)}. Lands in your wallet within minutes.`}
                    </p>
                    <div className="wr-chip-row">
                      {[100, 500, 1000, 2000].map((v) => (
                        <button key={v} className={`wr-chip ${amount === v ? 'active' : ''}`} onClick={() => setAmount(v)}>
                          K{v}
                        </button>
                      ))}
                    </div>
                    <div className="wr-field">
                      <span style={{ color: 'var(--slate)', fontFamily: 'IBM Plex Mono, monospace' }}>K</span>
                      <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
                    </div>
                    <button
                      className="wr-btn wr-btn-primary"
                      disabled={amount < 100 || (modal === 'withdraw' && amount > (balance?.totalBalanceZmw ?? 0))}
                      onClick={modal === 'topup' ? confirmTopup : confirmWithdraw}
                    >
                      {modal === 'topup' ? `Pay K${fmt(amount, 0)} via mobile money` : `Withdraw K${fmt(amount, 0)}`}
                    </button>
                  </>
                )}

                {flowStep === 'waiting' && modal === 'topup' && (
                  <div style={{ textAlign: 'center' }}>
                    <div className="wr-spinner" />
                    <p style={{ fontSize: 13, color: 'var(--slate)' }}>Sending payment request to {network}…</p>
                  </div>
                )}

                {flowStep === 'processing' && (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <Smartphone size={26} style={{ marginBottom: 8 }} />
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Check your phone</div>
                    <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: '8px 0 14px' }}>
                      <Lock size={12} style={{ verticalAlign: '-1px' }} /> Enter your mobile money PIN to authorize K{fmt(amount, 0)}
                    </p>
                    <div className="wr-spinner" />
                    <p style={{ fontSize: 12, color: 'var(--slate)' }}>Waiting for MNO confirmation…</p>
                    {txRef && (
                      <p style={{ fontSize: 10.5, color: '#9CA69E' }}>
                        <Info size={10} style={{ verticalAlign: '-1px' }} /> ref {txRef}
                      </p>
                    )}
                  </div>
                )}

                {flowStep === 'success' && (
                  <div style={{ textAlign: 'center' }}>
                    <div className="wr-success-ring">
                      <CheckCircle2 size={36} color="#3F7858" />
                    </div>
                    <h1 className="wr-h1" style={{ fontSize: 21 }}>
                      {modal === 'topup' ? `K${fmt(amount, 0)} invested` : `K${fmt(amount, 0)} on its way`}
                    </h1>
                    <p className="wr-sub">New balance: K{fmt(balance?.totalBalanceZmw ?? 0)}.</p>
                    <button className="wr-btn wr-btn-dark" onClick={closeModal}>
                      Done
                    </button>
                  </div>
                )}

                {flowStep === 'error' && (
                  <div style={{ textAlign: 'center' }}>
                    <div className="wr-error">{error || 'Something went wrong'}</div>
                    <button className="wr-btn wr-btn-ghost" onClick={closeModal}>
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
