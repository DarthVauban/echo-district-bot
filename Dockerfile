FROM node:22-slim

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
    && python3 -m pip install --no-cache-dir --break-system-packages --pre "yt-dlp[default]" \
    && apt-get purge -y --auto-remove python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

USER node

CMD ["npm", "start"]
