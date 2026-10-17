# Test IDs

Every `data-testid` in the frontend, grouped by file. Selectors for UI tests and automation agents: `[data-testid="composer-send"]`. The convention is in CLAUDE.md (Frontend, "Test IDs"). Regenerate this list after adding ids:

```bash
grep -rnoE 'data-testid="[^"]+"' frontend/src --include=*.svelte
```

Repeated items (messages, steps, list rows, chips) share one id; pick one by text or index. Ids listed twice in a file sit in mutually exclusive branches (e.g. the two Composer variants). Ids built in TypeScript (the 3D viewer's canvas, labels and debug panel in `lib/floorplan/three/viewer.ts`) are listed under that file.

**`lib/components/AgentMap.svelte`**: `agent-map`, `agent-map-header`, `agent-map-title`, `agent-map-summary`, `agent-map-live`, `agent-map-empty`, `agent-map-scroll`, `agent-map-svg`, `agent-map-column`, `agent-map-edge`, `agent-map-lane`, `agent-map-lane-label`, `agent-map-node-label`, `agent-map-node`

**`lib/components/ArtifactCard.svelte`**: `artifact-card-open`

**`lib/components/ArtifactView.svelte`**: `artifact-view`, `artifact-view-close`, `artifact-view-versions`, `artifact-view-version`, `artifact-view-meta`, `artifact-view-toggle-changes`, `artifact-view-stale-notice`, `artifact-view-awaiting-input`, `artifact-view-answers`, `artifact-view-answer`, `artifact-view-answer-label`, `artifact-view-answer-changed`, `artifact-view-answer-value`, `artifact-view-answer-previous`, `artifact-view-blueprint`, `artifact-view-cancel`, `artifact-view-widget-data`, `artifact-view-editor`, `artifact-view-save`, `artifact-view-diff`, `artifact-view-iframe`, `artifact-view-lineage`, `artifact-view-upstream`, `artifact-view-lineage-link`, `artifact-view-downstream`, `artifact-view-edit`, `artifact-view-dependents-notice`

**`lib/components/BlueprintEmbed.svelte`**: `blueprint-embed`, `blueprint-embed-title`, `blueprint-embed-tabs`, `blueprint-embed-tab-room`, `blueprint-embed-tab-plan`, `blueprint-embed-plan`, `blueprint-embed-summary`, `blueprint-embed-highlights`, `blueprint-embed-fullscreen`

**`lib/components/Composer.svelte`**: `composer`, `composer-input`, `composer-model`, `composer-stop`, `composer-send`

**`lib/components/FormView.svelte`**: `form-question-text`, `form`, `form-description-text`, `form-description`, `form-field`, `form-label`, `form-input-textarea`, `form-input-text`, `form-options`, `form-option`, `form-help-text`, `form-help`, `form-add-question`, `form-submit`, `form-cancel`

**`lib/components/InlineInput.svelte`**: `inline-input`, `inline-input-title`, `inline-input-answered`, `inline-input-edit`, `inline-input-cancel`, `inline-input-error`

**`lib/components/ListingPlanCard.svelte`**: `listing-plan-card`, `listing-plan-viewer`, `listing-plan-error`, `listing-plan-name`, `listing-plan-open`, `listing-plan-walk`, `listing-plan-photo`

**`lib/components/Markdown.svelte`**: `markdown`

**`lib/components/PlanSketch.svelte`**: `plan-sketch`

**`lib/components/PlanViewer.svelte`**: `plan-viewer`, `plan-viewer-error`, `plan-viewer-loading`

**`lib/components/ProcessPanel.svelte`**: `process-panel`, `process-empty`, `process-step`, `process-step-status`, `process-step-title`, `process-artifact`, `process-usage`

**`lib/components/ProposalCard.svelte`**: `proposal-card`, `proposal-open-artifact`, `proposal-cost`, `proposal-duration`, `proposal-approve`, `proposal-keep`, `proposal-answer`

**`lib/components/RoomScene.svelte`**: `room-scene`, `room-scene-presets`, `room-scene-preset`

**`lib/components/RunLog.svelte`**: `run-log`, `run-log-summary`, `run-log-empty`, `run-log-scroll`, `run-log-table`, `run-log-row`, `run-log-time`, `run-log-role`, `run-log-model`, `run-log-cache-hit`, `run-log-cost`, `run-log-duration`, `run-log-did`, `run-log-artifact`, `run-log-tool`, `run-log-totals`

**`lib/components/SanFrancisco3D.svelte`**: `sf3d-attribution`, `sf3d-backdrop`, `sf3d-host`

**`lib/components/StatusBadge.svelte`**: `status-badge`

**`lib/components/Widget.svelte`**: `widget`, `widget-description`, `widget-frame`, `widget-error`

**`lib/components/Workspace.svelte`**: `workspace-title`, `workspace-open-map`, `workspace-toggle-process`, `workspace-chat`, `workspace-message-form-submit`, `workspace-form-submit-open`, `workspace-message-artifact-edit`, `workspace-artifact-edit-open`, `workspace-message-check`, `workspace-check-summary`, `workspace-check-problem`, `workspace-message-proposal-reply`, `workspace-message-user`, `workspace-message-error`, `workspace-live`, `workspace-live-status`, `workspace-live-activity`, `workspace-error`, `workspace-panel`, `workspace-panel-tabs`, `workspace-panel-tab`, `workspace-panel-close`

**`routes/+layout.svelte`**: `app-root`, `sidebar`, `sidebar-toggle`, `sidebar-new`, `sidebar-library`, `sidebar-plans`, `sidebar-conversations`, `sidebar-item`, `sidebar-conversation`, `sidebar-working`, `sidebar-delete`, `sidebar-delete-error`, `sidebar-mock-notice`, `app-main`

**`routes/+page.svelte`**: `start-root`, `start-heading`, `start-examples`, `start-example`

**`routes/library/+page.svelte`**: `library-root`, `library-heading`, `library-search`, `library-kinds`, `library-kind`, `library-results`, `library-result`, `library-empty`

**`routes/plans/+page.svelte`**: `blueprints-root`, `blueprints-heading`, `blueprints-grid`, `blueprint-card`, `blueprint-open`, `blueprint-title`, `blueprint-conversation`, `blueprint-floorplan`, `blueprints-empty`

**`routes/plans/photo/+page.svelte`**: `plans-photo-root`, `plans-photo-back`, `plans-photo-heading`, `plans-photo-name`, `plans-photo-cam-{c.id}`, `plans-photo-fullres`, `plans-photo-viewport`, `plans-photo-error`, `plans-photo-hud`, `plans-photo-samples`, `plans-photo-state`

**`routes/plans/room/+page.svelte`**: `room-root`, `room-back`, `room-from`, `room-heading`, `room-presets`, `room-preset-{p.id}`, `room-status`, `room-canvas`

**`routes/plans/view/+page.svelte`**: `plans-root`, `plans-back`, `plans-from`, `plans-heading`, `plans-select`, `plans-option`, `plans-model-collection`, `plans-model-placeholder`, `plans-model-{p.id}`, `plans-views`, `plans-view-{v.id}`, `plans-summary`, `plans-quality`, `plans-quality-{q ?? 'auto'}`, `plans-photo-link`, `plans-debug-toggle`, `plans-showcase-link`, `plans-problems`, `plans-walk-hint`

**`lib/floorplan/three/photo.ts`**: `plans-photo-canvas`

**`lib/floorplan/three/viewer.ts`**: `plan-viewer-canvas`, `plan-viewer-labels`, `plan-viewer-fps`, `plan-viewer-debug`, `plan-viewer-room-label`, `plan-viewer-wall-label`

**`lib/sf3d/map.ts`**: `sf3d-map-canvas`

**`lib/sf3d/scene.ts`**: `sf3d-canvas`
