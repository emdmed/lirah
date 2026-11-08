// Prompt for `:features build`: a read-only agent maps the project's features
// to their files. src-tauri/src/plans.rs (build_feature_map) validates the JSON
// and writes .orchestration/tools/features.json, which the compaction hook reads.

export function buildFeatureMapPrompt() {
  return `Map this project's features to the files that implement them.

How to look:
- If .orchestration/tools/compacted_*.md exists, grep it (never read it whole): its "## Entry Points", "## Hubs" and "used-by:" lines show structure and who imports what.
- Use Glob and Grep on the source for the rest. Read files only where a name leaves a feature unclear.

What to produce:
- 10 to 40 features a user or developer would name ("plans", "file tree", "settings dialog"), not technical layers.
- For each, the files that implement it, frontend and backend together. Leave out shared helpers (generic utils, styles, config) unless they exist only for that feature.
- A file may belong to more than one feature.

Answer with JSON only, no prose, no code fence, in this shape:
{
  "features": [
    {
      "id": "plans",
      "name": "Plans",
      "aliases": ["plan import", "plan splitter", "chunks"],
      "description": "One sentence: what the feature does for the user.",
      "area": ["frontend", "backend"],
      "files": ["src/features/plans/PlansContext.jsx", "src-tauri/src/plans.rs"],
      "entryPoints": ["src/features/plans/PlansContext.jsx"],
      "uses": ["agent-jobs"]
    }
  ]
}

Rules:
- "id": lowercase kebab-case, unique.
- "aliases": 2 to 6 other words people would use for it in a prompt.
- "area": any of "frontend", "backend", "cli", "build", "docs", "tests".
- "files" and "entryPoints": paths relative to the project root that exist.
- "uses": ids of other features this one depends on.`;
}

// Prompt for updating an existing map: Rust appends the current features (no
// files) and the files added since the map was built.
export function buildFeatureMapUpdatePrompt() {
  return `This project has a feature map. Files were added since it was built. Place each new file listed at the end in the features it implements.

- Read a new file only if its path doesn't make its feature clear. Don't re-map the other files.
- A file may belong to more than one feature, or to none (shared helpers, config, generated or one-off files).
- If new files form a feature that isn't listed, add it under "features", in the same shape as a full map: id (lowercase kebab-case, unique), name, aliases (2 to 6), description, area (any of "frontend", "backend", "cli", "build", "docs", "tests"), files, entryPoints, uses.

Answer with JSON only, no prose, no code fence:
{
  "files": { "src/features/plans/NewThing.jsx": ["plans"], "src/lib/helper.js": [] },
  "features": []
}`;
}
