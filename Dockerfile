# --- Frontend build ---
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Backend ---
FROM node:20-alpine
WORKDIR /app

# Backend deps
COPY backend/package.json ./
RUN npm install --production

# Backend source
COPY backend/ ./

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./public

# Serve static frontend from Express
RUN echo 'const path=require("path");' > serve-static.js && \
    echo 'module.exports=(app)=>{' >> serve-static.js && \
    echo '  app.use(require("express").static(path.join(__dirname,"public")));' >> serve-static.js && \
    echo '  app.get("*",(req,res)=>{' >> serve-static.js && \
    echo '    if(!req.path.startsWith("/api"))res.sendFile(path.join(__dirname,"public","index.html"));' >> serve-static.js && \
    echo '  });' >> serve-static.js && \
    echo '};' >> serve-static.js

EXPOSE 3001
ENV NODE_ENV=production

CMD ["node", "index.js"]
