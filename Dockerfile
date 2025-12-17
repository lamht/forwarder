FROM node:22-alpine


WORKDIR /app


# install cloudflared
RUN apk add --no-cache curl \
&& curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
-o /usr/local/bin/cloudflared \
&& chmod +x /usr/local/bin/cloudflared


COPY package.json ./
RUN npm install --production


COPY index.js ./


ENV NODE_ENV=production


CMD ["node", "index.js"]