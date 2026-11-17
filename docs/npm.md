# Publish Marmerlade updates

Pushing to `master` updates the GitHub Pages website. Publishing to npm releases
a new version of the CLI and MCP package. These are separate actions.

Run the commands below from the repository root. The examples release `0.1.1`
after `0.1.0`. Replace the version and tarball filename for later releases.

## 1. Prepare the changes

Finish and commit the changes you want to release. Start from an up-to-date
`master` branch with a clean working tree.

```bash
git switch master
git pull --ff-only origin master
git status --short
npm ci
```

Use Node.js 22.12 or newer. Install the browser used by the integration checks
if it is missing:

```bash
npx playwright install chromium
```

## 2. Set the new version

Choose one command:

| Release | Command | Example from `0.1.0` |
| --- | --- | --- |
| Bug fix | `npm version patch --no-git-tag-version` | `0.1.1` |
| New feature | `npm version minor --no-git-tag-version` | `0.2.0` |
| First stable release | `npm version 1.0.0 --no-git-tag-version` | `1.0.0` |

The command updates `package.json` and `package-lock.json`. It does not create a
commit or Git tag.

Also update the hardcoded version strings to the same version:

- [server/cli.ts](../server/cli.ts): the `--version` output and MCP server version.
- [server/setup.ts](../server/setup.ts): the setup MCP client version.

For the first publication of `0.1.0`, skip the version bump and use
`marmerlade-0.1.0.tgz` in the remaining commands.

## 3. Run the checks

```bash
npm run lint
npm test
npm run test:mcp
npm run build
npm run test:e2e
npm run test:mcp:integration
npm run test:native
```

Stop and fix any failures before publishing.

## 4. Build and verify the tarball

In Bash, build with the root asset path used by the local MCP browser app:

```bash
VITE_BASE_PATH=/ npm pack
npm publish ./marmerlade-0.1.1.tgz --access public --dry-run
```

`npm pack` automatically runs the build through the `prepack` hook. The dry run
checks the publish operation without uploading the package.

Test a clean installation of that exact tarball:

```bash
marmerlade_release_dir=$(mktemp -d)
npm install --prefix "$marmerlade_release_dir" --no-audit --no-fund ./marmerlade-0.1.1.tgz
node "$marmerlade_release_dir/node_modules/marmerlade/dist/cli.js" --version
node scripts/mcp-integration.mjs "$marmerlade_release_dir/node_modules/marmerlade/dist/cli.js"
node scripts/native-integration.mjs "$marmerlade_release_dir/node_modules/marmerlade/dist/cli.js"
```

Confirm the CLI prints the new version and both integration checks pass. Publish
this tarball after verification. If you change the code, rebuild and verify it
again.

## 5. Commit and deploy the website

Review the version changes, then commit and tag them:

```bash
git diff
git add package.json package-lock.json server/cli.ts server/setup.ts
git commit -m "Release 0.1.1"
git tag v0.1.1
git push origin master
git push origin v0.1.1
```

The [Pages workflow](../.github/workflows/pages.yml) runs on pushes to `master`.
It builds the website with the GitHub Pages asset path and deploys `dist/web`.
The npm package is not published by this workflow.

For the first deployment, open [Settings → Pages](https://github.com/han002x/marmerlade/settings/pages)
and select **GitHub Actions** as the source.

Wait for the deployment to succeed in [GitHub Actions](https://github.com/han002x/marmerlade/actions).
Then open [Marmerlade](https://han002x.github.io/marmerlade/), refresh, and check
that the canvas and Docs view load.

## 6. Publish to npm

Confirm you are logged into the npm account that owns the package:

```bash
npm whoami
```

If needed, run `npm login` and complete browser authentication. Then publish the
verified tarball:

```bash
npm publish ./marmerlade-0.1.1.tgz --access public
npm view marmerlade version
```

Confirm the registry reports the new version. Every npm release needs a unique
version. You cannot overwrite an already published version, even after
unpublishing it.

## 7. Update installed copies

Users who installed the CLI globally can update with:

```bash
npm install -g marmerlade@latest
marmerlade --version
```

Restart the assistant's MCP connection to load the new server. If it uses a
pinned version or a source-checkout path, update that installation or path
instead. Rerun `marmerlade setup` when you also need to refresh the project's
bundled skills. Website users only need to refresh their browser.

## Website-only updates

Commit and push the intended website changes to `master`, then check GitHub
Actions and the live site. Skip the npm version bump, release tag, and npm
publication when you are updating only the hosted website.

## References

- [Development and checks](development.md)
- [npm version](https://docs.npmjs.com/cli/version/)
- [npm publish](https://docs.npmjs.com/commands/npm-publish/)
- [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
