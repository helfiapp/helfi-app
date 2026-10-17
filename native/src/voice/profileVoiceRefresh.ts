/** Small pure helpers shared by the mounted Profile refresh and offline checks. */
export type VoiceProfileForm = { firstName: string; lastName: string; bio: string; dateOfBirth: string; gender: '' | 'male' | 'female' | 'other' | 'prefer-not-to-say' }
export const voiceProfileKeys = ['firstName','lastName','bio','dateOfBirth','gender'] as const
export function profileVoicePatch(payload: any, accountId: string | undefined): Partial<VoiceProfileForm> | null {
  if(!accountId||payload?.source!=='voice-assistant'||payload.accountId!==accountId||payload.kind!=='preference_action'||payload.action!=='profile.update'||typeof payload.completionId!=='string'||!payload.completionId||payload.completionId.length>200)return null
  const values=payload.values
  if(!values||typeof values!=='object'||Array.isArray(values))return null
  const keys=Object.keys(values)
  if(!keys.length||keys.some(key=>!voiceProfileKeys.includes(key as any)))return null
  for(const key of keys){const value=values[key];if(typeof value!=='string'||value.includes('\0')||value.length>(key==='bio'?2000:key==='dateOfBirth'?10:160))return null}
  if(values.gender!==undefined&&!['male','female','other','prefer-not-to-say'].includes(values.gender))return null
  if(values.dateOfBirth!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(values.dateOfBirth)||!Number.isFinite(Date.parse(values.dateOfBirth+'T12:00:00Z'))||new Date(values.dateOfBirth+'T12:00:00Z').toISOString().slice(0,10)!==values.dateOfBirth))return null
  return {...values}
}
export function normalizeVoiceProfile(payload: any): VoiceProfileForm {
  const data=payload?.data||{},info=data.profileInfo||{},rawGender=String(info.gender||data.gender||'').trim().toLowerCase()
  return {firstName:String(info.firstName||'').trim(),lastName:String(info.lastName||'').trim(),bio:String(info.bio||'').trim(),dateOfBirth:String(info.dateOfBirth||'').trim(),gender:['male','female','other','prefer-not-to-say'].includes(rawGender)?rawGender as VoiceProfileForm['gender']:''}
}
export function mergeProfileRead(server: VoiceProfileForm, current: VoiceProfileForm, baseline: VoiceProfileForm | null): VoiceProfileForm {
  if(!baseline)return {...server}
  const next={...server}
  for(const key of voiceProfileKeys)if(current[key]!==baseline[key])(next as any)[key]=current[key]
  return next
}
export function profilePatchMatches(server: VoiceProfileForm, patch: Partial<VoiceProfileForm>): boolean {
  return Object.entries(patch).every(([key,value])=>server[key as keyof VoiceProfileForm]===value)
}
