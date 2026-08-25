import { getEmailProviderName, Resend } from '../lib/email-client'

async function main() {
  process.env.EMAIL_PROVIDER = 'aws-ses'
  process.env.AWS_SES_REGION = 'ap-southeast-2'
  delete process.env.AWS_SES_ACCESS_KEY_ID
  delete process.env.AWS_SES_SECRET_ACCESS_KEY
  delete process.env.RESEND_API_KEY

  if (getEmailProviderName() !== 'aws-ses') {
    throw new Error('AWS SES was not selected when its settings were present.')
  }

  const client = new Resend()
  let capturedInput: any = null

  ;(client as any).sesClient = {
    send: async (command: any) => {
      capturedInput = command.input
      return { MessageId: 'test-message-id' }
    },
  }

  const result = await client.emails.send({
    from: 'Helfi Team <support@helfi.ai>',
    to: ['person@example.com'],
    cc: 'copy@example.com',
    bcc: ['hidden@example.com'],
    subject: 'Email provider check',
    html: '<p>It works.</p>',
    text: 'It works.',
    replyTo: 'support@helfi.ai',
  })

  if (result.data?.id !== 'test-message-id') {
    throw new Error('AWS SES message ID was not returned in the expected format.')
  }

  if (capturedInput?.FromEmailAddress !== 'Helfi Team <support@helfi.ai>') {
    throw new Error('AWS SES sender was not preserved.')
  }

  if (capturedInput?.Destination?.ToAddresses?.[0] !== 'person@example.com') {
    throw new Error('AWS SES recipient was not preserved.')
  }

  if (capturedInput?.Destination?.CcAddresses?.[0] !== 'copy@example.com') {
    throw new Error('AWS SES CC recipient was not preserved.')
  }

  if (capturedInput?.Destination?.BccAddresses?.[0] !== 'hidden@example.com') {
    throw new Error('AWS SES BCC recipient was not preserved.')
  }

  if (capturedInput?.ReplyToAddresses?.[0] !== 'support@helfi.ai') {
    throw new Error('AWS SES reply-to address was not preserved.')
  }

  if (capturedInput?.Content?.Simple?.Body?.Html?.Data !== '<p>It works.</p>') {
    throw new Error('AWS SES HTML content was not preserved.')
  }

  if (capturedInput?.Content?.Simple?.Body?.Text?.Data !== 'It works.') {
    throw new Error('AWS SES text content was not preserved.')
  }

  process.env.EMAIL_PROVIDER = 'resend'
  process.env.RESEND_API_KEY = 'test-resend-key'
  if (getEmailProviderName() !== 'resend') {
    throw new Error('Resend was not retained as the requested fallback provider.')
  }

  console.log('✅ Email provider compatibility check passed.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
