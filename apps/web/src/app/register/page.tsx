'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Layers3, NotebookPen, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import styles from '../login/page.module.css';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await register(name, email, password);

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
            <span>Designed for serious review</span>
          </div>
          <h1 className={styles.heroTitle}>Turn trading data into a sharper decision loop.</h1>
          <p className={styles.heroText}>
            Capture execution, annotate context, and build a repeatable journaling system that actually helps you improve.
          </p>
          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <Layers3 size={16} />
              <span>Clean multi-screen workspace</span>
            </div>
            <div className={styles.heroStat}>
              <NotebookPen size={16} />
              <span>Journal-first workflow</span>
            </div>
          </div>
        </section>

        <div className={styles.card}>
          <div className={styles.logo}>
            <div className={styles.logoBadge}>TV</div>
            <h1 className={styles.logoTitle}>Create your account</h1>
            <p className={styles.logoSub}>Start building your premium trading review workflow.</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.field}>
              <label className={styles.label}>Name</label>
              <input
                type="text"
                className={styles.input}
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </div>

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
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              <span>{loading ? 'Creating account...' : 'Create Account'}</span>
              <ArrowRight size={16} />
            </button>
          </form>

          <p className={styles.footer}>
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
