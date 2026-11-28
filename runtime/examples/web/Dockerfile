FROM node:24-alpine
WORKDIR /app
COPY runtime/examples/web/server.mjs /app/server.mjs
USER 10001:10001
ENV PORT=3000
EXPOSE 3000
CMD ["node", "/app/server.mjs"]
