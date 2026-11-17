#!/usr/bin/env bash
set -euo pipefail
upstream_path="$(pwd)/hifi-render/upstream"
git clone --quiet https://github.com/binimum/hifi-api.git "$upstream_path"
git -C "$upstream_path" checkout --quiet bf46988bff97bd2609a4fe92c91b573b60c41b8f
python -m pip install -r "$upstream_path/requirements.txt"
