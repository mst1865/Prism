import { useState, useEffect } from "react";

// 定义严格的数据契约接口
interface DocumentResult {
  fileName: string;
  summary: string;     // 适配 Anthropic 标准的 AI 结构化摘要
  markdown: string;    // MarkItDown 清洗出的全量 Markdown 文本
}

interface PrismMessage {
  type: 'status' | 'result' | 'error';
  timestamp: string;
  payload: any;
}

function App() {
  const [statusMsg, setStatusMsg] = useState("正在连接 Prism 核心逻辑引擎...");
  const [documents, setDocuments] = useState<DocumentResult[]>([]);

  useEffect(() => {
    // 建立与本地微服务引擎的 WebSocket 长连接
    const ws = new WebSocket("ws://localhost:8080");

    ws.onopen = () => {
      setStatusMsg("已成功连接核心引擎。请向本地 dropzone 目录投入文件...");
    };
    
    ws.onmessage = (event) => {
      try {
        const data: PrismMessage = JSON.parse(event.data);
        
        if (data.type === 'status') {
          setStatusMsg(data.payload);
        } else if (data.type === 'error') {
          setStatusMsg(`❌ 引擎异常: ${data.payload}`);
        } else if (data.type === 'result') {
          setStatusMsg("✅ Claude 深度解析完成，知识已安全落盘。");
          // 将最新的解析结果置顶渲染
          setDocuments(prev => [data.payload as DocumentResult, ...prev]);
        }
      } catch (err) {
        console.error("解析微服务网络报文失败:", err);
      }
    };

    ws.onclose = () => {
      setStatusMsg("⚠️ 失去与核心引擎的连接。请确认后台进程 (prism-core) 是否在线。");
    };

    return () => ws.close();
  }, []);

  return (
    <div className="prism-dashboard">
      {/* 嵌入局部样式块，彻底接管布局控制权 */}
      <style>{`
        body { margin: 0; background-color: #f4f6f8; color: #1e293b; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .prism-dashboard { padding: 30px; max-width: 1000px; margin: 0 auto; box-sizing: border-box; }
        .prism-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; }
        .prism-logo { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 700; color: #0f172a; }
        .prism-logo span { font-size: 26px; color: #6366f1; transform: rotate(45deg); display: inline-block; }
        .status-panel { padding: 14px 20px; border-radius: 6px; font-weight: 500; font-size: 14px; margin-bottom: 30px; display: flex; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .status-info { background-color: #eff6ff; border-left: 4px solid #3b82f6; color: #1d4ed8; }
        .vault-container { display: flex; flex-direction: column; gap: 20px; }
        .vault-title-bar { display: flex; align-items: center; justify-content: space-between; }
        .vault-title-bar h3 { margin: 0; font-size: 18px; color: #334155; }
        .counter-badge { background-color: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .empty-holder { text-align: center; padding: 60px 20px; background: #fff; border: 2px dashed #cbd5e1; border-radius: 8px; color: #64748b; }
        .empty-holder code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #0f172a; font-family: monospace; }
        .doc-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); transition: transform 0.2s; }
        .doc-card:hover { transform: translateY(-2px); }
        .doc-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
        .doc-meta h4 { margin: 0; font-size: 16px; color: #0f172a; word-break: break-all; }
        .ai-insight-box { background-color: #fafafa; border: 1px solid #f1f5f9; border-left: 4px solid #6366f1; padding: 18px; border-radius: 4px; margin-bottom: 18px; }
        .ai-insight-header { font-size: 11px; font-weight: 700; color: #4f46e5; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
        .ai-insight-body { font-size: 14px; color: #334155; line-height: 1.6; white-space: pre-wrap; }
        .raw-data-toggle { cursor: pointer; font-size: 13px; color: #64748b; user-select: none; }
        .raw-data-toggle summary { outline: none; font-weight: 500; }
        .raw-data-toggle summary:hover { color: #334155; }
        .code-canvas { background: #1e293b; color: #f8fafc; padding: 16px; border-radius: 6px; overflow-x: auto; max-height: 300px; margin-top: 12px; font-family: "Fira Code", Consolas, Monaco, monospace; font-size: 12px; line-height: 1.5; text-align: left; }
      `}</style>

      {/* 头部导航栏 */}
      <header className="prism-header">
        <div className="prism-logo">
          <span>◮</span> Project Prism
        </div>
      </header>

      {/* 实时状态流快报板 */}
      <div className="status-panel status-info">
        {statusMsg}
      </div>

      {/* 主知识库呈现区 */}
      <div className="vault-container">
        <div className="vault-title-bar">
          <h3>本地知识库 (Knowledge Vault)</h3>
          <span className="counter-badge">{documents.length} Items</span>
        </div>
        
        {documents.length === 0 ? (
          <div className="empty-holder">
            <p style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 500 }}>待命状态：暂无文档吞吐数据</p>
            <p style={{ margin: 0, fontSize: '13px' }}>
              请在后台运行状态下，将需要清洗的文件拖入 <code>prism-core/dropzone</code> 文件夹。
            </p>
          </div>
        ) : (
          documents.map((doc, idx) => (
            <article key={idx} className="doc-card">
              <div className="doc-meta">
                <span style={{ fontSize: '18px' }}>📄</span>
                <h4>{doc.fileName}</h4>
              </div>
              
              {/* Anthropic 高度浓缩摘要区 */}
              <div className="ai-insight-box">
                <div className="ai-insight-header">
                  <span>✨</span> AI Insights (Claude Engine)
                </div>
                <div className="ai-insight-body">
                  {doc.summary}
                </div>
              </div>

              {/* 延迟加载与折叠的全量清洗原文 */}
              <details className="raw-data-toggle">
                <summary>查看原始提炼的 Markdown 数据</summary>
                <pre className="code-canvas">
                  <code>{doc.markdown}</code>
                </pre>
              </details>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

export default App;