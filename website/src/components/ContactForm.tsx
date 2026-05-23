import { useState, type FormEvent } from 'react'
import { submitContact } from '@/lib/api'
import { useLocale } from '@/lib/locale'

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
      <div className='rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-teal-900'>
        {t('Thanks — we received your message.', 'شكراً — استلمنا رسالتك.')}
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className='grid max-w-xl gap-4'>
      <div className='grid gap-4 sm:grid-cols-2'>
        <label className='grid gap-1 text-sm font-medium'>
          {t('Name', 'الاسم')}
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className='rounded-lg border border-slate-300 px-3 py-2'
          />
        </label>
        <label className='grid gap-1 text-sm font-medium'>
          {t('Email', 'البريد الإلكتروني')}
          <input
            required
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className='rounded-lg border border-slate-300 px-3 py-2'
          />
        </label>
      </div>
      <label className='grid gap-1 text-sm font-medium'>
        {t('Subject (optional)', 'الموضوع (اختياري)')}
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className='rounded-lg border border-slate-300 px-3 py-2'
        />
      </label>
      <label className='grid gap-1 text-sm font-medium'>
        {t('Message', 'الرسالة')}
        <textarea
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className='rounded-lg border border-slate-300 px-3 py-2'
        />
      </label>
      {error ? <p className='text-sm text-red-600'>{error}</p> : null}
      <button
        type='submit'
        disabled={status === 'sending'}
        className='w-fit rounded-lg bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-dark disabled:opacity-60'
      >
        {status === 'sending' ? t('Sending…', 'جاري الإرسال…') : t('Send message', 'إرسال')}
      </button>
    </form>
  )
}
