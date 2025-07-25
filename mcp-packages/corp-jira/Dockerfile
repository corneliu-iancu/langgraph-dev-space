FROM node:22.12-alpine AS builder

# Must be entire project because `prepare` script is run during `npm install` and requires all files.
COPY . /app
COPY tsconfig.json /tsconfig.json

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm npm install

FROM node:22-alpine AS release

WORKDIR /app

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

# Set default environment variables
ENV NODE_ENV=production \
    JIRA_PERSONAL_ACCESS_TOKEN="" \
    JIRA_API_BASE_URL="https://jira.corp.adobe.com/rest/api/2" \
    JIRA_EMAIL=""

RUN npm ci --ignore-scripts --omit-dev
# These environment variables can be overridden at runtime using:
# docker run -e JIRA_PERSONAL_ACCESS_TOKEN=xxx -e JIRA_EMAIL=xxx ...
ENTRYPOINT ["node", "dist/index.js"] 