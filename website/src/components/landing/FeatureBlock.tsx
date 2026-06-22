import { PhoneMockup } from '@/components/landing/PhoneMockup'

type FeatureBlockProps = {
  title: string
  body: string
  imageSrc: string
  imageAlt: string
  reverse?: boolean
}

export function FeatureBlock({ title, body, imageSrc, imageAlt, reverse = false }: FeatureBlockProps) {
  return (
    <div
      className={`landing-section-divider mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:gap-16 md:py-24 ${
        reverse ? 'md:[&>*:first-child]:order-2' : ''
      }`}
    >
      <div className='flex flex-col justify-center'>
        <h2 className='mb-4 text-2xl font-bold tracking-tight text-white md:text-3xl'>{title}</h2>
        <p className='max-w-lg text-base leading-relaxed text-soft-gray md:text-lg'>{body}</p>
      </div>
      <PhoneMockup
        src={imageSrc}
        alt={imageAlt}
        className={reverse ? 'md:justify-self-start' : 'md:justify-self-end'}
      />
    </div>
  )
}
