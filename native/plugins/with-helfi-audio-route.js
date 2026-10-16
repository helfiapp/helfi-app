const fs = require('node:fs')
const path = require('node:path')
const { withXcodeProject, IOSConfig } = require('@expo/config-plugins')

// Keep generated iOS builds on the same reviewed voice route/player source.
module.exports = function withHelfiAudioRoute(config) {
  return withXcodeProject(config, current => {
    const projectName = current.modRequest.projectName || 'Helfi'
    const relative = `${projectName}/HelfiAudioRoute.m`
    const destination = path.join(current.modRequest.platformProjectRoot, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(path.join(__dirname, 'helfi-audio-route/HelfiAudioRoute.m'), destination)
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: relative, groupName: projectName, project: current.modResults })
    return current
  })
}
