import React from 'react'

import { NATIVE_WEB_PAGES } from '../config/nativePageRoutes'
import { NativeWebToolScreen } from './NativeWebToolScreen'

export function HealthSetupScreen() {
  return <NativeWebToolScreen route={{ params: NATIVE_WEB_PAGES.healthIntake }} />
}
