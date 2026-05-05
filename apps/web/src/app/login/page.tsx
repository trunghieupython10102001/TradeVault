'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, BarChart3, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import styles from './page.module.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroBadge}>
            <Sparkles size={14} />
            <span>Modern trading journal</span>
          </div>
          <h1 className={styles.heroTitle}>Build discipline with a workspace that feels institutional-grade.</h1>
          <p className={styles.heroText}>
            Log trades, review execution, and track performance with a cleaner command center designed for serious traders.
          </p>
          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <BarChart3 size={16} />
              <span>Performance analytics</span>
            </div>
            <div className={styles.heroStat}>
              <ShieldCheck size={16} />
              <span>Structured review workflow</span>
            </div>
          </div>
        </section>

        <div className={styles.card}>
          <div className={styles.logo}>
            <div className={styles.logoBadge}>TV</div>
            <h1 className={styles.logoTitle}>Welcome back</h1>
            <p className={styles.logoSub}>Sign in to continue improving your edge.</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input
                type="email"
                className={styles.input}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <input
                type="password"
                className={styles.input}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              <span>{loading ? 'Signing in...' : 'Sign In'}</span>
              <ArrowRight size={16} />
            </button>
          </form>

          <p className={styles.footer}>
            Don&apos;t have an account? <Link href="/register">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
