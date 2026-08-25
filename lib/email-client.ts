import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { Resend as ResendSdk } from 'resend'

type AddressValue = string | string[]

export type EmailSendOptions = {
  from: string
  to: AddressValue
  subject: string
  html?: string
  text?: string
  cc?: AddressValue
  bcc?: AddressValue
  replyTo?: AddressValue
}

export type EmailSendResult = {
  data: { id?: string } | null
  error: unknown | null
}

export type EmailProviderName = 'aws-ses' | 'resend' | 'none'

const normalizeAddresses = (value?: AddressValue): string[] | undefined => {
  if (!value) return undefined
  const values = Array.isArray(value) ? value : [value]
  const addresses = values.map((item) => item.trim()).filter(Boolean)
  return addresses.length ? addresses : undefined
}

const awsSesConfigured = () => Boolean(process.env.AWS_SES_REGION)

export function getEmailProviderName(): EmailProviderName {
  const requested = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase()

  if (requested === 'aws' || requested === 'ses' || requested === 'aws-ses') {
    return awsSesConfigured() ? 'aws-ses' : 'none'
  }

  if (requested === 'resend') {
    return process.env.RESEND_API_KEY ? 'resend' : 'none'
  }

  if (awsSesConfigured()) return 'aws-ses'
  if (process.env.RESEND_API_KEY) return 'resend'
  return 'none'
}

export function isEmailConfigured(): boolean {
  return getEmailProviderName() !== 'none'
}

/**
 * Compatibility client used while Helfi moves from Resend to AWS SES.
 * It keeps the existing `emails.send(...)` call pattern so protected email
 * flows do not need their delivery/error-handling behaviour rewritten.
 */
export class Resend {
  private readonly resendClient: ResendSdk | null
  private readonly sesClient: SESv2Client | null

  constructor(resendApiKey?: string) {
    const provider = getEmailProviderName()
    this.resendClient = provider === 'resend'
      ? new ResendSdk(resendApiKey || process.env.RESEND_API_KEY || '')
      : null
    const explicitSesCredentials = process.env.AWS_SES_ACCESS_KEY_ID && process.env.AWS_SES_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY,
        }
      : undefined

    this.sesClient = provider === 'aws-ses'
      ? new SESv2Client({
          region: process.env.AWS_SES_REGION,
          ...(explicitSesCredentials ? { credentials: explicitSesCredentials } : {}),
        })
      : null
  }

  readonly emails = {
    send: async (options: EmailSendOptions): Promise<EmailSendResult> => {
      if (this.sesClient) {
        const html = options.html || undefined
        const text = options.text || undefined
        if (!html && !text) {
          throw new Error('Email content is missing.')
        }

        const result = await this.sesClient.send(new SendEmailCommand({
          FromEmailAddress: options.from,
          Destination: {
            ToAddresses: normalizeAddresses(options.to),
            CcAddresses: normalizeAddresses(options.cc),
            BccAddresses: normalizeAddresses(options.bcc),
          },
          ReplyToAddresses: normalizeAddresses(options.replyTo),
          Content: {
            Simple: {
              Subject: { Data: options.subject, Charset: 'UTF-8' },
              Body: {
                ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}),
                ...(text ? { Text: { Data: text, Charset: 'UTF-8' } } : {}),
              },
            },
          },
        }))

        return {
          data: { id: result.MessageId },
          error: null,
        }
      }

      if (this.resendClient) {
        return this.resendClient.emails.send(options as any) as Promise<EmailSendResult>
      }

      throw new Error('Email service is not configured.')
    },
  }
}
