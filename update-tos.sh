#!/bin/bash

set -eou pipefail

(cd ../tos-pp && ./generate-html.sh sandcats terms) > sandcats/public/terms.html
(cd ../tos-pp && ./generate-html.sh sandcats privacy) > sandcats/public/privacy.html

git add sandcats/public/terms.html sandcats/public/privacy.html
git commit -m 'Synchronized tos-pp'
