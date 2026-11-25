FROM node:24.22.3-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY backend/ backend/
RUN install -d -o node -g node -m 0700 /app/data
USER node
CMD ["node", "backend/serve.mjs"]
