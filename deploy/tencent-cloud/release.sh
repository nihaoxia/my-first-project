#!/bin/sh
set -eu

fail() {
  echo "release failed: $1" >&2
  exit 1
}

[ "$#" -eq 1 ] || fail "pass exactly one 40-character Git SHA"
RELEASE_SHA=$1
[ "${#RELEASE_SHA}" -eq 40 ] || fail "release SHA must contain 40 characters"
case "$RELEASE_SHA" in
  *[!0-9a-fA-F]*|latest) fail "release SHA must be hexadecimal and cannot be latest" ;;
esac

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$SCRIPT_DIR/docker-compose.production.yml}
PRODUCTION_SECRETS_FILE=${PRODUCTION_SECRETS_FILE:-/etc/stray-pages/production.env}
STATE_DIR=${STATE_DIR:-/var/lib/stray-pages}
STATE_FILE=$STATE_DIR/current-release-sha
MIGRATION_FILE=$REPOSITORY_ROOT/supabase/migrations/202607110001_cloud_foundation.sql
WAIT_TIMEOUT=${WAIT_TIMEOUT:-180}

[ -r "$PRODUCTION_SECRETS_FILE" ] || fail "production secrets file is not readable"
[ -r "$MIGRATION_FILE" ] || fail "authoritative migration is not readable"
case "$WAIT_TIMEOUT" in *[!0-9]*|"") fail "wait timeout must be an integer" ;; esac
[ "$WAIT_TIMEOUT" -ge 30 ] && [ "$WAIT_TIMEOUT" -le 600 ] || fail "wait timeout is out of range"

umask 077
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
PREVIOUS_SHA=""
if [ -r "$STATE_FILE" ]; then
  PREVIOUS_SHA=$(sed -n '1p' "$STATE_FILE")
  case "$PREVIOUS_SHA" in *[!0-9a-fA-F]*|"") PREVIOUS_SHA="" ;; esac
  [ -z "$PREVIOUS_SHA" ] || [ "${#PREVIOUS_SHA}" -eq 40 ] || PREVIOUS_SHA=""
fi

export RELEASE_SHA
docker compose --env-file "$PRODUCTION_SECRETS_FILE" -f "$COMPOSE_FILE" config --quiet
docker compose --env-file "$PRODUCTION_SECRETS_FILE" -f "$COMPOSE_FILE" pull
docker compose --env-file "$PRODUCTION_SECRETS_FILE" -f "$COMPOSE_FILE" up -d --wait --wait-timeout "$WAIT_TIMEOUT" postgres

docker compose --env-file "$PRODUCTION_SECRETS_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c \
  "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, inserted_at timestamptz NOT NULL DEFAULT now());"

MIGRATION_VERSION=202607110001
APPLIED=$(docker compose --env-file "$PRODUCTION_SECRETS_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -Atqc \
  "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '$MIGRATION_VERSION'")
if [ "$APPLIED" != "1" ]; then
  {
    printf '%s\n' 'BEGIN;'
    cat "$MIGRATION_FILE"
    printf "\nINSERT INTO supabase_migrations.schema_migrations (version) VALUES ('%s');\nCOMMIT;\n" "$MIGRATION_VERSION"
  } | docker compose --env-file "$PRODUCTION_SECRETS_FILE" -f "$COMPOSE_FILE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres
fi

if ! docker compose --env-file "$PRODUCTION_SECRETS_FILE" -f "$COMPOSE_FILE" up -d --wait --wait-timeout "$WAIT_TIMEOUT"; then
  # Rollback restores only the previous image SHA; it does not roll back migrations.
  if [ -n "$PREVIOUS_SHA" ] && [ "$PREVIOUS_SHA" != "$RELEASE_SHA" ]; then
    ROLLBACK_SHA=$PREVIOUS_SHA
    RELEASE_SHA=$ROLLBACK_SHA
    export RELEASE_SHA
    docker compose --env-file "$PRODUCTION_SECRETS_FILE" -f "$COMPOSE_FILE" up -d --wait --wait-timeout "$WAIT_TIMEOUT" || true
  fi
  fail "service health gate failed"
fi

TEMP_STATE_FILE=$STATE_FILE.tmp.$$
printf '%s\n' "$RELEASE_SHA" > "$TEMP_STATE_FILE"
chmod 600 "$TEMP_STATE_FILE"
mv "$TEMP_STATE_FILE" "$STATE_FILE"
echo "release succeeded: $RELEASE_SHA"
