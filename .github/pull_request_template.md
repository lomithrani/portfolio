## Summary

<!-- What changes and why. Link issues with "Closes #N". -->

## Screenshots

<!--
Required when the UI changes: desktop and mobile (390 px), light and dark when colours are involved,
notable states (loading, empty, error), and before/after when existing UI changes.
How to embed them: CLAUDE.md > "Pull Requests".
Otherwise write: No UI change.
-->

## Test plan

- [ ] `bun run lint` and `bun run typecheck`
- [ ] `TEST_MONGO_URL=mongodb://127.0.0.1:27017/portfolio-test bun run test`
- [ ] `bun run --cwd client test:e2e` (when pages change)

## Deployment notes

<!-- Railway variables to add or change, data steps, anything to do before or after merging. Otherwise: None. -->
