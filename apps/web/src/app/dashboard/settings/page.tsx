'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  User,
  Palette,
  Database,
  Shield,
  Save,
  Plus,
  Trash2,
  Check,
} from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

interface Profile {
  id: string;
  name: string | null;
  email: string;
}

interface Settings {
  currency: string;
  timezone: string;
  dateFormat: string;
  riskPerTrade: number;
  maxDailyLoss: number | null;
  maxPositionSize: number | null;
  defaultLeverage: number;
  startingCapital: number;
  weeklyGoal: number | null;
  monthlyGoal: number | null;
  defaultCommission: number;
  strategies: string[];
  assetClasses: string[];
  journalReminder: boolean;
}

interface Account {
  id: string;
  name: string;
  broker: string | null;
  initialBalance: number;
  currency: string;
  isDefault: boolean;
}

const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'SGD', 'THB'];
const timezones = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Europe/Paris',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Bangkok',
  'Australia/Sydney',
];
const dateFormats = ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 'dd.MM.yyyy'];
const defaultAssetClasses = ['Stocks', 'Options', 'Futures', 'Forex', 'Crypto', 'CFDs', 'Bonds', 'ETFs'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Form state for profile
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');

  // Form state for new account
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccBroker, setNewAccBroker] = useState('');
  const [newAccBalance, setNewAccBalance] = useState('0');
  const [newAccCurrency, setNewAccCurrency] = useState('USD');

  // Form state for new strategy
  const [newStrategy, setNewStrategy] = useState('');

  // Tags state
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');

  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, accountsRes, tagsRes] = await Promise.all([
          apiFetch('/api/settings'),
          apiFetch('/api/accounts'),
          apiFetch('/api/tags'),
        ]);
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setProfile(data.profile);
          setSettings(data.settings);
          setProfileName(data.profile?.name || '');
          setProfileEmail(data.profile?.email || '');
        }
        if (accountsRes.ok) {
          setAccounts(await accountsRes.json());
        }
        if (tagsRes.ok) {
          setTags(await tagsRes.json());
        }
      } catch (error) {
        console.error('Failed to load settings', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    const res = await apiFetch('/api/settings/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name: profileName, email: profileEmail }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProfile(updated);
      showMessage('Profile saved');
    }
    setSaving(false);
  };

  const saveSettings = async (patch: Partial<Settings>) => {
    setSaving(true);
    const res = await apiFetch('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setSettings(updated);
      showMessage('Settings saved');
    }
    setSaving(false);
  };

  const addAccount = async () => {
    if (!newAccName.trim()) return;
    const res = await apiFetch('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: newAccName,
        broker: newAccBroker || null,
        initialBalance: parseFloat(newAccBalance) || 0,
        currency: newAccCurrency,
      }),
    });
    if (res.ok) {
      const acc = await res.json();
      setAccounts((prev) => [...prev, acc]);
      setShowNewAccount(false);
      setNewAccName('');
      setNewAccBroker('');
      setNewAccBalance('0');
      showMessage('Account created');
    }
  };

  const deleteAccount = async (id: string) => {
    const res = await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      showMessage('Account deleted');
    } else {
      const err = await res.json();
      showMessage(err.error || 'Failed to delete');
    }
  };

  const setDefaultAccount = async (id: string) => {
    const res = await apiFetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isDefault: true }),
    });
    if (res.ok) {
      setAccounts((prev) =>
        prev.map((a) => ({ ...a, isDefault: a.id === id }))
      );
      showMessage('Default account updated');
    }
  };

  const addStrategy = () => {
    if (!newStrategy.trim() || !settings) return;
    const updated = [...settings.strategies, newStrategy.trim()];
    setNewStrategy('');
    saveSettings({ strategies: updated });
  };

  const removeStrategy = (s: string) => {
    if (!settings) return;
    saveSettings({ strategies: settings.strategies.filter((x) => x !== s) });
  };

  const addTag = async () => {
    if (!newTagName.trim()) return;
    const res = await apiFetch('/api/tags', {
      method: 'POST',
      body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
    });
    if (res.ok) {
      const tag = await res.json();
      setTags((prev) => [...prev, tag]);
      setNewTagName('');
      showMessage('Tag created');
    } else {
      const err = await res.json();
      showMessage(err.error || 'Failed to create tag');
    }
  };

  const deleteTag = async (id: string) => {
    const res = await apiFetch(`/api/tags/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setTags((prev) => prev.filter((t) => t.id !== id));
      showMessage('Tag deleted');
    }
  };

  const toggleAssetClass = (ac: string) => {
    if (!settings) return;
    const current = settings.assetClasses;
    const updated = current.includes(ac)
      ? current.filter((x) => x !== ac)
      : [...current, ac];
    saveSettings({ assetClasses: updated });
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'risk', label: 'Risk & Goals', icon: Shield },
    { id: 'accounts', label: 'Accounts', icon: Database },
    { id: 'trading', label: 'Trading', icon: Palette },
  ];

  if (loading || !settings) {
    return (
      <>
        <Topbar title="Settings" subtitle="Manage your account and preferences" />
        <div className={styles.page}>
          <p style={{ color: 'var(--text-secondary)' }}>Loading settings...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Settings" subtitle="Manage your account and preferences" />
      <div className={styles.page}>
        {message && <div className={styles.toast}>{message}</div>}
        <div className={styles.layout}>
          <nav className={styles.tabs}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className={styles.content}>
            {/* PROFILE TAB */}
            {activeTab === 'profile' && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Profile Settings</h2>
                <div className={styles.form}>
                  <div className={styles.field}>
                    <label className={styles.label}>Name</label>
                    <input
                      type="text"
                      className={styles.input}
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Email</label>
                    <input
                      type="email"
                      className={styles.input}
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Currency</label>
                    <select
                      className={styles.select}
                      value={settings.currency}
                      onChange={(e) => saveSettings({ currency: e.target.value })}
                    >
                      {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Timezone</label>
                    <select
                      className={styles.select}
                      value={settings.timezone}
                      onChange={(e) => saveSettings({ timezone: e.target.value })}
                    >
                      {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Date Format</label>
                    <select
                      className={styles.select}
                      value={settings.dateFormat}
                      onChange={(e) => saveSettings({ dateFormat: e.target.value })}
                    >
                      {dateFormats.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <button className={styles.saveBtn} onClick={saveProfile} disabled={saving}>
                    <Save size={16} /> Save Profile
                  </button>
                </div>
              </div>
            )}

            {/* RISK & GOALS TAB */}
            {activeTab === 'risk' && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Risk Management & Goals</h2>
                <div className={styles.form}>
                  <div className={styles.field}>
                    <label className={styles.label}>Starting Capital</label>
                    <input
                      type="number"
                      className={styles.input}
                      value={settings.startingCapital}
                      onChange={(e) => saveSettings({ startingCapital: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Risk Per Trade (%)</label>
                    <input
                      type="number"
                      className={styles.input}
                      step="0.1"
                      min="0"
                      max="100"
                      value={settings.riskPerTrade}
                      onChange={(e) => saveSettings({ riskPerTrade: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Max Daily Loss</label>
                    <input
                      type="number"
                      className={styles.input}
                      placeholder="No limit"
                      value={settings.maxDailyLoss ?? ''}
                      onChange={(e) => saveSettings({ maxDailyLoss: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Max Position Size</label>
                    <input
                      type="number"
                      className={styles.input}
                      placeholder="No limit"
                      value={settings.maxPositionSize ?? ''}
                      onChange={(e) => saveSettings({ maxPositionSize: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Default Leverage</label>
                    <input
                      type="number"
                      className={styles.input}
                      step="0.1"
                      min="1"
                      value={settings.defaultLeverage}
                      onChange={(e) => saveSettings({ defaultLeverage: parseFloat(e.target.value) || 1 })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Default Commission</label>
                    <input
                      type="number"
                      className={styles.input}
                      step="0.01"
                      min="0"
                      value={settings.defaultCommission}
                      onChange={(e) => saveSettings({ defaultCommission: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Weekly PnL Goal</label>
                    <input
                      type="number"
                      className={styles.input}
                      placeholder="Not set"
                      value={settings.weeklyGoal ?? ''}
                      onChange={(e) => saveSettings({ weeklyGoal: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Monthly PnL Goal</label>
                    <input
                      type="number"
                      className={styles.input}
                      placeholder="Not set"
                      value={settings.monthlyGoal ?? ''}
                      onChange={(e) => saveSettings({ monthlyGoal: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>
                      <input
                        type="checkbox"
                        checked={settings.journalReminder}
                        onChange={(e) => saveSettings({ journalReminder: e.target.checked })}
                        style={{ marginRight: 8 }}
                      />
                      Daily journal reminder
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ACCOUNTS TAB */}
            {activeTab === 'accounts' && (
              <div className={styles.section}>
                <div className={styles.sectionHeaderRow}>
                  <h2 className={styles.sectionTitle}>Trading Accounts</h2>
                  <button className={styles.addBtn} onClick={() => setShowNewAccount(true)}>
                    <Plus size={16} /> Add Account
                  </button>
                </div>

                {showNewAccount && (
                  <div className={styles.newAccountForm}>
                    <input
                      className={styles.input}
                      placeholder="Account name"
                      value={newAccName}
                      onChange={(e) => setNewAccName(e.target.value)}
                    />
                    <input
                      className={styles.input}
                      placeholder="Broker (optional)"
                      value={newAccBroker}
                      onChange={(e) => setNewAccBroker(e.target.value)}
                    />
                    <input
                      className={styles.input}
                      type="number"
                      placeholder="Initial balance"
                      value={newAccBalance}
                      onChange={(e) => setNewAccBalance(e.target.value)}
                    />
                    <select
                      className={styles.select}
                      value={newAccCurrency}
                      onChange={(e) => setNewAccCurrency(e.target.value)}
                    >
                      {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className={styles.saveBtn} onClick={addAccount}>
                        <Save size={16} /> Create
                      </button>
                      <button className={styles.addBtn} onClick={() => setShowNewAccount(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className={styles.accountsList}>
                  {accounts.map((acc) => (
                    <div key={acc.id} className={styles.accountCard}>
                      <div className={styles.accountInfo}>
                        <div className={styles.accountName}>
                          {acc.name}
                          {acc.isDefault && <span className={styles.defaultBadge}>Default</span>}
                        </div>
                        <div className={styles.accountMeta}>
                          {acc.broker || 'No broker'} · {acc.currency} · Balance: {acc.initialBalance.toLocaleString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {!acc.isDefault && (
                          <button
                            className={styles.deleteBtn}
                            title="Set as default"
                            onClick={() => setDefaultAccount(acc.id)}
                            style={{ color: 'var(--green)' }}
                          >
                            <Check size={16} />
                          </button>
                        )}
                        <button
                          className={styles.deleteBtn}
                          title="Delete account"
                          onClick={() => deleteAccount(acc.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TRADING TAB */}
            {activeTab === 'trading' && (
              <div className={styles.section}>
                <div className={styles.sectionHeaderRow}>
                  <h2 className={styles.sectionTitle}>Strategies</h2>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input
                    className={styles.input}
                    placeholder="New strategy name"
                    value={newStrategy}
                    onChange={(e) => setNewStrategy(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addStrategy()}
                  />
                  <button className={styles.addBtn} onClick={addStrategy}>
                    <Plus size={16} /> Add
                  </button>
                </div>
                <div className={styles.tagsList}>
                  {settings.strategies.map((s) => (
                    <div key={s} className={styles.tagItem}>
                      <span>{s}</span>
                      <button className={styles.removeTagBtn} onClick={() => removeStrategy(s)}>×</button>
                    </div>
                  ))}
                  {settings.strategies.length === 0 && (
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No strategies yet. Add your first one above.</p>
                  )}
                </div>

                {/* Tags Section */}
                <h2 className={styles.sectionTitle} style={{ marginTop: 32 }}>Tags</h2>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                  <input
                    className={styles.input}
                    placeholder="Tag name"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    title="Tag color"
                    style={{ width: 40, height: 38, padding: 2, borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', cursor: 'pointer' }}
                  />
                  <button className={styles.addBtn} onClick={addTag}>
                    <Plus size={16} /> Add
                  </button>
                </div>
                <div className={styles.tagsList}>
                  {tags.map((tag) => (
                    <div key={tag.id} className={styles.tagItem} style={{ borderColor: `${tag.color}40` }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: tag.color, flexShrink: 0, display: 'inline-block' }} />
                        {tag.name}
                      </span>
                      <button className={styles.removeTagBtn} onClick={() => deleteTag(tag.id)}>×</button>
                    </div>
                  ))}
                  {tags.length === 0 && (
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No tags yet. Add your first one above.</p>
                  )}
                </div>

                <h2 className={styles.sectionTitle} style={{ marginTop: 32 }}>Asset Classes</h2>
                <div className={styles.tagsList}>
                  {defaultAssetClasses.map((ac) => (
                    <button
                      key={ac}
                      className={`${styles.tagItem} ${settings.assetClasses.includes(ac) ? styles.tagActive : styles.tagInactive}`}
                      onClick={() => toggleAssetClass(ac)}
                    >
                      <span>{ac}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
