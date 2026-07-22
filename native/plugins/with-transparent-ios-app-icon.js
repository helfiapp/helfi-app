const fs = require('fs')
const path = require('path')

const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins')

const composerIconName = 'HelfiFlat'

function copyDirectory(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true })
  fs.cpSync(source, destination, { recursive: true })
}

module.exports = function withTransparentIosAppIcon(config) {
  config = withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const iconSetSource = path.join(
        modConfig.modRequest.projectRoot,
        'assets',
        'ios-app-icon',
        'AppIcon.appiconset'
      )
      const iconSetDestination = path.join(
        modConfig.modRequest.platformProjectRoot,
        'Helfi',
        'Images.xcassets',
        'AppIcon.appiconset'
      )
      const composerIconSource = path.join(
        modConfig.modRequest.projectRoot,
        'assets',
        `${composerIconName}.icon`
      )
      const composerIconDestination = path.join(
        modConfig.modRequest.platformProjectRoot,
        'Helfi',
        `${composerIconName}.icon`
      )

      copyDirectory(iconSetSource, iconSetDestination)
      copyDirectory(composerIconSource, composerIconDestination)
      return modConfig
    },
  ])

  config = withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults
    const iconPath = `Helfi/${composerIconName}.icon`

    if (!project.hasFile(iconPath)) {
      const target = project.getTarget('com.apple.product-type.application')
      const mainGroup = project.getPBXGroupByKey(
        project.getFirstProject().firstProject.mainGroup
      )
      const appGroupKey = mainGroup.children.find(
        (child) => child.comment === 'Helfi'
      )?.value

      if (!target?.uuid || !appGroupKey) {
        throw new Error('Unable to locate the Helfi iOS target or project group')
      }

      project.addResourceFile(
        iconPath,
        {
          target: target.uuid,
          lastKnownFileType: 'folder.iconcomposer.icon',
        },
        appGroupKey
      )
    }

    for (const value of Object.values(
      project.pbxXCBuildConfigurationSection()
    )) {
      if (
        value?.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER === 'ai.helfi.app'
      ) {
        value.buildSettings.ASSETCATALOG_COMPILER_APPICON_NAME = composerIconName
      }
    }

    return modConfig
  })

  return config
}
