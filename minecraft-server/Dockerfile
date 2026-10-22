FROM debian:trixie-slim AS java
ARG TARGETARCH
RUN apt-get update -qq && apt-get install --no-install-recommends -y ca-certificates curl \
    && case "$TARGETARCH" in arm64) arch=aarch64 ;; amd64) arch=x64 ;; *) exit 1 ;; esac \
    && url="https://download.oracle.com/java/25/latest/jdk-25_linux-${arch}_bin.tar.gz" \
    && curl --fail --show-error --location --retry 3 "$url" -o /tmp/java.tar.gz \
    && curl --fail --show-error --location --retry 3 "$url.sha256" -o /tmp/java.sha256 \
    && printf '%s  /tmp/java.tar.gz\n' "$(cat /tmp/java.sha256)" | sha256sum --check \
    && mkdir /java && tar -xzf /tmp/java.tar.gz -C /java --strip-components=1

# The stock java25 image still shipped 25.0.4.1 when the October fixes landed.
FROM itzg/minecraft-server:java25
COPY --from=java /java /opt/java/patched
ENV JAVA_HOME=/opt/java/patched JAVA_VERSION=25 PATH=/opt/java/patched/bin:$PATH
RUN java -version 2>&1 | grep -Eq 'version "25\.0\.([5-9]|[1-9][0-9]+)([".+-])'
