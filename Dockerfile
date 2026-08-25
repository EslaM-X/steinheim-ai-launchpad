# Steinheim — self-hosted image.
#
# Built as a plain Node server on purpose. A generation run takes minutes, and
# every serverless platform cuts a request long before that; a Node process has
# no such ceiling. It also means the app and n8n can share one machine and talk
# over the internal network instead of the public internet.

FROM node:24-alpine AS build

WORKDIR /app

# Vite needs these public Supabase values at build time.
# Never pass service-role keys or other private secrets as build arguments.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# The lockfile is copied first so a dependency-free code change reuses the layer.
COPY package.json package-lock.json ./

RUN npm ci --no-audit --no-fund

COPY . .

RUN npm run build


FROM node:24-alpine AS runtime

# ffmpeg turns the finished stills into product video. It is a real dependency
# rather than a nicety: the alternative is an AI video model, and every one of
# those would redraw the product frame by frame, which is the one thing this
# system is built to refuse. ~80MB, and it earns it.
RUN apk add --no-cache ffmpeg

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# The build output is self-contained; node_modules is not shipped.
COPY --from=build /app/.output ./.output

EXPOSE 3000

# Runs unprivileged: nothing here needs root.
USER node

CMD ["node", ".output/server/index.mjs"]