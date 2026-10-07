'use client';

import { FieldError, Logo, Segmented, cx, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDemo } from '@/lib/demo-store';

type Role = 'student' | 'mentor';
const EMPTY = ['', '', '', '', '', ''];

const messageOf = (err: unknown, field?: string) => {
  const e = err instanceof ApiError ? err : null;
  return (field && e?.fields[field]) || e?.message || 'حصلت مشكلة. جرّب تاني.';
};

/**
 * Passwordless login: phone → 6-digit OTP (ADR-0005), against the API (Phase 07).
 * The role picked here only matters for a new number; an existing account keeps its role.
 */
export function LoginFlow() {
  const router = useRouter();
  const toast = useToast();
  const demo = useDemo();
  const auth = useAuth();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [role, setRole] = useState<Role>('student');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [digits, setDigits] = useState<string[]>(EMPTY);
  const [codeError, setCodeError] = useState<string | null>(null);
  /** Shown on the page in local development only (the API returns it there). */
  const [devCode, setDevCode] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend countdown on the OTP step.
  useEffect(() => {
    if (step !== 'otp' || seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, seconds]);

  useEffect(() => {
    if (step === 'otp') inputs.current[0]?.focus();
  }, [step]);

  const fullPhone = () => `+20${phone.replace(/\D/g, '')}`;

  async function sendCode() {
    if (busy) return;
    if (phone.replace(/\D/g, '').length < 10) {
      setPhoneError('الرقم ناقص. اكتب 10 أرقام بعد +20.');
      return;
    }
    setBusy(true);
    try {
      const sent = await auth.requestCode(fullPhone());
      setDevCode(sent.devCode ?? null);
      setDigits(EMPTY);
      setCodeError(null);
      setSeconds(sent.resendAfterSeconds);
      setStep('otp');
    } catch (err) {
      setPhoneError(messageOf(err, 'phone'));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      const sent = await auth.requestCode(fullPhone());
      setDevCode(sent.devCode ?? null);
      setSeconds(sent.resendAfterSeconds);
      setDigits(EMPTY);
      setCodeError(null);
      inputs.current[0]?.focus();
      toast({ kind: 'info', title: 'بعتنالك كود جديد' });
    } catch (err) {
      if (err instanceof ApiError && err.retryAfter) setSeconds(err.retryAfter);
      toast({ kind: 'error', title: messageOf(err) });
    }
  }

  async function verify(code: string[]) {
    if (code.some((d) => !d) || busy) return;
    setBusy(true);
    setCodeError(null);
    try {
      const { user } = await auth.verifyCode(fullPhone(), code.join(''), role);
      const first = user.fullName?.split(' ')[0];
      toast({
        kind: 'success',
        title: first ? `أهلًا ${first}` : 'أهلًا بيك في سابق',
        description: 'سجلت دخولك.',
      });
      // First login: name (and student details) first; /welcome then continues to `after`.
      if (user.needsProfile) {
        router.push('/welcome');
        return;
      }
      const target = demo.after ?? (user.role === 'mentor' ? '/become-mentor' : '/sessions');
      demo.setAfter(null);
      router.push(target);
    } catch (err) {
      setCodeError(messageOf(err, 'code'));
      setDigits(EMPTY);
      inputs.current[0]?.focus();
      setBusy(false);
    }
  }

  function setDigit(i: number, raw: string) {
    const v = raw.replace(/\D/g, '');
    // Pasting the whole code fills every box.
    if (v.length > 1) {
      const next = v.slice(0, 6).split('');
      const filled = [...next, ...Array<string>(6 - next.length).fill('')];
      setDigits(filled);
      inputs.current[Math.min(next.length, 5)]?.focus();
      void verify(filled);
      return;
    }
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v) setCodeError(null);
    if (v && i < 5) inputs.current[i + 1]?.focus();
    void verify(next);
  }

  return (
    <section className="auth">
      <div className="sb-card auth-card">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Logo size={36} />
        </div>
        <div className="auth-body">
          {step === 'phone' ? (
            <>
              <h1 className="sb-h2" style={{ fontSize: 26, textAlign: 'center' }}>
                أهلًا بيك في سابق
              </h1>
              <p className="sb-small" style={{ textAlign: 'center' }}>
                هنبعتلك كود على الموبايل. مفيش باسورد.
              </p>
              <Segmented
                block
                label="نوع الحساب"
                value={role}
                onChange={setRole}
                options={[
                  ['student', 'أنا طالب'],
                  ['mentor', 'أنا مرشد'],
                ]}
              />
              <div className={cx('sb-field', phoneError && 'sb-field--error')}>
                <label className="sb-label" htmlFor="ph">
                  رقم الموبايل
                </label>
                <div className="phone">
                  <span className="cc">+20</span>
                  <input
                    className="sb-input"
                    id="ph"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    dir="ltr"
                    placeholder="10 1234 5678"
                    value={phone}
                    aria-invalid={Boolean(phoneError)}
                    aria-describedby={phoneError ? 'ph-err' : undefined}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setPhoneError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void sendCode();
                    }}
                  />
                </div>
                {phoneError ? <FieldError id="ph-err">{phoneError}</FieldError> : null}
              </div>
              <button
                type="button"
                className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block"
                aria-busy={busy}
                onClick={() => void sendCode()}
              >
                ابعتلي الكود
              </button>
            </>
          ) : (
            <>
              <h1 className="sb-h2" style={{ fontSize: 26, textAlign: 'center' }}>
                اكتب الكود
              </h1>
              <p className="sb-small" style={{ textAlign: 'center' }}>
                بعتنا 6 أرقام على <span className="sb-num">+20 {phone}</span> ·{' '}
                <button
                  type="button"
                  className="sb-btn sb-btn--link"
                  style={{ fontSize: 14 }}
                  onClick={() => {
                    setBusy(false);
                    setStep('phone');
                  }}
                >
                  غيّر الرقم
                </button>
              </p>
              <div
                className={cx('otp', codeError && 'sb-field--error')}
                dir="ltr"
                role="group"
                aria-label="كود التحقق"
                aria-describedby={codeError ? 'otp-err' : undefined}
              >
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputs.current[i] = el;
                    }}
                    className="sb-input"
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={i === 0 ? 6 : 1}
                    aria-label={`رقم ${i + 1}`}
                    aria-invalid={Boolean(codeError)}
                    value={d}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !d && i > 0) inputs.current[i - 1]?.focus();
                    }}
                  />
                ))}
              </div>
              {codeError ? (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <FieldError id="otp-err">{codeError}</FieldError>
                </div>
              ) : null}
              {devCode ? (
                <p className="sb-caption" style={{ textAlign: 'center' }}>
                  للتجربة على جهازك: الكود <span className="sb-num">{devCode}</span>
                </p>
              ) : null}
              <button
                type="button"
                className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block"
                disabled={digits.some((x) => !x)}
                aria-busy={busy}
                onClick={() => void verify(digits)}
              >
                تأكيد
              </button>
              <p className="sb-caption" style={{ textAlign: 'center' }} aria-live="polite">
                {seconds > 0 ? (
                  <>
                    تقدر تطلب كود جديد بعد <span className="sb-num">{seconds}</span> ثانية
                  </>
                ) : (
                  <button
                    type="button"
                    className="sb-btn sb-btn--link"
                    style={{ fontSize: 13 }}
                    onClick={() => void resend()}
                  >
                    ابعت كود جديد
                  </button>
                )}
              </p>
            </>
          )}
        </div>
      </div>
      <p className="sb-caption" style={{ textAlign: 'center', marginTop: 16 }}>
        بالمتابعة انت موافق على{' '}
        <Link href="/terms" className="ul">
          الشروط
        </Link>{' '}
        و
        <Link href="/privacy" className="ul">
          الخصوصية
        </Link>
        .
      </p>
    </section>
  );
}
