// codesign refuses files with extended attributes (Finder info, quarantine/provenance flags),
// which files under ~/Documents often carry. Strip them before electron-builder signs.
const { execFileSync } = require('node:child_process')

exports.default = async function afterPack(context) {
  execFileSync('xattr', ['-cr', context.appOutDir])
}
