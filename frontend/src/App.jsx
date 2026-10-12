import { useCallback, useEffect, useMemo, useState } from 'react';
import { SignIn, SignUp, UserButton, useAuth, useUser } from '@clerk/react';
import {
  Activity, AlertOctagon, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight,
  BarChart3, BookOpen, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp,
  Clock3, Database, FileSearch, FileText, Fingerprint, Globe2, LayoutDashboard,
  Link2, LoaderCircle, Mail, Menu, MousePointer2, Plus, RefreshCw, Search,
  Shield, ShieldAlert, ShieldCheck, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Cell, Line, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import api, { errorMessage, setAuthTokenGetter } from './api.js';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'analyze', label: 'Analyze Email', icon: FileSearch },
  { id: 'history', label: 'Analysis History', icon: Clock3 },
  { id: 'model', label: 'About the Model', icon: BookOpen },
];
const COLORS = { Phishing: '#ef6272', Spam: '#f4a63a', Legitimate: '#22b79a' };
const SAMPLES = [
  {
    name: 'Urgent account notice',
    sender_email: 'security@paypaI-account-check.example',
    subject: 'URGENT: verify your account immediately',
    body: 'Your PayPal account is suspended. Confirm your password and one time code at http://198.51.100.42/login within 24 hours or access will be removed.',
  },
  {
    name: 'Retail promotion',
    sender_email: 'promo@outdoor-store.example',
    subject: 'Weekend trail gear sale',
    body: "Explore this weekend's seasonal discounts on hiking equipment. Browse our new catalog and use the store app if you want to shop.",
  },
  {
    name: 'Team update',
    sender_email: 'hr@company.example',
    subject: 'Updated benefits enrollment dates',
    body: 'Open enrollment begins next month. Human Resources will host a question session in the office on Tuesday. No action is needed today.',
  },
];

function formatDate(value, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!value) return '—';
  const normalized = typeof value === 'string' && !/[zZ]|[+-]\d\d:\d\d$/.test(value) ? `${value}Z` : value;
  return new Intl.DateTimeFormat(undefined, options).format(new Date(normalized));
}

function RiskBadge({ value }) {
  const classes = { Critical: 'badge-critical', High: 'badge-high', Elevated: 'badge-elevated', Guarded: 'badge-guarded', Low: 'badge-low' };
  return <span className={`badge ${classes[value] || 'badge-neutral'}`}><span className="badge-dot" />{value || 'Unknown'}</span>;
}

function ClassificationBadge({ value }) {
  const Icon = value === 'Phishing' ? ShieldAlert : value === 'Spam' ? Mail : ShieldCheck;
  const style = value === 'Phishing' ? 'class-phishing' : value === 'Spam' ? 'class-spam' : 'class-legitimate';
  return <span className={`class-badge ${style}`}><Icon size={14} />{value || 'Unknown'}</span>;
}

function CardTitle({ title, subtitle, action }) {
  return <div className="card-title-row"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

function Empty({ icon: Icon = FileSearch, title, detail }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={23} /></span><strong>{title}</strong><p>{detail}</p></div>;
}

function Alert({ children, tone = 'error', onClose }) {
  if (!children) return null;
  return <div className={`alert alert-${tone}`} role="status"><AlertTriangle size={17} /><span>{children}</span>{onClose && <button className="icon-button" onClick={onClose} aria-label="Dismiss"><X size={16} /></button>}</div>;
}

function App() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [active, setActive] = useState('dashboard');
  const [health, setHealth] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);

  setAuthTokenGetter(() => getToken());

  const updateHealth = useCallback(async () => {
    try { const { data } = await api.get('/health'); setHealth(data); }
    catch { setHealth({ status: 'offline', database: 'unavailable', model: 'unavailable' }); }
  }, []);

  useEffect(() => {
    updateHealth();
    const timer = window.setInterval(updateHealth, 30_000);
    return () => window.clearInterval(timer);
  }, [updateHealth]);

  function onAnalyzed() { setRefreshToken((n) => n + 1); }

  if (!isLoaded) return <div className="loading-screen"><LoaderCircle size={24} className="spin" /><span>Loading secure sign-in…</span></div>;
  if (!isSignedIn) {
    const signingUp = window.location.hash.includes('sign-up');
    return <main className="login-screen"><section className="login-card"><div className="brand-lockup"><span className="brand-mark"><ShieldCheck size={22} /></span><span>Phish<span>Guard</span></span></div><span className="eyebrow">SECURE WORKSPACE</span><h1>Your email security workspace.</h1><p className="login-description">Sign in or create your individual account to securely analyze messages and review your private history.</p>{signingUp ? <SignUp routing="hash" signInUrl="#/sign-in" /> : <SignIn routing="hash" signUpUrl="#/sign-up" />}</section><div className="login-side"><div className="login-side-content"><span className="eyebrow eyebrow-light">INTELLIGENCE THAT EXPLAINS ITSELF</span><h2>Make every suspicious signal easier to understand.</h2><p>One shared detection engine combines a calibrated text classifier with transparent URL and sender checks.</p><div className="login-feature"><span><Fingerprint size={18} /></span><div><b>Explainable by design</b><small>See what the model predicts — and what the rules flag.</small></div></div><div className="login-feature"><span><Database size={18} /></span><div><b>Your records, in one place</b><small>Securely review analysis history and live trends.</small></div></div></div><div className="login-side-bottom">PHISHGUARD <span>·</span> EMAIL THREAT ANALYSIS</div></div></main>;
  }

  const page = NAV.find((item) => item.id === active) || NAV[0];
  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup"><span className="brand-mark"><ShieldCheck size={20} /></span><span>Phish<span>Guard</span></span></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Main navigation">
        {NAV.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setActive(id); setMobileMenu(false); }} className={`nav-item ${active === id ? 'nav-active' : ''}`}><Icon size={18} strokeWidth={active === id ? 2.3 : 1.8} /><span>{label}</span>{id === 'analyze' && <span className="nav-new">NEW</span>}</button>)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="system-card"><div className="system-card-title"><span className={`status-light ${health?.database === 'connected' ? 'status-up' : 'status-down'}`} />System status</div><div className="system-row"><Database size={14} />Database<span>{health?.database === 'connected' ? 'Connected' : 'Offline'}</span></div><div className="system-row"><Sparkles size={14} />Classifier<span>{health?.model === 'loaded' ? 'Ready' : 'Unavailable'}</span></div></div>
      <div className="sidebar-bottom"><div className="user-chip"><div className="user-avatar"><UserButton /></div><div className="user-meta"><b>{user?.fullName || 'Your account'}</b><small>{user?.primaryEmailAddress?.emailAddress || 'Signed in'}</small></div></div><div className="version-label">PHISHGUARD <span>·</span> PRIVATE WORKSPACE</div></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><button className="mobile-menu-button icon-button" onClick={() => setMobileMenu((v) => !v)} aria-label="Toggle navigation"><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={15} /><strong>{page.label}</strong></div><div className="topbar-right"><div className="live-pill"><span className="live-dot" />Live system</div><UserButton /></div></header>
      <main className="page-content" key={active}>
        {active === 'dashboard' && <Dashboard health={health} refreshToken={refreshToken} onNavigate={setActive} />}
        {active === 'analyze' && <AnalyzePage onAnalyzed={onAnalyzed} />}
        {active === 'history' && <HistoryPage refreshToken={refreshToken} />}
        {active === 'model' && <ModelPage health={health} />}
      </main>
      <footer className="page-footer"><span>© 2026 PhishGuard · A screening aid, not a safety guarantee.</span><span><Shield size={13} />Email bodies are not stored by default</span></footer>
    </div>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function DateFilters({ from, to, setFrom, setTo }) {
  return <div className="date-filters"><label><span>From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label><span>To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>;
}

function Dashboard({ health, refreshToken, onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const params = useMemo(() => ({ ...(from && { from_date: from }), ...(to && { to_date: to }) }), [from, to]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const response = await api.get('/analytics', { params }); setData(response.data); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [params]);
  useEffect(() => { load(); }, [load, refreshToken]);
  const stats = [
    { label: 'Emails analyzed', value: data?.total ?? 0, icon: Mail, tone: 'blue', detail: 'In the selected period' },
    { label: 'Phishing detected', value: data?.counts?.Phishing ?? 0, icon: ShieldAlert, tone: 'rose', detail: 'Model classification' },
    { label: 'Spam identified', value: data?.counts?.Spam ?? 0, icon: AlertOctagon, tone: 'amber', detail: 'Model classification' },
    { label: 'Legitimate', value: data?.counts?.Legitimate ?? 0, icon: ShieldCheck, tone: 'green', detail: 'Model classification' },
  ];
  return <>
    <PageHeading eyebrow="SECURITY OVERVIEW" title="Good morning." description="A clear view of the emails moving through your detection engine." action={<button className="button button-primary" onClick={() => onNavigate('analyze')}><Plus size={17} />Analyze an email</button>} />
    <div className="dashboard-toolbar"><div className="data-note"><span className={`status-light ${health?.database === 'connected' ? 'status-up' : 'status-down'}`} />Metrics from saved analysis records</div><DateFilters from={from} to={to} setFrom={setFrom} setTo={setTo} /><button className="icon-button refresh-button" title="Refresh analytics" onClick={load}><RefreshCw size={16} className={loading ? 'spin' : ''} /></button></div>
    <Alert>{error}</Alert>
    <section className="stat-grid">{stats.map(({ label, value, icon: Icon, tone, detail }) => <article className="stat-card" key={label}><div className={`stat-icon stat-${tone}`}><Icon size={19} /></div><span className="stat-label">{label}</span><strong className="stat-number">{loading ? '—' : value.toLocaleString()}</strong><span className="stat-detail">{detail}</span></article>)}</section>
    <section className="dashboard-grid">
      <article className="panel trend-panel"><CardTitle title="Analysis activity" subtitle="Saved classifications over time" action={<span className="chart-period"><Activity size={14} />All recorded</span>} />
        {loading ? <div className="chart-loading"><LoaderCircle size={20} className="spin" /></div> : data?.trends?.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trends} margin={{ top: 10, right: 9, left: -22, bottom: 0 }}><defs><linearGradient id="phishingFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.Phishing} stopOpacity={0.18} /><stop offset="95%" stopColor={COLORS.Phishing} stopOpacity={0.01} /></linearGradient><linearGradient id="legitFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.Legitimate} stopOpacity={0.17} /><stop offset="95%" stopColor={COLORS.Legitimate} stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="#edf0f6" vertical={false} /><XAxis dataKey="date" tickFormatter={(v) => formatDate(v, { month: 'short', day: 'numeric', timeZone: 'UTC' })} tickLine={false} axisLine={false} tick={{ fill: '#8b96a9', fontSize: 11 }} dy={8} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#8b96a9', fontSize: 11 }} /><Tooltip labelFormatter={(v) => formatDate(v, { dateStyle: 'long', timeZone: 'UTC' })} contentStyle={{ border: '1px solid #edf0f6', borderRadius: 12, boxShadow: '0 10px 28px #25345b14' }} /><Area type="monotone" dataKey="Phishing" stroke={COLORS.Phishing} fill="url(#phishingFill)" strokeWidth={2.3} /><Area type="monotone" dataKey="Legitimate" stroke={COLORS.Legitimate} fill="url(#legitFill)" strokeWidth={2.3} /><Line type="monotone" dataKey="Spam" stroke={COLORS.Spam} strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer></div> : <Empty icon={BarChart3} title="No trend data yet" detail="Once emails are analyzed, the activity trend will appear here." />}
        <div className="chart-legend"><span><i style={{ background: COLORS.Phishing }} />Phishing</span><span><i style={{ background: COLORS.Spam }} />Spam</span><span><i style={{ background: COLORS.Legitimate }} />Legitimate</span></div>
      </article>
      <article className="panel distribution-panel"><CardTitle title="Classification mix" subtitle="Real saved results" />{loading ? <div className="chart-loading"><LoaderCircle size={20} className="spin" /></div> : data?.total ? <><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.distribution.filter((item) => item.value > 0)} dataKey="value" nameKey="name" innerRadius="67%" outerRadius="90%" paddingAngle={4} stroke="none">{data.distribution.filter((item) => item.value > 0).map((entry) => <Cell key={entry.name} fill={COLORS[entry.name]} />)}</Pie><Tooltip contentStyle={{ border: '1px solid #edf0f6', borderRadius: 12 }} /></PieChart></ResponsiveContainer><div className="donut-center"><b>{data.total}</b><small>total</small></div></div><div className="distribution-legend">{data.distribution.map(({ name, value }) => <div key={name}><span><i style={{ background: COLORS[name] }} />{name}</span><b>{value}<small>{data.total ? ` · ${Math.round((value / data.total) * 100)}%` : ''}</small></b></div>)}</div></> : <Empty icon={BarChart3} title="Nothing to chart yet" detail="Classification distribution will populate from your records." />}</article>
    </section>
    <section className="panel recent-panel"><CardTitle title="Recent analyses" subtitle="The latest emails processed by this workspace" action={<button className="text-button" onClick={() => onNavigate('history')}>View history <ArrowRight size={15} /></button>} />
      {loading ? <div className="table-loading"><LoaderCircle size={19} className="spin" /></div> : data?.recent?.length ? <div className="table-scroll"><table><thead><tr><th>CLASSIFICATION</th><th>SENDER DOMAIN</th><th>RISK LEVEL</th><th>MODEL VERSION</th><th>DATE</th></tr></thead><tbody>{data.recent.map((row) => <tr key={row.id} onClick={() => onNavigate('history')} className="click-row"><td><ClassificationBadge value={row.classification} /></td><td className="domain-cell">{row.sender_domain || '—'}</td><td><RiskBadge value={row.risk_level} /></td><td className="version-cell">{row.model_version}</td><td className="date-cell">{formatDate(row.created_at)}</td></tr>)}</tbody></table></div> : <Empty title="Your workspace is ready" detail="Run an email analysis to begin building a real-time security picture." />}
    </section>
  </>;
}

function AnalyzePage({ onAnalyzed }) {
  const [form, setForm] = useState({ sender_email: '', subject: '', body: '' });
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('paste');
  const [dragging, setDragging] = useState(false);
  function useSample(sample) { setForm(sample); setFile(null); setTab('paste'); setResult(null); setError(''); }
  function acceptFile(candidate) {
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith('.eml')) { setError('Choose a message file with the .eml extension.'); return; }
    if (candidate.size > 2 * 1024 * 1024) { setError('This file exceeds the 2 MB upload limit.'); return; }
    setFile(candidate); setError(''); setResult(null);
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null);
    try {
      const response = file && tab === 'upload'
        ? await api.post('/analyze/file', (() => { const data = new FormData(); data.append('file', file); return data; })())
        : await api.post('/analyze', form);
      setResult(response.data); onAnalyzed();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  function reset() { setResult(null); setError(''); setForm({ sender_email: '', subject: '', body: '' }); setFile(null); }
  return <>
    <PageHeading eyebrow="UNIFIED DETECTION ENGINE" title="Analyze an email" description="Screen message content for phishing, spam, and suspicious signals before you act." action={<span className="privacy-pill"><Shield size={14} />Email body not retained</span>} />
    <div className="analysis-layout">
      <section className="panel analysis-panel">
        <div className="analysis-panel-head"><div><span className="step-label"><span>01</span> MESSAGE INPUT</span><h2>Give us an email to inspect</h2></div><div className="secure-note"><ShieldCheck size={15} />Processed locally by your API</div></div>
        <div className="input-tabs"><button className={tab === 'paste' ? 'tab-active' : ''} onClick={() => { setTab('paste'); setError(''); }}><FileText size={16} />Paste details</button><button className={tab === 'upload' ? 'tab-active' : ''} onClick={() => { setTab('upload'); setError(''); }}><Upload size={16} />Upload .eml <span className="tab-size">2 MB max</span></button></div>
        <form onSubmit={submit}>
          {tab === 'paste' ? <div className="email-fields"><label className="field"><span>Sender email <b>*</b></span><div className="field-control"><Mail size={16} /><input type="email" maxLength="320" placeholder="name@company.com" autoComplete="off" required value={form.sender_email} onChange={(e) => setForm({ ...form, sender_email: e.target.value })} /></div></label><label className="field"><span>Subject <small>Optional</small></span><input className="plain-input" maxLength="998" placeholder="What is the email about?" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label><label className="field"><span>Email body <b>*</b><small>{form.body.length.toLocaleString()} / 20,000</small></span><textarea maxLength="20000" rows="10" placeholder="Paste the message text here. Avoid including sensitive personal information." required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label><p className="field-help"><Shield size={14} />Message contents are analyzed in memory and are not stored in analysis history.</p></div> : <div className={`dropzone ${dragging ? 'dropzone-active' : ''} ${file ? 'dropzone-file' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files[0]); }}><input id="eml-input" type="file" accept=".eml,message/rfc822" onChange={(e) => acceptFile(e.target.files?.[0])} /><label htmlFor="eml-input" className="dropzone-label"><span className="upload-icon">{file ? <FileText size={25} /> : <Upload size={25} />}</span><strong>{file ? file.name : 'Drop an .eml file here'}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KB · parsed without executing attachments` : 'or browse from your device · up to 2 MB'}</span><span className="button button-secondary choose-file">{file ? 'Choose another file' : 'Choose .eml file'}</span></label>{file && <button type="button" className="remove-file icon-button" onClick={() => setFile(null)} aria-label="Remove file"><X size={17} /></button>}<p className="file-safety"><ShieldCheck size={14} />Attachments are ignored. Links are extracted, never opened.</p></div>}
          <Alert>{error}</Alert>
          <div className="form-bottom"><span className="required-note"><b>*</b> Required fields</span><button className="button button-primary analyze-button" disabled={busy || (tab === 'upload' && !file)}>{busy ? <><LoaderCircle size={17} className="spin" />Analyzing…</> : <><Sparkles size={17} />Analyze email <ArrowRight size={16} /></>}</button></div>
        </form>
      </section>
      <aside className="sample-column"><div className="sample-heading"><div className="sample-heading-icon"><MousePointer2 size={16} /></div><div><h3>Try a sample</h3><p>Example messages for testing</p></div></div><div className="sample-list">{SAMPLES.map((sample, index) => <button key={sample.name} className="sample-card" onClick={() => useSample(sample)}><span className={`sample-number sample-${index}`}>0{index + 1}</span><span className="sample-copy"><b>{sample.name}</b><small>{sample.subject}</small></span><ArrowRight size={15} /></button>)}</div><div className="engine-note"><span><Fingerprint size={18} /></span><div><b>One shared engine</b><p>Text model, URL signals, and sender checks are evaluated together.</p></div></div><div className="safety-note"><ShieldCheck size={15} /><p><b>Stay cautious.</b> A low-risk result does not guarantee an email is safe.</p></div></aside>
    </div>
    {result && <ResultCard result={result} onReset={reset} />}
    {!result && !error && <div className="analysis-footnote"><CircleHelp size={15} /><span>Results include a calibrated model prediction and clearly separated rule-based warnings.</span></div>}
  </>;
}

function ResultCard({ result, onReset }) {
  const color = result.classification === 'Phishing' ? 'result-rose' : result.classification === 'Spam' ? 'result-amber' : 'result-green';
  return <section className="result-card panel"><div className="result-top"><div><span className="step-label"><span>02</span> ANALYSIS RESULT</span><h2>Screening complete <span className="result-check"><Check size={15} /></span></h2></div><button onClick={onReset} className="button button-secondary"><Plus size={16} />Analyze another</button></div><div className="result-summary"><div className={`result-class ${color}`}><span className="result-icon">{result.classification === 'Phishing' ? <ShieldAlert size={22} /> : result.classification === 'Spam' ? <Mail size={22} /> : <ShieldCheck size={22} />}</span><div><small>MODEL CLASSIFICATION</small><b>{result.classification}</b></div></div><div className="result-risk"><span>Combined risk level</span><RiskBadge value={result.risk_level} /></div><div className="result-confidence"><span>Calibrated model probability</span><strong>{(result.model_probability * 100).toFixed(1)}<small>%</small></strong><div className="confidence-track"><i style={{ width: `${Math.max(0, Math.min(100, result.model_probability * 100))}%` }} /></div><small className="model-version">{result.model_version}</small></div></div>{result.uncertain && <div className="uncertain-banner"><AlertTriangle size={17} /><span><b>Low model confidence.</b> This result is uncertain; verify the message independently and do not treat it as a safety clearance.</span></div>}<div className="result-columns"><div className="result-section"><h3><Fingerprint size={17} />Detection explanation <span className="source-tag">ML MODEL</span></h3>{result.explanations.length ? <ul className="explanation-list">{result.explanations.map((message, index) => <li key={`${index}-${message}`}><span className="explanation-dot" />{message}</li>)}</ul> : <p className="quiet-copy">No rule-based indicators were triggered. The classification comes from the text model and is not a safety guarantee.</p>}<div className="model-disclaimer"><Sparkles size={15} />The category above is the model prediction; warnings below are rule-based signals.</div></div><div className="result-section"><h3><AlertTriangle size={17} />Rule-based warnings <span className="count-tag">{result.indicators.length}</span></h3>{result.indicators.length ? <div className="indicator-list">{result.indicators.map((item) => <div className="indicator-row" key={item.code}><span className={`severity-mark severity-${item.severity}`} /><span><b>{item.label}</b><small>{item.message}</small></span></div>)}</div> : <p className="quiet-copy">No URL, sender, or language rules fired for this message.</p>}</div></div>{result.urls.length > 0 && <div className="url-section"><h3><Link2 size={16} />Extracted URLs <span className="count-tag">{result.urls.length}</span></h3><div className="url-list">{result.urls.map((url) => <code key={url} className="url-chip"><Globe2 size={13} /><span>{url}</span></code>)}</div><p>These addresses are displayed as text only and have not been opened.</p></div>}<div className="result-safety"><Shield size={16} /><span>{result.safety_note}</span><time>{formatDate(result.created_at)}</time></div></section>;
}

function HistoryPage({ refreshToken }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [classification, setClassification] = useState('');
  const [risk, setRisk] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const pageSize = 10;
  const params = useMemo(() => ({ page, page_size: pageSize, ...(q && { q }), ...(classification && { classification }), ...(risk && { risk_level: risk }), ...(from && { from_date: from }), ...(to && { to_date: to }) }), [page, q, classification, risk, from, to]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const response = await api.get('/history', { params }); setData(response.data); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [params]);
  useEffect(() => { load(); }, [load, refreshToken]);
  function runSearch(event) { event.preventDefault(); setPage(1); setQ(searchText.trim()); }
  async function openDetail(id) { setDetailLoading(true); setSelected({ loading: true }); try { const { data: detail } = await api.get(`/history/${id}`); setSelected(detail); } catch (err) { setSelected(null); setError(errorMessage(err)); } finally { setDetailLoading(false); } }
  async function deleteRecord() {
    if (!selected?.id || !window.confirm('Delete this analysis record? This cannot be undone.')) return;
    setBusyDelete(true);
    try { await api.delete(`/history/${selected.id}`); setSelected(null); await load(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusyDelete(false); }
  }
  function changeFilter(setter, value) { setter(value); setPage(1); }
  return <>
    <PageHeading eyebrow="PRIVATE AUDIT TRAIL" title="Analysis history" description="Search and review saved results. Original email bodies are never stored." action={<span className="privacy-pill"><Database size={14} />{data?.total ?? '—'} saved records</span>} />
    <section className="panel history-panel"><div className="history-filters"><form className="search-box" onSubmit={runSearch}><Search size={17} /><input placeholder="Search sender domain or model…" value={searchText} onChange={(e) => setSearchText(e.target.value)} /><button type="submit" className="search-submit">Search</button></form><select value={classification} onChange={(e) => changeFilter(setClassification, e.target.value)} aria-label="Filter by classification"><option value="">All classifications</option><option>Phishing</option><option>Spam</option><option>Legitimate</option></select><select value={risk} onChange={(e) => changeFilter(setRisk, e.target.value)} aria-label="Filter by risk"><option value="">All risk levels</option><option>Critical</option><option>High</option><option>Elevated</option><option>Guarded</option><option>Low</option></select><DateFilters from={from} to={to} setFrom={(v) => changeFilter(setFrom, v)} setTo={(v) => changeFilter(setTo, v)} /></div><Alert>{error}</Alert>{loading ? <div className="table-loading"><LoaderCircle size={21} className="spin" /></div> : data?.items?.length ? <><div className="table-scroll"><table className="history-table"><thead><tr><th>EMAIL / SENDER</th><th>CLASSIFICATION</th><th>RISK</th><th>MODEL PROBABILITY</th><th>MODEL VERSION</th><th>DATE</th><th /></tr></thead><tbody>{data.items.map((row) => <tr key={row.id}><td><button className="sender-button" onClick={() => openDetail(row.id)}><span className="sender-avatar"><Mail size={15} /></span><span><b>{row.sender_domain || 'Unknown sender'}</b><small>Analysis #{row.id} · {row.source === 'eml' ? '.eml upload' : 'Pasted email'}</small></span></button></td><td><ClassificationBadge value={row.classification} /></td><td><RiskBadge value={row.risk_level} /></td><td><span className="probability-cell">{(row.model_probability * 100).toFixed(1)}%</span>{row.uncertain && <span className="uncertain-dot" title="Low-confidence result" />}</td><td className="version-cell">{row.model_version}</td><td className="date-cell">{formatDate(row.created_at)}</td><td><button className="icon-button row-open" onClick={() => openDetail(row.id)} aria-label="View analysis details"><ArrowRight size={16} /></button></td></tr>)}</tbody></table></div><div className="pagination"><span>Showing {((data.page - 1) * data.page_size) + 1}–{Math.min(data.page * data.page_size, data.total)} of {data.total}</span><div><button className="icon-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={17} /></button><span>Page {data.page} of {Math.max(1, data.pages)}</span><button className="icon-button" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={17} /></button></div></div></> : <Empty icon={FileSearch} title="No matching analyses" detail={data?.total ? 'Try changing your search or filters.' : 'Analyzed emails appear here; email contents are not retained.'} />}</section>
    {selected && <DetailModal record={selected} onClose={() => setSelected(null)} onDelete={deleteRecord} busyDelete={busyDelete} detailLoading={detailLoading} />}
  </>;
}

function DetailModal({ record, onClose, onDelete, busyDelete, detailLoading }) {
  useEffect(() => { function onKey(event) { if (event.key === 'Escape') onClose(); } window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  if (record.loading || detailLoading) return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal-card modal-loading"><LoaderCircle size={22} className="spin" />Loading analysis…</div></div>;
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="modal-head"><div><span className="eyebrow">ANALYSIS #{record.id}</span><h2 id="detail-title">Saved result details</h2></div><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={19} /></button></div><div className="modal-tags"><ClassificationBadge value={record.classification} /><RiskBadge value={record.risk_level} /></div><div className="detail-grid"><div><span>Sender domain</span><b>{record.sender_domain || '—'}</b></div><div><span>Model probability</span><b>{(record.model_probability * 100).toFixed(1)}%{record.uncertain ? ' · uncertain' : ''}</b></div><div><span>Model version</span><b>{record.model_version}</b></div><div><span>Analyzed</span><b>{formatDate(record.created_at)}</b></div><div><span>Input source</span><b>{record.source === 'eml' ? '.eml upload' : 'Pasted email'}</b></div></div><div className="modal-section"><h3>Rule-based indicators</h3>{record.indicators?.length ? record.indicators.map((item) => <div className="indicator-row" key={item.code}><span className={`severity-mark severity-${item.severity}`} /><span><b>{item.label}</b><small>{item.message}</small></span></div>) : <p className="quiet-copy">No rule-based warnings were stored.</p>}</div>{record.urls?.length > 0 && <div className="modal-section"><h3>Extracted links <small>not opened</small></h3><div className="url-list">{record.urls.map((url) => <code className="url-chip" key={url}><Globe2 size={13} /><span>{url}</span></code>)}</div></div>}<div className="modal-actions"><button className="button button-danger" onClick={onDelete} disabled={busyDelete}>{busyDelete ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}Delete record</button><button className="button button-secondary" onClick={onClose}>Close</button></div></section></div>;
}

function ModelPage({ health }) {
  const [metadata, setMetadata] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { let live = true; api.get('/model').then(({ data }) => { if (live) setMetadata(data); }).catch((err) => { if (live) setError(errorMessage(err)); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, []);
  const methods = [
    { icon: Sparkles, title: 'Calibrated text classifier', text: 'A scikit-learn pipeline combines TF-IDF word and phrase features with Logistic Regression. Sigmoid calibration uses stratified cross-validation; probabilities are a confidence estimate, not a guarantee.' },
    { icon: Link2, title: 'URL-pattern inspection', text: 'Transparent checks flag URL shorteners, IP-address links, punycode domains, and unusual link formats. Links are extracted for display only and are never opened.' },
    { icon: Fingerprint, title: 'Sender and language signals', text: 'Sender/link domain differences, brand-domain mismatches, urgent wording, and requests for sensitive information are surfaced as separate rule-based warnings.' },
  ];
  return <>
    <PageHeading eyebrow="TRANSPARENT BY DESIGN" title="About the model" description="A shared detection pipeline pairs machine learning with interpretable checks — without pretending any result is certain." action={<span className={`privacy-pill ${health?.model === 'loaded' ? 'pill-green' : 'pill-amber'}`}><span className={`status-light ${health?.model === 'loaded' ? 'status-up' : 'status-down'}`} />{health?.model === 'loaded' ? 'Model loaded' : 'Model unavailable'}</span>} />
    <Alert>{error}</Alert>
    <div className="model-overview-grid"><section className="panel model-status-card"><div className="model-emblem"><Fingerprint size={28} /></div><div className="eyebrow">ACTIVE MODEL</div><h2>PhishGuard email classifier</h2><p>Three-class supervised text model with independent rule-based warnings.</p>{loading ? <div className="inline-loading"><LoaderCircle size={17} className="spin" />Loading model information…</div> : metadata ? <div className="model-metadata"><div><span>Version</span><b>{metadata.version}</b></div><div><span>Calibration</span><b>{metadata.calibration}</b></div><div><span>Training examples</span><b>{metadata.dataset_rows} labeled emails</b></div><div><span>Classes</span><b>Legitimate · Spam · Phishing</b></div><div><span>Model status</span><b className="green-copy">Loaded once at API startup</b></div></div> : <div className="model-unavailable"><AlertTriangle size={17} />The trained artifact is not available. Follow the README training step, then restart the API.</div>}</section><section className="panel model-eval-card"><CardTitle title="Training snapshot" subtitle="Measured during training, not a guarantee" />{metadata ? <><div className="eval-score"><strong>{(metadata.holdout_accuracy * 100).toFixed(1)}<small>%</small></strong><span>stratified holdout accuracy</span></div><div className="eval-meta"><span>{metadata.holdout_size} unseen holdout examples</span><span>Seeded split · {metadata.holdout_seed}</span></div><div className="class-counts">{Object.entries(metadata.class_counts || {}).map(([label, count]) => <div key={label}><i style={{ background: COLORS[label] }} /><span>{label}</span><b>{count}</b></div>)}</div></> : <Empty icon={BarChart3} title="No training snapshot" detail="Train the local model to see measured dataset information." />}</section></div>
    <section className="panel model-methods"><CardTitle title="How a result is formed" subtitle="Model predictions and heuristic checks are deliberately kept distinct." />{methods.map(({ icon: Icon, title, text }, i) => <div className="method-row" key={title}><span className="method-icon"><Icon size={18} /></span><span className="method-number">0{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</section>
    <div className="limitations-banner"><AlertTriangle size={19} /><div><b>Important limitations</b><p>The bundled labeled corpus is a small curated demonstration dataset. Scores can be misleading on new organizations, languages, or attack styles. Replace it with reviewed, representative data and validate on a separate real-world dataset before production use. PhishGuard cannot guarantee that an email is safe.</p></div></div>
  </>;
}

export default App;
