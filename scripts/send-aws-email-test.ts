import { getEmailProviderName, Resend } from '../lib/email-client'

async function main() {
  const recipients = (process.env.LIVE_EMAIL_TEST_TO || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (recipients.length === 0) throw new Error('LIVE_EMAIL_TEST_TO is required.')
  if (getEmailProviderName() !== 'aws-ses') throw new Error('AWS SES is not selected.')

  const client = new Resend()
  const result = await client.emails.send({
    from: 'Helfi Team <support@helfi.ai>',
    to: recipients,
    subject: 'Helfi AWS email delivery check',
    text: 'This is an automated delivery check for Helfi\'s move to AWS email.',
    html: '<p>This is an automated delivery check for Helfi\'s move to AWS email.</p>',
    replyTo: 'support@helfi.ai',
  })

  if (!result.data?.id || result.error) throw new Error('AWS SES did not confirm the test send.')
  console.log(`✅ AWS SES accepted the Helfi delivery test for ${recipients.length} recipients.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
