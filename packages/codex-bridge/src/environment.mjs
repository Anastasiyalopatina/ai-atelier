// Only system settings required by the official client; never provider credentials.
export function childEnvironment(source = process.env) {
  return Object.fromEntries([
    'HOME', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'CODEX_HOME',
    'CODEX_CA_CERTIFICATE', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
    'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
  ].filter((key) => typeof source[key] === 'string').map((key) => [key, source[key]]));
}
