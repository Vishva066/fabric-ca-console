FROM node:22-alpine AS deps
WORKDIR /app
RUN apk upgrade --no-cache && npm install -g npm@12.2.3
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk upgrade --no-cache && npm install -g npm@12.2.3
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# Upgrade OS packages and npm; force-replace npm's bundled vulnerable glob+minimatch
# by installing patched versions globally and symlinking into npm's node_modules
RUN apk upgrade --no-cache && \
    npm install -g npm@12.2.3 && \
    npm install -g glob@14.0.6 minimatch@11.0.9 && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/glob \
           /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    ln -s /usr/local/lib/node_modules/glob \
          /usr/local/lib/node_modules/npm/node_modules/glob && \
    ln -s /usr/local/lib/node_modules/minimatch \
          /usr/local/lib/node_modules/npm/node_modules/minimatch
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/node_modules/typescript ./node_modules/typescript
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["npm", "run", "start"]