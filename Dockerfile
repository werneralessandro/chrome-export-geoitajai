# Etapa 1: Build do backend
FROM node:20 as backend

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
# Instala o Chrome necessário para o Puppeteer
RUN npx puppeteer browsers install chrome
COPY backend ./

# Etapa 2: Build final com frontend + dependências do sistema
FROM node:20 as final

# Instala dependências do sistema para o Puppeteer funcionar
RUN apt-get update && apt-get install -y \
  nginx \
  fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 \
  libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
  xdg-utils wget \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia backend com node_modules e o Chrome baixado
COPY --from=backend /app/backend ./backend
# Copia frontend
COPY frontend/dist ./frontend
# Copia nginx.conf
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 3008

# Starta nginx e backend
CMD ["sh", "-c", "service nginx start && node backend/server.js"]
