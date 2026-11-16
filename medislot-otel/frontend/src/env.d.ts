// Variable injectée au build (Dockerfile : ARG GIT_SHA -> VITE_GIT_SHA).
interface ImportMetaEnv { readonly VITE_GIT_SHA?: string }
