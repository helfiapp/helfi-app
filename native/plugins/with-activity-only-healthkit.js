const { withBaseMod } = require('@expo/config-plugins')

// react-native-health adds an empty clinical-access entitlement by default.
// Activity reads only need HealthKit; even the empty key requests a separate
// Verifiable Health Records provisioning capability in Xcode.
module.exports = function withActivityOnlyHealthKit(config) {
  return withBaseMod(config, {
    platform: 'ios',
    mod: 'entitlements',
    isIntrospective: true,
    async action(current) {
      const result = await current.modRequest.nextMod(current)
      const entitlements = result.modResults
      const clinicalAccess = entitlements['com.apple.developer.healthkit.access']
      if (
        (clinicalAccess !== undefined &&
          (!Array.isArray(clinicalAccess) || clinicalAccess.length > 0)) ||
        entitlements['com.apple.developer.healthkit.background-delivery']
      ) {
        throw new Error('Helfi supports activity reads only; clinical and background Health access are not enabled.')
      }
      delete entitlements['com.apple.developer.healthkit.access']
      entitlements['com.apple.developer.healthkit'] = true
      return result
    },
  })
}
