FROM node:24-alpine
WORKDIR /app
COPY server.js ./
ENV PORT=8787
EXPOSE 8787
USER node
CMD ["node", "server.js"]
