FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# service.version des spans du navigateur = commit construit (cours, chapitre 6).
ARG GIT_SHA=local
ENV VITE_GIT_SHA=$GIT_SHA
RUN npm run build
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
