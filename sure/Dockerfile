# Keep the deployed application and assets while updating its Ruby runtime.
FROM ghcr.io/we-promise/sure:0.7.6-alpha.7@sha256:5104d53b5ea184d60f7b895dbcbf766d3af7df390ea42f150b9380726d1dfbc6 AS upstream
FROM ruby:3.4-slim
RUN ruby -e 'abort "Ruby security update required" if Gem::Version.new(RUBY_VERSION) < Gem::Version.new("3.4.11")' \
    && apt-get update -qq \
    && apt-get install --no-install-recommends -y curl libvips postgresql-client libyaml-0-2 procps libjemalloc2 poppler-utils \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1000 rails \
    && useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash
WORKDIR /rails
ENV RAILS_ENV=production BUNDLE_DEPLOYMENT=1 BUNDLE_PATH=/usr/local/bundle BUNDLE_WITHOUT=development
COPY --from=upstream /usr/local/bundle /usr/local/bundle
COPY --from=upstream --chown=rails:rails /rails /rails
RUN apt-get update -qq && apt-get install --no-install-recommends -y build-essential \
    && ruby -e 'File.write(".ruby-version", RUBY_VERSION + "\n")' \
    && BUNDLE_DEPLOYMENT=0 bundle update --ruby \
    && BUNDLE_DEPLOYMENT=0 bundle add resolv --version 0.7.2 \
    && bundle exec ruby -rresolv -e 'abort "resolv security update required" if Gem::Version.new(Resolv::VERSION) < Gem::Version.new("0.7.2")' \
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*
USER 1000:1000
EXPOSE 3000
ENTRYPOINT ["/rails/bin/docker-entrypoint"]
CMD ["./bin/rails", "server"]
