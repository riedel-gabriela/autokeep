FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && chown -R node:node /app
COPY --chown=node:node . .
USER node
EXPOSE 8080
CMD ["npm", "run", "dev:container"]
