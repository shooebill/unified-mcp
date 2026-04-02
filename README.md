# unified-mcp

OpenMemory と Cipher を束ねるラッパー MCP サーバー。
`add_memories` / `search_memory` の1回の呼び出しで両方に同時に記録・検索できる。

## 構成

```
Claude Desktop (stdio)
    ↓
unified-mcp.js
    ├→ OpenMemory（mcp-remote Streamable HTTP → localhost:8765）
    └→ Cipher（stdio）
```

## セットアップ

### 1. 依存インストール

```bash
npm install
```

### 2. claude_desktop_config.json

#### macOS

```json
{
  "mcpServers": {
    "unified-memory": {
      "command": "node",
      "args": ["<path-to>/unified-mcp.js"],
      "env": {
        "PATH": "<node-bin-dir>:/usr/local/bin:/usr/bin:/bin",
        "OPENMEMORY_URL": "http://localhost:8765/mcp/claude/http/ubuntu",
        "CIPHER_CMD": "<node-bin-dir>/cipher",
        "CIPHER_CWD": "<path-to>/cipher",
        "CIPHER_AGENT_CONFIG": "<path-to>/cipher.yml",
        "NPX_PATH": "<node-bin-dir>/npx",
        "OPENAI_API_KEY": "sk-proj-...",
        "MCP_SERVER_MODE": "aggregator",
        "USE_ASK_CIPHER": "true"
      }
    }
  }
}
```

- `<node-bin-dir>`: nodebrew 等の bin ディレクトリ（例: `~/.nodebrew/current/bin`）
- `CIPHER_AGENT_CONFIG` を指定すると `cipher --mode mcp --agent <config>` で直接起動
- `NPX_PATH` を指定すると、そのディレクトリが PATH に自動追加される

#### Windows

```json
{
  "mcpServers": {
    "unified-memory": {
      "command": "node",
      "args": ["<path-to>\\unified-mcp.js"],
      "env": {
        "OPENMEMORY_URL": "http://localhost:8765/mcp/claude/http/ubuntu",
        "CIPHER_CMD": "npm.cmd",
        "CIPHER_CWD": "<path-to>\\cipher",
        "OPENAI_API_KEY": "sk-proj-...",
        "MCP_SERVER_MODE": "aggregator",
        "USE_ASK_CIPHER": "true",
        "PATH": "C:\\Program Files\\nodejs;C:\\Windows\\System32"
      }
    }
  }
}
```

- `CIPHER_AGENT_CONFIG` 未指定時は `npm run mcp` で起動（Windows 向け）

#### Claude Code

`~/.claude.json` の `mcpServers` に追加する。
Cipher aggregator モードには `MCP_SERVER_MODE` と `USE_ASK_CIPHER` が必要。

```json
{
  "mcpServers": {
    "unified-memory": {
      "type": "stdio",
      "command": "node",
      "args": ["<path-to>/unified-mcp.js"],
      "env": {
        "PATH": "<node-bin-dir>:/usr/local/bin:/usr/bin:/bin",
        "OPENMEMORY_URL": "http://localhost:8765/mcp/claude/http/ubuntu",
        "CIPHER_CMD": "<node-bin-dir>/cipher",
        "CIPHER_CWD": "<path-to>/cipher",
        "CIPHER_AGENT_CONFIG": "<path-to>/cipher.yml",
        "NPX_PATH": "<node-bin-dir>/npx",
        "OPENAI_API_KEY": "sk-proj-...",
        "MCP_SERVER_MODE": "aggregator",
        "USE_ASK_CIPHER": "true"
      }
    }
  }
}
```

### 3. 環境変数

| 変数 | 説明 | 必須 |
|------|------|------|
| `OPENMEMORY_URL` | OpenMemory の mcp-remote エンドポイント | ✅ |
| `CIPHER_CMD` | Cipher の実行コマンド（macOS: フルパス, Windows: `npm.cmd`） | ✅ |
| `CIPHER_CWD` | Cipher の作業ディレクトリ | ✅ |
| `OPENAI_API_KEY` | Cipher が使う OpenAI API キー | ✅ |
| `NPX_PATH` | npx のフルパス（macOS でPATH が通らない場合） | |
| `CIPHER_AGENT_CONFIG` | cipher.yml のパス（指定時は直接起動） | |
| `MCP_SERVER_MODE` | Cipher サーバーモード（`aggregator` で全ツール公開） | |
| `USE_ASK_CIPHER` | `true` で ask_cipher ツールを有効化 | |

## ツール

| ツール名 | 説明 |
|---------|------|
| `add_memories` | OpenMemory と Cipher の両方に記憶を保存 |
| `search_memory` | OpenMemory と Cipher の両方から検索 |

## 前提

- [OpenMemory](https://github.com/mem0ai/mem0) が Docker で起動済み
- [Cipher](https://github.com/campfirein/cipher) が起動できる状態
- OpenMemory には `mcp-remote` 経由で Streamable HTTP 接続
