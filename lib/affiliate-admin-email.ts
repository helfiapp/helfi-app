import { Resend } from 'resend'

export async function notifyAdminAffiliateManualReview(options: {
  toEmail: string
  applicationId: string
  applicantEmail: string
  applicantName: string
  riskLevel: 'MEDIUM' | 'HIGH'
  reasoning: string
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: 'Helfi Alerts <support@helfi.ai>',
    to: options.toEmail,
    subject: `Affiliate application needs review (${options.riskLevel})`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2>Affiliate application flagged for manual review</h2>
        <p><strong>Risk:</strong> ${options.riskLevel}</p>
        <p><strong>Applicant:</strong> ${options.applicantName} (${options.applicantEmail})</p>
        <p><strong>Application ID:</strong> ${options.applicationId}</p>
        <p><strong>Reasoning:</strong> ${options.reasoning}</p>
        <p>Open the admin panel to review.</p>
      </div>
    `,
  })
}

