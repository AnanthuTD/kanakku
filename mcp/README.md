# Kanakku local MCP server

This is a local, stdio Model Context Protocol server for Claude Code, Codex, Gemini CLI, and other MCP hosts that can launch a local process. It gives an agent read access to one encrypted Kanakku `.kbk` backup and lets it stage a small, reviewable set of edits. It does not run a Kanakku server, connect directly to the phone, or access Gmail/Drive/SMS.

## Data flow

The MCP process decrypts the selected backup in local memory. If an agent calls a read tool, the returned fields become part of that agent's context and may be processed under that provider's terms. Raw SMS and email bodies are not in the backup; read tools expose normalized transaction fields, including amounts, merchant labels and masked account suffixes. Notes are hidden unless a tool call explicitly asks for them.

Writes are staged in memory. `preview_changes` shows each affected transaction and issues a one-time token. By default, `export_approved_changes` also requires an explicit approval phrase. Users who prefer fewer prompts can set `KANAKKU_MCP_APPROVAL_MODE=preview-only`; they still must call preview first, but may export with its token alone. Both modes create a _new_ encrypted `.kbk` file and never overwrite the original. The phone is not changed automatically. To apply the new copy, upload it in Google Drive in place of Kanakku's backup, then restore from Settings → Email & backup in the app. Keep an untouched copy until the restore is verified.

The server asks MCP clients to confirm tool use where supported. Do not configure a host to auto-approve all Kanakku tools. Never enable Gemini CLI `trust`, Claude `dangerously-skip-permissions`, or an equivalent blanket bypass for this server.

### Approval mode

The Kanakku export gate defaults to `required`. To turn off the extra explicit approval phrase while retaining the mandatory preview, add this environment variable to the Kanakku MCP server entry and restart the agent:

```text
KANAKKU_MCP_APPROVAL_MODE=preview-only
```

In this mode the server exposes `export_previewed_changes` instead of `export_approved_changes`; it accepts only the one-time token from the latest preview. Set the value back to `required` or remove it to restore the default. This setting does not disable any separate confirmation prompts provided by Codex, Claude, Gemini or another MCP host, which each host controls independently. The original backup remains untouched in either mode.

## Prepare a backup

1. In Kanakku, create a fresh encrypted Drive backup and download `Kanakku encrypted backup.kbk` to this computer.
2. Save the backup password in a private local file. For example, on macOS/Linux:

   ```sh
   read -s 'KANAKKU_BACKUP_PASSWORD?Kanakku backup password: '
   printf '\n'
   umask 077
   printf '%s\n' "$KANAKKU_BACKUP_PASSWORD" > "$HOME/.kanakku-mcp-password"
   unset KANAKKU_BACKUP_PASSWORD
   chmod 600 "$HOME/.kanakku-mcp-password"
   ```

3. Install the MCP dependencies once:

   ```sh
   cd /absolute/path/to/kanakku/mcp
   npm ci
   ```

The server needs these environment variables:

```text
KANAKKU_BACKUP_FILE=/absolute/path/to/Kanakku encrypted backup.kbk
KANAKKU_BACKUP_PASSWORD_FILE=/absolute/path/to/.kanakku-mcp-password
KANAKKU_MCP_OUTPUT_DIR=/absolute/path/to/a/private/output/folder
```

The password file must be a regular file with mode `600` on macOS/Linux. The server rejects broader permissions. Do not paste the password into agent prompts, client config, or shell commands.

## Connect clients

Use the absolute path to this repository and your own backup/password paths. Restart the client after adding the server.

### Codex CLI and desktop

```sh
codex mcp add kanakku \
  --env KANAKKU_BACKUP_FILE="/absolute/path/to/Kanakku encrypted backup.kbk" \
  --env KANAKKU_BACKUP_PASSWORD_FILE="/absolute/path/to/.kanakku-mcp-password" \
  --env KANAKKU_MCP_OUTPUT_DIR="/absolute/path/to/private/output" \
  -- node /absolute/path/to/kanakku/mcp/server.mjs
codex mcp list
```

Or add this to `~/.codex/config.toml`:

```toml
[mcp_servers.kanakku]
command = "node"
args = ["/absolute/path/to/kanakku/mcp/server.mjs"]
env = { KANAKKU_BACKUP_FILE = "/absolute/path/to/Kanakku encrypted backup.kbk", KANAKKU_BACKUP_PASSWORD_FILE = "/absolute/path/to/.kanakku-mcp-password", KANAKKU_MCP_OUTPUT_DIR = "/absolute/path/to/private/output" }
```

### Claude Code

```sh
claude mcp add kanakku --scope user \
  --env KANAKKU_BACKUP_FILE="/absolute/path/to/Kanakku encrypted backup.kbk" \
  --env KANAKKU_BACKUP_PASSWORD_FILE="/absolute/path/to/.kanakku-mcp-password" \
  --env KANAKKU_MCP_OUTPUT_DIR="/absolute/path/to/private/output" \
  -- node /absolute/path/to/kanakku/mcp/server.mjs
claude mcp list
```

For Claude Desktop, add a `kanakku` stdio entry under `mcpServers` in its MCP configuration:

```json
{
  "mcpServers": {
    "kanakku": {
      "command": "node",
      "args": ["/absolute/path/to/kanakku/mcp/server.mjs"],
      "env": {
        "KANAKKU_BACKUP_FILE": "/absolute/path/to/Kanakku encrypted backup.kbk",
        "KANAKKU_BACKUP_PASSWORD_FILE": "/absolute/path/to/.kanakku-mcp-password",
        "KANAKKU_MCP_OUTPUT_DIR": "/absolute/path/to/private/output"
      }
    }
  }
}
```

### Gemini CLI

Add this to `~/.gemini/settings.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "kanakku": {
      "command": "node",
      "args": ["/absolute/path/to/kanakku/mcp/server.mjs"],
      "env": {
        "KANAKKU_BACKUP_FILE": "/absolute/path/to/Kanakku encrypted backup.kbk",
        "KANAKKU_BACKUP_PASSWORD_FILE": "/absolute/path/to/.kanakku-mcp-password",
        "KANAKKU_MCP_OUTPUT_DIR": "/absolute/path/to/private/output"
      },
      "trust": false
    }
  }
}
```

Start Gemini CLI and use `/mcp` to check the connection. The Gemini web app does not launch a local stdio process; use a local MCP-capable client such as Gemini CLI.

## Available tools

- `spending_summary`: filtered totals grouped by category, merchant, account or source; accepts inclusive dates and category/source/kind/account/merchant/text filters.
- `analytics_report`: category and merchant totals, monthly spend trends, review counts, transaction counts by source/kind and outstanding loan totals for the filtered period. Loan outstanding is the current portfolio balance.
- `list_transactions`: paginated normalized transaction rows. Notes are excluded by default.
- `get_categories`: category names, saved custom icon keys and transaction counts.
- `get_journal_configs`: inspect backed-up merchant/payee rules and recurring-payment decisions; it identifies device-only settings that are not available in the backup.
- `stage_create_category`: stage a category with an icon such as `PawPrint`, `Heart`, `Coffee` or `Plane`.
- `stage_update_category`: rename an existing custom category and update its icon; previews show how many transactions and rules are affected.
- `stage_set_merchant_rule` / `stage_remove_merchant_rule`: add, replace, or remove a rule by exact merchant and bank scope. Rules take effect after the exported backup is restored.
- `stage_recurring_decision`: confirm/ignore a recurring-payment suggestion, or clear the saved decision.
- `stage_update_transaction`: edit merchant, category, note, excluded status, non-loan kind, or a user-confirmed INR settlement for a foreign-currency item using one exact ID.
- `stage_bulk_categorize`: stage a category change for up to 100 explicitly listed transaction IDs and requires a matching expected count.
- `preview_changes`: inspect exact changes before export.
- `export_approved_changes`: create a separate encrypted backup after preview approval.
- `export_previewed_changes`: available only in `preview-only` mode; create a separate encrypted backup using the latest preview token without an additional approval phrase.
- `discard_staged_changes`: drop all edits from the running process.

Transaction source amount/currency, bank/account values, timestamps, raw source data, and lending links remain protected. Loan-linked kind changes are rejected; use Kanakku to edit loan records. Device-only settings such as theme, biometric lock, reminder schedules, OAuth access, and automatic-backup preferences are not part of the `.kbk` journal and cannot be changed by these tools. For those operations, use the app's settings and review flows.

## Test

```sh
npm test
```

The test suite launches a real MCP stdio client against a synthetic encrypted journal and checks filtered totals, icon/category staging, export encryption, and preservation of the original backup.
