type PhoneMockupProps = {
  src: string
  alt: string
  className?: string
}

export function PhoneMockup({ src, alt, className = '' }: PhoneMockupProps) {
  return (
    <div className={`relative mx-auto w-full max-w-[260px] sm:max-w-[280px] md:max-w-[300px] ${className}`}>
      <div className='absolute -inset-4 rounded-[3rem] bg-gold/10 blur-2xl' aria-hidden />
      <img
        src={src}
        alt={alt}
        className='relative w-full drop-shadow-2xl'
        loading='eager'
        decoding='async'
      />
    </div>
  )
}
