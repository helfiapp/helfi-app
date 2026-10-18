// Preserve the existing main voice route's exact matcher and support message.
// The parity regression executes both sources, including quoted language.
const SELF_HARM_RISK_PATTERN =
  /\b(kill myself|hurt myself|hurting myself|harm myself|harming myself|end my life|suicide|suicidal|self[-\s]?harm|do not want to live|don't want to live|want to die|wish i was dead|can't go on|cant go on)\b/i

export function structuredVoiceSafetyMessage(value: unknown): string | undefined {
  if (!SELF_HARM_RISK_PATTERN.test(String(value || ''))) return undefined
  return 'If you might hurt yourself or are in immediate danger, call your local emergency number now. I can open Talk to Helfi with your message ready, but please contact urgent support right away.'
}
