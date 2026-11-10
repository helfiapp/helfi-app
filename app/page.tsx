'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import PublicHeader from '@/components/marketing/PublicHeader'
import { absoluteUrl } from '@/lib/site-url'
import styles from './homepage.module.css'

const signupHref = '/auth/signin?mode=signup'
const reportImage = '/MOBILE MOCKUPS/HEALTH TRACKING/MOBILE MOCKUPS/7 DAY HEALTH REPORT-portrait.png'

const features = [
  { name: 'Food diary', href: '/features/nutrition-food', description: 'Log meals by photo, barcode or ingredient search.' },
  { name: 'Daily check-ins', href: '/features/daily-check-ins', description: 'Record your energy, sleep and how you feel.' },
  { name: 'Weekly reports', href: '/features/ai-insights', description: 'Look back at seven days of entries in one report.' },
  { name: 'Health tracking & wearables', href: '/features/health-tracking', description: 'See your daily activity alongside your own notes.' },
  { name: 'Mood tracking', href: '/features/mood-tracking', description: 'Keep a mood journal and see how it changes over time.' },
  { name: 'Health notes', href: '/features/symptom-tracking', description: 'Write down what you noticed and when it happened.' },
  { name: 'Supplements & medications', href: '/features/supplement-safety', description: 'Keep a list and look up possible interactions.' },
  { name: 'Lab reports', href: '/features/lab-reports', description: 'Keep your results together for future reference.' },
  { name: 'Health image notes', href: '/features/health-image-notes', description: 'Save a photo with a date and a note.' },
  { name: 'Talk to Helfi', href: '/features/talk-to-helfi', description: 'Ask a question about the health information you logged.' },
]

const plans = [
  { price: 10, credits: '700', id: 'plan_10_monthly' },
  { price: 20, credits: '1,400', id: 'plan_20_monthly' },
  { price: 30, credits: '2,100', id: 'plan_30_monthly' },
  { price: 50, credits: '3,500', id: 'plan_50_monthly' },
]

const topUps = [
  { price: 5, credits: '250', id: 'credits_250' },
  { price: 10, credits: '500', id: 'credits_500' },
  { price: 20, credits: '1,000', id: 'credits_1000' },
]

const questions = [
  { question: 'What goes into a weekly report?', answer: 'Your weekly report looks at the last seven days of entries, including meals, supplements, sleep, check-ins and health notes. What you see depends on what you log.' },
  { question: 'Can I edit a meal logged from a photo?', answer: 'Yes. A photo gives you an estimate. You can check the ingredients and change portions before saving.' },
  { question: 'Which devices can I connect?', answer: 'Helfi supports Fitbit and Garmin Connect. See Health Tracking for more about connected devices.' },
  { question: 'What can I ask Talk to Helfi?', answer: 'Ask about information you have recorded, such as how you rated your energy this week. You can review entries before they are saved.' },
  { question: 'How does Helfi handle my data?', answer: 'Read what we collect, how we use it, and how you can access or delete your information in our', link: '/privacy' },
  { question: 'Can I use Helfi for medical advice?', answer: 'Helfi helps you organise your own information. Always speak to a qualified healthcare provider about symptoms, treatment or possible medication and supplement interactions.' },
]

const news = [
  { name: 'A simpler way to log meals', href: '/news/complete-food-tracking-workflow', category: 'Food diary' },
  { name: 'What goes into a weekly health report', href: '/news/weekly-health-insights-you-can-use', category: 'Weekly reports' },
  { name: 'Helfi on iPhone and Android', href: '/news/mobile-apps-coming-soon', category: 'Product update' },
]

export default function SplashPage() {
  const { data: session, status } = useSession()
  const [checkoutError, setCheckoutError] = useState('')
  const [videoPlaying, setVideoPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const startHref = status === 'authenticated' ? '/dashboard' : signupHref
  const startLabel = status === 'authenticated' ? 'Go to Dashboard' : 'Create an account'

  useEffect(() => {
    if (videoRef.current) setVideoPlaying(!videoRef.current.paused)
  }, [])

  const toggleHeroVideo = () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      void video.play().catch(() => setVideoPlaying(false))
    } else {
      video.pause()
    }
  }

  const handleCheckout = async (planId: string) => {
    setCheckoutError('')
    // If user is authenticated, go directly to checkout
    if (status === 'authenticated' && session) {
      try {
        const res = await fetch('/api/billing/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: planId }),
        })
        if (res.ok) {
          const { url } = await res.json()
          if (url) {
            window.location.href = url
            return
          }
        }
        setCheckoutError('We could not open the payment page. Please try again.')
        return
      } catch (error) {
        console.error('Checkout error:', error)
        setCheckoutError('We could not open the payment page. Please try again.')
        return
      }
    }
    // If not authenticated, redirect to signin with plan parameter
    window.location.href = `/auth/signin?plan=${encodeURIComponent(planId)}`
  }

  const homepageSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': absoluteUrl('/#organization'),
        name: 'Helfi',
        url: absoluteUrl('/'),
        logo: absoluteUrl('/icons/app-512.png'),
        description:
          'Helfi is a health tracking app with a food diary, daily check-ins, and weekly health reports.',
      },
      {
        '@type': 'WebSite',
        '@id': absoluteUrl('/#website'),
        name: 'Helfi',
        url: absoluteUrl('/'),
        publisher: {
          '@id': absoluteUrl('/#organization'),
        },
        description:
          'Log meals and water, keep health notes, and look back on your week with Helfi.',
        potentialAction: {
          '@type': 'SearchAction',
          target: `${absoluteUrl('/practitioners')}?query={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'WebPage',
        '@id': absoluteUrl('/#webpage'),
        url: absoluteUrl('/'),
        name: 'Helfi | AI Health Tracking App',
        isPartOf: {
          '@id': absoluteUrl('/#website'),
        },
        about: {
          '@id': absoluteUrl('/#organization'),
        },
      },
      {
        '@type': 'MedicalBusiness',
        '@id': absoluteUrl('/#practitioner-directory'),
        name: 'Helfi Practitioner Directory',
        url: absoluteUrl('/practitioners'),
        description:
          'Find trusted healthcare practitioners by category, location, and telehealth options.',
      },
    ],
  }
  return (
    <div className={styles.home}>
      <a className={styles.skipLink} href="#main-content">Skip to content</a>
      <header className={styles.header}>
        <details className={styles.disclaimer}>
          <summary>Medical disclaimer</summary>
          <p>
            Helfi is not a medical device and does not provide medical advice, diagnosis, or treatment.
            Always consult with a qualified healthcare provider before making health-related decisions.{' '}
            <Link href="/terms">View full disclaimer</Link>
          </p>
        </details>
        <PublicHeader />
      </header>

      <main id="main-content">
        <section className={styles.hero}>
          <video
            ref={videoRef}
            className={styles.heroVideo}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            onPlay={() => setVideoPlaying(true)}
            onPause={() => setVideoPlaying(false)}
            onError={() => setVideoPlaying(false)}
          >
            <source src="/screenshots/hero/hero-background.mp4" type="video/mp4" />
          </video>
          <div className={styles.container}>
            <div className={styles.heroCopy}>
              <p className={styles.label}>Health tracking &amp; food diary</p>
              <h1>Keep your health records in one place</h1>
              <p className={styles.lead}>
                Log meals, water, sleep and how you feel. Helfi brings your entries together in a weekly report you can look back on.
              </p>
              <div className={styles.actions}>
                <Link href={startHref} className={styles.primary}>{startLabel}</Link>
                <a href="#why-helfi" className={styles.textLink}>See how it works <span aria-hidden="true">↓</span></a>
              </div>
            </div>
          </div>
          <button type="button" className={styles.videoToggle} onClick={toggleHeroVideo}>
            {videoPlaying ? 'Pause background video' : 'Play background video'}
          </button>
        </section>

        <section id="why-helfi" className={styles.section} aria-labelledby="routine-heading">
          <div className={styles.container}>
            <p className={styles.label}>How it works</p>
            <h2 id="routine-heading">A clearer picture of your week</h2>
            <div className={styles.steps}>
              <article>
                <p className={styles.stepNumber}>01</p>
                <h3>Log what you eat</h3>
                <p>Start with a photo, scan a barcode or search for ingredients. Check the portions before you save.</p>
                <Link className={styles.textLink} href="/features/nutrition-food">Explore the food diary <span aria-hidden="true">↗</span></Link>
              </article>
              <article>
                <p className={styles.stepNumber}>02</p>
                <h3>Check in with yourself</h3>
                <p>Note your sleep, mood or energy in a daily check-in. Add a few words about what was different that day.</p>
                <Link className={styles.textLink} href="/features/daily-check-ins">Explore check-ins <span aria-hidden="true">↗</span></Link>
              </article>
              <article>
                <p className={styles.stepNumber}>03</p>
                <h3>Look back on your week</h3>
                <p>See seven days of entries together and revisit the details you want to remember or discuss at an appointment.</p>
                <Link className={styles.textLink} href="/features/ai-insights">Explore weekly reports <span aria-hidden="true">↗</span></Link>
              </article>
            </div>
          </div>
        </section>

        <section id="features" className={styles.featureSection} aria-labelledby="features-heading">
          <div className={styles.container}>
            <div className={styles.featureGrid}>
              <figure className={styles.reportVisual}>
                <Image
                  className={styles.phone}
                  src={reportImage}
                  alt="Helfi Insights screen with a seven-day report and the next report date"
                  width={1419}
                  height={2796}
                  sizes="(max-width: 700px) 180px, 230px"
                />
                <figcaption>Example from Helfi Insights</figcaption>
              </figure>
              <div>
                <p className={styles.label}>Explore Helfi</p>
                <h2 id="features-heading">More ways to keep track</h2>
                <ul className={styles.featureList}>
                  {features.map(({ name, href, description }) => (
                    <li key={href}>
                      <Link href={href}>
                        <strong>{name}</strong>
                        <span>{description}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link className={styles.textLink} href="/features">View all features <span aria-hidden="true">↗</span></Link>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.directory} aria-labelledby="directory-heading">
          <div className={styles.container}>
            <div className={styles.directoryGrid}>
              <div>
                <p className={styles.label}>Practitioner directory</p>
                <h2 id="directory-heading">Find a practitioner</h2>
                <p>Search by location, specialty or telehealth. Have a practice? Add it to the directory.</p>
              </div>
              <div className={styles.actions}>
                <Link className={styles.lightButton} href="/practitioners">Search the directory</Link>
                <Link className={styles.textLink} href="/list-your-practice">List your practice <span aria-hidden="true">↗</span></Link>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className={styles.section} aria-labelledby="pricing-heading">
          <div className={styles.container}>
            <p className={styles.label}>Pricing</p>
            <h2 id="pricing-heading">Choose a monthly plan</h2>
            <p className={styles.sectionIntro}>Every plan includes access to all features. Credits refresh monthly and unused monthly credits do not roll over.</p>
            {checkoutError && <p className={styles.checkoutError} role="alert">{checkoutError}</p>}
            <div className={styles.plans}>
              {plans.map(({ price, credits, id }) => (
                <article key={id} className={styles.plan}>
                  <h3>${price}<span> / month</span></h3>
                  <p>{credits} credits per month</p>
                  <button type="button" className={styles.outlineButton} onClick={() => handleCheckout(id)}>Choose ${price} plan</button>
                </article>
              ))}
            </div>
            <div className={styles.topUps}>
              <div>
                <h3>Buy extra credits</h3>
                <p>One-time top-ups. Credits are valid for 12 months.</p>
              </div>
              <div className={styles.topUpActions}>
                {topUps.map(({ price, credits, id }) => (
                  <button type="button" key={id} className={styles.outlineButton} onClick={() => handleCheckout(id)}>
                    {credits} credits · ${price}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className={styles.faq} aria-labelledby="faq-heading">
          <div className={styles.container}>
            <div className={styles.faqGrid}>
              <div>
                <p className={styles.label}>Help</p>
                <h2 id="faq-heading">Common questions</h2>
                <Link className={styles.textLink} href="/faq">Read the full FAQ <span aria-hidden="true">↗</span></Link>
              </div>
              <div className={styles.questions}>
                {questions.map(({ question, answer, link }) => (
                  <details key={question}>
                    <summary>{question}</summary>
                    <p>{answer}{link && <> <Link href={link}>Privacy Policy</Link>.</>}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="news-heading">
          <div className={styles.container}>
            <p className={styles.label}>Guides &amp; updates</p>
            <div className={styles.sectionHeading}>
              <h2 id="news-heading">From Helfi</h2>
              <Link className={styles.textLink} href="/news">All news <span aria-hidden="true">↗</span></Link>
            </div>
            <div className={styles.news}>
              {news.map(({ name, href, category }) => (
                <Link key={href} href={href}>
                  <span>{category}</span>
                  <strong>{name}</strong>
                  <span aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerTop}>
            <div>
              <Link href="/" aria-label="Helfi home">
                <Image src="/mobile-assets/LOGOS/helfi-01-06.svg" alt="Helfi" width={126} height={67} />
              </Link>
              <p>A food diary and health tracker for everyday life.</p>
            </div>
            <Link className={styles.lightButton} href={startHref}>{startLabel}</Link>
          </div>
          <div className={styles.footerLinks}>
            <div>
              <h3>Explore</h3>
              <Link href="/features">Features</Link>
              <a href="#pricing">Pricing</a>
              <Link href="/practitioners">Practitioner directory</Link>
              <Link href="/news">News</Link>
            </div>
            <div id="affiliate">
              <h3>For partners</h3>
              <Link href="/list-your-practice">List your practice</Link>
              <Link href="/affiliate/apply">Affiliate program</Link>
              <Link href="/affiliate/terms">Affiliate terms</Link>
            </div>
            <div>
              <h3>Help &amp; legal</h3>
              <Link href="/faq">FAQ</Link>
              <Link href="/support">Contact</Link>
              <Link href="/privacy">Privacy policy</Link>
              <Link href="/terms">Terms of service</Link>
            </div>
          </div>
          <div className={styles.footerBottom}>
            <span>© Helfi. All rights reserved.</span>
            <a href="#main-content">Back to top ↑</a>
          </div>
        </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageSchema) }}
      />
    </div>
  )
}
