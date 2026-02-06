FROM node:20-alpine

WORKDIR /app

# Optional tools (remove if not needed)
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm install

COPY gen/srv .

RUN addgroup -g 1001 cap && \
    adduser -D -u 1001 -G cap cap && \
    chown -R cap:cap /app

USER cap

EXPOSE 4004
CMD ["npm", "start"]
