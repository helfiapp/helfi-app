const fs = require('fs')
const path = require('path')

const { withDangerousMod } = require('@expo/config-plugins')

module.exports = function withTransparentIosAppIcon(config) {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const source = path.join(modConfig.modRequest.projectRoot, 'assets', 'icon.png')
      const destination = path.join(
        modConfig.modRequest.platformProjectRoot,
        'Helfi',
        'Images.xcassets',
        'AppIcon.appiconset',
        'App-Icon-1024x1024@1x.png'
      )

      fs.copyFileSync(source, destination)
      return modConfig
    },
  ])
}
