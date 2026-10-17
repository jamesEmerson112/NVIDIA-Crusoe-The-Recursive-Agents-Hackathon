# Test IDs

Every `data-testid` in the frontend, grouped by file. Selectors for UI tests and automation agents: `[data-testid="composer-send"]`. The convention is in CLAUDE.md (Frontend, "Test IDs"). Regenerate this list after adding ids:

```bash
grep -rnoE 'data-testid="[^"]+"' frontend/src --include=*.svelte
```

Repeated items (messages, steps, list rows, chips) share one id; pick one by text or index. Ids listed twice in a file sit in mutually exclusive branches (e.g. the two Composer variants).

**`lib/components/ArtifactCard.svelte`**: `artifact-card-open`

**`lib/components/ArtifactView.svelte`**: `artifact-view`, `artifact-view-close`, `artifact-view-versions`, `artifact-view-version`, `artifact-view-meta`, `artifact-view-toggle-changes`, `artifact-view-stale-notice`, `artifact-view-save-error`, `artifact-view-awaiting-input`, `artifact-view-edit-questions`, `artifact-view-answers`, `artifact-view-answer`, `artifact-view-answer-label`, `artifact-view-answer-changed`, `artifact-view-answer-value`, `artifact-view-answer-previous`, `artifact-view-editor`, `artifact-view-save`, `artifact-view-cancel`, `artifact-view-diff`, `artifact-view-iframe`, `artifact-view-lineage`, `artifact-view-upstream`, `artifact-view-lineage-link`, `artifact-view-downstream`, `artifact-view-edit`, `artifact-view-dependents-notice`

**`lib/components/Composer.svelte`**: `composer`, `composer-input`, `composer-model`, `composer-stop`, `composer-send`

**`lib/components/FormView.svelte`**: `form`, `form-description`, `form-field`, `form-label`, `form-input-checkbox`, `form-input-textarea`, `form-input-select`, `form-option`, `form-options`, `form-input-radio`, `form-input-checkboxes`, `form-input-text`, `form-help`, `form-submit`, `form-cancel`

**`lib/components/Markdown.svelte`**: `markdown`

**`lib/components/ProcessPanel.svelte`**: `process-panel`, `process-empty`, `process-step`, `process-step-status`, `process-step-title`, `process-artifact`, `process-usage`

**`lib/components/ProposalCard.svelte`**: `proposal-card`, `proposal-open-artifact`, `proposal-cost`, `proposal-duration`, `proposal-approve`, `proposal-keep`, `proposal-answer`

**`lib/components/QuestionEditor.svelte`**: `question-editor-label`, `question-editor`, `question-editor-description`, `question-editor-question`, `question-editor-up`, `question-editor-down`, `question-editor-remove`, `question-editor-type`, `question-editor-help`, `question-editor-options`, `question-editor-add`, `question-editor-save`, `question-editor-cancel`

**`lib/components/StatusBadge.svelte`**: `status-badge`

**`lib/components/Workspace.svelte`**: `workspace-title`, `workspace-toggle-process`, `workspace-chat`, `workspace-message-form-submit`, `workspace-form-submit-open`, `workspace-message-artifact-edit`, `workspace-artifact-edit-open`, `workspace-message-check`, `workspace-check-summary`, `workspace-check-problem`, `workspace-message-proposal-reply`, `workspace-message-user`, `workspace-message-error`, `workspace-inline-form`, `workspace-inline-form-edit-questions`, `workspace-inline-form-error`, `workspace-live`, `workspace-live-status`, `workspace-live-activity`, `workspace-error`, `workspace-panel`

**`routes/+layout.svelte`**: `app-root`, `sidebar`, `sidebar-toggle`, `sidebar-new`, `sidebar-library`, `sidebar-conversations`, `sidebar-item`, `sidebar-conversation`, `sidebar-working`, `sidebar-delete`, `sidebar-mock-notice`, `app-main`

**`routes/+page.svelte`**: `start-root`, `start-heading`, `start-examples`, `start-example`

**`routes/library/+page.svelte`**: `library-root`, `library-heading`, `library-search`, `library-kinds`, `library-kind`, `library-results`, `library-result`, `library-empty`
