#!/usr/bin/env bash
# Checks that the starter repository still behaves the way the site describes, without calling any
# model or using any credential: lint, the mock control eval's expected pattern, every catch-up
# state, both experiment plans, the Lab 6 reference draft, and every file the site quotes.
#   tools/verify-starter.sh <path-to-a-starter-checkout>
# Needs the Vally CLI (npm install -g @microsoft/vally-cli@0.21.0), Node.js and jq.
set -euo pipefail

starter="$(cd "${1:?usage: tools/verify-starter.sh <path-to-a-starter-checkout>}" && pwd)"
site="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -R "$starter/." "$work/"
rm -rf "$work/.git" "$work/vally-results" "$work/vally-experiment-results"
cd "$work"

# Never let a run reach a model: no credentials in this process.
unset COPILOT_GITHUB_TOKEN GH_TOKEN GITHUB_TOKEN EVALUATE_USE_HOST_COPILOT_HOME LLM_API_KEY || true

failures=0
step() { printf '\n== %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1"; failures=$((failures + 1)); }
failed_stimuli() { jq -r 'select(.type == "trial-result" and (.gradeResult.passed | not)) | .stimulus' "$1"/results.jsonl | sort | paste -sd, -; }

step "Lint the evals the starter ships with"
vally lint -e evals --strict || fail "lint of evals/"

step "Lab 2, before the fix: only the empty answer fails (the wrong answer slips through)"
vally eval -e evals/release-notes-control.eval.yaml --output-dir "$work/run-2a" >/dev/null 2>&1 || true
got=$(failed_stimuli "$(ls -d "$work"/run-2a/*/)")
[[ "$got" == "empty-answer" ]] || fail "Lab 2 starter: failed stimuli are '$got', expected 'empty-answer'"

step "Catch-up states lint clean"
for lab in 2 3 4 5 7; do
  scripts/catch-up.sh "$lab" >/dev/null
  vally lint -e evals --strict >/dev/null 2>&1 || fail "lint after scripts/catch-up.sh $lab"
done

step "Lab 2, after the fix: the wrong and the empty answer fail"
vally eval -e evals/release-notes-control.eval.yaml --output-dir "$work/run-2b" >/dev/null 2>&1 || true
got=$(failed_stimuli "$(ls -d "$work"/run-2b/*/)")
[[ "$got" == "empty-answer,wrong-answer" ]] || fail "Lab 2 solution: failed stimuli are '$got', expected 'empty-answer,wrong-answer'"

step "The fixed skill matches the solution"
cmp -s .github/skills/release-notes/SKILL.md solutions/lab-4/SKILL.md || fail "skill after catch-up 4 differs from solutions/lab-4/SKILL.md"
cmp -s skill-versions/before/release-notes/SKILL.md "$starter/.github/skills/release-notes/SKILL.md" \
  || fail "skill-versions/before differs from the skill the starter ships with"

step "Experiment plans (dry runs, no model calls)"
for experiment in experiments/*.experiment.yaml; do
  vally experiment run "$experiment" --dry-run >/dev/null 2>&1 || fail "dry run of $experiment"
done

step "Lab 6 reference draft"
cp solutions/lab-6/release-notes-reference.eval.yaml evals/
vally lint -e evals/release-notes-reference.eval.yaml --strict >/dev/null 2>&1 || fail "lint of the Lab 6 reference draft in evals/"

step "Lab 8 and Lab 9 starters"
cp lab-files/lab-8/release-notes-endpoint.eval.yaml evals/
vally lint -e evals/release-notes-endpoint.eval.yaml --strict >/dev/null 2>&1 || fail "lint of the Lab 8 eval in evals/"
if vally lint -e lab-files/lab-9/my-first.eval.yaml 2>&1 | grep -qiE 'yaml|mapping|parse'; then
  fail "the Lab 9 template isn't valid YAML"
fi

step "Files quoted on the site"
node "$site/tools/check-quoted-files.mjs" "$site/docs/src/content/docs" "$starter" || fail "quoted files differ from the starter"

echo
if (( failures > 0 )); then
  echo "$failures check(s) failed."
  exit 1
fi
echo "The starter matches the site."
