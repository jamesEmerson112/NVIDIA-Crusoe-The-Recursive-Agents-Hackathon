// SessionStart hook: warn when origin/main has agent-instruction changes (CLAUDE.md, .claude/)
// that this checkout doesn't have yet. Silent when up to date, offline, or on any git error.
import { execFileSync } from 'node:child_process';

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const git = (...args) =>
	execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
	git('fetch', '-q', 'origin', 'main');
	const commits = git('log', '--oneline', 'HEAD..origin/main', '--', '*CLAUDE.md', '.claude');
	if (commits) {
		const context =
			`origin/main has changes to CLAUDE.md or .claude/ that this checkout lacks:\n${commits}\n` +
			'Tell the user, and suggest pulling main (or rebasing this branch onto origin/main) ' +
			'before relying on CLAUDE.md, the skills or the permission allowlist.';
		console.log(
			JSON.stringify({
				systemMessage: 'CLAUDE.md or .claude/ changed on origin/main; pull or rebase to sync.',
				hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context }
			})
		);
	}
} catch {
	// No network or no origin/main: don't block the session.
}
