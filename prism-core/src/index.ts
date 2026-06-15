import { watch } from 'chokidar';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve, basename, extname } from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk'; // 替换为 Anthropic SDK
import 'dotenv/config';

const execAsync = promisify(exec);

// 初始化 Anthropic 客户端
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL, // 如果 .env 中没配，会自动使用官方地址
});

class PrismEngine {
    private watchDir: string;
    private wss: WebSocketServer;
    private clients: Set<WebSocket> = new Set();

    constructor(watchDir: string, wsPort: number = 8080) {
        this.watchDir = resolve(watchDir);
        this.wss = new WebSocketServer({ port: wsPort });
        
        this.wss.on('connection', (ws) => {
            console.log(`[WebSocket] UI Client Connected.`);
            this.clients.add(ws);
            this.broadcast('status', 'Prism Core: Sentinel & Anthropic Engine Online.');
            ws.on('close', () => this.clients.delete(ws));
        });
    }

    private broadcast(type: 'status' | 'result' | 'error', payload: any) {
        const message = JSON.stringify({ type, timestamp: new Date().toISOString(), payload });
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(message);
        });
    }

    public start() {
        console.log(`[Prism] Engine Started. Targeting Anthropic model: ${process.env.LLM_MODEL_NAME}`);
        const watcher = watch(this.watchDir, {
            persistent: true, ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }
        });

        watcher.on('add', async (filePath) => {
            const fileName = basename(filePath);
            this.broadcast('status', `Processing: ${fileName} (Extracting...)`);
            await this.processDocument(filePath, fileName);
        });
    }

    // 1. 注入强指令的生成逻辑
    private async generateSummary(markdownContent: string): Promise<string> {
        try {
            const response = await anthropic.messages.create({
                model: process.env.LLM_MODEL_NAME || "claude-3-haiku-20240307",
                max_tokens: 2048,
                temperature: 0.1, // 温度调到最低，确保它严格遵循 YAML 格式
                system: `你是一个极其专业的知识管理助手。请对文档进行高密度的结构化总结。
                
【强制输出格式】
你的回复必须以标准的 YAML Frontmatter 开头，提取 3-5 个精准的核心标签。格式严格如下：
---
tags: [标签1, 标签2, 标签3]
---

在此之后，请输出文档的核心要点、关键数据和结论。保持客观严谨，排版清晰。不要说废话。`,
                messages: [
                    { 
                        role: "user", 
                        content: `请按要求总结以下文档：\n\n${markdownContent.substring(0, 50000)}` 
                    }
                ]
            });

            const content = response.content as any; 
            if (Array.isArray(content)) {
                const textBlock = content.find(block => block.type === 'text' || block.text);
                if (textBlock && textBlock.text) return textBlock.text;
            } else if (typeof content === 'string') {
                return content;
            }
            return `---
tags: [解析异常]
---
⚠️ 解析异常。API 实际返回的结构如下: \n${JSON.stringify(content, null, 2)}`;

        } catch (error) {
            console.error("[Anthropic API Error]", error);
            return `---
tags: [API调用失败]
---
摘要调用失败: ${(error as Error).message}`;
        }
    }

    // 2. 指向 Tolaria Vault 的落地逻辑
    private async processDocument(filePath: string, fileName: string) {
        try {
            const { stdout, stderr } = await execAsync(`markitdown "${filePath}"`, {
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
                maxBuffer: 1024 * 1024 * 50
            });
            
            const rawMarkdown = stdout.trim();

            this.broadcast('status', `Processing: ${fileName} (Claude is generating tags & summary...)`);
            const aiSummary = await this.generateSummary(rawMarkdown);

            // ====== 核心修改：将落盘路径硬编码到你的 Tolaria 工作区 ======
            const vaultDir = resolve('D:\\TolariaVault'); 
            await fs.mkdir(vaultDir, { recursive: true }); // 如果目录不存在则自动创建
            
            const baseNameWithoutExt = basename(fileName, extname(fileName));
            const mdFileName = `${baseNameWithoutExt}.md`;
            const outPath = resolve(vaultDir, mdFileName);

            // 拼装最终文档。因为 Claude 已经生成了 YAML 头部，所以把它放在最上面
            const finalDocument = `${aiSummary}\n\n---\n\n> **以下为 Prism 引擎提取的原始全量文本：**\n\n${rawMarkdown}`;
            
            await fs.writeFile(outPath, finalDocument, 'utf-8');
            console.log(`[Storage] Saved smart document to: ${outPath}`);

            this.broadcast('result', {
                fileName: mdFileName,
                summary: aiSummary,
                markdown: rawMarkdown
            });

        } catch (error) {
            this.broadcast('error', `Failed to process ${fileName}: ${(error as Error).message}`);
        }
    }
}

const engine = new PrismEngine('./dropzone');
engine.start();