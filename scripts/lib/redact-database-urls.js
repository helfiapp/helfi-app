// Support search may show source excerpts. Database URLs must never enter it.
function redactDatabaseUrls(content) {
  return content.replace(/\bpostgres(?:ql)?:\/\/[^\s"'`<>]+/gi, '[REDACTED_DATABASE_URL]')
}

module.exports = { redactDatabaseUrls }
