FROM node:24-alpine AS build
WORKDIR /source
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY vendor ./vendor
COPY packages/runtime-agent/package.json packages/runtime-agent/package.json
RUN pnpm --filter @rodsandbox/runtime-agent... install --frozen-lockfile --ignore-scripts
COPY packages/runtime-agent packages/runtime-agent
RUN pnpm --filter @rodsandbox/runtime-agent build && pnpm --filter @rodsandbox/runtime-agent deploy --prod /bundle

FROM node:24-alpine
RUN apk add --no-cache docker-cli docker-cli-compose tini && mkdir -p /var/lib/rodsandbox-runtime && chown node:node /var/lib/rodsandbox-runtime
WORKDIR /app
COPY --from=build --chown=node:node /bundle /app
USER node
ENV NODE_ENV=production RUNTIME_BIND=0.0.0.0 RUNTIME_STATE_DIR=/var/lib/rodsandbox-runtime
EXPOSE 9183
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:9183/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/main.js"]
