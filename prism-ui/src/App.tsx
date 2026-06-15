import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import "./App.css";

interface PrismConfig {
  vaultDir: string;
  watchDirs: string[];
}

const defaultConfig: PrismConfig = {
  vaultDir: "D:\\TolariaVault",
  watchDirs: [],
};

function App() {
  const [vaultDir, setVaultDir] = useState(defaultConfig.vaultDir);
  const [watchDirsText, setWatchDirsText] = useState("");
  const [status, setStatus] = useState("Loading Prism configuration...");
  const watchDirCount = useMemo(
    () => parseWatchDirs(watchDirsText).length,
    [watchDirsText],
  );

  useEffect(() => {
    invoke<PrismConfig>("get_prism_config")
      .then((config) => {
        setVaultDir(config.vaultDir || defaultConfig.vaultDir);
        setWatchDirsText((config.watchDirs || []).join("\n"));
        setStatus("Configuration loaded from %APPDATA%\\Prism\\config.json.");
      })
      .catch((error) => {
        setStatus(`Unable to load configuration: ${String(error)}`);
      });
  }, []);

  async function saveConfig() {
    const config: PrismConfig = {
      vaultDir: vaultDir.trim() || defaultConfig.vaultDir,
      watchDirs: parseWatchDirs(watchDirsText),
    };

    try {
      await invoke("save_prism_config", { config });
      setStatus("Configuration saved. prism-core will use it on next command/watch start.");
    } catch (error) {
      setStatus(`Unable to save configuration: ${String(error)}`);
    }
  }

  return (
    <main className="settings-shell">
      <section className="settings-header">
        <div>
          <p className="eyebrow">Project Prism</p>
          <h1>Knowledge Pipeline Settings</h1>
        </div>
        <span className="status-pill">{watchDirCount} watch dirs</span>
      </section>

      <section className="settings-panel">
        <label>
          Vault directory
          <input
            value={vaultDir}
            onChange={(event) => setVaultDir(event.currentTarget.value)}
            placeholder="D:\\TolariaVault"
          />
        </label>

        <label>
          Watched directories
          <textarea
            value={watchDirsText}
            onChange={(event) => setWatchDirsText(event.currentTarget.value)}
            placeholder={"D:\\Downloads\nD:\\Documents\\Inbox"}
            rows={7}
          />
        </label>

        <div className="actions">
          <button type="button" onClick={saveConfig}>Save configuration</button>
          <p>{status}</p>
        </div>
      </section>
    </main>
  );
}

function parseWatchDirs(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default App;
