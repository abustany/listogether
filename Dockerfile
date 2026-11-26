###############################################################################
# Backend build
###############################################################################
FROM rust:1.68.2-slim-bullseye AS server

WORKDIR /src
COPY server/ .
ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
ENV CARGO_HOME=/cargo
# The UI is built on the host, see AGENTS.md.
COPY ui/dist /ui/dist
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
