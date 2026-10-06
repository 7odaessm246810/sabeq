'use client';

import { FieldError, Logo, Segmented, cx, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useDemo } from '@/lib/demo-store';

type Role = 'student' | 'mentor';
const RESEND_SECONDS = 30;

/**
 * Passwordless login: phone → 6-digit OTP (ADR-0005). The demo accepts any 6 digits;
 * Phase 07 connects this to the API (send-otp / verify-otp).
 */
export function LoginFlow() {
  const router = useRouter();
  const toast = useToast();
  const demo = useDemo();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [role, setRole] = useState<Role>('student');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // Resend countdown on the OTP step.
  useEffect(() => {
    if (step !== 'otp' || seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, seconds]);

  useEffect(() => {
    if (step === 'otp') inputs.current[0]?.focus();
  }, [step]);

  function sendCode() {
    if (phone.replace(/\D/g, '').length < 10) {
      setPhoneError('الرقم ناقص. اكتب 10 أرقام بعد +20.');
      return;
    }
    setBusy(true);
    timers.current.push(
      setTimeout(() => {
        setBusy(false);
        setDigits(['', '', '', '', '', '']);
        setSeconds(RESEND_SECONDS);
        setStep('otp');
      }, 700),
    );
  }

  function verify(code: string[]) {
    if (code.some((d) => !d)) return;
    setBusy(true);
    timers.current.push(
      setTimeout(() => {
        const name = role === 'mentor' ? 'أحمد محمد' : 'ملك أشرف';
        demo.signIn(name);
        toast({
          kind: 'success',
          title: `أهلًا ${name.split(' ')[0]}`,
          description: 'سجلت دخولك.',
        });
        const target = demo.after ?? (role === 'mentor' ? '/become-mentor' : '/sessions');
        demo.setAfter(null);
        router.push(target);
      }, 600),
    );
  }

  function setDigit(i: number, raw: string) {
    const v = raw.replace(/\D/g, '');
    // Pasting the whole code fills every box.
    if (v.length > 1) {
      const next = v.slice(0, 6).split('');
      const filled = [...next, ...Array<string>(6 - next.length).fill('')];
      setDigits(filled);
      inputs.current[Math.min(next.length, 5)]?.focus();
      verify(filled);
      return;
    }
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < 5) inputs.current[i + 1]?.focus();
    verify(next);
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
                      if (e.key === 'Enter') sendCode();
                    }}
                  />
                </div>
                {phoneError ? <FieldError id="ph-err">{phoneError}</FieldError> : null}
              </div>
              <button
                type="button"
                className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block"
                aria-busy={busy}
                onClick={sendCode}
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
              <div className="otp" dir="ltr" role="group" aria-label="كود التحقق">
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
                    value={d}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !d && i > 0) inputs.current[i - 1]?.focus();
                    }}
                  />
                ))}
              </div>
              <p className="sb-caption" style={{ textAlign: 'center' }}>
                للعرض: اكتب أي 6 أرقام.
              </p>
              <button
                type="button"
                className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block"
                disabled={digits.some((x) => !x)}
                aria-busy={busy}
                onClick={() => verify(digits)}
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
                    onClick={() => {
                      setSeconds(RESEND_SECONDS);
                      toast({ kind: 'info', title: 'بعتنالك كود جديد' });
                    }}
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
