# soc-simulation/infra/caldera/Dockerfile
FROM python:3.11-slim

ARG CALDERA_REPO=https://github.com/mitre/caldera.git
ARG CALDERA_REF=master

ARG CALDERA_ATOMIC_PLUGIN_REPO=https://github.com/mitre/atomic.git
ARG CALDERA_ATOMIC_PLUGIN_REF=master

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    git ca-certificates build-essential haproxy golang-go nodejs npm curl \
    && rm -rf /var/lib/apt/lists/*

# Clone Caldera with submodules
RUN git clone --recursive --depth 1 --branch "${CALDERA_REF}" "${CALDERA_REPO}" /opt/caldera

WORKDIR /opt/caldera

# Install Python deps
RUN pip install --upgrade pip setuptools wheel \
    && if [ -f requirements.txt ]; then pip install -r requirements.txt; fi

# Install plugin deps (skip stockpile donut — doesn't build on all arches)
RUN for d in plugins/*/; do \
      [ -f "$d/requirements.txt" ] || continue; \
      case "$d" in */stockpile/*) pip install -r "$d/requirements.txt" --ignore-installed 2>/dev/null || true ;; \
      *) pip install -r "$d/requirements.txt" || true ;; esac; \
    done

# Clone Atomic Red Team plugin
RUN git clone --depth 1 --branch "${CALDERA_ATOMIC_PLUGIN_REF}" "${CALDERA_ATOMIC_PLUGIN_REPO}" plugins/atomic \
    && if [ -f plugins/atomic/requirements.txt ]; then pip install -r plugins/atomic/requirements.txt; fi

# Copy config and entrypoint
COPY conf/local.yml /opt/caldera/conf/local.yml
COPY entrypoint.sh /usr/local/bin/caldera-entrypoint
RUN chmod +x /usr/local/bin/caldera-entrypoint

EXPOSE 8888 7010 7011/udp 7012

ENTRYPOINT ["caldera-entrypoint"]
