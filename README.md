# React + TypeScript + Vite

## Deploying to Render

Create a Render Blueprint from this repository using `render.yaml`. It creates
the static frontend and Node.js API services. During setup, provide these
backend environment variables in Render:

- `MONGO_URI`: MongoDB connection string
- `JWT_SECRET`: secret of at least 32 bytes
- `ADMIN_EMAIL`: administrator email address

The Blueprint configures the frontend API URL and the backend's frontend URL
for the service names declared in `render.yaml`. Configure email provider
settings (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, and `EMAIL_PASS`) in the
backend service if password-reset email is needed.

## Deploying frontend and API to Vercel

Import this repository into Vercel with the project root set to the repository
root. Use `npm run build` as the build command and `dist` as the output
directory. The `api/[...path].js` function serves the Express API; the
production frontend uses `/api` to call it on the same domain.

Add these environment variables in Vercel for Production (and Preview if
needed):

- `VITE_API_URL`: `/api` (use this instead of any previous separate backend URL)
- `MONGO_URI`: MongoDB connection string
- `JWT_SECRET`: secret of at least 32 bytes
- `ADMIN_EMAIL`: administrator email address

Add `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, and `EMAIL_PASS` if password-reset
email is needed.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
