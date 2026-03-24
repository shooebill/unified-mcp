#!/usr/bin/env node
/**
 * unified-mcp.js (v0.3.1)
 * OpenMemory（mcp-remote経由）と Cipher（stdio）を束ねるラッパーMCP
 *
 * 環境変数（必須）:
 *   OPENMEMORY_URL  - OpenMemory SSE endpoint
 *   CIPHER_CMD      - cipher 実行ファイルパス (macOS: フルパス, Windows: npm.cmd)
 *   CIPHER_CWD      - cipher 作業ディレクトリ
 *
 * 環境変数（任意）:
 *   NPX_PATH             - npx のフルパス（macOS nodebrew 等）
 *   CIPHER_AGENT_CONFIG  - cipher --agent 設定ファイルパス（指定時は直接起動、未指定時は npm run mcp）
 *
 * claude_desktop_config.json 設定例:
 *
 * ── macOS ──
 * "unified-memory": {
 *   "command": "node",
 *   "args": ["<path-to>/unified-mcp.js"],
 *   "env": {
 *     "PATH": "<node-bin-dir>:/usr/local/bin:/usr/bin:/bin",
 *     "OPENMEMORY_URL": "http://localhost:8765/mcp/claude/sse/ubuntu",
 *     "CIPHER_CMD": "<node-bin-dir>/cipher",
 *     "CIPHER_CWD": "<path-to>/cipher",
 *     "CIPHER_AGENT_CONFIG": "<path-to>/cipher.yml",
 *     "NPX_PATH": "<node-bin-dir>/npx",
 *     "OPENAI_API_KEY": "sk-proj-..."
 *   }
 * }
 *
 * ── Windows ──
 * "unified-memory": {
 *   "command": "node",
 *   "args": ["<path-to>\\unified-mcp.js"],
 *   "env": {
 *     "OPENMEMORY_URL": "http://localhost:8765/mcp/claude/sse/ubuntu",
 *     "CIPHER_CMD": "npm.cmd",
 *     "CIPHER_CWD": "<path-to>\\cipher",
 *     "OPENAI_API_KEY": "sk-proj-...",
 *     "PATH": "C:\\Program Files\\nodejs;C:\\Windows\\System32"
 *   }
 * }
 */

const { spawn } = require("child_process");
const readline = require("readline");

// ── 設定 ──────────────────────────────────────────────────────────────────────
function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    process.stderr.write(
      `[unified-mcp] 環境変数 ${name} が設定されていません。\n`,
    );
    process.exit(1);
  }
  return val;
}

// NPX_PATH が指定されている場合、そのディレクトリを PATH に追加
const NPX_PATH =
  process.env.NPX_PATH || (process.platform === "win32" ? "npx.cmd" : "npx");
if (process.env.NPX_PATH) {
  const path = require("path");
  const binDir = path.dirname(process.env.NPX_PATH);
  process.env.PATH = binDir + ":" + (process.env.PATH || "");
  stderr(`[unified-mcp] Added to PATH: ${binDir}`);
}

const config = {
  openmemory: {
    url: requireEnv("OPENMEMORY_URL"),
    npx: NPX_PATH,
  },
  cipher: {
    cmd: requireEnv("CIPHER_CMD"),
    args: process.env.CIPHER_AGENT_CONFIG
      ? ["--mode", "mcp", "--agent", process.env.CIPHER_AGENT_CONFIG]
      : ["run", "mcp"],
    cwd: requireEnv("CIPHER_CWD"),
  },
};

// ── MCPクライアント基底クラス（stdio JSON-RPC）─────────────────────────────────
class StdioMCPClient {
  constructor(name) {
    this.name = name;
    this.pending = new Map();
    this.nextId = 1;
    this.ready = false;
    this.proc = null;
  }

  // サブクラスで spawn してから _attach() を呼ぶ
  _attach(proc) {
    this.proc = proc;
    const rl = readline.createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      line = line.trim();
      if (!line.startsWith("{")) return;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }

      // initialize 応答 → ready
      if (!this.ready && (msg.id === 0 || msg.result?.protocolVersion)) {
        this.ready = true;
        this._onReady?.();
        return;
      }

      // ツール呼び出し応答
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });

    proc.stderr.on("data", (d) =>
      stderr(`[${this.name}:stderr] ${d.toString().trimEnd()}`),
    );
    proc.on("error", (err) => {
      stderr(`[${this.name}] spawn error: ${err.message}`);
    });
    proc.on("exit", (code) => {
      stderr(`[${this.name}] exited with code ${code}`);
    });
  }

  _send(obj) {
    this.proc.stdin.write(JSON.stringify(obj) + "\n");
  }

  _initialize() {
    this._send({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "unified-mcp", version: "2.0.0" },
      },
    });
  }

  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this._send({ jsonrpc: "2.0", id, method, params });
      // タイムアウト 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`[${this.name}] timeout: ${method}`));
        }
      }, 30000);
    });
  }

  waitReady() {
    return new Promise((resolve) => {
      if (this.ready) return resolve();
      this._onReady = resolve;
    });
  }
}

// ── OpenMemory クライアント（mcp-remote 経由）─────────────────────────────────
class OpenMemoryClient extends StdioMCPClient {
  constructor() {
    super("openmemory");
    const proc = spawn(
      config.openmemory.npx,
      ["-y", "mcp-remote", config.openmemory.url, "--allow-http"],
      { env: { ...process.env }, shell: process.platform === "win32" },
    );
    this._attach(proc);
    this._initialize();
  }

  async addMemory(text) {
    return this.call("tools/call", {
      name: "add_memories",
      arguments: { text },
    });
  }

  async searchMemory(query) {
    return this.call("tools/call", {
      name: "search_memory",
      arguments: { query },
    });
  }
}

// ── Cipher クライアント（stdio 直接）─────────────────────────────────────────
class CipherClient extends StdioMCPClient {
  constructor() {
    super("cipher");
    const proc = spawn(config.cipher.cmd, config.cipher.args, {
      cwd: config.cipher.cwd,
      env: { ...process.env },
      shell: process.platform === "win32",
    });
    this._attach(proc);
    this._initialize();
  }

  async addMemory(text) {
    return this.call("tools/call", {
      name: "ask_cipher",
      arguments: { message: `以下の内容を記憶してください：\n${text}` },
    });
  }

  async searchMemory(query) {
    return this.call("tools/call", {
      name: "ask_cipher",
      arguments: {
        message: `以下のキーワードで記憶を検索してください：\n${query}`,
      },
    });
  }
}

// ── ツール定義 ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "add_memories",
    description: "OpenMemory と Cipher の両方に記憶を保存する",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "保存する内容" },
      },
      required: ["text"],
    },
  },
  {
    name: "search_memory",
    description: "OpenMemory と Cipher の両方から関連する記憶を検索する",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "検索クエリ" },
      },
      required: ["query"],
    },
  },
];

// ── ユーティリティ ────────────────────────────────────────────────────────────
function stderr(...args) {
  process.stderr.write(args.join(" ") + "\n");
}

function sendResponse(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

// ── メインサーバー ────────────────────────────────────────────────────────────
class UnifiedMCPServer {
  constructor() {
    this.om = new OpenMemoryClient();
    this.cipher = new CipherClient();
    // OpenMemory の ready を待ってから stdin を受け付ける
    this.om.waitReady().then(() => this._setup());
  }

  _setup() {
    const rl = readline.createInterface({ input: process.stdin });
    rl.on("line", async (line) => {
      line = line.trim();
      if (!line) return;

      let req;
      try {
        req = JSON.parse(line);
      } catch {
        return;
      }

      try {
        const result = await this._handle(req);
        if (result !== undefined) {
          sendResponse({ jsonrpc: "2.0", id: req.id, result });
        }
      } catch (err) {
        sendResponse({
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32603, message: err.message },
        });
      }
    });
  }

  async _handle(req) {
    const { method, params, id } = req;

    // initialize
    if (method === "initialize") {
      return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "unified-memory", version: "0.3.2" },
      };
    }

    // initialized 通知（応答不要）
    if (method === "notifications/initialized") return undefined;

    // tools/list
    if (method === "tools/list") {
      return { tools: TOOLS };
    }

    // tools/call
    if (method === "tools/call") {
      const { name, arguments: args } = params;
      return {
        content: [{ type: "text", text: await this._callTool(name, args) }],
      };
    }

    // ping
    if (method === "ping") return {};

    return { error: "unknown method" };
  }

  async _callTool(name, args) {
    if (name === "add_memories") {
      const { text } = args;
      const [omResult, cipherResult] = await Promise.allSettled([
        this.om.addMemory(text),
        this.cipher.addMemory(text),
      ]);

      const lines = [];
      lines.push(
        omResult.status === "fulfilled"
          ? "【OpenMemory】✅ 保存完了"
          : `【OpenMemory】❌ ${omResult.reason?.message}`,
      );
      lines.push(
        cipherResult.status === "fulfilled"
          ? "【Cipher】✅ 保存完了"
          : `【Cipher】❌ ${cipherResult.reason?.message}`,
      );
      return lines.join("\n");
    }

    if (name === "search_memory") {
      const { query } = args;
      const [omResult, cipherResult] = await Promise.allSettled([
        this.om.searchMemory(query),
        this.cipher.searchMemory(query),
      ]);

      let out = "";

      if (omResult.status === "fulfilled") {
        // mcp-remote 経由の場合、content[0].text に JSON 文字列が入る
        const raw =
          omResult.value?.content?.[0]?.text ?? JSON.stringify(omResult.value);
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }
        const results = parsed?.results ?? parsed;
        const items = Array.isArray(results)
          ? results
              .map((r) => `- ${r.memory ?? r.text ?? JSON.stringify(r)}`)
              .join("\n")
          : raw;
        out += `【OpenMemory】\n${items}\n\n`;
      } else {
        out += `【OpenMemory】❌ ${omResult.reason?.message}\n\n`;
      }

      if (cipherResult.status === "fulfilled") {
        const text =
          cipherResult.value?.content?.[0]?.text ??
          JSON.stringify(cipherResult.value);
        out += `【Cipher】\n${text}`;
      } else {
        out += `【Cipher】❌ ${cipherResult.reason?.message}`;
      }

      return out;
    }

    throw new Error(`Unknown tool: ${name}`);
  }
}

// ── 起動 ──────────────────────────────────────────────────────────────────────
new UnifiedMCPServer();
