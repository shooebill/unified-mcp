# unified-mcp

OpenMemory と Cipher を束ねるラッパー MCP サーバー。  
`add_memories` / `search_memory` の1回の呼び出しで両方に同時に記録・検索できる。

## 構成

```
Claude Desktop (stdio)
    ↓
unified-mcp.js
    ├→ OpenMemory（mcp-remote → your-openmemory-host:8765）
    └→ Cipher（stdio → npm run mcp）
```

## セットアップ

### 1. 依存なし

Node.js のみ必要。`npm install` 不要。

### 2. claude_desktop_config.json

```json
{
  "mcpServers": {
    "unified-memory": {
      "command": "node",
      "args": ["C:\\path\\to\\unified-mcp.js"],
      "env": {
        "OPENMEMORY_URL": "http://your-openmemory-host:8765/mcp/claude/sse/ubuntu",
        "CIPHER_CWD": "C:\\path\\to\\cipher",
        "OPENAI_API_KEY": "sk-proj-...",
        "CIPHER_LOG_LEVEL": "silent",
        "NODE_ENV": "production",
        "VECTOR_STORE_TYPE": "qdrant",
        "VECTOR_STORE_URL": "http://your-qdrant-host:6333",
        "VECTOR_STORE_COLLECTION": "cursor_cipher_memory",
        "VECTOR_STORE_DIMENSION": "1536",
        "VECTOR_STORE_DISTANCE": "Cosine",
        "DISABLE_REFLECTION_MEMORY": "true",
        "PATH": "C:\\Program Files\\nodejs;C:\\Windows\\System32"
      }
    }
  }
}
```

### 3. 環境変数

| 変数 | 説明 | 必須 |
|------|------|------|
| `OPENMEMORY_URL` | OpenMemory の mcp-remote エンドポイント | ✅ |
| `CIPHER_CWD` | Cipher の npm プロジェクトディレクトリ | ✅ |
| `OPENAI_API_KEY` | Cipher が使う OpenAI API キー | ✅ |

## ツール

| ツール名 | 説明 |
|---------|------|
| `add_memories` | OpenMemory と Cipher の両方に記憶を保存 |
| `search_memory` | OpenMemory と Cipher の両方から検索 |

## 前提

- [OpenMemory](https://github.com/mem0ai/mem0) が Docker で起動済み
- [Cipher](https://github.com/byterover/cipher) が `npm run mcp` で起動できる状態
- OpenMemory には `mcp-remote` 経由で接続（SSE / Streamable-HTTP）
