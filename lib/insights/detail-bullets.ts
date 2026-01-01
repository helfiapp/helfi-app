export type DetailVariant =
  | 'working'
  | 'suggested'
  | 'avoid'
  | 'nutrition-working'
  | 'nutrition-suggested'
  | 'nutrition-avoid'
  | 'labs-data'

type BuildDetailParams = {
  reason?: string | null
  dosage?: string | null
  timing?: string[] | null
  suggestion?: string | null
  example?: string | null
  variant: DetailVariant
}

const splitSentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

const formatDoseTiming = (dosage?: string | null, timing?: string[] | null) => {
  const dose = dosage && dosage.trim().length ? `Dose: ${dosage.trim()}` : ''
  const time =
    Array.isArray(timing) && timing.length ? `Timing: ${timing.join(', ')}` : ''
  const parts = [dose, time].filter(Boolean)
  return parts.length ? parts.join(' • ') : ''
}

export const buildDetailBullets = ({
  reason,
  dosage,
  timing,
  suggestion,
  example,
  variant,
}: BuildDetailParams): string[] => {
  const sentences = splitSentences(reason?.trim() || '')
  const first = sentences[0] || ''
  const rest = sentences.slice(1).join(' ')
  const doseTiming = formatDoseTiming(dosage, timing)

  switch (variant) {
    case 'working':
      return [
        `Why it helps: ${first || 'Supports this issue based on your current log.'}`,
        `How it works: ${
          rest || 'Supports this issue through known mechanisms and response tracking.'
        }`,
        `How you're using it: ${doseTiming || 'Add dose and timing to personalize guidance.'}`,
      ]
    case 'suggested':
      return [
        `Why it could help: ${first || 'Commonly recommended for this issue.'}`,
        `How it works: ${rest || 'Targets common drivers linked to this issue.'}`,
        `How to try it: ${
          suggestion || 'Discuss dose and timing with your clinician first.'
        }`,
      ]
    case 'avoid':
      return [
        `Why to limit: ${first || 'May not align well with this issue right now.'}`,
        `What to watch: ${
          rest || 'Potential unwanted effects or interactions for this issue.'
        }`,
        `Current use: ${doseTiming || 'If you use it, review with your clinician.'}`,
      ]
    case 'nutrition-working':
      return [
        `Why it helps: ${first || 'Supports this issue based on your food log.'}`,
        `How it works: ${rest || 'Promotes steadier energy and symptom support.'}`,
        `Example from your log: ${
          example || 'Log meals so we can highlight examples here.'
        }`,
      ]
    case 'nutrition-suggested':
      return [
        `Why it could help: ${first || 'Fills common nutrition gaps for this issue.'}`,
        `How it works: ${rest || 'Supports key nutrients and stability.'}`,
        'How to try it: Plan a meal with this focus and log how you feel.',
      ]
    case 'nutrition-avoid':
      return [
        `Why to limit: ${first || 'May worsen symptoms or energy swings.'}`,
        `What to watch: ${
          rest || 'Notice if symptoms rise after these foods.'
        }`,
        'Swap idea: Use a steadier option from Suggested Foods.',
      ]
    case 'labs-data':
      return [
        `Why it matters: ${first || 'This marker helps track progress over time.'}`,
        `What to do next: ${
          rest || 'Track trends and discuss changes with your clinician.'
        }`,
      ]
    default:
      return []
  }
}
