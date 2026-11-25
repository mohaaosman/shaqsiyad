# Releasing

Every package is released by pushing a tag. [`release.yml`](.github/workflows/release.yml) runs that package's tests, checks the tag matches the version in its manifest, and publishes it.

## Once, before the first release

| Registry | Set up |
|---|---|
| npm | Add an `NPM_TOKEN` repository secret (an automation token from npmjs.com). |
| PyPI | On pypi.org, add this repo and `release.yml` as a trusted publisher for `shaqsiyad`, with environment `pypi`. No secret needed. |
| RubyGems | Add a `RUBYGEMS_API_KEY` secret (an API key with the "push rubygem" scope). |
| NuGet | Add a `NUGET_API_KEY` secret (a key scoped to push `Shaqsiyad`). |
| Packagist | Submit the repo URL on packagist.org once. It reads `packages/php/composer.json` and picks up new tags by itself. |
| Go | Nothing. The Go module proxy reads the tag. |

## Each release

1. Bump the version in the package's manifest (table below).
2. Add a `CHANGELOG.md` entry.
3. Merge to `main`, then tag that commit and push the tag.

| Package | Version lives in | Tag |
|---|---|---|
| `shaqsiyad` (npm) | `packages/js/package.json` | `js-v0.3.0` |
| `shaqsiyad-mcp` | `packages/mcp/package.json` and `VERSION` in `src/server.ts` | `mcp-v0.3.0` |
| `shaqsiyad-react` | `packages/react/package.json` | `react-v0.1.0` |
| `shaqsiyad-storybook` | `packages/storybook/package.json` | `storybook-v0.1.0` |
| `shaqsiyad` (PyPI) | `packages/python/pyproject.toml` and `__version__` | `python-v0.3.0` |
| `shaqsiyad` (gem) | `packages/ruby/lib/shaqsiyad/version.rb` | `ruby-v0.1.0` |
| `Shaqsiyad` (NuGet) | `packages/dotnet/src/Shaqsiyad/Shaqsiyad.csproj` | `dotnet-v0.1.0` |
| Go module | `Version` in `packages/go/shaqsiyad.go` | `packages/go/v0.1.0` |
| `shaqsiyad/shaqsiyad` (Composer) | Git tag only | `v0.1.0`, see note |
| Figma plugin | `figma-plugin/package.json` | Publish from Figma: Plugins → Development → Publish |

```sh
git tag js-v0.3.0 && git push origin js-v0.3.0
```

**Composer note.** Packagist reads plain `vX.Y.Z` tags for the whole repo. If more than one package ever needs that tag style, move the PHP SDK to its own repository (a read-only split) so its tags don't collide.

## First release checklist

The versions currently in the tree, ready to tag once the secrets above exist:

```sh
for t in js-v0.3.0 mcp-v0.3.0 react-v0.1.0 storybook-v0.1.0 python-v0.3.0 ruby-v0.1.0 dotnet-v0.1.0 packages/go/v0.1.0; do
  git tag "$t" && git push origin "$t"
done
```

`shaqsiyad-react` and `shaqsiyad-storybook` need `shaqsiyad` 0.2.0 or later on npm, so release `js-v0.3.0` first.
