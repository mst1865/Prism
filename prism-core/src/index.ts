import { watch } from 'chokidar';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';

const execAsync = promisify(exec);

class PrismEngine {
    private watchDir: string;

    constructor(watchDir: string) {
        this.watchDir = resolve(watchDir);
    }

    public start() {
        console.log(`[Prism Core] System Initialized. Standing by.`);
        
        const watcher = watch(this.watchDir, {
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100
            }
        });

        console.log(`[Sentinel] Monitoring directory: ${this.watchDir}`);

        watcher.on('add', async (filePath) => {
            console.log(`\n[Event] New file detected: ${filePath}`);
            await this.processDocument(filePath);
        });
    }

    private async processDocument(filePath: string) {
        try {
            console.log(`[MarkItDown] Extracting data from: ${filePath}...`);
            
            // 执行 Python markitdown，捕获标准输出
            const { stdout, stderr } = await execAsync(`markitdown "${filePath}"`);
            
            if (stderr) {
                console.warn(`[Warning] MarkItDown reported: ${stderr}`);
            }

            console.log(`[Success] Extraction complete. First 150 chars:`);
            console.log(`--------------------------------------------------`);
            console.log(stdout.substring(0, 150) + "...\n");
            console.log(`--------------------------------------------------`);
            
            // TODO: Next step - Pass 'stdout' to LLM API for summarization

        } catch (error) {
            console.error(`[Error] Processing failed for ${filePath}:`, (error as Error).message);
        }
    }
}

// 启动引擎并监听一个测试目录 (将在当前目录下创建 dropzone 文件夹)
const dropzonePath = './dropzone';
const engine = new PrismEngine(dropzonePath);
engine.start();