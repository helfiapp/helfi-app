const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
// The reviewed pure SHA-256 implementation is already installed and locked in
// the main app. Watch only its package, without widening native's project root
// or changing React/native module resolution.
const sha256Package = path.dirname(require.resolve('@aws-crypto/sha256-js/package.json', { paths: [path.resolve(__dirname, '..')] }))
config.watchFolders = [...new Set([...config.watchFolders, sha256Package])]

module.exports = config
