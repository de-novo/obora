# Global Auth Setup for TodoApp POC

This POC uses global provider auth references:

```yaml
providers:
  zai:
    authRef: global:zai
```

Create `~/.obora/global-auth.json` once:

```json
{
  "zai": "<YOUR_ZAI_API_KEY>",
  "openai": "<YOUR_OPENAI_API_KEY>"
}
```

Then runs in this repo can resolve provider keys without per-shell env export.
