###############################################################################
# UI build
###############################################################################
FROM node:19.4.0-bullseye-slim AS ui

WORKDIR /src/ui
COPY ui/ .
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn/v6 yarn && yarn build

###############################################################################
# Backend build
###############################################################################
FROM rust:1.66.1-slim-bullseye AS server

WORKDIR /src
COPY server/ .
ENV CARGO_HOME=/cargo
COPY --from=ui /src/ui /ui
RUN --mount=type=cache,target=/cargo --mount=type=cache,target=/src/target cargo build --release && mv target/release/listogether-server .

###############################################################################
# dumb-init retrieval
###############################################################################
FROM curlimages/curl:7.87.0 AS init
RUN curl -L -o /tmp/dumb-init https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_x86_64
RUN chmod a+x /tmp/dumb-init

###############################################################################
# Final image assembly
###############################################################################
FROM gcr.io/distroless/cc

COPY --from=init /tmp/dumb-init /bin/dumb-init
COPY --from=server /src/listogether-server /app
VOLUME /data
USER nobody:nobody
ENTRYPOINT ["/bin/dumb-init", "--"]
CMD ["/app", "serve", "--lists-dir", "/data"]
