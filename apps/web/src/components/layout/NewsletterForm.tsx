'use client';

import { useToast } from '@sabeq/ui';
import { useState, type FormEvent } from 'react';

const EMAIL = /.+@.+\..+/;

/** Footer sign-up for «مواعيد التنسيق». The API endpoint is wired in Phase 19 (Notifications). */
export function NewsletterForm() {
  const toast = useToast();
  const [email, setEmail] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) {
      toast({
        kind: 'error',
        title: 'الإيميل مش مظبوط',
        description: 'اكتب إيميل صحيح زي name@mail.com',
      });
      return;
    }
    setEmail('');
    toast({ kind: 'success', title: 'اشتركت', description: 'هنبعتلك مواعيد التنسيق أول بأول.' });
  }

  return (
    <form className="news" onSubmit={onSubmit} noValidate>
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        dir="auto"
        placeholder="إيميلك لمواعيد التنسيق"
        aria-label="البريد الإلكتروني"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="submit" className="sb-btn sb-btn--night sb-btn--sm">
        اشترك
      </button>
    </form>
  );
}
