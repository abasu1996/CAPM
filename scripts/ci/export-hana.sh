#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <output-directory>" >&2
  exit 2
fi

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
output_root="$1"

projects=("flowmate-common" "flowmate" "flowmate-CA")
instances=("flowmate-common-db" "flowmate-db" "flowmate-ca-db")

mkdir -p "${output_root}"

for index in "${!projects[@]}"; do
  project="${projects[$index]}"
  instance="${instances[$index]}"
  project_dir="${repository_root}/${project}"
  export_dir="${output_root}/${project}"

  echo "Exporting ${instance} into ${export_dir}"
  (
    cd "${project_dir}"
    npx cds bind db --to "${instance}:github-actions-backup" --for ci --kind hana
    RECOVERY_EXPORT_DIR="${export_dir}" \
      npx cds bind --exec --profile ci -- \
      node "${repository_root}/scripts/recovery/export-hana-catalog.js"
  )
done

node "${repository_root}/scripts/ci/validate-hana-export.js" "${output_root}"

(
  cd "${output_root}"
  find . -type f ! -name SHA256SUMS -print0 \
    | sort -z \
    | xargs -0 sha256sum > SHA256SUMS
  sha256sum --check SHA256SUMS
)

