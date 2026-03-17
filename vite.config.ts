/// <reference types="vitest/config" />
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
const dirname =
	typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			// El service worker se registra solo en producción por defecto.
			// En dev podemos activarlo con: devOptions: { enabled: true }
			registerType: 'autoUpdate',
			// La cámara requiere HTTPS — el SW solo intercepta requests,
			// no bloquea el acceso a la cámara nativa.
			workbox: {
				// Cachear assets estáticos y páginas de la app
				globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
				// No cachear las API routes ni las páginas de auth
				navigateFallbackDenylist: [/^\/api\//, /^\/login/, /^\/register/, /^\/logout/],
				// Cachear respuestas de navegación (páginas de la app)
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/covers\.openlibrary\.org\//,
						handler: 'CacheFirst',
						options: {
							cacheName: 'openlibrary-covers',
							expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }
						}
					}
				]
			},
			manifest: {
				name: 'Librarian',
				short_name: 'Librarian',
				description: 'Tu biblioteca particular. Escanea, organiza y comparte tus libros.',
				theme_color: '#0a0a0a',
				background_color: '#ffffff',
				display: 'standalone',
				orientation: 'portrait',
				scope: '/',
				start_url: '/library',
				lang: 'es',
				icons: [
					{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
					{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				]
			}
		}),
		devtoolsJson()
	],
	test: {
		expect: {
			requireAssertions: true
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [
							{
								browser: 'chromium',
								headless: true
							}
						]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				},
				resolve: {
					alias: {
						$lib: path.resolve(dirname, 'src/lib')
					}
				}
			},
			{
				extends: true,
				plugins: [
					// The plugin will run tests for the stories defined in your Storybook config
					// See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
					storybookTest({
						configDir: path.join(dirname, '.storybook')
					})
				],
				test: {
					name: 'storybook',
					browser: {
						enabled: true,
						headless: true,
						provider: playwright({}),
						instances: [
							{
								browser: 'chromium'
							}
						]
					},
					setupFiles: ['.storybook/vitest.setup.ts']
				}
			}
		]
	}
});
