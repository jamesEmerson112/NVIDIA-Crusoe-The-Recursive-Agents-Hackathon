import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) =>
	value && value !== 'paste-your-key-here' ? value : undefined;

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	CRUSOE_API_KEY: {
		description:
			'Crusoe Managed Inference key. Set it with `npm run set-key`: Vite expands $ in .env even inside quotes, so each $ must be written as \\$. Without it the app runs a scripted mock agent.',
		schema: optional
	},
	CRUSOE_AGENT_MODEL: {
		description:
			'Model for the main agent loop. Must support tools; copy the id from GET /v1/models.',
		schema: (value) => value || 'zai-org/GLM-5.3-Flash'
	},
	CRUSOE_FAST_MODEL: {
		description: 'Cheap model for quick artifact edits run as sub-agents.',
		schema: (value) => value || 'deepseek-ai/Deepseek-V4-Flash'
	},
	PUBLIC_MAPTILER_KEY: {
		description:
			'MapTiler key for the 3D San Francisco map on the start page. Shipped to the browser, so restrict it to your domains in the MapTiler dashboard. Without it the start page draws a keyless three.js skyline.',
		public: true,
		schema: optional
	}
});
