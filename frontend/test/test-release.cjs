const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const source = fs.readFileSync(path.join(__dirname, "../app.config.js"), "utf8")
function build(env, status = "", gitAvailable = true) {
  const context = {
    module: { exports: {} },
    __dirname: path.join(__dirname, ".."),
    process: { env },
    require: name => {
      if (name === "./package.json") return { version: "1.2.3" }
      if (name === "node:child_process") return { execFileSync: (_, argument) => {
        if (!gitAvailable) throw new Error("Git unavailable")
        return argument[0] === "rev-parse" ? "abcdef1234567890" : status
      } }
      throw new Error(`Unexpected dependency ${name}`)
    },
  }
  vm.runInNewContext(source, context)
  return context.module.exports({ config: { name: "SIS Companion", extra: { preserved: true } } })
}

const local = build({}, " M README.md")
assert.equal(local.version, "1.2.3")
assert.equal(local.extra.preserved, true)
assert.equal(local.extra.release.commit, "abcdef1234567890")
assert.equal(local.extra.release.dirty, true)
assert.ok(!Number.isNaN(Date.parse(local.extra.release.builtAt)))
assert.equal(build({ VERCEL_GIT_COMMIT_SHA: "1234567abcdef" }).extra.release.commit, "1234567abcdef")
const docker = build({ BUILD_COMMIT: "9876543abcdef", BUILD_DIRTY: "true" }, "", false)
assert.equal(docker.extra.release.commit, "9876543abcdef")
assert.equal(docker.extra.release.dirty, true)
assert.equal(build({}, "", false).extra.release.commit, null)
assert.equal(build({ BUILD_COMMIT: "not-a-valid-revision" }).extra.release.commit, null)
console.log("Release metadata: shared version, config preservation, local changes, Vercel, Docker and missing Git passed.")
