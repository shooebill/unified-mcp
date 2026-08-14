# unified-mcp

OpenMemory と Cipher を束ねるラッパー MCP サーバー。
`add_memories` / `search_memory` の1回の呼び出しで両方に同時に記録・検索できる。

バージョン・変更履歴は [GitHub Releases](https://github.com/shooebill/unified-mcp/releases) を参照。

## 構成

`unified-mcp.js` は stdio と HTTP の2モードで起動できる。

```
stdioモード（Claude Desktop / Claude Code など）
Client (stdio)
    ↓
unified-mcp.js
    ├→ OpenMemory（mcp-remote Streamable HTTP → localhost:8765）
    └→ Cipher（stdio）

HTTPモード（Streamable HTTP 対応クライアント全般）
Client
    ↓ POST /mcp
unified-mcp.js --http --port <N>
    ├→ OpenMemory（mcp-remote Streamable HTTP → localhost:8765）
    └→ Cipher（stdio）
```

HTTPモードはCORS対応済みで、クライアントが要求する `protocolVersion` をそのまま返すネゴシエーションを行う。外部公開する場合はTLS終端・認証をリバースプロキシ側で用意すること（unified-mcp.js自体は認証を持たない）。

## セットアップ

### 1. 依存インストール

```bash
npm install
```

### 2. 起動方法

#### HTTPモード

```bash
node unified-mcp.js --http --port 3100
```

`POST http://<host>:<port>/mcp` でStreamable HTTP JSON-RPCを受け付ける。環境変数は下記「3. 環境変数」を参照（`--http`利用時もstdioモードと同じ環境変数が必要）。

#### stdioモード: claude_desktop_config.json

##### macOS

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

##### Windows

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

- `CIPHER_AGENT_CONFIG` 未指定時は `npm run mcp` で起動（OS共通の挙動。Windowsに限らずmacOSでも同じ）

##### Claude Code

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
| `MCP_SERVER_MODE` | Cipher サーバーモード（`aggregator` で全ツール公開） | ✅ |
| `USE_ASK_CIPHER` | `true` で ask_cipher ツールを有効化 | ✅ |
| `OPENAI_API_KEY` | Cipher（子プロセス）が使う OpenAI API キー。unified-mcp.js 自体は起動時にチェックしないが、無いと Cipher 側の処理が失敗する | Cipherの動作に必須 |
| `NPX_PATH` | npx のフルパス（macOS でPATH が通らない場合） | |
| `CIPHER_AGENT_CONFIG` | cipher.yml のパス（指定時は直接起動） | |

上表の「✅」5つ（`OPENMEMORY_URL`, `CIPHER_CMD`, `CIPHER_CWD`, `MCP_SERVER_MODE`, `USE_ASK_CIPHER`）は未設定だと unified-mcp.js が起動時に即エラー終了する。`OPENAI_API_KEY`は unified-mcp.js 自体はチェックしないため未設定でも起動はするが、Cipher の呼び出しが失敗する。

## ツール

| ツール名 | 説明 |
|---------|------|
| `add_memories` | OpenMemory と Cipher の両方に記憶を保存 |
| `search_memory` | OpenMemory と Cipher の両方から検索 |

## 既知の制限事項

- クライアント側のレスポンスタイムアウトが短い場合（HTTPモードでのStreamable HTTP接続など）、Cipherのadd処理に十数〜数十秒かかることがあり、間に合わずタイムアウトする場合がある
- クライアントが要求する MCP `protocolVersion` とサーバー応答が一致しないと接続できない。unified-mcp.jsはクライアントの要求値をそのまま返すが、クライアント側の実装によっては別の値を期待している場合がある

## 前提

- [OpenMemory](https://github.com/mem0ai/mem0) が `OPENMEMORY_URL` で疎通できる状態で起動していること（起動方法はDocker Compose・systemd等、問わない）
- [Cipher](https://github.com/campfirein/cipher) が起動できる状態
- OpenMemory には `mcp-remote` 経由で Streamable HTTP 接続
