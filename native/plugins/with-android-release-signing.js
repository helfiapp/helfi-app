const { withAppBuildGradle } = require('@expo/config-plugins')

const marker = '// HELFI_GOOGLE_PLAY_SIGNING'
const signing = `
${marker}
// Never use Expo's public debug key for a store release. Secrets stay outside source.
def helfiUploadValues = ['STORE_FILE', 'STORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD'].collectEntries {
    [(it): System.getenv('HELFI_ANDROID_UPLOAD_' + it)]
}
def helfiHasUploadSigning = helfiUploadValues.values().every { it != null && !it.trim().isEmpty() }
android.buildTypes.release.signingConfig = null
if (helfiHasUploadSigning) {
    def helfiStoreFile = file(helfiUploadValues.STORE_FILE).canonicalFile
    def helfiSourceRoot = new File(projectRoot).parentFile.canonicalPath
    if (!helfiStoreFile.isFile() || helfiStoreFile.path.startsWith(helfiSourceRoot + File.separator)) {
        throw new GradleException('Helfi upload keystore must exist outside the app source folder.')
    }
    android.signingConfigs.create('helfiUpload') {
        storeFile helfiStoreFile
        storePassword helfiUploadValues.STORE_PASSWORD
        keyAlias helfiUploadValues.KEY_ALIAS
        keyPassword helfiUploadValues.KEY_PASSWORD
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.helfiUpload
}
gradle.taskGraph.whenReady { graph ->
    def helfiStoreBuild = graph.allTasks.any {
        it.project == project && it.name in ['bundleRelease', 'assembleRelease', 'packageRelease']
    }
    if (helfiStoreBuild && !helfiHasUploadSigning) {
        throw new GradleException('Helfi store release requires its private upload signing key. Debug signing is prohibited.')
    }
}
// END_HELFI_GOOGLE_PLAY_SIGNING
`

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('Helfi release signing requires the existing Groovy build configuration.')
    mod.modResults.contents = mod.modResults.contents.replace(
      /(\brelease\s*\{[\s\S]*?\bsigningConfig\s+)signingConfigs\.debug/,
      '$1null',
    )
    const existing = mod.modResults.contents.indexOf(marker)
    if (existing !== -1) {
      const endMarker = '// END_HELFI_GOOGLE_PLAY_SIGNING'
      const end = mod.modResults.contents.indexOf(endMarker, existing)
      const after = end === -1 ? '' : mod.modResults.contents.slice(end + endMarker.length)
      mod.modResults.contents = mod.modResults.contents.slice(0, existing).trimEnd() + signing + after
    } else mod.modResults.contents += signing
    return mod
  })
}
