---
name: qa-recipes
description: Write or rewrite Lirah's QA recipes (one per feature) that Haiku later runs against a live app instance. Run by the user only.
argument-hint: <feature...> | missing | all
disable-model-invocation: true
model: opus
---

Write QA recipes for: $ARGUMENTS

Follow `qa/WRITING.md` exactly. Read `qa/index.md`, `qa/AGENT.md` and `qa/README.md` first. If no argument was given, ask which features, and list the ones without a recipe.
