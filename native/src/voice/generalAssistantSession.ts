export type GeneralAssistantView = {
  id: string; actorId: string; revision: number; status: 'active' | 'completed' | 'stopped'
  currentStepIds?: string[]
  steps: Array<{ id: string; operation: string; kind: 'read' | 'write' | 'person'; status: string; review?: { id: string; summary: string }; recoveryActionId?: string; confirmedReviewId?: string; result?: unknown }>
}
export function newGeneralAssistantSessionId() { return `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 14)}` }
export function acceptGeneralAssistantResponse(data: any, accountId: string, sessionId: string, reviewId?: string) {
  if (data?.success !== true || data?.draft?.action !== 'assistant_plan' || !accountId || !/^[A-Za-z0-9_-]{1,120}$/.test(sessionId)) return null
  const view = data.assistant as GeneralAssistantView | undefined, draft = data.draft
  if (view && (view.id !== sessionId || view.actorId !== accountId || !Number.isSafeInteger(view.revision) || view.revision < 1 || !['active','completed','stopped'].includes(view.status) || !Array.isArray(view.steps) || view.steps.length > 20)) return null
  if (!view && (draft.canConfirm || data.draft.assistantPlan?.revision !== 0)) return null
  if (view && (view.steps.some(step => !step || typeof step.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(step.id) || typeof step.operation !== 'string' || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(step.operation) || !['read','write','person'].includes(step.kind) || !['pending','needs_details','review','executing','awaiting_person','completed','uncertain','cancelled'].includes(step.status)) || new Set(view.steps.map(step => step.id)).size !== view.steps.length)) return null
  if (view && (view.steps.filter(step => step.status === 'review').length > 1 || view.status === 'completed' && view.steps.some(step => step.status !== 'completed'))) return null
  if (view?.currentStepIds !== undefined && (!Array.isArray(view.currentStepIds) || view.currentStepIds.length > 20 || new Set(view.currentStepIds).size !== view.currentStepIds.length || view.currentStepIds.some(id => typeof id !== 'string' || !view.steps.some(step => step.id === id)))) return null
  if (draft.autoSave !== false || typeof draft.canConfirm !== 'boolean' || typeof draft.confirmationMessage !== 'string' || !draft.confirmationMessage.trim() || draft.assistantPlan?.sessionId !== sessionId || draft.assistantPlan?.revision !== (view?.revision ?? 0)) return null
  const review = view?.steps.find(step => step.status === 'review')?.review
  if (view?.steps.some(step => step.status === 'review' && (step.kind === 'read' || !step.review || typeof step.review.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(step.review.id) || typeof step.review.summary !== 'string' || !step.review.summary.trim()))) return null
  if (draft.canConfirm !== Boolean(review) || review && (review.id !== draft.assistantPlan.reviewId || review.summary !== draft.confirmationMessage)) return null
  if (reviewId && !view?.steps.some(step => step.review?.id === reviewId || step.confirmedReviewId === reviewId)) return null
  const currentSteps = view?.steps.filter(step => !view.currentStepIds || view.currentStepIds.includes(step.id))
  const saved = Boolean(view?.status === 'completed' && currentSteps?.some(step => step.kind === 'write') && currentSteps.every(step => step.status === 'completed' && !(step.kind === 'write' && step.result && typeof step.result === 'object' && ((step.result as any).saved === false || (step.result as any).safeToClaimSaved === false || ['uncertain','generated_not_saved','pending','failed','error','cancelled'].includes((step.result as any).status)))))
  const uncertain = Boolean(view?.steps.some(step => ['uncertain','executing'].includes(step.status)))
  return { view, draft, saved, uncertain, needsReview: draft.canConfirm, message: draft.confirmationMessage, completedOperations: view?.steps.filter(step => step.status === 'completed').map(step => step.operation) || [] }
}
