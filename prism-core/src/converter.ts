import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DocumentConverter {
  convert(filePath: string): Promise<string>;
}

export class MarkItDownConverter implements DocumentConverter {
  async convert(filePath: string): Promise<string> {
    const { stdout } = await execFileAsync("markitdown", [filePath], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      maxBuffer: 1024 * 1024 * 50,
    });
    return stdout.trim();
  }
}
