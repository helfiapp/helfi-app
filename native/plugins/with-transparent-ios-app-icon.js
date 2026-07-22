const fs = require('fs')
const path = require('path')

const { withDangerousMod } = require('@expo/config-plugins')

module.exports = function withTransparentIosAppIcon(config) {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const source = path.join(
        modConfig.modRequest.projectRoot,
        'assets',
        'ios-app-icon',
        'AppIcon.appiconset'
      )
      const destination = path.join(
        modConfig.modRequest.platformProjectRoot,
        'Helfi',
        'Images.xcassets',
        'AppIcon.appiconset'
      )

      fs.rmSync(destination, { recursive: true, force: true })
      fs.cpSync(source, destination, { recursive: true })
      return modConfig
    },
  ])
}
