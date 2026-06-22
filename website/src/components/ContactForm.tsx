import { useState, type FormEvent } from 'react'
import { submitContact } from '@/lib/api'
import { useLocale } from '@/lib/locale'

const inputClassName =
  'rounded-lg border border-divider bg-white px-3 py-2 text-ink outline-none transition-colors focus:border-gold focus:ring-1 focus:ring-gold'

export function ContactForm() {
  const { t } = useLocale()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)
    try {
      await submitContact({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim() || undefined,
        message: message.trim(),
      })
      setStatus('sent')
      setName('')
      setEmail('')
      setSubject('')
      setMessage('')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : t('Something went wrong', 'حدث خطأ'))
    }
  }

  if (status === 'sent') {
    return (
      <div className='rounded-xl border border-gold/30 bg-navy-light/5 px-4 py-3 text-ink'>
        {t('Thanks — we received your message.', 'شكراً — استلمنا رسالتك.')}
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className='grid max-w-xl gap-4'>
      <div className='grid gap-4 sm:grid-cols-2'>
        <label className='grid gap-1 text-sm font-medium text-ink'>
          {t('Name', 'الاسم')}
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClassName}
          />
        </label>
        <label className='grid gap-1 text-sm font-medium text-ink'>
          {t('Email', 'البريد الإلكتروني')}
          <input
            required
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClassName}
          />
        </label>
      </div>
      <label className='grid gap-1 text-sm font-medium text-ink'>
        {t('Subject (optional)', 'الموضوع (اختياري)')}
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={inputClassName}
        />
      </label>
      <label className='grid gap-1 text-sm font-medium text-ink'>
        {t('Message', 'الرسالة')}
        <textarea
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={inputClassName}
        />
      </label>
      {error ? <p className='text-sm text-crimson'>{error}</p> : null}
      <button
        type='submit'
        disabled={status === 'sending'}
        className='w-fit rounded-lg bg-gold px-5 py-2.5 font-medium text-ink transition-colors hover:bg-gold-pressed disabled:opacity-60'
      >
        {status === 'sending' ? t('Sending…', 'جاري الإرسال…') : t('Send message', 'إرسال')}
      </button>
    </form>
  )
}
