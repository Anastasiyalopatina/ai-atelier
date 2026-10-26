// Registration and actual MCP transport are deferred until the backend is integrated.
// These are planned application tools, not built-in Codex methods.
export const plannedTools = ['get_project_context', 'search_sources', 'save_artifact', 'propose_memory_change'] as const;
export function startMcp(): never { throw new Error('NOT_IMPLEMENTED: MCP is not registered or verified'); }
