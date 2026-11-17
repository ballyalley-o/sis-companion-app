const { execFileSync } = require("node:child_process")
const { version } = require("./package.json")

function git(...argument) {
  try {
    return execFileSync("git", argument, { cwd: __dirname, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return ""
  }
}

module.exports = ({ config }) => {
  const suppliedCommit = process.env.BUILD_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA
  const commit = suppliedCommit || git("rev-parse", "HEAD")
  const knownCommit = /^[a-f0-9]{7,40}$/i.test(commit) ? commit : null
  const dirty = process.env.BUILD_DIRTY === "true" || (!suppliedCommit && !!git("status", "--porcelain"))
  return {
    ...config,
    version,
    extra: {
      ...config.extra,
      release: {
        version,
        commit: knownCommit,
        dirty,
        builtAt: new Date().toISOString(),
      },
    },
  }
}
